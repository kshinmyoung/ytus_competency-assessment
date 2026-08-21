/**
 * 진도 현황 내보내기 (서버 전용)
 * GET /api/admin/lms/export?programId=1
 *
 * 기존 /api/admin/dashboard/export 와 동일하게 행 배열(JSON)을 반환하고,
 * 엑셀 파일 생성은 클라이언트의 lib/export.ts 가 담당한다.
 * 내국인/유학생을 분리해 내려보낸다 (합산 금지).
 */
import { NextResponse } from "next/server";
import { assertLmsViewer, lmsErrorResponse } from "@/lib/auth/lms-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { domestic: "내국인", international: "유학생" };

export async function GET(request: Request) {
  try {
    const result = await assertLmsViewer(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const { searchParams } = new URL(request.url);
    const programId = Number(searchParams.get("programId"));
    if (!programId) return NextResponse.json({ error: "programId가 필요합니다." }, { status: 400 });

    const { data: program } = await admin
      .from("extracurricular")
      .select("id, name, completion_rule")
      .eq("id", programId)
      .maybeSingle();
    if (!program) return NextResponse.json({ error: "프로그램을 찾을 수 없습니다." }, { status: 404 });

    const minProgress = program.completion_rule?.min_progress ?? 90;

    const [{ data: contents }, { data: enrollments }, { data: completions }] = await Promise.all([
      admin.from("extracurricular_contents").select("id, title, is_required, content_order")
        .eq("extracurricular_id", programId).order("content_order").order("id"),
      admin.from("student_extracurricular").select("student_id, status, created_at").eq("extracurricular_id", programId),
      admin.from("extracurricular_completions")
        .select("student_id, certificate_no, completed_at, final_progress, mileage_granted, revoked_at")
        .eq("extracurricular_id", programId),
    ]);

    const contentList = contents ?? [];
    const studentIds = (enrollments ?? []).map((e) => e.student_id);
    if (studentIds.length === 0) {
      return NextResponse.json({ programName: program.name, domestic: [], international: [] });
    }

    const [{ data: students }, { data: progressRows }] = await Promise.all([
      admin.from("students").select("student_id, name, student_type").in("student_id", studentIds),
      contentList.length > 0
        ? admin.from("video_progress").select("student_id, content_id, progress, watched_sec")
            .in("student_id", studentIds).in("content_id", contentList.map((c) => c.id))
        : Promise.resolve({ data: [] as { student_id: string; content_id: number; progress: number; watched_sec: number }[] }),
    ]);

    const studentById = new Map((students ?? []).map((s) => [s.student_id, s]));
    const completionByStudent = new Map((completions ?? []).map((c) => [c.student_id, c]));
    const key = (sid: string, cid: number) => `${sid}#${cid}`;
    const progressMap = new Map((progressRows ?? []).map((p) => [key(p.student_id, p.content_id), p]));
    const requiredContents = contentList.filter((c) => c.is_required);

    const rows = (enrollments ?? []).map((e) => {
      const s = studentById.get(e.student_id);
      const completion = completionByStudent.get(e.student_id);
      const isCompleted = Boolean(completion && !completion.revoked_at);
      const avg = requiredContents.length
        ? Math.round((requiredContents.reduce(
            (sum, c) => sum + Number(progressMap.get(key(e.student_id, c.id))?.progress ?? 0), 0,
          ) / requiredContents.length) * 100) / 100
        : 0;

      const row: Record<string, unknown> = {
        학번: e.student_id,
        이름: s?.name ?? "",
        학생유형: TYPE_LABEL[s?.student_type ?? "domestic"] ?? s?.student_type,
        신청일: e.created_at ? String(e.created_at).slice(0, 10) : "",
        신청상태: e.status,
        "전체 진도율(%)": avg,
        "필수 통과": `${requiredContents.filter((c) => Number(progressMap.get(key(e.student_id, c.id))?.progress ?? 0) >= minProgress).length}/${requiredContents.length}`,
        이수여부: isCompleted ? "이수" : completion?.revoked_at ? "취소됨" : "미이수",
        수료번호: isCompleted ? completion?.certificate_no ?? "" : "",
        이수일: isCompleted && completion?.completed_at ? String(completion.completed_at).slice(0, 10) : "",
        마일리지: isCompleted ? completion?.mileage_granted ?? 0 : 0,
      };
      // 콘텐츠별 진도율을 열로 펼친다
      contentList.forEach((c, i) => {
        row[`${i + 1}. ${c.title}${c.is_required ? "" : "(선택)"}`] =
          Number(progressMap.get(key(e.student_id, c.id))?.progress ?? 0);
      });
      return { row, studentType: s?.student_type ?? "domestic" };
    });

    return NextResponse.json({
      programName: program.name,
      minProgress,
      // 분모가 다르므로 시트를 나눠 내려보낸다
      domestic: rows.filter((r) => r.studentType === "domestic").map((r) => r.row),
      international: rows.filter((r) => r.studentType === "international").map((r) => r.row),
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
