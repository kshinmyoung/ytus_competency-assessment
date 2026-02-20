/**
 * 관리자용 학생 API (서버 전용, SUPABASE_SERVICE_ROLE_KEY 사용)
 * GET: 목록 조회, PATCH: 수정, DELETE: 삭제 (query student_id)
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

async function assertAdmin(request: Request): Promise<{ admin: ReturnType<typeof getAdminClient>; studentId: string } | NextResponse> {
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
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }
  return { admin, studentId };
}

export async function GET(request: Request) {
  try {
    const result = await assertAdmin(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;
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

export async function PATCH(request: Request) {
  try {
    const result = await assertAdmin(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;
    const body = await request.json();
    const student_id = typeof body.student_id === "string" ? body.student_id.trim() : "";
    if (!student_id) {
      return NextResponse.json({ error: "student_id가 필요합니다." }, { status: 400 });
    }
    const payload: Record<string, string> = {};
    if (typeof body.name === "string") payload.name = body.name.trim() || "";
    if (typeof body.password === "string" && body.password.trim()) payload.password = body.password.trim();
    if (typeof body.role === "string") payload.role = body.role.trim();
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "수정할 필드가 없습니다." }, { status: 400 });
    }
    const { error } = await admin.from("students").update(payload).eq("student_id", student_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const result = await assertAdmin(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;
    const { searchParams } = new URL(request.url);
    const student_id = searchParams.get("student_id")?.trim();
    if (!student_id) {
      return NextResponse.json({ error: "student_id가 필요합니다." }, { status: 400 });
    }
    const { error } = await admin.from("students").delete().eq("student_id", student_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
