"use client";

import { Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseCsv } from "@/lib/csv";
import AdminLayout from "@/components/AdminLayout";

type Student = { student_id: string; name: string | null; role: string | null; department_id: number | null };
type MentoringGroup = { id: number; mentor_id: string; student_id: string };
type Department = { id: number; name: string };

const ROLE_LABELS: Record<string, string> = {
  student: "학생",
  admin: "관리자",
  department_head: "학과장",
  mentor_professor: "멘토링교수",
  ctl: "교수학습지원센터",
  career_center: "취창업진로지원센터",
  counseling_center: "학생생활상담센터",
};

export default function AdminMentoringPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<MentoringGroup[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedMentor, setSelectedMentor] = useState<string>("");
  const [addStudentId, setAddStudentId] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const [studentsRes, groupsRes, deptRes] = await Promise.all([
      fetch("/api/admin/students", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      supabase.from("mentoring_groups").select("*").order("mentor_id"),
      supabase.from("departments").select("*"),
    ]);
    setStudents(studentsRes ?? []);
    setGroups(groupsRes.data ?? []);
    setDepartments(deptRes.data ?? []);
  };

  useEffect(() => { load(); }, []);

  const mentors = useMemo(() => {
    return students.filter((s) =>
      ["mentor_professor", "department_head"].includes((s.role ?? "").trim().toLowerCase())
    );
  }, [students]);

  const studentMap = useMemo(() => {
    const m: Record<string, Student> = {};
    students.forEach((s) => (m[s.student_id] = s));
    return m;
  }, [students]);

  const deptMap = useMemo(() => {
    const m: Record<number, string> = {};
    departments.forEach((d) => (m[d.id] = d.name));
    return m;
  }, [departments]);

  const mentorGroups = useMemo(() => {
    if (!selectedMentor) return [];
    return groups.filter((g) => g.mentor_id === selectedMentor);
  }, [groups, selectedMentor]);

  const availableStudents = useMemo(() => {
    const assigned = new Set(mentorGroups.map((g) => g.student_id));
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => (s.role ?? "").trim().toLowerCase() === "student")
      .filter((s) => !assigned.has(s.student_id))
      .filter((s) => {
        if (!q) return true;
        return s.student_id.toLowerCase().includes(q) || (s.name ?? "").toLowerCase().includes(q);
      });
  }, [students, mentorGroups, search]);

  const handleAddStudent = async (studentId: string) => {
    if (!selectedMentor || !studentId) return;
    const { error } = await supabase.from("mentoring_groups").insert({
      mentor_id: selectedMentor,
      student_id: studentId,
    });
    if (error) { alert(error.message); return; }
    await load();
    setAddStudentId("");
  };

  // CSV 일괄 배정
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [csvProcessing, setCsvProcessing] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { alert("유효한 데이터가 없습니다."); e.target.value = ""; return; }

    setCsvProcessing(true);
    setCsvResult(null);
    let success = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const mentorId = (row.mentor_id ?? "").trim();
      const studentId = (row.student_id ?? "").trim();
      if (!mentorId || !studentId) { errors.push("mentor_id 또는 student_id 누락"); continue; }

      // 멘토가 students에 없으면 자동 생성
      const { data: mentorExists } = await supabase.from("students").select("student_id").eq("student_id", mentorId).maybeSingle();
      if (!mentorExists) {
        const res = await fetch("/api/admin/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ student_id: mentorId, password: mentorId, name: (row.mentor_name ?? "").trim() || null, role: "mentor_professor" }),
        });
        if (!res.ok) { errors.push(`멘토 ${mentorId} 자동생성 실패`); continue; }
      }

      const { error } = await supabase.from("mentoring_groups").upsert(
        { mentor_id: mentorId, student_id: studentId },
        { onConflict: "mentor_id,student_id" }
      );
      if (error) { errors.push(`${mentorId}→${studentId}: ${error.message}`); } else { success++; }
    }

    setCsvResult({ success, failed: errors.length, errors });
    setCsvProcessing(false);
    await load();
    e.target.value = "";
  };

  const handleRemoveStudent = async (groupId: number) => {
    if (!confirm("이 학생을 멘토링 그룹에서 제외하시겠습니까?")) return;
    await supabase.from("mentoring_groups").delete().eq("id", groupId);
    await load();
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">멘토링 그룹 관리</h2>
          <p className="mt-1 text-sm text-slate-600">멘토링교수 또는 학과장에게 학생 그룹을 배정합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => { setCsvResult(null); setShowCsvUpload(true); }}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Upload className="h-4 w-4" /> CSV 일괄 배정
        </button>
      </div>

      {/* 멘토 선택 */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">멘토 선택</label>
        <select
          value={selectedMentor}
          onChange={(e) => setSelectedMentor(e.target.value)}
          className="mt-2 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">멘토를 선택하세요...</option>
          {mentors.map((m) => (
            <option key={m.student_id} value={m.student_id}>
              {m.name ?? m.student_id} ({ROLE_LABELS[(m.role ?? "").trim().toLowerCase()] ?? m.role})
              {m.department_id ? ` - ${deptMap[m.department_id] ?? ""}` : ""}
            </option>
          ))}
        </select>
        {mentors.length === 0 && (
          <p className="mt-2 text-xs text-amber-600">멘토링교수 또는 학과장 역할이 부여된 계정이 없습니다. 학생 관리에서 역할을 변경해주세요.</p>
        )}
      </div>

      {selectedMentor && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 현재 그룹 */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Users className="h-4 w-4" />
                배정된 학생 ({mentorGroups.length}명)
              </h3>
            </div>
            {mentorGroups.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">배정된 학생이 없습니다.</p>
            ) : (
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">학번</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">이름</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-slate-600">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mentorGroups.map((g) => {
                    const s = studentMap[g.student_id];
                    return (
                      <tr key={g.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-sm text-slate-900">{g.student_id}</td>
                        <td className="px-4 py-2 text-sm text-slate-600">{s?.name ?? "-"}</td>
                        <td className="px-4 py-2 text-right">
                          <button type="button" onClick={() => handleRemoveStudent(g.id)} className="text-red-500 hover:text-red-700">
                            <Trash2 className="inline h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* 학생 추가 */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-800">학생 추가</h3>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="학번 또는 이름 검색..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                />
              </div>
            </div>
            <div className="max-h-[400px] overflow-auto">
              {availableStudents.slice(0, 50).map((s) => (
                <div key={s.student_id} className="flex items-center justify-between border-b border-slate-100 px-5 py-2 last:border-0 hover:bg-slate-50">
                  <div>
                    <span className="text-sm text-slate-900">{s.student_id}</span>
                    <span className="ml-2 text-sm text-slate-500">{s.name ?? ""}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddStudent(s.student_id)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                  >
                    <Plus className="h-3 w-3" /> 추가
                  </button>
                </div>
              ))}
              {availableStudents.length > 50 && (
                <p className="px-5 py-2 text-xs text-slate-400">검색으로 범위를 좁혀주세요 ({availableStudents.length}명)</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CSV 일괄 배정 모달 */}
      {showCsvUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCsvUpload(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
            <h3 className="text-lg font-semibold text-slate-900">멘토링 CSV 일괄 배정</h3>
            <p className="mt-1 text-sm text-slate-500">헤더: mentor_id, student_id</p>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 font-mono">
              mentor_id,student_id<br/>
              PROF001,22501001<br/>
              PROF001,22501002<br/>
              PROF002,22601001
            </div>
            <p className="mt-2 text-xs text-slate-400">이미 배정된 관계는 무시되고 새 관계만 추가됩니다.</p>
            {csvProcessing && <p className="mt-3 text-sm text-blue-600">처리 중...</p>}
            {csvResult && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm">성공: <strong className="text-green-600">{csvResult.success}건</strong>, 실패: <strong className="text-red-600">{csvResult.failed}건</strong></p>
                {csvResult.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-auto text-xs text-red-600">
                    {csvResult.errors.map((err, i) => <p key={i}>{err}</p>)}
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {!csvProcessing && (
                <button type="button" onClick={() => csvRef.current?.click()} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  <Upload className="h-4 w-4" /> 파일 선택
                </button>
              )}
              <button type="button" onClick={() => setShowCsvUpload(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">닫기</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
