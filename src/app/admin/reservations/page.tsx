"use client";

import { Calendar, Check, Clock, Download, FileText, Filter, MessageSquare, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import { formatDateTimeKorea } from "@/lib/date";
import AdminLayout from "@/components/AdminLayout";

const COUNSEL_CATEGORIES = ["일반", "학업", "진로", "심리", "신앙", "생활", "기타"];

type Reservation = {
  id: number;
  student_id: string;
  center_type: string;
  reservation_date: string;
  time_slot: string;
  purpose: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

const CENTERS = [
  { key: "all", name: "전체" },
  { key: "ctl", name: "교수학습지원센터", color: "#10B981", bg: "bg-green-50", text: "text-green-700" },
  { key: "career_center", name: "취창업진로지원센터", color: "#3B82F6", bg: "bg-blue-50", text: "text-blue-700" },
  { key: "counseling_center", name: "학생생활상담센터", color: "#8B5CF6", bg: "bg-violet-50", text: "text-violet-700" },
];

const STATUS_OPTIONS = ["신청", "확인", "완료", "취소"];

export default function AdminReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [deptMap, setDeptMap] = useState<Record<string, string>>({});
  const [myRole, setMyRole] = useState("");
  const [filterCenter, setFilterCenter] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [myStaffId, setMyStaffId] = useState("");
  const [showCounselForm, setShowCounselForm] = useState<string | null>(null);
  const [counselForm, setCounselForm] = useState({ category: "일반", content: "", action_plan: "", follow_up_needed: false, follow_up_date: "" });
  const [counselSaving, setCounselSaving] = useState(false);

  const load = async () => {
    const mySid = await getCurrentStudentId();
    if (mySid) {
      setMyStaffId(mySid.trim());
      const { data: me } = await supabase.from("students").select("role").eq("student_id", mySid.trim()).maybeSingle();
      const role = (me?.role ?? "").trim().toLowerCase();
      setMyRole(role);
      if (["ctl", "career_center", "counseling_center"].includes(role) && filterCenter === "all") {
        setFilterCenter(role);
      }
    }
    const [resRes, studentsRes, deptRes] = await Promise.all([
      supabase.from("center_reservations").select("*").order("reservation_date", { ascending: true }).order("time_slot"),
      supabase.from("students").select("student_id, name, department_id, phone"),
      supabase.from("departments").select("id, name"),
    ]);
    setReservations((resRes.data ?? []) as Reservation[]);

    const nMap: Record<string, string> = {};
    const dMap: Record<string, string> = {};
    const depts: Record<number, string> = {};
    (deptRes.data ?? []).forEach((d: any) => { depts[d.id] = d.name; });
    (studentsRes.data ?? []).forEach((s: any) => {
      nMap[s.student_id] = s.name ?? "";
      dMap[s.student_id] = s.department_id ? (depts[s.department_id] ?? "") : "";
    });
    setNameMap(nMap);
    setDeptMap(dMap);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = reservations;
    if (filterCenter !== "all") list = list.filter((r) => r.center_type === filterCenter);
    if (filterStatus !== "all") list = list.filter((r) => r.status === filterStatus);
    if (filterDate) list = list.filter((r) => r.reservation_date === filterDate);
    return list;
  }, [reservations, filterCenter, filterStatus, filterDate]);

  // 통계
  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return {
      total: reservations.length,
      pending: reservations.filter((r) => r.status === "신청").length,
      today: reservations.filter((r) => r.reservation_date === today && r.status !== "취소").length,
      completed: reservations.filter((r) => r.status === "완료").length,
    };
  }, [reservations]);

  const handleStatusChange = async (id: number, newStatus: string) => {
    await supabase.from("center_reservations").update({ status: newStatus }).eq("id", id);
    await load();
  };

  const handleSaveCounsel = async () => {
    if (!showCounselForm || !counselForm.content.trim()) return;
    setCounselSaving(true);
    await supabase.from("counseling_records").insert({
      student_id: showCounselForm,
      counselor_id: myStaffId,
      counselor_role: myRole,
      counseling_date: new Date().toISOString().split("T")[0],
      category: counselForm.category,
      content: counselForm.content.trim(),
      action_plan: counselForm.action_plan.trim() || null,
      follow_up_needed: counselForm.follow_up_needed,
      follow_up_date: counselForm.follow_up_date || null,
      is_private: false,
    });
    setCounselSaving(false);
    setShowCounselForm(null);
    setCounselForm({ category: "일반", content: "", action_plan: "", follow_up_needed: false, follow_up_date: "" });
    alert("상담기록이 저장되었습니다.");
  };

  const handleSaveNote = async (id: number) => {
    await supabase.from("center_reservations").update({ admin_note: noteText.trim() || null }).eq("id", id);
    setEditingNote(null);
    setNoteText("");
    await load();
  };

  const downloadCSV = () => {
    let csv = "학번,이름,학과,센터,날짜,시간,목적,상태,메모,신청일\n";
    filtered.forEach((r) => {
      const center = CENTERS.find((c) => c.key === r.center_type);
      csv += `"${r.student_id}","${nameMap[r.student_id] ?? ""}","${deptMap[r.student_id] ?? ""}","${center?.name ?? r.center_type}","${r.reservation_date}","${r.time_slot}","${(r.purpose ?? "").replace(/"/g, '""')}","${r.status}","${(r.admin_note ?? "").replace(/"/g, '""')}","${r.created_at ?? ""}"\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reservations_${filterCenter}_${filterDate || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const centerLabel = (key: string) => CENTERS.find((c) => c.key === key);

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-900">예약 관리</h2>
        <button type="button" onClick={downloadCSV} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Download className="h-4 w-4" /> CSV 내보내기
        </button>
      </div>

      {/* 통계 */}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">전체 예약</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{stats.total}건</p>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
          <p className="text-xs text-yellow-700">대기 중 (신청)</p>
          <p className="mt-1 text-xl font-bold text-yellow-700">{stats.pending}건</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <p className="text-xs text-blue-700">오늘 예약</p>
          <p className="mt-1 text-xl font-bold text-blue-700">{stats.today}건</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <p className="text-xs text-green-700">완료</p>
          <p className="mt-1 text-xl font-bold text-green-700">{stats.completed}건</p>
        </div>
      </div>

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-slate-400" />
        <select value={filterCenter} onChange={(e) => setFilterCenter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {CENTERS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="all">전체 상태</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        {filterDate && <button type="button" onClick={() => setFilterDate("")} className="text-xs text-slate-500 hover:text-slate-700">날짜 초기화</button>}
      </div>

      {/* 예약 목록 */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">센터</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">학번 / 이름</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">학과</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">날짜 / 시간</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">목적</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">상태</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">예약이 없습니다.</td></tr>
            ) : (
              filtered.map((r) => {
                const center = centerLabel(r.center_type);
                return (
                  <tr key={r.id} className={`hover:bg-slate-50 ${r.status === "취소" ? "opacity-40" : ""}`}>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${center?.bg ?? ""} ${center?.text ?? ""}`}>{center?.name ?? r.center_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{r.student_id}</p>
                      <p className="text-xs text-slate-500">{nameMap[r.student_id] ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{deptMap[r.student_id] ?? "-"}</td>
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-1 text-sm text-slate-900"><Calendar className="h-3 w-3 text-slate-400" />{r.reservation_date}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3 w-3 text-slate-400" />{r.time_slot}</p>
                    </td>
                    <td className="max-w-[150px] px-4 py-3">
                      <p className="truncate text-xs text-slate-600">{r.purpose ?? "-"}</p>
                      {r.admin_note && <p className="mt-0.5 truncate rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{r.admin_note}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <select value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value)}
                        className={`rounded-lg border px-2 py-1 text-xs font-medium ${
                          r.status === "신청" ? "border-yellow-300 bg-yellow-50 text-yellow-700" :
                          r.status === "확인" ? "border-blue-300 bg-blue-50 text-blue-700" :
                          r.status === "완료" ? "border-green-300 bg-green-50 text-green-700" :
                          "border-slate-200 bg-slate-50 text-slate-400"
                        }`}>
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button type="button" onClick={() => { setShowCounselForm(r.student_id); setCounselForm({ category: "일반", content: "", action_plan: "", follow_up_needed: false, follow_up_date: "" }); }}
                        className="mr-1 text-emerald-500 hover:text-emerald-700" title="상담기록">
                        <FileText className="inline h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => { setEditingNote(r.id); setNoteText(r.admin_note ?? ""); }}
                        className="text-slate-400 hover:text-blue-600" title="메모">
                        <MessageSquare className="inline h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 메모 모달 */}
      {editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingNote(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">관리자 메모</h3>
            <p className="mt-1 text-xs text-slate-500">학생에게 표시되는 메모입니다.</p>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} placeholder="상담 내용, 준비사항 등"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setEditingNote(null)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">취소</button>
              <button type="button" onClick={() => handleSaveNote(editingNote)} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 상담기록 작성 모달 */}
      {showCounselForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCounselForm(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">상담기록 작성</h3>
            <p className="mt-1 text-sm text-slate-500">학생: {showCounselForm} - {nameMap[showCounselForm] ?? ""}</p>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">분류</label>
                  <select value={counselForm.category} onChange={(e) => setCounselForm({ ...counselForm, category: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {COUNSEL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700">
                    <input type="checkbox" checked={counselForm.follow_up_needed} onChange={(e) => setCounselForm({ ...counselForm, follow_up_needed: e.target.checked })} className="rounded" />
                    후속 상담 필요
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">상담 내용 *</label>
                <textarea value={counselForm.content} onChange={(e) => setCounselForm({ ...counselForm, content: e.target.value })} rows={4}
                  placeholder="상담 내용을 기록하세요." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">조치 계획 (선택)</label>
                <input type="text" value={counselForm.action_plan} onChange={(e) => setCounselForm({ ...counselForm, action_plan: e.target.value })}
                  placeholder="향후 조치 사항" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              {counselForm.follow_up_needed && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">후속 상담일</label>
                  <input type="date" value={counselForm.follow_up_date} onChange={(e) => setCounselForm({ ...counselForm, follow_up_date: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCounselForm(null)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">취소</button>
                <button type="button" onClick={handleSaveCounsel} disabled={counselSaving || !counselForm.content.trim()}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                  {counselSaving ? "저장 중..." : "상담기록 저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
