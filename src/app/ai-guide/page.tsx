"use client";

import { ArrowRight, BookOpen, ExternalLink, Sparkles, Target, Trophy, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, waitForStudentId } from "@/lib/supabase";
import Navigation from "@/components/Navigation";
import { CERTIFICATIONS, CAREER_PATHS, DEPTS } from "@/app/roadmap/data";
import CompetencyCompass from "@/components/CompetencyCompass";
import { CORE_COMPETENCIES, CORE_MAX, toSixAxes } from "@/lib/competencies";

type CoreComp = { id: number; name: string; color_code: string };
type MajorComp = { id: number; name: string; department_id: number };
type MyCourse = { courses: { name: string; core_competency_tags: number[]; major_competency_tags: number[] } | null };
type MyExtra = { status: string; extracurricular: { name: string; core_competency_tags: number[]; major_competency_tags: number[] } | null };

const DEPT_KEY_MAP: Record<number, string> = {
  1: "theology", 2: "christianEdu", 3: "counseling", 4: "socialWelfare", 5: "multiCulture",
};

const CENTERS = [
  { name: "취창업진로지원센터", desc: "진로상담, 취업역량 강화, 자격증 이수 상담", when: "진로 방향이 불확실하거나 자격증 취득 계획이 필요할 때", color: "bg-ys-blue/10 text-ys-blue border-ys-blue/30" },
  { name: "교수학습지원센터", desc: "학습 코칭, 튜터링, 학습역량 향상 프로그램", when: "학습역량 점수가 낮거나 학습 방법 개선이 필요할 때", color: "bg-ys-gold/15 text-[#8A6212] border-ys-gold/30" },
  { name: "학생생활상담센터", desc: "심리상담, 진로상담, 위기상담, 적응상담", when: "소명진단 점수가 낮거나 진로 고민이 깊을 때", color: "bg-ys-blue/10 text-ys-blue border-violet-200" },
];

/**
 * 보완 조언 — core_competencies.id 기준.
 * 창의수행(3)과 융합사고(4)는 진단 점수가 같게 나오지만 보완 방법은 다르므로
 * 조언과 추천 프로그램은 따로 쓴다.
 */
const COMPETENCY_TIPS: Record<number, { boost: string; programs: string[] }> = {
  1: { boost: "영성역량을 강화하려면 경건훈련과 공동체 활동에 꾸준히 참여하세요.", programs: ["영성캠프", "채플", "기도모임", "선교활동"] },
  2: { boost: "기독교적 성찰역량을 키우려면 신앙과 학문을 잇는 글쓰기와 토론을 해보세요.", programs: ["신앙세미나", "성경공부", "기독교윤리 특강"] },
  3: { boost: "창의수행역량은 생각을 실제로 만들어볼 때 자랍니다. 직접 기획하고 끝까지 완성하는 경험을 쌓으세요.", programs: ["창의워크숍", "공모전", "현장실습", "캡스톤"] },
  4: { boost: "융합사고역량은 서로 다른 분야를 연결할 때 자랍니다. 전공 밖의 수업과 독서를 의도적으로 섞으세요.", programs: ["융합프로젝트", "전공연계 교양", "학제간 세미나", "독서토론"] },
  5: { boost: "공감소통역량을 높이려면 팀 활동과 경청 훈련에 참여하세요.", programs: ["멘토링", "팀프로젝트", "소통워크숍", "봉사활동"] },
  6: { boost: "글로컬시민역량을 강화하려면 다문화 이해와 지역사회 참여를 늘리세요.", programs: ["다문화체험", "봉사활동", "국제교류", "지역사회 프로젝트"] },
};

