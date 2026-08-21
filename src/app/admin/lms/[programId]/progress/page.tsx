"use client";

import { ArrowLeft, CheckCircle2, Download, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { canManageLms, canViewLmsProgress } from "@/lib/auth/lms-permissions";
import { downloadXLSX } from "@/lib/export";
import { getCurrentStudentId, supabase } from "@/lib/supabase";

type ContentCol = { contentId: number; title: string; durationSec: number; isRequired: boolean };

type Row = {
  studentId: string; name: string; studentType: string;
  enrolledStatus: string; enrolledAt: string;
  progress: number; requiredPassed: number; requiredTotal: number;
  perContent: { contentId: number; progress: number; watchedSec: number }[];
  lastPlayedAt: string | null;
  completed: boolean; certificateNo: string | null; completedAt: string | null;
  mileageGranted: number; revokedAt: string | null; revokeReason: string | null;
};

type ProgressData = {
  program: { id: number; name: string; minProgress: number; completionMileage: number };
  contents: ContentCol[];
  rows: Row[];
  summary: Record<string, { enrolled: number; completed: number; avgProgress: number }>;
};

const TYPE_LABEL: Record<string, string> = { domestic: "내국인", international: "유학생" };

export default function AdminLmsProgressPage() {
  const params = useParams();
  const programId = Number(params.programId);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<"domestic" | "international">("domestic");

  const authHeaders = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/lms/progress?programId=${programId}`, { headers: await authHeaders() });
    const body = await res.json();
    if (!res.ok) { setError(body.error ?? "불러오지 못했습니다."); setLoading(false); return; }
    setData(body);
    setError("");
    setLoading(false);
  }, [authHeaders, programId]);

  useEffect(() => {
    (async () => {
      const sid = await getCurrentStudentId();
      if (!sid) { setAllowed(false); return; }
      const { data: me } = await supabase.from("students").select("role").eq("student_id", sid).maybeSingle();
      if (!canViewLmsProgress(me?.role)) { setAllowed(false); return; }
      setCanManage(canManageLms(me?.role));
      setAllowed(true);
      await load();
    })();
  }, [load]);

  const handleExport = async () => {
    setNotice("");
    const res = await fetch(`/api/admin/lms/export?programId=${programId}`, { headers: await authHeaders() });
    const body = await res.json();
    if (!res.ok) { setNotice(body.error ?? "내보내기에 실패했습니다."); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = String(body.programName ?? "program").replace(/[\\/:*?"<>|]/g, "_");
    let count = 0;
    // 내국인/유학생은 분모가 달라 파일을 나눈다
    if (body.domestic?.length) { downloadXLSX(body.domestic, `${safeName}_내국인_${stamp}.xlsx`, "내국인"); count++; }
    if (body.international?.length) { downloadXLSX(body.international, `${safeName}_유학생_${stamp}.xlsx`, "유학생"); count++; }
    setNotice(count === 0 ? "내보낼 수강생이 없습니다." : `엑셀 ${count}개 파일을 내려받았습니다.`);
  };

  const handleApprove = async (row: Row) => {
    if (!confirm(`${row.name || row.studentId} 학생의 이수를 승인하시겠습니까?`)) return;
    setBusy(row.studentId); setNotice("");
    const res = await fetch("/api/admin/lms/completions", {
      method: "POST", headers: await authHeaders(),
      body: JSON.stringify({ programId, studentId: row.studentId }),
    });
    const body = await res.json();
    setBusy("");
    if (!res.ok) { setNotice(body.error ?? "승인에 실패했습니다."); return; }
    setNotice(body.restored ? "취소되었던 이수를 되살렸습니다." : `이수 확정 (수료번호 ${body.certificate_no})`);
    await load();
  };

  const handleRevoke = async (row: Row) => {
    const reason = prompt(`${row.name || row.studentId} 학생의 이수를 취소합니다.\n사유를 입력해 주세요.`);
    if (reason === null) return;
    if (!reason.trim()) { setNotice("취소 사유가 필요합니다."); return; }
    setBusy(row.studentId); setNotice("");
    const qs = new URLSearchParams({ programId: String(programId), studentId: row.studentId, reason: reason.trim() });
    const res = await fetch(`/api/admin/lms/completions?${qs}`, { method: "DELETE", headers: await authHeaders() });
    const body = await res.json();
    setBusy("");
    if (!res.ok) { setNotice(body.error ?? "취소에 실패했습니다."); return; }
    setNotice(body.mileageOffset ? `이수 취소 완료 · 마일리지 ${body.mileageOffset}점 상계` : "이수 취소 완료");
    await load();
  };

  if (allowed === null) return <AdminLayout><p className="text-sm text-slate-500">확인 중...</p></AdminLayout>;
  if (!allowed) {
    return (
      <AdminLayout>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow">
          <p className="text-sm text-slate-600">진도 현황 조회 권한이 없습니다.</p>
        </div>
      </AdminLayout>
    );
  }
  if (loading) return <AdminLayout><p className="text-sm text-slate-500">불러오는 중...</p></AdminLayout>;
  if (error || !data) {
    return (
      <AdminLayout>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow">
          <p className="text-sm text-slate-600">{error || "데이터가 없습니다."}</p>
        </div>
      </AdminLayout>
    );
  }

  const visible = data.rows.filter((r) => r.studentType === tab);

  return (
    <AdminLayout>
      <div className="mb-6">
        <Link href="/admin/lms" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
          영상 LMS 관리
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{data.program.name} — 진도 현황</h2>
            <p className="mt-1 text-xs text-slate-500">
              이수 기준 진도 {data.program.minProgress}% · 콘텐츠 {data.contents.length}개
              {data.program.completionMileage > 0 && ` · 이수 마일리지 ${data.program.completionMileage}점(내국인)`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            엑셀 다운로드
          </button>
        </div>
      </div>

      {notice && <p className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{notice}</p>}

      {/* 유형별 요약 — 합산하지 않는다 */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {(["domestic", "international"] as const).map((type) => {
          const s = data.summary[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => setTab(type)}
              className={`rounded-xl border p-4 text-left transition ${
                tab === type ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <p className="text-xs font-medium text-slate-500">{TYPE_LABEL[type]}</p>
              {s ? (
                <p className="mt-1 text-sm text-slate-900">
                  수강 <b>{s.enrolled}</b>명 · 이수 <b>{s.completed}</b>명 · 평균 진도 <b>{s.avgProgress}%</b>
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-400">해당 학생 없음</p>
              )}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">학번</th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">이름</th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">진도</th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">필수</th>
              {data.contents.map((c, i) => (
                <th key={c.contentId} className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-slate-500" title={c.title}>
                  {i + 1}{c.isRequired ? "" : "*"}
                </th>
              ))}
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">이수</th>
              {canManage && <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase text-slate-600">관리</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6 + data.contents.length} className="px-4 py-8 text-center text-sm text-slate-500">
                  {TYPE_LABEL[tab]} 수강생이 없습니다.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.studentId} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">{r.studentId}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-900">{r.name || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${r.progress >= data.program.minProgress ? "bg-emerald-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min(r.progress, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600">{r.progress}%</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{r.requiredPassed}/{r.requiredTotal}</td>
                  {data.contents.map((c) => {
                    const p = r.perContent.find((x) => x.contentId === c.contentId)?.progress ?? 0;
                    return (
                      <td key={c.contentId} className="whitespace-nowrap px-3 py-3 text-xs">
                        <span className={p >= data.program.minProgress ? "font-medium text-emerald-600" : p > 0 ? "text-slate-600" : "text-slate-300"}>
                          {p}%
                        </span>
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-4 py-3">
                    {r.completed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700" title={r.certificateNo ?? ""}>
                        <CheckCircle2 className="h-3 w-3" />
                        이수
                      </span>
                    ) : r.revokedAt ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600" title={r.revokeReason ?? ""}>
                        취소됨
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">미이수</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {r.completed ? (
                        <button
                          type="button"
                          disabled={busy === r.studentId}
                          onClick={() => handleRevoke(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          이수 취소
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy === r.studentId}
                          onClick={() => handleApprove(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          이수 승인
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        콘텐츠 열의 번호는 커리큘럼 순서이며 <b>*</b> 는 선택 콘텐츠입니다.
        내국인과 유학생은 이수 기준·마일리지 지급이 달라 합산하지 않고 따로 표시합니다.
      </p>
    </AdminLayout>
  );
}
