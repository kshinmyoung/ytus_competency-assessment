/**
 * 비교과 게시판 글 모아 보기 (서버 전용, admin)
 * GET /api/admin/board-posts?unanswered=1
 *
 * 게시판은 프로그램마다 따로 있어 관리자가 프로그램을 하나씩 열어야 보인다.
 * 그 탓에 학생 질문이 묻힌다. 전 프로그램의 글을 한 곳에 모아 준다.
 *
 * 답글 작성은 기존 /api/lms/posts/[id]/reply 가 그대로 맡는다.
 * 관리자는 assertBoardAccess 에서 신청 여부·수강 대상 검사를 건너뛴다.
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

async function assertAdmin(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ error: "환경 변수 오류" }, { status: 500 });

  const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
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
  return { admin };
}

export async function GET(request: Request) {
  try {
    const result = await assertAdmin(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const onlyUnanswered = new URL(request.url).searchParams.get("unanswered") === "1";

    const { data: posts, error } = await admin
      .from("extracurricular_posts")
      .select("id, extracurricular_id, parent_id, student_id, author_role, title, body, is_secret, deleted_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const all = posts ?? [];
    const roots = all.filter((p) => p.parent_id === null);

    // 답글 수는 원글 기준으로 센다. 삭제된 답글은 답한 것으로 보지 않는다.
    const replyCount = new Map<number, number>();
    const lastReplyAt = new Map<number, string>();
    for (const r of all) {
      if (r.parent_id === null || r.deleted_at) continue;
      replyCount.set(r.parent_id, (replyCount.get(r.parent_id) ?? 0) + 1);
      const prev = lastReplyAt.get(r.parent_id);
      if (!prev || r.created_at > prev) lastReplyAt.set(r.parent_id, r.created_at);
    }

    const programIds = [...new Set(roots.map((p) => p.extracurricular_id))];
    const { data: programs } = programIds.length
      ? await admin.from("extracurricular").select("id, name").in("id", programIds)
      : { data: [] as { id: number; name: string }[] };
    const programName = new Map((programs ?? []).map((p) => [p.id, p.name]));

    const authorIds = [...new Set(roots.map((p) => p.student_id))];
    const { data: people } = authorIds.length
      ? await admin.from("students").select("student_id, name").in("student_id", authorIds)
      : { data: [] as { student_id: string; name: string | null }[] };
    const authorName = new Map((people ?? []).map((p) => [p.student_id, p.name]));

    const rows = roots
      .map((p) => ({
        id: p.id,
        programId: p.extracurricular_id,
        programName: programName.get(p.extracurricular_id) ?? null,
        studentId: p.student_id,
        name: authorName.get(p.student_id) ?? null,
        authorRole: p.author_role,
        title: p.title,
        // 관리자는 비밀글도 그대로 본다. 묻힌 질문을 찾는 것이 이 화면의 목적이다.
        body: p.deleted_at ? "삭제된 글입니다." : p.body,
        isSecret: p.is_secret,
        deleted: Boolean(p.deleted_at),
        replyCount: replyCount.get(p.id) ?? 0,
        lastReplyAt: lastReplyAt.get(p.id) ?? null,
        createdAt: p.created_at,
      }))
      .filter((r) => (onlyUnanswered ? r.replyCount === 0 && !r.deleted : true));

    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}
