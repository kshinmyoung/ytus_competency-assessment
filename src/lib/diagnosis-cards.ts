/**
 * 학생에게 보여 줄 역량진단 목록.
 *
 * 화면마다 카드를 하드코딩해 두면 관리자가 진단을 새로 올려도 목록에 끼지 못한다.
 * (2026년도 사후 학습자 역량진단이 그래서 뒤로 밀려 있었다)
 * 여기서 diagnosis_types 를 sort_order 대로 읽어 양쪽 화면이 같은 순서를 쓴다.
 * 순서를 바꾸려면 관리자 화면의 진단 유형 편집에서 '정렬 순서'만 고치면 된다.
 */
import { supabase } from "@/lib/supabase";

/** 전용 화면이 따로 있는 진단. 이 네 가지는 문항이 없어도 목록에 남긴다. */
const BUILTIN_HREF: Record<string, string> = {
  core_diagnosis: "/diagnosis/core",
  learning_diagnosis: "/diagnosis/learning",
  calling_diagnosis: "/diagnosis/calling",
  major_competency_diagnosis: "/diagnosis/major",
};

export const BUILTIN_KEYS = Object.keys(BUILTIN_HREF);

export type DiagnosisCard = {
  key: string;
  label: string;
  description: string | null;
  color: string;
  href: string;
  isBuiltin: boolean;
};

export async function loadDiagnosisCards(): Promise<DiagnosisCard[]> {
  const [typeRes, qRes] = await Promise.all([
    supabase.from("diagnosis_types").select("key, label, description, color").eq("is_active", true).order("sort_order"),
    supabase.from("assessment_questions").select("competency_type").eq("is_active", true),
  ]);

  // 문항이 하나도 없는 커스텀 진단은 눌러도 빈 화면이라 내보내지 않는다
  const withQuestions = new Set((qRes.data ?? []).map((q) => q.competency_type as string));

  return (typeRes.data ?? [])
    .filter((t) => BUILTIN_KEYS.includes(t.key) || withQuestions.has(t.key))
    .map((t) => ({
      key: t.key,
      label: t.label,
      description: t.description,
      color: t.color,
      href: BUILTIN_HREF[t.key] ?? "/diagnosis/custom",
      isBuiltin: BUILTIN_KEYS.includes(t.key),
    }));
}
