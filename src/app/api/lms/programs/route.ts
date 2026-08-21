/**
 * 학생용 영상 프로그램 목록 (서버 전용)
 * GET /api/lms/programs
 *
 * target_audience 와 학생 student_type 을 대조해 거른 뒤,
 * 신청 여부·진도·이수 상태를 함께 내려보낸다.
 */
import { NextResponse } from "next/server";
import { assertStudent, audienceMatches, deriveStatus, lmsErrorResponse } from "@/lib/auth/lms-api";

export async function GET(request: Request) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType } = result;

    // 1) 대상이 맞는 활성 영상형 프로그램
    const { data: programs, error: progError } = await admin
      .from("extracurricular")
      .select("id, name, description, category, organizer, delivery_type, target_audience, completion_mileage, thumbnail_url, completion_rule, registration_open")
      .in("delivery_type", ["video", "hybrid"])
      .eq("is_active", true)
      .order("id", { ascending: false });
    if (progError) return NextResponse.json({ error: progError.message }, { status: 500 });

    const visible = (programs ?? []).filter((p) => audienceMatches(p.target_audience, studentType));
    if (visible.length === 0) return NextResponse.json({ studentType, programs: [] });

    const ids = visible.map((p) => p.id);

    // 2) 내 신청 내역 / 콘텐츠 / 진도 / 이수
    const [enrollRes, contentRes, completionRes] = await Promise.all([
      admin.from("student_extracurricular").select("extracurricular_id, status").eq("student_id", studentId).in("extracurricular_id", ids),
      admin.from("extracurricular_contents").select("id, extracurricular_id, duration_sec, is_required").in("extracurricular_id", ids),
      admin.from("extracurricular_completions").select("extracurricular_id, certificate_no, completed_at, final_progress").eq("student_id", studentId).in("extracurricular_id", ids).is("revoked_at", null),
    ]);

    const contents = contentRes.data ?? [];
    const contentIds = contents.map((c) => c.id);
    const { data: progressRows } = contentIds.length
      ? await admin.from("video_progress").select("content_id, watched_sec, progress").eq("student_id", studentId).in("content_id", contentIds)
      : { data: [] as { content_id: number; watched_sec: number; progress: number }[] };

    const enrolled = new Set((enrollRes.data ?? []).map((e) => e.extracurricular_id));
    const completionByProgram = new Map((completionRes.data ?? []).map((c) => [c.extracurricular_id, c]));
    const progressByContent = new Map((progressRows ?? []).map((p) => [p.content_id, p]));

    const payload = visible.map((p) => {
      const own = contents.filter((c) => c.extracurricular_id === p.id);
      const required = own.filter((c) => c.is_required);
      // 프로그램 진도 = 필수 콘텐츠 진도의 평균 (설계서 6.2 의 final_progress 와 같은 기준)
      const avgProgress = required.length
        ? Math.round((required.reduce((sum, c) => sum + Number(progressByContent.get(c.id)?.progress ?? 0), 0) / required.length) * 100) / 100
        : 0;
      const watchedSec = own.reduce((sum, c) => sum + Number(progressByContent.get(c.id)?.watched_sec ?? 0), 0);
      const completion = completionByProgram.get(p.id);

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        organizer: p.organizer,
        deliveryType: p.delivery_type,
        targetAudience: p.target_audience,
        thumbnailUrl: p.thumbnail_url,
        registrationOpen: p.registration_open,
        // 마일리지는 내국인에게만 지급되므로 유학생에게는 노출하지 않는다
        completionMileage: studentType === "domestic" ? p.completion_mileage : 0,
        minProgress: p.completion_rule?.min_progress ?? 90,
        contentCount: own.length,
        requiredCount: required.length,
        totalDurationSec: own.reduce((sum, c) => sum + c.duration_sec, 0),
        enrolled: enrolled.has(p.id),
        progress: avgProgress,
        watchedSec,
        status: deriveStatus(Boolean(completion), watchedSec),
        certificateNo: completion?.certificate_no ?? null,
        completedAt: completion?.completed_at ?? null,
      };
    });

    return NextResponse.json({ studentType, programs: payload });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
