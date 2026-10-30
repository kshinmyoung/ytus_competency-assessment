/**
 * 본인 문의 (서버 전용)
 * GET  /api/me/inquiries — 내가 보낸 문의와 답변
 * POST /api/me/inquiries — 문의 보내기  body: { category, body, pagePath }
 *
 * student_id 는 Bearer 토큰에서만 가져온다. 요청 body 의 학번은 믿지 않는다.
 * 답변·상태는 관리자만 쓸 수 있다. 여기서는 건드리지 않는다.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const CATEGORIES = ["영상학습", "역량진단", "로그인", "비교과", "기타"] as const;
const BODY_MAX = 2000;
/** 한 사람이 짧은 시간에 같은 내용을 여러 번 보내는 것을 막는다 */
const RECENT_LIMIT = 5;
const RECENT_WINDOW_MIN = 10;

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

async function resolveStudentId(request: Request): Promise<string | NextResponse> {
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
  return user.email.replace(/@temp\.com$/i, "").trim();
}

export async function GET(request: Request) {
  try {
    const studentId = await resolveStudentId(request);
    if (studentId instanceof NextResponse) return studentId;

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("student_inquiries")
      .select("id, category, body, status, answer, answered_at, created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const studentId = await resolveStudentId(request);
    if (studentId instanceof NextResponse) return studentId;

    const payload = await request.json();
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body) return NextResponse.json({ error: "문의 내용을 입력해 주세요." }, { status: 400 });
    if (body.length > BODY_MAX) {
      return NextResponse.json({ error: `문의는 ${BODY_MAX}자 이내로 적어 주세요.` }, { status: 400 });
    }
    const category = (CATEGORIES as readonly string[]).includes(payload.category) ? payload.category : "기타";
    // 보낸 화면은 재현에 필요하다. 다만 주소를 그대로 믿지 않고 경로만, 길이도 제한해 담는다.
    const pagePath = typeof payload.pagePath === "string" && payload.pagePath.startsWith("/")
      ? payload.pagePath.slice(0, 200)
      : null;

    const admin = getAdminClient();

    const since = new Date(Date.now() - RECENT_WINDOW_MIN * 60_000).toISOString();
    const { count } = await admin
      .from("student_inquiries")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .gte("created_at", since);
    if ((count ?? 0) >= RECENT_LIMIT) {
      return NextResponse.json(
        { error: "문의가 접수되는 중입니다. 잠시 후 다시 보내 주세요." },
        { status: 429 },
      );
    }

    const { data, error } = await admin
      .from("student_inquiries")
      .insert({
        student_id: studentId,
        category,
        body,
        page_path: pagePath,
        user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
      })
      .select("id, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, id: data.id, createdAt: data.created_at });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}
