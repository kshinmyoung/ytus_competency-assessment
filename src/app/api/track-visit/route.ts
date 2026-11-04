import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * 학번은 Bearer 토큰에서만 꺼낸다. 요청 body 의 값은 신뢰하지 않는다.
 * 로그인 전 방문(/login 등)은 토큰이 없어 null 로 남는 것이 정상이다.
 */
async function resolveStudentId(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user } } = await anon.auth.getUser(token);
  const email = user?.email;
  if (!email || !/@temp\.com$/i.test(email)) return null;
  return email.replace(/@temp\.com$/i, "").trim().slice(0, 50);
}

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
    const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null;
    const user_agent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
    const student_id = await resolveStudentId(request);

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
