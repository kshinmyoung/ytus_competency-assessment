/**
 * 관리자용 학생 목록 API (서버 전용)
 * Authorization: Bearer <access_token> 으로 호출. 토큰으로 유저 확인 후 role이 admin일 때만 전체 목록 반환.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 등 서버 환경 변수가 필요합니다.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "환경 변수 오류" }, { status: 500 });
    }
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await anon.auth.getUser(token);
    if (userError || !user?.email) {
      return NextResponse.json({ error: "유효하지 않은 세션입니다." }, { status: 401 });
    }

    const studentId = user.email.replace(/@temp\.com$/i, "").trim();
    const admin = getAdminClient();
    const { data: roleRow } = await admin.from("students").select("role").eq("student_id", studentId).maybeSingle();
    const role = (roleRow?.role ?? "").trim().toLowerCase();
    if (role !== "admin") {
      return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });
    }

    const { data: students, error: listError } = await admin
      .from("students")
      .select("student_id, name, password, role")
      .order("student_id");

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }
    return NextResponse.json(students ?? []);
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
