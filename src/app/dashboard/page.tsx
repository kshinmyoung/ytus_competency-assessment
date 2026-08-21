"use client";

import {
  ArrowRight,
  Award,
  BookOpen,
  Compass,
  PlayCircle,
  Sparkles,
  Trophy,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import { lmsGet, formatClock, openCertificate } from "@/lib/lms-client";
import CompetencyCompass from "@/components/CompetencyCompass";
import Navigation from "@/components/Navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CORE_COMPETENCIES = [
  { key: "spiritual", label: "영성역량", short: "영성" },
  { key: "reflection", label: "기독교적 성찰역량", short: "성찰" },
  { key: "empathy", label: "공감소통역량", short: "공감소통" },
  { key: "glocal", label: "글로컬역량", short: "글로컬" },
  { key: "creative", label: "창의융합역량", short: "창의융합" },
];

/** 핵심역량 한 축의 만점 (5문항 × 5점) */
const CORE_MAX = 25;

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

type Certificate = { certificateNo: string; programId: number; programName: string; completedAt: string; finalProgress: number };

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
  const [completedCount, setCompletedCount] = useState(0);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [certError, setCertError] = useState("");

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

      // 유학생은 마일리지 대신 이수 실적을 보여준다 (설계서 11.4)
      if (myType !== "domestic") {
        try {
          const sum = await lmsGet<{ completedCount: number; certificates: Certificate[] }>("/api/lms/my-summary");
          setCompletedCount(sum.completedCount);
          setCertificates(sum.certificates);
        } catch {
          // 요약 실패는 대시보드를 막지 않는다
        }
      }

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

  const compassAxes = CORE_COMPETENCIES.map((c) => ({
    label: c.short,
    score: coreScores?.[c.key] ?? 0,
  }));
  const litCount = compassAxes.filter((a) => a.score >= CORE_MAX * 0.8).length;

  return (
    <div className="min-h-screen bg-ys-paper">
      <Navigation />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* ── 빛이 어디까지 닿았는지 ── */}
        <section className="overflow-hidden rounded-2xl bg-ys-navy">
          <div className="flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-center lg:gap-10">
            <div className="min-w-0 flex-1">
              <p className="font-data text-[11px] tracking-[0.24em] text-ys-gold">
                Y-COMPASS 2030
              </p>
              <h1 className="font-display mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
                {userName}님, 지금까지
                <br />
                {coreScores ? (
                  <>
                    <span className="text-ys-gold">{litCount}개 방향</span>에 빛이 닿았습니다
                  </>
                ) : (
                  <>여기까지 왔습니다</>
                )}
              </h1>
              {departmentName && (
                <p className="mt-2 text-sm text-ys-mist">{departmentName}</p>
              )}

              {/* 유학생에게는 마일리지를 렌더링하지 않는다 (0점 표시 금지) */}
              <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
                {studentType === "domestic" ? (
                  <div>
                    <p className="text-[11px] text-ys-mist">내 마일리지</p>
                    <p className="font-data mt-0.5 text-2xl font-medium text-ys-gold">
                      {mileage}
                      <span className="ml-1 text-xs text-ys-mist">점</span>
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] text-ys-mist">이수 완료 프로그램</p>
                    <p className="font-data mt-0.5 text-2xl font-medium text-ys-gold">
                      {completedCount}
                      <span className="ml-1 text-xs text-ys-mist">개</span>
                    </p>
                  </div>
                )}

                {coreScores && (
                  <div>
                    <p className="text-[11px] text-ys-mist">빛이 닿은 방향</p>
                    <p className="font-data mt-0.5 text-2xl font-medium text-white">
                      {litCount}
                      <span className="ml-1 text-xs text-ys-mist">/ {compassAxes.length}</span>
                    </p>
                  </div>
                )}
              </div>

              {studentType !== "domestic" && certificates.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {certificates.slice(0, 3).map((c) => (
                    <button
                      key={c.certificateNo}
                      type="button"
                      onClick={async () => {
                        setCertError("");
                        try { await openCertificate(c.certificateNo); }
                        catch (e) { setCertError(e instanceof Error ? e.message : "수료증 열기 실패"); }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ys-navy-line px-3 py-1.5 text-[11.5px] text-ys-mist transition hover:border-ys-gold hover:text-ys-gold"
                      title={c.programName}
                    >
                      <Award className="h-3 w-3" />
                      수료증
                    </button>
                  ))}
                </div>
              )}
              {certError && <p className="mt-2 text-[11.5px] text-red-300">{certError}</p>}

              {/* 이어보기 */}
              {resume && (
                <Link
                  href={resume.href}
                  className="group mt-7 flex items-center gap-3 rounded-xl border border-ys-navy-line bg-ys-navy-soft p-3.5 transition hover:border-ys-gold/60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ys-gold text-ys-navy">
                    <PlayCircle className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-white">
                      {resume.contentTitle}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-ys-mist">
                      {formatClock(resume.lastPositionSec)}부터 · 진도 {resume.progress}%
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ys-mist transition group-hover:text-ys-gold" />
                </Link>
              )}
            </div>

            {/* 역량 나침반 */}
            <div className="flex shrink-0 justify-center lg:w-[420px]">
              {coreScores ? (
                <CompetencyCompass
                  axes={compassAxes}
                  max={CORE_MAX}
                  className="ys-bloom h-auto w-full max-w-[380px]"
                />
              ) : (
                <div className="flex w-full max-w-[380px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-ys-navy-line px-6 py-12 text-center">
                  <Compass className="h-8 w-8 text-ys-navy-line" />
                  <p className="text-sm text-ys-mist">
                    아직 핵심역량 진단 결과가 없습니다.
                    <br />
                    진단을 마치면 나침반이 켜집니다.
                  </p>
                  <Link
                    href="/diagnosis/core"
                    className="rounded-full bg-ys-gold px-5 py-2.5 text-[13.5px] font-semibold text-ys-navy transition hover:bg-ys-light"
                  >
                    핵심역량 진단하기
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── 아직 닿지 않은 방향의 과정 (내국인만) ── */}
        {studentType === "domestic" && recommended.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="font-display text-base font-bold text-ys-ink">
                아직 닿지 않은 방향
              </h2>
              <span className="text-xs text-ys-ink-soft">낮은 역량 2개 기준 추천</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {recommended.map((p) => (
                <Link
                  key={p.id}
                  href={`/lms/${p.id}`}
                  className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:border-ys-blue/40 hover:shadow-sm"
                >
                  <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-ys-blue/10 text-ys-blue">
                    <Video className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="text-sm font-semibold text-ys-ink">{p.name}</h3>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 flex-1 text-xs text-ys-ink-soft">{p.description}</p>
                  )}
                  <span className="mt-3 inline-flex items-center text-xs font-medium text-ys-blue">
                    학습하기 <ArrowRight className="ml-1 h-3 w-3 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 역량진단 ── */}
        <section className="mt-10">
          <h2 className="font-display mb-4 text-base font-bold text-ys-ink">역량진단</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {diagnosisCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition hover:border-ys-blue/40 hover:shadow-sm"
                >
                  <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-ys-blue/10 text-ys-blue">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="text-sm font-semibold text-ys-ink">{card.title}</h3>
                  <p className="mt-1 flex-1 text-xs text-ys-ink-soft">{card.description}</p>
                  <span className="mt-3 inline-flex items-center text-xs font-medium text-ys-blue">
                    시작하기 <ArrowRight className="ml-1 h-3 w-3 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── 전공역량 ── */}
        <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-5 flex items-baseline gap-2">
            <h2 className="font-display text-base font-bold text-ys-ink">전공역량 현황</h2>
            {departmentName && <span className="text-xs text-ys-ink-soft">{departmentName}</span>}
          </div>
          {majorComps.length > 0 ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={majorComps.map((mc) => ({ name: mc.name, 이수: mc.score }))}
                  margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#46586F" }} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#46586F" }} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "#1E66A210" }} />
                  <Bar dataKey="이수" fill="#1E66A2" radius={[4, 4, 0, 0]} maxBarSize={54} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-ys-ink-soft">
              {departmentName
                ? "아직 수강 완료한 과목이 없습니다"
                : "학과가 설정되지 않았습니다. 관리자에게 문의하세요."}
            </p>
          )}
        </section>

        {/* ── 최근 활동 ── */}
        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-ys-ink">최근 수강 과목</h2>
              <Link href="/courses" className="text-xs font-medium text-ys-blue hover:underline">
                전체보기
              </Link>
            </div>
            {recentCourses.length > 0 ? (
              <ul className="flex flex-col gap-2.5">
                {recentCourses.map((c, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm text-ys-ink">
                    <BookOpen className="h-4 w-4 shrink-0 text-ys-blue/60" />
                    {c.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ys-ink-soft">수강 중인 과목이 없습니다</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-ys-ink">최근 비교과 활동</h2>
              <Link href="/extracurricular" className="text-xs font-medium text-ys-blue hover:underline">
                전체보기
              </Link>
            </div>
            {recentExtra.length > 0 ? (
              <ul className="flex flex-col gap-2.5">
                {recentExtra.map((e, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm text-ys-ink">
                    <Trophy className="h-4 w-4 shrink-0 text-ys-blue/60" />
                    {e.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ys-ink-soft">참여 중인 비교과 활동이 없습니다</p>
            )}
          </div>
        </section>

        {/* ── AI 진로가이드 ── */}
        <Link
          href="/ai-guide"
          className="group mt-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ys-blue/25 bg-white p-6 transition hover:border-ys-blue/50"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ys-blue/10 text-ys-blue">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-base font-bold text-ys-ink">AI 진로가이드</h2>
              <p className="mt-0.5 text-sm text-ys-ink-soft">
                역량진단 결과를 바탕으로 맞춤형 진로 조언을 받아보세요
              </p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-ys-blue transition group-hover:translate-x-0.5" />
        </Link>
      </main>
    </div>
  );
}
