"use client";

import { ArrowRight, BookOpen, ExternalLink, Sparkles, Target, Trophy, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import Navigation from "@/components/Navigation";
import { CERTIFICATIONS, CAREER_PATHS, DEPTS } from "@/app/roadmap/data";
import {
  Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Tooltip,
} from "recharts";

type CoreComp = { id: number; name: string; color_code: string };
type MajorComp = { id: number; name: string; department_id: number };
type MyCourse = { courses: { name: string; core_competency_tags: number[]; major_competency_tags: number[] } | null };
type MyExtra = { status: string; extracurricular: { name: string; core_competency_tags: number[]; major_competency_tags: number[] } | null };

const CORE_LABELS: Record<string, string> = {
  spiritual: "영성역량", reflection: "기독교적 성찰역량", empathy: "공감소통역량",
  glocal: "글로컬역량", creative: "창의융합역량",
};

const DEPT_KEY_MAP: Record<number, string> = {
  1: "theology", 2: "christianEdu", 3: "counseling", 4: "socialWelfare", 5: "multiCulture",
};

const CENTERS = [
  { name: "취창업지원센터", desc: "진로상담, 취업역량 강화, 자격증 이수 상담", when: "진로 방향이 불확실하거나 자격증 취득 계획이 필요할 때", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { name: "교수학습지원센터", desc: "학습 코칭, 튜터링, 학습역량 향상 프로그램", when: "학습역량 점수가 낮거나 학습 방법 개선이 필요할 때", color: "bg-green-50 text-green-700 border-green-200" },
  { name: "학생생활상담센터", desc: "심리상담, 진로상담, 위기상담, 적응상담", when: "소명진단 점수가 낮거나 진로 고민이 깊을 때", color: "bg-violet-50 text-violet-700 border-violet-200" },
];

const COMPETENCY_TIPS: Record<string, { boost: string; programs: string[] }> = {
  spiritual: { boost: "영성역량을 강화하려면 경건훈련과 공동체 활동에 참여하세요.", programs: ["영성캠프", "채플", "기도모임", "선교활동"] },
  reflection: { boost: "기독교적 성찰역량을 키우려면 신앙과 학문의 통합을 연습하세요.", programs: ["신앙세미나", "성경공부", "기독교윤리 특강"] },
  empathy: { boost: "공감소통역량을 높이려면 팀 활동과 소통 훈련에 참여하세요.", programs: ["멘토링", "팀프로젝트", "소통워크숍", "봉사활동"] },
  glocal: { boost: "글로컬역량을 강화하려면 다문화 이해와 지역사회 참여를 늘리세요.", programs: ["다문화체험", "봉사활동", "국제교류", "지역사회 프로젝트"] },
  creative: { boost: "창의융합역량을 키우려면 다양한 분야의 지식을 연결하는 연습을 하세요.", programs: ["창의워크숍", "융합프로젝트", "현장실습", "공모전"] },
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid?.trim()) return;

      const [studentRes, coreRes, majorRes, coreCompRes, majorCompRes, courseRes, extraRes, learningRes, callingRes] = await Promise.all([
        supabase.from("students").select("name, department_id").eq("student_id", sid.trim()).maybeSingle(),
        supabase.from("diagnosis_results").select("scores, total_score").eq("student_id", sid.trim()).eq("diagnosis_type", "core").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("departments").select("*"),
        supabase.from("core_competencies").select("*").order("id"),
        supabase.from("major_competencies").select("*").order("id"),
        supabase.from("student_courses").select("courses(name, core_competency_tags, major_competency_tags)").eq("student_id", sid.trim()),
        supabase.from("student_extracurricular").select("status, extracurricular(name, core_competency_tags, major_competency_tags)").eq("student_id", sid.trim()),
        supabase.from("diagnosis_results").select("total_score").eq("student_id", sid.trim()).eq("diagnosis_type", "learning").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("diagnosis_results").select("total_score").eq("student_id", sid.trim()).eq("diagnosis_type", "calling").order("created_at", { ascending: false }).limit(1).maybeSingle(),
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
      setLoading(false);
    })();
  }, []);

  // 핵심역량 분석
  const coreAnalysis = useMemo(() => {
    if (!coreScores) return null;
    const entries = Object.entries(coreScores).map(([key, value]) => ({
      key, label: CORE_LABELS[key] ?? key, score: value, max: 25,
      percentage: Math.round((value / 25) * 100),
    }));
    const sorted = [...entries].sort((a, b) => a.score - b.score);
    return {
      all: entries,
      strongest: sorted.slice(-2).reverse(),
      weakest: sorted.slice(0, 2),
      total: entries.reduce((sum, e) => sum + e.score, 0),
      radarData: entries.map((e) => ({ subject: e.label, value: e.score, fullMark: 25 })),
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
      recs.push({ name: "취창업지원센터", reason: "자격증 취득 계획과 취업 전략 상담을 추천합니다" });
    }
    if (recs.length === 0) {
      recs.push({ name: "취창업지원센터", reason: "졸업 후 진로 설계를 위한 상담을 추천합니다" });
    }
    return recs;
  }, [callingScore, learningScore, myCerts]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="text-slate-500">분석 중...</p></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* 헤더 */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
            <Sparkles className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{userName}님의 진로가이드</h1>
            <p className="text-sm text-slate-600">{deptName ? `${deptName} · ` : ""}역량진단·수강·비교과 데이터를 종합 분석한 맞춤 가이드입니다</p>
          </div>
        </div>

        {/* 진단 미완료 안내 */}
        {!coreScores && (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-base font-semibold text-amber-800">역량진단을 먼저 완료해주세요</h2>
            <p className="mt-1 text-sm text-amber-700">핵심역량진단 결과가 있어야 맞춤 진로가이드를 제공할 수 있습니다.</p>
            <Link href="/diagnosis/core" className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
              핵심역량진단 하러가기 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* 핵심역량 분석 */}
        {coreAnalysis && (
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            {/* 레이더 차트 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-800">핵심역량 현황</h2>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={coreAnalysis.radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} tickLine={false} />
                    <PolarRadiusAxis angle={90} domain={[0, 25]} tick={{ fontSize: 10 }} />
                    <Radar name="점수" dataKey="value" stroke="#6366f1" fill="#818cf8" fillOpacity={0.4} strokeWidth={2} />
                    <Tooltip formatter={(v: any) => [`${v}점`, "점수"]} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-center text-sm text-slate-500">총점 {coreAnalysis.total}점 / 125점</p>
            </div>

            {/* 강점/약점 분석 */}
            <div className="space-y-4">
              {/* 강점 */}
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-green-800">
                  <TrendingUp className="h-4 w-4" /> 강점 역량
                </h3>
                {coreAnalysis.strongest.map((c) => (
                  <div key={c.key} className="mt-2">
                    <div className="flex justify-between text-sm"><span className="font-medium text-green-900">{c.label}</span><span className="text-green-700">{c.score}/25 ({c.percentage}%)</span></div>
                    <div className="mt-1 h-2 rounded-full bg-green-200"><div className="h-full rounded-full bg-green-600" style={{ width: `${c.percentage}%` }} /></div>
                  </div>
                ))}
                <p className="mt-3 text-xs text-green-700">이 역량을 살린 진로를 탐색해보세요!</p>
              </div>

              {/* 약점 + 추천 */}
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-orange-800">
                  <Target className="h-4 w-4" /> 보완 필요 역량
                </h3>
                {coreAnalysis.weakest.map((c) => {
                  const tip = COMPETENCY_TIPS[c.key];
                  return (
                    <div key={c.key} className="mt-3">
                      <div className="flex justify-between text-sm"><span className="font-medium text-orange-900">{c.label}</span><span className="text-orange-700">{c.score}/25 ({c.percentage}%)</span></div>
                      <div className="mt-1 h-2 rounded-full bg-orange-200"><div className="h-full rounded-full bg-orange-500" style={{ width: `${c.percentage}%` }} /></div>
                      {tip && (
                        <div className="mt-2">
                          <p className="text-xs text-orange-800">{tip.boost}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {tip.programs.map((p) => (
                              <span key={p} className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">{p}</span>
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
                  <p className="text-xs text-slate-500">학습역량</p>
                  {learningScore !== null ? (
                    <p className={`mt-1 text-lg font-bold ${learningScore >= 35 ? "text-green-600" : learningScore >= 25 ? "text-slate-900" : "text-red-600"}`}>{learningScore}점 / 50점</p>
                  ) : (
                    <Link href="/diagnosis/learning" className="mt-1 text-xs text-blue-600 hover:underline">진단하기</Link>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">소명진단</p>
                  {callingScore !== null ? (
                    <p className={`mt-1 text-lg font-bold ${callingScore >= 80 ? "text-green-600" : callingScore >= 60 ? "text-slate-900" : "text-red-600"}`}>{callingScore}점 / 100점</p>
                  ) : (
                    <Link href="/diagnosis/calling" className="mt-1 text-xs text-blue-600 hover:underline">진단하기</Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 수강/비교과 역량 누적 */}
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800">
            <BookOpen className="h-5 w-5 text-blue-500" /> 교과·비교과 역량 누적 현황
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">핵심역량 (수강 과목 기준)</p>
              {coreComps.map((comp) => {
                const count = (courseCompCount.core[comp.id] ?? 0) + (extraCompCount[comp.id] ?? 0);
                return (
                  <div key={comp.id} className="mb-1.5 flex items-center gap-2">
                    <span className="w-24 text-xs text-slate-700">{comp.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(count * 15, 100)}%`, backgroundColor: comp.color_code }} />
                    </div>
                    <span className="w-8 text-right text-xs text-slate-500">{count}개</span>
                  </div>
                );
              })}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">전공역량 (수강 과목 기준)</p>
              {majorComps.filter((mc) => mc.department_id === deptId).map((comp) => {
                const count = courseCompCount.major[comp.id] ?? 0;
                return (
                  <div key={comp.id} className="mb-1.5 flex items-center gap-2">
                    <span className="w-24 text-xs text-slate-700">{comp.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(count * 20, 100)}%` }} />
                    </div>
                    <span className="w-8 text-right text-xs text-slate-500">{count}개</span>
                  </div>
                );
              })}
              {majorComps.filter((mc) => mc.department_id === deptId).length === 0 && (
                <p className="text-xs text-slate-400">학과 설정 후 확인 가능</p>
              )}
            </div>
          </div>
          <p className="mt-3 text-[10px] text-slate-400">* 수강 완료·비교과 참여 과목에 태그된 역량을 기준으로 집계합니다</p>
        </div>

        {/* 자격증 이수 현황 + 진로 */}
        {myCerts.length > 0 && (
          <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800">
              <Trophy className="h-5 w-5 text-amber-500" /> 자격증 이수 현황 및 진로
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
                      <span className="text-xs text-slate-500">{cert.type}</span>
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>필수 이수 {reqDone}/{cert.required.length}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="mt-1 h-2.5 rounded-full bg-slate-100">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cert.color }} />
                      </div>
                    </div>
                    {missing.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate-500">미이수 과목</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {missing.slice(0, 8).map((c) => (
                            <span key={c} className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700 border border-red-200">{c.replace(" [SDU]", "")}</span>
                          ))}
                          {missing.length > 8 && <span className="text-[10px] text-slate-400">외 {missing.length - 8}개</span>}
                        </div>
                      </div>
                    )}
                    {missing.length === 0 && <p className="mt-2 text-xs font-medium text-green-600">모든 필수 과목 이수 완료!</p>}
                    <div className="mt-3">
                      <p className="text-xs font-medium text-slate-500">취득 후 진로</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {cert.careers.map((c) => (
                          <span key={c} className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700 border border-slate-200">{c}</span>
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
            <h2 className="mb-4 text-base font-semibold text-slate-800">{deptName} 졸업 후 진로</h2>
            <div className="flex flex-wrap gap-2">
              {myCareerPath.careers.map((c) => (
                <span key={c} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">{c}</span>
              ))}
            </div>
            {myCareerPath.note && <p className="mt-3 text-xs italic text-slate-500">{myCareerPath.note}</p>}
          </div>
        )}

        {/* 센터 연계 추천 */}
        <div className="mb-8">
          <h2 className="mb-4 text-base font-semibold text-slate-800">맞춤 센터 추천</h2>
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
          <h2 className="mb-4 text-base font-semibold text-slate-800">교내 지원 센터</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {CENTERS.map((center) => (
              <div key={center.name} className={`rounded-xl border p-4 ${center.color}`}>
                <p className="text-sm font-semibold">{center.name}</p>
                <p className="mt-1 text-xs opacity-80">{center.desc}</p>
                <p className="mt-2 text-[10px] opacity-60">{center.when}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-[10px] text-slate-400">* 이 가이드는 참고용이며, 구체적인 상담은 각 센터를 방문해주세요</p>
        </div>
      </main>
    </div>
  );
}
