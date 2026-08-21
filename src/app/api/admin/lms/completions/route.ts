/**
 * 이수 수동 승인 / 취소 (서버 전용)
 * POST   /api/admin/lms/completions  body: { programId, studentId }        → 수동 승인
 * DELETE /api/admin/lms/completions?programId=&studentId=&reason=          → 취소
 *
 * 둘 다 canManageLms 권한이 필요하다.
 * 취소 시 마일리지는 UPDATE/DELETE 하지 않고 음수 상계 레코드를 추가한다.
 */
import { NextResponse } from "next/server";
import { assertLmsManager, lmsErrorResponse } from "@/lib/auth/lms-api";

export async function POST(request: Request) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId: approver } = result;

    const body = await request.json();
    const programId = Number(body.programId);
    const targetStudentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
    if (!programId || !targetStudentId) {
      return NextResponse.json({ error: "programId 와 studentId 가 필요합니다." }, { status: 400 });
    }

    // 취소된 이수를 다시 승인하는 경우.
    // completions 에 unique(student_id, extracurricular_id) 가 있어 RPC 가 재INSERT 하면 제약 위반이 난다.
    // 새로 만들지 않고 취소를 되돌린다.
    const { data: revoked } = await admin
      .from("extracurricular_completions")
      .select("id, mileage_granted, student_type, certificate_no")
      .eq("student_id", targetStudentId)
      .eq("extracurricular_id", programId)
      .not("revoked_at", "is", null)
      .maybeSingle();

    if (revoked) {
      const { error: unrevokeError } = await admin
        .from("extracurricular_completions")
        .update({ revoked_at: null, revoke_reason: null, approved_by: approver })
        .eq("id", revoked.id);
      if (unrevokeError) return NextResponse.json({ error: unrevokeError.message }, { status: 500 });

      // 취소 시 음수로 상계했던 마일리지를 다시 채운다 (내국인만, 역시 상계 레코드 추가 방식)
      let restored = 0;
      if ((revoked.mileage_granted ?? 0) > 0 && revoked.student_type === "domestic") {
        const { data: program } = await admin.from("extracurricular").select("name").eq("id", programId).maybeSingle();
        restored = revoked.mileage_granted;
        await admin.from("mileage_records").insert({
          student_id: targetStudentId,
          points: restored,
          reason: `비교과 이수 재승인: ${program?.name ?? programId} (${new Date().toISOString()})`,
          source_type: "extracurricular",
          source_id: programId,
        });
      }

      await admin
        .from("student_extracurricular")
        .update({ status: "완료", completed_at: new Date().toISOString() })
        .eq("student_id", targetStudentId)
        .eq("extracurricular_id", programId);

      return NextResponse.json({
        status: "completed",
        certificate_no: revoked.certificate_no,
        restored: true,
        mileage_granted: restored,
      });
    }

    // 판정·기록·마일리지는 전부 RPC 가 담당한다 (진도 미달이어도 관리자가 승인할 수 있어야 하므로
    // RPC 가 incomplete 를 반환하면 아래에서 예외 처리한다)
    const { data, error } = await admin.rpc("lms_finalize_completion", {
      p_student_id: targetStudentId,
      p_program_id: programId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const payload = data as { status: string; certificate_no?: string; required?: number; passed?: number };

    if (payload.status === "incomplete") {
      return NextResponse.json(
        {
          error: `진도 미달입니다. 필수 콘텐츠 ${payload.passed}/${payload.required} 통과. 예외 승인이 필요하면 진도 기준을 조정하거나 담당자와 협의해 주세요.`,
          status: "incomplete",
        },
        { status: 400 },
      );
    }

    // 누가 승인했는지 남긴다
    if (payload.status === "completed") {
      await admin
        .from("extracurricular_completions")
        .update({ approved_by: approver })
        .eq("student_id", targetStudentId)
        .eq("extracurricular_id", programId);
    }

    return NextResponse.json(payload);
  } catch (e) {
    return lmsErrorResponse(e);
  }
}

export async function DELETE(request: Request) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId: actor } = result;

    const { searchParams } = new URL(request.url);
    const programId = Number(searchParams.get("programId"));
    const targetStudentId = (searchParams.get("studentId") ?? "").trim();
    const reason = (searchParams.get("reason") ?? "").trim();
    if (!programId || !targetStudentId) {
      return NextResponse.json({ error: "programId 와 studentId 가 필요합니다." }, { status: 400 });
    }
    if (!reason) return NextResponse.json({ error: "취소 사유를 입력해 주세요." }, { status: 400 });

    const { data: completion } = await admin
      .from("extracurricular_completions")
      .select("id, mileage_granted, revoked_at, student_type")
      .eq("student_id", targetStudentId)
      .eq("extracurricular_id", programId)
      .maybeSingle();
    if (!completion) return NextResponse.json({ error: "이수 기록이 없습니다." }, { status: 404 });
    if (completion.revoked_at) return NextResponse.json({ error: "이미 취소된 이수입니다." }, { status: 400 });

    const { data: program } = await admin
      .from("extracurricular").select("name").eq("id", programId).maybeSingle();

    const { error: revokeError } = await admin
      .from("extracurricular_completions")
      .update({ revoked_at: new Date().toISOString(), revoke_reason: `${reason} (처리: ${actor})` })
      .eq("id", completion.id);
    if (revokeError) return NextResponse.json({ error: revokeError.message }, { status: 500 });

    // 마일리지는 수정·삭제하지 않고 음수 상계 레코드를 추가한다
    let offset = 0;
    if ((completion.mileage_granted ?? 0) > 0) {
      offset = -completion.mileage_granted;
      // reason 에 시각을 붙여 취소·재승인을 반복해도 dedup 부분 유니크 인덱스와 충돌하지 않게 한다
      const { error: mileError } = await admin.from("mileage_records").insert({
        student_id: targetStudentId,
        points: offset,
        reason: `비교과 이수 취소: ${program?.name ?? programId} (${new Date().toISOString()})`,
        source_type: "extracurricular",
        source_id: programId,
      });
      if (mileError) {
        return NextResponse.json(
          { error: `이수는 취소했지만 마일리지 상계에 실패했습니다: ${mileError.message}` },
          { status: 500 },
        );
      }
    }

    // 학습 상태를 되돌린다 ('완료' → '신청')
    await admin
      .from("student_extracurricular")
      .update({ status: "신청", completed_at: null })
      .eq("student_id", targetStudentId)
      .eq("extracurricular_id", programId);

    return NextResponse.json({ status: "revoked", mileageOffset: offset });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
