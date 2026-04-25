"use client";

import { ArrowRight, Download, Filter, Plus, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import { formatDateTimeKorea } from "@/lib/date";
import AdminLayout from "@/components/AdminLayout";

type Referral = {
  id: number;
  student_id: string;
  from_staff_id: string;
  from_role: string;
  to_type: string;
  to_staff_id: string | null;
  reason: string;
  urgency: string;
  status: string;
  note: string | null;
  response_note: string | null;
  created_at: string;
};

const TO_LABELS: Record<string, string> = {
  ctl: "교수학습지원센터",
  career_center: "취창업진로지원센터",
  counseling_center: "학생생활상담센터",
  mentor_professor: "멘토링교수",
  department_head: "학과장",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "관리자", ctl: "교수학습지원센터", career_center: "취창업진로지원센터",
  counseling_center: "학생생활상담센터", mentor_professor: "멘토링교수", department_head: "학과장",
};

const URGENCY_STYLES: Record<string, string> = {
  "낮음": "bg-slate-100 text-slate-600",
  "보통": "bg-blue-50 text-blue-700",
  "높음": "bg-orange-50 text-orange-700",
  "긴급": "bg-red-50 text-red-700",
};

const STATUS_STYLES: Record<string, string> = {
  "접수": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "확인": "bg-blue-50 text-blue-700 border-blue-200",
  "진행중": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "완료": "bg-green-50 text-green-700 border-green-200",
  "반려": "bg-slate-100 text-slate-400 border-slate-200",
};

const STATUS_OPTIONS = ["접수", "확인", "진행중", "완료", "반려"];

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});
  const [myId, setMyId] = useState("");
  const [myRole, setMyRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDirection, setFilterDirection] = useState<"all" | "sent" | "received">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ student_id: "", to_type: "ctl", reason: "", urgency: "보통", note: "" });
  const [searchStudent, setSearchStudent] = useState("");
  const [students, setStudents] = useState<{ student_id: string; name: string | null }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [responseNote, setResponseNote] = useState("");
  const [respondingId, setRespondingId] = useState<number | null>(null);

  const load = async () => {
    const sid = await getCurrentStudentId();
    if (!sid) return;
    setMyId(sid.trim());

    const [meRes, refRes, studRes] = await Promise.all([
      supabase.from("students").select("role").eq("student_id", sid.trim()).maybeSingle(),
      supabase.from("referrals").select("*").order("created_at", { ascending: false }),
      supabase.from("students").select("student_id, name, role"),
    ]);

    setMyRole((meRes.data?.role ?? "").trim().toLowerCase());
    setReferrals((refRes.data ?? []) as Referral[]);

    const nMap: Record<string, string> = {};
    const rMap: Record<string, string> = {};
    (studRes.data ?? []).forEach((s: any) => {
      nMap[s.student_id] = s.name ?? "";
      rMap[s.student_id] = (s.role ?? "").trim().toLowerCase();
    });
    setNameMap(nMap);
    setRoleMap(rMap);
    setStudents((studRes.data ?? []).filter((s: any) => (s.role ?? "").trim().toLowerCase() === "student"));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = referrals;
    if (filterStatus !== "all") list = list.filter((r) => r.status === filterStatus);
    if (filterDirection === "sent") list = list.filter((r) => r.from_staff_id === myId);
    if (filterDirection === "received") list = list.filter((r) => r.to_type === myRole || r.to_staff_id === myId);
    return list;
  }, [referrals, filterStatus, filterDirection, myId, myRole]);

  const stats = useMemo(() => ({
    total: referrals.length,
    pending: referrals.filter((r) => r.status === "접수").length,
    sent: referrals.filter((r) => r.from_staff_id === myId).length,
    received: referrals.filter((r) => r.to_type === myRole || r.to_staff_id === myId).length,
  }), [referrals, myId, myRole]);

  const filteredStudents = useMemo(() => {
    const q = searchStudent.trim().toLowerCase();
    if (!q) return students.slice(0, 20);
    return students.filter((s) => s.student_id.includes(q) || (s.name ?? "").toLowerCase().includes(q)).slice(0, 20);
  }, [students, searchStudent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.student_id || !form.reason.trim()) return;
    setSubmitting(true);
    await supabase.from("referrals").insert({
      student_id: form.student_id,
      from_staff_id: myId,
      from_role: myRole,
      to_type: form.to_type,
      reason: form.reason.trim(),
      urgency: form.urgency,
      note: form.note.trim() || null,
    });
    setSubmitting(false);
    setShowForm(false);
    setForm({ student_id: "", to_type: "ctl", reason: "", urgency: "보통", note: "" });
    setSearchStudent("");
    await load();
  };

  const handleStatusChange = async (id: number, status: string) => {
    await supabase.from("referrals").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    await load();
  };

  const handleDeleteReferral = async (id: number) => {
    if (!confirm("이 리퍼럴을 삭제하시겠습니까?")) return;
    await supabase.from("referrals").delete().eq("id", id);
    await load();
  };

  const handleResponseNote = async () => {
    if (!respondingId) return;
    await supabase.from("referrals").update({ response_note: responseNote.trim() || null, updated_at: new Date().toISOString() }).eq("id", respondingId);
    setRespondingId(null);
    setResponseNote("");
    await load();
  };

  const downloadCSV = () => {
    let csv = "ID,학생학번,학생이름,의뢰자,의뢰자역할,수신처,사유,긴급도,상태,메모,응답메모,의뢰일\n";
    filtered.forEach((r) => {
      csv += `"${r.id}","${r.student_id}","${nameMap[r.student_id] ?? ""}","${nameMap[r.from_staff_id] ?? r.from_staff_id}","${ROLE_LABELS[r.from_role] ?? r.from_role}","${TO_LABELS[r.to_type] ?? r.to_type}","${(r.reason ?? "").replace(/"/g, '""')}","${r.urgency}","${r.status}","${(r.note ?? "").replace(/"/g, '""')}","${(r.response_note ?? "").replace(/"/g, '""')}","${r.created_at}"\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "referrals.csv"; a.click();
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-900">리퍼럴 관리</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowForm(true)} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> 리퍼럴 보내기
          </button>
          <button type="button" onClick={downloadCSV} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      {/* 통계 */}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">전체</p><p className="mt-1 text-xl font-bold text-slate-900">{stats.total}</p></div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4"><p className="text-xs text-yellow-700">대기중</p><p className="mt-1 text-xl font-bold text-yellow-700">{stats.pending}</p></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs text-blue-700">보낸 리퍼럴</p><p className="mt-1 text-xl font-bold text-blue-700">{stats.sent}</p></div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-xs text-indigo-700">받은 리퍼럴</p><p className="mt-1 text-xl font-bold text-indigo-700">{stats.received}</p></div>
      </div>

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-slate-400" />
        <select value={filterDirection} onChange={(e) => setFilterDirection(e.target.value as any)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="all">전체</option>
          <option value="sent">보낸 리퍼럴</option>
          <option value="received">받은 리퍼럴</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="all">전체 상태</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* 리퍼럴 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <Send className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">리퍼럴이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className={`rounded-xl border bg-white p-5 shadow-sm ${r.status === "반려" ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  {/* 학생 정보 + 흐름 */}
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-white">
                      {r.student_id} {nameMap[r.student_id] ?? ""}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${URGENCY_STYLES[r.urgency]}`}>{r.urgency}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                  </div>

                  {/* 의뢰 흐름 */}
                  <div className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">{nameMap[r.from_staff_id] ?? r.from_staff_id}</span>
                    <span className="text-[10px] text-slate-400">({ROLE_LABELS[r.from_role] ?? r.from_role})</span>
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                    <span className="rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">{TO_LABELS[r.to_type]}</span>
                  </div>

                  {/* 사유 */}
                  <p className="text-sm text-slate-800">{r.reason}</p>
                  {r.note && <p className="mt-1 text-xs text-slate-500">메모: {r.note}</p>}
                  {r.response_note && <p className="mt-1 rounded bg-green-50 px-2 py-1 text-xs text-green-700">응답: {r.response_note}</p>}
                  <p className="mt-1 text-[10px] text-slate-400">{formatDateTimeKorea(r.created_at)}</p>
                </div>

                {/* 액션 */}
                <div className="flex flex-col gap-1.5">
                  <select value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button type="button" onClick={() => { setRespondingId(r.id); setResponseNote(r.response_note ?? ""); }}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">응답메모</button>
                  <button type="button" onClick={() => handleDeleteReferral(r.id)}
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 리퍼럴 보내기 모달 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">리퍼럴 보내기</h3>
            <p className="mt-1 text-xs text-slate-500">학생을 다른 센터 또는 교수에게 연결합니다.</p>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* 학생 선택 */}
              <div>
                <label className="block text-sm font-medium text-slate-700">학생 선택 *</label>
                <input type="text" placeholder="학번 또는 이름 검색..." value={searchStudent} onChange={(e) => { setSearchStudent(e.target.value); setForm({ ...form, student_id: "" }); }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                {searchStudent && !form.student_id && (
                  <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white">
                    {filteredStudents.map((s) => (
                      <button key={s.student_id} type="button" onClick={() => { setForm({ ...form, student_id: s.student_id }); setSearchStudent(`${s.student_id} - ${s.name ?? ""}`); }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                        {s.student_id} - {s.name ?? ""}
                      </button>
                    ))}
                  </div>
                )}
                {form.student_id && <p className="mt-1 text-xs text-green-600">선택됨: {form.student_id} - {nameMap[form.student_id] ?? ""}</p>}
              </div>

              {/* 수신처 */}
              <div>
                <label className="block text-sm font-medium text-slate-700">리퍼럴 수신처 *</label>
                <select value={form.to_type} onChange={(e) => setForm({ ...form, to_type: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {Object.entries(TO_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* 긴급도 */}
              <div>
                <label className="block text-sm font-medium text-slate-700">긴급도</label>
                <div className="mt-1 flex gap-2">
                  {["낮음", "보통", "높음", "긴급"].map((u) => (
                    <button key={u} type="button" onClick={() => setForm({ ...form, urgency: u })}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${form.urgency === u ? URGENCY_STYLES[u] + " ring-2 ring-offset-1" : "bg-white border border-slate-200 text-slate-600"}`}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* 사유 */}
              <div>
                <label className="block text-sm font-medium text-slate-700">리퍼럴 사유 *</label>
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} required
                  placeholder="학생에 대한 관찰 내용, 연결이 필요한 이유를 작성해주세요."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-sm font-medium text-slate-700">추가 메모 (선택)</label>
                <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="수신처에 전달할 참고사항" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">취소</button>
                <button type="submit" disabled={submitting || !form.student_id || !form.reason.trim()}
                  className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  {submitting ? "보내는 중..." : "리퍼럴 보내기"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 응답 메모 모달 */}
      {respondingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRespondingId(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">응답 메모</h3>
            <p className="mt-1 text-xs text-slate-500">의뢰자에게 전달되는 응답입니다.</p>
            <textarea value={responseNote} onChange={(e) => setResponseNote(e.target.value)} rows={4}
              placeholder="상담 결과, 조치 내용 등" className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setRespondingId(null)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">취소</button>
              <button type="button" onClick={handleResponseNote} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">저장</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
