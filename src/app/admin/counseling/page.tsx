"use client";

import { Download, Filter, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminLayout from "@/components/AdminLayout";

type CounselRecord = {
  id: number; student_id: string; counselor_id: string; counselor_role: string;
  counseling_date: string; category: string; content: string; action_plan: string | null;
  follow_up_needed: boolean; follow_up_date: string | null; is_private: boolean; created_at: string;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "관리자", ctl: "CTL", career_center: "취창업", counseling_center: "상담센터",
  mentor_professor: "멘토링교수", department_head: "학과장",
};
const CATEGORY_COLORS: Record<string, string> = {
  "일반": "bg-slate-100 text-slate-700", "학업": "bg-blue-50 text-blue-700", "진로": "bg-indigo-50 text-indigo-700",
  "심리": "bg-violet-50 text-violet-700", "신앙": "bg-amber-50 text-amber-700", "생활": "bg-green-50 text-green-700", "기타": "bg-slate-100 text-slate-600",
};

export default function AdminCounselingPage() {
  const [records, setRecords] = useState<CounselRecord[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterFollowUp, setFilterFollowUp] = useState(false);

  useEffect(() => {
    (async () => {
      const [recRes, studRes] = await Promise.all([
        supabase.from("counseling_records").select("*").order("counseling_date", { ascending: false }),
        supabase.from("students").select("student_id, name"),
      ]);
      setRecords((recRes.data ?? []) as CounselRecord[]);
      const m: Record<string, string> = {};
      (studRes.data ?? []).forEach((s: any) => { m[s.student_id] = s.name ?? ""; });
      setNameMap(m);
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = records;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.student_id.includes(q) || (nameMap[r.student_id] ?? "").toLowerCase().includes(q) || (nameMap[r.counselor_id] ?? "").toLowerCase().includes(q));
    if (filterCategory !== "all") list = list.filter((r) => r.category === filterCategory);
    if (filterFollowUp) list = list.filter((r) => r.follow_up_needed && r.follow_up_date);
    return list;
  }, [records, search, filterCategory, filterFollowUp, nameMap]);

  const stats = useMemo(() => ({
    total: records.length,
    followUp: records.filter((r) => r.follow_up_needed).length,
    thisMonth: records.filter((r) => r.counseling_date.startsWith(new Date().toISOString().slice(0, 7))).length,
  }), [records]);

  const handleDelete = async (id: number) => {
    if (!confirm("이 상담기록을 삭제하시겠습니까?")) return;
    await supabase.from("counseling_records").delete().eq("id", id);
    const { data } = await supabase.from("counseling_records").select("*").order("counseling_date", { ascending: false });
    setRecords((data ?? []) as CounselRecord[]);
  };

  const downloadCSV = () => {
    let csv = "학생학번,학생이름,상담자,상담자역할,날짜,분류,내용,조치계획,후속필요,후속상담일,비공개\n";
    filtered.forEach((r) => {
      csv += `"${r.student_id}","${nameMap[r.student_id] ?? ""}","${nameMap[r.counselor_id] ?? r.counselor_id}","${ROLE_LABELS[r.counselor_role] ?? r.counselor_role}","${r.counseling_date}","${r.category}","${(r.content ?? "").replace(/"/g, '""')}","${(r.action_plan ?? "").replace(/"/g, '""')}","${r.follow_up_needed ? "Y" : "N"}","${r.follow_up_date ?? ""}","${r.is_private ? "Y" : "N"}"\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "counseling_records.csv"; a.click();
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-900">상담기록 관리</h2>
        <button type="button" onClick={downloadCSV} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Download className="h-4 w-4" /> CSV 내보내기
        </button>
      </div>

      {/* 통계 */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">전체 상담기록</p><p className="mt-1 text-xl font-bold text-slate-900">{stats.total}건</p></div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs text-red-700">후속 상담 필요</p><p className="mt-1 text-xl font-bold text-red-700">{stats.followUp}건</p></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs text-blue-700">이번 달</p><p className="mt-1 text-xl font-bold text-blue-700">{stats.thisMonth}건</p></div>
      </div>

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="학번, 이름, 상담자 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </div>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="all">전체 분류</option>
          {Object.keys(CATEGORY_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input type="checkbox" checked={filterFollowUp} onChange={(e) => setFilterFollowUp(e.target.checked)} className="rounded" />
          후속 상담만
        </label>
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><p className="text-sm text-slate-500">상담기록이 없습니다.</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-white">{r.student_id} {nameMap[r.student_id] ?? ""}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[r.category] ?? ""}`}>{r.category}</span>
                    {r.follow_up_needed && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">후속 필요</span>}
                    {r.is_private && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-500">비공개</span>}
                  </div>
                  <p className="mt-2 text-sm text-slate-800">{r.content}</p>
                  {r.action_plan && <p className="mt-1 text-xs text-blue-700">조치: {r.action_plan}</p>}
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
                    <span>상담일: {r.counseling_date}</span>
                    <span>상담자: {nameMap[r.counselor_id] ?? r.counselor_id} ({ROLE_LABELS[r.counselor_role] ?? r.counselor_role})</span>
                    {r.follow_up_date && <span>후속: {r.follow_up_date}</span>}
                  </div>
                </div>
                <button type="button" onClick={() => handleDelete(r.id)} className="ml-3 flex-shrink-0 text-red-400 hover:text-red-600" title="삭제">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
