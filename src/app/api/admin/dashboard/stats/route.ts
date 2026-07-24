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

type CountResult = { count: number | null };

async function countBy(admin: SupabaseClient, table: string, filters: Record<string, string> = {}): Promise<number> {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count } = (await q) as unknown as CountResult;
  return count ?? 0;
}

async function countSince(admin: SupabaseClient, table: string, column: string, since: string): Promise<number> {
  const { count } = (await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(column, since)) as unknown as CountResult;
  return count ?? 0;
}

export async function GET(request: Request) {
  try {
    const gate = await assertAdmin(request);
    if (gate instanceof NextResponse) return gate;
    const { admin } = gate;

    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      visitsTotal,
      visitsToday,
      visits7d,
      visits30d,
      diagCore,
      diagLearning,
      diagCalling,
      diagMajor,
      diagCustom,
      referralsTotal,
      reservationsTotal,
      studentsTotal,
      allSessionsRes,
      referralsRows,
      reservationsRows,
      dailyVisitsRes,
    ] = await Promise.all([
      countBy(admin, "page_visits"),
      countSince(admin, "page_visits", "created_at", startOfDay.toISOString()),
      countSince(admin, "page_visits", "created_at", sevenDaysAgo.toISOString()),
      countSince(admin, "page_visits", "created_at", thirtyDaysAgo.toISOString()),
      countBy(admin, "diagnosis_results", { diagnosis_type: "core" }),
      countBy(admin, "diagnosis_results", { diagnosis_type: "learning" }),
      countBy(admin, "diagnosis_results", { diagnosis_type: "calling" }),
      countBy(admin, "diagnosis_results", { diagnosis_type: "major" }),
      countBy(admin, "diagnosis_results", { diagnosis_type: "custom" }),
      countBy(admin, "referrals"),
      countBy(admin, "center_reservations"),
      countBy(admin, "students"),
      admin.from("page_visits").select("session_id, created_at").not("session_id", "is", null).limit(500000),
      admin.from("referrals").select("status, to_type"),
      admin.from("center_reservations").select("status, center_type"),
      admin.from("page_visits").select("created_at").gte("created_at", sevenDaysAgo.toISOString()).order("created_at", { ascending: true }).limit(50000),
    ]);

    const uniqueAll = new Set<string>();
    const unique30d = new Set<string>();
    const unique7d = new Set<string>();
    const uniqueToday = new Set<string>();
    const startOfDayMs = startOfDay.getTime();
    const sevenAgoMs = sevenDaysAgo.getTime();
    const thirtyAgoMs = thirtyDaysAgo.getTime();
    (allSessionsRes.data ?? []).forEach((r) => {
      const row = r as { session_id: string | null; created_at: string };
      const sid = row.session_id;
      if (!sid) return;
      uniqueAll.add(sid);
      const t = new Date(row.created_at).getTime();
      if (t >= thirtyAgoMs) unique30d.add(sid);
      if (t >= sevenAgoMs) unique7d.add(sid);
      if (t >= startOfDayMs) uniqueToday.add(sid);
    });

    const referralsByStatus: Record<string, number> = {};
    const referralsByType: Record<string, number> = {};
    (referralsRows.data ?? []).forEach((r) => {
      const row = r as { status?: string | null; to_type?: string | null };
      const st = (row.status ?? "미지정").trim();
      const tt = (row.to_type ?? "미지정").trim();
      referralsByStatus[st] = (referralsByStatus[st] ?? 0) + 1;
      referralsByType[tt] = (referralsByType[tt] ?? 0) + 1;
    });

    const reservationsByStatus: Record<string, number> = {};
    const reservationsByCenter: Record<string, number> = {};
    (reservationsRows.data ?? []).forEach((r) => {
      const row = r as { status?: string | null; center_type?: string | null };
      const st = (row.status ?? "미지정").trim();
      const ct = (row.center_type ?? "미지정").trim();
      reservationsByStatus[st] = (reservationsByStatus[st] ?? 0) + 1;
      reservationsByCenter[ct] = (reservationsByCenter[ct] ?? 0) + 1;
    });

    const dailyVisits: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      dailyVisits[key] = 0;
    }
    (dailyVisitsRes.data ?? []).forEach((r) => {
      const t = (r as { created_at: string }).created_at;
      const d = new Date(t);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (key in dailyVisits) dailyVisits[key] += 1;
    });

    return NextResponse.json({
      generated_at: now.toISOString(),
      visits: {
        total: visitsTotal,
        today: visitsToday,
        last_7d: visits7d,
        last_30d: visits30d,
        unique_all_time: uniqueAll.size,
        unique_today: uniqueToday.size,
        unique_7d: unique7d.size,
        unique_30d: unique30d.size,
        daily_7d: dailyVisits,
      },
      diagnosis: {
        core: diagCore,
        learning: diagLearning,
        calling: diagCalling,
        major: diagMajor,
        custom: diagCustom,
        total: diagCore + diagLearning + diagCalling + diagMajor + diagCustom,
      },
      referrals: {
        total: referralsTotal,
        by_status: referralsByStatus,
        by_type: referralsByType,
      },
      reservations: {
        total: reservationsTotal,
        by_status: reservationsByStatus,
        by_center: reservationsByCenter,
      },
      students: { total: studentsTotal },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
