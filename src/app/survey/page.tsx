"use client";

import { CheckCircle, ClipboardList } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import Navigation from "@/components/Navigation";

type Survey = { id: number; title: string; description: string | null; org_type: string; org_name: string; start_date: string | null; end_date: string | null };
type Question = { id: number; survey_id: number; question_text: string; question_type: string; options: any; question_order: number; is_required: boolean };

const ORG_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  교무처: { label: "교무처", color: "text-blue-700", bg: "bg-blue-50" },
  기획처: { label: "기획처", color: "text-indigo-700", bg: "bg-indigo-50" },
  사무처: { label: "사무처", color: "text-slate-700", bg: "bg-slate-100" },
  학생실천처: { label: "학생실천처", color: "text-green-700", bg: "bg-green-50" },
  교수학습지원센터: { label: "교수학습지원센터", color: "text-emerald-700", bg: "bg-emerald-50" },
  취창업진로지원센터: { label: "취창업진로지원센터", color: "text-blue-700", bg: "bg-blue-50" },
  학생생활상담센터: { label: "학생생활상담센터", color: "text-violet-700", bg: "bg-violet-50" },
};

const LIKERT = ["전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다"];

export default function SurveyPage() {
  const [studentId, setStudentId] = useState("");
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [filterOrg, setFilterOrg] = useState("all");

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid?.trim()) return;
      setStudentId(sid.trim());
      // 활성 설문 조회 (마감일이 아직 안 지났거나 마감일 없는 것)
      const { data: surveyData } = await supabase.from("surveys").select("*").eq("is_active", true).order("created_at", { ascending: false });
      // 마감일 체크는 한국시간 기준
      const koreaToday = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })).toISOString().split("T")[0];
      const activeSurveys = (surveyData ?? []).filter((s: any) => !s.end_date || s.end_date >= koreaToday);
      setSurveys(activeSurveys as Survey[]);
      const { data: respData } = await supabase.from("survey_responses").select("survey_id").eq("student_id", sid.trim());
      setCompletedIds(new Set((respData ?? []).map((r: any) => r.survey_id)));
    })();
  }, []);

  const grouped = useMemo(() => {
    const depts = surveys.filter((s) => s.org_type === "department");
    const centers = surveys.filter((s) => s.org_type === "center");
    if (filterOrg === "all") return { departments: depts, centers };
    return {
      departments: depts.filter((s) => s.org_name === filterOrg),
      centers: centers.filter((s) => s.org_name === filterOrg),
    };
  }, [surveys, filterOrg]);

  const orgNames = useMemo(() => [...new Set(surveys.map((s) => s.org_name))], [surveys]);

  const openSurvey = async (survey: Survey) => {
    setSelectedSurvey(survey);
    setSubmitted(false);
    setAnswers({});
    const { data } = await supabase.from("survey_questions").select("*").eq("survey_id", survey.id).order("question_order");
    setQuestions((data ?? []) as Question[]);
  };

  const allRequired = useMemo(() => {
    return questions.filter((q) => q.is_required).every((q) => answers[q.id] !== undefined && answers[q.id] !== "");
  }, [questions, answers]);

  const handleSubmit = async () => {
    if (!selectedSurvey || !studentId) return;
    setSubmitting(true);
    const { error } = await supabase.from("survey_responses").insert({
      survey_id: selectedSurvey.id,
      student_id: studentId,
      answers,
    });
    setSubmitting(false);
    if (error) { alert(error.message); return; }
    // 마일리지 5점
    const { data: existMile } = await supabase.from("mileage_records").select("id").eq("student_id", studentId).eq("reason", `설문 완료: ${selectedSurvey.title}`).maybeSingle();
    if (!existMile) await supabase.from("mileage_records").insert({ student_id: studentId, points: 5, reason: `설문 완료: ${selectedSurvey.title}`, source_type: "manual" });
    setCompletedIds((prev) => new Set([...prev, selectedSurvey.id]));
    setSubmitted(true);
  };

  const renderSurveyCard = (s: Survey) => {
    const done = completedIds.has(s.id);
    const org = ORG_LABELS[s.org_name] ?? { label: s.org_name, color: "text-slate-700", bg: "bg-slate-100" };
    return (
      <div key={s.id} className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${done ? "opacity-60" : ""}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${org.bg} ${org.color}`}>{org.label}</span>
              {done && <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">완료</span>}
            </div>
            <h3 className="mt-2 text-sm font-semibold text-slate-900">{s.title}</h3>
            {s.description && <p className="mt-1 text-xs text-slate-500">{s.description}</p>}
            {s.end_date && <p className="mt-1 text-[10px] text-slate-400">마감: {s.end_date}</p>}
          </div>
          {!done ? (
            <button type="button" onClick={() => openSurvey(s)} className="ml-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700">참여하기</button>
          ) : (
            <CheckCircle className="ml-3 h-6 w-6 text-green-500" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">설문조사</h1>
          <p className="mt-1 text-sm text-slate-600">각 부처·센터의 설문에 참여해주세요. 참여 시 마일리지 5점이 부여됩니다.</p>
        </div>

        {/* 필터 */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => setFilterOrg("all")} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${filterOrg === "all" ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>전체</button>
          {orgNames.map((name) => {
            const org = ORG_LABELS[name];
            return (
              <button key={name} type="button" onClick={() => setFilterOrg(name)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${filterOrg === name ? "bg-slate-800 text-white" : `border border-slate-300 bg-white ${org?.color ?? "text-slate-600"}`}`}>
                {org?.label ?? name}
              </button>
            );
          })}
        </div>

        {surveys.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">현재 진행 중인 설문이 없습니다.</p>
          </div>
        ) : (
          <>
            {grouped.departments.length > 0 && (
              <div className="mb-6">
                <h2 className="mb-3 text-base font-semibold text-slate-800">부처별 설문</h2>
                <div className="space-y-3">{grouped.departments.map(renderSurveyCard)}</div>
              </div>
            )}
            {grouped.centers.length > 0 && (
              <div>
                <h2 className="mb-3 text-base font-semibold text-slate-800">센터별 설문</h2>
                <div className="space-y-3">{grouped.centers.map(renderSurveyCard)}</div>
              </div>
            )}
          </>
        )}
      </main>

      {/* 설문 응답 모달 */}
      {selectedSurvey && !submitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedSurvey(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{selectedSurvey.title}</h3>
            {selectedSurvey.description && <p className="mt-1 text-sm text-slate-500">{selectedSurvey.description}</p>}

            <div className="mt-6 space-y-6">
              {questions.map((q) => (
                <div key={q.id}>
                  <p className="mb-2 text-sm font-medium text-slate-900">
                    {q.question_order}. {q.question_text} {q.is_required && <span className="text-red-500">*</span>}
                  </p>
                  {q.question_type === "likert" && (
                    <div className="flex flex-wrap gap-2">
                      {LIKERT.map((label, i) => (
                        <label key={i} className={`flex cursor-pointer items-center rounded-xl border-2 px-3 py-2 text-xs font-medium transition ${answers[q.id] === i + 1 ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>
                          <input type="radio" className="sr-only" checked={answers[q.id] === i + 1} onChange={() => setAnswers({ ...answers, [q.id]: i + 1 })} />
                          {i + 1} ({label})
                        </label>
                      ))}
                    </div>
                  )}
                  {q.question_type === "text" && (
                    <textarea value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} rows={3} placeholder="자유롭게 작성해주세요."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  )}
                  {q.question_type === "choice" && q.options && (
                    <div className="flex flex-wrap gap-2">
                      {(q.options as string[]).map((opt, i) => (
                        <label key={i} className={`flex cursor-pointer items-center rounded-xl border-2 px-3 py-2 text-xs font-medium transition ${answers[q.id] === opt ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>
                          <input type="radio" className="sr-only" checked={answers[q.id] === opt} onChange={() => setAnswers({ ...answers, [q.id]: opt })} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setSelectedSurvey(null)} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">취소</button>
              <button type="button" onClick={handleSubmit} disabled={submitting || !allRequired}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                {submitting ? "제출 중..." : "제출하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 완료 모달 */}
      {submitted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setSelectedSurvey(null); setSubmitted(false); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
            <h3 className="mt-4 text-lg font-bold text-slate-900">설문 완료!</h3>
            <p className="mt-1 text-sm text-slate-600">참여해주셔서 감사합니다. 마일리지 5점이 부여되었습니다.</p>
            <button type="button" onClick={() => { setSelectedSurvey(null); setSubmitted(false); }}
              className="mt-6 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700">확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
