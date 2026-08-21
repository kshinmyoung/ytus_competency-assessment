/**
 * 내 학습 요약 (서버 전용)
 * GET /api/lms/my-summary
 *
 * 유학생 대시보드에서 마일리지 위젯 대신 쓰는 값 (설계서 11.4).
 * extracurricular_completions 는 브라우저에서 직접 읽지 않는다.
 */
import { NextResponse } from "next/server";
import { assertStudent, lmsErrorResponse } from "@/lib/auth/lms-api";

export async function GET(request: Request) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType } = result;

    const { data: completions, error } = await admin
      .from("extracurricular_completions")
      .select("extracurricular_id, certificate_no, completed_at, final_progress")
      .eq("student_id", studentId)
      .is("revoked_at", null)
      .order("completed_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = completions ?? [];
    const names = new Map<number, string>();
    if (rows.length > 0) {
      const { data: programs } = await admin
        .from("extracurricular")
        .select("id, name")
        .in("id", rows.map((r) => r.extracurricular_id));
      (programs ?? []).forEach((p) => names.set(p.id, p.name));
    }

    return NextResponse.json({
      studentType,
      completedCount: rows.length,
      certificates: rows.map((r) => ({
        certificateNo: r.certificate_no,
        programId: r.extracurricular_id,
        programName: names.get(r.extracurricular_id) ?? "",
        completedAt: r.completed_at,
        finalProgress: Number(r.final_progress),
      })),
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
