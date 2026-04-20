"use client";

import { ArrowRight, BookOpen, GraduationCap, Map, Search, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navigation from "@/components/Navigation";
import { DEPTS, PREREQ, COMPETENCY_COURSES, CAREER_PATHS, CERTIFICATIONS } from "./data";

type ViewKey = "explore" | "flow" | "career" | "mapping";
const DEPT_KEYS = Object.keys(DEPTS);

const COMP_COLORS: Record<string, string> = {
  "영성": "#8B5CF6", "기독교적 성찰": "#6366F1", "창의수행": "#F59E0B",
  "융합사고": "#10B981", "공감소통": "#3B82F6", "글로컬시민": "#EF4444",
};

export default function RoadmapPage() {
  const [view, setView] = useState<ViewKey>("explore");
  const [deptKey, setDeptKey] = useState("theology");
  const [flowDeptKey, setFlowDeptKey] = useState("theology");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedComp, setSelectedComp] = useState<string | null>(null);
  const [typeFilters, setTypeFilters] = useState({ liberal: true, core: true, required: true });
  const [selectedCert, setSelectedCert] = useState<string | null>(null);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);

  const dept = DEPTS[deptKey];
  const flowDept = DEPTS[flowDeptKey];
  const flowSvgRef = useRef<SVGSVGElement>(null);

  // 검색
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: { name: string; dept: string; type: string }[] = [];
    Object.entries(DEPTS).forEach(([, d]) => {
      d.semesters.forEach((s) => {
        s.liberal.forEach((c) => { if (c.toLowerCase().includes(q)) results.push({ name: c, dept: d.name, type: "교양필수" }); });
        s.core.forEach((c) => { if (c.toLowerCase().includes(q)) results.push({ name: c, dept: d.name, type: "전공핵심" }); });
        s.required.forEach((c) => { if (c.toLowerCase().includes(q)) results.push({ name: c, dept: d.name, type: "전공필수" }); });
      });
      Object.values(d.electives).forEach((arr) => {
        arr.forEach((c) => { if (c.toLowerCase().includes(q)) results.push({ name: c, dept: d.name, type: "전공선택" }); });
      });
    });
    const seen = new Set<string>();
    return results.filter((r) => { const k = `${r.name}-${r.dept}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20);
  }, [searchQuery]);

  const stats = useMemo(() => {
    const counts = { liberal: 0, core: 0, required: 0, elective: 0 };
    dept.semesters.forEach((s) => { counts.liberal += s.liberal.length; counts.core += s.core.length; counts.required += s.required.length; });
    counts.elective = Object.values(dept.electives).reduce((a, b) => a + b.length, 0);
    return counts;
  }, [dept]);

  // 선후수 흐름: 노드 위치 계산
  const flowData = useMemo(() => {
    const d = DEPTS[flowDeptKey];
    const nodes: { name: string; sem: number; type: string; x: number; y: number }[] = [];
    const nodesByName: Record<string, typeof nodes[0]> = {};
    const semCols: typeof nodes[] = [[], [], [], [], [], [], [], []];

    d.semesters.forEach((s, semIdx) => {
      [...s.core.map((n) => ({ n, type: "core" })), ...s.required.map((n) => ({ n, type: "required" }))].forEach(({ n, type }) => {
        const node = { name: n, sem: semIdx, type, x: 0, y: 0 };
        nodes.push(node);
        nodesByName[n] = node;
        semCols[semIdx].push(node);
      });
    });

    const colW = 100, nodeH = 40, nodeW = 90, padY = 40;
    const maxPerCol = Math.max(...semCols.map((c) => c.length), 3);
    const gridH = padY * 2 + maxPerCol * (nodeH + 14) + 40;

    nodes.forEach((n) => {
      const col = semCols[n.sem];
      const idx = col.indexOf(n);
      n.x = 20 + n.sem * colW + colW / 2;
      n.y = padY + 30 + idx * (nodeH + 14) + nodeH / 2;
    });

    // 전공선택 풀
    const electiveGroups = Object.entries(d.electives);
    const eNodeW = 115, eNodeH = 26, eGap = 6;
    const W = 820;
    const itemsPerRow = Math.floor((W - 40) / (eNodeW + eGap));
    let poolH = 0;
    const groupLayouts = electiveGroups.map(([label, items]) => {
      const rows = Math.ceil(items.length / itemsPerRow);
      const h = 22 + rows * (eNodeH + eGap);
      poolH += h + 14;
      return { label, items, rows, h };
    });
    const totalH = gridH + (electiveGroups.length > 0 ? 44 + poolH + 20 : 0);

    return { nodes, nodesByName, semCols, colW, nodeH, nodeW, padY, gridH, W, totalH, electiveGroups, groupLayouts, eNodeW, eNodeH, eGap, itemsPerRow };
  }, [flowDeptKey]);

  const prereqs = PREREQ[flowDeptKey] ?? [];
  const cert = selectedCert ? CERTIFICATIONS[selectedCert] : null;
  const certRequired = cert ? new Set(cert.required) : null;
  const certElective = cert ? new Set(cert.elective) : null;

  // 하이라이트된 노드와 연결된 모든 노드
  const connectedNodes = useMemo(() => {
    if (!highlightedNode) return null;
    const connected = new Set([highlightedNode]);
    let changed = true;
    while (changed) {
      changed = false;
      prereqs.forEach(([f, t]) => {
        if (connected.has(f) && !connected.has(t)) { connected.add(t); changed = true; }
        if (connected.has(t) && !connected.has(f)) { connected.add(f); changed = true; }
      });
    }
    return connected;
  }, [highlightedNode, prereqs]);

  // 해당 학과 자격증
  const flowCerts = useMemo(() => {
    return Object.entries(CERTIFICATIONS).filter(([, c]) => c.dept === flowDeptKey);
  }, [flowDeptKey]);

  const getNodeStyle = (name: string, type: string) => {
    if (cert) {
      if (certRequired?.has(name)) return { fill: "#FFE5B4", stroke: "#E85D24", strokeWidth: 2, dash: "", textColor: "#5C2C00" };
      if (certElective?.has(name)) return { fill: "#FFF8E1", stroke: "#E85D24", strokeWidth: 1.5, dash: "3 2", textColor: "#5C4A00" };
      return { fill: "#f0f0f0", stroke: "#ccc", strokeWidth: 0.5, dash: "", textColor: "#aaa" };
    }
    if (type === "core") return { fill: "#FAC775", stroke: "#854F0B", strokeWidth: 0.5, dash: "", textColor: "#3d2b0a" };
    return { fill: "#C0DD97", stroke: "#3B6D11", strokeWidth: 0.5, dash: "", textColor: "#173404" };
  };

  const getElectiveStyle = (name: string) => {
    if (cert) {
      if (certRequired?.has(name)) return { fill: "#FFE5B4", stroke: "#E85D24", strokeWidth: 2, dash: "", textColor: "#5C2C00" };
      if (certElective?.has(name)) return { fill: "#FFF8E1", stroke: "#E85D24", strokeWidth: 1.5, dash: "3 2", textColor: "#5C4A00" };
      return { fill: "#f5f5f5", stroke: "#ddd", strokeWidth: 0.5, dash: "", textColor: "#aaa" };
    }
    return { fill: "#F4EEE4", stroke: "#A6876A", strokeWidth: 0.5, dash: "", textColor: "#5C3D1F" };
  };

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
            <input type="text" placeholder="교과목 검색 (예: 집단상담, 사회복지실천론)" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" />
            {searchQuery && <button type="button" onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600">×</button>}
          </div>
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {searchResults.map((r, i) => (
                <div key={i} className="border-b border-slate-100 px-4 py-2.5 last:border-0 hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-900">{r.name}</p>
                  <div className="mt-0.5 flex gap-1.5">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{r.dept}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${r.type === "전공핵심" ? "bg-amber-100 text-amber-800" : r.type === "전공필수" ? "bg-green-100 text-green-800" : r.type === "교양필수" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}`}>{r.type}</span>
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
              <button key={v.key} type="button" onClick={() => { setView(v.key); setSelectedCert(null); setHighlightedNode(null); }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition ${view === v.key ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                <Icon className="h-4 w-4" />{v.label}
              </button>
            );
          })}
        </div>

        {/* === 학과별 탐색 === */}
        {view === "explore" && (
          <div>
            <div className="mb-4 grid grid-cols-5 gap-2">
              {DEPT_KEYS.map((key) => { const d = DEPTS[key]; const active = key === deptKey; return (
                <button key={key} type="button" onClick={() => setDeptKey(key)} className="rounded-lg border-2 px-3 py-2.5 text-center text-xs font-medium transition"
                  style={{ borderColor: active ? d.color : "transparent", backgroundColor: active ? d.bg : "white", color: active ? d.textColor : undefined }}>{d.name}</button>
              ); })}
            </div>
            <div className="mb-4 flex items-center gap-4 text-xs text-slate-600">
              <span>과목 유형</span>
              {([["liberal", "교양필수"], ["core", "전공핵심"], ["required", "전공필수"]] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={typeFilters[key]} onChange={(e) => setTypeFilters((f) => ({ ...f, [key]: e.target.checked }))} className="rounded" />{label}
                </label>
              ))}
            </div>
            <div className="mb-5 grid grid-cols-4 gap-2">
              {[{ label: "교양필수", value: stats.liberal, color: "#BA7517" }, { label: "전공핵심", value: stats.core, color: "#854F0B" }, { label: "전공필수", value: stats.required, color: "#3B6D11" }, { label: "전공선택", value: stats.elective, color: "#5F5E5A" }].map((s) => (
                <div key={s.label} className="rounded-lg bg-slate-100 p-3">
                  <p className="text-[10px] text-slate-500">{s.label}</p>
                  <p className="text-xl font-medium" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
            <div className="mb-6 grid grid-cols-4 gap-2">
              {dept.semesters.map((sem) => (
                <div key={sem.t} className="rounded-lg border border-slate-200 bg-white p-3 min-h-[120px]">
                  <p className="mb-2 border-b border-slate-100 pb-1.5 text-xs font-medium text-slate-500">{sem.t} 학기</p>
                  {typeFilters.liberal && sem.liberal.map((c) => <p key={c} className="mb-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">{c}</p>)}
                  {typeFilters.core && sem.core.map((c) => <p key={c} className="mb-1 rounded bg-amber-300 px-1.5 py-0.5 text-[11px] font-medium text-amber-950">{c}</p>)}
                  {typeFilters.required && sem.required.map((c) => <p key={c} className="mb-1 rounded bg-green-200 px-1.5 py-0.5 text-[11px] text-green-900">{c}</p>)}
                  {!sem.liberal.length && !sem.core.length && !sem.required.length && <p className="text-[11px] italic text-slate-400">해당 없음</p>}
                </div>
              ))}
            </div>
            {Object.keys(dept.electives).length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">전공선택 과목</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(dept.electives).map(([period, courses]) => (
                    <div key={period} className="rounded-lg bg-slate-100 p-3">
                      <p className="mb-2 text-xs font-medium" style={{ color: dept.color }}>{period}</p>
                      <p className="text-[11px] leading-relaxed text-slate-700">{courses.join(" · ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {dept.tracks.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-800">자격증 · 트랙</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {dept.tracks.map((track) => (
                    <div key={track.name} className="rounded-lg border border-slate-200 bg-white p-4" style={{ borderLeftWidth: 3, borderLeftColor: track.color }}>
                      <p className="text-sm font-medium" style={{ color: track.color }}>{track.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{track.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* === 선후수 흐름 (SVG) === */}
        {view === "flow" && (
          <div>
            <div className="mb-4 grid grid-cols-5 gap-2">
              {DEPT_KEYS.map((key) => { const d = DEPTS[key]; const active = key === flowDeptKey; return (
                <button key={key} type="button" onClick={() => { setFlowDeptKey(key); setSelectedCert(null); setHighlightedNode(null); }}
                  className="rounded-lg border-2 px-3 py-2.5 text-center text-xs font-medium transition"
                  style={{ borderColor: active ? d.color : "transparent", backgroundColor: active ? d.bg : "white", color: active ? d.textColor : undefined }}>{d.name}</button>
              ); })}
            </div>

            {/* 자격증 필터 */}
            {flowCerts.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-3 py-2.5">
                <span className="text-xs text-slate-500">자격증 필터:</span>
                <button type="button" onClick={() => setSelectedCert(null)}
                  className={`rounded-full px-3 py-1 text-xs transition ${!selectedCert ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>전체</button>
                {flowCerts.map(([key, c]) => (
                  <button key={key} type="button" onClick={() => setSelectedCert(selectedCert === key ? null : key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${selectedCert === key ? "text-white" : "border border-slate-300 bg-white hover:bg-slate-50"}`}
                    style={selectedCert === key ? { backgroundColor: c.color } : { color: c.color }}>{c.name}</button>
                ))}
              </div>
            )}

            <p className="mb-3 text-xs text-slate-500">교과목을 클릭하면 관련된 선후수·심화 과목이 강조됩니다. 자격증 필터를 선택하면 해당 자격증 필수 과목이 표시됩니다.</p>

            {/* SVG 캔버스 */}
            <div className="overflow-x-auto rounded-xl bg-slate-100 p-4">
              <svg
                ref={flowSvgRef}
                width="100%"
                viewBox={`0 0 ${flowData.W} ${flowData.totalH}`}
                style={{ minWidth: flowData.W, display: "block" }}
                onClick={() => setHighlightedNode(null)}
              >
                <defs>
                  <marker id="fa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d={`M1 1L8 5L1 9`} fill="none" stroke={flowDept.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
                  </marker>
                </defs>

                {/* 학기 헤더 & 세로선 */}
                {["1-1","1-2","2-1","2-2","3-1","3-2","4-1","4-2"].map((t, i) => (
                  <g key={t}>
                    <text x={20 + i * flowData.colW + flowData.colW / 2} y={24} textAnchor="middle" fontSize="12" fontWeight="500" fill="#888">{t}</text>
                    {i > 0 && <line x1={20 + i * flowData.colW} y1={flowData.padY} x2={20 + i * flowData.colW} y2={flowData.gridH - 20} stroke="#ddd" strokeWidth="0.5" strokeDasharray="2 3" />}
                  </g>
                ))}

                {/* 학년 배경 & 라벨 */}
                {[0, 1, 2, 3].map((yr) => (
                  <g key={yr}>
                    {yr % 2 === 0 && <rect x={20 + yr * 2 * flowData.colW} y={flowData.padY + 10} width={2 * flowData.colW} height={flowData.gridH - flowData.padY - 30} fill="white" opacity="0.5" />}
                    <text x={20 + yr * 2 * flowData.colW + flowData.colW} y={flowData.gridH - 8} textAnchor="middle" fontSize="11" fill="#aaa">{yr + 1}학년</text>
                  </g>
                ))}

                {/* 선후수 화살표 */}
                {prereqs.map(([from, to], i) => {
                  const f = flowData.nodesByName[from], t = flowData.nodesByName[to];
                  if (!f || !t) return null;
                  const dx = t.x - f.x - flowData.nodeW / 2;
                  const path = `M ${f.x + flowData.nodeW / 2} ${f.y} C ${f.x + flowData.nodeW / 2 + dx * 0.5} ${f.y}, ${t.x - flowData.nodeW / 2 - dx * 0.5} ${t.y}, ${t.x - flowData.nodeW / 2 - 3} ${t.y}`;
                  const isActive = connectedNodes ? (connectedNodes.has(from) && connectedNodes.has(to)) : true;
                  const isDirect = highlightedNode && (from === highlightedNode || to === highlightedNode);
                  return (
                    <path key={i} d={path} fill="none" stroke={flowDept.color}
                      strokeWidth={isDirect ? 2 : 1.2}
                      opacity={connectedNodes ? (isActive ? (isDirect ? 0.9 : 0.5) : 0.08) : 0.35}
                      markerEnd="url(#fa)" />
                  );
                })}

                {/* 과목 노드 */}
                {flowData.nodes.map((n) => {
                  const style = getNodeStyle(n.name, n.type);
                  const isDim = connectedNodes ? !connectedNodes.has(n.name) : false;
                  const lines = n.name.length > 8 ? [n.name.slice(0, 7), n.name.slice(7, 14)] : [n.name];
                  return (
                    <g key={n.name} onClick={(e) => { e.stopPropagation(); setHighlightedNode(highlightedNode === n.name ? null : n.name); }}
                      opacity={isDim ? 0.2 : 1} cursor="pointer">
                      <rect x={n.x - flowData.nodeW / 2} y={n.y - flowData.nodeH / 2} width={flowData.nodeW} height={flowData.nodeH} rx={6}
                        fill={style.fill} stroke={style.stroke} strokeWidth={style.strokeWidth} strokeDasharray={style.dash} />
                      {lines.length === 1 ? (
                        <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="500" fill={style.textColor}>{lines[0]}</text>
                      ) : (
                        <text x={n.x} textAnchor="middle" fontSize="10" fontWeight="500" fill={style.textColor}>
                          <tspan x={n.x} dy={-4}>{lines[0]}</tspan>
                          <tspan x={n.x} dy={13}>{lines[1]}</tspan>
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* 전공선택 풀 섹션 */}
                {flowData.electiveGroups.length > 0 && (
                  <>
                    <line x1={20} y1={flowData.gridH + 4} x2={flowData.W - 20} y2={flowData.gridH + 4} stroke="#ddd" strokeWidth="0.5" strokeDasharray="4 4" />
                    <text x={20} y={flowData.gridH + 24} fontSize="12" fontWeight="500" fill="#888">전공선택 (학년 구분 없음)</text>
                    {cert && <text x={flowData.W - 20} y={flowData.gridH + 24} textAnchor="end" fontSize="11" fill="#E85D24" fontWeight="500">{cert.name} 관련 과목 강조</text>}

                    {(() => {
                      let cursorY = flowData.gridH + 44;
                      return flowData.groupLayouts.map((g, gi) => {
                        const startY = cursorY;
                        cursorY += g.h + 14;
                        return (
                          <g key={gi}>
                            <text x={22} y={startY + 10} fontSize="11" fill="#aaa" fontWeight="500">{g.label}</text>
                            {g.items.map((name, idx) => {
                              const row = Math.floor(idx / flowData.itemsPerRow);
                              const colIdx = idx % flowData.itemsPerRow;
                              const x = 20 + colIdx * (flowData.eNodeW + flowData.eGap);
                              const y = startY + 22 + row * (flowData.eNodeH + flowData.eGap);
                              const style = getElectiveStyle(name);
                              const displayName = name.length > 14 ? name.substring(0, 13) + "…" : name;
                              return (
                                <g key={idx}>
                                  <rect x={x} y={y} width={flowData.eNodeW} height={flowData.eNodeH} rx={4}
                                    fill={style.fill} stroke={style.stroke} strokeWidth={style.strokeWidth} strokeDasharray={style.dash} />
                                  <text x={x + flowData.eNodeW / 2} y={y + flowData.eNodeH / 2} textAnchor="middle" dominantBaseline="central" fontSize="9.5" fill={style.textColor}>
                                    {displayName}
                                  </text>
                                  <title>{name}</title>
                                </g>
                              );
                            })}
                          </g>
                        );
                      });
                    })()}
                  </>
                )}
              </svg>
            </div>

            {/* 범례 */}
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#FAC775", border: "0.5px solid #854F0B" }} /> 전공핵심</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#C0DD97", border: "0.5px solid #3B6D11" }} /> 전공필수</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#F4EEE4", border: "0.5px solid #A6876A" }} /> 전공선택</span>
              {cert && <>
                <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#FFE5B4", border: "2px solid #E85D24" }} /> 자격증 필수</span>
                {certElective && certElective.size > 0 && <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#FFF8E1", border: "1.5px dashed #E85D24" }} /> 자격증 선택</span>}
              </>}
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
                  {certs.map(([certKey, cert]) => (
                    <div key={certKey} className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" style={{ color: cert.color }} />
                        <h4 className="text-sm font-semibold" style={{ color: cert.color }}>{cert.name}</h4>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{cert.type}</span>
                      </div>
                      <div className={`grid gap-3 ${cert.elective.length > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                        <div>
                          <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">필수 과목</p>
                          <div className="space-y-1">
                            {cert.required.map((c) => (
                              <p key={c} className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900 border-l-2" style={{ borderColor: cert.color }}>{c}</p>
                            ))}
                          </div>
                        </div>
                        {cert.elective.length > 0 && (
                          <div>
                            <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">선택 과목</p>
                            <div className="space-y-1">
                              {cert.elective.map((c) => (
                                <p key={c} className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-700 border border-dashed border-slate-300">{c}</p>
                              ))}
                            </div>
                          </div>
                        )}
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
            <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {Object.keys(COMPETENCY_COURSES).map((comp) => {
                const active = selectedComp === comp; const color = COMP_COLORS[comp] ?? "#6366F1";
                return (
                  <button key={comp} type="button" onClick={() => setSelectedComp(active ? null : comp)}
                    className="rounded-xl border-2 px-3 py-3 text-center text-xs font-medium transition"
                    style={{ borderColor: active ? color : "transparent", backgroundColor: active ? color + "15" : "white", color: active ? color : undefined }}>{comp}</button>
                );
              })}
            </div>
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
            {selectedComp && COMPETENCY_COURSES[selectedComp] && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold" style={{ color: COMP_COLORS[selectedComp] }}>{selectedComp}</h3>
                <p className="mt-1 mb-4 text-xs text-slate-500">{COMPETENCY_COURSES[selectedComp].description}</p>
                <div className="space-y-1.5">
                  {COMPETENCY_COURSES[selectedComp].courses.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2">
                      <span className="flex-1 text-xs font-medium text-slate-800">{c.name}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{c.dept}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${c.type === "전공핵심" ? "bg-amber-100 text-amber-800" : c.type === "전공필수" ? "bg-green-100 text-green-800" : "bg-amber-50 text-amber-700"}`}>{c.type}</span>
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
