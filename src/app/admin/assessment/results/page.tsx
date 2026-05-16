"use client";

import { Download, Filter, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminLayout from "@/components/AdminLayout";
import { formatDateTimeKorea } from "@/lib/date";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const DIAGNOSIS_LABELS: Record<string, string> = { core: "핵심역량", learning: "학습역량", calling: "소명진단" };
const SCORE_LABELS: Record<string, Record<string, string>> = {
  core: { spiritual: "영성", reflection: "기독교적성찰", empathy: "공감소통", glocal: "글로컬", creative: "창의융합" },
  learning: { launch: "Launch", explore: "Explore", act: "Act", refine: "Refine", network: "Network" },
  calling: { calling: "Calling", awakening: "Awakening", leading: "Leading", launching: "Launching", plus: "Plus" },
};

type DiagResult = { id: number; student_id: string; diagnosis_type: string; total_score: number; scores: Record<string, number> | null; created_at: string };
type AssessResponse = { id: number; student_id: string; question_id: number; answer_value: number; answered_at: string };
type AssessQuestion = { id: number; competency_type: string; competency_id: number; question_text: string; question_order: number; department_id: number | null };
type AssessSession = { id: number; student_id: string; completed_at: string | null; competency_scores: Record<string, number> | null };

type ViewTab = "diagnosis" | "questions";

export default function AdminAssessmentResultsPage() {
  const [diagResults, setDiagResults] = useState<DiagResult[]>([]);
  const [responses, setResponses] = useState<AssessResponse[]>([]);
  const [questions, setQuestions] = useState<AssessQuestion[]>([]);
  const [sessions, setSessions] = useState<AssessSession[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [deptMap, setDeptMap] = useState<Record<string, string>>({});
  const [filterType, setFilterType] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("diagnosis");

  useEffect(() => {
    (async () => {
      const [diagRes, respRes, qRes, sessRes, studRes, deptRes] = await Promise.all([
        supabase.from("diagnosis_results").select("*").order("created_at", { ascending: false }),
        supabase.from("assessment_responses").select("*").order("answered_at", { ascending: false }),
        supabase.from("assessment_questions").select("id, competency_type, competency_id, question_text, question_order, department_id").order("competency_type").order("question_order"),
        supabase.from("assessment_sessions").select("*").order("completed_at", { ascending: false }),
        supabase.from("students").select("student_id, name, department_id"),
        supabase.from("departments").select("id, name"),
      ]);
      setDiagResults((diagRes.data ?? []) as DiagResult[]);
      setResponses((respRes.data ?? []) as AssessResponse[]);
      setQuestions((qRes.data ?? []) as AssessQuestion[]);
      setSessions((sessRes.data ?? []) as AssessSession[]);

      const nm: Record<string, string> = {};
      const dm: Record<string, string> = {};
      const depts: Record<number, string> = {};
      (deptRes.data ?? []).forEach((d: any) => { depts[d.id] = d.name; });
      (studRes.data ?? []).forEach((s: any) => { nm[s.student_id] = s.name ?? ""; dm[s.student_id] = s.department_id ? depts[s.department_id] ?? "" : ""; });
      setNameMap(nm);
      setDeptMap(dm);
    })();
  }, []);

  // 기존 진단 필터
  const filteredDiag = useMemo(() => {
    let list = diagResults;
    if (filterType !== "all") list = list.filter((r) => r.diagnosis_type === filterType);
    const q = searchText.trim().toLowerCase();
    if (q) list = list.filter((r) => r.student_id.includes(q) || (nameMap[r.student_id] ?? "").toLowerCase().includes(q));
    return list;
  }, [diagResults, filterType, searchText, nameMap]);

  // 문항별 응답 (선택 학생)
  const studentResponses = useMemo(() => {
    if (!selectedStudent) return [];
    return responses.filter((r) => r.student_id === selectedStudent).map((r) => {
      const q = questions.find((qq) => qq.id === r.question_id);
      return { ...r, question_text: q?.question_text ?? "", competency_type: q?.competency_type ?? "", question_order: q?.question_order ?? 0 };
    }).sort((a, b) => a.competency_type.localeCompare(b.competency_type) || a.question_order - b.question_order);
  }, [selectedStudent, responses, questions]);

  // 문항별 전체 평균
  const questionAvg = useMemo(() => {
    const sums: Record<number, { total: number; count: number }> = {};
    responses.forEach((r) => {
      if (!sums[r.question_id]) sums[r.question_id] = { total: 0, count: 0 };
      sums[r.question_id].total += r.answer_value;
      sums[r.question_id].count += 1;
    });
    return sums;
  }, [responses]);

  // 고유 학생 (문항별 응답 있는)
  const respondedStudents = useMemo(() => {
    const ids = new Set(responses.map((r) => r.student_id));
    return Array.from(ids).sort();
  }, [responses]);

  // 통계
  const uniqueDiagStudents = useMemo(() => new Set(diagResults.map((r) => r.student_id)).size, [diagResults]);
  const countByType = useMemo(() => {
    const c: Record<string, number> = { core: 0, learning: 0, calling: 0 };
    diagResults.forEach((r) => { c[r.diagnosis_type] = (c[r.diagnosis_type] ?? 0) + 1; });
    return c;
  }, [diagResults]);

  // CSV 다운로드 (기존 진단)
  const downloadDiagCSV = () => {
    let csv = "학번,이름,학과,진단유형,총점,세부점수,진단시간\n";
    filteredDiag.forEach((r) => {
      const scores = r.scores ? Object.entries(r.scores).map(([k, v]) => `${SCORE_LABELS[r.diagnosis_type]?.[k] ?? k}:${v}`).join(" / ") : "";
      csv += `"${r.student_id}","${nameMap[r.student_id] ?? ""}","${deptMap[r.student_id] ?? ""}","${DIAGNOSIS_LABELS[r.diagnosis_type] ?? r.diagnosis_type}","${r.total_score}","${scores}","${r.created_at ?? ""}"\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "diagnosis_results.csv"; a.click();
  };

  // CSV 다운로드 (문항별)
  const downloadQuestionCSV = () => {
    let csv = "학번,이름,문항ID,진단유형,문항순서,문항내용,답변값,답변시간\n";
    responses.forEach((r) => {
      const q = questions.find((qq) => qq.id === r.question_id);
      csv += `"${r.student_id}","${nameMap[r.student_id] ?? ""}","${r.question_id}","${q?.competency_type ?? ""}","${q?.question_order ?? ""}","${(q?.question_text ?? "").replace(/"/g, '""')}","${r.answer_value}","${r.answered_at ?? ""}"\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "question_responses.csv"; a.click();
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-900">응답 데이터 조회</h2>
        <div className="flex gap-2">
          <button type="button" onClick={downloadDiagCSV} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" /> 역량별 CSV
          </button>
          <button type="button" onClick={downloadQuestionCSV} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Download className="h-4 w-4" /> 문항별 CSV
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
        <button type="button" onClick={() => setViewTab("diagnosis")} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${viewTab === "diagnosis" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>역량별 결과</button>
        <button type="button" onClick={() => setViewTab("questions")} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${viewTab === "questions" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>문항별 결과</button>
      </div>

      {/* 요약 카드 */}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">참여 학생</p><p className="mt-1 text-2xl font-bold text-slate-900">{uniqueDiagStudents}명</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-violet-600">핵심역량</p><p className="mt-1 text-2xl font-bold text-violet-600">{countByType.core}건</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-blue-600">학습역량</p><p className="mt-1 text-2xl font-bold text-blue-600">{countByType.learning}건</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-green-600">소명진단</p><p className="mt-1 text-2xl font-bold text-green-600">{countByType.calling}건</p></div>
      </div>

      {/* === 역량별 결과 === */}
      {viewTab === "diagnosis" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-slate-400" />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="all">전체</option><option value="core">핵심역량</option><option value="learning">학습역량</option><option value="calling">소명진단</option>
            </select>
            <input type="text" placeholder="학번 또는 이름..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">학번</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">유형</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">총점</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">세부</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">일시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredDiag.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">데이터 없음</td></tr>
                ) : filteredDiag.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-900">{r.student_id}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{nameMap[r.student_id] ?? "-"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.diagnosis_type === "core" ? "bg-violet-50 text-violet-700" : r.diagnosis_type === "learning" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>{DIAGNOSIS_LABELS[r.diagnosis_type] ?? r.diagnosis_type}</span></td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{r.total_score}점</td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{r.scores && Object.entries(r.scores).map(([k, v]) => <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{SCORE_LABELS[r.diagnosis_type]?.[k] ?? k}:{v}</span>)}</div></td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDateTimeKorea(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* === 문항별 결과 === */}
      {viewTab === "questions" && (
        <>
          {/* 문항별 전체 평균 */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-slate-800">문항별 평균 점수</h3>
            {questions.filter((q) => questionAvg[q.id]).length === 0 ? (
              <p className="text-sm text-slate-500">문항별 응답 데이터가 없습니다.</p>
            ) : (
              <div className="max-h-[400px] overflow-auto space-y-2">
                {questions.filter((q) => questionAvg[q.id]).map((q) => {
                  const avg = questionAvg[q.id];
                  const mean = avg ? Math.round((avg.total / avg.count) * 10) / 10 : 0;
                  const pct = Math.round((mean / 5) * 100);
                  return (
                    <div key={q.id} className="flex items-center gap-3">
                      <span className="w-8 text-right text-xs text-slate-400">{q.question_order}</span>
                      <div className="flex-1">
                        <p className="text-xs text-slate-800 truncate">{q.question_text}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-16 text-right text-xs font-medium text-slate-700">{mean}점 ({avg.count}명)</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 학생별 문항별 상세 */}
          <div className="mb-6">
            <h3 className="mb-3 text-base font-semibold text-slate-800">학생별 문항별 점수</h3>
            <div className="mb-3 flex items-center gap-3">
              <select value={selectedStudent ?? ""} onChange={(e) => setSelectedStudent(e.target.value || null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">학생 선택...</option>
                {respondedStudents.map((sid) => (
                  <option key={sid} value={sid}>{sid} - {nameMap[sid] ?? ""}</option>
                ))}
              </select>
            </div>

            {selectedStudent && studentResponses.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">순서</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">진단유형</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">문항</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600">점수</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">평균</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentResponses.map((r) => {
                      const avg = questionAvg[r.question_id];
                      const mean = avg ? Math.round((avg.total / avg.count) * 10) / 10 : 0;
                      const diff = r.answer_value - mean;
                      return (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-xs text-slate-400">{r.question_order}</td>
                          <td className="px-3 py-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{r.competency_type}</span></td>
                          <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-800">{r.question_text}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`rounded-full px-2.5 py-1 text-sm font-bold ${r.answer_value >= 4 ? "bg-green-50 text-green-700" : r.answer_value >= 3 ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}>{r.answer_value}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500">
                            {mean} <span className={diff >= 0 ? "text-green-600" : "text-red-600"}>({diff >= 0 ? "+" : ""}{diff.toFixed(1)})</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {selectedStudent && studentResponses.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">이 학생의 문항별 응답이 없습니다.</p>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
}
