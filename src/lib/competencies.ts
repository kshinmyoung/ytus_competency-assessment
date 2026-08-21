/**
 * 6대 핵심역량 — 화면 표시의 단일 기준.
 *
 * 학교의 정식 역량은 core_competencies 테이블의 6개다.
 * 그런데 핵심역량진단은 창의수행과 융합사고를 'creative' 하나로 묶어 측정하므로
 * 점수 키는 5개뿐이다. 화면에서는 6축으로 펼치되, 두 축에 같은 값을 넣는다.
 *
 * 주의: 창의수행과 융합사고는 항상 같은 점수로 표시된다. 두 역량을 따로 변별하려면
 * 진단 문항을 분리해야 한다 (문항 분리는 교무처 결정 사항).
 */

export type CoreCompetency = {
  /** core_competencies.id */
  id: number;
  /** 정식 명칭 */
  name: string;
  /** 나침반·차트의 축 라벨 (원 밖으로 넘치지 않게 줄인 이름) */
  short: string;
  /** diagnosis_results.scores 의 키 */
  scoreKey: string;
  /** core_competencies.color_code */
  color: string;
};

/** core_competencies.id 순서 */
export const CORE_COMPETENCIES: CoreCompetency[] = [
  { id: 1, name: "영성역량",        short: "영성",     scoreKey: "spiritual",  color: "#8B5CF6" },
  { id: 2, name: "기독교적 성찰역량", short: "성찰",     scoreKey: "reflection", color: "#6366F1" },
  { id: 3, name: "창의수행역량",     short: "창의수행", scoreKey: "creative",   color: "#F59E0B" },
  { id: 4, name: "융합사고역량",     short: "융합사고", scoreKey: "creative",   color: "#10B981" },
  { id: 5, name: "공감소통역량",     short: "공감소통", scoreKey: "empathy",    color: "#3B82F6" },
  { id: 6, name: "글로컬시민역량",   short: "글로컬",   scoreKey: "glocal",     color: "#EF4444" },
];

/** 핵심역량 한 축의 만점 (5문항 × 5점) */
export const CORE_MAX = 25;

/** 이 비율 이상이면 '빛이 닿았다'고 본다 */
export const LIT_RATIO = 0.8;

export type CompetencyScore = CoreCompetency & {
  score: number;
  lit: boolean;
};

/** 진단 점수(5키)를 6축으로 펼친다. 결과가 없으면 null. */
export function toSixAxes(
  scores: Record<string, number> | null | undefined,
): CompetencyScore[] | null {
  if (!scores) return null;
  return CORE_COMPETENCIES.map((c) => {
    const score = Number(scores[c.scoreKey] ?? 0);
    return { ...c, score, lit: score >= CORE_MAX * LIT_RATIO };
  });
}

/**
 * 점수가 낮은 순으로 역량 id 를 돌려준다 (프로그램 추천용).
 * 창의수행·융합사고는 점수가 같으므로 함께 뽑히거나 함께 빠진다.
 */
export function weakestCompetencyIds(
  scores: Record<string, number> | null | undefined,
  count = 2,
): number[] {
  const axes = toSixAxes(scores);
  if (!axes) return [];
  return [...axes].sort((a, b) => a.score - b.score).slice(0, count).map((a) => a.id);
}
