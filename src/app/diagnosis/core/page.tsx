"use client";

import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase, waitForStudentId } from "@/lib/supabase";
import CompetencyCompass from "@/components/CompetencyCompass";
import { CORE_MAX, toSixAxes } from "@/lib/competencies";

const CATEGORIES = [
  { key: "spiritual", label: "영성역량" },
  { key: "reflection", label: "기독교적 성찰역량" },
  { key: "empathy", label: "공감소통역량" },
  { key: "glocal", label: "글로컬역량" },
  { key: "creative", label: "창의융합역량" },
] as const;

const QUESTIONS: { categoryIndex: number; text: string }[] = [
  // 영성역량 (0-4)
  { categoryIndex: 0, text: "나는 개인 기도나 묵상 등 경건훈련을 규칙적으로 실천하고 있다" },
  { categoryIndex: 0, text: "나는 신앙생활이 일상 속 선택과 행동에 실제로 영향을 준다고 느낀다" },
  { categoryIndex: 0, text: "나는 신앙적 어려움이나 좌절의 상황에서도 신앙을 유지하려 노력한다" },
  { categoryIndex: 0, text: "나는 공동체 안에서 신앙을 나누고 함께 성장하는 것이 중요하다고 생각한다" },
  { categoryIndex: 0, text: "나는 신앙적 결단이 삶의 태도와 습관으로 이어지도록 노력한다" },
  // 기독교적 성찰역량 (5-9)
  { categoryIndex: 1, text: "나는 신앙의 관점에서 학습 내용이나 사회 현상을 해석하려고 한다" },
  { categoryIndex: 1, text: "나는 성경적 가치가 현대 사회 문제에 어떻게 적용될 수 있는지 고민한다" },
  { categoryIndex: 1, text: "나는 신앙과 전공 학문 사이의 관계를 비판적으로 성찰하려 노력한다" },
  { categoryIndex: 1, text: "나는 다양한 관점을 접할 때 신앙적으로 의미를 분별하려 한다" },
  { categoryIndex: 1, text: "나는 신앙을 바탕으로 자신의 생각과 판단을 점검한다" },
  // 공감소통역량 (10-14)
  { categoryIndex: 2, text: "나는 다른 사람의 입장을 이해하고 공감하려 노력한다" },
  { categoryIndex: 2, text: "나는 팀 활동이나 공동 과제에서 협력적으로 참여한다" },
  { categoryIndex: 2, text: "나는 의견이 다를 때에도 상대를 존중하며 소통하려 한다" },
  { categoryIndex: 2, text: "나는 갈등 상황에서 대화를 통해 문제를 해결하려 노력한다" },
  { categoryIndex: 2, text: "나는 공동체 안에서 신뢰 관계를 형성하는 데 적극적이다" },
  // 글로컬역량 (15-19)
  { categoryIndex: 3, text: "나는 문화적 배경이 다른 사람과 함께 활동하거나 협력한 경험이 있다" },
  { categoryIndex: 3, text: "나는 다문화 또는 사회적 이슈를 접할 때 나의 편견을 점검하려 한다" },
  { categoryIndex: 3, text: "나는 지역사회 문제 해결을 위한 활동(봉사, 프로젝트 등)에 참여해 본 적이 있다" },
  { categoryIndex: 3, text: "나는 공동체와 사회에 기여하는 일을 나의 책임으로 인식한다" },
  { categoryIndex: 3, text: "나는 신앙이 지역사회 섬김과 사회적 책임 실천으로 이어져야 한다고 생각한다" },
  // 창의융합역량 (20-24)
  { categoryIndex: 4, text: "나는 여러 분야의 지식을 연결하여 문제를 이해하려 노력한다" },
  { categoryIndex: 4, text: "나는 새로운 아이디어를 기존의 지식이나 경험과 결합해 보려 한다" },
  { categoryIndex: 4, text: "나는 복잡한 문제를 다양한 관점에서 분석하려 한다" },
  { categoryIndex: 4, text: "나는 배운 내용을 실제 상황에 적용하려 노력한다" },
  { categoryIndex: 4, text: "나는 새로운 상황에서도 유연하게 사고하며 해결 방안을 찾으려 한다" },
];

