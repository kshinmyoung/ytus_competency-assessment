"use client";

import { useMemo, useState } from "react";
import { DEPTS, PREREQ, CERTIFICATIONS } from "./data";

const DEPT_KEYS = Object.keys(DEPTS);
const SEM_LABELS = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];

type FlowNode = { name: string; sem: number; type: "core" | "required" | "liberal"; x: number; y: number };

export default function FlowView() {
  const [deptKey, setDeptKey] = useState("theology");
  const [selectedCert, setSelectedCert] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const dept = DEPTS[deptKey];
  const prereqs = PREREQ[deptKey] ?? [];

  const deptCerts = useMemo(() => {
    return Object.entries(CERTIFICATIONS).filter(([, c]) => c.dept === deptKey);
  }, [deptKey]);

  const cert = selectedCert ? CERTIFICATIONS[selectedCert] : null;
  const certReqSet = cert ? new Set(cert.required) : null;
  const certElecSet = cert ? new Set(cert.elective) : null;

  // 노드 배치
  const layout = useMemo(() => {
    const colW = 100;
    const nodeW = 88;
    const nodeH = 38;
    const gapY = 12;
    const padTop = 50;
    const padLeft = 20;

    const nodes: FlowNode[] = [];
    const semCols: FlowNode[][] = Array.from({ length: 8 }, () => []);

    dept.semesters.forEach((s, semIdx) => {
      s.liberal.forEach((name) => {
        const n: FlowNode = { name, sem: semIdx, type: "liberal", x: 0, y: 0 };
        nodes.push(n);
        semCols[semIdx].push(n);
      });
      s.core.forEach((name) => {
        const n: FlowNode = { name, sem: semIdx, type: "core", x: 0, y: 0 };
        nodes.push(n);
        semCols[semIdx].push(n);
      });
      s.required.forEach((name) => {
        const n: FlowNode = { name, sem: semIdx, type: "required", x: 0, y: 0 };
        nodes.push(n);
        semCols[semIdx].push(n);
      });
    });

    const maxPerCol = Math.max(...semCols.map((c) => c.length), 1);
    const gridH = padTop + maxPerCol * (nodeH + gapY) + 40;

    nodes.forEach((n) => {
      const col = semCols[n.sem];
      const idx = col.indexOf(n);
      n.x = padLeft + n.sem * colW + colW / 2;
      n.y = padTop + idx * (nodeH + gapY) + nodeH / 2;
    });

    const nodesByName: Record<string, FlowNode> = {};
    nodes.forEach((n) => (nodesByName[n.name] = n));

    // 전공선택 풀
    const electiveGroups = Object.entries(dept.electives);
    const eNodeW = 120;
    const eNodeH = 24;
    const eGap = 5;
    const W = 820;
    const itemsPerRow = Math.floor((W - 40) / (eNodeW + eGap));

    let poolH = 0;
    const groupLayouts = electiveGroups.map(([label, items]) => {
      const rows = Math.ceil(items.length / itemsPerRow);
      const h = 20 + rows * (eNodeH + eGap);
      poolH += h + 12;
      return { label, items, rows, h };
    });

    const totalH = gridH + (electiveGroups.length > 0 ? 50 + poolH + 20 : 0);

    return { nodes, nodesByName, semCols, colW, nodeW, nodeH, padTop, padLeft, gridH, W, totalH, groupLayouts, eNodeW, eNodeH, eGap, itemsPerRow, electiveGroups };
  }, [dept]);

  // 하이라이트 연결 노드
  const connectedSet = useMemo(() => {
    if (!highlighted) return null;
    const s = new Set([highlighted]);
    let changed = true;
    while (changed) {
      changed = false;
      prereqs.forEach(([f, t]) => {
        if (s.has(f) && !s.has(t)) { s.add(t); changed = true; }
        if (s.has(t) && !s.has(f)) { s.add(f); changed = true; }
      });
    }
    return s;
  }, [highlighted, prereqs]);

  const getStyle = (name: string, type: string) => {
    if (cert) {
      if (certReqSet?.has(name)) return { fill: "#FFE5B4", stroke: "#E85D24", sw: 2, dash: "", tc: "#5C2C00" };
      if (certElecSet?.has(name)) return { fill: "#FFF8E1", stroke: "#E85D24", sw: 1.5, dash: "3 2", tc: "#5C4A00" };
      return { fill: "#f0f0f0", stroke: "#ccc", sw: 0.5, dash: "", tc: "#aaa" };
    }
    if (type === "core") return { fill: "#FAC775", stroke: "#854F0B", sw: 0.5, dash: "", tc: "#3d2b0a" };
    if (type === "required") return { fill: "#C0DD97", stroke: "#3B6D11", sw: 0.5, dash: "", tc: "#173404" };
    return { fill: "#FAEEDA", stroke: "#BA7517", sw: 0.5, dash: "", tc: "#633806" };
  };

  const getElecStyle = (name: string) => {
    if (cert) {
      if (certReqSet?.has(name)) return { fill: "#FFE5B4", stroke: "#E85D24", sw: 2, dash: "", tc: "#5C2C00" };
      if (certElecSet?.has(name)) return { fill: "#FFF8E1", stroke: "#E85D24", sw: 1.5, dash: "3 2", tc: "#5C4A00" };
      return { fill: "#f5f5f5", stroke: "#ddd", sw: 0.5, dash: "", tc: "#aaa" };
    }
    return { fill: "#F4EEE4", stroke: "#A6876A", sw: 0.5, dash: "", tc: "#5C3D1F" };
  };

  const renderText = (name: string, x: number, y: number, fontSize: number, color: string) => {
    if (name.length <= 8) {
      return <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight="500" fill={color}>{name}</text>;
    }
    const line1 = name.slice(0, Math.ceil(name.length / 2));
    const line2 = name.slice(Math.ceil(name.length / 2));
    return (
      <text textAnchor="middle" fontSize={fontSize} fontWeight="500" fill={color}>
        <tspan x={x} y={y - 5}>{line1}</tspan>
        <tspan x={x} y={y + 8}>{line2}</tspan>
      </text>
    );
  };

  return (
    <div>
      {/* 학과 선택 */}
      <div className="mb-4 grid grid-cols-5 gap-2">
        {DEPT_KEYS.map((key) => {
          const d = DEPTS[key];
          const active = key === deptKey;
          return (
            <button key={key} type="button"
              onClick={() => { setDeptKey(key); setSelectedCert(null); setHighlighted(null); }}
              className="rounded-lg border-2 px-3 py-2.5 text-center text-xs font-medium transition"
              style={{ borderColor: active ? d.color : "transparent", backgroundColor: active ? d.bg : "white", color: active ? d.textColor : undefined }}>
              {d.name}
            </button>
          );
        })}
      </div>

      {/* 자격증 필터 */}
      {deptCerts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-3 py-2.5">
          <span className="text-xs text-slate-500">자격증 필터:</span>
          <button type="button" onClick={() => setSelectedCert(null)}
            className={`rounded-full px-3 py-1 text-xs transition ${!selectedCert ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
            전체
          </button>
          {deptCerts.map(([key, c]) => (
            <button key={key} type="button" onClick={() => setSelectedCert(selectedCert === key ? null : key)}
              className="rounded-full px-3 py-1 text-xs font-medium transition"
              style={selectedCert === key
                ? { backgroundColor: c.color, color: "#fff" }
                : { border: "1px solid #ddd", background: "white", color: c.color }}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <p className="mb-3 text-xs text-slate-500">
        교과목을 클릭하면 관련된 선후수 과목이 강조됩니다.
        {cert && <span className="ml-1 font-medium" style={{ color: cert.color }}>{cert.name} 관련 과목이 강조 표시됩니다.</span>}
      </p>

      {/* SVG 캔버스 */}
      <div className="overflow-x-auto rounded-xl bg-slate-50 border border-slate-200 p-2">
        <svg
          width="100%"
          viewBox={`0 0 ${layout.W} ${layout.totalH}`}
          style={{ minWidth: layout.W, display: "block" }}
          onClick={() => setHighlighted(null)}
        >
          <defs>
            <marker id={`arrow-${deptKey}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M1 1L8 5L1 9" fill="none" stroke={dept.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
            </marker>
          </defs>

          {/* 학기 헤더 */}
          {SEM_LABELS.map((t, i) => (
            <g key={t}>
              <text x={layout.padLeft + i * layout.colW + layout.colW / 2} y={20} textAnchor="middle" fontSize="12" fontWeight="500" fill="#777" fontFamily="sans-serif">{t}</text>
              {i > 0 && (
                <line x1={layout.padLeft + i * layout.colW} y1={35} x2={layout.padLeft + i * layout.colW} y2={layout.gridH - 20}
                  stroke="#e0e0e0" strokeWidth="0.5" strokeDasharray="2 3" />
              )}
            </g>
          ))}

          {/* 학년 배경 */}
          {[0, 1, 2, 3].map((yr) => (
            <g key={`yr-${yr}`}>
              {yr % 2 === 0 && (
                <rect x={layout.padLeft + yr * 2 * layout.colW} y={30} width={2 * layout.colW} height={layout.gridH - 50}
                  fill="white" opacity="0.6" rx="4" />
              )}
              <text x={layout.padLeft + yr * 2 * layout.colW + layout.colW} y={layout.gridH - 6}
                textAnchor="middle" fontSize="11" fill="#bbb" fontFamily="sans-serif">{yr + 1}학년</text>
            </g>
          ))}

          {/* 선후수 화살표 (커브) */}
          {prereqs.map(([from, to], i) => {
            const f = layout.nodesByName[from];
            const t = layout.nodesByName[to];
            if (!f || !t) return null;

            const x1 = f.x + layout.nodeW / 2;
            const y1 = f.y;
            const x2 = t.x - layout.nodeW / 2 - 3;
            const y2 = t.y;
            const dx = x2 - x1;
            const path = `M${x1},${y1} C${x1 + dx * 0.4},${y1} ${x2 - dx * 0.4},${y2} ${x2},${y2}`;

            const isConnected = connectedSet ? connectedSet.has(from) && connectedSet.has(to) : true;
            const isDirect = highlighted === from || highlighted === to;

            return (
              <path key={`link-${i}`} d={path} fill="none" stroke={dept.color}
                strokeWidth={isDirect ? 2.5 : 1.2}
                opacity={connectedSet ? (isConnected ? (isDirect ? 0.9 : 0.4) : 0.06) : 0.3}
                markerEnd={`url(#arrow-${deptKey})`} />
            );
          })}

          {/* 과목 노드 */}
          {layout.nodes.map((n) => {
            const s = getStyle(n.name, n.type);
            const isDim = connectedSet ? !connectedSet.has(n.name) : false;

            return (
              <g key={`node-${n.name}-${n.sem}`}
                onClick={(e) => { e.stopPropagation(); setHighlighted(highlighted === n.name ? null : n.name); }}
                opacity={isDim ? 0.15 : 1}
                cursor="pointer">
                <rect x={n.x - layout.nodeW / 2} y={n.y - layout.nodeH / 2}
                  width={layout.nodeW} height={layout.nodeH} rx={5}
                  fill={s.fill} stroke={s.stroke} strokeWidth={s.sw}
                  strokeDasharray={s.dash || undefined} />
                {renderText(n.name, n.x, n.y, 9.5, s.tc)}
              </g>
            );
          })}

          {/* 전공선택 풀 */}
          {layout.electiveGroups.length > 0 && (() => {
            let cursorY = layout.gridH + 10;

            return (
              <g>
                {/* 구분선 */}
                <line x1={20} y1={layout.gridH} x2={layout.W - 20} y2={layout.gridH}
                  stroke="#ddd" strokeWidth="0.5" strokeDasharray="4 4" />
                <text x={20} y={cursorY + 14} fontSize="12" fontWeight="500" fill="#888" fontFamily="sans-serif">
                  전공선택
                </text>
                {cert && (
                  <text x={layout.W - 20} y={cursorY + 14} textAnchor="end" fontSize="11" fill="#E85D24" fontWeight="500" fontFamily="sans-serif">
                    {cert.name} 관련 과목 강조
                  </text>
                )}

                {layout.groupLayouts.map((g, gi) => {
                  const startY = cursorY + 30 + layout.groupLayouts.slice(0, gi).reduce((sum, prev) => sum + prev.h + 12, 0);

                  return (
                    <g key={`elec-group-${gi}`}>
                      <text x={22} y={startY + 12} fontSize="11" fill="#aaa" fontWeight="500" fontFamily="sans-serif">{g.label}</text>
                      {g.items.map((name, idx) => {
                        const row = Math.floor(idx / layout.itemsPerRow);
                        const colIdx = idx % layout.itemsPerRow;
                        const x = 20 + colIdx * (layout.eNodeW + layout.eGap);
                        const y = startY + 20 + row * (layout.eNodeH + layout.eGap);
                        const es = getElecStyle(name);
                        const displayName = name.length > 15 ? name.substring(0, 14) + "…" : name;

                        return (
                          <g key={`elec-${gi}-${idx}`}>
                            <rect x={x} y={y} width={layout.eNodeW} height={layout.eNodeH} rx={3}
                              fill={es.fill} stroke={es.stroke} strokeWidth={es.sw}
                              strokeDasharray={es.dash || undefined} />
                            <text x={x + layout.eNodeW / 2} y={y + layout.eNodeH / 2}
                              textAnchor="middle" dominantBaseline="central"
                              fontSize="9" fill={es.tc} fontFamily="sans-serif">
                              {displayName}
                            </text>
                            <title>{name}</title>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#FAEEDA", border: "0.5px solid #BA7517" }} /> 교양필수</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#FAC775", border: "0.5px solid #854F0B" }} /> 전공핵심</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#C0DD97", border: "0.5px solid #3B6D11" }} /> 전공필수</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#F4EEE4", border: "0.5px solid #A6876A" }} /> 전공선택</span>
        {cert && (
          <>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#FFE5B4", border: "2px solid #E85D24" }} /> 자격증 필수</span>
            {certElecSet && certElecSet.size > 0 && (
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#FFF8E1", border: "1.5px dashed #E85D24" }} /> 자격증 선택</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
