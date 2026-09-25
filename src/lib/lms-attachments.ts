/**
 * 영상 콘텐츠 첨부 자료 공통 규칙 (브라우저·서버 공용)
 *
 * 파일 실체는 비공개 버킷에 있고 브라우저는 서명 URL 로만 접근한다.
 * 허용 목록은 MIME 이 아니라 확장자로 판정한다 — .hwp 는 브라우저가 MIME 을
 * application/octet-stream 이나 빈 값으로 보내는 경우가 많아 MIME 으로 막으면 한글 문서가 반려된다.
 */

export const ATTACHMENT_BUCKET = "lms-attachments";

/** 버킷에도 같은 상한이 걸려 있다. 여기를 고치면 storage.buckets.file_size_limit 도 같이 고친다. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_EXTS = [
  "pdf", "hwp", "hwpx", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "zip", "txt", "png", "jpg", "jpeg", "gif", "webp",
] as const;

export type LmsAttachment = {
  id: number;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
};

export function attachmentExt(fileName: string): string {
  const matched = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  return matched ? matched[1].toLowerCase() : "";
}

export function isAllowedAttachment(fileName: string): boolean {
  return (ALLOWED_ATTACHMENT_EXTS as readonly string[]).includes(attachmentExt(fileName));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 업로드 거부 사유. 서버와 화면이 같은 문구를 쓴다. */
export function attachmentRejectReason(fileName: string, sizeBytes: number): string | null {
  if (!fileName.trim()) return "파일 이름을 확인할 수 없습니다.";
  if (!isAllowedAttachment(fileName)) {
    return `허용하지 않는 형식입니다. (${ALLOWED_ATTACHMENT_EXTS.join(", ")})`;
  }
  if (sizeBytes <= 0) return "빈 파일은 올릴 수 없습니다.";
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    return `파일이 너무 큽니다. (${formatFileSize(sizeBytes)} · 최대 ${formatFileSize(MAX_ATTACHMENT_BYTES)})`;
  }
  return null;
}
