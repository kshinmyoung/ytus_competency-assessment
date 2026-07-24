import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 서버 환경 변수 누락");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const rawPath = typeof body.path === "string" ? body.path : "";
    if (!rawPath || rawPath.startsWith("/api") || rawPath.startsWith("/_next")) {
      return NextResponse.json({ ok: true });
    }
    const path = rawPath.slice(0, 500);
    const session_id = typeof body.session_id === "string" ? body.session_id.slice(0, 100) : null;
    const student_id = typeof body.student_id === "string" ? body.student_id.slice(0, 50) : null;
    const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null;
    const user_agent = request.headers.get("user-agent")?.slice(0, 300) ?? null;

    const admin = getAdminClient();
    const { error } = await admin.from("page_visits").insert({
      path,
      session_id,
      student_id,
      referrer,
      user_agent,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
