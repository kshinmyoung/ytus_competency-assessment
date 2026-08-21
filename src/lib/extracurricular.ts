/**
 * 비교과 프로그램 분류 — 목록 화면의 2단 구조.
 *
 * 1단: 전달 방식 (온라인 / 대면)
 * 2단: 주관 기관 (교수학습지원센터 / 취창업진로지원센터 / 학생생활상담센터 / 비교과)
 *
 * extracurricular.organizer 는 자유 입력이라 표기가 제각각이다
 * ("취창업진로지원센터, 국제교류교육원" 처럼 공동 주관도 있다).
 * 그래서 값을 그대로 쓰지 않고 센터 이름이 들어 있는지로 판정한다.
 */

export type DeliveryGroupKey = "online" | "offline";
export type OrganizerGroupKey = "ctl" | "career" | "counseling" | "etc";

export const DELIVERY_GROUPS: { key: DeliveryGroupKey; label: string }[] = [
  { key: "online", label: "온라인" },
  { key: "offline", label: "대면" },
];

export const ORGANIZER_GROUPS: { key: OrganizerGroupKey; label: string }[] = [
  { key: "ctl", label: "교수학습지원센터" },
  { key: "career", label: "취창업진로지원센터" },
  { key: "counseling", label: "학생생활상담센터" },
  { key: "etc", label: "비교과" },
];

/**
 * 영상(video)은 온라인, 대면(offline)은 대면.
 * hybrid 는 실제로 둘 다이므로 양쪽 목록에 모두 나온다.
 */
export function matchesDelivery(deliveryType: string | null | undefined, group: DeliveryGroupKey): boolean {
  const t = (deliveryType ?? "offline").trim();
  if (t === "hybrid") return true;
  return group === "online" ? t === "video" : t === "offline";
}

/** 센터 이름이 들어 있는지로 판정한다. 어디에도 걸리지 않으면 '비교과'로 묶는다. */
export function resolveOrganizerGroup(organizer: string | null | undefined): OrganizerGroupKey {
  const o = organizer ?? "";
  if (o.includes("교수학습지원센터")) return "ctl";
  if (o.includes("취창업진로지원센터")) return "career";
  if (o.includes("학생생활상담센터")) return "counseling";
  return "etc";
}
