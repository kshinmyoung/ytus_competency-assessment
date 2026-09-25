/**
 * 학생용 첨부 자료 받기 (서버 전용)
 * GET /api/lms/attachments/[id]
 *
 * 영상 재생과 똑같은 검증(assertContentAccess)을 거친다 — 신청하지 않았거나
 * 수강 대상이 아니면 자료도 받을 수 없다. 버킷이 비공개라 서명 URL 없이는
 * 경로를 알아도 열리지 않으며, 그 URL 도 2분 뒤 만료된다.
 */
import { NextResponse } from "next/server";
import { assertContentAccess, assertStudent, lmsErrorResponse } from "@/lib/auth/lms-api";
import { ATTACHMENT_BUCKET } from "@/lib/lms-attachments";

type Params = { params: Promise<{ id: string }> };

const SIGNED_URL_SEC = 120;

export async function GET(request: Request, { params }: Params) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType, role } = result;

    const attachmentId = Number((await params).id);
    if (!attachmentId) return NextResponse.json({ error: "잘못된 첨부 ID 입니다." }, { status: 400 });

    const { data: attachment, error } = await admin
      .from("content_attachments")
      .select("id, content_id, storage_path, file_name")
      .eq("id", attachmentId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!attachment) return NextResponse.json({ error: "첨부 자료를 찾을 수 없습니다." }, { status: 404 });

    const access = await assertContentAccess(admin, studentId, studentType, role, attachment.content_id);
    if (access instanceof NextResponse) return access;

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
