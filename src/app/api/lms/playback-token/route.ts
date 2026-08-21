/**
 * 학생용 재생 토큰 발급 (서버 전용)
 * POST /api/lms/playback-token  body: { contentId }
 *
 * 설계서 8.3 의 검증 순서를 그대로 지킨다:
 *   1) 세션에서 student_id 확보 (body 값 신뢰 금지)
 *   2) 해당 콘텐츠의 프로그램에 신청되어 있는지 확인
 *   3) target_audience 와 student_type 일치 확인
 *   4) 서명 JWT 발급 (4시간)
 * 2~3 은 assertContentAccess 가 담당하며 /api/lms/watch 와 동일한 검증을 쓴다.
 */
import { NextResponse } from "next/server";
import { assertContentAccess, assertStudent, lmsErrorResponse } from "@/lib/auth/lms-api";
import { createPlaybackToken, getVideoMeta } from "@/lib/cloudflare-stream";

export async function POST(request: Request) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType } = result;

    const body = await request.json();
    const contentId = Number(body.contentId);
    if (!contentId) return NextResponse.json({ error: "contentId가 필요합니다." }, { status: 400 });

    const access = await assertContentAccess(admin, studentId, studentType, contentId);
    if (access instanceof NextResponse) return access;

    const { token, expiresAt } = createPlaybackToken(access.content.source_ref);
    const meta = await getVideoMeta(access.content.source_ref);
    const iframeUrl = meta.customerHost ? `https://${meta.customerHost}/${token}/iframe` : null;

    return NextResponse.json({ token, expiresAt, iframeUrl });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
