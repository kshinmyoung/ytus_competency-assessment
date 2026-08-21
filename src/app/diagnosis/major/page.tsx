"use client";

import { ArrowLeft, CheckCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

type Question = {
  id: number;
  competency_type: string;
  competency_id: number;
  question_text: string;
  question_order: number;
  department_id: number | null;
};
type Option = {
  id: number;
  question_id: number;
  option_text: string;
  option_value: number;
  option_order: number;
};
type Subcategory = {
  id: number;
  diagnosis_type_key: string;
  name: string;
  sort_order: number;
  department_id: number | null;
};

export default function MajorDiagnosisPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [optionsMap, setOptionsMap] = useState<Map<number, Option[]>>(new Map());
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [studentId, setStudentId] = useState("");
  const [deptName, setDeptName] = useState("");

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid?.trim()) { router.push("/login"); return; }
      setStudentId(sid.trim());

      // 학생 학과 확인
      const { data: student } = await supabase.from("students").select("department_id").eq("student_id", sid.trim()).maybeSingle();
      const myDeptId = student?.department_id;

      if (!myDeptId) {
        setIsLoading(false);
        return;
      }

      // 학과명
      const { data: dept } = await supabase.from("departments").select("name").eq("id", myDeptId).maybeSingle();
      setDeptName(dept?.name ?? "");

      // 전공역량진단 문항 (내 학과만)
      const [qRes, optRes, subRes] = await Promise.all([
        supabase.from("assessment_questions")
          .select("*")
          .eq("is_active", true)
          .eq("competency_type", "major_competency_diagnosis")
          .eq("department_id", myDeptId)
          .order("competency_id")
          .order("question_order"),
        supabase.from("assessment_options").select("*").order("option_order"),
        supabase.from("diagnosis_subcategories")
          .select("*")
          .eq("diagnosis_type_key", "major_competency_diagnosis")
          .eq("department_id", myDeptId)
          .order("sort_order"),
      ]);

      setQuestions(qRes.data ?? []);
      setSubcategories(subRes.data ?? []);

      const map = new Map<number, Option[]>();
      (optRes.data ?? []).forEach((o: Option) => {
        const arr = map.get(o.question_id) ?? [];
        arr.push(o);
        map.set(o.question_id, arr);
      });
      setOptionsMap(map);
      setIsLoading(false);
    })();
  }, [router]);

  const allAnswered = useMemo(
    () => questions.length > 0 && questions.every((q) => answers[q.id] !== undefined),
    [questions, answers]
  );

  // 카테고리별 그룹핑
  const grouped = useMemo(() => {
    const groups: { sub: Subcategory; questions: Question[] }[] = [];
    subcategories.forEach((sub) => {
      const qs = questions.filter((q) => q.competency_id === sub.sort_order);
      groups.push({ sub, questions: qs });
    });
    return groups;
  }, [subcategories, questions]);

  const handleSubmit = async () => {
    if (!allAnswered || !studentId) return;
    setIsSubmitting(true);

    const { data: session } = await supabase
      .from("assessment_sessions")
      .insert({ student_id: studentId, started_at: new Date().toISOString() })
      .select("id")
      .single();

    if (!session) { alert("세션 생성 실패"); setIsSubmitting(false); return; }

    const responseRows = questions.map((q) => {
      const val = answers[q.id];
      const opts = optionsMap.get(q.id) ?? [];
      const matched = opts.find((o) => o.option_value === val);
      return {
        student_id: studentId,
        question_id: q.id,
        option_id: matched?.id ?? null,
        answer_value: val,
        answered_at: new Date().toISOString(),
      };
    });

    await supabase.from("assessment_responses").insert(responseRows);

    // 카테고리별 점수 계산
    const scores: Record<string, number> = {};
    grouped.forEach((g) => {
      const total = g.questions.reduce((sum, q) => sum + (answers[q.id] ?? 0), 0);
      scores[g.sub.name] = total;
    });

    await supabase.from("assessment_sessions").update({
      completed_at: new Date().toISOString(),
      competency_scores: scores,
    }).eq("id", session.id);

    const { data: existMile } = await supabase.from("mileage_records").select("id").eq("student_id", studentId).eq("reason", "전공역량진단 완료").maybeSingle();
    if (!existMile) await supabase.from("mileage_records").insert({ student_id: studentId, points: 5, reason: "전공역량진단 완료", source_type: "manual" });
    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="text-slate-500">로딩 중...</p></div>;
  }

  if (!deptName) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/diagnosis" className="flex items-center gap-2 text-slate-600 hover:text-slate-900"><ArrowLeft className="h-5 w-5" /><span className="text-sm font-medium">돌아가기</span></Link>
            <Image src="/logo.png" alt="YOUNG SHINY" width={212} height={40} className="h-7 w-auto" />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <p className="text-lg text-slate-500">학과가 설정되지 않았습니다. 관리자에게 문의하세요.</p>
          <Link href="/diagnosis" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">돌아가기</Link>
        </main>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/diagnosis" className="flex items-center gap-2 text-slate-600 hover:text-slate-900"><ArrowLeft className="h-5 w-5" /><span className="text-sm font-medium">돌아가기</span></Link>
            <Image src="/logo.png" alt="YOUNG SHINY" width={212} height={40} className="h-7 w-auto" />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <p className="text-lg text-slate-500">{deptName} 전공역량진단 문항이 아직 등록되지 않았습니다.</p>
          <Link href="/diagnosis" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">돌아가기</Link>
        </main>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/diagnosis" className="flex items-center gap-2 text-slate-600 hover:text-slate-900"><ArrowLeft className="h-5 w-5" /><span className="text-sm font-medium">돌아가기</span></Link>
            <Image src="/logo.png" alt="YOUNG SHINY" width={212} height={40} className="h-7 w-auto" />
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">{deptName} 전공역량진단 완료!</h1>
          <p className="mt-2 text-slate-600">응답이 저장되었습니다.</p>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/diagnosis" className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">역량진단 목록</Link>
            <Link href="/dashboard" className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">대시보드</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/diagnosis" className="flex items-center gap-2 text-slate-600 hover:text-slate-900"><ArrowLeft className="h-5 w-5" /><span className="text-sm font-medium">돌아가기</span></Link>
          <Image src="/logo.png" alt="YOUNG SHINY" width={212} height={40} className="h-7 w-auto" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{deptName} 전공역량진단</h1>
        <p className="mt-1 text-slate-600">각 문항에 대해 가장 적합한 보기를 선택해 주세요.</p>

        <div className="mt-8 space-y-10">
          {grouped.map((g) => (
            <div key={g.sub.id}>
              <h2 className="mb-4 rounded-lg bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-800">
                {g.sub.name}
              </h2>
              {g.questions.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">문항이 없습니다.</p>
              ) : (
                <div className="space-y-6">
                  {g.questions.map((q) => {
                    const opts = optionsMap.get(q.id) ?? [];
                    return (
                      <section key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                        <p className="mb-4 text-sm font-medium text-slate-900">
                          {q.question_order}. {q.question_text}
                        </p>
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                          {opts.map((opt) => (
                            <label key={opt.id}
                              className={`flex cursor-pointer items-center justify-center rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition sm:min-w-[4rem] ${
                                answers[q.id] === opt.option_value
                                  ? "border-orange-600 bg-orange-600 text-white"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50/50"
                              }`}
                            >
                              <input type="radio" name={`q-${q.id}`} value={opt.option_value}
                                checked={answers[q.id] === opt.option_value}
                                onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.option_value }))}
                                className="sr-only" />
                              <span className="tabular-nums">{opt.option_value}</span>
                              <span className="ml-1 hidden text-xs sm:inline">({opt.option_text})</span>
                            </label>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 pb-12">
          {!allAnswered && <p className="text-sm text-slate-500">모든 문항에 응답하면 제출할 수 있습니다.</p>}
          <button type="button" onClick={handleSubmit} disabled={!allAnswered || isSubmitting}
            className="w-full max-w-xs rounded-full bg-orange-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:w-auto">
            {isSubmitting ? "저장 중..." : "제출하기"}
          </button>
        </div>
      </main>
    </div>
  );
}