const LIKERT_LABELS = [
  "전혀 그렇지 않다",
  "그렇지 않다",
  "보통이다",
  "그렇다",
  "매우 그렇다",
];

/**
 * core_competencies.id 기준 피드백.
 * 기존 문장을 그대로 옮기되, 진단이 한 묶음으로 재던 창의융합만
 * 창의수행(3)·융합사고(4) 둘로 쪼갰다.
 */
const FEEDBACK_LOW_COMPETENCY: Record<number, string> = {
  1: "부족한 영성역량을 위해서 영성 태그가 붙은 비교과프로그램을 들어주세요!",
  2: "기독교적 성찰역량이 부족하군요. 기독교적 성찰역량 태그가 붙은 비교과프로그램을 들어주세요!",
  3: "창의수행역량이 부족하군요. 창의수행역량 태그가 붙은 비교과 프로그램을 추천합니다.",
  4: "융합사고역량이 부족하군요. 융합사고역량 태그가 붙은 비교과 프로그램을 추천합니다.",
  5: "부족한 공감소통역량을 위해 공감소통역량 태그가 붙은 비교과프로그램을 들어주세요.",
  6: "글로컬 역량이 부족하니 글로컬 역량 태그가 붙은 비교과 프로그램을 추천합니다.",
};

const TOTAL_FEEDBACK =
  "교수학습지원센터의 상담을 통해 핵심 역량을 올려볼까요? 교수학습지원센터로 상담을 신청하세요!";

const TOTAL_SCORE_THRESHOLD = 75;

const initialAnswers = () => Array(QUESTIONS.length).fill(null) as (number | null)[];

type DiagnosisRow = {
  scores: { spiritual?: number; reflection?: number; empathy?: number; glocal?: number; creative?: number };
  total_score?: number;
};

