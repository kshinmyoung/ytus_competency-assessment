/**
 * 학생 문의 관리 (서버 전용)
 * GET   /api/admin/inquiries?status=접수 — 목록
 * PATCH /api/admin/inquiries — 답변·상태 변경  body: { id, answer?, status? }
 *
 * 문의에는 학생 개인사정이 적힐 수 있다. admin 만 통과시킨다 (설계서 3장).
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const STATUSES = ["접수", "처리중", "완료"] as const;
const ANSWER_MAX = 2000;

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

async function assertAdmin(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "환경 변수 오류" }, { status: 500 });
  }
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user?.email) {
    return NextResponse.json({ error: "유효하지 않은 세션입니다." }, { status: 401 });
  }
  const studentId = user.email.replace(/@temp\.com$/i, "").trim();
  const admin = getAdminClient();
  const { data: row } = await admin.from("students").select("role").eq("student_id", studentId).maybeSingle();
  if ((row?.role ?? "").trim().toLowerCase() !== "admin") {
    return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
  }
  return { admin, studentId };
}

export async function GET(request: Request) {
  try {
    const result = await assertAdmin(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const status = new URL(request.url).searchParams.get("status");
    let q = admin
      .from("student_inquiries")
      .select("id, student_id, category, body, page_path, user_agent, status, answer, answered_by, answered_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (status && (STATUSES as readonly string[]).includes(status)) q = q.eq("status", status);

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 보낸 사람 이름을 붙인다. 문의 테이블에 이름을 복사해 두면 개명 시 어긋난다.
    const ids = [...new Set((rows ?? []).map((r) => r.student_id))];
    const { data: people } = ids.length
      ? await admin.from("students").select("student_id, name, department_id").in("student_id", ids)
      : { data: [] as { student_id: string; name: string | null; department_id: number | null }[] };
    const { data: depts } = await admin.from("departments").select("id, name");
    const deptName = new Map((depts ?? []).map((d) => [d.id, d.name]));
    const who = new Map((people ?? []).map((p) => [p.student_id, {
      name: p.name, department: deptName.get(p.department_id ?? -1) ?? null,
    }]));

    return NextResponse.json((rows ?? []).map((r) => ({
      ...r,
      name: who.get(r.student_id)?.name ?? null,
      department: who.get(r.student_id)?.department ?? null,
    })));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await assertAdmin(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId } = result;

    const body = await request.json();
    const id = Number(body.id);
    if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body.answer === "string") {
      const answer = body.answer.trim();
      if (answer.length > ANSWER_MAX) {
        return NextResponse.json({ error: `답변은 ${ANSWER_MAX}자 이내로 적어 주세요.` }, { status: 400 });
      }
      patch.answer = answer || null;
      // 답변을 쓰면 누가 언제 썼는지 같이 남긴다. 지우면 그 기록도 지운다.
      patch.answered_by = answer ? studentId : null;
      patch.answered_at = answer ? new Date().toISOString() : null;
    }
    if (typeof body.status === "string") {
      if (!(STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json({ error: "잘못된 상태입니다." }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
    }

    const { data, error } = await admin
      .from("student_inquiries")
      .update(patch)
      .eq("id", id)
      .select("id, status, answer, answered_at")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });

    return NextResponse.json({ success: true, ...data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}
