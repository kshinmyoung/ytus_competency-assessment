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

export async function GET(request: Request) {
  try {
    const gate = await assertAdmin(request);
    if (gate instanceof NextResponse) return gate;
    const { admin } = gate;

    const now = new Date();

    const [
      visitStatsRes,
      diagCore,
      diagLearning,
      diagCalling,
      diagMajor,
      diagCustom,
      referralsTotal,
      reservationsTotal,
      studentsTotal,
      referralsRows,
      reservationsRows,
    ] = await Promise.all([
      /**
       * 방문 통계는 DB 함수가 집계한다.
       * 예전에는 page_visits 를 받아 와 자바스크립트에서 세션을 셌는데, PostgREST 가
       * 한 번에 1000행까지만 주므로 11,000여 건 중 앞 1000건만 세었다. 고유 방문자가
       * 3,070 대신 425 로 나오고 오늘·7일·30일 고유 방문자는 0 이었다.
       * 하루 경계도 서버 시간(UTC)이 아니라 Asia/Seoul 로 끊는다.
       */
      admin.rpc("dashboard_visit_stats"),
      countBy(admin, "diagnosis_results", { diagnosis_type: "core" }),
      countBy(admin, "diagnosis_results", { diagnosis_type: "learning" }),
      countBy(admin, "diagnosis_results", { diagnosis_type: "calling" }),
      countBy(admin, "diagnosis_results", { diagnosis_type: "major" }),
      countBy(admin, "diagnosis_results", { diagnosis_type: "custom" }),
      countBy(admin, "referrals"),
      countBy(admin, "center_reservations"),
      // 보관 계정은 재학생 수에 넣지 않는다
      admin.from("students").select("*", { count: "exact", head: true }).is("archived_at", null)
        .then((r) => (r as unknown as CountResult).count ?? 0),
      admin.from("referrals").select("status, to_type"),
      admin.from("center_reservations").select("status, center_type"),
    ]);

    if (visitStatsRes.error) {
      return NextResponse.json({ error: visitStatsRes.error.message }, { status: 500 });
    }
    const visits = (visitStatsRes.data ?? {}) as Record<string, number | Record<string, number>>;

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

    return NextResponse.json({
      generated_at: now.toISOString(),
      visits,
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
