"use client";

import { ArrowRight, BookOpen, GraduationCap, Map, Search, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import { DEPTS, PREREQ, COMPETENCY_COURSES, CAREER_PATHS, CERTIFICATIONS } from "./data";

type ViewKey = "explore" | "flow" | "career" | "mapping";

const DEPT_KEYS = Object.keys(DEPTS);

const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  liberal: { bg: "bg-amber-100", text: "text-amber-900" },
  core: { bg: "bg-amber-300", text: "text-amber-950" },
  required: { bg: "bg-green-200", text: "text-green-900" },
};

const COMP_COLORS: Record<string, string> = {
  "영성": "#8B5CF6",
  "기독교적 성찰": "#6366F1",
  "창의수행": "#F59E0B",
  "융합사고": "#10B981",
  "공감소통": "#3B82F6",
  "글로컬시민": "#EF4444",
};

export default function RoadmapPage() {
  const [view, setView] = useState<ViewKey>("explore");
  const [deptKey, setDeptKey] = useState("theology");
  const [flowDeptKey, setFlowDeptKey] = useState("theology");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedComp, setSelectedComp] = useState<string | null>(null);
  const [typeFilters, setTypeFilters] = useState({ liberal: true, core: true, required: true });

  const dept = DEPTS[deptKey];
  const flowDept = DEPTS[flowDeptKey];

  // 검색
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: { name: string; dept: string; type: string }[] = [];
    Object.entries(DEPTS).forEach(([key, d]) => {
      d.semesters.forEach((s) => {
        s.liberal.forEach((c) => { if (c.toLowerCase().includes(q)) results.push({ name: c, dept: d.name, type: "교양필수" }); });
        s.core.forEach((c) => { if (c.toLowerCase().includes(q)) results.push({ name: c, dept: d.name, type: "전공핵심" }); });
        s.required.forEach((c) => { if (c.toLowerCase().includes(q)) results.push({ name: c, dept: d.name, type: "전공필수" }); });
      });
      Object.values(d.electives).forEach((arr) => {
        arr.forEach((c) => { if (c.toLowerCase().includes(q)) results.push({ name: c, dept: d.name, type: "전공선택" }); });
      });
    });
    // 중복 제거
    const seen = new Set<string>();
    return results.filter((r) => { const k = `${r.name}-${r.dept}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
  }, [searchQuery]);

  // 학과별 통계
  const stats = useMemo(() => {
    const counts = { liberal: 0, core: 0, required: 0, elective: 0 };
    dept.semesters.forEach((s) => {
      counts.liberal += s.liberal.length;
      counts.core += s.core.length;
      counts.required += s.required.length;
    });
    counts.elective = Object.values(dept.electives).reduce((a, b) => a + b.length, 0);
    return counts;
  }, [dept]);

  // 선후수 흐름에 필요한 모든 과목
  const flowCourses = useMemo(() => {
    const courses = new Set<string>();
    flowDept.semesters.forEach((s) => {
      s.core.forEach((c) => courses.add(c));
      s.required.forEach((c) => courses.add(c));
    });
    return courses;
  }, [flowDept]);

  const prereqs = PREREQ[flowDeptKey] ?? [];

  // 해당 학과 자격증
  const deptCerts = useMemo(() => {
    return Object.entries(CERTIFICATIONS).filter(([, c]) => c.dept === deptKey);
  }, [deptKey]);

  const views = [
    { key: "explore" as ViewKey, label: "학과별 탐색", icon: BookOpen },
    { key: "flow" as ViewKey, label: "선후수 흐름", icon: ArrowRight },
    { key: "career" as ViewKey, label: "자격증 · 진로", icon: Trophy },
    { key: "mapping" as ViewKey, label: "역량 매핑", icon: Map },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-2">
          <p className="text-xs text-slate-500">교과목 로드맵 · 종합 대시보드</p>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">하나님 사랑 · 이웃 사랑</h1>
          <p className="text-sm text-slate-600">경건한 인성인 · 창의융합형 지성인 · 섬김의 실천인 양성</p>
        </div>

        {/* 검색 */}
        <div className="relative mb-6">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="교과목 검색 (예: 집단상담, 사회복지실천론, 한국어)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600">×</button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {searchResults.map((r, i) => (
                <div key={i} className="border-b border-slate-100 px-4 py-2.5 last:border-0 hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-900">{r.name}</p>
                  <div className="mt-0.5 flex gap-1.5">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{r.dept}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${r.type === "전공핵심" ? "bg-amber-100 text-amber-800" : r.type === "전공필수" ? "bg-green-100 text-green-800" : r.type === "교양필수" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}`}>
                      {r.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 탭 */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
          {views.map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition ${
                  view === v.key ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {v.label}
              </button>
            );
          })}
        </div>

        {/* === 학과별 탐색 === */}
        {view === "explore" && (
          <div>
            {/* 학과 선택 */}
            <div className="mb-4 grid grid-cols-5 gap-2">
              {DEPT_KEYS.map((key) => {
                const d = DEPTS[key];
                const active = key === deptKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDeptKey(key)}
                    className="rounded-lg border-2 px-3 py-2.5 text-center text-xs font-medium transition"
                    style={{
                      borderColor: active ? d.color : "transparent",
                      backgroundColor: active ? d.bg : "white",
                      color: active ? d.textColor : undefined,
                    }}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>

            {/* 필터 */}
            <div className="mb-4 flex items-center gap-4 text-xs text-slate-600">
              <span>과목 유형</span>
              {([["liberal", "교양필수"], ["core", "전공핵심"], ["required", "전공필수"]] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={typeFilters[key]} onChange={(e) => setTypeFilters((f) => ({ ...f, [key]: e.target.checked }))} className="rounded" />
                  {label}
                </label>
              ))}
            </div>

            {/* 통계 */}
            <div className="mb-5 grid grid-cols-4 gap-2">
              {[
                { label: "교양필수", value: stats.liberal, color: "#BA7517" },
                { label: "전공핵심", value: stats.core, color: "#854F0B" },
                { label: "전공필수", value: stats.required, color: "#3B6D11" },
                { label: "전공선택", value: stats.elective, color: "#5F5E5A" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-slate-100 p-3">
                  <p className="text-[10px] text-slate-500">{s.label}</p>
                  <p className="text-xl font-medium" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* 학기 그리드 */}
            <div className="mb-6 grid grid-cols-4 gap-2 sm:grid-cols-4">
              {dept.semesters.map((sem) => (
                <div key={sem.t} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="mb-2 border-b border-slate-100 pb-1.5 text-xs font-medium text-slate-500">{sem.t} 학기</p>
                  {typeFilters.liberal && sem.liberal.map((c) => (
                    <p key={c} className="mb-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">{c}</p>
                  ))}
                  {typeFilters.core && sem.core.map((c) => (
                    <p key={c} className="mb-1 rounded bg-amber-300 px-1.5 py-0.5 text-[11px] font-medium text-amber-950">{c}</p>
                  ))}
                  {typeFilters.required && sem.required.map((c) => (
                    <p key={c} className="mb-1 rounded bg-green-200 px-1.5 py-0.5 text-[11px] text-green-900">{c}</p>
                  ))}
                  {!sem.liberal.length && !sem.core.length && !sem.required.length && (
                    <p className="text-[11px] italic text-slate-400">해당 없음</p>
                  )}
                </div>
              ))}
            </div>

            {/* 전공선택 */}
            {Object.keys(dept.electives).length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">전공선택 과목</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(dept.electives).map(([period, courses]) => (
                    <div key={period} className="rounded-lg bg-slate-100 p-3">
                      <p className="mb-2 text-xs font-medium text-slate-600">{period}</p>
                      <p className="text-[11px] leading-relaxed text-slate-700">{courses.join(" · ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 트랙 */}
            {dept.tracks.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-800">자격증 · 트랙</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {dept.tracks.map((track) => (
                    <div key={track.name} className="rounded-lg border border-slate-200 bg-white p-4">
                      <p className="text-sm font-medium" style={{ color: track.color }}>{track.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{track.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* === 선후수 흐름 === */}
        {view === "flow" && (
          <div>
            <div className="mb-4 grid grid-cols-5 gap-2">
              {DEPT_KEYS.map((key) => {
                const d = DEPTS[key];
                const active = key === flowDeptKey;
                return (
                  <button key={key} type="button" onClick={() => setFlowDeptKey(key)}
                    className="rounded-lg border-2 px-3 py-2.5 text-center text-xs font-medium transition"
                    style={{ borderColor: active ? d.color : "transparent", backgroundColor: active ? d.bg : "white", color: active ? d.textColor : undefined }}>
                    {d.name}
                  </button>
                );
              })}
            </div>
            <p className="mb-4 text-xs text-slate-500">교과목 간 선후수 관계를 보여줍니다. 화살표는 선수과목 → 후수과목 방향입니다.</p>

            <div className="overflow-x-auto rounded-xl bg-slate-100 p-6">
              {prereqs.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">선후수 정보가 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {prereqs.map(([from, to], i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="rounded-lg bg-amber-200 px-3 py-1.5 text-xs font-medium text-amber-900">{from}</span>
                      <span className="text-slate-400">→</span>
                      <span className="rounded-lg bg-green-200 px-3 py-1.5 text-xs font-medium text-green-900">{to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-amber-200" /> 선수과목</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-green-200" /> 후수과목</span>
            </div>
          </div>
        )}

        {/* === 자격증 · 진로 === */}
        {view === "career" && (
          <div>
            <p className="mb-6 text-sm text-slate-600">학과별 취득 가능 자격증과 예상 진로를 확인하세요.</p>

            {DEPT_KEYS.map((key) => {
              const d = DEPTS[key];
              const certs = Object.entries(CERTIFICATIONS).filter(([, c]) => c.dept === key);
              const careerPath = CAREER_PATHS[key];
              if (!certs.length && !careerPath) return null;

              return (
                <div key={key} className="mb-8 rounded-2xl p-5" style={{ backgroundColor: d.bg }}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <h3 className="text-base font-semibold" style={{ color: d.textColor }}>{d.name}</h3>
                  </div>

                  {/* 자격증 */}
                  {certs.map(([certKey, cert]) => (
                    <div key={certKey} className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" style={{ color: cert.color }} />
                        <h4 className="text-sm font-semibold" style={{ color: cert.color }}>{cert.name}</h4>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{cert.type}</span>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">필수 과목</p>
                          <div className="space-y-1">
                            {cert.required.map((c) => (
                              <p key={c} className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900 border-l-2" style={{ borderColor: cert.color }}>{c}</p>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">선택 과목</p>
                          <div className="space-y-1">
                            {cert.elective.map((c) => (
                              <p key={c} className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700 border border-dashed border-slate-300">{c}</p>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">예상 진로</p>
                          <div className="space-y-1">
                            {cert.careers.map((c) => (
                              <p key={c} className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700">{c}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                      {cert.note && <p className="mt-2 text-[10px] text-slate-500">{cert.note}</p>}
                    </div>
                  ))}

                  {/* 일반 진로 */}
                  {careerPath && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-medium text-slate-600">졸업 후 진로</p>
                      <div className="flex flex-wrap gap-1.5">
                        {careerPath.careers.map((c) => (
                          <span key={c} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700">{c}</span>
                        ))}
                      </div>
                      {careerPath.note && <p className="mt-2 text-[10px] italic text-slate-500">{careerPath.note}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* === 역량 매핑 === */}
        {view === "mapping" && (
          <div>
            <p className="mb-6 text-sm text-slate-600">6대 핵심역량과 관련 교과목을 확인하세요. 역량을 클릭하면 해당 교과목이 표시됩니다.</p>

            {/* 역량 카드 */}
            <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {Object.keys(COMPETENCY_COURSES).map((comp) => {
                const active = selectedComp === comp;
                const color = COMP_COLORS[comp] ?? "#6366F1";
                return (
                  <button
                    key={comp}
                    type="button"
                    onClick={() => setSelectedComp(active ? null : comp)}
                    className="rounded-xl border-2 px-3 py-3 text-center text-xs font-medium transition"
                    style={{
                      borderColor: active ? color : "transparent",
                      backgroundColor: active ? color + "15" : "white",
                      color: active ? color : undefined,
                    }}
                  >
                    {comp}
                  </button>
                );
              })}
            </div>

            {/* 인재상-역량-학과 연결 */}
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-xs font-semibold text-slate-500">3대 인재상</p>
                {["경건한 인성인", "창의융합형 지성인", "섬김의 실천인"].map((v) => (
                  <p key={v} className="mb-1.5 rounded-lg bg-slate-800 px-3 py-2 text-center text-xs font-medium text-white">{v}</p>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-xs font-semibold text-slate-500">6대 핵심역량</p>
                {Object.keys(COMPETENCY_COURSES).map((comp) => (
                  <p key={comp} className="mb-1.5 rounded-lg px-3 py-2 text-center text-xs font-medium text-white" style={{ backgroundColor: COMP_COLORS[comp] }}>{comp}</p>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-3 text-xs font-semibold text-slate-500">5개 학과</p>
                {DEPT_KEYS.map((key) => (
                  <div key={key} className="mb-1.5 flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: DEPTS[key].bg }}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DEPTS[key].color }} />
                    <span className="text-xs font-medium" style={{ color: DEPTS[key].textColor }}>{DEPTS[key].name}</span>
                    <span className="ml-auto text-[10px] text-slate-500">{DEPTS[key].competencies.join(", ")}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 선택된 역량 교과목 */}
            {selectedComp && COMPETENCY_COURSES[selectedComp] && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold" style={{ color: COMP_COLORS[selectedComp] }}>{selectedComp}</h3>
                <p className="mt-1 mb-4 text-xs text-slate-500">{COMPETENCY_COURSES[selectedComp].description}</p>
                <div className="space-y-1.5">
                  {COMPETENCY_COURSES[selectedComp].courses.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                      <span className="flex-1 text-xs font-medium text-slate-800">{c.name}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{c.dept}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${c.type === "전공핵심" ? "bg-amber-100 text-amber-800" : c.type === "전공필수" ? "bg-green-100 text-green-800" : "bg-amber-50 text-amber-700"}`}>
                        {c.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
