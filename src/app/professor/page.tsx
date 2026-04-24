"use client";

import { BookOpen, ClipboardCheck, LogOut, Search, Trophy, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import { formatDateTimeKorea } from "@/lib/date";
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

type Student = { student_id: string; name: string | null; department_id: number | null; phone: string | null; email: string | null };
type DiagnosisResult = {
  id: number;
  student_id: string;
  diagnosis_type: string;
  total_score: number;
  scores: Record<string, number> | null;
  created_at: string;
};
type CourseRecord = { course_id: number; status: string; courses: { name: string } | null };
type ExtraRecord = { extracurricular_id: number; status: string; extracurricular: { name: string } | null };

const ROLE_LABELS: Record<string, string> = {
  department_head: "학과장",
  mentor_professor: "멘토링교수",
  ctl: "교수학습지원센터",
  career_center: "취창업진로지원센터",
  counseling_center: "학생생활상담센터",
};

const DIAGNOSIS_LABELS: Record<string, string> = {
  core: "핵심역량",
  learning: "학습역량",
  calling: "소명진단",
};

const CORE_LABELS: Record<string, string> = {
  spiritual: "영성",
  reflection: "기독교적 성찰",
  empathy: "공감소통",
  glocal: "글로컬",
  creative: "창의융합",
};

export default function ProfessorPage() {
  const router = useRouter();
  const [myRole, setMyRole] = useState("");
  const [myName, setMyName] = useState("");
  const [myDeptId, setMyDeptId] = useState<number | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [myStudents, setMyStudents] = useState<Student[]>([]);
  const [allDiagnosis, setAllDiagnosis] = useState<DiagnosisResult[]>([]);
  const [departments, setDepartments] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [filterDiag, setFilterDiag] = useState<string>("all");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentDiag, setStudentDiag] = useState<DiagnosisResult[]>([]);
  const [studentCourses, setStudentCourses] = useState<CourseRecord[]>([]);
  const [studentExtra, setStudentExtra] = useState<ExtraRecord[]>([]);

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid?.trim()) { router.replace("/login"); return; }

      const { data: me } = await supabase.from("students").select("name, role, department_id").eq("student_id", sid.trim()).maybeSingle();
      const role = (me?.role ?? "").trim().toLowerCase();

      const allowedRoles = ["department_head", "mentor_professor", "ctl", "career_center", "counseling_center", "admin"];
      if (!allowedRoles.includes(role)) { router.replace("/dashboard"); return; }

      setMyRole(role);
      setMyName(me?.name ?? "");
      setMyDeptId(me?.department_id ?? null);
      setAuthorized(true);

      // 학과 정보
      const { data: depts } = await supabase.from("departments").select("*");
      const deptMap: Record<number, string> = {};
      (depts ?? []).forEach((d: any) => (deptMap[d.id] = d.name));
      setDepartments(deptMap);

      // 담당 학생 목록 결정
      let studentList: Student[] = [];

      if (role === "department_head") {
        // 학과장: 같은 학과 전체 학생
        if (me?.department_id) {
          const { data } = await supabase.from("students").select("student_id, name, department_id, phone, email").eq("department_id", me.department_id).eq("role", "student").order("student_id");
          studentList = data ?? [];
        }
      } else if (role === "mentor_professor") {
        // 멘토링교수: 배정된 학생만
        const { data: groups } = await supabase.from("mentoring_groups").select("student_id").eq("mentor_id", sid.trim());
        const ids = (groups ?? []).map((g: any) => g.student_id);
        if (ids.length > 0) {
          const { data } = await supabase.from("students").select("student_id, name, department_id, phone, email").in("student_id", ids).order("student_id");
          studentList = data ?? [];
        }
      } else {
        // 센터/관리자: 전체 학생
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const res = await fetch("/api/admin/students", { headers: { Authorization: `Bearer ${token}` } });
          const all = await res.json();
          studentList = (all ?? []).filter((s: any) => (s.role ?? "").trim().toLowerCase() === "student");
        }
      }

      setMyStudents(studentList);

      // 해당 학생들의 진단 결과
      if (studentList.length > 0) {
        const ids = studentList.map((s) => s.student_id);
        const { data: diagData } = await supabase
          .from("diagnosis_results")
          .select("*")
          .in("student_id", ids)
          .order("created_at", { ascending: false });
        setAllDiagnosis(diagData ?? []);
      }
    })();
  }, [router]);

  // 학생별 진단 유형 맵
  const diagMap = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    allDiagnosis.forEach((d) => {
      if (!m[d.student_id]) m[d.student_id] = new Set();
      m[d.student_id].add(d.diagnosis_type);
    });
    return m;
  }, [allDiagnosis]);

  const filteredStudents = useMemo(() => {
    let list = myStudents;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => s.student_id.toLowerCase().includes(q) || (s.name ?? "").toLowerCase().includes(q));
    }
    if (filterDiag === "none") {
      list = list.filter((s) => !diagMap[s.student_id] || diagMap[s.student_id].size === 0);
    } else if (filterDiag !== "all") {
      list = list.filter((s) => diagMap[s.student_id]?.has(filterDiag));
    }
    return list;
  }, [myStudents, search, filterDiag, diagMap]);

  // 학생 상세 보기
  const viewStudent = async (student: Student) => {
    setSelectedStudent(student);
    const sid = student.student_id;

    const [diagRes, courseRes, extraRes] = await Promise.all([
      supabase.from("diagnosis_results").select("*").eq("student_id", sid).order("created_at", { ascending: false }),
      supabase.from("student_courses").select("course_id, status, courses(name)").eq("student_id", sid),
      supabase.from("student_extracurricular").select("extracurricular_id, status, extracurricular(name)").eq("student_id", sid),
    ]);

    setStudentDiag((diagRes.data ?? []) as DiagnosisResult[]);
    setStudentCourses((courseRes.data ?? []) as unknown as CourseRecord[]);
    setStudentExtra((extraRes.data ?? []) as unknown as ExtraRecord[]);
  };

  const latestCore = useMemo(() => {
    return studentDiag.find((d) => d.diagnosis_type === "core");
  }, [studentDiag]);

  const radarData = useMemo(() => {
    if (!latestCore?.scores) return [];
    return Object.entries(latestCore.scores).map(([key, value]) => ({
      subject: CORE_LABELS[key] ?? key,
      value,
      fullMark: 25,
    }));
  }, [latestCore]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    sessionStorage.clear();
    router.push("/login");
  };

  if (authorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="text-slate-500">확인 중...</p></div>;
  }
  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="YOUNG SHINY" width={140} height={32} className="h-8 w-auto" />
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              {ROLE_LABELS[myRole] ?? myRole}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{myName}님</span>
            <Link href="/admin/referrals" className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
              리퍼럴
            </Link>
            <button type="button" onClick={handleLogout} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900">
              <LogOut className="h-4 w-4" /> 로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">
            {myRole === "department_head" ? `${departments[myDeptId ?? 0] ?? ""} 학생 현황` : "담당 학생 현황"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">총 {myStudents.length}명의 학생을 관리하고 있습니다.</p>
        </div>

        {/* 요약 */}
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">전체 학생</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{myStudents.length}명</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">핵심역량 완료</p>
            <p className="mt-1 text-xl font-bold text-violet-600">{myStudents.filter((s) => diagMap[s.student_id]?.has("core")).length}명</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">학습역량 완료</p>
            <p className="mt-1 text-xl font-bold text-blue-600">{myStudents.filter((s) => diagMap[s.student_id]?.has("learning")).length}명</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">소명진단 완료</p>
            <p className="mt-1 text-xl font-bold text-green-600">{myStudents.filter((s) => diagMap[s.student_id]?.has("calling")).length}명</p>
          </div>
        </div>

        {/* 필터 */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="학번 또는 이름 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
          </div>
          <select value={filterDiag} onChange={(e) => setFilterDiag(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="all">전체</option>
            <option value="core">핵심역량 완료</option>
            <option value="learning">학습역량 완료</option>
            <option value="calling">소명진단 완료</option>
            <option value="none">미진단</option>
          </select>
        </div>

        {/* 학생 목록 */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">학번</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">이름</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">연락처</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">이메일</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">진단현황</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredStudents.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">학생이 없습니다.</td></tr>
              ) : (
                filteredStudents.map((s) => (
                  <tr key={s.student_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-900">{s.student_id}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{s.name ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{s.phone ?? "-"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{s.email ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {diagMap[s.student_id]?.has("core") && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">핵심</span>}
                        {diagMap[s.student_id]?.has("learning") && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">학습</span>}
                        {diagMap[s.student_id]?.has("calling") && <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">소명</span>}
                        {!diagMap[s.student_id] && <span className="text-[10px] text-slate-400">미진단</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => viewStudent(s)} className="text-sm font-medium text-blue-600 hover:text-blue-800">상세보기</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* 학생 상세 모달 */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedStudent(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{selectedStudent.name ?? selectedStudent.student_id}</h3>
                <p className="text-sm text-slate-500">학번: {selectedStudent.student_id}</p>
                {selectedStudent.phone && <p className="text-sm text-slate-500">연락처: {selectedStudent.phone}</p>}
                {selectedStudent.email && <p className="text-sm text-slate-500">이메일: {selectedStudent.email}</p>}
              </div>
              <button type="button" onClick={() => setSelectedStudent(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">닫기</button>
            </div>

            {/* 핵심역량 레이더 */}
            {radarData.length > 0 && (
              <div className="mb-6 rounded-xl border border-slate-200 p-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-700">핵심역량 그래프</h4>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} tickLine={false} />
                      <PolarRadiusAxis angle={90} domain={[0, 25]} tick={{ fontSize: 10 }} />
                      <Radar name="점수" dataKey="value" stroke="#6366f1" fill="#818cf8" fillOpacity={0.4} strokeWidth={2} />
                      <Tooltip formatter={(v: any) => [`${v}점`, "점수"]} />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 진단 이력 */}
            <div className="mb-6">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><ClipboardCheck className="h-4 w-4" /> 진단 이력</h4>
              {studentDiag.length === 0 ? (
                <p className="text-sm text-slate-500">진단 이력이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {studentDiag.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.diagnosis_type === "core" ? "bg-violet-50 text-violet-700" : d.diagnosis_type === "learning" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
                          {DIAGNOSIS_LABELS[d.diagnosis_type] ?? d.diagnosis_type}
                        </span>
                        <span className="text-sm font-medium text-slate-900">{d.total_score}점</span>
                      </div>
                      <span className="text-xs text-slate-500">{formatDateTimeKorea(d.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 수강 이력 */}
            <div className="mb-6">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><BookOpen className="h-4 w-4" /> 수강 과목 ({studentCourses.length})</h4>
              {studentCourses.length === 0 ? (
                <p className="text-sm text-slate-500">수강 이력이 없습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {studentCourses.map((c, i) => (
                    <span key={i} className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.status === "완료" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>
                      {c.courses?.name ?? `#${c.course_id}`} ({c.status})
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 비교과 이력 */}
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Trophy className="h-4 w-4" /> 비교과 활동 ({studentExtra.length})</h4>
              {studentExtra.length === 0 ? (
                <p className="text-sm text-slate-500">비교과 활동 이력이 없습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {studentExtra.map((e, i) => (
                    <span key={i} className={`rounded-full px-2.5 py-1 text-xs font-medium ${e.status === "완료" ? "bg-green-50 text-green-700" : e.status === "참여중" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
                      {e.extracurricular?.name ?? `#${e.extracurricular_id}`} ({e.status})
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
