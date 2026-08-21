/**
 * 학생용 커리큘럼 조회 (서버 전용)
 * GET /api/lms/programs/[id]
 *
 * 콘텐츠별 진도 + 이수 상태. 대상이 맞지 않거나 비활성 프로그램은 내려보내지 않는다.
 */
import { NextResponse } from "next/server";
import { assertStudent, audienceMatches, deriveStatus, lmsErrorResponse } from "@/lib/auth/lms-api";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType } = result;

    const programId = Number((await params).id);
    if (!programId) return NextResponse.json({ error: "잘못된 프로그램 ID 입니다." }, { status: 400 });

    const { data: program, error: progError } = await admin
      .from("extracurricular")
      .select("id, name, description, category, organizer, delivery_type, target_audience, completion_mileage, thumbnail_url, completion_rule, is_active, registration_open")
      .eq("id", programId)
      .maybeSingle();
    if (progError) return NextResponse.json({ error: progError.message }, { status: 500 });
    if (!program || !program.is_active) {
      return NextResponse.json({ error: "프로그램을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!audienceMatches(program.target_audience, studentType)) {
      return NextResponse.json({ error: "수강 대상이 아닌 프로그램입니다." }, { status: 403 });
    }

    const [contentRes, enrollRes, completionRes] = await Promise.all([
      admin.from("extracurricular_contents").select("*").eq("extracurricular_id", programId).order("content_order").order("id"),
      admin.from("student_extracurricular").select("status, created_at").eq("student_id", studentId).eq("extracurricular_id", programId).maybeSingle(),
      admin.from("extracurricular_completions").select("certificate_no, completed_at, final_progress, mileage_granted").eq("student_id", studentId).eq("extracurricular_id", programId).is("revoked_at", null).maybeSingle(),
    ]);

    const contents = contentRes.data ?? [];
    const contentIds = contents.map((c) => c.id);
    const { data: progressRows } = contentIds.length
      ? await admin.from("video_progress").select("content_id, watched_sec, progress, last_position_sec, completed_at").eq("student_id", studentId).in("content_id", contentIds)
      : { data: [] as { content_id: number; watched_sec: number; progress: number; last_position_sec: number; completed_at: string | null }[] };

    const progressByContent = new Map((progressRows ?? []).map((p) => [p.content_id, p]));
    const minProgress = program.completion_rule?.min_progress ?? 90;

    // source_ref(video uid)는 내려보내지 않는다. 재생은 서명 토큰으로만 한다.
    const curriculum = contents.map((c) => {
      const vp = progressByContent.get(c.id);
      return {
        contentId: c.id,
        title: c.title,
        description: c.description,
        durationSec: c.duration_sec,
        language: c.language,
        contentOrder: c.content_order,
        isRequired: c.is_required,
        attachmentUrl: c.attachment_url,
        progress: Number(vp?.progress ?? 0),
        watchedSec: Number(vp?.watched_sec ?? 0),
        lastPositionSec: Number(vp?.last_position_sec ?? 0),
        passed: Number(vp?.progress ?? 0) >= minProgress,
      };
    });

    const required = curriculum.filter((c) => c.isRequired);
    const totalWatchedSec = curriculum.reduce((sum, c) => sum + c.watchedSec, 0);
    const avgProgress = required.length
      ? Math.round((required.reduce((sum, c) => sum + c.progress, 0) / required.length) * 100) / 100
      : 0;

    return NextResponse.json({
      studentType,
      program: {
        id: program.id,
        name: program.name,
        description: program.description,
        category: program.category,
        organizer: program.organizer,
        deliveryType: program.delivery_type,
        targetAudience: program.target_audience,
        thumbnailUrl: program.thumbnail_url,
        registrationOpen: program.registration_open,
        completionMileage: studentType === "domestic" ? program.completion_mileage : 0,
        minProgress,
      },
      enrolled: Boolean(enrollRes.data),
      enrolledStatus: enrollRes.data?.status ?? null,
      status: deriveStatus(Boolean(completionRes.data), totalWatchedSec),
      progress: avgProgress,
      requiredPassed: required.filter((c) => c.passed).length,
      requiredTotal: required.length,
      completion: completionRes.data ?? null,
      contents: curriculum,
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
