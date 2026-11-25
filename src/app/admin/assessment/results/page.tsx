"use client";

/**
 * 응답 데이터 조회 (관리자 · 교수학습지원센터)
 *
 * 문항별 응답은 브라우저에서 바로 읽지 않는다. assessment_responses 의 RLS 가
 * '본인 또는 admin' 이라 CTL 계정에는 오류도 없이 0건이 내려왔다.
 * /api/admin/assessment/responses 가 역할을 확인하고 service role 로 읽어 준다.
 *
 * 화면은 진단 유형 하나를 골라서 본다. 문항번호(question_order)는 유형마다, 그리고
 * 영역마다 1부터 다시 시작하므로 섞어 놓으면 어느 문항인지 가리킬 수 없다.
 */

import { Download, Filter, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminLayout from "@/components/AdminLayout";
import { formatDateTimeKorea } from "@/lib/date";

const DIAGNOSIS_LABELS: Record<string, string> = { core: "핵심역량", learning: "학습역량", calling: "소명진단" };
const SCORE_LABELS: Record<string, Record<string, string>> = {
  core: { spiritual: "영성", reflection: "기독교적성찰", empathy: "공감소통", glocal: "글로컬", creative: "창의융합" },
  learning: { launch: "Launch", explore: "Explore", act: "Act", refine: "Refine", network: "Network" },
  calling: { calling: "Calling", awakening: "Awakening", leading: "Leading", launching: "Launching", plus: "Plus" },
};

type DiagType = { key: string; label: string; sort_order: number };
type DiagResult = { id: number; student_id: string; diagnosis_type: string; total_score: number; scores: Record<string, number> | null; created_at: string };

type QuestionMeta = {
  id: number; areaOrder: number; areaName: string; order: number;
  label: string; text: string; isActive: boolean; department: string | null;
};
type StudentMeta = {
  studentId: string; name: string | null; department: string | null;
  gradeYear: number | null; studentType: string | null;
};
type ResponseRow = { studentId: string; questionId: number; value: number; answeredAt: string };
type Payload = {
  type: { key: string; label: string };
  questions: QuestionMeta[];
  students: StudentMeta[];
  responses: ResponseRow[];
  excludedArchived: number;
};

type ViewTab = "questions" | "diagnosis";

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function download(name: string, rows: string[]) {
  // 엑셀은 BOM 이 없으면 한글을 깨뜨린다
  const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AdminAssessmentResultsPage() {
  const [diagTypes, setDiagTypes] = useState<DiagType[]>([]);
  const [selectedType, setSelectedType] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [viewTab, setViewTab] = useState<ViewTab>("questions");
  const [deptFilter, setDeptFilter] = useState("all");
  const [searchText, setSearchText] = useState("");

  // 역량별 결과 (diagnosis_results) — 전용 화면이 있는 세 진단만 점수를 남긴다
  const [diagResults, setDiagResults] = useState<DiagResult[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [deptMap, setDeptMap] = useState<Record<string, string>>({});
  const [filterType, setFilterType] = useState("all");

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token ?? ""}` };
  };

  // 진단 목록과 역량별 결과는 누구나 읽을 수 있는 표에서 바로 가져온다
  useEffect(() => {
    (async () => {
      const [typeRes, diagRes, deptRes] = await Promise.all([
        supabase.from("diagnosis_types").select("key, label, sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("diagnosis_results").select("*").order("created_at", { ascending: false }),
        supabase.from("departments").select("id, name"),
      ]);
      const types = (typeRes.data ?? []) as DiagType[];
      const results = (diagRes.data ?? []) as DiagResult[];

      /**
       * 이름은 진단 결과에 나온 학번만 찾는다.
       * students 를 통째로 읽으면 PostgREST 가 1,000행에서 끊어 뒤쪽 학생 이름이 빈다
       * (재학생이 1,100명을 넘는다). archived_at 은 컬럼 권한이 없어 조건으로도 쓸 수 없다.
       */
      const depts = new Map(((deptRes.data ?? []) as { id: number; name: string }[]).map((d) => [d.id, d.name]));
      const ids = [...new Set(results.map((r) => r.student_id))];
      const nm: Record<string, string> = {};
      const dm: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from("students")
          .select("student_id, name, department_id").in("student_id", ids.slice(i, i + 200));
        ((data ?? []) as { student_id: string; name: string | null; department_id: number | null }[])
          .forEach((s) => {
            nm[s.student_id] = s.name ?? "";
            dm[s.student_id] = s.department_id ? depts.get(s.department_id) ?? "" : "";
          });
      }
      setDiagTypes(types);
      setSelectedType((prev) => prev || types[0]?.key || "");
      setDiagResults(results);
      setNameMap(nm);
      setDeptMap(dm);
    })();
  }, []);

  // 진단을 고르면 그 진단의 응답만 받아 온다.
  // 토큰을 받는 await 가 먼저 와야 effect 안에서 상태를 동시에 바꾸지 않는다.
  useEffect(() => {
    if (!selectedType) return;
    let alive = true;
    (async () => {
      const headers = await authHeaders();
      if (!alive) return;
      setLoading(true);
      setError("");
      const res = await fetch(`/api/admin/assessment/responses?type=${encodeURIComponent(selectedType)}`, { headers });
      const body = await res.json().catch(() => null);
      if (!alive) return;
      setLoading(false);
      if (!res.ok) {
        setData(null);
        setError(body?.error ?? "응답 데이터를 불러오지 못했습니다.");
        return;
      }
      setData(body as Payload);
    })();
    return () => { alive = false; };
  }, [selectedType]);

  /**
   * 한 학생이 같은 문항에 두 번 답할 수 있다 (재응시 시 행이 새로 쌓인다).
   * 표와 문항별 CSV 는 가장 최근 응답을 쓰고, 원자료 CSV 는 모든 행을 그대로 내보낸다.
   */
  const latest = useMemo(() => {
    const m = new Map<string, ResponseRow>();
    (data?.responses ?? []).forEach((r) => {
      const k = `${r.studentId}_${r.questionId}`;
      const prev = m.get(k);
      if (!prev || r.answeredAt > prev.answeredAt) m.set(k, r);
    });
    return m;
  }, [data]);

  const retakeCount = (data?.responses.length ?? 0) - latest.size;

  const departments = useMemo(() => {
    const s = new Set((data?.students ?? []).map((p) => p.department ?? "").filter(Boolean));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ko"));
  }, [data]);

  const students = useMemo(() => {
    let list = data?.students ?? [];
    if (deptFilter !== "all") list = list.filter((p) => (p.department ?? "") === deptFilter);
    const q = searchText.trim().toLowerCase();
    if (q) list = list.filter((p) => p.studentId.includes(q) || (p.name ?? "").toLowerCase().includes(q));
    return [...list].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko") || a.studentId.localeCompare(b.studentId));
  }, [data, deptFilter, searchText]);

  const shownIds = useMemo(() => new Set(students.map((p) => p.studentId)), [students]);

  /**
   * 보이는 학생이 한 명이라도 답한 문항만 열로 둔다.
   * 전공역량진단은 68문항이 학과별로 나뉘어 있어, 전부 열로 깔면 빈 칸만 남는다.
   */
  const questions = useMemo(() => {
    const answered = new Set<number>();
    latest.forEach((r) => { if (shownIds.has(r.studentId)) answered.add(r.questionId); });
    return (data?.questions ?? [])
      .filter((q) => answered.has(q.id))
      // 학과별 문항이 섞이면 열을 읽을 수 없다. 학과 → 영역 → 번호 순으로 모아 둔다.
      .sort((a, b) =>
        (a.department ?? "").localeCompare(b.department ?? "", "ko")
        || a.areaOrder - b.areaOrder || a.order - b.order);
  }, [data, latest, shownIds]);

  /** 문항별 통계: 응답수 · 평균 · 표준편차 · 1~5 분포 */
  const stats = useMemo(() => {
    const m = new Map<number, { count: number; mean: number; sd: number; dist: number[] }>();
    questions.forEach((q) => {
      const vals: number[] = [];
      students.forEach((p) => {
        const r = latest.get(`${p.studentId}_${q.id}`);
        if (r) vals.push(r.value);
      });
      const n = vals.length;
      const mean = n ? vals.reduce((a, b) => a + b, 0) / n : 0;
      const sd = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
      const dist = [0, 0, 0, 0, 0];
      vals.forEach((v) => { if (v >= 1 && v <= 5) dist[v - 1] += 1; });
      m.set(q.id, { count: n, mean, sd, dist });
    });
    return m;
  }, [questions, students, latest]);

  /** 영역별 평균 — 문항 몇 개를 묶은 하위 역량이 보고서에 쓰인다 */
  const areaStats = useMemo(() => {
    const m = new Map<string, { name: string; order: number; total: number; count: number }>();
    questions.forEach((q) => {
      const s = stats.get(q.id);
      if (!s || s.count === 0) return;
      const cur = m.get(q.areaName) ?? { name: q.areaName, order: q.areaOrder, total: 0, count: 0 };
      cur.total += s.mean * s.count;
      cur.count += s.count;
      m.set(q.areaName, cur);
    });
    return Array.from(m.values()).sort((a, b) => a.order - b.order);
  }, [questions, stats]);

  /** 학생별 응답 요약 (표와 문항별 CSV 가 같이 쓴다) */
  const studentRows = useMemo(() => students.map((p) => {
    const answers = questions.map((q) => latest.get(`${p.studentId}_${q.id}`));
    const vals = answers.filter((r): r is ResponseRow => Boolean(r)).map((r) => r.value);
    const times = answers.filter((r): r is ResponseRow => Boolean(r)).map((r) => r.answeredAt).sort();
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      ...p,
      answers,
      answered: vals.length,
      sum,
      mean: vals.length ? sum / vals.length : 0,
      answeredAt: times[times.length - 1] ?? "",
    };
  }), [students, questions, latest]);

  const overall = useMemo(() => {
    let total = 0;
    let count = 0;
    stats.forEach((s) => { total += s.mean * s.count; count += s.count; });
    return { mean: count ? total / count : 0, count };
  }, [stats]);

  // === 내보내기 ===

  /** 문항별 CSV — 학생 한 명이 한 줄, 문항이 열. SPSS·엑셀에서 바로 돌리는 모양. */
  const downloadWide = () => {
    if (!data) return;
    const head = ["학번", "이름", "학과", "학년", "구분", "최종응답일시",
      ...questions.map((q) => `${q.label}`), "응답문항수", "합계", "평균"];
    const rows = [head.map(csv).join(",")];
    studentRows.forEach((p) => {
      rows.push([
        csv(p.studentId), csv(p.name), csv(p.department), csv(p.gradeYear),
        csv(p.studentType === "international" ? "유학생" : "국내"),
        csv(p.answeredAt ? formatDateTimeKorea(p.answeredAt) : ""),
        ...p.answers.map((r) => csv(r ? r.value : "")),
        csv(p.answered), csv(p.sum), csv(p.mean ? p.mean.toFixed(2) : ""),
      ].join(","));
    });
    // 문항 내용은 열 이름만으로 알 수 없다. 대조표를 같은 파일 끝에 붙인다.
    rows.push("", csv("문항 대조표"), ["열 이름", "영역", "문항번호", "문항 내용", "사용"].map(csv).join(","));
    questions.forEach((q) => {
      rows.push([csv(q.label), csv(q.areaName), csv(q.order), csv(q.text), csv(q.isActive ? "사용" : "중지")].join(","));
    });
    download(`${data.type.label}_문항별.csv`, rows);
  };

  /** 문항 요약 CSV — 문항별 평균·표준편차·분포 */
  const downloadSummary = () => {
    if (!data) return;
    const rows = [["영역", "문항번호", "문항 내용", "응답수", "평균", "표준편차", "1점", "2점", "3점", "4점", "5점"].map(csv).join(",")];
    questions.forEach((q) => {
      const s = stats.get(q.id);
      rows.push([
        csv(q.areaName), csv(q.order), csv(q.text), csv(s?.count ?? 0),
        csv(s ? s.mean.toFixed(2) : ""), csv(s ? s.sd.toFixed(2) : ""),
        ...(s?.dist ?? [0, 0, 0, 0, 0]).map(csv),
      ].join(","));
    });
    rows.push("", csv("영역별 평균"), ["영역", "응답수", "평균"].map(csv).join(","));
    areaStats.forEach((a) => {
      rows.push([csv(a.name), csv(a.count), csv((a.total / a.count).toFixed(2))].join(","));
    });
    download(`${data.type.label}_문항요약.csv`, rows);
  };

  /** 원자료 CSV — 응답 한 건이 한 줄. 재응시한 행까지 그대로 들어간다. */
  const downloadLong = () => {
    if (!data) return;
    const qMap = new Map(data.questions.map((q) => [q.id, q]));
    const pMap = new Map(data.students.map((p) => [p.studentId, p]));
    const rows = [["학번", "이름", "학과", "진단", "영역", "문항번호", "문항ID", "문항 내용", "응답값", "응답일시"].map(csv).join(",")];
    data.responses
      .filter((r) => shownIds.has(r.studentId))
      .forEach((r) => {
        const q = qMap.get(r.questionId);
        const p = pMap.get(r.studentId);
        rows.push([
          csv(r.studentId), csv(p?.name), csv(p?.department), csv(data.type.label),
          csv(q?.areaName), csv(q?.order), csv(r.questionId), csv(q?.text),
          csv(r.value), csv(formatDateTimeKorea(r.answeredAt)),
        ].join(","));
      });
    download(`${data.type.label}_원자료.csv`, rows);
  };

  // === 역량별 결과 (기존) ===
  const filteredDiag = useMemo(() => {
    let list = diagResults;
    if (filterType !== "all") list = list.filter((r) => r.diagnosis_type === filterType);
    const q = searchText.trim().toLowerCase();
    if (q) list = list.filter((r) => r.student_id.includes(q) || (nameMap[r.student_id] ?? "").toLowerCase().includes(q));
    return list;
  }, [diagResults, filterType, searchText, nameMap]);

  const downloadDiagCSV = () => {
    const rows = [["학번", "이름", "학과", "진단유형", "총점", "세부점수", "진단시간"].map(csv).join(",")];
    filteredDiag.forEach((r) => {
      const scores = r.scores
        ? Object.entries(r.scores).map(([k, v]) => `${SCORE_LABELS[r.diagnosis_type]?.[k] ?? k}:${v}`).join(" / ")
        : "";
      rows.push([
        csv(r.student_id), csv(nameMap[r.student_id]), csv(deptMap[r.student_id]),
        csv(DIAGNOSIS_LABELS[r.diagnosis_type] ?? r.diagnosis_type),
        csv(r.total_score), csv(scores), csv(formatDateTimeKorea(r.created_at)),
      ].join(","));
    });
    download("역량별_결과.csv", rows);
  };

  return (
    <AdminLayout>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ys-ink">응답 데이터 조회</h2>
          <p className="mt-1 text-sm text-ys-ink-soft">
            진단을 하나 골라 문항별로 봅니다. 문항번호는 영역마다 1번부터 다시 시작하므로
            열 이름은 &apos;영역-번호&apos; 로 적습니다.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {([["questions", "문항별 결과"], ["diagnosis", "역량별 결과"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setViewTab(k)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${viewTab === k ? "bg-ys-blue text-white" : "text-ys-ink-soft hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {viewTab === "questions" && (
        <>
          {/* 진단 선택 + 내보내기 */}
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="diag-type" className="text-sm font-medium text-ys-ink">진단</label>
              <select id="diag-type" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}
                className="min-w-[18rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                {diagTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <div className="ml-auto flex flex-wrap gap-2">
                <button type="button" onClick={downloadWide} disabled={!data || questions.length === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-ys-blue px-3 py-2 text-sm font-medium text-white hover:bg-ys-blue/90 disabled:opacity-50">
                  <Download className="h-4 w-4" /> 문항별 CSV
                </button>
                <button type="button" onClick={downloadSummary} disabled={!data || questions.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper disabled:opacity-50">
                  <Download className="h-4 w-4" /> 문항 요약 CSV
                </button>
                <button type="button" onClick={downloadLong} disabled={!data || questions.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper disabled:opacity-50">
                  <Download className="h-4 w-4" /> 원자료 CSV
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
              <Filter className="h-4 w-4 text-ys-ink-soft/70" />
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="all">학과 전체</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <input type="text" placeholder="학번 또는 이름..." value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <span className="text-xs text-ys-ink-soft">
                내보내기는 지금 걸려 있는 필터 그대로 나갑니다
              </span>
            </div>
          </div>

          {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {loading && <p className="py-10 text-center text-sm text-ys-ink-soft">불러오는 중...</p>}

          {!loading && data && questions.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-ys-ink-soft">
              이 진단에는 아직 응답이 없습니다.
            </p>
          )}

          {!loading && data && questions.length > 0 && (
            <>
              <div className="mb-5 grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-ys-ink-soft">응답 학생</p>
                  <p className="mt-1 text-2xl font-bold text-ys-ink">{studentRows.filter((p) => p.answered > 0).length}명</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-ys-ink-soft">문항</p>
                  <p className="mt-1 text-2xl font-bold text-ys-ink">{questions.length}개</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-ys-blue">전체 평균</p>
                  <p className="mt-1 text-2xl font-bold text-ys-blue">{overall.mean.toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-ys-ink-soft">응답 건수</p>
                  <p className="mt-1 text-2xl font-bold text-ys-ink">{overall.count}건</p>
                </div>
              </div>

              {(retakeCount > 0 || (data.excludedArchived ?? 0) > 0) && (
                <p className="mb-5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {retakeCount > 0 && <>같은 문항에 두 번 이상 답한 응답 {retakeCount}건이 있습니다. 표와 문항별 CSV 는 가장 최근 응답을 씁니다 (원자료 CSV 에는 모두 들어갑니다). </>}
                  {(data.excludedArchived ?? 0) > 0 && <>보관 계정의 응답 {data.excludedArchived}건은 제외했습니다.</>}
                </p>
              )}

              {/* 영역별 평균 */}
              {areaStats.length > 1 && (
                <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 text-base font-semibold text-ys-ink">영역별 평균</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {areaStats.map((a) => (
                      <div key={a.name} className="rounded-lg bg-ys-paper p-3">
                        <p className="truncate text-xs text-ys-ink-soft" title={a.name}>{a.name}</p>
                        <p className="mt-1 text-xl font-bold text-ys-ink">{(a.total / a.count).toFixed(2)}</p>
                        <div className="mt-1.5 h-1.5 rounded-full bg-white">
                          <div className="h-full rounded-full bg-ys-blue" style={{ width: `${(a.total / a.count / 5) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 문항별 통계 */}
              <div className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <h3 className="border-b border-slate-100 px-5 py-3 text-base font-semibold text-ys-ink">문항별 결과</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-ys-paper">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-ys-ink-soft">영역</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-ys-ink-soft">번호</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-ys-ink-soft">문항</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-ys-ink-soft">응답</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-ys-ink-soft">평균</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-ys-ink-soft">표준편차</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-ys-ink-soft">1 · 2 · 3 · 4 · 5 분포</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {questions.map((q) => {
                        const s = stats.get(q.id);
                        if (!s) return null;
                        return (
                          <tr key={q.id} className="hover:bg-ys-paper">
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-ys-ink-soft">{q.areaName}</td>
                            <td className="px-3 py-2 text-xs text-ys-ink-soft/70">{q.order}</td>
                            <td className="max-w-md px-3 py-2 text-xs text-ys-ink" title={q.text}>{q.text}</td>
                            <td className="px-3 py-2 text-right text-xs text-ys-ink-soft">{s.count}명</td>
                            <td className="px-3 py-2 text-right text-sm font-semibold text-ys-ink">{s.mean.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-xs text-ys-ink-soft">{s.sd.toFixed(2)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                {s.dist.map((n, i) => (
                                  <span key={i} title={`${i + 1}점 ${n}명`}
                                    className={`inline-flex h-5 min-w-[1.6rem] items-center justify-center rounded text-[10px] font-medium ${
                                      n === 0 ? "bg-slate-50 text-slate-300"
                                        : i >= 3 ? "bg-ys-blue/15 text-ys-blue" : "bg-amber-50 text-amber-700"}`}>
                                    {n}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 학생 × 문항 */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <h3 className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-base font-semibold text-ys-ink">
                  <Users className="h-4 w-4" /> 학생별 문항 응답
                  <span className="text-xs font-normal text-ys-ink-soft">{studentRows.length}명</span>
                </h3>
                <div className="max-h-[32rem] overflow-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead>
                      <tr className="bg-ys-paper">
                        <th className="sticky left-0 top-0 z-20 border-b border-slate-200 bg-ys-paper px-3 py-2 text-left font-semibold text-ys-ink-soft">학번</th>
                        <th className="sticky top-0 z-10 border-b border-slate-200 bg-ys-paper px-3 py-2 text-left font-semibold text-ys-ink-soft">이름</th>
                        <th className="sticky top-0 z-10 border-b border-slate-200 bg-ys-paper px-3 py-2 text-left font-semibold text-ys-ink-soft">학과</th>
                        {questions.map((q) => (
                          <th key={q.id} title={q.text}
                            className="sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-ys-paper px-2 py-2 text-center font-semibold text-ys-ink-soft">
                            {q.label}
                          </th>
                        ))}
                        <th className="sticky top-0 z-10 border-b border-slate-200 bg-ys-paper px-3 py-2 text-right font-semibold text-ys-ink-soft">평균</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentRows.map((p) => (
                        <tr key={p.studentId} className="hover:bg-ys-paper/60">
                          <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5 text-ys-ink">{p.studentId}</td>
                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-ys-ink">{p.name ?? "-"}</td>
                          <td className="whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-ys-ink-soft">{p.department ?? "-"}</td>
                          {p.answers.map((r, i) => (
                            <td key={questions[i].id} className="border-b border-slate-100 px-2 py-1.5 text-center">
                              {r ? (
                                <span className={`inline-flex h-5 w-5 items-center justify-center rounded font-semibold ${
                                  r.value >= 4 ? "bg-ys-blue/10 text-ys-blue"
                                    : r.value === 3 ? "bg-slate-100 text-ys-ink-soft" : "bg-amber-50 text-amber-700"}`}>
                                  {r.value}
                                </span>
                              ) : <span className="text-slate-300">·</span>}
                            </td>
                          ))}
                          <td className="border-b border-slate-100 px-3 py-1.5 text-right font-semibold text-ys-ink">
                            {p.answered ? p.mean.toFixed(2) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* === 역량별 결과 (전용 화면이 있는 세 진단의 점수) === */}
      {viewTab === "diagnosis" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-ys-ink-soft/70" />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="all">전체</option>
              <option value="core">핵심역량</option>
              <option value="learning">학습역량</option>
              <option value="calling">소명진단</option>
            </select>
            <input type="text" placeholder="학번 또는 이름..." value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="button" onClick={downloadDiagCSV}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">
              <Download className="h-4 w-4" /> 역량별 CSV
            </button>
          </div>

          <p className="mb-3 text-xs text-ys-ink-soft">
            여기에는 전용 화면이 있는 핵심·학습·소명 진단의 환산 점수만 쌓입니다.
            사후 학습자 역량진단처럼 새로 올린 진단은 &apos;문항별 결과&apos; 에서 봅니다.
          </p>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-ys-paper">
                <tr>
                  {["학번", "이름", "유형", "총점", "세부", "일시"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-ys-ink-soft">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredDiag.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ys-ink-soft">데이터 없음</td></tr>
                ) : filteredDiag.map((r) => (
                  <tr key={r.id} className="hover:bg-ys-paper">
                    <td className="px-4 py-3 text-sm text-ys-ink">{r.student_id}</td>
                    <td className="px-4 py-3 text-sm text-ys-ink-soft">{nameMap[r.student_id] ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.diagnosis_type === "calling" ? "bg-ys-gold/15 text-[#8A6212]" : "bg-ys-blue/10 text-ys-blue"}`}>
                        {DIAGNOSIS_LABELS[r.diagnosis_type] ?? r.diagnosis_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-ys-ink">{r.total_score}점</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.scores && Object.entries(r.scores).map(([k, v]) => (
                          <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-ys-ink-soft">
                            {SCORE_LABELS[r.diagnosis_type]?.[k] ?? k}:{v}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-ys-ink-soft">{formatDateTimeKorea(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
