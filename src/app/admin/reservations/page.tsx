"use client";

import { Calendar, Check, Clock, Download, FileText, Filter, MessageSquare, Plus, Search, Trash2, X } from "lucide-react";
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
  { key: "ctl", name: "교수학습지원센터", color: "#10B981", bg: "bg-ys-gold/10", text: "text-[#8A6212]" },
  { key: "career_center", name: "취창업진로지원센터", color: "#3B82F6", bg: "bg-ys-blue/10", text: "text-ys-blue" },
  { key: "counseling_center", name: "학생생활상담센터", color: "#8B5CF6", bg: "bg-ys-blue/10", text: "text-ys-blue" },
];

const STATUS_OPTIONS = ["신청", "확인", "완료", "취소"];

export default function AdminReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [deptMap, setDeptMap] = useState<Record<string, string>>({});
  const [myRole, setMyRole] = useState("");
  const [filterCenter, setFilterCenter] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [filterDate, setFilterDate] = useState("");
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [myStaffId, setMyStaffId] = useState("");
  const [showCounselForm, setShowCounselForm] = useState<string | null>(null);
  const [counselForm, setCounselForm] = useState({ category: "일반", content: "", action_plan: "", follow_up_needed: false, follow_up_date: "" });
  const [counselSaving, setCounselSaving] = useState(false);
  // 직접 예약 추가
  const [showAddReservation, setShowAddReservation] = useState(false);
  const [addResForm, setAddResForm] = useState({ student_id: "", reservation_date: "", time_slot: "", purpose: "" });
  const [addResSearch, setAddResSearch] = useState("");
  const [allStudents, setAllStudents] = useState<{ student_id: string; name: string | null }[]>([]);
  // 비교과 대리 신청
  const [showAddExtra, setShowAddExtra] = useState(false);
  const [addExtraForm, setAddExtraForm] = useState({ student_id: "", extracurricular_id: 0 });
  const [addExtraSearch, setAddExtraSearch] = useState("");
  const [extraList, setExtraList] = useState<{ id: number; name: string }[]>([]);
  const [addSaving, setAddSaving] = useState(false);

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
    setAllStudents((studentsRes.data ?? []).map((s: any) => ({ student_id: s.student_id, name: s.name })));

    const { data: exData } = await supabase.from("extracurricular").select("id, name").eq("is_active", true).order("name");
    setExtraList((exData ?? []) as { id: number; name: string }[]);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = reservations;
    if (filterCenter !== "all") list = list.filter((r) => r.center_type === filterCenter);
    if (filterStatus !== "all") list = list.filter((r) => r.status === filterStatus);
    if (filterDate) list = list.filter((r) => r.reservation_date === filterDate);
    return list;
  }, [reservations, filterCenter, filterStatus, filterDate]);

  // 통계 (선택된 센터 기준)
  // 캘린더 데이터
  const calendarData = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const days: { date: string; day: number; reservations: typeof reservations }[] = [];
    const base = filterCenter === "all" ? reservations : reservations.filter((r) => r.center_type === filterCenter);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ date: dateStr, day: d, reservations: base.filter((r) => r.reservation_date === dateStr && r.status !== "취소") });
    }
    return { year, month, firstDay, days };
  }, [reservations, calendarMonth, filterCenter]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const base = filterCenter === "all" ? reservations : reservations.filter((r) => r.center_type === filterCenter);
    return {
      total: base.length,
      pending: base.filter((r) => r.status === "신청").length,
      today: base.filter((r) => r.reservation_date === today && r.status !== "취소").length,
      completed: base.filter((r) => r.status === "완료").length,
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

  const TIME_SLOTS = ["09:00-09:30","09:30-10:00","10:00-10:30","10:30-11:00","11:00-11:30","11:30-12:00","13:00-13:30","13:30-14:00","14:00-14:30","14:30-15:00","15:00-15:30","15:30-16:00","16:00-16:30","16:30-17:00"];

  const filteredAddStudents = addResSearch.trim()
    ? allStudents.filter((s) => s.student_id.includes(addResSearch.trim()) || (s.name ?? "").toLowerCase().includes(addResSearch.trim().toLowerCase())).slice(0, 15)
    : [];

  const filteredExtraStudents = addExtraSearch.trim()
    ? allStudents.filter((s) => s.student_id.includes(addExtraSearch.trim()) || (s.name ?? "").toLowerCase().includes(addExtraSearch.trim().toLowerCase())).slice(0, 15)
    : [];

  const handleAddReservation = async () => {
    if (!addResForm.student_id || !addResForm.reservation_date || !addResForm.time_slot) return;
    setAddSaving(true);
    const centerType = filterCenter !== "all" ? filterCenter : myRole;
    const { error } = await supabase.from("center_reservations").insert({
      student_id: addResForm.student_id,
      center_type: ["ctl", "career_center", "counseling_center"].includes(centerType) ? centerType : "ctl",
      reservation_date: addResForm.reservation_date,
      time_slot: addResForm.time_slot,
      purpose: addResForm.purpose.trim() || "현장 방문 (담당자 입력)",
      status: "확인",
    });
    if (error) {
      alert(error.message.includes("duplicate") || error.message.includes("unique") ? "해당 시간대에 이미 예약이 있습니다. 다른 시간을 선택해주세요." : error.message);
      setAddSaving(false); return;
    } else {
      // 마일리지 5점
      const cName = CENTERS.find((c) => c.key === centerType)?.name ?? "";
      await supabase.from("mileage_records").insert({ student_id: addResForm.student_id, points: 5, reason: `센터 상담 예약: ${cName}`, source_type: "center_reservation" });
      setShowAddReservation(false);
      setAddResForm({ student_id: "", reservation_date: "", time_slot: "", purpose: "" });
      setAddResSearch("");
      await load();
    }
    setAddSaving(false);
  };

  const handleAddExtraForStudent = async () => {
    if (!addExtraForm.student_id || !addExtraForm.extracurricular_id) return;
    setAddSaving(true);
    const { error } = await supabase.from("student_extracurricular").upsert({
      student_id: addExtraForm.student_id,
      extracurricular_id: addExtraForm.extracurricular_id,
      status: "신청",
    }, { onConflict: "student_id,extracurricular_id" });
    if (error) { alert(error.message); } else {
      // 여기서는 '신청' 상태로만 넣는다. 마일리지는 완료 처리 시점에 지급한다
      // (lib/extracurricular.ts 의 awardExtracurricularMileage).
      setShowAddExtra(false);
      setAddExtraForm({ student_id: "", extracurricular_id: 0 });
      setAddExtraSearch("");
      alert("신청 완료되었습니다.");
    }
    setAddSaving(false);
  };

  const handleDeleteReservation = async (id: number) => {
    if (!confirm("이 예약을 삭제하시겠습니까?")) return;
    await supabase.from("center_reservations").delete().eq("id", id);
    await load();
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
        <h2 className="text-lg font-bold text-ys-ink">예약 관리</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setShowAddReservation(true); setAddResForm({ student_id: "", reservation_date: "", time_slot: "", purpose: "" }); setAddResSearch(""); }}
            className="flex items-center gap-1.5 rounded-lg bg-ys-blue px-4 py-2 text-sm font-medium text-white hover:bg-ys-blue/90">
            <Plus className="h-4 w-4" /> 예약 추가
          </button>
          <button type="button" onClick={() => { setShowAddExtra(true); setAddExtraForm({ student_id: "", extracurricular_id: 0 }); setAddExtraSearch(""); }}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            <Plus className="h-4 w-4" /> 비교과 대리신청
          </button>
          <div className="flex rounded-lg border border-slate-300 bg-white">
            <button type="button" onClick={() => setViewMode("list")} className={`px-3 py-2 text-xs font-medium ${viewMode === "list" ? "bg-slate-800 text-white rounded-l-lg" : "text-ys-ink-soft"}`}>목록</button>
            <button type="button" onClick={() => setViewMode("calendar")} className={`px-3 py-2 text-xs font-medium ${viewMode === "calendar" ? "bg-slate-800 text-white rounded-r-lg" : "text-ys-ink-soft"}`}>캘린더</button>
          </div>
          <button type="button" onClick={downloadCSV} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      {/* 센터명 표시 */}
      {filterCenter !== "all" && (
        <div className="mb-4">
          <h3 className="text-base font-semibold text-ys-ink">{CENTERS.find((c) => c.key === filterCenter)?.name} 예약 현황</h3>
        </div>
      )}

      {/* 통계 */}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm cursor-pointer hover:ring-2 hover:ring-slate-300" onClick={() => setFilterStatus("all")}>
          <p className="text-xs text-ys-ink-soft">{filterCenter === "all" ? "전체" : CENTERS.find((c) => c.key === filterCenter)?.name} 예약</p>
          <p className="mt-1 text-xl font-bold text-ys-ink">{stats.total}건</p>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-ys-blue/10 p-4 shadow-sm cursor-pointer hover:ring-2 hover:ring-yellow-300" onClick={() => setFilterStatus("신청")}>
          <p className="text-xs text-ys-blue">대기 중 (신청)</p>
          <p className="mt-1 text-xl font-bold text-ys-blue">{stats.pending}건</p>
        </div>
        <div className="rounded-xl border border-ys-blue/30 bg-ys-blue/10 p-4 shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-300" onClick={() => { setFilterStatus("all"); setFilterDate(new Date().toISOString().split("T")[0]); }}>
          <p className="text-xs text-ys-blue">오늘 예약</p>
          <p className="mt-1 text-xl font-bold text-ys-blue">{stats.today}건</p>
        </div>
        <div className="rounded-xl border border-ys-gold/30 bg-ys-gold/10 p-4 shadow-sm cursor-pointer hover:ring-2 hover:ring-green-300" onClick={() => setFilterStatus("완료")}>
          <p className="text-xs text-[#8A6212]">완료</p>
          <p className="mt-1 text-xl font-bold text-[#8A6212]">{stats.completed}건</p>
        </div>
      </div>

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-ys-ink-soft/70" />
        <select value={filterCenter} onChange={(e) => setFilterCenter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {CENTERS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="all">전체 상태</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        {filterDate && <button type="button" onClick={() => setFilterDate("")} className="text-xs text-ys-ink-soft hover:text-ys-ink">날짜 초기화</button>}
      </div>

      {/* 캘린더 뷰 */}
      {viewMode === "calendar" && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={() => {
              const [y, m] = calendarMonth.split("-").map(Number);
              const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
              setCalendarMonth(prev);
            }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-ys-ink-soft hover:bg-ys-paper">◀ 이전</button>
            <h3 className="text-base font-semibold text-ys-ink">{calendarData.year}년 {calendarData.month}월</h3>
            <button type="button" onClick={() => {
              const [y, m] = calendarMonth.split("-").map(Number);
              const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
              setCalendarMonth(next);
            }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-ys-ink-soft hover:bg-ys-paper">다음 ▶</button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
              <div key={d} className={`text-center text-xs font-semibold py-1 ${d === "일" ? "text-red-500" : d === "토" ? "text-ys-blue" : "text-ys-ink-soft"}`}>{d}</div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calendarData.firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
            {calendarData.days.map((day) => {
              const today = new Date().toISOString().split("T")[0];
              const isToday = day.date === today;
              const hasRes = day.reservations.length > 0;
              const dayOfWeek = new Date(day.date).getDay();
              return (
                <div key={day.date}
                  className={`min-h-[70px] rounded-lg border p-1.5 text-xs transition cursor-pointer hover:bg-ys-paper ${isToday ? "border-ys-blue bg-ys-blue/10" : "border-slate-200"}`}
                  onClick={() => { setFilterDate(day.date); setViewMode("list"); }}>
                  <div className={`font-medium ${dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-ys-blue" : "text-ys-ink"}`}>{day.day}</div>
                  {hasRes && (
                    <div className="mt-0.5 space-y-0.5">
                      {day.reservations.slice(0, 3).map((r, i) => {
                        const center = CENTERS.find((c) => c.key === r.center_type);
                        return (
                          <div key={i} className={`truncate rounded px-1 py-0.5 text-[9px] ${
                            r.status === "신청" ? "bg-yellow-100 text-yellow-800" :
                            r.status === "확인" ? "bg-ys-blue/15 text-ys-blue" :
                            "bg-green-100 text-[#8A6212]"
                          }`}>
                            {r.time_slot.split("-")[0]} {nameMap[r.student_id]?.substring(0, 3) ?? r.student_id}
                          </div>
                        );
                      })}
                      {day.reservations.length > 3 && (
                        <div className="text-[9px] text-ys-ink-soft/70">+{day.reservations.length - 3}건</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 범례 */}
          <div className="mt-3 flex gap-4 text-[10px] text-ys-ink-soft">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-yellow-200" /> 신청</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-ys-blue/25" /> 확인</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-green-200" /> 완료</span>
          </div>
        </div>
      )}

      {/* 예약 목록 */}
      {viewMode === "list" && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-ys-paper">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">센터</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">학번 / 이름</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">학과</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">날짜 / 시간</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">목적</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">상태</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-ys-ink-soft">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-ys-ink-soft">예약이 없습니다.</td></tr>
            ) : (
              filtered.map((r) => {
                const center = centerLabel(r.center_type);
                return (
                  <tr key={r.id} className={`hover:bg-ys-paper ${r.status === "취소" ? "opacity-40" : ""}`}>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${center?.bg ?? ""} ${center?.text ?? ""}`}>{center?.name ?? r.center_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-ys-ink">{r.student_id}</p>
                      <p className="text-xs text-ys-ink-soft">{nameMap[r.student_id] ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ys-ink-soft">{deptMap[r.student_id] ?? "-"}</td>
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-1 text-sm text-ys-ink"><Calendar className="h-3 w-3 text-ys-ink-soft/70" />{r.reservation_date}</p>
                      <p className="flex items-center gap-1 text-xs text-ys-ink-soft"><Clock className="h-3 w-3 text-ys-ink-soft/70" />{r.time_slot}</p>
                    </td>
                    <td className="max-w-[150px] px-4 py-3">
                      <p className="truncate text-xs text-ys-ink-soft">{r.purpose ?? "-"}</p>
                      {r.admin_note && <p className="mt-0.5 truncate rounded bg-ys-blue/10 px-1.5 py-0.5 text-[10px] text-ys-blue">{r.admin_note}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <select value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value)}
                        className={`rounded-lg border px-2 py-1 text-xs font-medium ${
                          r.status === "신청" ? "border-yellow-300 bg-ys-blue/10 text-ys-blue" :
                          r.status === "확인" ? "border-ys-blue/40 bg-ys-blue/10 text-ys-blue" :
                          r.status === "완료" ? "border-green-300 bg-ys-gold/15 text-[#8A6212]" :
                          "border-slate-200 bg-ys-paper text-ys-ink-soft/70"
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
                        className="mr-1 text-ys-ink-soft/70 hover:text-ys-blue" title="메모">
                        <MessageSquare className="inline h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => handleDeleteReservation(r.id)}
                        className="text-red-400 hover:text-red-600" title="삭제">
                        <Trash2 className="inline h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>}

      {/* 메모 모달 */}
      {editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingNote(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-ys-ink">관리자 메모</h3>
            <p className="mt-1 text-xs text-ys-ink-soft">학생에게 표시되는 메모입니다.</p>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} placeholder="상담 내용, 준비사항 등"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setEditingNote(null)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">취소</button>
              <button type="button" onClick={() => handleSaveNote(editingNote)} className="flex-1 rounded-lg bg-ys-blue py-2 text-sm font-medium text-white hover:bg-ys-blue/90">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 예약 직접 추가 모달 */}
      {showAddReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAddReservation(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-ys-ink">예약 직접 추가</h3>
            <p className="mt-1 text-xs text-ys-ink-soft">현장 방문 학생의 예약을 담당자가 직접 입력합니다.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-ys-ink">학생 검색 *</label>
                <input type="text" placeholder="학번 입력 (예: 22403020)" value={addResForm.student_id}
                  onChange={(e) => setAddResForm({ ...addResForm, student_id: e.target.value.trim() })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                {addResForm.student_id && nameMap[addResForm.student_id] && (
                  <p className="mt-1 text-xs text-[#8A6212]">학생: {nameMap[addResForm.student_id]}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ys-ink">날짜 *</label>
                <input type="date" value={addResForm.reservation_date} onChange={(e) => setAddResForm({ ...addResForm, reservation_date: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ys-ink">시간대 *</label>
                <select value={addResForm.time_slot} onChange={(e) => setAddResForm({ ...addResForm, time_slot: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">선택</option>
                  {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ys-ink">상담 목적</label>
                <input type="text" value={addResForm.purpose} onChange={(e) => setAddResForm({ ...addResForm, purpose: e.target.value })}
                  placeholder="현장 방문" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAddReservation(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">취소</button>
                <button type="button" onClick={handleAddReservation} disabled={addSaving || !addResForm.student_id || !addResForm.reservation_date || !addResForm.time_slot}
                  className="flex-1 rounded-lg bg-ys-blue py-2 text-sm font-medium text-white hover:bg-ys-blue/90 disabled:opacity-50">
                  {addSaving ? "등록 중..." : "예약 등록"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 비교과 대리 신청 모달 */}
      {showAddExtra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAddExtra(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-ys-ink">비교과 대리 신청</h3>
            <p className="mt-1 text-xs text-ys-ink-soft">현장 방문 학생의 비교과 프로그램을 담당자가 대리 신청합니다.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-ys-ink">학생 검색 *</label>
                <input type="text" placeholder="학번 입력 (예: 22403020)" value={addExtraForm.student_id}
                  onChange={(e) => setAddExtraForm({ ...addExtraForm, student_id: e.target.value.trim() })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                {addExtraForm.student_id && nameMap[addExtraForm.student_id] && (
                  <p className="mt-1 text-xs text-[#8A6212]">학생: {nameMap[addExtraForm.student_id]}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ys-ink">비교과 프로그램 *</label>
                <select value={addExtraForm.extracurricular_id} onChange={(e) => setAddExtraForm({ ...addExtraForm, extracurricular_id: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value={0}>선택</option>
                  {extraList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAddExtra(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">취소</button>
                <button type="button" onClick={handleAddExtraForStudent} disabled={addSaving || !addExtraForm.student_id || !addExtraForm.extracurricular_id}
                  className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                  {addSaving ? "신청 중..." : "대리 신청"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 상담기록 작성 모달 */}
      {showCounselForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCounselForm(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-ys-ink">상담기록 작성</h3>
            <p className="mt-1 text-sm text-ys-ink-soft">학생: {showCounselForm} - {nameMap[showCounselForm] ?? ""}</p>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-ys-ink">분류</label>
                  <select value={counselForm.category} onChange={(e) => setCounselForm({ ...counselForm, category: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {COUNSEL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-ys-ink">
                    <input type="checkbox" checked={counselForm.follow_up_needed} onChange={(e) => setCounselForm({ ...counselForm, follow_up_needed: e.target.checked })} className="rounded" />
                    후속 상담 필요
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-ys-ink">상담 내용 *</label>
                <textarea value={counselForm.content} onChange={(e) => setCounselForm({ ...counselForm, content: e.target.value })} rows={4}
                  placeholder="상담 내용을 기록하세요." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ys-ink">조치 계획 (선택)</label>
                <input type="text" value={counselForm.action_plan} onChange={(e) => setCounselForm({ ...counselForm, action_plan: e.target.value })}
                  placeholder="향후 조치 사항" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              {counselForm.follow_up_needed && (
                <div>
                  <label className="block text-xs font-medium text-ys-ink">후속 상담일</label>
                  <input type="date" value={counselForm.follow_up_date} onChange={(e) => setCounselForm({ ...counselForm, follow_up_date: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCounselForm(null)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">취소</button>
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
