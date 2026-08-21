/**
 * 이어보기 (서버 전용)
 * GET /api/lms/resume
 *
 * 가장 최근에 보던 미완료 콘텐츠 1건을 반환한다. 없으면 null.
 */
import { NextResponse } from "next/server";
import { assertStudent, audienceMatches, lmsErrorResponse } from "@/lib/auth/lms-api";

export async function GET(request: Request) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType } = result;

    // 최근 시청 순으로 몇 건만 본다 (이수 기준 미달인 것 중 첫 건을 고른다)
    const { data: rows, error } = await admin
      .from("video_progress")
      .select("content_id, progress, watched_sec, last_position_sec, last_played_at")
      .eq("student_id", studentId)
      .order("last_played_at", { ascending: false })
      .limit(10);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!rows || rows.length === 0) return NextResponse.json({ resume: null });

    const { data: contents } = await admin
      .from("extracurricular_contents")
      .select("id, title, duration_sec, extracurricular_id")
      .in("id", rows.map((r) => r.content_id));
    if (!contents || contents.length === 0) return NextResponse.json({ resume: null });

    const { data: programs } = await admin
      .from("extracurricular")
      .select("id, name, target_audience, is_active, completion_rule")
      .in("id", contents.map((c) => c.extracurricular_id));

    const programById = new Map((programs ?? []).map((p) => [p.id, p]));
    const contentById = new Map(contents.map((c) => [c.id, c]));

    // 이미 이수한 프로그램은 이어보기 대상에서 뺀다
    const { data: completions } = await admin
      .from("extracurricular_completions")
      .select("extracurricular_id")
      .eq("student_id", studentId)
      .is("revoked_at", null);
    const completed = new Set((completions ?? []).map((c) => c.extracurricular_id));

    for (const row of rows) {
      const content = contentById.get(row.content_id);
      if (!content) continue;
      const program = programById.get(content.extracurricular_id);
      if (!program || !program.is_active) continue;
      if (!audienceMatches(program.target_audience, studentType)) continue;
      if (completed.has(program.id)) continue;

      const minProgress = program.completion_rule?.min_progress ?? 90;
      if (Number(row.progress) >= minProgress) continue;   // 이 콘텐츠는 이미 채웠다

      return NextResponse.json({
        resume: {
          programId: program.id,
          programName: program.name,
          contentId: content.id,
          contentTitle: content.title,
          durationSec: content.duration_sec,
          progress: Number(row.progress),
          lastPositionSec: row.last_position_sec,
          lastPlayedAt: row.last_played_at,
          href: `/lms/${program.id}/watch/${content.id}`,
        },
      });
    }

    return NextResponse.json({ resume: null });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
