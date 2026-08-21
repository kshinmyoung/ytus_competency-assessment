"use client";

import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Compass,
  PlayCircle,
  Sparkles,
  Trophy,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import { lmsGet, formatClock } from "@/lib/lms-client";
import Navigation from "@/components/Navigation";
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

const CORE_COMPETENCIES = [
  { key: "spiritual", label: "영성역량" },
  { key: "reflection", label: "기독교적 성찰역량" },
  { key: "empathy", label: "공감소통역량" },
  { key: "glocal", label: "글로컬역량" },
  { key: "creative", label: "창의융합역량" },
];

/**
 * diagnosis_results.scores 의 키를 core_competencies.id 로 잇는다.
 * 진단은 창의/융합을 'creative' 하나로 묶어 측정하므로 두 역량(3,4) 모두에 대응시킨다.
 */
const CORE_KEY_TO_IDS: Record<string, number[]> = {
  spiritual: [1],   // 영성역량
  reflection: [2],  // 기독교적 성찰역량
  creative: [3, 4], // 창의수행역량 + 융합사고역량
  empathy: [5],     // 공감소통역량
  glocal: [6],      // 글로컬시민역량
};

type ResumeCard = {
  programId: number; programName: string; contentId: number; contentTitle: string;
  durationSec: number; progress: number; lastPositionSec: number; href: string;
};

type RecommendedProgram = { id: number; name: string; description: string | null };

const diagnosisCards = [
  {
    title: "핵심역량진단",
    description: "나의 핵심 역량을 파악합니다",
    href: "/diagnosis/core",
    icon: Sparkles,
    iconBg: "bg-violet-50 text-violet-600",
  },
  {
    title: "학습역량진단",
    description: "학습 스타일과 능력을 점검합니다",
    href: "/diagnosis/learning",
    icon: BookOpen,
    iconBg: "bg-blue-50 text-blue-600",
  },
  {
    title: "소명진단",
    description: "나의 소명과 진로를 탐색합니다",
    href: "/diagnosis/calling",
    icon: Compass,
    iconBg: "bg-green-50 text-green-600",
  },
];

type MajorComp = { id: number; name: string; score: number };

