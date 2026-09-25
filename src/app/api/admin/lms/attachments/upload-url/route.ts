/**
 * 첨부 자료 업로드용 서명 URL 발급 (서버 전용)
 * POST /api/admin/lms/attachments/upload-url  body: { contentId, fileName, sizeBytes }
 *
 * 파일 자체는 Route Handler 를 통과하지 않는다. Vercel 요청 본문 한도(4.5MB)에 걸려
 * 20MB 자료를 올릴 수 없기 때문이다. 브라우저가 이 URL 로 Storage 에 직접 올리고,
 * 끝나면 POST /api/admin/lms/attachments 로 등록을 마친다.
 *
 * 저장 경로는 서버가 정한다. 서명 URL 은 그 경로에만 쓸 수 있어 다른 위치를 덮어쓸 수 없다.
 */
import { NextResponse } from "next/server";
import { assertLmsManager, lmsErrorResponse } from "@/lib/auth/lms-api";
import { ATTACHMENT_BUCKET, attachmentExt, attachmentRejectReason } from "@/lib/lms-attachments";

export async function POST(request: Request) {
  try {
    const result = await assertLmsManager(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const body = await request.json();
    const contentId = Number(body.contentId);
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const sizeBytes = Number(body.sizeBytes) || 0;

    if (!contentId) return NextResponse.json({ error: "contentId가 필요합니다." }, { status: 400 });

    const reject = attachmentRejectReason(fileName, sizeBytes);
    if (reject) return NextResponse.json({ error: reject }, { status: 400 });

    const { data: content, error: contentError } = await admin
      .from("extracurricular_contents")
      .select("id, extracurricular_id")
      .eq("id", contentId)
      .maybeSingle();
    if (contentError) return NextResponse.json({ error: contentError.message }, { status: 500 });
    if (!content) return NextResponse.json({ error: "콘텐츠를 찾을 수 없습니다." }, { status: 404 });

    // 원본 파일명은 DB 에만 두고 경로에는 uuid 를 쓴다. 한글·공백·중복 이름 문제를 피한다.
    const path = `${content.extracurricular_id}/${content.id}/${crypto.randomUUID()}.${attachmentExt(fileName)}`;

    const { data, error } = await admin.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ bucket: ATTACHMENT_BUCKET, path: data.path, token: data.token });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
