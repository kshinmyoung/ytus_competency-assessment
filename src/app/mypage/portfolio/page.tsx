"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import { CERTIFICATIONS, CAREER_PATHS } from "@/app/roadmap/data";
import {
  Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Tooltip,
  Bar, BarChart, CartesianGrid, XAxis, YAxis,
} from "recharts";

const CORE_LABELS: Record<string, string> = {
  spiritual: "영성역량", reflection: "기독교적 성찰역량", empathy: "공감소통역량",
  glocal: "글로컬역량", creative: "창의융합역량",
};
const DIAG_LABELS: Record<string, string> = { core: "핵심역량", learning: "학습역량", calling: "소명진단" };
const DEPT_KEY_MAP: Record<number, string> = { 1: "theology", 2: "christianEdu", 3: "counseling", 4: "socialWelfare", 5: "multiCulture" };

type CoreComp = { id: number; name: string; color_code: string };
type MajorComp = { id: number; name: string; department_id: number };
type DiagResult = { diagnosis_type: string; total_score: number; scores: Record<string, number> | null; created_at: string };
type Course = { semester: string | null; year: number | null; grade: string | null; status: string; courses: { name: string; professor: string | null; credit: number; core_competency_tags: number[]; major_competency_tags: number[] } | null };
type Extra = { status: string; extracurricular: { name: string; category: string | null } | null };