export default function DashboardPage() {
  const [userName, setUserName] = useState("학우");
  const [departmentName, setDepartmentName] = useState("");
  const [coreScores, setCoreScores] = useState<Record<string, number> | null>(null);
  const [majorComps, setMajorComps] = useState<MajorComp[]>([]);
  const [recentCourses, setRecentCourses] = useState<{ name: string }[]>([]);
  const [recentExtra, setRecentExtra] = useState<{ name: string }[]>([]);
  const [mileage, setMileage] = useState(0);
  const [resume, setResume] = useState<ResumeCard | null>(null);
  const [recommended, setRecommended] = useState<RecommendedProgram[]>([]);
  const [studentType, setStudentType] = useState("domestic");

  useEffect(() => {
    (async () => {
      const studentId = await getCurrentStudentId();
      if (!studentId?.trim()) return;

      // 학생 정보 + 학과
      const { data: student } = await supabase
        .from("students")
        .select("name, department_id, student_type")
        .eq("student_id", studentId.trim())
        .maybeSingle();

      if (student?.name) setUserName(student.name);
      const myType = (student?.student_type ?? "domestic").trim();
      setStudentType(myType);

      // 학과명
      if (student?.department_id) {
        const { data: dept } = await supabase
          .from("departments")
          .select("name")
          .eq("id", student.department_id)
          .maybeSingle();
        if (dept) setDepartmentName(dept.name);

        // 전공역량 점수 (수강 완료 과목의 태그 기반)
        const { data: majorList } = await supabase
          .from("major_competencies")
          .select("id, name")
          .eq("department_id", student.department_id);

        if (majorList) {
          // 수강 완료 과목에서 전공역량 태그 카운트
          const { data: myCourses } = await supabase
            .from("student_courses")
            .select("course_id, courses(major_competency_tags)")
            .eq("student_id", studentId.trim());

          const tagCounts: Record<number, number> = {};
          (myCourses ?? []).forEach((sc: any) => {
            // courses가 배열 또는 객체일 수 있음
            const c = Array.isArray(sc.courses) ? sc.courses[0] : sc.courses;
            const tags = c?.major_competency_tags ?? [];
            tags.forEach((t: number) => {
              tagCounts[t] = (tagCounts[t] ?? 0) + 1;
            });
          });

          setMajorComps(
            majorList.map((mc) => ({
              id: mc.id,
              name: mc.name,
              score: tagCounts[mc.id] ?? 0,
            }))
          );
        }
      }

      // 핵심역량 진단 결과
      const { data: coreResult } = await supabase
        .from("diagnosis_results")
        .select("scores")
        .eq("student_id", studentId.trim())
        .eq("diagnosis_type", "core")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (coreResult?.scores) {
        setCoreScores(coreResult.scores as Record<string, number>);
      }

      // 최근 수강 과목
      const { data: coursesData } = await supabase
        .from("student_courses")
        .select("courses(name)")
        .eq("student_id", studentId.trim())
        .order("created_at", { ascending: false })
        .limit(3);
      setRecentCourses(
        (coursesData ?? []).map((c: any) => ({ name: c.courses?.name ?? "" }))
      );

      // 최근 비교과 활동
      const { data: extraData } = await supabase
        .from("student_extracurricular")
        .select("extracurricular(name)")
        .eq("student_id", studentId.trim())
        .order("created_at", { ascending: false })
        .limit(3);
      setRecentExtra(
        (extraData ?? []).map((e: any) => ({ name: e.extracurricular?.name ?? "" }))
      );

      // 마일리지 합산
      const { data: mileageData } = await supabase
        .from("mileage_records")
        .select("points")
        .eq("student_id", studentId.trim());
      setMileage((mileageData ?? []).reduce((sum: number, m: any) => sum + (m.points ?? 0), 0));

      // 이어보기 (설계서 11.3)
      try {
        const r = await lmsGet<{ resume: ResumeCard | null }>("/api/lms/resume");
        setResume(r.resume);
      } catch {
        // 이어보기 실패는 대시보드 전체를 막지 않는다
      }

      // 하위 2개 역량과 매칭되는 영상 프로그램 추천 — 내국인만 (설계서 11.3)
      if (myType === "domestic" && coreResult?.scores) {
        const scores = coreResult.scores as Record<string, number>;
        const weakKeys = Object.entries(scores)
          .sort((a, b) => a[1] - b[1])
          .slice(0, 2)
          .map(([k]) => k);
        const wantedIds = weakKeys.flatMap((k) => CORE_KEY_TO_IDS[k] ?? []);
        if (wantedIds.length > 0) {
          const { data: progs } = await supabase
            .from("extracurricular")
            .select("id, name, description, core_competency_tags")
            .eq("is_active", true)
            .in("delivery_type", ["video", "hybrid"])
            .in("target_audience", ["all", myType])
            .overlaps("core_competency_tags", wantedIds)
            .limit(3);
          setRecommended((progs ?? []).map((p) => ({ id: p.id, name: p.name, description: p.description })));
        }
      }
    })();
  }, []);

  const radarData = CORE_COMPETENCIES.map((c) => ({
    subject: c.label,
    value: coreScores?.[c.key] ?? 0,
    fullMark: 25,
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Welcome + Mileage */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              환영합니다, {userName}님!
            </h1>
            <p className="mt-1 text-slate-600">
              {departmentName ? `${departmentName} · ` : ""}오늘도 빛나는 내일을 위해 진단을 시작해보세요.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-6 py-3 shadow-sm">
            <p className="text-xs text-amber-600">내 마일리지</p>
            <p className="text-2xl font-bold text-amber-700">{mileage}<span className="ml-1 text-sm font-normal">점</span></p>
          </div>
        </div>

        {/* 이어보기 (설계서 11.3) */}
        {resume && (
          <div className="mb-8">
            <Link
              href={resume.href}
              className="group flex flex-wrap items-center gap-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <PlayCircle className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-blue-700">이어서 학습하기</p>
                <p className="truncate text-sm font-semibold text-slate-900">{resume.contentTitle}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {resume.programName} · {formatClock(resume.lastPositionSec)}부터 · 진도 {resume.progress}%
                </p>
                <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/70">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(resume.progress, 100)}%` }} />
                </div>
              </div>
              <span className="inline-flex items-center text-xs font-medium text-blue-600 group-hover:underline">
                이어보기 <ArrowRight className="ml-1 h-3 w-3" />
              </span>
            </Link>
          </div>
        )}

        {/* 취약 역량 기반 영상 프로그램 추천 — 내국인만 (설계서 11.3) */}
        {studentType === "domestic" && recommended.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-base font-semibold text-slate-800">
              내 역량에 맞는 영상 프로그램
              <span className="ml-2 text-xs font-normal text-slate-500">낮은 역량 2개 기준 추천</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {recommended.map((p) => (
                <Link
                  key={p.id}
                  href={`/lms/${p.id}`}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <Video className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">{p.name}</h3>
                  {p.description && (
                    <p className="mt-1 flex-1 line-clamp-2 text-xs text-slate-500">{p.description}</p>
                  )}
                  <span className="mt-3 inline-flex items-center text-xs font-medium text-blue-600 group-hover:underline">
                    학습하기 <ArrowRight className="ml-1 h-3 w-3" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Charts row */}
        <div className="mb-8 grid gap-6 lg:grid-cols-2">
          {/* Core competency radar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-800">
              핵심역량 현황
            </h2>
            {coreScores ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} tickLine={false} />
                    <PolarRadiusAxis angle={90} domain={[0, 25]} tick={{ fontSize: 10 }} />
                    <Radar
                      name="점수"
                      dataKey="value"
                      stroke="#6366f1"
                      fill="#818cf8"
                      fillOpacity={0.4}
                      strokeWidth={2}
                    />
                    <Tooltip formatter={(v: any) => [`${v}점`, "점수"]} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[280px] items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-slate-500">아직 핵심역량 진단 결과가 없습니다</p>
                  <Link
                    href="/diagnosis/core"
                    className="mt-2 inline-flex items-center text-sm font-medium text-blue-600 hover:underline"
                  >
                    진단하러 가기 <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Major competency bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-800">
              전공역량 현황
              {departmentName && (
                <span className="ml-2 text-xs font-normal text-slate-500">({departmentName})</span>
              )}
            </h2>
            {majorComps.length > 0 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={majorComps.map((mc) => ({ name: mc.name, 이수: mc.score }))}
                    margin={{ top: 10, right: 10, bottom: 10, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="이수" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[280px] items-center justify-center">
                <p className="text-sm text-slate-500">
                  {departmentName
                    ? "아직 수강 완료한 과목이 없습니다"
                    : "학과가 설정되지 않았습니다. 관리자에게 문의하세요."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Diagnosis cards */}
        <div className="mb-8">
          <h2 className="mb-4 text-base font-semibold text-slate-800">역량진단</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {diagnosisCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                >
                  <div
                    className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${card.iconBg}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
                  <p className="mt-1 flex-1 text-xs text-slate-500">{card.description}</p>
                  <span className="mt-3 inline-flex items-center text-xs font-medium text-blue-600 group-hover:underline">
                    시작하기 <ArrowRight className="ml-1 h-3 w-3" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent activity */}
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">최근 수강 과목</h2>
              <Link href="/courses" className="text-xs font-medium text-blue-600 hover:underline">
                전체보기
              </Link>
            </div>
            {recentCourses.length > 0 ? (
              <ul className="space-y-2">
                {recentCourses.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                    <BookOpen className="h-4 w-4 text-slate-400" />
                    {c.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">수강 중인 과목이 없습니다</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">최근 비교과 활동</h2>
              <Link href="/extracurricular" className="text-xs font-medium text-blue-600 hover:underline">
                전체보기
              </Link>
            </div>
            {recentExtra.length > 0 ? (
              <ul className="space-y-2">
                {recentExtra.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                    <Trophy className="h-4 w-4 text-slate-400" />
                    {e.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">참여 중인 비교과 활동이 없습니다</p>
            )}
          </div>
        </div>

        {/* AI Guide shortcut */}
        <div className="mt-8">
          <Link
            href="/ai-guide"
            className="group flex items-center justify-between rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-6 shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
                <Sparkles className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">AI 진로가이드</h2>
                <p className="mt-0.5 text-sm text-slate-600">
                  역량진단 결과를 바탕으로 맞춤형 진로 조언을 받아보세요
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-indigo-400 transition group-hover:translate-x-1" />
          </Link>
        </div>
      </main>
    </div>
  );
}
