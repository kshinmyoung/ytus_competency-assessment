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
 * 프로그램 등록 폼의 '카테고리' 선택지.
 *
 * 이 셋 중 하나가 아니면 '기타'로 보고, 폼에서 직접 입력한 값을 그대로 저장한다.
 * 기존 데이터에는 "학습, 디지털, 특강" 처럼 여러 값이 한 칸에 들어간 것이 많은데,
 * 그런 프로그램을 열면 '기타'로 잡히고 원래 값이 입력란에 남는다.
 */
export const CATEGORY_OPTIONS = ["특강", "활동", "프로그램"];

/** 고정 선택지에 없으면 직접 입력한 값이다. */
export function isEtcCategory(category: string | null | undefined): boolean {
  const c = (category ?? "").trim();
  return c !== "" && !CATEGORY_OPTIONS.includes(c);
}

/**
 * 프로그램 등록 폼의 '주관' 선택지.
 * 목록의 2단 분류와 같은 값을 쓰므로 자유 입력 때처럼 표기가 어긋나지 않는다.
 */
export const ORGANIZER_OPTIONS = ORGANIZER_GROUPS.map((g) => g.label);

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
