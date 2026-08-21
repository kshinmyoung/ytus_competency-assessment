/**
 * 학생용 재생 토큰 발급 (서버 전용)
 * POST /api/lms/playback-token  body: { contentId }
 *
 * 설계서 8.3 의 검증 순서를 그대로 지킨다:
 *   1) 세션에서 student_id 확보 (body 값 신뢰 금지)
 *   2) 해당 콘텐츠의 프로그램에 신청되어 있는지 확인
 *   3) target_audience 와 student_type 일치 확인
 *   4) 서명 JWT 발급 (4시간)
 */
import { NextResponse } from "next/server";
import { assertStudent, audienceMatches, lmsErrorResponse } from "@/lib/auth/lms-api";
import { createPlaybackToken, getVideoMeta } from "@/lib/cloudflare-stream";

export async function POST(request: Request) {
  try {
    // 1) 세션에서 student_id 확보
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType } = result;

    const body = await request.json();
    const contentId = Number(body.contentId);
    if (!contentId) return NextResponse.json({ error: "contentId가 필요합니다." }, { status: 400 });

    const { data: content, error: contentError } = await admin
      .from("extracurricular_contents")
      .select("id, source_ref, extracurricular_id, title")
      .eq("id", contentId)
      .maybeSingle();
    if (contentError) return NextResponse.json({ error: contentError.message }, { status: 500 });
    if (!content) return NextResponse.json({ error: "콘텐츠를 찾을 수 없습니다." }, { status: 404 });

    const { data: program } = await admin
      .from("extracurricular")
      .select("id, target_audience, is_active")
      .eq("id", content.extracurricular_id)
      .maybeSingle();
    if (!program || !program.is_active) {
      return NextResponse.json({ error: "프로그램을 찾을 수 없습니다." }, { status: 404 });
    }

    // 2) 신청 여부 확인
    const { data: enrollment } = await admin
      .from("student_extracurricular")
      .select("status")
      .eq("student_id", studentId)
      .eq("extracurricular_id", program.id)
      .maybeSingle();
    if (!enrollment) {
      return NextResponse.json({ error: "신청하지 않은 프로그램입니다." }, { status: 403 });
    }

    // 3) 대상 일치 확인
    if (!audienceMatches(program.target_audience, studentType)) {
      return NextResponse.json({ error: "수강 대상이 아닌 프로그램입니다." }, { status: 403 });
    }

    // 4) 서명 토큰 발급 (기본 4시간)
    const { token, expiresAt } = createPlaybackToken(content.source_ref);
    const meta = await getVideoMeta(content.source_ref);
    const iframeUrl = meta.customerHost ? `https://${meta.customerHost}/${token}/iframe` : null;

    return NextResponse.json({ token, expiresAt, iframeUrl });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
