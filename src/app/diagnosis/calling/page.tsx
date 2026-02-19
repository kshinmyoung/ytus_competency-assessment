"use client";

import { ArrowLeft, Leaf, Sprout, Trees, Trophy } from "lucide-react";
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
  { key: "calling", label: "Calling" },
  { key: "awakening", label: "Awakening" },
  { key: "leading", label: "Leading" },
  { key: "launching", label: "Launching" },
  { key: "plus", label: "Plus" },
] as const;

const QUESTIONS: { categoryIndex: number; text: string }[] = [
  // Calling (0-3)
  { categoryIndex: 0, text: "나는 나의 삶의 목적과 의미를 명확히 알고 있다." },
  { categoryIndex: 0, text: "나는 하나님께서 나에게 주신 소명이 있다고 믿는다." },
  { categoryIndex: 0, text: "나는 내가 해야 할 일과 가야 할 길을 알고 있다." },
  { categoryIndex: 0, text: "나는 나의 소명이 다른 사람들에게 도움이 될 것이라고 생각한다." },
  // Awakening (4-7)
  { categoryIndex: 1, text: "나는 내 안에 있는 잠재력을 발견하고 있다." },
  { categoryIndex: 1, text: "나는 새로운 가능성과 기회를 찾아 나선다." },
  { categoryIndex: 1, text: "나는 변화와 성장을 두려워하지 않는다." },
  { categoryIndex: 1, text: "나는 내가 가진 재능과 능력을 인식하고 있다." },
  // Leading (8-11)
  { categoryIndex: 2, text: "나는 다른 사람들을 이끌고 영향력을 발휘할 수 있다." },
  { categoryIndex: 2, text: "나는 리더십을 발휘할 기회를 적극적으로 찾는다." },
  { categoryIndex: 2, text: "나는 팀이나 공동체에서 주도적인 역할을 맡는다." },
  { categoryIndex: 2, text: "나는 다른 사람들의 성장을 돕는 것을 즐긴다." },
  // Launching (12-15)
  { categoryIndex: 3, text: "나는 새로운 프로젝트나 사업을 시작하는 것을 좋아한다." },
  { categoryIndex: 3, text: "나는 실행력이 있고 계획을 실현하는 데 능숙하다." },
  { categoryIndex: 3, text: "나는 도전적인 목표를 세우고 달성하려 노력한다." },
  { categoryIndex: 3, text: "나는 실패를 두려워하지 않고 시도하는 용기가 있다." },
  // Plus (16-19)
  { categoryIndex: 4, text: "나는 다양한 경험과 학습을 통해 성장하려 노력한다." },
  { categoryIndex: 4, text: "나는 다른 사람들과 협력하며 함께 성장하는 것을 중요하게 생각한다." },
  { categoryIndex: 4, text: "나는 나의 소명을 실현하기 위해 지속적으로 노력한다." },
  { categoryIndex: 4, text: "나는 나의 삶이 세상에 긍정적인 변화를 가져올 수 있다고 믿는다." },
];

const LIKERT_LABELS = [
  "전혀 그렇지 않다",
  "그렇지 않다",
  "보통이다",
  "그렇다",
  "매우 그렇다",
];

const TYPE_FEEDBACK = {
  practical: {
    title: "실전 지향형",
    message:
      "나무는 아주 튼튼하게 잘 키우셨네요! 하지만 가끔 바람에 흔들릴 때가 있죠? 이제 뿌리(소명)를 더 깊게 내릴 때입니다...",
    recommendations: [
      "1:1 소명상담",
      "비전캠프",
      "선배 SOS",
      "현직자 특강",
    ],
  },
  vision: {
    title: "비전 탐구형",
    message:
      "예쁜 꽃을 심고 싶은 마음이 가득하시군요! 그 마음을 실현해 줄 '좋은 연장'들을 챙겨드릴게요...",
    recommendations: ["실무 워크숍", "실무 기초교육"],
  },
};

