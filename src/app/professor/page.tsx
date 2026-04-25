"use client";

import { BookOpen, ClipboardCheck, LogOut, Search, Send, Sparkles, Trash2, Trophy, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import { formatDateTimeKorea } from "@/lib/date";
import {
  Bar, BarChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Student = { student_id: string; name: string | null; department_id: number | null; phone: string | null; email: string | null };
type DiagnosisResult = { id: number; student_id: string; diagnosis_type: string; total_score: number; scores: Record<string, number> | null; created_at: string };
type CourseRecord = { course_id: number; semester: string | null; year: number | null; grade: string | null; status: string; courses: { name: string; professor: string | null; credit: number } | null };
type ExtraRecord = { extracurricular_id: number; status: string; extracurricular: { name: string } | null };
type CounselingRecord = { id: number; student_id: string; counselor_id: string; counselor_role: string; counseling_date: string; category: string; content: string; action_plan: string | null; follow_up_needed: boolean; follow_up_date: string | null; is_private: boolean; created_at: string };
const COUNSEL_CATEGORIES = ["일반", "학업", "진로", "심리", "신앙", "생활", "기타"];
const CATEGORY_COLORS: Record<string, string> = { "일반": "bg-slate-100 text-slate-700", "학업": "bg-blue-50 text-blue-700", "진로": "bg-indigo-50 text-indigo-700", "심리": "bg-violet-50 text-violet-700", "신앙": "bg-amber-50 text-amber-700", "생활": "bg-green-50 text-green-700", "기타": "bg-slate-100 text-slate-600" };

const ROLE_LABELS: Record<string, string> = {
  department_head: "학과장", mentor_professor: "멘토링교수",
};
const DIAGNOSIS_LABELS: Record<string, string> = { core: "핵심역량", learning: "학습역량", calling: "소명진단" };
const CORE_LABELS: Record<string, string> = { spiritual: "영성", reflection: "기독교적 성찰", empathy: "공감소통", glocal: "글로컬", creative: "창의융합" };

type TabKey = "students" | "courses" | "extra" | "assessment" | "referral";

export default function ProfessorPage() {
  const router = useRouter();
  const [myRole, setMyRole] = useState("");
  const [myName, setMyName] = useState("");
  const [myId, setMyId] = useState("");
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
  const [counselRecords, setCounselRecords] = useState<CounselingRecord[]>([]);
  const [showCounselForm, setShowCounselForm] = useState(false);
  const [counselForm, setCounselForm] = useState({ category: "일반", content: "", action_plan: "", follow_up_needed: false, follow_up_date: "", is_private: false });
  const [counselSaving, setCounselSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("students");

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid?.trim()) { router.replace("/login"); return; }
      setMyId(sid.trim());

      const { data: me } = await supabase.from("students").select("name, role, department_id").eq("student_id", sid.trim()).maybeSingle();
      const role = (me?.role ?? "").trim().toLowerCase();

      if (!["department_head", "mentor_professor"].includes(role)) { router.replace("/dashboard"); return; }

      setMyRole(role);
      setMyName(me?.name ?? "");
      setMyDeptId(me?.department_id ?? null);
      setAuthorized(true);

      const { data: depts } = await supabase.from("departments").select("*");
      const deptMap: Record<number, string> = {};
      (depts ?? []).forEach((d: any) => (deptMap[d.id] = d.name));
      setDepartments(deptMap);

      let studentList: Student[] = [];
      if (role === "department_head" && me?.department_id) {
        const { data } = await supabase.from("students").select("student_id, name, department_id, phone, email").eq("department_id", me.department_id).eq("role", "student").order("student_id");
        studentList = data ?? [];
      } else if (role === "mentor_professor") {
        const { data: groups } = await supabase.from("mentoring_groups").select("student_id").eq("mentor_id", sid.trim());
        const ids = (groups ?? []).map((g: any) => g.student_id);
        if (ids.length > 0) {
          const { data } = await supabase.from("students").select("student_id, name, department_id, phone, email").in("student_id", ids).order("student_id");
          studentList = data ?? [];
        }
      }
      setMyStudents(studentList);

      if (studentList.length > 0) {
        const ids = studentList.map((s) => s.student_id);
        const { data: diagData } = await supabase.from("diagnosis_results").select("*").in("student_id", ids).order("created_at", { ascending: false });
        setAllDiagnosis(diagData ?? []);
      }
    })();
  }, [router]);

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
    if (q) list = list.filter((s) => s.student_id.toLowerCase().includes(q) || (s.name ?? "").toLowerCase().includes(q));
    if (filterDiag === "none") list = list.filter((s) => !diagMap[s.student_id] || diagMap[s.student_id].size === 0);
    else if (filterDiag !== "all") list = list.filter((s) => diagMap[s.student_id]?.has(filterDiag));
    return list;
  }, [myStudents, search, filterDiag, diagMap]);

  const viewStudent = async (student: Student) => {
    setSelectedStudent(student);
    setShowCounselForm(false);
    const [diagRes, courseRes, extraRes, counselRes] = await Promise.all([
      supabase.from("diagnosis_results").select("*").eq("student_id", student.student_id).order("created_at", { ascending: false }),
      supabase.from("student_courses").select("course_id, semester, year, grade, status, courses(name, professor, credit)").eq("student_id", student.student_id).order("year").order("semester"),
      supabase.from("student_extracurricular").select("extracurricular_id, status, extracurricular(name)").eq("student_id", student.student_id),
      supabase.from("counseling_records").select("*").eq("student_id", student.student_id).order("counseling_date", { ascending: false }),
    ]);
    setStudentDiag((diagRes.data ?? []) as DiagnosisResult[]);
    setStudentCourses((courseRes.data ?? []) as unknown as CourseRecord[]);
    setStudentExtra((extraRes.data ?? []) as unknown as ExtraRecord[]);
    setCounselRecords((counselRes.data ?? []) as CounselingRecord[]);
  };

  const handleSaveCounsel = async () => {
    if (!selectedStudent || !counselForm.content.trim()) return;
    setCounselSaving(true);
    await supabase.from("counseling_records").insert({
      student_id: selectedStudent.student_id,
      counselor_id: myId,
      counselor_role: myRole,
      counseling_date: new Date().toISOString().split("T")[0],
      category: counselForm.category,
      content: counselForm.content.trim(),
      action_plan: counselForm.action_plan.trim() || null,
      follow_up_needed: counselForm.follow_up_needed,
      follow_up_date: counselForm.follow_up_date || null,
      is_private: counselForm.is_private,
    });
    setCounselSaving(false);
    setShowCounselForm(false);
    setCounselForm({ category: "일반", content: "", action_plan: "", follow_up_needed: false, follow_up_date: "", is_private: false });
    // 새로고침
    const { data } = await supabase.from("counseling_records").select("*").eq("student_id", selectedStudent.student_id).order("counseling_date", { ascending: false });
    setCounselRecords((data ?? []) as CounselingRecord[]);
  };

  const latestCore = useMemo(() => studentDiag.find((d) => d.diagnosis_type === "core"), [studentDiag]);
  const radarData = useMemo(() => {
    if (!latestCore?.scores) return [];
    return Object.entries(latestCore.scores).map(([key, value]) => ({ subject: CORE_LABELS[key] ?? key, value, fullMark: 25 }));
  }, [latestCore]);

  const handleLogout = async () => { await supabase.auth.signOut(); sessionStorage.clear(); router.push("/login"); };

  if (authorized === null) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="text-slate-500">확인 중...</p></div>;
  if (!authorized) return null;

  const deptName = myDeptId ? departments[myDeptId] ?? "" : "";

  // 역할별 탭
  const tabs: { key: TabKey; label: string; icon: any }[] = myRole === "department_head"
    ? [
        { key: "students", label: "학생 현황", icon: Users },
        { key: "assessment", label: "역량 데이터", icon: ClipboardCheck },
        { key: "referral", label: "리퍼럴", icon: Send },
      ]
    : [
        { key: "students", label: "멘토링 학생", icon: Users },
        { key: "referral", label: "리퍼럴", icon: Send },
      ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="YOUNG SHINY" width={140} height={32} className="h-8 w-auto" />
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{ROLE_LABELS[myRole] ?? myRole}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">{myName}님</span>
            <button type="button" onClick={handleLogout} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900">
              <LogOut className="h-4 w-4" /> 로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* 탭 */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
          <div className="flex gap-1 py-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === tab.key ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
                  <Icon className="h-4 w-4" />{tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* === 학생 현황 탭 === */}
        {activeTab === "students" && (
          <div>
            <div className="mb-6">
              <h1 className="text-xl font-bold text-slate-900">
                {myRole === "department_head" ? `${deptName} 학생 현황` : "멘토링 학생 현황"}
              </h1>
              <p className="mt-1 text-sm text-slate-600">총 {myStudents.length}명</p>
            </div>

            {/* 요약 */}
            <div className="mb-6 grid gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">전체 학생</p><p className="mt-1 text-xl font-bold text-slate-900">{myStudents.length}명</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">핵심역량 완료</p><p className="mt-1 text-xl font-bold text-violet-600">{myStudents.filter((s) => diagMap[s.student_id]?.has("core")).length}명</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">학습역량 완료</p><p className="mt-1 text-xl font-bold text-blue-600">{myStudents.filter((s) => diagMap[s.student_id]?.has("learning")).length}명</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">소명진단 완료</p><p className="mt-1 text-xl font-bold text-green-600">{myStudents.filter((s) => diagMap[s.student_id]?.has("calling")).length}명</p>
              </div>
            </div>

            {/* 필터 */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="학번 또는 이름 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
              </div>
              <select value={filterDiag} onChange={(e) => setFilterDiag(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="all">전체</option><option value="core">핵심역량 완료</option><option value="learning">학습역량 완료</option><option value="calling">소명진단 완료</option><option value="none">미진단</option>
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
                  ) : filteredStudents.map((s) => (
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* === 역량 데이터 (학과장) === */}
        {activeTab === "assessment" && myRole === "department_head" && (
          <div>
            <h1 className="mb-6 text-xl font-bold text-slate-900">{deptName} 역량 데이터</h1>
            {/* 유형별 통계 */}
            {["core", "learning", "calling"].map((diagType) => {
              const typeResults = allDiagnosis.filter((d) => d.diagnosis_type === diagType);
              if (typeResults.length === 0) return null;
              const avg = Math.round(typeResults.reduce((s, d) => s + d.total_score, 0) / typeResults.length);
              return (
                <div key={diagType} className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-800">{DIAGNOSIS_LABELS[diagType]}</h2>
                    <div className="flex gap-4 text-sm text-slate-600">
                      <span>참여: <strong>{typeResults.length}명</strong></span>
                      <span>평균: <strong>{avg}점</strong></span>
                    </div>
                  </div>
                  <div className="mt-4 max-h-[300px] overflow-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50"><tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">학번</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">이름</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">총점</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">진단일</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {typeResults.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-sm text-slate-900">{r.student_id}</td>
                            <td className="px-3 py-2 text-sm text-slate-600">{myStudents.find((s) => s.student_id === r.student_id)?.name ?? "-"}</td>
                            <td className="px-3 py-2 text-sm font-medium text-slate-900">{r.total_score}점</td>
                            <td className="px-3 py-2 text-sm text-slate-500">{formatDateTimeKorea(r.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* === 리퍼럴 탭 === */}
        {activeTab === "referral" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-900">리퍼럴</h1>
              <Link href="/admin/referrals" className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                <Send className="h-4 w-4" /> 리퍼럴 관리 페이지
              </Link>
            </div>
            <p className="text-sm text-slate-600">리퍼럴 관리 페이지에서 학생을 센터에 연결하거나, 받은 리퍼럴을 확인할 수 있습니다.</p>
          </div>
        )}
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
                      <PolarGrid stroke="#e2e8f0" /><PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} tickLine={false} />
                      <PolarRadiusAxis angle={90} domain={[0, 25]} tick={{ fontSize: 10 }} />
                      <Radar name="점수" dataKey="value" stroke="#6366f1" fill="#818cf8" fillOpacity={0.4} strokeWidth={2} />
                      <Tooltip formatter={(v: any) => [`${v}점`, "점수"]} /><Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 진단 이력 */}
            <div className="mb-6">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><ClipboardCheck className="h-4 w-4" /> 진단 이력</h4>
              {studentDiag.length === 0 ? <p className="text-sm text-slate-500">진단 이력이 없습니다.</p> : (
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

            {/* 수강 과목 */}
            <div className="mb-4">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><BookOpen className="h-4 w-4" /> 수강 과목 ({studentCourses.length})</h4>
              {studentCourses.length === 0 ? <p className="text-sm text-slate-500">수강 이력이 없습니다.</p> : (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-600">과목명</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-600">교수</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-600">학점</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-600">학기</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-600">성적</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-600">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {studentCourses.map((c, i) => {
                        const course = Array.isArray(c.courses) ? (c.courses as any)[0] : c.courses;
                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-xs font-medium text-slate-900">{course?.name ?? "-"}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">{course?.professor ?? "-"}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">{course?.credit ?? "-"}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">{c.year ? `${c.year}년 ${c.semester ?? ""}` : "-"}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">{c.grade ?? "-"}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${c.status === "완료" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>{c.status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 비교과 */}
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Trophy className="h-4 w-4" /> 비교과 ({studentExtra.length})</h4>
              {studentExtra.length === 0 ? <p className="text-sm text-slate-500">없음</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {studentExtra.map((e, i) => (
                    <span key={i} className={`rounded-full px-2.5 py-1 text-xs font-medium ${e.status === "완료" ? "bg-green-50 text-green-700" : e.status === "참여중" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
                      {(Array.isArray(e.extracurricular) ? (e.extracurricular as any)[0] : e.extracurricular)?.name ?? `#${e.extracurricular_id}`}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 상담기록 */}
            <div className="mt-6 border-t border-slate-200 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700">상담기록 ({counselRecords.length}건)</h4>
                <button type="button" onClick={() => setShowCounselForm(!showCounselForm)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                  + 상담기록 추가
                </button>
              </div>

              {/* 상담기록 입력 폼 */}
              {showCounselForm && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700">분류</label>
                      <select value={counselForm.category} onChange={(e) => setCounselForm({ ...counselForm, category: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                        {COUNSEL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-700">
                        <input type="checkbox" checked={counselForm.follow_up_needed} onChange={(e) => setCounselForm({ ...counselForm, follow_up_needed: e.target.checked })} className="rounded" />
                        후속 상담 필요
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-700">
                        <input type="checkbox" checked={counselForm.is_private} onChange={(e) => setCounselForm({ ...counselForm, is_private: e.target.checked })} className="rounded" />
                        비공개
                      </label>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-700">상담 내용 *</label>
                    <textarea value={counselForm.content} onChange={(e) => setCounselForm({ ...counselForm, content: e.target.value })} rows={3}
                      placeholder="상담 내용을 기록하세요." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-700">조치 계획 (선택)</label>
                    <input type="text" value={counselForm.action_plan} onChange={(e) => setCounselForm({ ...counselForm, action_plan: e.target.value })}
                      placeholder="향후 조치 사항" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  {counselForm.follow_up_needed && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-slate-700">후속 상담일</label>
                      <input type="date" value={counselForm.follow_up_date} onChange={(e) => setCounselForm({ ...counselForm, follow_up_date: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setShowCounselForm(false)} className="flex-1 rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">취소</button>
                    <button type="button" onClick={handleSaveCounsel} disabled={counselSaving || !counselForm.content.trim()}
                      className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                      {counselSaving ? "저장 중..." : "저장"}
                    </button>
                  </div>
                </div>
              )}

              {/* 상담기록 목록 */}
              {counselRecords.length === 0 ? (
                <p className="text-sm text-slate-500">상담기록이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {counselRecords.map((cr) => (
                    <div key={cr.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[cr.category] ?? "bg-slate-100 text-slate-600"}`}>{cr.category}</span>
                          <span className="text-xs text-slate-500">{cr.counseling_date}</span>
                          {cr.follow_up_needed && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">후속 필요</span>}
                          {cr.is_private && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">비공개</span>}
                        </div>
                        {cr.counselor_id === myId && (
                          <button type="button" onClick={async () => {
                            if (!confirm("이 상담기록을 삭제하시겠습니까?")) return;
                            await supabase.from("counseling_records").delete().eq("id", cr.id);
                            if (selectedStudent) { const { data } = await supabase.from("counseling_records").select("*").eq("student_id", selectedStudent.student_id).order("counseling_date", { ascending: false }); setCounselRecords((data ?? []) as CounselingRecord[]); }
                          }} className="text-red-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm text-slate-800">{cr.content}</p>
                      {cr.action_plan && <p className="mt-1 text-xs text-blue-700">조치: {cr.action_plan}</p>}
                      {cr.follow_up_date && <p className="mt-0.5 text-[10px] text-slate-500">후속 상담: {cr.follow_up_date}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 리퍼럴 보내기 링크 */}
            <div className="mt-4 border-t border-slate-200 pt-4">
              <Link href="/admin/referrals" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                <Send className="h-4 w-4" /> 이 학생을 센터에 리퍼럴 보내기
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
