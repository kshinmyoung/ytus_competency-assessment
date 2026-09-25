/**
 * 관리자용 첨부 자료 API (서버 전용)
 * GET:  콘텐츠별 첨부 목록 (programId 로 프로그램 전체 조회도 가능)
 * POST: 업로드 완료 등록  body: { contentId, path, fileName }
 *
 * POST 는 클라이언트가 보고한 크기·형식을 믿지 않는다. Storage 에 실제로 올라온 객체를
 * 조회해서 크기와 MIME 을 확인하고, 규격에 맞지 않으면 객체를 지운 뒤 거절한다.
 */
import { NextResponse } from "next/server";
import { assertLmsManager, lmsErrorResponse } from "@/lib/auth/lms-api";
import { ATTACHMENT_BUCKET, attachmentRejectReason } from "@/lib/lms-attachments";

export async function GET(request: Request) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const { searchParams } = new URL(request.url);
    const contentId = Number(searchParams.get("contentId"));
    const programId = Number(searchParams.get("programId"));
    if (!contentId && !programId) {
      return NextResponse.json({ error: "contentId 또는 programId가 필요합니다." }, { status: 400 });
    }

    let contentIds: number[] = [];
    if (contentId) {
      contentIds = [contentId];
    } else {
      const { data: contents, error } = await admin
        .from("extracurricular_contents")
        .select("id")
        .eq("extracurricular_id", programId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      contentIds = (contents ?? []).map((c) => c.id);
      if (contentIds.length === 0) return NextResponse.json([]);
    }

    const { data, error } = await admin
      .from("content_attachments")
      .select("id, content_id, file_name, size_bytes, mime_type, created_at")
      .in("content_id", contentIds)
      .order("sort_order")
      .order("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data ?? []);
  } catch (e) {
    return lmsErrorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId } = result;

    const body = await request.json();
    const contentId = Number(body.contentId);
    const path = typeof body.path === "string" ? body.path.trim() : "";
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";

    if (!contentId) return NextResponse.json({ error: "contentId가 필요합니다." }, { status: 400 });
    if (!path) return NextResponse.json({ error: "업로드 경로가 필요합니다." }, { status: 400 });

    const { data: content, error: contentError } = await admin
      .from("extracurricular_contents")
      .select("id, extracurricular_id")
      .eq("id", contentId)
      .maybeSingle();
    if (contentError) return NextResponse.json({ error: contentError.message }, { status: 500 });
    if (!content) return NextResponse.json({ error: "콘텐츠를 찾을 수 없습니다." }, { status: 404 });

    // 서명 URL 을 발급할 때 정한 경로와 같은지 확인한다. 남의 콘텐츠 밑에 붙일 수 없다.
    if (!path.startsWith(`${content.extracurricular_id}/${content.id}/`)) {
      return NextResponse.json({ error: "업로드 경로가 올바르지 않습니다." }, { status: 400 });
    }

    const { data: info, error: infoError } = await admin.storage.from(ATTACHMENT_BUCKET).info(path);
    if (infoError || !info) {
      return NextResponse.json({ error: "업로드된 파일을 찾을 수 없습니다. 다시 시도해 주세요." }, { status: 400 });
    }

    const sizeBytes = Number(info.size ?? 0);
    const reject = attachmentRejectReason(fileName, sizeBytes);
    if (reject) {
      await admin.storage.from(ATTACHMENT_BUCKET).remove([path]);
      return NextResponse.json({ error: reject }, { status: 400 });
    }

    // 같은 콘텐츠 안에서의 노출 순서. 기존 첨부 뒤에 붙인다.
    const { data: last } = await admin
      .from("content_attachments")
      .select("sort_order")
      .eq("content_id", contentId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await admin
      .from("content_attachments")
      .insert({
        content_id: contentId,
        file_name: fileName,
        storage_path: path,
        mime_type: info.contentType || "application/octet-stream",
        size_bytes: sizeBytes,
        sort_order: (last?.sort_order ?? 0) + 1,
        uploaded_by: studentId,
      })
      .select("id, content_id, file_name, size_bytes, mime_type, created_at")
      .single();

    if (error) {
      // DB 등록에 실패하면 올라간 객체를 남기지 않는다
      await admin.storage.from(ATTACHMENT_BUCKET).remove([path]);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
