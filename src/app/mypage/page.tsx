"use client";

import { BookOpen, ClipboardCheck, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import Navigation from "@/components/Navigation";
import { formatDateTimeKorea } from "@/lib/date";
import {
  Bar, BarChart, CartesianGrid, Legend,
  PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";

const CORE_LABELS: Record<string, string> = {
  spiritual: "영성역량",
  reflection: "기독교적 성찰역량",
  empathy: "공감소통역량",
  glocal: "글로컬역량",
  creative: "창의융합역량",
};

type DiagnosisResult = {
  id: number;
  diagnosis_type: string;
  total_score: number;
  scores: Record<string, number> | null;
  created_at: string;
};

type CourseRecord = {
  id: number;
  semester: string | null;
  year: number | null;
  grade: string | null;
  status: string;
  courses: { name: string; professor: string | null; core_competency_tags: number[]; major_competency_tags: number[] } | null;
};
type CoreComp = { id: number; name: string; color_code: string };
type MajorComp = { id: number; name: string };

type ExtraRecord = {
  id: number;
  status: string;
  completed_at: string | null;
  reflection: string | null;
  extracurricular: { name: string; category: string | null } | null;
};

export default function MyPage() {
  const [userName, setUserName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [diagnosisResults, setDiagnosisResults] = useState<DiagnosisResult[]>([]);
  const [courseRecords, setCourseRecords] = useState<CourseRecord[]>([]);
  const [extraRecords, setExtraRecords] = useState<ExtraRecord[]>([]);
  const [coreComps, setCoreComps] = useState<CoreComp[]>([]);
  const [majorComps, setMajorComps] = useState<MajorComp[]>([]);
  const [majorCompScores, setMajorCompScores] = useState<{ id: number; name: string; score: number }[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "courses" | "extra" | "diagnosis">("overview");

  useEffect(() => {
    (async () => {
      const studentId = await getCurrentStudentId();
      if (!studentId?.trim()) return;

      const [studentRes, deptRes, diagRes, courseRes, extraRes, coreRes, majorRes] = await Promise.all([
        supabase.from("students").select("name, department_id").eq("student_id", studentId.trim()).maybeSingle(),
        supabase.from("departments").select("*"),
        supabase.from("diagnosis_results").select("*").eq("student_id", studentId.trim()).order("created_at", { ascending: false }),
        supabase.from("student_courses").select("id, semester, year, grade, status, courses(name, professor, core_competency_tags, major_competency_tags)").eq("student_id", studentId.trim()).order("created_at", { ascending: false }),
        supabase.from("student_extracurricular").select("id, status, completed_at, reflection, extracurricular(name, category)").eq("student_id", studentId.trim()).order("created_at", { ascending: false }),
        supabase.from("core_competencies").select("id, name, color_code").order("id"),
        supabase.from("major_competencies").select("id, name").order("id"),
      ]);

      if (studentRes.data?.name) setUserName(studentRes.data.name);
      const dept = (deptRes.data ?? []).find((d: any) => d.id === studentRes.data?.department_id);
      if (dept) setDepartmentName(dept.name);

      setDiagnosisResults((diagRes.data ?? []) as DiagnosisResult[]);
      setCourseRecords((courseRes.data ?? []) as unknown as CourseRecord[]);
      setExtraRecords((extraRes.data ?? []) as unknown as ExtraRecord[]);
      setCoreComps((coreRes.data ?? []) as CoreComp[]);
      setMajorComps((majorRes.data ?? []) as MajorComp[]);

      // 전공역량 집계 (수강 과목 태그 기반)
      const myDeptId = studentRes.data?.department_id;
      if (myDeptId) {
        const { data: majorList } = await supabase.from("major_competencies").select("id, name").eq("department_id", myDeptId);
        if (majorList) {
          const tagCounts: Record<number, number> = {};
          ((courseRes.data ?? []) as any[]).forEach((sc) => {
            const c = Array.isArray(sc.courses) ? sc.courses[0] : sc.courses;
            (c?.major_competency_tags ?? []).forEach((t: number) => { tagCounts[t] = (tagCounts[t] ?? 0) + 1; });
          });
          setMajorCompScores(majorList.map((mc) => ({ id: mc.id, name: mc.name, score: tagCounts[mc.id] ?? 0 })));
        }
      }
    })();
  }, []);

  // Latest core diagnosis for radar
  const latestCore = diagnosisResults.find((d) => d.diagnosis_type === "core");
  const radarData = latestCore?.scores
    ? Object.entries(latestCore.scores).map(([key, value]) => ({
        subject: CORE_LABELS[key] ?? key,
        value,
        fullMark: 25,
      }))
    : [];

  const diagTypeName = (type: string) => {
    if (type === "core") return "핵심역량";
    if (type === "learning") return "학습역량";
    if (type === "calling") return "소명진단";
    return type;
  };

  const tabs = [
    { key: "overview" as const, label: "종합 현황" },
    { key: "courses" as const, label: `수강 이력 (${courseRecords.length})` },
    { key: "extra" as const, label: `비교과 이력 (${extraRecords.length})` },
    { key: "diagnosis" as const, label: `진단 이력 (${diagnosisResults.length})` },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Profile header */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">{userName || "학우"}님의 마이페이지</h1>
          <p className="mt-1 text-sm text-slate-600">
            {departmentName && `${departmentName} · `}역량 현황과 활동 이력을 확인하세요.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                activeTab === tab.key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Radar chart */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-800">핵심역량 종합</h2>
              {radarData.length > 0 ? (
                <div className="h-[300px]">
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
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">핵심역량 진단 결과가 없습니다.</p>
              )}
            </div>

            {/* 전공역량 현황 */}
            {majorCompScores.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold text-slate-800">
                  전공역량 현황
                  {departmentName && <span className="ml-2 text-xs font-normal text-slate-500">({departmentName})</span>}
                </h2>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={majorCompScores.map((mc) => ({ name: mc.name, 이수: mc.score }))} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="이수" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-center text-[10px] text-slate-400">수강 과목의 전공역량 태그 기준 집계</p>
              </div>
            )}

            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-blue-500" />
                  <p className="text-sm font-medium text-slate-700">수강 과목</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{courseRecords.length}개</p>
                <p className="mt-1 text-xs text-slate-500">
                  완료: {courseRecords.filter((c) => c.status === "완료").length}개
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  <p className="text-sm font-medium text-slate-700">비교과 활동</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{extraRecords.length}개</p>
                <p className="mt-1 text-xs text-slate-500">
                  완료: {extraRecords.filter((e) => e.status === "완료").length}개
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-violet-500" />
                  <p className="text-sm font-medium text-slate-700">진단 완료</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{diagnosisResults.length}회</p>
              </div>
            </div>
          </div>
        )}

        {/* Courses */}
        {activeTab === "courses" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">과목명</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">역량 태그</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">교수</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">학기</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">성적</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {courseRecords.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">수강 이력이 없습니다.</td></tr>
                ) : (
                  courseRecords.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{c.courses?.name ?? "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(c.courses?.core_competency_tags ?? []).map((tagId) => {
                            const comp = coreComps.find((cc) => cc.id === tagId);
                            return comp ? <span key={`c-${tagId}`} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: comp.color_code + "15", color: comp.color_code }}>{comp.name}</span> : null;
                          })}
                          {(c.courses?.major_competency_tags ?? []).map((tagId) => {
                            const comp = majorComps.find((mc) => mc.id === tagId);
                            return comp ? <span key={`m-${tagId}`} className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">{comp.name}</span> : null;
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.courses?.professor ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.year ? `${c.year}년 ${c.semester ?? ""}` : "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.grade ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.status === "완료" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Extra */}
        {activeTab === "extra" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">프로그램명</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">카테고리</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">상태</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">완료일</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">소감</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {extraRecords.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">비교과 활동 이력이 없습니다.</td></tr>
                ) : (
                  extraRecords.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{e.extracurricular?.name ?? "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{e.extracurricular?.category ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.status === "완료" ? "bg-green-50 text-green-700" : e.status === "참여중" ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"
                        }`}>{e.status}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{e.completed_at ? formatDateTimeKorea(e.completed_at) : "-"}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-sm text-slate-600">{e.reflection ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Diagnosis history */}
        {activeTab === "diagnosis" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">진단 유형</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">총점</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">세부 점수</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">진단일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {diagnosisResults.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">진단 이력이 없습니다.</td></tr>
                ) : (
                  diagnosisResults.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          d.diagnosis_type === "core" ? "bg-violet-50 text-violet-700" : d.diagnosis_type === "learning" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"
                        }`}>
                          {diagTypeName(d.diagnosis_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{d.total_score}점</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {d.scores && Object.entries(d.scores).map(([k, v]) => (
                            <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {CORE_LABELS[k] ?? k}: {v}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatDateTimeKorea(d.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
