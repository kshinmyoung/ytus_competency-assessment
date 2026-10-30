"use client";

/**
 * 학생 문의 관리 (admin 전용)
 *
 * 문의에는 학생 개인사정이 적힐 수 있어 서버에서도 admin 만 통과시킨다.
 * 여기 화면 가드는 그보다 앞서 돌려보내는 한 겹일 뿐이다.
 */
import { MessageSquareText, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { supabase, waitForStudentId } from "@/lib/supabase";
import { formatDateTimeKorea } from "@/lib/date";

type Inquiry = {
  id: number; student_id: string; name: string | null; department: string | null;
  category: string; body: string; page_path: string | null; user_agent: string | null;
  status: "접수" | "처리중" | "완료"; answer: string | null;
  answered_by: string | null; answered_at: string | null; created_at: string;
};

const STATUSES = ["접수", "처리중", "완료"] as const;

const STATUS_STYLE: Record<string, string> = {
  접수: "bg-rose-50 text-rose-700 border-rose-200",
  처리중: "bg-amber-50 text-amber-700 border-amber-200",
  완료: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function AdminInquiriesPage() {
  const [rows, setRows] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
  };

  const load = useCallback(async () => {
    setLoading(true);
    const qs = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
    const res = await fetch(`/api/admin/inquiries${qs}`, { headers: await authHeaders() });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) { setError(body?.error ?? "불러오지 못했습니다."); return; }
    setError("");
    setRows(body);
    setDraft(Object.fromEntries((body as Inquiry[]).map((r) => [r.id, r.answer ?? ""])));
  }, [filter]);

  useEffect(() => {
    (async () => {
      const sid = await waitForStudentId();
      if (!sid) { setAllowed(false); return; }
      const { data } = await supabase.from("students").select("role").eq("student_id", sid).maybeSingle();
      const ok = (data?.role ?? "").trim().toLowerCase() === "admin";
      setAllowed(ok);
      if (ok) await load();
    })();
  }, [load]);

  const patch = async (id: number, payload: Record<string, unknown>) => {
    setSaving(id); setError("");
    const res = await fetch("/api/admin/inquiries", {
      method: "PATCH", headers: await authHeaders(), body: JSON.stringify({ id, ...payload }),
    });
    const body = await res.json().catch(() => null);
    setSaving(null);
    if (!res.ok) { setError(body?.error ?? "저장하지 못했습니다."); return; }
    await load();
  };

  if (allowed === false) {
    return (
      <AdminLayout>
        <p className="py-16 text-center text-sm text-ys-ink-soft">관리자만 볼 수 있는 화면입니다.</p>
      </AdminLayout>
    );
  }

  const counts = STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length] as const);

  return (
    <AdminLayout>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-ys-ink">
            <MessageSquareText className="h-4 w-4" /> 학생 문의
          </h1>
          <p className="mt-1 text-sm text-ys-ink-soft">학생이 화면에서 바로 보낸 문의입니다. 답변은 학생 마이페이지에 보입니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm">
            <option value="all">전체</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" onClick={() => void load()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ys-ink hover:bg-ys-paper">
            <RefreshCw className="h-4 w-4" /> 새로고침
          </button>
        </div>
      </div>

      {filter === "all" && rows.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {counts.map(([s, n]) => (
            <span key={s} className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLE[s]}`}>{s} {n}</span>
          ))}
        </div>
      )}

      {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {loading && <p className="py-10 text-center text-sm text-ys-ink-soft">불러오는 중...</p>}
      {!loading && rows.length === 0 && <p className="py-16 text-center text-sm text-ys-ink-soft">문의가 없습니다.</p>}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              <span className="rounded-full bg-ys-blue/10 px-2.5 py-0.5 text-xs font-medium text-ys-blue">{r.category}</span>
              <span className="text-sm font-medium text-ys-ink">{r.name ?? "-"}</span>
              <span className="text-xs text-ys-ink-soft">{r.student_id}{r.department ? ` · ${r.department}` : ""}</span>
              <span className="ml-auto text-xs text-ys-ink-soft/70">{formatDateTimeKorea(r.created_at)}</span>
            </div>

            <p className="whitespace-pre-wrap text-sm text-ys-ink">{r.body}</p>

            {/* 어느 화면에서 보냈는지가 재현의 출발점이다 */}
            {(r.page_path || r.user_agent) && (
              <p className="mt-2 text-[11px] text-ys-ink-soft/70">
                {r.page_path && <>보낸 화면 <code className="rounded bg-ys-paper px-1">{r.page_path}</code></>}
                {r.user_agent && <span className="ml-2">{r.user_agent.slice(0, 80)}</span>}
              </p>
            )}

            <div className="mt-3 border-t border-slate-100 pt-3">
              <label htmlFor={`ans-${r.id}`} className="mb-1 block text-xs font-medium text-ys-ink-soft">
                답변 {r.answered_at && <span className="font-normal text-ys-ink-soft/70">· {formatDateTimeKorea(r.answered_at)} {r.answered_by}</span>}
              </label>
              <textarea
                id={`ans-${r.id}`} rows={3}
                value={draft[r.id] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                placeholder="학생에게 보일 답변을 적어 주세요."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={saving === r.id}
                  onClick={() => void patch(r.id, { answer: draft[r.id] ?? "", status: "완료" })}
                  className="rounded-lg bg-ys-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  {saving === r.id ? "저장 중..." : "답변 저장 · 완료"}
                </button>
                {STATUSES.filter((s) => s !== r.status).map((s) => (
                  <button key={s} type="button" disabled={saving === r.id}
                    onClick={() => void patch(r.id, { status: s })}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-ys-ink hover:bg-ys-paper disabled:opacity-50">
                    {s}로
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
