import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 서버 환경 변수 누락");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function assertAdmin(request: Request): Promise<{ admin: SupabaseClient } | NextResponse> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "환경 변수 오류" }, { status: 500 });
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user?.email) return NextResponse.json({ error: "유효하지 않은 세션입니다." }, { status: 401 });
  const studentId = user.email.replace(/@temp\.com$/i, "").trim();
  const admin = getAdminClient();
  const { data: roleRow } = await admin.from("students").select("role").eq("student_id", studentId).maybeSingle();
  const role = (roleRow?.role ?? "").trim().toLowerCase();
  if (role !== "admin") return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  return { admin };
}

const DATASETS = new Set(["visits", "diagnosis", "referrals", "reservations", "students"]);

/**
 * PostgREST 는 한 번에 1000행까지만 준다. limit(100000) 을 적어도 1000행에서 잘린다.
 * 방문 로그 11,000여 건이 1,000건으로, 재학생 1,132명이 1,000명으로 잘려 나갔다.
 * 끝까지 넘겨 받는다 (학생 명단 API 와 같은 방식).
 */
const PAGE = 1000;

async function fetchAll(
  admin: SupabaseClient,
  table: string,
  columns: string,
  shape: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => typeof q,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await shape(admin.from(table).select(columns)).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function GET(request: Request) {
  try {
    const gate = await assertAdmin(request);
    if (gate instanceof NextResponse) return gate;
    const { admin } = gate;

    const { searchParams } = new URL(request.url);
    const dataset = (searchParams.get("dataset") ?? "").toLowerCase();
    if (!DATASETS.has(dataset)) {
      return NextResponse.json({ error: "dataset 파라미터가 필요합니다 (visits|diagnosis|referrals|reservations|students)" }, { status: 400 });
    }

    let rows: Record<string, unknown>[] = [];
    if (dataset === "visits") {
      rows = await fetchAll(admin, "page_visits",
        "id, path, session_id, student_id, referrer, user_agent, created_at",
        (q) => q.order("created_at", { ascending: false }));
    } else if (dataset === "diagnosis") {
      const all = await fetchAll(admin, "diagnosis_results",
        "id, student_id, diagnosis_type, total_score, scores, created_at",
        (q) => q.order("created_at", { ascending: false }));
      rows = all.map((row) => ({ ...row, scores: row.scores ? JSON.stringify(row.scores) : "" }));
    } else if (dataset === "referrals") {
      rows = await fetchAll(admin, "referrals",
        "id, student_id, from_staff_id, from_role, to_type, to_staff_id, reason, urgency, status, note, response_note, created_at, updated_at",
        (q) => q.order("created_at", { ascending: false }));
    } else if (dataset === "reservations") {
      rows = await fetchAll(admin, "center_reservations",
        "id, student_id, center_type, reservation_date, time_slot, purpose, status, admin_note, created_at",
        (q) => q.order("created_at", { ascending: false }));
    } else if (dataset === "students") {
      rows = await fetchAll(admin, "students",
        "student_id, name, role, department_id, grade_year, admission_year, phone, email",
        // 보관 계정은 내보내기에서도 뺀다
        (q) => q.is("archived_at", null).order("student_id"));
    }

    return NextResponse.json({ dataset, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
