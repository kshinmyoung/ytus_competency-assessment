const KOREA_TZ = "Asia/Seoul";

/**
 * ISO/UTC 날짜 문자열을 한국 시간(Asia/Seoul)으로 변환해
 * "2026-02-19 21:55" 형식으로 반환
 */
export function formatDateTimeKorea(isoDate: string | null | undefined): string {
  if (isoDate == null || String(isoDate).trim() === "") return "-";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KOREA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPart["type"]) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
