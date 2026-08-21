/**
 * 관리자 진도 현황 (서버 전용)
 * GET /api/admin/lms/progress?programId=1
 *
 * 조회 권한은 canViewLmsProgress.
 * 내국인/유학생은 합산하지 않고 각각 집계해 내려보낸다 (분모가 다르다).
 */
import { NextResponse } from "next/server";
import { assertLmsViewer, lmsErrorResponse } from "@/lib/auth/lms-api";

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
      .select("id, name, target_audience, completion_rule, completion_mileage")
      .eq("id", programId)
      .maybeSingle();
    if (!program) return NextResponse.json({ error: "프로그램을 찾을 수 없습니다." }, { status: 404 });

    const minProgress = program.completion_rule?.min_progress ?? 90;

    const [{ data: contents }, { data: enrollments }, { data: completions }] = await Promise.all([
      admin.from("extracurricular_contents").select("id, title, duration_sec, is_required, content_order")
        .eq("extracurricular_id", programId).order("content_order").order("id"),
      admin.from("student_extracurricular").select("student_id, status, created_at")
        .eq("extracurricular_id", programId),
      admin.from("extracurricular_completions")
        .select("student_id, certificate_no, completed_at, final_progress, mileage_granted, student_type, revoked_at, revoke_reason, approved_by")
        .eq("extracurricular_id", programId),
    ]);

    const contentList = contents ?? [];
    const studentIds = (enrollments ?? []).map((e) => e.student_id);
    if (studentIds.length === 0) {
      return NextResponse.json({
        program: { id: program.id, name: program.name, minProgress, completionMileage: program.completion_mileage },
        contents: contentList.map((c) => ({ contentId: c.id, title: c.title, durationSec: c.duration_sec, isRequired: c.is_required })),
        rows: [], summary: {},
      });
    }

    const [{ data: students }, { data: progressRows }] = await Promise.all([
      admin.from("students").select("student_id, name, student_type, department_id").in("student_id", studentIds),
      contentList.length > 0
        ? admin.from("video_progress").select("student_id, content_id, progress, watched_sec, last_played_at")
            .in("student_id", studentIds).in("content_id", contentList.map((c) => c.id))
        : Promise.resolve({ data: [] as { student_id: string; content_id: number; progress: number; watched_sec: number; last_played_at: string }[] }),
    ]);

    const studentById = new Map((students ?? []).map((s) => [s.student_id, s]));
    const completionByStudent = new Map((completions ?? []).map((c) => [c.student_id, c]));
    const progressKey = (sid: string, cid: number) => `${sid}#${cid}`;
    const progressMap = new Map((progressRows ?? []).map((p) => [progressKey(p.student_id, p.content_id), p]));

    const requiredContents = contentList.filter((c) => c.is_required);

    const rows = (enrollments ?? []).map((e) => {
      const student = studentById.get(e.student_id);
      const perContent = contentList.map((c) => {
        const vp = progressMap.get(progressKey(e.student_id, c.id));
        return {
          contentId: c.id,
          progress: Number(vp?.progress ?? 0),
          watchedSec: Number(vp?.watched_sec ?? 0),
        };
      });
      const requiredPassed = requiredContents.filter(
        (c) => Number(progressMap.get(progressKey(e.student_id, c.id))?.progress ?? 0) >= minProgress,
      ).length;
      const avgProgress = requiredContents.length
        ? Math.round((requiredContents.reduce(
            (sum, c) => sum + Number(progressMap.get(progressKey(e.student_id, c.id))?.progress ?? 0), 0,
          ) / requiredContents.length) * 100) / 100
        : 0;
      const completion = completionByStudent.get(e.student_id);
      const lastPlayed = perContent.length
        ? (progressRows ?? []).filter((p) => p.student_id === e.student_id)
            .map((p) => p.last_played_at).sort().pop() ?? null
        : null;

      return {
        studentId: e.student_id,
        name: student?.name ?? "",
        studentType: student?.student_type ?? "domestic",
        enrolledStatus: e.status,
        enrolledAt: e.created_at,
        progress: avgProgress,
        requiredPassed,
        requiredTotal: requiredContents.length,
        perContent,
        lastPlayedAt: lastPlayed,
        completed: Boolean(completion && !completion.revoked_at),
        certificateNo: completion?.certificate_no ?? null,
        completedAt: completion?.completed_at ?? null,
        mileageGranted: completion?.mileage_granted ?? 0,
        revokedAt: completion?.revoked_at ?? null,
        revokeReason: completion?.revoke_reason ?? null,
        approvedBy: completion?.approved_by ?? null,
      };
    });

    // 내국인/유학생 각각 집계 — 합산하지 않는다
    const summary: Record<string, { enrolled: number; completed: number; avgProgress: number }> = {};
    for (const type of ["domestic", "international"]) {
      const group = rows.filter((r) => r.studentType === type);
      if (group.length === 0) continue;
      summary[type] = {
        enrolled: group.length,
        completed: group.filter((r) => r.completed).length,
        avgProgress: Math.round((group.reduce((s, r) => s + r.progress, 0) / group.length) * 100) / 100,
      };
    }

    return NextResponse.json({
      program: { id: program.id, name: program.name, minProgress, completionMileage: program.completion_mileage },
      contents: contentList.map((c) => ({ contentId: c.id, title: c.title, durationSec: c.duration_sec, isRequired: c.is_required })),
      rows,
      summary,
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