export default function CoreDiagnosisPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<(number | null)[]>(initialAnswers);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  /** 결과 화면에 사용할 역량별 점수(길이 5). 제출 후 또는 DB 로드 시 설정 */
  const [resultScores, setResultScores] = useState<number[] | null>(null);

  useEffect(() => {
    (async () => {
      // 세션 복원 전에 포기하면 이미 진단한 학생에게도 설문이 다시 뜬다
      const studentId = await waitForStudentId();
      if (!studentId) {
        setIsLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("diagnosis_results")
        .select("scores, total_score")
        .eq("student_id", studentId)
        .eq("diagnosis_type", "core")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<DiagnosisRow>();

      setIsLoading(false);
      if (error || !data?.scores) return;

      const s = data.scores;
      const arr = [
        s.spiritual ?? 0,
        s.reflection ?? 0,
        s.empathy ?? 0,
        s.glocal ?? 0,
        s.creative ?? 0,
      ];
      setResultScores(arr);
      setIsSubmitted(true);
    })();
  }, []);

  const allAnswered = useMemo(
    () => answers.every((a) => a !== null && a >= 1 && a <= 5),
    [answers]
  );

  const updateAnswer = (index: number, value: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const categoryScores = useMemo(() => {
    const scores: number[] = [0, 0, 0, 0, 0];
    QUESTIONS.forEach((q, i) => {
      const v = answers[i];
      if (v !== null && v >= 1 && v <= 5) {
        scores[q.categoryIndex] += v;
      }
    });
    return scores;
  }, [answers]);

  /** 결과 화면용 점수: DB/제출에서 온 resultScores 우선, 없으면 현재 설문 점수 */
  const displayScores = useMemo(
    () => resultScores ?? categoryScores,
    [resultScores, categoryScores]
  );
  const displayTotalScore = useMemo(
    () => displayScores.reduce((a, b) => a + b, 0),
    [displayScores]
  );
  /**
   * 진단은 5개 카테고리로 재지만 학교 정식 역량은 6개다.
   * 화면에서는 6축으로 펼친다 (창의수행·융합사고는 같은 점수).
   */
  const displaySixAxes = useMemo(() => {
    const byKey: Record<string, number> = {};
    CATEGORIES.forEach((cat, i) => { byKey[cat.key] = displayScores[i]; });
    return toSixAxes(byKey) ?? [];
  }, [displayScores]);

  const displayLitCount = useMemo(
    () => displaySixAxes.filter((a) => a.lit).length,
    [displaySixAxes],
  );

  /** 가장 낮은 역량(동점이면 모두) */
  const displayLowest = useMemo(() => {
    if (displaySixAxes.length === 0) return [];
    const min = Math.min(...displaySixAxes.map((a) => a.score));
    return displaySixAxes.filter((a) => a.score === min);
  }, [displaySixAxes]);
  const displayShowTotalFeedback = displayTotalScore <= TOTAL_SCORE_THRESHOLD;

  const handleReset = () => {
    setIsSubmitted(false);
    setAnswers(initialAnswers());
    setResultScores(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!allAnswered) return;

    const studentId = await getCurrentStudentId();
    if (!studentId || studentId.trim() === "") {
      alert("로그인이 필요합니다");
      router.push("/login");
      return;
    }

    const scoresArr: number[] = [0, 0, 0, 0, 0];
    QUESTIONS.forEach((q, i) => {
      const v = answers[i];
      if (v !== null && v >= 1 && v <= 5) {
        scoresArr[q.categoryIndex] += v;
      }
    });
    const total = scoresArr.reduce((a, b) => a + b, 0);
    const scores: Record<string, number> = {
      spiritual: scoresArr[0],
      reflection: scoresArr[1],
      empathy: scoresArr[2],
      glocal: scoresArr[3],
      creative: scoresArr[4],
    };

    setIsSubmitting(true);
    const { error } = await supabase.from("diagnosis_results").insert({
      student_id: studentId.trim(),
      diagnosis_type: "core",
      total_score: total,
      scores,
    });

    setIsSubmitting(false);
    if (error) {
      alert("결과 저장 실패: " + (error.message ?? "알 수 없는 오류"));
      return;
    }

    // 문항별 응답 저장 (assessment_responses)
    const { data: coreQs } = await supabase.from("assessment_questions").select("id, question_order").eq("competency_type", "core_diagnosis").eq("is_active", true).order("question_order");
    if (coreQs && coreQs.length === QUESTIONS.length) {
      const rows = coreQs.map((q: any, i: number) => ({
        student_id: studentId.trim(), question_id: q.id, answer_value: answers[i] ?? 0, answered_at: new Date().toISOString(),
      }));
      await supabase.from("assessment_responses").upsert(rows, { onConflict: "student_id,question_id" }).select();
    }

    // 마일리지 5점 (최초 1회만)
    const { data: existMile } = await supabase.from("mileage_records").select("id").eq("student_id", studentId.trim()).eq("reason", "핵심역량진단 완료").maybeSingle();
    if (!existMile) await supabase.from("mileage_records").insert({ student_id: studentId.trim(), points: 5, reason: "핵심역량진단 완료", source_type: "manual" });
    setResultScores(scoresArr);
    setIsSubmitted(true);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">로딩 중...</p>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-ys-paper">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-ys-ink-soft transition hover:text-ys-ink"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">대시보드</span>
            </Link>
            <Image
              src="/logo.png"
              alt="YOUNG SHINY"
              width={212}
              height={40}
              className="h-7 w-auto"
            />
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          {/* 결과 요약 — 나침반이 켜지는 순간 */}
          <section className="overflow-hidden rounded-2xl bg-ys-navy">
            <div className="flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-center lg:gap-10">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-ys-gold">
                  핵심역량진단 결과
                </p>
                <h1 className="font-display mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
                  <span className="text-ys-gold">{displayLitCount}개 방향</span>에
                  <br />
                  빛이 닿았습니다
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-ys-mist">
                  여섯 방향 중 {displayLitCount}개가 기준({Math.round(CORE_MAX * 0.8)}점)을 넘었습니다.
                  <br />
                  어두운 방향은 부족한 것이 아니라 아직 빛이 닿지 않은 곳입니다.
                </p>

                <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
                  <div>
                    <p className="text-[11px] text-ys-mist">총점</p>
                    <p className="font-data mt-0.5 text-2xl font-medium text-white">
                      {displayTotalScore}
                      <span className="ml-1 text-xs text-ys-mist">/ {CORE_MAX * CATEGORIES.length}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ys-mist">빛이 닿은 방향</p>
                    <p className="font-data mt-0.5 text-2xl font-medium text-ys-gold">
                      {displayLitCount}
                      <span className="ml-1 text-xs text-ys-mist">/ {displaySixAxes.length}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 justify-center lg:w-[420px]">
                <CompetencyCompass
                  axes={displaySixAxes.map((a) => ({ label: a.short, score: a.score }))}
                  max={CORE_MAX}
                  className="ys-bloom h-auto w-full max-w-[380px]"
                />
              </div>
            </div>
          </section>

          {/* 역량별 점수 */}
          <section className="mt-8">
            <h2 className="font-display mb-4 text-base font-bold text-ys-ink">역량별 점수</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {displaySixAxes.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: a.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-ys-ink">{a.name}</span>
                  <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className={`block h-full rounded-full ${a.lit ? "bg-ys-gold" : "bg-ys-blue/50"}`}
                      style={{ width: `${Math.round((a.score / CORE_MAX) * 100)}%` }}
                    />
                  </span>
                  <span className="font-data w-12 shrink-0 text-right text-sm text-ys-ink">
                    {a.score}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] text-ys-ink-soft">
              창의수행역량과 융합사고역량은 하나의 문항 묶음으로 측정되어 같은 점수로 표시됩니다.
            </p>
          </section>

          {/* 분석 결과 및 추천 */}
          <section className="mt-10">
            <h2 className="font-display mb-4 text-base font-bold text-ys-ink">
              다음으로 채워볼 방향
            </h2>
            <div className="flex flex-col gap-3">
              {displayLowest.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {displayLowest.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-xl border border-ys-blue/20 bg-ys-blue/5 px-4 py-3 text-sm text-ys-ink"
                    >
                      {FEEDBACK_LOW_COMPETENCY[a.id]}
                    </li>
                  ))}
                </ul>
              )}
              {displayShowTotalFeedback && (
                <div className="rounded-xl border border-ys-gold/40 bg-ys-gold/10 px-4 py-4 text-sm font-medium text-ys-ink">
                  {TOTAL_FEEDBACK}
                </div>
              )}
              {displayLowest.length === 0 && !displayShowTotalFeedback && (
                <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-ys-ink-soft">
                  전반적으로 역량이 잘 발달되어 있습니다. 비교과 프로그램을 통해 더 성장해 보세요.
                </p>
              )}
            </div>
          </section>

          <div className="mt-10 flex flex-col gap-4 border-t border-slate-200 pt-8 sm:flex-row">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-ys-ink transition hover:bg-slate-50"
            >
              다시 진단하기
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-ys-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ys-blue/90"
            >
              대시보드로 돌아가기
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ys-paper">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-ys-ink-soft transition hover:text-ys-ink"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-medium">대시보드</span>
          </Link>
          <Image
            src="/logo.png"
            alt="YOUNG SHINY"
            width={212}
            height={40}
            className="h-7 w-auto"
          />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          핵심역량진단
        </h1>
        <p className="mt-1 text-slate-600">
          각 문항에 대해 1(전혀 그렇지 않다) ~ 5(매우 그렇다) 중 하나를 선택해 주세요.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-8"
        >
          {QUESTIONS.map((q, index) => (
            <section
              key={index}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
            >
              <p className="mb-4 text-sm font-medium text-slate-900">
                {index + 1}. {q.text}
              </p>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center justify-center rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition sm:min-w-[4rem] ${
                      answers[index] === value
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${index}`}
                      value={value}
                      checked={answers[index] === value}
                      onChange={() => updateAnswer(index, value)}
                      className="sr-only"
                    />
                    <span className="tabular-nums">{value}</span>
                    <span className="ml-1 hidden text-xs sm:inline">
                      ({LIKERT_LABELS[value - 1]})
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500 sm:hidden">
                1: 전혀 그렇지 않다 → 5: 매우 그렇다
              </p>
            </section>
          ))}

          <div className="flex flex-col items-center gap-4 pb-12">
            {!allAnswered && (
              <p className="text-sm text-slate-500">
                모든 문항에 응답하면 결과를 볼 수 있습니다.
              </p>
            )}
            <button
              type="submit"
              disabled={!allAnswered || isSubmitting}
              className="w-full max-w-xs rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:w-auto"
            >
              {isSubmitting ? "저장 중..." : "제출하기"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
