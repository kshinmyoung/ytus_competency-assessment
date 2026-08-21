/**
 * 관리자용 LMS 콘텐츠 단건 API (서버 전용)
 * PATCH: 수정 (UID 변경 시 duration 재조회), DELETE: 삭제
 */
import { NextResponse } from "next/server";
import { assertLmsManager, lmsErrorResponse } from "@/lib/auth/lms-api";
import { getVideoMeta, updateVideoSettings } from "@/lib/cloudflare-stream";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const contentId = Number((await params).id);
    if (!contentId) return NextResponse.json({ error: "잘못된 콘텐츠 ID 입니다." }, { status: 400 });

    const { data: current, error: loadError } = await admin
      .from("extracurricular_contents")
      .select("*")
      .eq("id", contentId)
      .maybeSingle();
    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "콘텐츠를 찾을 수 없습니다." }, { status: 404 });

    const body = await request.json();
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.title === "string" && body.title.trim()) payload.title = body.title.trim();
    if (typeof body.description === "string") payload.description = body.description.trim() || null;
    if (typeof body.language === "string" && body.language.trim()) payload.language = body.language.trim();
    if (typeof body.contentGroup === "string") payload.content_group = body.contentGroup.trim() || null;
    if (body.contentOrder !== undefined) payload.content_order = Number(body.contentOrder) || 0;
    if (typeof body.isRequired === "boolean") payload.is_required = body.isRequired;
    if (typeof body.attachmentUrl === "string") payload.attachment_url = body.attachmentUrl.trim() || null;

    let securityApplied: boolean | null = null;
    let securityError: string | null = null;

    // UID 가 바뀌면 duration 을 반드시 다시 조회한다. 수기 입력은 받지 않는다.
    const newRef = typeof body.sourceRef === "string" ? body.sourceRef.trim() : "";
    if (newRef && newRef !== current.source_ref) {
      const meta = await getVideoMeta(newRef);
      if (!meta.readyToStream || meta.durationSec <= 0) {
        return NextResponse.json(
          { error: "영상 인코딩이 끝나지 않았습니다. 처리 완료 후 다시 시도해 주세요." },
          { status: 400 },
        );
      }
      payload.source_ref = newRef;
      payload.duration_sec = meta.durationSec;
      try {
        const after = await updateVideoSettings(newRef);
        securityApplied = after.requireSignedURLs;
      } catch (e) {
        securityError = e instanceof Error ? e.message : "보안 설정 적용 실패";
      }
    }

    const { data, error } = await admin
      .from("extracurricular_contents")
      .update(payload)
      .eq("id", contentId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ content: data, securityApplied, securityError });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const contentId = Number((await params).id);
    if (!contentId) return NextResponse.json({ error: "잘못된 콘텐츠 ID 입니다." }, { status: 400 });

    // 시청 기록이 있으면 삭제를 막는다 (video_progress 가 cascade 로 함께 지워진다)
    const { count } = await admin
      .from("video_progress")
      .select("student_id", { count: "exact", head: true })
      .eq("content_id", contentId);

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `이미 ${count}명의 시청 기록이 있어 삭제할 수 없습니다. 필수 여부를 해제해 주세요.` },
        { status: 400 },
      );
    }

    const { error } = await admin.from("extracurricular_contents").delete().eq("id", contentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
