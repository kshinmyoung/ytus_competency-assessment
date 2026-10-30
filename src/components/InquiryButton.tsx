"use client";

/**
 * 어느 화면에서든 관리자에게 문의를 보내는 버튼.
 *
 * 루트 레이아웃에 두어 영상 시청 화면처럼 전역 헤더가 없는 곳까지 덮는다.
 * 로그인한 학생에게만 보인다 — 교직원은 각자의 관리 화면이 따로 있다.
 */
import { MessageCircleQuestion, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const CATEGORIES = ["영상학습", "역량진단", "로그인", "비교과", "기타"] as const;
const BODY_MAX = 2000;

/** 로그인 전 화면에는 띄우지 않는다 */
const HIDDEN_PREFIXES = ["/login", "/password-reset", "/admin", "/staff", "/professor"];

type Mine = {
  id: number; category: string; body: string; status: string;
  answer: string | null; answered_at: string | null; created_at: string;
};

export default function InquiryButton() {
  const pathname = usePathname() ?? "/";
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"new" | "mine">("new");
  const [category, setCategory] = useState<string>("영상학습");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [mine, setMine] = useState<Mine[]>([]);

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
  };

  // 학생 계정일 때만 버튼을 그린다. 역할을 읽기 전에는 아무것도 그리지 않는다.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        if (alive) setShow(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email ?? "";
      if (!email) { if (alive) setShow(false); return; }
      const sid = email.replace(/@temp\.com$/i, "").trim();
      const { data } = await supabase.from("students").select("role").eq("student_id", sid).maybeSingle();
      const role = (data?.role ?? "student").trim().toLowerCase();
      if (alive) setShow(role === "student");
    })();
    return () => { alive = false; };
  }, [pathname]);

  const loadMine = useCallback(async () => {
    const res = await fetch("/api/me/inquiries", { headers: await authHeaders() });
    if (res.ok) setMine(await res.json());
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true); setErr(""); setMsg("");
    const res = await fetch("/api/me/inquiries", {
      method: "POST", headers: await authHeaders(),
      body: JSON.stringify({ category, body, pagePath: pathname }),
    });
    const data = await res.json().catch(() => null);
    setSending(false);
    if (!res.ok) { setErr(data?.error ?? "보내지 못했습니다."); return; }
    setBody("");
    setMsg("문의를 보냈습니다. 답변은 '내 문의'에서 확인하실 수 있습니다.");
    void loadMine();
  };

  if (!show) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => { setOpen(true); setMsg(""); setErr(""); }}
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-ys-navy px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-ys-navy-soft"
          aria-label="관리자에게 문의하기"
        >
          <MessageCircleQuestion className="h-5 w-5" />
          <span className="hidden sm:inline">문의하기</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-end bg-black/40 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ys-ink">관리자에게 문의</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기"
                className="rounded-lg p-1 text-ys-ink-soft hover:bg-ys-paper">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-ys-paper p-1">
              {([["new", "문의하기"], ["mine", "내 문의"]] as const).map(([k, label]) => (
                <button key={k} type="button"
                  onClick={() => { setTab(k); setMsg(""); setErr(""); if (k === "mine") void loadMine(); }}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                    tab === k ? "bg-white text-ys-blue shadow-sm" : "text-ys-ink-soft"}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "new" ? (
              <form onSubmit={send}>
                <label htmlFor="inq-cat" className="mb-1 block text-xs font-medium text-ys-ink-soft">무엇에 대한 문의인가요?</label>
                <select id="inq-cat" value={category} onChange={(e) => setCategory(e.target.value)}
                  className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <label htmlFor="inq-body" className="mb-1 block text-xs font-medium text-ys-ink-soft">내용</label>
                <textarea
                  id="inq-body" rows={6} value={body} maxLength={BODY_MAX}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="어떤 화면에서 무엇을 하다가 생긴 일인지 적어 주시면 더 빨리 확인할 수 있습니다."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-right text-[11px] text-ys-ink-soft/70">{body.length} / {BODY_MAX}</p>
                <p className="mt-2 text-[11px] text-ys-ink-soft">
                  지금 보고 계신 화면({pathname})이 함께 전달됩니다.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="submit" disabled={sending || !body.trim()}
                    className="rounded-lg bg-ys-blue px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                    {sending ? "보내는 중..." : "보내기"}
                  </button>
                  {msg && <span className="text-sm text-emerald-600">{msg}</span>}
                  {err && <span className="text-sm text-rose-600">{err}</span>}
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                {mine.length === 0 && <p className="py-6 text-center text-sm text-ys-ink-soft">보낸 문의가 없습니다.</p>}
                {mine.map((m) => (
                  <div key={m.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full bg-ys-blue/10 px-2 py-0.5 text-[11px] font-medium text-ys-blue">{m.category}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        m.status === "완료" ? "bg-emerald-50 text-emerald-700"
                        : m.status === "처리중" ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-ys-ink-soft"}`}>{m.status}</span>
                      <span className="ml-auto text-[11px] text-ys-ink-soft/70">{m.created_at.slice(0, 10)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-ys-ink">{m.body}</p>
                    {m.answer && (
                      <div className="mt-2 rounded-lg bg-ys-paper p-2.5">
                        <p className="mb-1 text-[11px] font-medium text-ys-ink-soft">관리자 답변</p>
                        <p className="whitespace-pre-wrap text-sm text-ys-ink">{m.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
