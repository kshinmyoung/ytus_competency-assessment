/**
 * 비교과 영상 LMS 역할 권한 (설계서 3장)
 *
 * 새 role 을 만들지 않고 기존 students.role 7개 값에 LMS 권한을 매핑한다.
 * role 문자열은 DB 값을 그대로 넘겨도 되도록 내부에서 trim/소문자 정규화한다.
 */

/** 프로그램 개설, 콘텐츠 등록, 이수 확인 */
export const LMS_MANAGER_ROLES = [
  "admin",
  "career_center", // 취창업진로지원센터
  "counseling_center", // 상담센터
  "ctl", // 교수학습개발원
] as const;

/** 관리 권한 + 진도 현황 조회 전용 */
export const LMS_VIEWER_ROLES = [
  ...LMS_MANAGER_ROLES,
  "staff",
  "professor",
] as const;

function normalizeRole(role?: string | null): string {
  return (role ?? "").trim().toLowerCase();
}

/** 프로그램·콘텐츠 관리 권한 여부 */
export function canManageLms(role?: string | null): boolean {
  return (LMS_MANAGER_ROLES as readonly string[]).includes(normalizeRole(role));
}

/** 진도 현황 조회 권한 여부 (관리 권한 포함) */
export function canViewLmsProgress(role?: string | null): boolean {
  return (LMS_VIEWER_ROLES as readonly string[]).includes(normalizeRole(role));
}
