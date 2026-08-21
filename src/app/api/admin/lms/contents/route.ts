/**
 * 관리자용 LMS 콘텐츠 API (서버 전용)
 * GET: 프로그램별 콘텐츠 목록, POST: 등록 (duration 자동 조회)
 *
 * duration_sec 은 진도율 분모이므로 수기 입력을 받지 않고 Cloudflare API 에서 조회한다.
 */
import { NextResponse } from "next/server";
import { assertLmsManager, lmsErrorResponse } from "@/lib/auth/lms-api";
import { getVideoMeta, updateVideoSettings } from "@/lib/cloudflare-stream";

export async function GET(request: Request) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const { searchParams } = new URL(request.url);
    const programId = Number(searchParams.get("programId"));
    if (!programId) {
      return NextResponse.json({ error: "programId가 필요합니다." }, { status: 400 });
    }

    const { data, error } = await admin
      .from("extracurricular_contents")
      .select("*")
      .eq("extracurricular_id", programId)
      .order("content_order")
      .order("id");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  } catch (e) {
    return lmsErrorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const body = await request.json();
    const programId = Number(body.programId);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const sourceRef = typeof body.sourceRef === "string" ? body.sourceRef.trim() : "";

    if (!programId) return NextResponse.json({ error: "programId가 필요합니다." }, { status: 400 });
    if (!title) return NextResponse.json({ error: "제목을 입력해 주세요." }, { status: 400 });
    if (!sourceRef) return NextResponse.json({ error: "영상 UID를 입력해 주세요." }, { status: 400 });

    // 같은 uid 가 이미 이 프로그램에 등록돼 있는지 확인
    const { data: dupe } = await admin
      .from("extracurricular_contents")
      .select("id, title")
      .eq("extracurricular_id", programId)
      .eq("source_ref", sourceRef)
      .maybeSingle();
    if (dupe) {
      return NextResponse.json(
        { error: `이미 등록된 UID 입니다. (${dupe.title})` },
        { status: 400 },
      );
    }

    // duration 자동 조회 — 인코딩 미완료면 등록을 막는다 (분모가 -1 이면 진도율이 무의미)
    const meta = await getVideoMeta(sourceRef);
    if (!meta.readyToStream || meta.durationSec <= 0) {
      return NextResponse.json(
        { error: "영상 인코딩이 끝나지 않았습니다. Cloudflare 에서 처리 완료 후 다시 등록해 주세요." },
        { status: 400 },
      );
    }

    // 필수 보안 설정 적용 (설계서 8.2)
    let securityApplied = false;
    let securityError: string | null = null;
    try {
      const after = await updateVideoSettings(sourceRef);
      securityApplied = after.requireSignedURLs;
    } catch (e) {
      securityError = e instanceof Error ? e.message : "보안 설정 적용 실패";
    }

    const { data, error } = await admin
      .from("extracurricular_contents")
      .insert({
        extracurricular_id: programId,
        title,
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        provider: "cloudflare",
        source_ref: sourceRef,
        duration_sec: meta.durationSec,
        language: typeof body.language === "string" && body.language.trim() ? body.language.trim() : "ko",
        content_group: typeof body.contentGroup === "string" ? body.contentGroup.trim() || null : null,
        content_order: Number(body.contentOrder) || 0,
        is_required: body.isRequired !== false,
        attachment_url: typeof body.attachmentUrl === "string" ? body.attachmentUrl.trim() || null : null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      content: data,
      thumbnailUrl: meta.thumbnailUrl,
      // 엣지 캐시 전파로 최대 1분 정도 지연될 수 있어 "적용됨"으로 단정하지 않는다
      securityApplied,
      securityError,
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
