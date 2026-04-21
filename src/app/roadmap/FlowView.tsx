"use client";

import { useMemo, useState } from "react";
import { DEPTS, PREREQ, CERTIFICATIONS } from "./data";

const DEPT_KEYS = Object.keys(DEPTS);
const SEM_LABELS = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];

type FlowNode = { name: string; sem: number; type: string; x: number; y: number };

export default function FlowView() {
  const [deptKey, setDeptKey] = useState("theology");
  const [selectedCert, setSelectedCert] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const dept = DEPTS[deptKey];
  const prereqs = PREREQ[deptKey] ?? [];

  const deptCerts = useMemo(() =>
    Object.entries(CERTIFICATIONS).filter(([, c]) => c.dept === deptKey),
  [deptKey]);

  const cert = selectedCert ? CERTIFICATIONS[selectedCert] : null;
  const certReqSet = cert ? new Set(cert.required) : null;
  const certElecSet = cert && cert.elective.length > 0 ? new Set(cert.elective) : null;

  // 노드 배치
  const layout = useMemo(() => {
    const colW = 150;
    const nodeW = 130;
    const nodeH = 36;
    const gapY = 10;
    const padTop = 50;
    const padLeft = 10;

    const nodes: FlowNode[] = [];
    const semCols: FlowNode[][] = Array.from({ length: 8 }, () => []);

    dept.semesters.forEach((s, semIdx) => {
      // 교양필수는 선후수 뷰에서 제외 (학과별 탐색에서 확인)
      s.core.forEach((name) => {
        const n: FlowNode = { name, sem: semIdx, type: "core", x: 0, y: 0 };
        nodes.push(n); semCols[semIdx].push(n);
      });
      s.required.forEach((name) => {
        const n: FlowNode = { name, sem: semIdx, type: "required", x: 0, y: 0 };
        nodes.push(n); semCols[semIdx].push(n);
      });
    });

    const maxPerCol = Math.max(...semCols.map((c) => c.length), 1);
    const gridH = padTop + maxPerCol * (nodeH + gapY) + 50;

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
    const eNodeW = 150; const eNodeH = 26; const eGap = 6;
    const W = padLeft * 2 + 8 * colW;
    const itemsPerRow = Math.floor((W - 40) / (eNodeW + eGap));

    let poolH = 0;
    const groupLayouts = electiveGroups.map(([label, items]) => {
      const rows = Math.ceil(items.length / itemsPerRow);
      const h = 22 + rows * (eNodeH + eGap);
      poolH += h + 14;
      return { label, items, rows, h };
    });
    const totalH = gridH + (electiveGroups.length > 0 ? 50 + poolH + 20 : 0);

    return { nodes, nodesByName, colW, nodeW, nodeH, padTop, padLeft, gridH, W, totalH, groupLayouts, eNodeW, eNodeH, eGap, itemsPerRow, electiveGroups };
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

  const getNodeFill = (name: string, type: string) => {
    if (cert) {
      if (certReqSet?.has(name)) return { fill: "#FFE5B4", stroke: "#E85D24", sw: 2, dash: "", tc: "#5C2C00" };
      if (certElecSet?.has(name)) return { fill: "#FFF8E1", stroke: "#E85D24", sw: 1.5, dash: "3,2", tc: "#5C4A00" };
      return { fill: "#f0f0f0", stroke: "#ccc", sw: 0.5, dash: "", tc: "#aaa" };
    }
    if (type === "core") return { fill: "#FAC775", stroke: "#854F0B", sw: 0.5, dash: "", tc: "#412402" };
    return { fill: "#C0DD97", stroke: "#3B6D11", sw: 0.5, dash: "", tc: "#173404" };
  };

  const getElecFill = (name: string) => {
    if (cert) {
      if (certReqSet?.has(name)) return { fill: "#FFE5B4", stroke: "#E85D24", sw: 2, dash: "", tc: "#5C2C00" };
      if (certElecSet?.has(name)) return { fill: "#FFF8E1", stroke: "#E85D24", sw: 1.5, dash: "3,2", tc: "#5C4A00" };
      return { fill: "#f5f5f5", stroke: "#ddd", sw: 0.5, dash: "", tc: "#aaa" };
    }
    return { fill: "#F4EEE4", stroke: "#A6876A", sw: 0.5, dash: "", tc: "#5C3D1F" };
  };

  // 텍스트를 노드 안에 맞추기 위해 foreignObject 사용
  const NodeText = ({ name, x, y, w, h, color }: { name: string; x: number; y: number; w: number; h: number; color: string }) => {
    const isSDU = name.includes("[SDU]");
    const displayName = name.replace(" [SDU]", "");
    const fs = displayName.length > 14 ? 8 : displayName.length > 10 ? 8.5 : displayName.length > 8 ? 9.5 : 10.5;
    return (
      <foreignObject x={x} y={y} width={w} height={h}>
        <div style={{ width: w, height: h, display: "flex", alignItems: "center", justifyContent: "center", gap: 3, fontSize: fs, fontWeight: 500, color, textAlign: "center", lineHeight: 1.2, padding: "0 4px", overflow: "hidden" }}>
          {isSDU && <span style={{ fontSize: 8, background: "#6366F1", color: "#fff", borderRadius: 3, padding: "1px 3px", flexShrink: 0 }}>SDU</span>}
          {displayName}
        </div>
      </foreignObject>
    );
  };

  return (
    <div>
      {/* 학과 선택 */}
      <div className="mb-4 grid grid-cols-5 gap-2">
        {DEPT_KEYS.map((key) => { const d = DEPTS[key]; const active = key === deptKey; return (
          <button key={key} type="button"
            onClick={() => { setDeptKey(key); setSelectedCert(null); setHighlighted(null); }}
            className="rounded-lg border-2 px-3 py-2.5 text-center text-xs font-medium transition"
            style={{ borderColor: active ? d.color : "transparent", backgroundColor: active ? d.bg : "white", color: active ? d.textColor : undefined }}>
            {d.name}
          </button>
        ); })}
      </div>

      {/* 자격증 필터 */}
      {deptCerts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-100 px-3 py-2.5">
          <span className="text-xs text-slate-500">자격증 필터:</span>
          <button type="button" onClick={() => setSelectedCert(null)}
            className={`rounded-full px-3 py-1 text-xs transition ${!selectedCert ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>전체</button>
          {deptCerts.map(([key, c]) => (
            <button key={key} type="button" onClick={() => setSelectedCert(selectedCert === key ? null : key)}
              className="rounded-full px-3 py-1 text-xs font-medium transition"
              style={selectedCert === key ? { backgroundColor: c.color, color: "#fff" } : { border: "1px solid #ddd", background: "white", color: c.color }}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <p className="mb-3 text-xs text-slate-500">
        교과목을 클릭하면 관련된 선후수·심화 과목이 강조됩니다. 자격증 필터를 선택하면 해당 자격증 필수 과목이 표시됩니다.
      </p>

      {/* SVG 캔버스 */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
        <svg
          width="100%" viewBox={`0 0 ${layout.W} ${layout.totalH}`}
          style={{ minWidth: layout.W, display: "block" }}
          onClick={() => setHighlighted(null)}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <marker id={`arr-${deptKey}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M1 1L8 5L1 9" fill="none" stroke={dept.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
            </marker>
          </defs>

          {/* 학기 헤더 */}
          {SEM_LABELS.map((t, i) => (
            <g key={`hdr-${t}`}>
              <text x={layout.padLeft + i * layout.colW + layout.colW / 2} y={22} textAnchor="middle" fontSize="13" fontWeight="500" fill="#777">{t}</text>
              {i > 0 && <line x1={layout.padLeft + i * layout.colW} y1={32} x2={layout.padLeft + i * layout.colW} y2={layout.gridH - 20} stroke="#e5e5e5" strokeWidth="0.5" strokeDasharray="3 3" />}
            </g>
          ))}

          {/* 학년 배경 & 라벨 */}
          {[0, 1, 2, 3].map((yr) => (
            <g key={`yr-${yr}`}>
              {yr % 2 === 0 && <rect x={layout.padLeft + yr * 2 * layout.colW} y={32} width={2 * layout.colW} height={layout.gridH - 52} fill="white" opacity="0.6" rx="6" />}
              <text x={layout.padLeft + yr * 2 * layout.colW + layout.colW} y={layout.gridH - 4} textAnchor="middle" fontSize="12" fill="#bbb">{yr + 1}학년</text>
            </g>
          ))}

          {/* 선후수 화살표 */}
          {prereqs.map(([from, to], i) => {
            const f = layout.nodesByName[from]; const t = layout.nodesByName[to];
            if (!f || !t) return null;
            const x1 = f.x + layout.nodeW / 2; const y1 = f.y;
            const x2 = t.x - layout.nodeW / 2 - 3; const y2 = t.y;
            const dx = x2 - x1;
            const path = `M${x1},${y1} C${x1 + dx * 0.45},${y1} ${x2 - dx * 0.45},${y2} ${x2},${y2}`;
            const isConn = connectedSet ? connectedSet.has(from) && connectedSet.has(to) : true;
            const isDirect = highlighted === from || highlighted === to;
            return <path key={`lnk-${i}`} d={path} fill="none" stroke={dept.color} strokeWidth={isDirect ? 2.5 : 1.2} opacity={connectedSet ? (isConn ? (isDirect ? 0.85 : 0.35) : 0.05) : 0.25} markerEnd={`url(#arr-${deptKey})`} />;
          })}

          {/* 과목 노드 */}
          {layout.nodes.map((n, ni) => {
            const s = getNodeFill(n.name, n.type);
            const isDim = connectedSet ? !connectedSet.has(n.name) : false;
            const rx = n.x - layout.nodeW / 2; const ry = n.y - layout.nodeH / 2;
            return (
              <g key={`nd-${ni}`} onClick={(e) => { e.stopPropagation(); setHighlighted(highlighted === n.name ? null : n.name); }} opacity={isDim ? 0.15 : 1} cursor="pointer">
                <rect x={rx} y={ry} width={layout.nodeW} height={layout.nodeH} rx={5} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} strokeDasharray={s.dash || undefined} />
                <NodeText name={n.name} x={rx} y={ry} w={layout.nodeW} h={layout.nodeH} color={s.tc} />
              </g>
            );
          })}

          {/* 전공선택 풀 */}
          {layout.electiveGroups.length > 0 && (() => {
            const baseY = layout.gridH;
            return (
              <g>
                <line x1={20} y1={baseY} x2={layout.W - 20} y2={baseY} stroke="#ddd" strokeWidth="0.5" strokeDasharray="4 4" />
                <text x={20} y={baseY + 18} fontSize="13" fontWeight="500" fill="#888">전공선택 (학년 구분 없음)</text>
                {cert && <text x={layout.W - 20} y={baseY + 18} textAnchor="end" fontSize="11" fill="#E85D24" fontWeight="500">{cert.name} 관련 과목 강조</text>}
                {layout.groupLayouts.map((g, gi) => {
                  const startY = baseY + 32 + layout.groupLayouts.slice(0, gi).reduce((sum, prev) => sum + prev.h + 14, 0);
                  return (
                    <g key={`eg-${gi}`}>
                      <text x={22} y={startY + 12} fontSize="11" fill="#aaa" fontWeight="500">{g.label}</text>
                      {g.items.map((name, idx) => {
                        const row = Math.floor(idx / layout.itemsPerRow); const col = idx % layout.itemsPerRow;
                        const x = 20 + col * (layout.eNodeW + layout.eGap);
                        const y = startY + 20 + row * (layout.eNodeH + layout.eGap);
                        const es = getElecFill(name);
                        return (
                          <g key={`elc-${gi}-${idx}`}>
                            <rect x={x} y={y} width={layout.eNodeW} height={layout.eNodeH} rx={3} fill={es.fill} stroke={es.stroke} strokeWidth={es.sw} strokeDasharray={es.dash || undefined} />
                            <NodeText name={name} x={x} y={y} w={layout.eNodeW} h={layout.eNodeH} color={es.tc} />
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
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#FAC775", border: "0.5px solid #854F0B" }} /> 전공핵심</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#C0DD97", border: "0.5px solid #3B6D11" }} /> 전공필수</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#F4EEE4", border: "0.5px solid #A6876A" }} /> 전공선택</span>
        {cert && <>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#FFE5B4", border: "2px solid #E85D24" }} /> 자격증 필수</span>
          {certElecSet && <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: "#FFF8E1", border: "1.5px dashed #E85D24" }} /> 자격증 선택</span>}
          <span className="flex items-center gap-1.5"><span className="inline-block rounded bg-indigo-500 px-1 py-0.5 text-[8px] font-bold text-white">SDU</span> 타대학 온라인 과목</span>
        </>}
      </div>
    </div>
  );
}
