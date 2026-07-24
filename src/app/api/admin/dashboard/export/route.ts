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
      const { data, error } = await admin
        .from("page_visits")
        .select("id, path, session_id, student_id, referrer, user_agent, created_at")
        .order("created_at", { ascending: false })
        .limit(100000);
      if (error) throw error;
      rows = (data ?? []) as Record<string, unknown>[];
    } else if (dataset === "diagnosis") {
      const { data, error } = await admin
        .from("diagnosis_results")
        .select("id, student_id, diagnosis_type, total_score, scores, created_at")
        .order("created_at", { ascending: false })
        .limit(100000);
      if (error) throw error;
      rows = (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return { ...row, scores: row.scores ? JSON.stringify(row.scores) : "" };
      });
    } else if (dataset === "referrals") {
      const { data, error } = await admin
        .from("referrals")
        .select("id, student_id, from_staff_id, from_role, to_type, to_staff_id, reason, urgency, status, note, response_note, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(100000);
      if (error) throw error;
      rows = (data ?? []) as Record<string, unknown>[];
    } else if (dataset === "reservations") {
      const { data, error } = await admin
        .from("center_reservations")
        .select("id, student_id, center_type, reservation_date, time_slot, purpose, status, admin_note, created_at")
        .order("created_at", { ascending: false })
        .limit(100000);
      if (error) throw error;
      rows = (data ?? []) as Record<string, unknown>[];
    } else if (dataset === "students") {
      const { data, error } = await admin
        .from("students")
        .select("student_id, name, role, department_id, grade_year, admission_year, phone, email")
        .order("student_id");
      if (error) throw error;
      rows = (data ?? []) as Record<string, unknown>[];
    }

    return NextResponse.json({ dataset, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
