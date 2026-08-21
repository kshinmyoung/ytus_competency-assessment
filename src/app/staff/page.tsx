"use client";

import { Download, Edit3, LogOut, Plus, Search, Trash2, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

type StudentMileage = {
  student_id: string;
  name: string | null;
  department_name: string;
  total: number;
};
type MileageRecord = {
  id: number;
  student_id: string;
  points: number;
  reason: string;
  source_type: string;
  created_at: string;
};

export default function StaffPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [students, setStudents] = useState<StudentMileage[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"mileage" | "name" | "id">("mileage");
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentMileage | null>(null);
  const [mileageHistory, setMileageHistory] = useState<MileageRecord[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ points: 0, reason: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid?.trim()) { router.replace("/login"); return; }

      const { data: me } = await supabase.from("students").select("role").eq("student_id", sid.trim()).maybeSingle();
      const role = (me?.role ?? "").trim().toLowerCase();
      if (!["staff", "admin"].includes(role)) { router.replace("/dashboard"); return; }
      setIsAdmin(role === "admin");
      setAuthorized(true);

      // 모든 학생 + 마일리지
      const [studRes, deptRes, mileRes] = await Promise.all([
        supabase.from("students").select("student_id, name, department_id").eq("role", "student"),
        supabase.from("departments").select("id, name"),
        supabase.from("mileage_records").select("student_id, points"),
      ]);

      const deptMap: Record<number, string> = {};
      (deptRes.data ?? []).forEach((d: any) => { deptMap[d.id] = d.name; });

      const mileMap: Record<string, number> = {};
      (mileRes.data ?? []).forEach((m: any) => { mileMap[m.student_id] = (mileMap[m.student_id] ?? 0) + (m.points ?? 0); });

      const list: StudentMileage[] = (studRes.data ?? []).map((s: any) => ({
        student_id: s.student_id,
        name: s.name,
        department_name: s.department_id ? deptMap[s.department_id] ?? "" : "",
        total: mileMap[s.student_id] ?? 0,
      }));

      setStudents(list);
    })();
  }, [router]);

  const filtered = useMemo(() => {
    let list = students;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.student_id.toLowerCase().includes(q) || (s.name ?? "").toLowerCase().includes(q));
    if (sortBy === "mileage") list = [...list].sort((a, b) => b.total - a.total);
    else if (sortBy === "name") list = [...list].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    else list = [...list].sort((a, b) => a.student_id.localeCompare(b.student_id));
    return list;
  }, [students, search, sortBy]);

  const totalMileage = useMemo(() => students.reduce((s, st) => s + st.total, 0), [students]);

  const viewMileage = async (student: StudentMileage) => {
    setSelectedStudent(student);
    setShowAddForm(false);
    const { data } = await supabase.from("mileage_records").select("*").eq("student_id", student.student_id).order("created_at", { ascending: false });
    setMileageHistory((data ?? []) as MileageRecord[]);
  };

  const reloadMileage = async () => {
    if (!selectedStudent) return;
    const { data } = await supabase.from("mileage_records").select("*").eq("student_id", selectedStudent.student_id).order("created_at", { ascending: false });
    setMileageHistory((data ?? []) as MileageRecord[]);
    // 전체 목록도 갱신
    const newTotal = (data ?? []).reduce((s: number, m: any) => s + (m.points ?? 0), 0);
    setStudents((prev) => prev.map((st) => st.student_id === selectedStudent.student_id ? { ...st, total: newTotal } : st));
    setSelectedStudent((prev) => prev ? { ...prev, total: newTotal } : prev);
  };

  const handleAddMileage = async () => {
    if (!selectedStudent || !addForm.reason.trim() || addForm.points === 0) return;
    setSaving(true);
    await supabase.from("mileage_records").insert({
      student_id: selectedStudent.student_id,
      points: addForm.points,
      reason: addForm.reason.trim(),
      source_type: "manual",
    });
    setSaving(false);
    setShowAddForm(false);
    setAddForm({ points: 0, reason: "" });
    await reloadMileage();
  };

  const handleDeleteMileage = async (id: number) => {
    if (!confirm("이 마일리지 이력을 삭제하시겠습니까?")) return;
    await supabase.from("mileage_records").delete().eq("id", id);
    await reloadMileage();
  };

  const downloadCSV = () => {
    let csv = "학번,이름,학과,마일리지\n";
    filtered.forEach((s) => { csv += `"${s.student_id}","${s.name ?? ""}","${s.department_name}","${s.total}"\n`; });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "student_mileage.csv"; a.click();
  };

  const handleLogout = async () => { await supabase.auth.signOut(); sessionStorage.clear(); router.push("/login"); };

  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-ys-paper"><p className="text-ys-ink-soft">확인 중...</p></div>;
  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-ys-paper">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="YOUNG SHINY" width={212} height={40} className="h-8 w-auto" />
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-[#8A6212]">직원</span>
          </div>
          <Link href="/admin/survey" className="flex items-center gap-1.5 rounded-lg border border-ys-blue/40 bg-ys-blue/10 px-3 py-2 text-sm font-medium text-ys-blue hover:bg-ys-blue/15">설문 결과</Link>
          <button type="button" onClick={handleLogout} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900">
            <LogOut className="h-4 w-4" /> 로그아웃
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-bold text-ys-ink">학생 마일리지 현황</h1>

        {/* 통계 */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-ys-ink-soft">전체 학생</p>
            <p className="mt-1 text-xl font-bold text-ys-ink">{students.length}명</p>
          </div>
          <div className="rounded-xl border border-ys-gold/30 bg-ys-gold/10 p-4 shadow-sm">
            <p className="text-xs text-[#8A6212]">마일리지 보유 학생</p>
            <p className="mt-1 text-xl font-bold text-[#8A6212]">{students.filter((s) => s.total > 0).length}명</p>
          </div>
          <div className="rounded-xl border border-ys-gold/30 bg-ys-gold/10 p-4 shadow-sm">
            <p className="text-xs text-[#8A6212]">총 부여 마일리지</p>
            <p className="mt-1 text-xl font-bold text-[#8A6212]">{totalMileage}점</p>
          </div>
        </div>

        {/* 필터 */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ys-ink-soft/70" />
            <input type="text" placeholder="학번 또는 이름 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="mileage">마일리지 높은순</option>
            <option value="name">이름순</option>
            <option value="id">학번순</option>
          </select>
          <button type="button" onClick={downloadCSV} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>

        {/* 목록 */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-ys-paper">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">학번</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">이름</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">학과</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-ys-ink-soft">마일리지</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-ys-ink-soft">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ys-ink-soft">학생이 없습니다.</td></tr>
              ) : filtered.map((s) => (
                <tr key={s.student_id} className="hover:bg-ys-paper">
                  <td className="px-4 py-3 text-sm text-ys-ink">{s.student_id}</td>
                  <td className="px-4 py-3 text-sm text-ys-ink-soft">{s.name ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-ys-ink-soft">{s.department_name || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`rounded-full px-2.5 py-1 text-sm font-bold ${s.total > 0 ? "bg-ys-gold/10 text-[#8A6212]" : "text-ys-ink-soft/70"}`}>
                      {s.total}점
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => viewMileage(s)} className="text-sm font-medium text-ys-blue hover:text-ys-blue">상세</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* 마일리지 상세 모달 */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedStudent(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-ys-ink">{selectedStudent.name ?? selectedStudent.student_id}</h3>
                <p className="text-sm text-ys-ink-soft">학번: {selectedStudent.student_id} · {selectedStudent.department_name}</p>
              </div>
              <div className="rounded-xl bg-ys-gold/10 px-4 py-2 text-center">
                <p className="text-xs text-[#8A6212]">총 마일리지</p>
                <p className="text-xl font-bold text-[#8A6212]">{selectedStudent.total}점</p>
              </div>
            </div>

            {/* admin만: 마일리지 추가/차감 */}
            {isAdmin && (
              <div className="mb-4">
                {!showAddForm ? (
                  <button type="button" onClick={() => { setShowAddForm(true); setAddForm({ points: 0, reason: "" }); }}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
                    <Plus className="h-4 w-4" /> 마일리지 추가/차감
                  </button>
                ) : (
                  <div className="rounded-xl border border-ys-gold/30 bg-ys-gold/10 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-ys-ink">점수 (음수=차감)</label>
                        <input type="number" value={addForm.points} onChange={(e) => setAddForm({ ...addForm, points: Number(e.target.value) })}
                          placeholder="예: 10 또는 -5" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ys-ink">사유 *</label>
                        <input type="text" value={addForm.reason} onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })}
                          placeholder="사유 입력" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => setShowAddForm(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-medium text-ys-ink hover:bg-ys-paper">취소</button>
                      <button type="button" onClick={handleAddMileage} disabled={saving || !addForm.reason.trim() || addForm.points === 0}
                        className="flex-1 rounded-lg bg-amber-600 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                        {saving ? "저장 중..." : addForm.points > 0 ? `+${addForm.points}점 추가` : `${addForm.points}점 차감`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 마일리지 이력 */}
            <h4 className="mb-2 text-sm font-semibold text-ys-ink">마일리지 이력</h4>
            {mileageHistory.length === 0 ? (
              <p className="py-4 text-center text-sm text-ys-ink-soft">마일리지 이력이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {mileageHistory.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2.5">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${m.points > 0 ? "bg-ys-gold/15 text-[#8A6212]" : "bg-red-50 text-red-700"}`}>
                          {m.points > 0 ? `+${m.points}` : m.points}점
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-ys-ink-soft">
                          {m.source_type === "extracurricular" ? "비교과" : m.source_type === "center_reservation" ? "센터예약" : "수동"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ys-ink">{m.reason}</p>
                      <p className="mt-0.5 text-[10px] text-ys-ink-soft/70">{new Date(m.created_at).toLocaleDateString("ko-KR")}</p>
                    </div>
                    {isAdmin && (
                      <button type="button" onClick={() => handleDeleteMileage(m.id)} className="ml-2 text-red-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={() => setSelectedStudent(null)} className="mt-4 w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
