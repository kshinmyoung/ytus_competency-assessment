"use client";

import { Download, Filter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AdminLayout from "@/components/AdminLayout";
import { formatDateTimeKorea } from "@/lib/date";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DIAGNOSIS_LABELS: Record<string, string> = {
  core: "핵심역량",
  learning: "학습역량",
  calling: "소명진단",
};

const SCORE_LABELS: Record<string, Record<string, string>> = {
  core: {
    spiritual: "영성",
    reflection: "기독교적성찰",
    empathy: "공감소통",
    glocal: "글로컬",
    creative: "창의융합",
  },
  learning: {
    launch: "Launch",
    explore: "Explore",
    act: "Act",
    refine: "Refine",
    network: "Network",
  },
  calling: {
    calling: "Calling",
    awakening: "Awakening",
    leading: "Leading",
    launching: "Launching",
    plus: "Plus",
  },
};

type DiagnosisResult = {
  id: number;
  student_id: string;
  diagnosis_type: string;
  total_score: number;
  scores: Record<string, number> | null;
  created_at: string;
};

export default function AdminAssessmentResultsPage() {
  const [results, setResults] = useState<DiagnosisResult[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [filterType, setFilterType] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [diagRes, studentsRes] = await Promise.all([
        supabase
          .from("diagnosis_results")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("students").select("student_id, name"),
      ]);

      setResults((diagRes.data ?? []) as DiagnosisResult[]);

      const map: Record<string, string> = {};
      (studentsRes.data ?? []).forEach((s: any) => {
        map[s.student_id] = s.name ?? "";
      });
      setNameMap(map);
    })();
  }, []);

  // 필터링
  const filtered = useMemo(() => {
    let list = results;
    if (filterType !== "all") {
      list = list.filter((r) => r.diagnosis_type === filterType);
    }
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.student_id.toLowerCase().includes(q) ||
          (nameMap[r.student_id] ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [results, filterType, searchText, nameMap]);

  // 진단 유형별 참여 수
  const countByType = useMemo(() => {
    const counts: Record<string, number> = { core: 0, learning: 0, calling: 0 };
    results.forEach((r) => {
      counts[r.diagnosis_type] = (counts[r.diagnosis_type] ?? 0) + 1;
    });
    return counts;
  }, [results]);

  // 고유 학생 수
  const uniqueStudents = useMemo(() => {
    return new Set(results.map((r) => r.student_id)).size;
  }, [results]);

  // 역량별 평균 차트 데이터
  const avgChartData = useMemo(() => {
    const currentType = filterType === "all" ? "core" : filterType;
    const typeResults = results.filter((r) => r.diagnosis_type === currentType);
    const labels = SCORE_LABELS[currentType] ?? {};

    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};

    typeResults.forEach((r) => {
      if (!r.scores) return;
      Object.entries(r.scores).forEach(([key, value]) => {
        sums[key] = (sums[key] ?? 0) + value;
        counts[key] = (counts[key] ?? 0) + 1;
      });
    });

    return Object.entries(sums).map(([key, total]) => ({
      name: labels[key] ?? key,
      평균: Math.round((total / (counts[key] || 1)) * 10) / 10,
    }));
  }, [results, filterType]);

  // 선택 학생의 상세 결과
  const studentResults = useMemo(() => {
    if (!selectedStudent) return [];
    return results.filter((r) => r.student_id === selectedStudent);
  }, [selectedStudent, results]);

  // CSV 다운로드
  const downloadCSV = (type: "all" | "scores") => {
    let csv = "";
    const list = filterType === "all" ? results : results.filter((r) => r.diagnosis_type === filterType);

    if (type === "all") {
      csv = "학번,이름,진단유형,총점,세부점수,진단시간\n";
      list.forEach((r) => {
        const scores = r.scores
          ? Object.entries(r.scores)
              .map(([k, v]) => `${SCORE_LABELS[r.diagnosis_type]?.[k] ?? k}:${v}`)
              .join(" / ")
          : "";
        csv += `"${r.student_id}","${nameMap[r.student_id] ?? ""}","${DIAGNOSIS_LABELS[r.diagnosis_type] ?? r.diagnosis_type}","${r.total_score}","${scores}","${r.created_at ?? ""}"\n`;
      });
    } else {
      csv = "학번,이름,진단유형,총점,진단시간\n";
      list.forEach((r) => {
        csv += `"${r.student_id}","${nameMap[r.student_id] ?? ""}","${DIAGNOSIS_LABELS[r.diagnosis_type] ?? r.diagnosis_type}","${r.total_score}","${r.created_at ?? ""}"\n`;
      });
    }

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagnosis_results_${filterType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 학생 목록 (드롭다운용)
  const studentList = useMemo(() => {
    const ids = new Set(filtered.map((r) => r.student_id));
    return Array.from(ids).sort();
  }, [filtered]);

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-900">응답 데이터 조회</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => downloadCSV("all")}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> 전체 응답 CSV
          </button>
          <button
            type="button"
            onClick={() => downloadCSV("scores")}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Download className="h-4 w-4" /> 점수 요약 CSV
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">전체 참여 학생</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{uniqueStudents}명</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">핵심역량 진단</p>
          <p className="mt-1 text-2xl font-bold text-violet-600">{countByType.core}건</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">학습역량 진단</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{countByType.learning}건</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">소명진단</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{countByType.calling}건</p>
        </div>
      </div>

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-slate-400" />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">전체 유형</option>
          <option value="core">핵심역량</option>
          <option value="learning">학습역량</option>
          <option value="calling">소명진단</option>
        </select>
        <input
          type="text"
          placeholder="학번 또는 이름 검색..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {/* 역량별 평균 차트 */}
      {avgChartData.length > 0 && (
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-slate-800">
            역량별 평균 점수 ({DIAGNOSIS_LABELS[filterType === "all" ? "core" : filterType]})
          </h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={avgChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="평균" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 결과 테이블 */}
      <div className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">학번</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">이름</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">진단유형</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">총점</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">세부점수</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">진단시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900">{r.student_id}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{nameMap[r.student_id] ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.diagnosis_type === "core"
                          ? "bg-violet-50 text-violet-700"
                          : r.diagnosis_type === "learning"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      {DIAGNOSIS_LABELS[r.diagnosis_type] ?? r.diagnosis_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{r.total_score}점</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.scores &&
                        Object.entries(r.scores).map(([k, v]) => (
                          <span
                            key={k}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                          >
                            {SCORE_LABELS[r.diagnosis_type]?.[k] ?? k}: {v}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDateTimeKorea(r.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 학생별 상세 */}
      <div>
        <h3 className="mb-4 text-base font-semibold text-slate-800">학생별 상세 조회</h3>
        <div className="mb-4">
          <select
            value={selectedStudent ?? ""}
            onChange={(e) => setSelectedStudent(e.target.value || null)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">학생 선택...</option>
            {studentList.map((sid) => (
              <option key={sid} value={sid}>
                {sid} - {nameMap[sid] ?? ""}
              </option>
            ))}
          </select>
        </div>

        {selectedStudent && studentResults.length > 0 && (
          <div className="space-y-4">
            {studentResults.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      r.diagnosis_type === "core"
                        ? "bg-violet-50 text-violet-700"
                        : r.diagnosis_type === "learning"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-green-50 text-green-700"
                    }`}
                  >
                    {DIAGNOSIS_LABELS[r.diagnosis_type]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDateTimeKorea(r.created_at)}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-900">총점: {r.total_score}점</p>
                {r.scores && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                    <table className="min-w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                            역량
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                            점수
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {Object.entries(r.scores).map(([k, v]) => (
                          <tr key={k}>
                            <td className="px-3 py-2 text-sm text-slate-700">
                              {SCORE_LABELS[r.diagnosis_type]?.[k] ?? k}
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-medium text-slate-900">
                              {v}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {selectedStudent && studentResults.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            이 학생의 진단 데이터가 없습니다.
          </p>
        )}
      </div>
    </AdminLayout>
  );
}
