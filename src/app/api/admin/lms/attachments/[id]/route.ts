/**
 * 관리자용 첨부 자료 단건 API (서버 전용)
 * GET:    관리 화면에서 받아보기 (서명 URL 발급)
 * DELETE: 파일과 메타데이터를 함께 삭제
 *
 * 관리자는 프로그램을 신청하지 않으므로 학생용 다운로드 경로(assertContentAccess)를
 * 쓸 수 없다. 관리 권한으로 판정하는 별도 경로를 둔다.
 */
import { NextResponse } from "next/server";
import { assertLmsManager, lmsErrorResponse } from "@/lib/auth/lms-api";
import { ATTACHMENT_BUCKET } from "@/lib/lms-attachments";

type Params = { params: Promise<{ id: string }> };

/** 서명 URL 유효 시간. 링크가 새어나가도 곧 만료되도록 짧게 둔다. */
const SIGNED_URL_SEC = 120;

export async function GET(request: Request, { params }: Params) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const attachmentId = Number((await params).id);
    if (!attachmentId) return NextResponse.json({ error: "잘못된 첨부 ID 입니다." }, { status: 400 });

    const { data: attachment, error } = await admin
      .from("content_attachments")
      .select("storage_path, file_name")
      .eq("id", attachmentId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!attachment) return NextResponse.json({ error: "첨부 자료를 찾을 수 없습니다." }, { status: 404 });

    const { data, error: signError } = await admin.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(attachment.storage_path, SIGNED_URL_SEC, { download: attachment.file_name });
    if (signError || !data) {
      return NextResponse.json({ error: "파일을 불러오지 못했습니다." }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl, fileName: attachment.file_name });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const attachmentId = Number((await params).id);
    if (!attachmentId) return NextResponse.json({ error: "잘못된 첨부 ID 입니다." }, { status: 400 });

    const { data: attachment, error } = await admin
      .from("content_attachments")
      .select("storage_path")
      .eq("id", attachmentId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!attachment) return NextResponse.json({ error: "첨부 자료를 찾을 수 없습니다." }, { status: 404 });

    // 파일을 먼저 지운다. 메타데이터만 남으면 목록에 뜨는데 받을 수 없는 자료가 된다.
    const { error: removeError } = await admin.storage
      .from(ATTACHMENT_BUCKET)
      .remove([attachment.storage_path]);
    if (removeError) return NextResponse.json({ error: removeError.message }, { status: 500 });

    const { error: deleteError } = await admin
      .from("content_attachments")
      .delete()
      .eq("id", attachmentId);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
