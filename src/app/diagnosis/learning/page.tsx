"use client";

import { AlertTriangle, ArrowLeft, Sprout, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const CATEGORIES = [
  { key: "launch", label: "Launch (회복탄력성)" },
  { key: "explore", label: "Explore (DX 역량)" },
  { key: "act", label: "Act (상호작용)" },
  { key: "refine", label: "Refine (메타인지)" },
  { key: "network", label: "Network (공동체)" },
] as const;

const QUESTIONS: { categoryIndex: number; text: string }[] = [
  { categoryIndex: 0, text: "학습 과정에서 예상치 못한 어려움이 닥쳐도 이를 극복하고 끝까지 학업을 완수할 의지가 있다." },
  { categoryIndex: 0, text: "전공 학습을 통해 기독교 지도자로서의 전문성을 갖추는 것이 나의 비전 달성에 중요하다고 믿는다." },
  { categoryIndex: 1, text: "생성형 AI 등 최신 에듀테크 도구를 탐색하고 학습에 효과적으로 활용하는 데 능숙하다." },
  { categoryIndex: 1, text: "온라인상의 다양한 정보를 비판적으로 분석하여 나에게 필요한 학습 자원을 선별하고 활용한다." },
  { categoryIndex: 2, text: "교수자 및 동료와 유기적으로 소통하며, 배운 내용을 실제 현장이나 사례에 적용해볼 의지가 있다." },
  { categoryIndex: 2, text: "협력적 학습 활동(토론, 팀플 등)에 능동적으로 참여하여 동료와 함께 공동의 목표를 달성하고자 한다." },
  { categoryIndex: 3, text: "교수자의 피드백을 수용하여 나의 학습 수준을 한 단계 더 깊이 있게 심화(Refining)시키고자 한다." },
  { categoryIndex: 3, text: "학습 과정에서 나의 부족한 점을 점검하고 자신의 성취 수준을 스스로 객관화하여 검증할 수 있다." },
  { categoryIndex: 4, text: "내가 습득한 지식과 학습 노하우를 학습 공동체 구성원들과 기꺼이 공유하고 협력하고자 한다." },
  { categoryIndex: 4, text: "본 수업(프로그램)을 주변 동료에게 참여를 적극 추천할 생각이 있다." },
];

const LIKERT_LABELS = [
  "전혀 그렇지 않다",
  "그렇지 않다",
  "보통이다",
  "그렇다",
  "매우 그렇다",
];

const CATEGORY_WEAK_FEEDBACK: Record<number, string> = {
  0: "회복탄력성 고취형: [BOOST] 상담 추천",
  1: "DX 역량 강화형: [AWAKE] 특강 추천",
  2: "상호작용 촉진형: [SYNERGY] 튜터링 추천",
  3: "메타인지 전략형: [BOOST] 학습 코칭 추천",
  4: "공동체 가치 공유형: 사례 공모전 도전 추천",
};

const CATEGORY_WEAK_THRESHOLD = 6;
const TOTAL_MAX = 50;

function getTotalFeedback(total: number): { icon: React.ReactNode; status: string; message: string } {
  if (total < 25) {
    return {
      icon: <AlertTriangle className="h-6 w-6 text-red-500" />,
      status: "전반적 학습 에너지 고갈",
      message: "[Boost:돋움] 1:1 집중 클리닉 추천",
    };
  }
  if (total <= 35) {
    return {
      icon: <Sprout className="h-6 w-6 text-green-600" />,
      status: "보편적 학습역량 보유",
      message: "[Awake: 깨움]과 [Synergy: 이음] 프로그램 추천",
    };
  }
  return {
    icon: <Trophy className="h-6 w-6 text-amber-500" />,
    status: "자기주도 우수군",
    message: "[Synergy: 이음] 튜터/리더 선발 및 장학금 혜택",
  };
}

const initialAnswers = () => Array(QUESTIONS.length).fill(null) as (number | null)[];

type DiagnosisRow = {
  scores?: {
    launch?: number;
    explore?: number;
    act?: number;
    refine?: number;
    network?: number;
  };
  total_score?: number;
};

export default function LearningDiagnosisPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<(number | null)[]>(initialAnswers);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [resultScores, setResultScores] = useState<number[] | null>(null);

  useEffect(() => {
    (async () => {
      const studentId = await getCurrentStudentId();
      if (!studentId || studentId.trim() === "") {
        setIsLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("diagnosis_results")
        .select("scores, total_score")
        .eq("student_id", studentId.trim())
        .eq("diagnosis_type", "learning")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<DiagnosisRow>();

      setIsLoading(false);
      if (error || !data?.scores) return;

      const s = data.scores;
      const arr = [
        s.launch ?? 0,
        s.explore ?? 0,
        s.act ?? 0,
        s.refine ?? 0,
        s.network ?? 0,
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

  const displayScores = useMemo(
    () => resultScores ?? categoryScores,
    [resultScores, categoryScores]
  );
  const displayTotalScore = useMemo(
    () => displayScores.reduce((a, b) => a + b, 0),
    [displayScores]
  );
  const displayRadarData = useMemo(
    () =>
      CATEGORIES.map((cat, i) => ({
        subject: cat.label,
        value: displayScores[i],
        fullMark: 10,
      })),
    [displayScores]
  );
  const displayWeakCategoryIndices = useMemo(
    () =>
      displayScores
        .map((score, i) => (score < CATEGORY_WEAK_THRESHOLD ? i : -1))
        .filter((i) => i >= 0),
    [displayScores]
  );
  const totalFeedback = useMemo(
    () => getTotalFeedback(displayTotalScore),
    [displayTotalScore]
  );

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
      launch: scoresArr[0],
      explore: scoresArr[1],
      act: scoresArr[2],
      refine: scoresArr[3],
      network: scoresArr[4],
    };

    setIsSubmitting(true);
    const { error } = await supabase.from("diagnosis_results").insert({
      student_id: studentId.trim(),
      diagnosis_type: "learning",
      total_score: total,
      scores,
    });

    setIsSubmitting(false);
    if (error) {
      alert("결과 저장 실패: " + (error.message ?? "알 수 없는 오류"));
      return;
    }
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
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">대시보드</span>
            </Link>
            <Image
              src="/logo.png"
              alt="YOUNG SHINY"
              width={120}
              height={28}
              className="h-7 w-auto"
            />
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            학습역량진단 결과
          </h1>
          <p className="mt-1 text-slate-600">
            LEARN 5가지 역량별 점수(각 10점 만점, 총 50점 만점)입니다.
          </p>

          <section className="mt-8">
            <h2 className="mb-4 text-base font-semibold text-slate-800">
              나의 역량 그래프
            </h2>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="h-[280px] w-full sm:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    data={displayRadarData}
                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                  >
                    <PolarGrid stroke="#cbd5e1" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 10]}
                      tick={{ fontSize: 10 }}
                    />
                    <Radar
                      name="점수"
                      dataKey="value"
                      stroke="#1e40af"
                      fill="#2563eb"
                      fillOpacity={0.5}
                      strokeWidth={2}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                      }}
                      formatter={(value: any) => [`${value}점`, "점수"]}
                      labelFormatter={(label) => label}
                    />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="mb-4 text-base font-semibold text-slate-800">
              종합 점수 진단
            </h2>
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex-shrink-0">{totalFeedback.icon}</div>
              <div>
                <p className="font-medium text-slate-900">{totalFeedback.status}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {totalFeedback.message}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  총점 {displayTotalScore}점 / {TOTAL_MAX}점
                </p>
              </div>
            </div>
          </section>

          {displayWeakCategoryIndices.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-4 text-base font-semibold text-slate-800">
                세부 역량 처방
              </h2>
              <ul className="space-y-2">
                {displayWeakCategoryIndices.map((idx) => (
                  <li
                    key={idx}
                    className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-slate-700"
                  >
                    {CATEGORY_WEAK_FEEDBACK[idx]}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-10 flex flex-col gap-4 border-t border-slate-200 pt-8 sm:flex-row">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              다시 진단하기
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              대시보드로 돌아가기
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-medium">대시보드</span>
          </Link>
          <Image
            src="/logo.png"
            alt="YOUNG SHINY"
            width={120}
            height={28}
            className="h-7 w-auto"
          />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          학습역량진단
        </h1>
        <p className="mt-1 text-slate-600">
          각 문항에 대해 1(전혀 그렇지 않다) ~ 5(매우 그렇다) 중 하나를 선택해 주세요.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-8">
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
