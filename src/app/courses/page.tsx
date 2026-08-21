"use client";

import { BookOpen, GraduationCap, Map, Tag, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import Navigation from "@/components/Navigation";
import { CERTIFICATIONS, CAREER_PATHS, DEPTS } from "@/app/roadmap/data";

type CoreComp = { id: number; name: string; color_code: string };
type MajorComp = { id: number; name: string; department_id: number };
type Department = { id: number; name: string };
type MyCourse = {
  id: number;
  course_id: number;
  semester: string | null;
  year: number | null;
  grade: string | null;
  status: string;
  courses: {
    name: string;
    professor: string | null;
    credit: number;
    department_id: number | null;
    core_competency_tags: number[];
    major_competency_tags: number[];
  } | null;
};

const DEPT_KEY_MAP: Record<number, string> = {
  1: "theology", 2: "christianEdu", 3: "counseling", 4: "socialWelfare", 5: "multiCulture",
};

export default function CoursesPage() {
  const [myCourses, setMyCourses] = useState<MyCourse[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [coreComps, setCoreComps] = useState<CoreComp[]>([]);
  const [majorComps, setMajorComps] = useState<MajorComp[]>([]);
  const [myDeptId, setMyDeptId] = useState<number | null>(null);
  const [selectedCert, setSelectedCert] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid?.trim()) return;

      const [studentRes, deptRes, coreRes, majorRes, courseRes] = await Promise.all([
        supabase.from("students").select("department_id").eq("student_id", sid.trim()).maybeSingle(),
        supabase.from("departments").select("*").order("id"),
        supabase.from("core_competencies").select("*").order("id"),
        supabase.from("major_competencies").select("*").order("id"),
        supabase.from("student_courses")
          .select("id, course_id, semester, year, grade, status, courses(name, professor, credit, department_id, core_competency_tags, major_competency_tags)")
          .eq("student_id", sid.trim())
          .order("year")
          .order("semester"),
      ]);

      setMyDeptId(studentRes.data?.department_id ?? null);
      setDepartments(deptRes.data ?? []);
      setCoreComps(coreRes.data ?? []);
      setMajorComps(majorRes.data ?? []);
      setMyCourses((courseRes.data ?? []) as unknown as MyCourse[]);
    })();
  }, []);

  const deptMap = useMemo(() => {
    const m: Record<number, string> = {};
    departments.forEach((d) => (m[d.id] = d.name));
    return m;
  }, [departments]);

  const coreCompMap = useMemo(() => {
    const m: Record<number, CoreComp> = {};
    coreComps.forEach((c) => (m[c.id] = c));
    return m;
  }, [coreComps]);

  const majorCompMap = useMemo(() => {
    const m: Record<number, MajorComp> = {};
    majorComps.forEach((c) => (m[c.id] = c));
    return m;
  }, [majorComps]);

  // 학기별 그룹핑
  const semesterGroups = useMemo(() => {
    const groups: Record<string, MyCourse[]> = {};
    myCourses.forEach((mc) => {
      const key = mc.year && mc.semester ? `${mc.year}년 ${mc.semester}` : mc.year ? `${mc.year}년` : "미정";
      if (!groups[key]) groups[key] = [];
      groups[key].push(mc);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [myCourses]);

  // 내 과목명 Set
  const myCourseName = useMemo(() => {
    return new Set(myCourses.map((mc) => mc.courses?.name).filter(Boolean) as string[]);
  }, [myCourses]);

  // 내 학과 자격증
  const deptKey = myDeptId ? DEPT_KEY_MAP[myDeptId] : null;
  const myCerts = useMemo(() => {
    if (!deptKey) return [];
    return Object.entries(CERTIFICATIONS).filter(([, c]) => c.dept === deptKey);
  }, [deptKey]);

  const myCareerPath = deptKey ? CAREER_PATHS[deptKey] : null;

  const cert = selectedCert ? CERTIFICATIONS[selectedCert] : null;
  const certReqSet = cert ? new Set(cert.required) : null;
  const certElecSet = cert && cert.elective.length > 0 ? new Set(cert.elective) : null;

  // 자격증 이수 현황
  const certProgress = useMemo(() => {
    if (!cert) return null;
    const reqDone = cert.required.filter((c) => myCourseName.has(c));
    const elecDone = cert.elective.filter((c) => myCourseName.has(c));
    return {
      reqTotal: cert.required.length,
      reqDone: reqDone.length,
      elecTotal: cert.elective.length,
      elecDone: elecDone.length,
    };
  }, [cert, myCourseName]);

  // 총 학점
  const totalCredits = useMemo(() => {
    return myCourses.reduce((sum, mc) => sum + (mc.courses?.credit ?? 0), 0);
  }, [myCourses]);

  const getCourseStyle = (name: string) => {
    if (cert) {
      if (certReqSet?.has(name)) return "border-2 border-orange-500 bg-orange-50";
      if (certElecSet?.has(name)) return "border-2 border-orange-400 border-dashed bg-ys-gold/10";
      return "border border-slate-200 bg-ys-paper opacity-50";
    }
    return "border border-slate-200 bg-white";
  };

  return (
    <div className="min-h-screen bg-ys-paper">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ys-ink">내 교과목 로드맵</h1>
          <p className="mt-1 text-sm text-ys-ink-soft">
            수강 중인 과목을 학기별로 확인하고, 자격증 이수 현황을 파악하세요.
          </p>
        </div>

        {/* 요약 카드 */}
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-ys-ink-soft">수강 과목</p>
            <p className="mt-1 text-xl font-bold text-ys-ink">{myCourses.length}개</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-ys-ink-soft">총 학점</p>
            <p className="mt-1 text-xl font-bold text-ys-blue">{totalCredits}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-ys-ink-soft">학기 수</p>
            <p className="mt-1 text-xl font-bold text-ys-ink">{semesterGroups.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-ys-ink-soft">취득 가능 자격증</p>
            <p className="mt-1 text-xl font-bold text-ys-blue">{myCerts.length}개</p>
          </div>
        </div>

        {/* 자격증 필터 */}
        {myCerts.length > 0 && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-ys-ink-soft" />
              <p className="text-sm font-semibold text-ys-ink">자격증 이수 현황</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedCert(null)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${!selectedCert ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-ys-ink-soft hover:bg-ys-paper"}`}>
                전체 보기
              </button>
              {myCerts.map(([key, c]) => {
                const reqDone = c.required.filter((n) => myCourseName.has(n)).length;
                return (
                  <button key={key} type="button" onClick={() => setSelectedCert(selectedCert === key ? null : key)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium transition"
                    style={selectedCert === key ? { backgroundColor: c.color, color: "#fff" } : { border: "1px solid #ddd", background: "white", color: c.color }}>
                    {c.name} ({reqDone}/{c.required.length})
                  </button>
                );
              })}
            </div>

            {/* 선택된 자격증 상세 */}
            {cert && certProgress && (
              <div className="mt-4 rounded-lg bg-ys-paper p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold" style={{ color: cert.color }}>{cert.name}</h4>
                  <span className="text-xs text-ys-ink-soft">{cert.type}</span>
                </div>
                {/* 프로그레스 바 */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-ys-ink-soft">
                    <span>필수 이수 {certProgress.reqDone}/{certProgress.reqTotal}</span>
                    <span>{Math.round((certProgress.reqDone / certProgress.reqTotal) * 100)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(certProgress.reqDone / certProgress.reqTotal) * 100}%`, backgroundColor: cert.color }} />
                  </div>
                </div>
                {/* 미이수 과목 */}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-ys-ink-soft">미이수 필수 과목</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cert.required.filter((c) => !myCourseName.has(c)).map((c) => (
                      <span key={c} className="rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-700 border border-red-200">{c.replace(" [SDU]", "")}</span>
                    ))}
                    {cert.required.every((c) => myCourseName.has(c)) && (
                      <span className="text-xs text-[#8A6212] font-medium">모든 필수 과목 이수 완료!</span>
                    )}
                  </div>
                </div>
                {cert.note && <p className="mt-2 text-[10px] text-ys-ink-soft">{cert.note}</p>}
              </div>
            )}
          </div>
        )}

        {/* 학기별 로드맵 */}
        {myCourses.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <BookOpen className="mx-auto h-10 w-10 text-ys-ink-soft/50" />
            <p className="mt-3 text-sm text-ys-ink-soft">수강 중인 과목이 없습니다.</p>
          </div>
        ) : (
          <div className="mb-8">
            <div className="mb-4 flex items-center gap-2">
              <Map className="h-4 w-4 text-ys-ink-soft" />
              <h2 className="text-base font-semibold text-ys-ink">학기별 수강 로드맵</h2>
            </div>

            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(semesterGroups.length, 4)}, minmax(0, 1fr))` }}>
              {semesterGroups.map(([semLabel, courses]) => (
                <div key={semLabel} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-ys-ink">{semLabel}</p>
                  <div className="space-y-2">
                    {courses.map((mc) => {
                      const name = mc.courses?.name ?? "";
                      const style = getCourseStyle(name);
                      return (
                        <div key={mc.id} className={`rounded-lg p-2.5 transition ${style}`}>
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-xs font-medium text-ys-ink">{name}</p>
                            <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${mc.status === "완료" ? "bg-ys-gold/15 text-[#8A6212]" : "bg-ys-blue/10 text-ys-blue"}`}>
                              {mc.status}
                            </span>
                          </div>
                          {mc.courses?.professor && (
                            <p className="mt-0.5 text-[10px] text-ys-ink-soft">{mc.courses.professor} · {mc.courses.credit}학점</p>
                          )}
                          {/* 역량 태그 */}
                          <div className="mt-1 flex flex-wrap gap-0.5">
                            {(mc.courses?.core_competency_tags ?? []).map((tagId) => {
                              const comp = coreCompMap[tagId];
                              return comp ? (
                                <span key={`c-${tagId}`} className="rounded px-1 py-0.5 text-[8px] font-medium" style={{ backgroundColor: comp.color_code + "15", color: comp.color_code }}>
                                  {comp.name}
                                </span>
                              ) : null;
                            })}
                            {(mc.courses?.major_competency_tags ?? []).map((tagId) => {
                              const comp = majorCompMap[tagId];
                              return comp ? (
                                <span key={`m-${tagId}`} className="rounded bg-ys-blue/10 px-1 py-0.5 text-[8px] font-medium text-ys-blue">
                                  {comp.name}
                                </span>
                              ) : null;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 범례 */}
            {cert && (
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-ys-ink-soft">
                <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-orange-500 bg-orange-50" /> 자격증 필수</span>
                {certElecSet && <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border-2 border-dashed border-orange-400 bg-ys-gold/10" /> 자격증 선택</span>}
                <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-slate-200 bg-ys-paper opacity-50" /> 해당 없음</span>
              </div>
            )}
          </div>
        )}

        {/* 진로 안내 */}
        {myCareerPath && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-ys-gold" />
              <h2 className="text-base font-semibold text-ys-ink">졸업 후 진로</h2>
              {myDeptId && <span className="text-xs text-ys-ink-soft">{deptMap[myDeptId]}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {myCareerPath.careers.map((c) => (
                <span key={c} className="rounded-full border border-slate-200 bg-ys-paper px-3 py-1.5 text-xs text-ys-ink">{c}</span>
              ))}
            </div>
            {myCareerPath.note && <p className="mt-3 text-xs italic text-ys-ink-soft">{myCareerPath.note}</p>}

            {/* 자격증별 진로 */}
            {myCerts.length > 0 && (
              <div className="mt-5 space-y-3">
                {myCerts.map(([key, c]) => (
                  <div key={key} className="rounded-lg border border-slate-100 p-3">
                    <p className="text-xs font-semibold" style={{ color: c.color }}>{c.name} 취득 시</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {c.careers.map((career) => (
                        <span key={career} className="rounded bg-ys-paper px-2 py-0.5 text-[11px] text-ys-ink border border-slate-200">{career}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