export default function CareerGuidePage() {
  const [userName, setUserName] = useState("");
  const [deptId, setDeptId] = useState<number | null>(null);
  const [deptName, setDeptName] = useState("");
  const [coreScores, setCoreScores] = useState<Record<string, number> | null>(null);
  const [learningScore, setLearningScore] = useState<number | null>(null);
  const [callingScore, setCallingScore] = useState<number | null>(null);
  const [coreComps, setCoreComps] = useState<CoreComp[]>([]);
  const [majorComps, setMajorComps] = useState<MajorComp[]>([]);
  const [myCourses, setMyCourses] = useState<MyCourse[]>([]);
  const [myExtras, setMyExtras] = useState<MyExtra[]>([]);
  const [majorDiagScores, setMajorDiagScores] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // 세션 복원 전에는 studentId 가 비어 있다. 기다리지 않으면 화면이 '분석 중...' 에서 멈춘다.
      const sid = await waitForStudentId();
      if (!sid?.trim()) {
        setLoading(false);
        return;
      }

      const [studentRes, coreRes, majorRes, coreCompRes, majorCompRes, courseRes, extraRes, learningRes, callingRes, majorDiagRes] = await Promise.all([
        supabase.from("students").select("name, department_id").eq("student_id", sid.trim()).maybeSingle(),
        supabase.from("diagnosis_results").select("scores, total_score").eq("student_id", sid.trim()).eq("diagnosis_type", "core").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("departments").select("*"),
        supabase.from("core_competencies").select("*").order("id"),
        supabase.from("major_competencies").select("*").order("id"),
        supabase.from("student_courses").select("courses(name, core_competency_tags, major_competency_tags)").eq("student_id", sid.trim()),
        supabase.from("student_extracurricular").select("status, extracurricular(name, core_competency_tags, major_competency_tags)").eq("student_id", sid.trim()),
        supabase.from("diagnosis_results").select("total_score").eq("student_id", sid.trim()).eq("diagnosis_type", "learning").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("diagnosis_results").select("total_score").eq("student_id", sid.trim()).eq("diagnosis_type", "calling").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("assessment_sessions").select("competency_scores").eq("student_id", sid.trim()).not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      setUserName(studentRes.data?.name ?? "");
      setDeptId(studentRes.data?.department_id ?? null);
      const dept = (majorRes.data ?? []).find((d: any) => d.id === studentRes.data?.department_id);
      setDeptName(dept?.name ?? "");
      setCoreScores(coreRes.data?.scores as Record<string, number> | null);
      setLearningScore(learningRes.data?.total_score ?? null);
      setCallingScore(callingRes.data?.total_score ?? null);
      setCoreComps(coreCompRes.data ?? []);
      setMajorComps(majorCompRes.data ?? []);
      setMyCourses((courseRes.data ?? []) as unknown as MyCourse[]);
      setMyExtras((extraRes.data ?? []) as unknown as MyExtra[]);
      setMajorDiagScores(majorDiagRes.data?.competency_scores as Record<string, number> | null);
      setLoading(false);
    })();
  }, []);

  // 핵심역량 분석
  const coreAnalysis = useMemo(() => {
    const axes = toSixAxes(coreScores);
    if (!axes) return null;
    const entries = axes.map((a) => ({
      ...a,
      percentage: Math.round((a.score / CORE_MAX) * 100),
    }));
    // 창의수행·융합사고는 점수가 같아 정렬 순서가 갈리지 않는다. id 순으로 안정 정렬한다.
    const sorted = [...entries].sort((a, b) => a.score - b.score || a.id - b.id);
    return {
      all: entries,
      strongest: sorted.slice(-2).reverse(),
      weakest: sorted.slice(0, 2),
      // 총점은 진단이 실제로 측정한 5개 값의 합이다. 6축으로 펼친 값을 더하면 창의 점수가 두 번 들어간다.
      total: Object.values(coreScores ?? {}).reduce((sum, v) => sum + Number(v ?? 0), 0),
      litCount: entries.filter((e) => e.lit).length,
    };
  }, [coreScores]);

  // 수강 과목으로 쌓인 역량 태그 카운트
  const courseCompCount = useMemo(() => {
    const core: Record<number, number> = {};
    const major: Record<number, number> = {};
    myCourses.forEach((mc) => {
      (mc.courses?.core_competency_tags ?? []).forEach((t) => { core[t] = (core[t] ?? 0) + 1; });
      (mc.courses?.major_competency_tags ?? []).forEach((t) => { major[t] = (major[t] ?? 0) + 1; });
    });
    return { core, major };
  }, [myCourses]);

  // 비교과로 쌓인 역량 태그 카운트
  const extraCompCount = useMemo(() => {
    const core: Record<number, number> = {};
    myExtras.filter((e) => e.status === "완료").forEach((me) => {
      (me.extracurricular?.core_competency_tags ?? []).forEach((t) => { core[t] = (core[t] ?? 0) + 1; });
    });
    return core;
  }, [myExtras]);

  // 학과별 자격증
  const deptKey = deptId ? DEPT_KEY_MAP[deptId] : null;
  const myCerts = useMemo(() => {
    if (!deptKey) return [];
    return Object.entries(CERTIFICATIONS).filter(([, c]) => c.dept === deptKey);
  }, [deptKey]);
  const myCareerPath = deptKey ? CAREER_PATHS[deptKey] : null;
  const myCourseName = useMemo(() => new Set(myCourses.map((mc) => mc.courses?.name).filter(Boolean) as string[]), [myCourses]);

  // 센터 추천 로직
  const recommendedCenters = useMemo(() => {
    const recs: { name: string; reason: string }[] = [];
    if (callingScore !== null && callingScore < 60) {
      recs.push({ name: "학생생활상담센터", reason: "소명진단 점수가 낮아 진로 탐색 상담을 추천합니다" });
    }
    if (learningScore !== null && learningScore < 30) {
      recs.push({ name: "교수학습지원센터", reason: "학습역량 향상을 위한 코칭 프로그램을 추천합니다" });
    }
    if (myCerts.length > 0) {
      recs.push({ name: "취창업진로지원센터", reason: "자격증 취득 계획과 취업 전략 상담을 추천합니다" });
    }
    if (recs.length === 0) {
      recs.push({ name: "취창업진로지원센터", reason: "졸업 후 진로 설계를 위한 상담을 추천합니다" });
    }
    return recs;
  }, [callingScore, learningScore, myCerts]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-ys-paper"><p className="text-ys-ink-soft">분석 중...</p></div>;
  }

  return (
    <div className="min-h-screen bg-ys-paper">
      <Navigation />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* 헤더 */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ys-blue/15">
            <Sparkles className="h-6 w-6 text-ys-blue" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ys-ink">{userName}님의 진로가이드</h1>
            <p className="text-sm text-ys-ink-soft">{deptName ? `${deptName} · ` : ""}역량진단·수강·비교과 데이터를 종합 분석한 맞춤 가이드입니다</p>
          </div>
        </div>

        {/* 진단 미완료 안내 */}
        {!coreScores && (
          <div className="mb-8 rounded-2xl border border-ys-gold/30 bg-ys-gold/10 p-6">
            <h2 className="text-base font-semibold text-ys-ink">역량진단을 먼저 완료해주세요</h2>
            <p className="mt-1 text-sm text-[#8A6212]">핵심역량진단 결과가 있어야 맞춤 진로가이드를 제공할 수 있습니다.</p>
            <Link href="/diagnosis/core" className="mt-3 inline-flex items-center gap-1 rounded-full bg-ys-gold px-4 py-2 text-sm font-medium text-ys-navy hover:bg-ys-light">
              핵심역량진단 하러가기 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* 핵심역량 분석 */}
        {coreAnalysis && (
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            {/* 나침반 */}
            <div className="overflow-hidden rounded-2xl bg-ys-navy p-6">
              <h2 className="font-data text-[11px] font-medium tracking-[0.2em] text-ys-gold">
                CORE COMPETENCY
              </h2>
              <p className="mt-1 text-sm text-ys-mist">
                6개 방향 중 {coreAnalysis.litCount}곳에 빛이 닿아 있습니다.
              </p>
              <CompetencyCompass
                axes={CORE_COMPETENCIES.map((c) => ({
                  label: c.short,
                  score: coreAnalysis.all.find((e) => e.id === c.id)?.score ?? 0,
                }))}
                max={CORE_MAX}
                className="ys-bloom mx-auto mt-2 h-auto w-full max-w-[300px]"
              />
              <p className="mt-1 text-center text-sm text-ys-mist">
                총점 <span className="font-display text-lg font-bold text-white">{coreAnalysis.total}</span>
                <span className="text-ys-mist/70"> / 125점</span>
              </p>
            </div>

            {/* 강점/약점 분석 */}
            <div className="space-y-4">
              {/* 강점 */}
              <div className="rounded-2xl border border-ys-gold/30 bg-ys-gold/10 p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#8A6212]">
                  <TrendingUp className="h-4 w-4" /> 강점 역량
                </h3>
                {coreAnalysis.strongest.map((c) => (
                  <div key={c.id} className="mt-2">
                    <div className="flex justify-between text-sm"><span className="font-medium text-ys-ink">{c.name}</span><span className="text-[#8A6212]">{c.score}/25 ({c.percentage}%)</span></div>
                    <div className="mt-1 h-2 rounded-full bg-slate-200"><div className="h-full rounded-full bg-ys-gold" style={{ width: `${c.percentage}%` }} /></div>
                  </div>
                ))}
                <p className="mt-3 text-xs text-[#8A6212]">이 역량을 살린 진로를 탐색해보세요!</p>
              </div>

              {/* 약점 + 추천 */}
              <div className="rounded-2xl border border-ys-sky/40 bg-ys-sky/8 p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ys-blue">
                  <Target className="h-4 w-4" /> 더 채울 수 있는 역량
                </h3>
                {coreAnalysis.weakest.map((c) => {
                  const tip = COMPETENCY_TIPS[c.id];
                  return (
                    <div key={c.id} className="mt-3">
                      <div className="flex justify-between text-sm"><span className="font-medium text-ys-ink">{c.name}</span><span className="text-ys-blue">{c.score}/25 ({c.percentage}%)</span></div>
                      <div className="mt-1 h-2 rounded-full bg-slate-200"><div className="h-full rounded-full bg-ys-sky" style={{ width: `${c.percentage}%` }} /></div>
                      {tip && (
                        <div className="mt-2">
                          <p className="text-xs text-ys-blue">{tip.boost}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {tip.programs.map((p) => (
                              <span key={p} className="rounded bg-ys-sky/15 px-1.5 py-0.5 text-[10px] text-ys-blue">{p}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 기타 진단 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-ys-ink-soft">학습역량</p>
                  {learningScore !== null ? (
                    <p className={`mt-1 text-lg font-bold ${learningScore >= 35 ? "text-[#8A6212]" : learningScore >= 25 ? "text-ys-ink" : "text-red-600"}`}>{learningScore}점 / 50점</p>
                  ) : (
                    <Link href="/diagnosis/learning" className="mt-1 text-xs text-ys-blue hover:underline">진단하기</Link>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-ys-ink-soft">소명진단</p>
                  {callingScore !== null ? (
                    <p className={`mt-1 text-lg font-bold ${callingScore >= 80 ? "text-[#8A6212]" : callingScore >= 60 ? "text-ys-ink" : "text-red-600"}`}>{callingScore}점 / 100점</p>
                  ) : (
                    <Link href="/diagnosis/calling" className="mt-1 text-xs text-ys-blue hover:underline">진단하기</Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 수강/비교과 역량 누적 */}
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ys-ink">
            <BookOpen className="h-5 w-5 text-ys-blue" /> 교과·비교과 역량 누적 현황
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-ys-ink-soft">핵심역량 (수강 과목 기준)</p>
              {coreComps.map((comp) => {
                const count = (courseCompCount.core[comp.id] ?? 0) + (extraCompCount[comp.id] ?? 0);
                return (
                  <div key={comp.id} className="mb-1.5 flex items-center gap-2">
                    <span className="w-24 text-xs text-ys-ink">{comp.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(count * 15, 100)}%`, backgroundColor: comp.color_code }} />
                    </div>
                    <span className="w-8 text-right text-xs text-ys-ink-soft">{count}개</span>
                  </div>
                );
              })}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-ys-ink-soft">전공역량 (수강 과목 기준)</p>
              {majorComps.filter((mc) => mc.department_id === deptId).map((comp) => {
                const count = courseCompCount.major[comp.id] ?? 0;
                return (
                  <div key={comp.id} className="mb-1.5 flex items-center gap-2">
                    <span className="w-24 text-xs text-ys-ink">{comp.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-ys-blue" style={{ width: `${Math.min(count * 20, 100)}%` }} />
                    </div>
                    <span className="w-8 text-right text-xs text-ys-ink-soft">{count}개</span>
                  </div>
                );
              })}
              {majorComps.filter((mc) => mc.department_id === deptId).length === 0 && (
                <p className="text-xs text-ys-ink-soft/70">학과 설정 후 확인 가능</p>
              )}
            </div>
          </div>
          <p className="mt-3 text-[10px] text-ys-ink-soft/70">* 수강 완료·비교과 참여 과목에 태그된 역량을 기준으로 집계합니다</p>
        </div>

        {/* 전공역량진단 분석 */}
        {majorDiagScores && (
          <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ys-ink">
              <Target className="h-5 w-5 text-ys-sky" /> 전공역량진단 분석
              {deptName && <span className="text-xs font-normal text-ys-ink-soft">({deptName})</span>}
            </h2>

            {/* 점수 바 차트 */}
            <div className="mb-5 space-y-3">
              {Object.entries(majorDiagScores).map(([name, score]) => {
                const maxScore = 25;
                const pct = Math.min(Math.round((score / maxScore) * 100), 100);
                const level = pct >= 80 ? "우수" : pct >= 60 ? "보통" : "보완 필요";
                const barColor = pct >= 80 ? "#10B981" : pct >= 60 ? "#F59E0B" : "#EF4444";
                const bgColor = pct >= 80 ? "bg-ys-gold/15 text-[#8A6212]" : pct >= 60 ? "bg-ys-gold/10 text-[#8A6212]" : "bg-red-50 text-red-700";
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-ys-ink">{name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${bgColor}`}>{level}</span>
                        <span className="text-xs text-ys-ink-soft">{score}점</span>
                      </div>
                    </div>
                    <div className="mt-1 h-2.5 rounded-full bg-slate-100">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 강점/약점 분석 */}
            {(() => {
              const entries = Object.entries(majorDiagScores).sort((a, b) => b[1] - a[1]);
              const strongest = entries[0];
              const weakest = entries[entries.length - 1];
              if (!strongest || !weakest) return null;

              const MAJOR_TIPS: Record<number, Record<string, { tip: string; courses: string[] }>> = {
                1: { // 신학과
                  "공통문항": { tip: "전공 기초 소양을 더 쌓아보세요.", courses: ["조직신학개론", "신약개론", "구약개론"] },
                  "전공지식문항": { tip: "심화 전공 과목을 통해 신학적 깊이를 더하세요.", courses: ["세계교회사", "선교학", "기독교윤리학"] },
                  "SJT문항": { tip: "현장 실천 역량을 키워보세요.", courses: ["실천신학개론", "기독교교육개론", "선교현장 연구와 실습"] },
                },
                2: { // 기독교교육학과
                  "공통문항": { tip: "교육학 기초를 탄탄히 다져보세요.", courses: ["교육학개론", "기독교교육개론", "인간발달의 이해"] },
                  "전공지식문항": { tip: "교육 이론과 방법론을 심화 학습하세요.", courses: ["기독교교육사상사", "교육신학", "교육방법 및 교육공학"] },
                  "SJT문항": { tip: "교육 현장 실습 경험을 늘려보세요.", courses: ["기독교교육현장과 실습", "교육실습", "성서교수법"] },
                },
                3: { // 상담심리학과
                  "공통문항": { tip: "상담 기초 역량을 더 다져보세요.", courses: ["상담심리학", "성격심리", "발달심리학"] },
                  "전공지식문항": { tip: "상담 이론과 진단 역량을 강화하세요.", courses: ["이상심리학", "심리측정 및 평가", "임상심리학"] },
                  "SJT문항": { tip: "실제 상담 실습 경험을 쌓아보세요.", courses: ["개인상담", "집단상담", "상담현장실습"] },
                },
                4: { // 사회복지학과
                  "공통문항": { tip: "사회복지 기초 이해를 넓혀보세요.", courses: ["사회복지학개론", "인간행동과 사회환경", "기독교사회복지"] },
                  "전공지식문항": { tip: "실천 기술과 정책 이해를 심화하세요.", courses: ["사회복지실천기술론", "사회복지정책론", "사회복지조사론"] },
                  "SJT문항": { tip: "현장실습으로 실무 감각을 키워보세요.", courses: ["사회복지현장실습 1", "지역사회복지론", "사례관리론"] },
                },
                5: { // 국제언어다문화학과
                  "공통문항": { tip: "다문화 이해의 기초를 넓혀보세요.", courses: ["다문화개론", "언어학개론", "외국어습득론"] },
                  "전공지식문항": { tip: "언어교육과 이민정책 지식을 심화하세요.", courses: ["다문화 커뮤니케이션", "이민정책론", "이민법제론"] },
                  "SJT문항": { tip: "현장 실습과 문화 중재 경험을 쌓아보세요.", courses: ["이민다문화현장실습", "다문화가족상담의 실제", "국제협력과 세계시민교육"] },
                },
              };

              const weakTip = deptId ? MAJOR_TIPS[deptId]?.[weakest[0]] : null;

              return (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-ys-gold/30 bg-ys-gold/10 p-4">
                    <p className="text-xs font-semibold text-[#8A6212]">전공 강점</p>
                    <p className="mt-1 text-sm font-medium text-ys-ink">{strongest[0]}</p>
                    <p className="mt-1 text-xs text-[#8A6212]">이 영역의 역량이 가장 뛰어납니다. 관련 심화 과목과 자격증을 도전해보세요!</p>
                  </div>
                  <div className="rounded-xl border border-ys-sky/40 bg-ys-sky/8 p-4">
                    <p className="text-xs font-semibold text-ys-blue">보완 추천</p>
                    <p className="mt-1 text-sm font-medium text-ys-ink">{weakest[0]}</p>
                    {weakTip ? (
                      <>
                        <p className="mt-1 text-xs text-ys-blue">{weakTip.tip}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {weakTip.courses.map((c) => (
                            <span key={c} className="rounded bg-ys-sky/15 px-1.5 py-0.5 text-[10px] text-ys-blue">{c}</span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-ys-blue">관련 과목을 추가 수강하여 역량을 보완해보세요.</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {!deptName && <p className="mt-3 text-xs text-ys-ink-soft/70">학과 설정 후 더 구체적인 추천을 받을 수 있습니다.</p>}
          </div>
        )}

        {/* 전공역량진단 미완료 안내 */}
        {!majorDiagScores && deptName && (
          <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ys-ink">전공역량진단</p>
                <p className="mt-0.5 text-xs text-ys-ink-soft">전공역량진단을 완료하면 학과 맞춤 진로 분석을 받을 수 있습니다.</p>
              </div>
              <Link href="/diagnosis/major" className="rounded-full bg-ys-blue px-4 py-2 text-xs font-medium text-white hover:bg-ys-navy-soft">
                진단하기
              </Link>
            </div>
          </div>
        )}

        {/* 자격증 이수 현황 + 진로 */}
        {myCerts.length > 0 && (
          <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ys-ink">
              <Trophy className="h-5 w-5 text-ys-gold" /> 자격증 이수 현황 및 진로
            </h2>
            <div className="space-y-4">
              {myCerts.map(([key, cert]) => {
                const reqDone = cert.required.filter((c) => myCourseName.has(c)).length;
                const pct = Math.round((reqDone / cert.required.length) * 100);
                const missing = cert.required.filter((c) => !myCourseName.has(c));
                return (
                  <div key={key} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold" style={{ color: cert.color }}>{cert.name}</h3>
                      <span className="text-xs text-ys-ink-soft">{cert.type}</span>
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-ys-ink-soft">
                        <span>필수 이수 {reqDone}/{cert.required.length}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="mt-1 h-2.5 rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cert.color }} />
                      </div>
                    </div>
                    {missing.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-ys-ink-soft">미이수 과목</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {missing.slice(0, 8).map((c) => (
                            <span key={c} className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700 border border-red-200">{c.replace(" [SDU]", "")}</span>
                          ))}
                          {missing.length > 8 && <span className="text-[10px] text-ys-ink-soft/70">외 {missing.length - 8}개</span>}
                        </div>
                      </div>
                    )}
                    {missing.length === 0 && <p className="mt-2 text-xs font-medium text-[#8A6212]">모든 필수 과목 이수 완료!</p>}
                    <div className="mt-3">
                      <p className="text-xs font-medium text-ys-ink-soft">취득 후 진로</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {cert.careers.map((c) => (
                          <span key={c} className="rounded bg-ys-paper px-1.5 py-0.5 text-[10px] text-ys-ink border border-slate-200">{c}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 졸업 후 진로 */}
        {myCareerPath && (
          <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-ys-ink">{deptName} 졸업 후 진로</h2>
            <div className="flex flex-wrap gap-2">
              {myCareerPath.careers.map((c) => (
                <span key={c} className="rounded-full border border-slate-200 bg-ys-paper px-3 py-1.5 text-xs text-ys-ink">{c}</span>
              ))}
            </div>
            {myCareerPath.note && <p className="mt-3 text-xs italic text-ys-ink-soft">{myCareerPath.note}</p>}
          </div>
        )}

        {/* 센터 연계 추천 */}
        <div className="mb-8">
          <h2 className="mb-4 text-base font-semibold text-ys-ink">맞춤 센터 추천</h2>
          <div className="space-y-3">
            {recommendedCenters.map((rec) => {
              const center = CENTERS.find((c) => c.name === rec.name)!;
              return (
                <div key={rec.name} className={`rounded-xl border p-4 ${center.color}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">{center.name}</h3>
                      <p className="mt-0.5 text-xs opacity-80">{center.desc}</p>
                      <p className="mt-2 text-xs font-medium">추천 이유: {rec.reason}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 전체 센터 안내 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-ys-ink">교내 지원 센터</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {CENTERS.map((center) => (
              <div key={center.name} className={`rounded-xl border p-4 ${center.color}`}>
                <p className="text-sm font-semibold">{center.name}</p>
                <p className="mt-1 text-xs opacity-80">{center.desc}</p>
                <p className="mt-2 text-[10px] opacity-60">{center.when}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-[10px] text-ys-ink-soft/70">* 이 가이드는 참고용이며, 구체적인 상담은 각 센터를 방문해주세요</p>
        </div>
      </main>
    </div>
  );
}
