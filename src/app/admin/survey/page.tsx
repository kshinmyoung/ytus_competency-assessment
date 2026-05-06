"use client";

import { Download, Edit3, Eye, Filter, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminLayout from "@/components/AdminLayout";

type Survey = { id: number; title: string; description: string | null; org_type: string; org_name: string; is_active: boolean; start_date: string | null; end_date: string | null };
type Question = { id: number; survey_id: number; question_text: string; question_type: string; options: any; question_order: number; is_required: boolean };
type Response = { id: number; survey_id: number; student_id: string; answers: Record<number, any>; submitted_at: string };

const ORG_TYPES = [
  { type: "department", orgs: ["교무처", "기획처", "사무처", "학생실천처"] },
  { type: "center", orgs: ["교수학습지원센터", "취창업진로지원센터", "학생생활상담센터"] },
];
const LIKERT = ["", "전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다"];

export default function AdminSurveyPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [filterOrg, setFilterOrg] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", description: "", org_type: "department", org_name: "교무처", start_date: "", end_date: "", is_active: true });
  const [saving, setSaving] = useState(false);

  // 문항 관리
  const [showQuestions, setShowQuestions] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qForm, setQForm] = useState({ question_text: "", question_type: "likert", options: "", question_order: 0, is_required: true });
  const [editingQId, setEditingQId] = useState<number | null>(null);

  // 응답 조회
  const [showResponses, setShowResponses] = useState<Survey | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [respQuestions, setRespQuestions] = useState<Question[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  const load = async () => {
    const [sRes, studRes] = await Promise.all([
      supabase.from("surveys").select("*").order("created_at", { ascending: false }),
      supabase.from("students").select("student_id, name"),
    ]);
    setSurveys((sRes.data ?? []) as Survey[]);
    const m: Record<string, string> = {};
    (studRes.data ?? []).forEach((s: any) => { m[s.student_id] = s.name ?? ""; });
    setNameMap(m);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filterOrg === "all") return surveys;
    return surveys.filter((s) => s.org_name === filterOrg);
  }, [surveys, filterOrg]);

  // 설문 CRUD
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = { title: form.title.trim(), description: form.description.trim() || null, org_type: form.org_type, org_name: form.org_name, start_date: form.start_date || null, end_date: form.end_date || null, is_active: form.is_active };
    if (editingId) { await supabase.from("surveys").update(payload).eq("id", editingId); }
    else { await supabase.from("surveys").insert(payload); }
    setSaving(false); setShowForm(false); setEditingId(null); await load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("설문과 모든 응답을 삭제하시겠습니까?")) return;
    await supabase.from("survey_responses").delete().eq("survey_id", id);
    await supabase.from("survey_questions").delete().eq("survey_id", id);
    await supabase.from("surveys").delete().eq("id", id);
    await load();
  };

  // 문항 관리
  const openQuestions = async (s: Survey) => {
    setShowQuestions(s);
    const { data } = await supabase.from("survey_questions").select("*").eq("survey_id", s.id).order("question_order");
    setQuestions((data ?? []) as Question[]);
    setQForm({ question_text: "", question_type: "likert", options: "", question_order: (data ?? []).length + 1, is_required: true });
    setEditingQId(null);
  };

  const handleSaveQ = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showQuestions || !qForm.question_text.trim()) return;
    const payload = {
      survey_id: showQuestions.id, question_text: qForm.question_text.trim(), question_type: qForm.question_type,
      options: qForm.question_type === "choice" && qForm.options ? qForm.options.split(",").map((o: string) => o.trim()).filter(Boolean) : null,
      question_order: qForm.question_order, is_required: qForm.is_required,
    };
    if (editingQId) { await supabase.from("survey_questions").update(payload).eq("id", editingQId); }
    else { await supabase.from("survey_questions").insert(payload); }
    await openQuestions(showQuestions);
  };

  const handleDeleteQ = async (id: number) => {
    if (!showQuestions) return;
    await supabase.from("survey_questions").delete().eq("id", id);
    await openQuestions(showQuestions);
  };

  // 응답 조회
  const openResponses = async (s: Survey) => {
    setShowResponses(s);
    const [rRes, qRes] = await Promise.all([
      supabase.from("survey_responses").select("*").eq("survey_id", s.id).order("submitted_at", { ascending: false }),
      supabase.from("survey_questions").select("*").eq("survey_id", s.id).order("question_order"),
    ]);
    setResponses((rRes.data ?? []) as Response[]);
    setRespQuestions((qRes.data ?? []) as Question[]);
  };

  const downloadResponses = () => {
    if (!showResponses) return;
    let csv = "학번,이름,제출일," + respQuestions.map((q) => `"${q.question_text}"`).join(",") + "\n";
    responses.forEach((r) => {
      const row = [r.student_id, nameMap[r.student_id] ?? "", r.submitted_at];
      respQuestions.forEach((q) => {
        const val = r.answers[q.id];
        if (q.question_type === "likert") row.push(val ? `${val}(${LIKERT[val] ?? ""})` : "");
        else row.push(`"${(val ?? "").toString().replace(/"/g, '""')}"`);
      });
      csv += row.join(",") + "\n";
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `survey_${showResponses.id}_responses.csv`; a.click();
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-900">설문조사 관리</h2>
        <button type="button" onClick={() => { setEditingId(null); setForm({ title: "", description: "", org_type: "department", org_name: "교무처", start_date: "", end_date: "", is_active: true }); setShowForm(true); }}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> 설문 추가
        </button>
      </div>

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-slate-400" />
        <button type="button" onClick={() => setFilterOrg("all")} className={`rounded-full px-3 py-1 text-xs ${filterOrg === "all" ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>전체</button>
        {ORG_TYPES.flatMap((g) => g.orgs).map((name) => (
          <button key={name} type="button" onClick={() => setFilterOrg(name)} className={`rounded-full px-3 py-1 text-xs ${filterOrg === name ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-600"}`}>{name}</button>
        ))}
      </div>

      {/* 설문 목록 */}
      <div className="space-y-3">
        {filtered.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><p className="text-sm text-slate-500">설문이 없습니다.</p></div> :
          filtered.map((s) => (
            <div key={s.id} className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${!s.is_active ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.org_type === "department" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>{s.org_name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.is_active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"}`}>{s.is_active ? "진행중" : "마감"}</span>
                  </div>
                  <h3 className="mt-1.5 text-sm font-semibold text-slate-900">{s.title}</h3>
                  {s.description && <p className="mt-0.5 text-xs text-slate-500">{s.description}</p>}
                  {s.end_date && <p className="mt-0.5 text-[10px] text-slate-400">마감: {s.end_date}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => openQuestions(s)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="문항 관리"><Edit3 className="h-4 w-4" /></button>
                  <button type="button" onClick={() => openResponses(s)} className="rounded p-1.5 text-blue-500 hover:bg-blue-50 hover:text-blue-700" title="응답 조회"><Eye className="h-4 w-4" /></button>
                  <button type="button" onClick={() => handleDelete(s.id)} className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="삭제"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {/* 설문 추가/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{editingId ? "설문 수정" : "설문 추가"}</h3>
            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700">제목 *</label><input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
              <div><label className="block text-sm font-medium text-slate-700">설명</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">소속 구분</label>
                  <select value={form.org_type} onChange={(e) => { setForm({ ...form, org_type: e.target.value, org_name: ORG_TYPES.find((g) => g.type === e.target.value)?.orgs[0] ?? "" }); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="department">부처</option><option value="center">센터</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">소속</label>
                  <select value={form.org_name} onChange={(e) => setForm({ ...form, org_name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {(ORG_TYPES.find((g) => g.type === form.org_type)?.orgs ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-slate-700">시작일</label><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
                <div><label className="block text-sm font-medium text-slate-700">마감일</label><input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" /> 활성</label>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">취소</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "저장 중..." : "저장"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 문항 관리 모달 */}
      {showQuestions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowQuestions(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{showQuestions.title} - 문항 관리</h3>
            <p className="mt-1 text-xs text-slate-500">{questions.length}개 문항</p>

            {/* 문항 목록 */}
            <div className="mt-4 space-y-2">
              {questions.map((q) => (
                <div key={q.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <div>
                    <p className="text-sm text-slate-800">{q.question_order}. {q.question_text}</p>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{q.question_type === "likert" ? "5점 척도" : q.question_type === "text" ? "서술형" : "선택형"}</span>
                  </div>
                  <button type="button" onClick={() => handleDeleteQ(q.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>

            {/* 문항 추가 */}
            <form onSubmit={handleSaveQ} className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="mb-2 text-xs font-semibold text-blue-700">문항 추가</p>
              <div className="space-y-3">
                <input type="text" value={qForm.question_text} onChange={(e) => setQForm({ ...qForm, question_text: e.target.value })} placeholder="문항 내용" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <div className="grid grid-cols-3 gap-2">
                  <select value={qForm.question_type} onChange={(e) => setQForm({ ...qForm, question_type: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="likert">5점 척도</option><option value="text">서술형</option><option value="choice">선택형</option>
                  </select>
                  <input type="number" value={qForm.question_order} onChange={(e) => setQForm({ ...qForm, question_order: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="순서" />
                  <label className="flex items-center gap-1 text-xs text-slate-700"><input type="checkbox" checked={qForm.is_required} onChange={(e) => setQForm({ ...qForm, is_required: e.target.checked })} className="rounded" /> 필수</label>
                </div>
                {qForm.question_type === "choice" && (
                  <input type="text" value={qForm.options} onChange={(e) => setQForm({ ...qForm, options: e.target.value })} placeholder="선택지 (쉼표 구분: 예, 아니오, 모르겠다)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                )}
                <button type="submit" className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">문항 추가</button>
              </div>
            </form>
            <button type="button" onClick={() => setShowQuestions(null)} className="mt-4 w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">닫기</button>
          </div>
        </div>
      )}

      {/* 응답 조회 모달 */}
      {showResponses && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowResponses(null)}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{showResponses.title} - 응답 ({responses.length}건)</h3>
              </div>
              <button type="button" onClick={downloadResponses} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                <Download className="h-4 w-4" /> CSV 다운로드
              </button>
            </div>

            {responses.length === 0 ? (
              <p className="mt-6 text-center text-sm text-slate-500">응답이 없습니다.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-600">학번</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-600">이름</th>
                      {respQuestions.map((q) => <th key={q.id} className="px-3 py-2 text-left text-[10px] font-semibold text-slate-600 max-w-[150px] truncate">{q.question_order}. {q.question_text}</th>)}
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-600">제출일</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {responses.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-xs text-slate-900">{r.student_id}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{nameMap[r.student_id] ?? "-"}</td>
                        {respQuestions.map((q) => {
                          const val = r.answers[q.id];
                          return <td key={q.id} className="px-3 py-2 text-xs text-slate-700 max-w-[150px] truncate">
                            {q.question_type === "likert" ? (val ? `${val}점` : "-") : (val ?? "-")}
                          </td>;
                        })}
                        <td className="px-3 py-2 text-[10px] text-slate-400">{new Date(r.submitted_at).toLocaleDateString("ko-KR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button type="button" onClick={() => setShowResponses(null)} className="mt-4 w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">닫기</button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