const GRADE_INFO = {
  high: {
    range: [90, 100],
    title: "열매맺는 정원사",
    subtitle: "최고의 정원사, 마을 숲 만들기",
    icon: Trophy,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  medium: {
    range: [80, 89],
    title: "무럭무럭 꿈나무 정원사",
    subtitle: "가능성 무궁무진, 비료 더하기",
    icon: Trees,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
  low: {
    range: [0, 79],
    title: "씨앗 품은 정원사",
    subtitle: "싹 틔울 준비, 따뜻한 햇볕과 물",
    icon: Sprout,
    color: "text-lime-600",
    bgColor: "bg-lime-50",
    borderColor: "border-lime-200",
  },
};

const CATEGORY_MAX = 20;
const TOTAL_MAX = 100;

const initialAnswers = () => Array(QUESTIONS.length).fill(null) as (number | null)[];

type DiagnosisRow = {
  scores?: {
    calling?: number;
    awakening?: number;
    leading?: number;
    launching?: number;
    plus?: number;
  };
  total_score?: number;
};

export default function CallingDiagnosisPage() {
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
        .eq("diagnosis_type", "calling")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<DiagnosisRow>();

      setIsLoading(false);
      if (error || !data?.scores) return;

      const s = data.scores;
      const arr = [
        s.calling ?? 0,
        s.awakening ?? 0,
        s.leading ?? 0,
        s.launching ?? 0,
        s.plus ?? 0,
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
        fullMark: CATEGORY_MAX,
      })),
    [displayScores]
  );

  const diagnosisType = useMemo(() => {
    const [c, a, l1, l2, p] = displayScores;
    const cap = c + a + p;
    const l1l2p = l1 + l2 + p;
    return cap < l1l2p ? "practical" : "vision";
  }, [displayScores]);

  const gradeInfo = useMemo(() => {
    const total = displayTotalScore;
    if (total >= 90) return GRADE_INFO.high;
    if (total >= 80) return GRADE_INFO.medium;
    return GRADE_INFO.low;
  }, [displayTotalScore]);

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
      calling: scoresArr[0],
      awakening: scoresArr[1],
      leading: scoresArr[2],
      launching: scoresArr[3],
      plus: scoresArr[4],
    };

    setIsSubmitting(true);
    const { error } = await supabase.from("diagnosis_results").insert({
      student_id: studentId.trim(),
      diagnosis_type: "calling",
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
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <p className="text-stone-500">로딩 중...</p>
      </div>
    );
  }

  if (isSubmitted) {
    const typeData = TYPE_FEEDBACK[diagnosisType];
    const GradeIcon = gradeInfo.icon;

    return (
      <div className="min-h-screen bg-stone-50">
        <header className="border-b border-stone-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-stone-600 hover:text-stone-900"
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
          <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">
            CALL+ 소명진단 결과
          </h1>
          <p className="mt-1 text-stone-600">
            5가지 역량별 점수(각 20점 만점, 총 100점 만점)입니다.
          </p>

          <section className="mt-8">
            <h2 className="mb-4 text-base font-semibold text-stone-800">
              나의 소명 역량 그래프
            </h2>
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="h-[320px] w-full sm:h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    data={displayRadarData}
                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                  >
                    <PolarGrid stroke="#d6d3d1" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, CATEGORY_MAX]}
                      tick={{ fontSize: 10 }}
                    />
                    <Radar
                      name="점수"
                      dataKey="value"
                      stroke="#16a34a"
                      fill="#22c55e"
                      fillOpacity={0.4}
                      strokeWidth={2}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #e7e5e4",
                      }}
                      formatter={(value: number) => [`${value}점`, "점수"]}
                      labelFormatter={(label) => label}
                    />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-stone-800">
                유형 분석
              </h2>
              <div className="space-y-3">
                <p className="text-sm font-medium text-stone-900">
                  {typeData.title}
                </p>
                <p className="text-sm leading-relaxed text-stone-600">
                  {typeData.message}
                </p>
                <div className="mt-4 space-y-1">
                  <p className="text-xs font-medium text-stone-500">
                    추천 프로그램:
                  </p>
                  <ul className="space-y-1">
                    {typeData.recommendations.map((rec, i) => (
                      <li
                        key={i}
                        className="text-xs text-stone-600 before:mr-1.5 before:text-green-600 before:content-['•']"
                      >
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section
              className={`rounded-2xl border-2 ${gradeInfo.borderColor} ${gradeInfo.bgColor} p-6 shadow-sm`}
            >
              <h2 className="mb-4 text-base font-semibold text-stone-800">
                종합 등급
              </h2>
              <div className="flex flex-col items-center justify-center space-y-3 py-4">
                <div className={`${gradeInfo.color}`}>
                  <GradeIcon className="h-16 w-16" />
                </div>
                <div className="text-center">
                  <p className={`text-lg font-bold ${gradeInfo.color}`}>
                    {gradeInfo.title}
                  </p>
                  <p className="mt-1 text-xs text-stone-600">
                    {gradeInfo.subtitle}
                  </p>
                  <p className="mt-2 text-sm font-medium text-stone-700">
                    총점 {displayTotalScore}점 / {TOTAL_MAX}점
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-10 flex flex-col gap-4 border-t border-stone-200 pt-8 sm:flex-row">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              다시 진단하기
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              대시보드로 돌아가기
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-stone-600 hover:text-stone-900"
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
        <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">
          CALL+ 소명진단
        </h1>
        <p className="mt-1 text-stone-600">
          각 문항에 대해 1(전혀 그렇지 않다) ~ 5(매우 그렇다) 중 하나를 선택해 주세요.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-8">
          {QUESTIONS.map((q, index) => (
            <section
              key={index}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6"
            >
              <p className="mb-4 text-sm font-medium text-stone-900">
                {index + 1}. {q.text}
              </p>
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center justify-center rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition sm:min-w-[4rem] ${
                      answers[index] === value
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-stone-200 bg-white text-stone-700 hover:border-green-300 hover:bg-green-50/50"
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
              <p className="mt-2 text-xs text-stone-500 sm:hidden">
                1: 전혀 그렇지 않다 → 5: 매우 그렇다
              </p>
            </section>
          ))}

          <div className="flex flex-col items-center gap-4 pb-12">
            {!allAnswered && (
              <p className="text-sm text-stone-500">
                모든 문항에 응답하면 결과를 볼 수 있습니다.
              </p>
            )}
            <button
              type="submit"
              disabled={!allAnswered || isSubmitting}
              className="w-full max-w-xs rounded-full bg-green-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none sm:w-auto"
            >
              {isSubmitting ? "저장 중..." : "제출하기"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
