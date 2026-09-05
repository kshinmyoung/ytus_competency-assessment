/**
 * 비교과 게시판 목록·작성 (서버 전용)
 * GET  /api/lms/posts?programId=&page=&size=  원글 최신순 + 답글 개수
 * POST /api/lms/posts                          원글 작성
 *
 * 게시판 자체는 프로그램에 딸려 있으므로 별도 생성 절차가 없다.
 * 신청하지 않은 학생과 미인증 요청은 assertStudent / assertBoardAccess 에서 걸린다.
 */
import { NextResponse } from "next/server";
import { assertStudent, lmsErrorResponse } from "@/lib/auth/lms-api";
import {
  assertBoardAccess,
  loadAuthorNames,
  POST_BODY_MAX,
  POST_TITLE_MAX,
  readPostText,
  serializePost,
  type PostRow,
} from "@/lib/lms-posts";

const DEFAULT_SIZE = 20;
const MAX_SIZE = 50;

export async function GET(request: Request) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType, role } = result;

    const { searchParams } = new URL(request.url);
    const programId = Number(searchParams.get("programId"));

    const access = await assertBoardAccess(admin, studentId, studentType, role, programId);
    if (access instanceof NextResponse) return access;

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const size = Math.min(MAX_SIZE, Math.max(1, Number(searchParams.get("size")) || DEFAULT_SIZE));
    const from = (page - 1) * size;

    // 삭제된 원글도 목록에 남긴다. 답글이 달린 글을 통째로 감추면 맥락이 끊긴다.
    const { data, error, count } = await admin
      .from("extracurricular_posts")
      .select("*", { count: "exact" })
      .eq("extracurricular_id", programId)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .range(from, from + size - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const roots = (data ?? []) as PostRow[];

    // 답글 개수는 살아 있는 답글만 센다
    const rootIds = roots.map((r) => r.id);
    const { data: replyRows } = rootIds.length
      ? await admin
          .from("extracurricular_posts")
          .select("parent_id")
          .in("parent_id", rootIds)
          .is("deleted_at", null)
      : { data: [] as { parent_id: number }[] };

    const replyCounts = new Map<number, number>();
    for (const r of replyRows ?? []) {
      replyCounts.set(r.parent_id, (replyCounts.get(r.parent_id) ?? 0) + 1);
    }

    const names = await loadAuthorNames(admin, roots);

    return NextResponse.json({
      program: access.program,
      canManage: access.canManage,
      page,
      size,
      total: count ?? 0,
      posts: roots.map((row) =>
        serializePost(row, {
          viewerId: studentId,
          canManage: access.canManage,
          authorName: names.get(row.student_id) ?? "",
          replyCount: replyCounts.get(row.id) ?? 0,
        }),
      ),
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType, role } = result;

    const body = await request.json();
    const programId = Number(body.programId);

    const access = await assertBoardAccess(admin, studentId, studentType, role, programId);
    if (access instanceof NextResponse) return access;

    const title = readPostText(body.title, POST_TITLE_MAX, "제목");
    if (title instanceof NextResponse) return title;
    const text = readPostText(body.body, POST_BODY_MAX, "내용");
    if (text instanceof NextResponse) return text;

    const { data, error } = await admin
      .from("extracurricular_posts")
      .insert({
        extracurricular_id: programId,
        parent_id: null,
        student_id: studentId,
        author_role: role || "student",
        title,
        body: text,
        is_secret: body.isSecret === true,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const names = await loadAuthorNames(admin, [data as PostRow]);
    return NextResponse.json({
      post: serializePost(data as PostRow, {
        viewerId: studentId,
        canManage: access.canManage,
        authorName: names.get(studentId) ?? "",
      }),
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
