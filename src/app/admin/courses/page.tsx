"use client";

import { Edit3, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseCsv } from "@/lib/csv";
import AdminLayout from "@/components/AdminLayout";

type CoreComp = { id: number; name: string; color_code: string };
type MajorComp = { id: number; name: string; department_id: number };
type Department = { id: number; name: string };
type Course = {
  id: number;
  name: string;
  professor: string | null;
  department_id: number | null;
  credit: number;
  semester: string | null;
  year: number | null;
  description: string | null;
  is_active: boolean;
  core_competency_tags: number[];
  major_competency_tags: number[];
};

const emptyCourse = {
  name: "",
  professor: "",
  department_id: null as number | null,
  credit: 3,
  semester: "",
  year: new Date().getFullYear(),
  description: "",
  is_active: true,
  core_competency_tags: [] as number[],
  major_competency_tags: [] as number[],
};

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [coreComps, setCoreComps] = useState<CoreComp[]>([]);
  const [majorComps, setMajorComps] = useState<MajorComp[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyCourse);
  const [saving, setSaving] = useState(false);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [showStudentCsv, setShowStudentCsv] = useState(false);
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [csvProcessing, setCsvProcessing] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const studentCsvRef = useRef<HTMLInputElement>(null);

  const loadCourses = async () => {
    const { data } = await supabase.from("courses").select("*").order("id", { ascending: false });
    setCourses(data ?? []);
  };

  useEffect(() => {
    (async () => {
      const [deptRes, coreRes, majorRes] = await Promise.all([
        supabase.from("departments").select("*").order("id"),
        supabase.from("core_competencies").select("*").order("id"),
        supabase.from("major_competencies").select("*").order("id"),
      ]);
      setDepartments(deptRes.data ?? []);
      setCoreComps(coreRes.data ?? []);
      setMajorComps(majorRes.data ?? []);
      await loadCourses();
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.professor ?? "").toLowerCase().includes(q)
    );
  }, [courses, search]);

  const filteredMajorComps = useMemo(() => {
    if (!form.department_id) return majorComps;
    return majorComps.filter((mc) => mc.department_id === form.department_id);
  }, [majorComps, form.department_id]);

  const deptMap = useMemo(() => {
    const m: Record<number, string> = {};
    departments.forEach((d) => (m[d.id] = d.name));
    return m;
  }, [departments]);

  // CSV 일괄 교과목 등록
  // 헤더: name,professor,department_id,credit,semester,year,description
  const handleCourseCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { alert("유효한 데이터가 없습니다."); e.target.value = ""; return; }

    setCsvProcessing(true);
    setCsvResult(null);
    let success = 0;
    const errors: string[] = [];

    // 학과명→id 매핑
    const deptNameMap: Record<string, number> = {};
    departments.forEach((d) => { deptNameMap[d.name] = d.id; });

    for (const row of rows) {
      if (!row.name) { errors.push("과목명 없음"); continue; }
      const deptId = row.department_id
        ? (Number(row.department_id) || deptNameMap[row.department_id] || null)
        : null;
      const payload = {
        name: row.name,
        professor: row.professor || null,
        department_id: deptId,
        credit: row.credit ? Number(row.credit) : 3,
        semester: row.semester || null,
        year: Number(row.year) || null,
        description: row.description || null,
        is_active: true,
      };
      // 같은 과목+년도+학기+교수 존재하면 덮어쓰기
      let query = supabase.from("courses").select("id").eq("name", row.name);
      if (row.year) query = query.eq("year", Number(row.year));
      if (row.semester) query = query.eq("semester", row.semester);
      if (row.professor) query = query.eq("professor", row.professor);
      const { data: existing } = await query.maybeSingle();
      let error;
      if (existing) {
        ({ error } = await supabase.from("courses").update(payload).eq("id", existing.id));
      } else {
        ({ error } = await supabase.from("courses").insert(payload));
      }
      if (error) { errors.push(`${row.name}: ${error.message}`); } else { success++; }
    }

    setCsvResult({ success, failed: errors.length, errors });
    setCsvProcessing(false);
    await loadCourses();
    e.target.value = "";
  };

  // CSV 학생-수업 일괄 연결
  // 헤더: student_id,course_id,semester,year,status
  // course_id 대신 course_name도 지원
  const handleStudentCourseCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { alert("유효한 데이터가 없습니다."); e.target.value = ""; return; }

    setCsvProcessing(true);
    setCsvResult(null);
    let success = 0;
    const errors: string[] = [];

    // 과목명→id 매핑
    const courseNameMap: Record<string, number> = {};
    courses.forEach((c) => { courseNameMap[c.name.toLowerCase()] = c.id; });

    for (const row of rows) {
      if (!row.student_id) { errors.push("학번 없음"); continue; }
      let courseId = Number(row.course_id) || 0;
      if (!courseId && row.course_name) {
        courseId = courseNameMap[row.course_name.toLowerCase()] ?? 0;
      }
      if (!courseId) { errors.push(`${row.student_id}: 과목을 찾을 수 없음`); continue; }

      const { error } = await supabase.from("student_courses").upsert({
        student_id: row.student_id,
        course_id: courseId,
        semester: row.semester || null,
        year: Number(row.year) || new Date().getFullYear(),
        status: row.status || "수강중",
      }, { onConflict: "student_id,course_id,year,semester" });

      if (error) { errors.push(`${row.student_id}: ${error.message}`); } else { success++; }
    }

    setCsvResult({ success, failed: errors.length, errors });
    setCsvProcessing(false);
    e.target.value = "";
  };

  const handleEdit = (course: Course) => {
    setEditingId(course.id);
    setForm({
      name: course.name,
      professor: course.professor ?? "",
      department_id: course.department_id,
      credit: course.credit,
      semester: course.semester ?? "",
      year: course.year ?? new Date().getFullYear(),
      description: course.description ?? "",
      is_active: course.is_active,
      core_competency_tags: course.core_competency_tags ?? [],
      major_competency_tags: course.major_competency_tags ?? [],
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      professor: form.professor.trim() || null,
      department_id: form.department_id,
      credit: form.credit,
      semester: form.semester.trim() || null,
      year: form.year || null,
      description: form.description.trim() || null,
      is_active: form.is_active,
      core_competency_tags: form.core_competency_tags,
      major_competency_tags: form.major_competency_tags,
    };

    if (editingId) {
      await supabase.from("courses").update(payload).eq("id", editingId);
    } else {
      await supabase.from("courses").insert(payload);
    }

    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyCourse);
    await loadCourses();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 교과목을 삭제하시겠습니까?")) return;
    await supabase.from("courses").delete().eq("id", id);
    await loadCourses();
  };

  const toggleTag = (field: "core_competency_tags" | "major_competency_tags", id: number) => {
    setForm((prev) => {
      const current = prev[field];
      return {
        ...prev,
        [field]: current.includes(id) ? current.filter((t) => t !== id) : [...current, id],
      };
    });
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-ys-ink">교과목 관리</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ys-ink-soft/70" />
            <input
              type="text"
              placeholder="과목명, 교수명 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm(emptyCourse);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-ys-blue px-4 py-2 text-sm font-medium text-white hover:bg-ys-blue/90"
          >
            <Plus className="h-4 w-4" />
            교과목 추가
          </button>
          <button type="button" onClick={() => { setCsvResult(null); setShowCsvUpload(true); }} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">
            <Upload className="h-4 w-4" /> 교과목 CSV
          </button>
          <button type="button" onClick={() => { setCsvResult(null); setShowStudentCsv(true); }} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">
            <Users className="h-4 w-4" /> 수강 일괄등록
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-ys-paper">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">과목명</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">교수</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">학과</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">학점</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">역량 태그</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">상태</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-ys-ink-soft">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-ys-ink-soft">
                  교과목이 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="hover:bg-ys-paper">
                  <td className="px-4 py-3 text-sm font-medium text-ys-ink">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-ys-ink-soft">{c.professor ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-ys-ink-soft">{c.department_id ? deptMap[c.department_id] ?? "-" : "-"}</td>
                  <td className="px-4 py-3 text-sm text-ys-ink-soft">{c.credit}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.core_competency_tags ?? []).map((id) => {
                        const comp = coreComps.find((cc) => cc.id === id);
                        return comp ? (
                          <span key={`c-${id}`} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: comp.color_code + "15", color: comp.color_code }}>
                            {comp.name}
                          </span>
                        ) : null;
                      })}
                      {(c.major_competency_tags ?? []).map((id) => {
                        const comp = majorComps.find((mc) => mc.id === id);
                        return comp ? (
                          <span key={`m-${id}`} className="rounded-full bg-ys-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-ys-blue">
                            {comp.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.is_active ? "bg-ys-gold/15 text-[#8A6212]" : "bg-slate-100 text-ys-ink-soft"}`}>
                      {c.is_active ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button type="button" onClick={() => handleEdit(c)} className="mr-2 text-sm text-ys-blue hover:text-ys-blue">
                      <Edit3 className="inline h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => handleDelete(c.id)} className="text-sm text-red-600 hover:text-red-800">
                      <Trash2 className="inline h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-ys-ink">
              {editingId ? "교과목 수정" : "교과목 추가"}
            </h3>
            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-ys-ink">과목명 *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">담당교수</label>
                  <input type="text" value={form.professor} onChange={(e) => setForm({ ...form, professor: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">학과</label>
                  <select value={form.department_id ?? ""} onChange={(e) => setForm({ ...form, department_id: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">선택 안함</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">학점</label>
                  <input type="number" min={0.5} max={6} step={0.5} value={form.credit} onChange={(e) => setForm({ ...form, credit: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">학기</label>
                  <input type="text" placeholder="예: 1학기" value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ys-ink">연도</label>
                  <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ys-ink">설명</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
                <label htmlFor="is_active" className="text-sm text-ys-ink">활성</label>
              </div>

              {/* Core competency tags */}
              <div>
                <label className="block text-sm font-medium text-ys-ink">핵심역량 태그</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {coreComps.map((comp) => (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => toggleTag("core_competency_tags", comp.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        form.core_competency_tags.includes(comp.id)
                          ? "ring-2 ring-offset-1"
                          : "opacity-50"
                      }`}
                      style={{
                        backgroundColor: comp.color_code + "20",
                        color: comp.color_code,
                        outlineColor: comp.color_code,
                      }}
                    >
                      {comp.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Major competency tags */}
              <div>
                <label className="block text-sm font-medium text-ys-ink">전공역량 태그</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {filteredMajorComps.map((comp) => (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => toggleTag("major_competency_tags", comp.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        form.major_competency_tags.includes(comp.id)
                          ? "bg-ys-blue/15 text-ys-blue ring-2 ring-indigo-400 ring-offset-1"
                          : "bg-ys-blue/10 text-ys-sky opacity-50"
                      }`}
                    >
                      {comp.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">
                  취소
                </button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-ys-blue py-2 text-sm font-medium text-white hover:bg-ys-blue/90 disabled:opacity-50">
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 교과목 CSV 업로드 모달 */}
      {showCsvUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCsvUpload(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCourseCsv} />
            <h3 className="text-lg font-semibold text-ys-ink">교과목 CSV 일괄 등록</h3>
            <p className="mt-1 text-sm text-ys-ink-soft">
              헤더: name, professor, department_id, credit, semester, year, description
            </p>
            <p className="mt-1 text-xs text-ys-ink-soft/70">department_id는 숫자(1~5) 또는 학과명(신학과 등) 가능</p>
            {csvProcessing && <p className="mt-3 text-sm text-ys-blue">처리 중...</p>}
            {csvResult && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-ys-paper p-3">
                <p className="text-sm">성공: <strong className="text-[#8A6212]">{csvResult.success}건</strong>, 실패: <strong className="text-red-600">{csvResult.failed}건</strong></p>
                {csvResult.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-auto text-xs text-red-600">
                    {csvResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {!csvProcessing && (
                <button type="button" onClick={() => csvRef.current?.click()} className="flex items-center gap-2 rounded-lg bg-ys-blue px-4 py-2 text-sm font-medium text-white hover:bg-ys-blue/90">
                  <Upload className="h-4 w-4" /> 파일 선택
                </button>
              )}
              <button type="button" onClick={() => setShowCsvUpload(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 학생-수업 CSV 일괄 연결 모달 */}
      {showStudentCsv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowStudentCsv(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <input ref={studentCsvRef} type="file" accept=".csv" className="hidden" onChange={handleStudentCourseCsv} />
            <h3 className="text-lg font-semibold text-ys-ink">학생-수업 일괄 연결</h3>
            <p className="mt-1 text-sm text-ys-ink-soft">
              헤더: student_id, course_id, semester, year, status
            </p>
            <p className="mt-1 text-xs text-ys-ink-soft/70">course_id 대신 course_name(과목명)도 사용 가능. status: 수강중/완료</p>
            {csvProcessing && <p className="mt-3 text-sm text-ys-blue">처리 중...</p>}
            {csvResult && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-ys-paper p-3">
                <p className="text-sm">성공: <strong className="text-[#8A6212]">{csvResult.success}건</strong>, 실패: <strong className="text-red-600">{csvResult.failed}건</strong></p>
                {csvResult.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-auto text-xs text-red-600">
                    {csvResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {!csvProcessing && (
                <button type="button" onClick={() => studentCsvRef.current?.click()} className="flex items-center gap-2 rounded-lg bg-ys-blue px-4 py-2 text-sm font-medium text-white hover:bg-ys-blue/90">
                  <Upload className="h-4 w-4" /> 파일 선택
                </button>
              )}
              <button type="button" onClick={() => setShowStudentCsv(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">닫기</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
