"use client";

import { BarChart3, Calendar, Download, FileSpreadsheet, RefreshCw, Send, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import { getCurrentStudentId, supabase } from "@/lib/supabase";
import { downloadCSV, downloadXLSX } from "@/lib/export";

type Stats = {
  generated_at: string;
  visits: {
    total: number;
    today: number;
    last_7d: number;
    last_30d: number;
    unique_all_time: number;
    unique_today: number;
    unique_7d: number;
    unique_30d: number;
    daily_7d: Record<string, number>;
  };
  diagnosis: {
    core: number;
    learning: number;
    calling: number;
    major: number;
    custom: number;
    total: number;
  };
  referrals: {
    total: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
  };
  reservations: {
    total: number;
    by_status: Record<string, number>;
    by_center: Record<string, number>;
  };
  students: { total: number };
};

const DIAGNOSIS_LABELS: Record<string, string> = {
  core: "핵심역량",
  learning: "학습역량",
  calling: "진로(소명)",
  major: "전공역량",
  custom: "커스텀",
};

const CENTER_LABELS: Record<string, string> = {
  ctl: "교수학습지원센터",
  career_center: "취창업진로지원센터",
  counseling_center: "학생생활상담센터",
};

const REFERRAL_TYPE_LABELS: Record<string, string> = {
  ctl: "교수학습지원센터",
  career_center: "취창업진로지원센터",
  counseling_center: "학생생활상담센터",
  professor: "교수",
  department_head: "학과장",
};

const DATASET_LABELS: Record<string, string> = {
  visits: "방문 로그",
  diagnosis: "진단 결과",
  referrals: "리퍼럴",
  reservations: "예약",
  students: "학생",
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("세션이 만료되었습니다. 다시 로그인해 주세요.");
        return;
      }
      const res = await fetch("/api/admin/dashboard/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "통계를 불러오지 못했습니다.");
        return;
      }
      setStats(data as Stats);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid?.trim()) {
        router.replace("/");
        return;
      }
      const { data } = await supabase.from("students").select("role").eq("student_id", sid.trim()).maybeSingle();
      const role = (data?.role ?? "").trim().toLowerCase();
      if (role !== "admin") {
        router.replace("/admin");
        return;
      }
      setAuthorized(true);
      loadStats();
    })();
  }, [router, loadStats]);

  const handleExport = async (dataset: string, format: "csv" | "xlsx") => {
    setExportingKey(`${dataset}:${format}`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert("세션이 만료되었습니다.");
        return;
      }
      const res = await fetch(`/api/admin/dashboard/export?dataset=${encodeURIComponent(dataset)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "내보내기 실패");
        return;
      }
      const rows = (data.rows ?? []) as Record<string, unknown>[];
      if (rows.length === 0) {
        alert("내보낼 데이터가 없습니다.");
        return;
      }
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `${dataset}_${dateStamp}`;
      if (format === "csv") downloadCSV(rows, filename);
      else downloadXLSX(rows, filename, DATASET_LABELS[dataset] ?? dataset);
    } catch (e) {
      alert(e instanceof Error ? e.message : "내보내기 실패");
    } finally {
      setExportingKey(null);
    }
  };

  if (authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ys-paper">
        <p className="text-ys-ink-soft">확인 중...</p>
      </div>
    );
  }
  if (!authorized) return null;

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ys-ink">통계 대시보드</h1>
          <p className="mt-1 text-sm text-ys-ink-soft">
            홈페이지 방문/진단/리퍼럴/예약 통계 · {stats?.generated_at ? new Date(stats.generated_at).toLocaleString("ko-KR") : "-"}
          </p>
        </div>
        <button
          type="button"
          onClick={loadStats}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {stats && (
        <>
          {/* 요약 카드 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Users className="h-5 w-5 text-ys-blue" />}
              title="총 방문자 (누적 고유)"
              value={stats.visits.unique_all_time.toLocaleString()}
              subtitle={`오늘 고유 ${stats.visits.unique_today.toLocaleString()}명 · 30일 고유 ${stats.visits.unique_30d.toLocaleString()}명`}
            />
            <StatCard
              icon={<BarChart3 className="h-5 w-5 text-ys-blue" />}
              title="총 페이지뷰"
              value={stats.visits.total.toLocaleString()}
              subtitle={`오늘 ${stats.visits.today.toLocaleString()} · 7일 ${stats.visits.last_7d.toLocaleString()} · 30일 ${stats.visits.last_30d.toLocaleString()}`}
            />
            <StatCard
              icon={<Send className="h-5 w-5 text-ys-sky" />}
              title="리퍼럴 총건수"
              value={stats.referrals.total.toLocaleString()}
              subtitle={Object.entries(stats.referrals.by_status).map(([k, v]) => `${k} ${v}`).join(" · ") || "-"}
            />
            <StatCard
              icon={<Calendar className="h-5 w-5 text-[#8A6212]" />}
              title="예약 총건수"
              value={stats.reservations.total.toLocaleString()}
              subtitle={Object.entries(stats.reservations.by_status).map(([k, v]) => `${k} ${v}`).join(" · ") || "-"}
            />
          </div>

          {/* 진단 통계 */}
          <section className="mt-8">
            <h2 className="mb-3 text-base font-semibold text-ys-ink">진단 실시 건수</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {(["core", "learning", "calling", "major", "custom"] as const).map((k) => (
                <div key={k} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-ys-ink-soft">{DIAGNOSIS_LABELS[k]}</p>
                  <p className="mt-2 text-2xl font-bold text-ys-ink">{stats.diagnosis[k].toLocaleString()}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-ys-ink-soft">
              전체 진단 건수: {stats.diagnosis.total.toLocaleString()} · 총 학생 {stats.students.total.toLocaleString()}명
            </p>
          </section>

          {/* 최근 7일 방문 추이 */}
          <section className="mt-8">
            <h2 className="mb-3 text-base font-semibold text-ys-ink">최근 7일 방문 추이</h2>
            <DailyBar daily={stats.visits.daily_7d} />
          </section>

          {/* 리퍼럴/예약 분포 */}
          <section className="mt-8 grid gap-4 lg:grid-cols-2">
            <BreakdownCard
              title="리퍼럴 - 접수 대상"
              data={stats.referrals.by_type}
              labels={REFERRAL_TYPE_LABELS}
            />
            <BreakdownCard
              title="예약 - 센터별"
              data={stats.reservations.by_center}
              labels={CENTER_LABELS}
            />
          </section>

          {/* 데이터 내보내기 */}
          <section className="mt-8">
            <h2 className="mb-3 text-base font-semibold text-ys-ink">데이터 내보내기 (CSV / Excel)</h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-ys-paper">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">데이터셋</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">설명</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ys-ink-soft">다운로드</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(["visits", "diagnosis", "referrals", "reservations", "students"] as const).map((ds) => (
                    <tr key={ds}>
                      <td className="px-4 py-3 text-sm font-medium text-ys-ink">{DATASET_LABELS[ds]}</td>
                      <td className="px-4 py-3 text-sm text-ys-ink-soft">
                        {ds === "visits" && "홈페이지 방문 로그 전체 (경로/세션ID/시간)"}
                        {ds === "diagnosis" && "진단 결과 전체 (5종 통합, 세부 점수 포함)"}
                        {ds === "referrals" && "리퍼럴 전체 이력"}
                        {ds === "reservations" && "센터 예약 전체 이력"}
                        {ds === "students" && "학생 마스터 데이터"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleExport(ds, "csv")}
                            disabled={exportingKey === `${ds}:csv`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-ys-ink hover:bg-ys-paper disabled:opacity-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                            CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExport(ds, "xlsx")}
                            disabled={exportingKey === `${ds}:xlsx`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            Excel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}

function StatCard({ icon, title, value, subtitle }: { icon: React.ReactNode; title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-medium text-ys-ink-soft">{title}</p>
      </div>
      <p className="mt-3 text-3xl font-bold text-ys-ink">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-ys-ink-soft">{subtitle}</p>}
    </div>
  );
}

function DailyBar({ daily }: { daily: Record<string, number> }) {
  const entries = Object.entries(daily);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex h-[160px] items-stretch justify-between gap-2">
        {entries.map(([date, count]) => {
          const heightPct = Math.max(4, Math.round((count / max) * 100));
          const dayLabel = date.slice(5);
          return (
            <div key={date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-ys-blue transition-all"
                  style={{ height: `${heightPct}%` }}
                  title={`${date}: ${count}회`}
                />
              </div>
              <span className="text-[10px] text-ys-ink-soft">{dayLabel}</span>
              <span className="text-[10px] font-medium text-ys-ink">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  data,
  labels,
}: {
  title: string;
  data: Record<string, number>;
  labels: Record<string, string>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-ys-ink">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-ys-ink-soft">데이터가 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map(([k, v]) => {
            const pct = total === 0 ? 0 : Math.round((v / total) * 100);
            return (
              <li key={k}>
                <div className="flex justify-between text-sm">
                  <span className="text-ys-ink">{labels[k] ?? k}</span>
                  <span className="font-medium text-ys-ink">{v.toLocaleString()} ({pct}%)</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-ys-blue" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
