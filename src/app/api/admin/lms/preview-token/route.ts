/**
 * 관리자 미리보기용 서명 토큰 발급 (서버 전용)
 *
 * requireSignedURLs=true 이므로 미리보기도 서명 토큰이 필요하다.
 * 학생용 /api/lms/playback-token 과 달리 수강 신청 여부를 확인하지 않으므로
 * 반드시 canManageLms 로 잠근다.
 */
import { NextResponse } from "next/server";
import { assertLmsManager, lmsErrorResponse } from "@/lib/auth/lms-api";
import { createPlaybackToken, getVideoMeta } from "@/lib/cloudflare-stream";

export async function POST(request: Request) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;

    const body = await request.json();
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    if (!uid) return NextResponse.json({ error: "uid가 필요합니다." }, { status: 400 });

    const { token, expiresAt } = createPlaybackToken(uid);

    // 서명 재생은 iframe.cloudflarestream.com 이 아니라 customer 서브도메인에서만 동작한다.
    const meta = await getVideoMeta(uid);
    const iframeUrl = meta.customerHost
      ? `https://${meta.customerHost}/${token}/iframe`
      : null;

    return NextResponse.json({ token, expiresAt, iframeUrl, allowedOrigins: meta.allowedOrigins });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
