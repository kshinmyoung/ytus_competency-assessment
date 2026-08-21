/**
 * 이수 확정 (서버 전용)
 * POST /api/lms/complete  body: { programId }
 *
 * 판정·기록·마일리지는 전부 lms_finalize_completion RPC 가 담당한다.
 * 마일리지는 student_type='domestic' 인 경우에만 지급되며, 지급 여부도 RPC 가 정한다.
 */
import { NextResponse } from "next/server";
import { assertStudent, audienceMatches, lmsErrorResponse } from "@/lib/auth/lms-api";

export async function POST(request: Request) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType } = result;

    const body = await request.json();
    const programId = Number(body.programId);
    if (!programId) return NextResponse.json({ error: "programId가 필요합니다." }, { status: 400 });

    const { data: program } = await admin
      .from("extracurricular")
      .select("id, target_audience, is_active")
      .eq("id", programId)
      .maybeSingle();
    if (!program || !program.is_active) {
      return NextResponse.json({ error: "프로그램을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!audienceMatches(program.target_audience, studentType)) {
      return NextResponse.json({ error: "수강 대상이 아닌 프로그램입니다." }, { status: 403 });
    }

    const { data: enrollment } = await admin
      .from("student_extracurricular")
      .select("status")
      .eq("student_id", studentId)
      .eq("extracurricular_id", programId)
      .maybeSingle();
    if (!enrollment) {
      return NextResponse.json({ error: "신청하지 않은 프로그램입니다." }, { status: 403 });
    }

    const { data, error } = await admin.rpc("lms_finalize_completion", {
      p_student_id: studentId,
      p_program_id: programId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const payload = data as {
      status: string;
      certificate_no?: string;
      final_progress?: number;
      mileage_granted?: number;
      student_type?: string;
      required?: number;
      passed?: number;
      min_progress?: number;
      survey_id?: number;
    };

    // 유학생에게는 마일리지 관련 값을 아예 내려보내지 않는다 (설계서 11.4)
    if (studentType !== "domestic") {
      delete payload.mileage_granted;
    }

    return NextResponse.json(payload);
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
