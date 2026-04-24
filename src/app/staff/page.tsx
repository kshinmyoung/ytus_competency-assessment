"use client";

import { Download, LogOut, Search, Trophy } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

type StudentMileage = {
  student_id: string;
  name: string | null;
  department_name: string;
  total: number;
};

export default function StaffPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [students, setStudents] = useState<StudentMileage[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"mileage" | "name" | "id">("mileage");

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid?.trim()) { router.replace("/login"); return; }

      const { data: me } = await supabase.from("students").select("role").eq("student_id", sid.trim()).maybeSingle();
      const role = (me?.role ?? "").trim().toLowerCase();
      if (!["staff", "admin"].includes(role)) { router.replace("/dashboard"); return; }
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

  const downloadCSV = () => {
    let csv = "학번,이름,학과,마일리지\n";
    filtered.forEach((s) => { csv += `"${s.student_id}","${s.name ?? ""}","${s.department_name}","${s.total}"\n`; });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "student_mileage.csv"; a.click();
  };

  const handleLogout = async () => { await supabase.auth.signOut(); sessionStorage.clear(); router.push("/login"); };

  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="text-slate-500">확인 중...</p></div>;
  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="YOUNG SHINY" width={140} height={32} className="h-8 w-auto" />
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">직원</span>
          </div>
          <button type="button" onClick={handleLogout} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900">
            <LogOut className="h-4 w-4" /> 로그아웃
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-xl font-bold text-slate-900">학생 마일리지 현황</h1>

        {/* 통계 */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">전체 학생</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{students.length}명</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs text-amber-700">마일리지 보유 학생</p>
            <p className="mt-1 text-xl font-bold text-amber-700">{students.filter((s) => s.total > 0).length}명</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs text-amber-700">총 부여 마일리지</p>
            <p className="mt-1 text-xl font-bold text-amber-700">{totalMileage}점</p>
          </div>
        </div>

        {/* 필터 */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="학번 또는 이름 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
          </div>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="mileage">마일리지 높은순</option>
            <option value="name">이름순</option>
            <option value="id">학번순</option>
          </select>
          <button type="button" onClick={downloadCSV} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>

        {/* 목록 */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">학번</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">이름</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">학과</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">마일리지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">학생이 없습니다.</td></tr>
              ) : filtered.map((s) => (
                <tr key={s.student_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900">{s.student_id}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{s.name ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{s.department_name || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`rounded-full px-2.5 py-1 text-sm font-bold ${s.total > 0 ? "bg-amber-50 text-amber-700" : "text-slate-400"}`}>
                      {s.total}점
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