export default function PortfolioPage() {
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [deptName, setDeptName] = useState("");
  const [deptId, setDeptId] = useState<number | null>(null);
  const [gradeYear, setGradeYear] = useState<number | null>(null);
  const [diagResults, setDiagResults] = useState<DiagResult[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [coreComps, setCoreComps] = useState<CoreComp[]>([]);
  const [majorComps, setMajorComps] = useState<MajorComp[]>([]);
  const [mileage, setMileage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid?.trim()) return;
      setStudentId(sid.trim());

      const [studentRes, deptRes, diagRes, courseRes, extraRes, coreRes, majorRes, mileRes] = await Promise.all([
        supabase.from("students").select("name, department_id, grade_year").eq("student_id", sid.trim()).maybeSingle(),
        supabase.from("departments").select("*"),
        supabase.from("diagnosis_results").select("diagnosis_type, total_score, scores, created_at").eq("student_id", sid.trim()).order("created_at", { ascending: false }),
        supabase.from("student_courses").select("semester, year, grade, status, courses(name, professor, credit, core_competency_tags, major_competency_tags)").eq("student_id", sid.trim()).order("year").order("semester"),
        supabase.from("student_extracurricular").select("status, extracurricular(name, category)").eq("student_id", sid.trim()),
        supabase.from("core_competencies").select("*").order("id"),
        supabase.from("major_competencies").select("*").order("id"),
        supabase.from("mileage_records").select("points").eq("student_id", sid.trim()),
      ]);

      setName(studentRes.data?.name ?? "");
      setDeptId(studentRes.data?.department_id ?? null);
      setGradeYear(studentRes.data?.grade_year ?? null);
      const dept = (deptRes.data ?? []).find((d: any) => d.id === studentRes.data?.department_id);
      setDeptName(dept?.name ?? "");
      setDiagResults((diagRes.data ?? []) as DiagResult[]);
      setCourses((courseRes.data ?? []) as unknown as Course[]);
      setExtras((extraRes.data ?? []) as unknown as Extra[]);
      setCoreComps((coreRes.data ?? []) as CoreComp[]);
      setMajorComps((majorRes.data ?? []) as MajorComp[]);
      setMileage((mileRes.data ?? []).reduce((s: number, m: any) => s + (m.points ?? 0), 0));
      setLoading(false);
    })();
  }, []);

  // 최신 핵심역량 진단
  const latestCore = diagResults.find((d) => d.diagnosis_type === "core");
  const radarData = latestCore?.scores
    ? Object.entries(latestCore.scores).map(([k, v]) => ({ subject: CORE_LABELS[k] ?? k, value: v, fullMark: 25 }))
    : [];

  // 전공역량 집계
  const majorCompScores = useMemo(() => {
    if (!deptId) return [];
    const myMajors = majorComps.filter((mc) => mc.department_id === deptId);
    const counts: Record<number, number> = {};
    courses.forEach((c) => {
      const course = Array.isArray(c.courses) ? (c.courses as any)[0] : c.courses;
      (course?.major_competency_tags ?? []).forEach((t: number) => { counts[t] = (counts[t] ?? 0) + 1; });
    });
    return myMajors.map((mc) => ({ name: mc.name, 이수: counts[mc.id] ?? 0 }));
  }, [courses, majorComps, deptId]);

  // 핵심역량 누적 (수강 태그)
  const coreCompCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    courses.forEach((c) => {
      const course = Array.isArray(c.courses) ? (c.courses as any)[0] : c.courses;
      (course?.core_competency_tags ?? []).forEach((t: number) => { counts[t] = (counts[t] ?? 0) + 1; });
    });
    return coreComps.map((cc) => ({ name: cc.name, count: counts[cc.id] ?? 0, color: cc.color_code }));
  }, [courses, coreComps]);

  // 총 학점
  const totalCredits = courses.reduce((s, c) => {
    const course = Array.isArray(c.courses) ? (c.courses as any)[0] : c.courses;
    return s + (course?.credit ?? 0);
  }, 0);

  // 자격증 이수 현황
  const deptKey = deptId ? DEPT_KEY_MAP[deptId] : null;
  const myCerts = deptKey ? Object.entries(CERTIFICATIONS).filter(([, c]) => c.dept === deptKey) : [];
  const myCourseName = new Set(courses.map((c) => { const course = Array.isArray(c.courses) ? (c.courses as any)[0] : c.courses; return course?.name; }).filter(Boolean) as string[]);
  const myCareerPath = deptKey ? CAREER_PATHS[deptKey] : null;

  // 강점/약점 분석
  const coreAnalysis = useMemo(() => {
    if (!latestCore?.scores) return null;
    const entries = Object.entries(latestCore.scores).map(([k, v]) => ({ key: k, label: CORE_LABELS[k] ?? k, score: v }));
    const sorted = [...entries].sort((a, b) => b.score - a.score);
    return { strongest: sorted[0], weakest: sorted[sorted.length - 1] };
  }, [latestCore]);

  // 종합 코멘트 (룰 기반)
  const commentary = useMemo(() => {
    const lines: string[] = [];
    if (latestCore) {
      const total = Object.values(latestCore.scores ?? {}).reduce((s, v) => s + v, 0);
      if (total >= 100) lines.push("핵심역량이 전반적으로 우수합니다. 심화 과목과 자격증 도전을 권합니다.");
      else if (total >= 75) lines.push("핵심역량이 양호합니다. 약점 역량을 보완하면 더 균형 잡힌 성장이 가능합니다.");
      else lines.push("핵심역량 강화가 필요합니다. 비교과 프로그램과 교수학습지원센터 상담을 추천합니다.");
    }
    if (coreAnalysis) {
      lines.push(`강점 역량: ${coreAnalysis.strongest.label} (${coreAnalysis.strongest.score}점) - 이 역량을 살린 진로를 탐색해보세요.`);
      lines.push(`보완 역량: ${coreAnalysis.weakest.label} (${coreAnalysis.weakest.score}점) - 관련 비교과 프로그램 참여를 추천합니다.`);
    }
    if (courses.length >= 10) lines.push(`총 ${courses.length}개 과목(${totalCredits}학점)을 수강하여 학업 이수가 순조롭습니다.`);
    else if (courses.length > 0) lines.push(`현재 ${courses.length}개 과목(${totalCredits}학점)을 수강 중입니다.`);
    if (extras.filter((e) => e.status === "완료").length > 0) lines.push(`비교과 활동 ${extras.filter((e) => e.status === "완료").length}건을 완료하여 역량 개발에 적극적입니다.`);
    if (myCerts.length > 0) {
      myCerts.forEach(([, cert]) => {
        const done = cert.required.filter((c) => myCourseName.has(c)).length;
        const pct = Math.round((done / cert.required.length) * 100);
        if (pct >= 100) lines.push(`${cert.name} 필수 과목을 모두 이수했습니다. 자격증 취득을 신청하세요!`);
        else if (pct >= 50) lines.push(`${cert.name} 이수율 ${pct}%입니다. 남은 과목을 계획적으로 수강하세요.`);
        else lines.push(`${cert.name} 이수율 ${pct}%입니다. 취창업진로지원센터에서 이수 계획 상담을 받아보세요.`);
      });
    }
    if (mileage > 0) lines.push(`마일리지 ${mileage}점을 획득했습니다.`);
    return lines;
  }, [latestCore, coreAnalysis, courses, extras, myCerts, mileage, totalCredits, myCourseName]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="text-slate-500">포트폴리오 생성 중...</p></div>;

  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-white">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A4; margin: 15mm; }
        }
      `}} />

      {/* 헤더 (화면용) */}
      <header className="no-print border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/mypage" className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-5 w-5" /><span className="text-sm font-medium">마이페이지</span>
          </Link>
          <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Printer className="h-4 w-4" /> 프린트 / PDF 저장
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* 포트폴리오 헤더 */}
        <div className="mb-8 border-b-2 border-slate-800 pb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-slate-500">영남신학대학교 Young Shiny 역량 포트폴리오</p>
              <h1 className="mt-1 text-3xl font-bold text-slate-900">{name}</h1>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                <span>학번: {studentId}</span>
                {deptName && <span>학과: {deptName}</span>}
                {gradeYear && <span>학년: {gradeYear}학년</span>}
              </div>
            </div>
            <Image src="/logo.png" alt="YOUNG SHINY" width={120} height={28} className="h-8 w-auto" />
          </div>
          <p className="mt-2 text-xs text-slate-400">발행일: {today}</p>
        </div>

        {/* 1. 종합 평가 */}
        <section className="mb-8">
          <h2 className="mb-3 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">1. 종합 평가</h2>
          <div className="rounded-xl bg-slate-50 p-5">
            <ul className="space-y-1.5">
              {commentary.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-slate-100 p-3 text-center">
              <p className="text-[10px] text-slate-500">수강 과목</p>
              <p className="text-xl font-bold text-slate-900">{courses.length}</p>
            </div>
            <div className="rounded-lg bg-slate-100 p-3 text-center">
              <p className="text-[10px] text-slate-500">총 학점</p>
              <p className="text-xl font-bold text-blue-600">{totalCredits}</p>
            </div>
            <div className="rounded-lg bg-slate-100 p-3 text-center">
              <p className="text-[10px] text-slate-500">비교과</p>
              <p className="text-xl font-bold text-green-600">{extras.length}</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-center">
              <p className="text-[10px] text-amber-600">마일리지</p>
              <p className="text-xl font-bold text-amber-700">{mileage}</p>
            </div>
          </div>
        </section>

        {/* 2. 역량 분석 */}
        <section className="mb-8">
          <h2 className="mb-3 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">2. 역량 분석</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {/* 핵심역량 레이더 */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">핵심역량 진단</h3>
              {radarData.length > 0 ? (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} margin={{ top: 15, right: 25, bottom: 15, left: 25 }}>
                      <PolarGrid stroke="#e2e8f0" /><PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} tickLine={false} />
                      <PolarRadiusAxis angle={90} domain={[0, 25]} tick={{ fontSize: 9 }} />
                      <Radar name="점수" dataKey="value" stroke="#6366f1" fill="#818cf8" fillOpacity={0.4} strokeWidth={2} />
                      <Tooltip formatter={(v: any) => [`${v}점`, "점수"]} /><Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="py-8 text-center text-sm text-slate-400">진단 미완료</p>}
            </div>

            {/* 전공역량 바 */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">전공역량 현황 {deptName && `(${deptName})`}</h3>
              {majorCompScores.length > 0 ? (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={majorCompScores} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip /><Bar dataKey="이수" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="py-8 text-center text-sm text-slate-400">학과 미설정</p>}
            </div>
          </div>

          {/* 핵심역량 수강 누적 */}
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">핵심역량별 이수 현황 (수강 태그 기준)</h3>
            <div className="space-y-1.5">
              {coreCompCounts.map((cc) => (
                <div key={cc.name} className="flex items-center gap-2">
                  <span className="w-28 text-xs text-slate-600">{cc.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(cc.count * 12, 100)}%`, backgroundColor: cc.color }} />
                  </div>
                  <span className="w-8 text-right text-xs text-slate-500">{cc.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. 진단 이력 */}
        {diagResults.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">3. 역량 진단 이력</h2>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50"><tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">유형</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">총점</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">세부</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">일시</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {diagResults.map((d, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-xs font-medium text-slate-900">{DIAG_LABELS[d.diagnosis_type] ?? d.diagnosis_type}</td>
                    <td className="px-3 py-2 text-xs text-slate-900">{d.total_score}점</td>
                    <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{d.scores && Object.entries(d.scores).map(([k, v]) => (
                      <span key={k} className="rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-600">{CORE_LABELS[k] ?? k}:{v}</span>
                    ))}</div></td>
                    <td className="px-3 py-2 text-[10px] text-slate-500">{new Date(d.created_at).toLocaleDateString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 4. 수강 이력 */}
        <section className="mb-8">
          <h2 className="mb-3 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">4. 수강 이력</h2>
          {courses.length === 0 ? <p className="text-sm text-slate-400">수강 이력이 없습니다.</p> : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50"><tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">과목명</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">교수</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">학점</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">학기</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">상태</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {courses.map((c, i) => {
                  const course = Array.isArray(c.courses) ? (c.courses as any)[0] : c.courses;
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2 text-xs font-medium text-slate-900">{course?.name ?? "-"}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{course?.professor ?? "-"}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{course?.credit ?? "-"}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{c.year ? `${c.year}년 ${c.semester ?? ""}` : "-"}</td>
                      <td className="px-3 py-2 text-xs">{c.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* 5. 비교과 활동 */}
        {extras.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">5. 비교과 활동</h2>
            <div className="flex flex-wrap gap-2">
              {extras.map((e, i) => {
                const ex = Array.isArray(e.extracurricular) ? (e.extracurricular as any)[0] : e.extracurricular;
                return (
                  <div key={i} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-xs font-medium text-slate-900">{ex?.name ?? "-"}</p>
                    <div className="mt-0.5 flex gap-1.5">
                      {ex?.category && <span className="text-[10px] text-slate-500">{ex.category}</span>}
                      <span className={`text-[10px] font-medium ${e.status === "완료" ? "text-green-600" : e.status === "참여중" ? "text-blue-600" : "text-yellow-600"}`}>{e.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 6. 자격증 이수 현황 */}
        {myCerts.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">6. 자격증 이수 현황</h2>
            {myCerts.map(([key, cert]) => {
              const done = cert.required.filter((c) => myCourseName.has(c)).length;
              const pct = Math.round((done / cert.required.length) * 100);
              return (
                <div key={key} className="mb-3 rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold" style={{ color: cert.color }}>{cert.name}</h3>
                    <span className="text-xs text-slate-500">{done}/{cert.required.length} ({pct}%)</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cert.color }} />
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* 7. 진로 전망 */}
        {myCareerPath && (
          <section className="mb-8">
            <h2 className="mb-3 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">7. 진로 전망</h2>
            <div className="flex flex-wrap gap-2">
              {myCareerPath.careers.map((c) => (
                <span key={c} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">{c}</span>
              ))}
            </div>
            {myCareerPath.note && <p className="mt-2 text-xs italic text-slate-500">{myCareerPath.note}</p>}
          </section>
        )}

        {/* 푸터 */}
        <div className="mt-12 border-t border-slate-200 pt-4 text-center text-[10px] text-slate-400">
          <p>영남신학대학교 Young Shiny 역량 포트폴리오 · {today}</p>
          <p>본 포트폴리오는 학생의 역량진단, 수강, 비교과 활동 데이터를 기반으로 자동 생성되었습니다.</p>
        </div>
      </main>
    </div>
  );
}
