"use client";

import { ArrowLeft, CheckCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase, waitForStudentId } from "@/lib/supabase";

type Question = {
  id: number;
  competency_type: string;
  competency_id: number;
  question_text: string;
  question_order: number;
};

type Option = {
  id: number;
  question_id: number;
  option_text: string;
  option_value: number;
  option_order: number;
};

type CompetencyInfo = { id: number; name: string; type: string };

export default function CustomDiagnosisPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [optionsMap, setOptionsMap] = useState<Map<number, Option[]>>(new Map());
  const [competencies, setCompetencies] = useState<CompetencyInfo[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [studentId, setStudentId] = useState("");

  useEffect(() => {
    (async () => {
      const sid = await waitForStudentId();
      if (!sid?.trim()) {
        router.push("/login");
        return;
      }
      setStudentId(sid.trim());

      // 학생 학과 확인
      const { data: studentData } = await supabase.from("students").select("department_id").eq("student_id", sid.trim()).maybeSingle();
      const myDeptId = studentData?.department_id ?? null;

      const [qRes, optRes, coreRes, majorRes] = await Promise.all([
        supabase
          .from("assessment_questions")
          .select("*")
          .eq("is_active", true)
          .order("competency_type")
          .order("competency_id")
          .order("question_order"),
        supabase.from("assessment_options").select("*").order("option_order"),
        supabase.from("core_competencies").select("id, name"),
        supabase.from("major_competencies").select("id, name"),
      ]);

      // 기존 진단 유형과 전공역량진단 제외, 커스텀 유형만 표시
      const builtinTypes = ["core_diagnosis", "learning_diagnosis", "calling_diagnosis", "major_competency_diagnosis"];
      const filteredQ = (qRes.data ?? []).filter((q: any) =>
        !builtinTypes.includes(q.competency_type) &&
        (q.department_id === null || q.department_id === myDeptId)
      );
      setQuestions(filteredQ);

      const map = new Map<number, Option[]>();
      (optRes.data ?? []).forEach((o: Option) => {
        const existing = map.get(o.question_id) ?? [];
        existing.push(o);
        map.set(o.question_id, existing);
      });
      setOptionsMap(map);

      const comps: CompetencyInfo[] = [
        ...(coreRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name, type: "core" })),
        ...(majorRes.data ?? []).map((m: any) => ({ id: m.id, name: m.name, type: "major" })),
      ];
      setCompetencies(comps);

      setIsLoading(false);
    })();
  }, [router]);

  const compName = (type: string, id: number) => {
    return competencies.find((c) => c.type === type && c.id === id)?.name ?? "";
  };

  const allAnswered = useMemo(
    () => questions.length > 0 && questions.every((q) => answers[q.id] !== undefined),
    [questions, answers]
  );

  const handleSubmit = async () => {
    if (!allAnswered || !studentId) return;
    setIsSubmitting(true);

    // 세션 생성
    const { data: session } = await supabase
      .from("assessment_sessions")
      .insert({ student_id: studentId, started_at: new Date().toISOString() })
      .select("id")
      .single();

    if (!session) {
      alert("세션 생성 실패");
      setIsSubmitting(false);
      return;
    }

    // 응답 저장
    const responseRows = questions.map((q) => {
      const selectedValue = answers[q.id];
      const opts = optionsMap.get(q.id) ?? [];
      const matchedOpt = opts.find((o) => o.option_value === selectedValue);
      return {
        student_id: studentId,
        question_id: q.id,
        option_id: matchedOpt?.id ?? null,
        answer_value: selectedValue,
        answered_at: new Date().toISOString(),
      };
    });

    const { error: respError } = await supabase
      .from("assessment_responses")
      .insert(responseRows);

    if (respError) {
      alert("응답 저장 실패: " + respError.message);
      setIsSubmitting(false);
      return;
    }

    // 역량별 점수 계산
    const compScores: Record<string, number> = {};
    questions.forEach((q) => {
      const key = `${q.competency_type}_${q.competency_id}`;
      const name = compName(q.competency_type, q.competency_id);
      const label = name || key;
      compScores[label] = (compScores[label] ?? 0) + (answers[q.id] ?? 0);
    });

    // 세션 완료
    await supabase
      .from("assessment_sessions")
      .update({
        completed_at: new Date().toISOString(),
        competency_scores: compScores,
      })
      .eq("id", session.id);

    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ys-paper">
        <p className="text-ys-ink-soft">로딩 중...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-ys-paper">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/diagnosis" className="flex items-center gap-2 text-ys-ink-soft hover:text-ys-ink">
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">돌아가기</span>
            </Link>
            <Image src="/logo.png" alt="YOUNG SHINY" width={212} height={40} className="h-7 w-auto" />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <p className="text-lg text-ys-ink-soft">현재 등록된 추가 설문이 없습니다.</p>
          <Link href="/diagnosis" className="mt-4 inline-block text-sm font-medium text-ys-blue hover:underline">
            역량진단 목록으로 돌아가기
          </Link>
        </main>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-ys-paper">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/diagnosis" className="flex items-center gap-2 text-ys-ink-soft hover:text-ys-ink">
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">돌아가기</span>
            </Link>
            <Image src="/logo.png" alt="YOUNG SHINY" width={212} height={40} className="h-7 w-auto" />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <CheckCircle className="mx-auto h-16 w-16 text-ys-gold" />
          <h1 className="mt-4 text-2xl font-bold text-ys-ink">설문 완료!</h1>
          <p className="mt-2 text-ys-ink-soft">응답이 성공적으로 저장되었습니다.</p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/diagnosis"
              className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-ys-ink hover:bg-ys-paper"
            >
              역량진단 목록
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full bg-ys-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-ys-blue/90"
            >
              대시보드로 이동
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // 문항을 역량별로 그룹핑
  const grouped: { label: string; questions: Question[] }[] = [];
  let lastKey = "";
  questions.forEach((q) => {
    const key = `${q.competency_type}_${q.competency_id}`;
    const label = compName(q.competency_type, q.competency_id) || key;
    if (key !== lastKey) {
      grouped.push({ label, questions: [] });
      lastKey = key;
    }
    grouped[grouped.length - 1].questions.push(q);
  });

  return (
    <div className="min-h-screen bg-ys-paper">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/diagnosis" className="flex items-center gap-2 text-ys-ink-soft hover:text-ys-ink">
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-medium">돌아가기</span>
          </Link>
          <Image src="/logo.png" alt="YOUNG SHINY" width={212} height={40} className="h-7 w-auto" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-ys-ink sm:text-2xl">추가 역량진단</h1>
        <p className="mt-1 text-ys-ink-soft">각 문항에 대해 가장 적합한 보기를 선택해 주세요.</p>

        <div className="mt-8 space-y-10">
          {grouped.map((group, gi) => (
            <div key={gi}>
              <h2 className="mb-4 rounded-lg bg-ys-blue/10 px-4 py-2 text-sm font-semibold text-ys-blue">
                {group.label}
              </h2>
              <div className="space-y-6">
                {group.questions.map((q, qi) => {
                  const opts = optionsMap.get(q.id) ?? [];
                  return (
                    <section
                      key={q.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
                    >
                      <p className="mb-4 text-sm font-medium text-ys-ink">
                        {q.question_order}. {q.question_text}
                      </p>
                      <div className="flex flex-wrap gap-2 sm:gap-3">
                        {opts.map((opt) => (
                          <label
                            key={opt.id}
                            className={`flex cursor-pointer items-center justify-center rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition sm:min-w-[4rem] ${
                              answers[q.id] === opt.option_value
                                ? "border-blue-600 bg-ys-blue text-white"
                                : "border-slate-200 bg-white text-ys-ink hover:border-ys-blue/40 hover:bg-ys-blue/10/50"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              value={opt.option_value}
                              checked={answers[q.id] === opt.option_value}
                              onChange={() =>
                                setAnswers((prev) => ({ ...prev, [q.id]: opt.option_value }))
                              }
                              className="sr-only"
                            />
                            <span className="tabular-nums">{opt.option_value}</span>
                            <span className="ml-1 hidden text-xs sm:inline">
                              ({opt.option_text})
                            </span>
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 pb-12">
          {!allAnswered && (
            <p className="text-sm text-ys-ink-soft">
              모든 문항에 응답하면 제출할 수 있습니다.
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allAnswered || isSubmitting}
            className="w-full max-w-xs rounded-full bg-ys-blue px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-ys-blue/90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:w-auto"
          >
            {isSubmitting ? "저장 중..." : "제출하기"}
          </button>
        </div>
      </main>
    </div>
  );
}
