/**
 * 답글 작성 (서버 전용)
 * POST /api/lms/posts/[id]/reply  body: { body }
 *
 * parent_id 는 서버가 원글 id 로 고정한다. 답글에 답글을 달아도 깊이는 1 을 넘지 않는다.
 */
import { NextResponse } from "next/server";
import { assertStudent, lmsErrorResponse } from "@/lib/auth/lms-api";
import {
  assertBoardAccess,
  canReadSecret,
  loadAuthorNames,
  loadPost,
  POST_BODY_MAX,
  readPostText,
  serializePost,
  type PostRow,
} from "@/lib/lms-posts";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType, role } = result;

    const target = await loadPost(admin, Number((await params).id));
    if (target instanceof NextResponse) return target;

    // 답글에 단 답글도 원글 밑으로 보낸다
    const root = target.parent_id === null ? target : await loadPost(admin, target.parent_id);
    if (root instanceof NextResponse) return root;

    const access = await assertBoardAccess(admin, studentId, studentType, role, root.extracurricular_id);
    if (access instanceof NextResponse) return access;

    if (!canReadSecret(root, studentId, access.canManage)) {
      return NextResponse.json({ error: "작성자와 운영자만 볼 수 있는 비밀글입니다." }, { status: 403 });
    }
    if (root.deleted_at) {
      return NextResponse.json({ error: "삭제된 글에는 답글을 달 수 없습니다." }, { status: 400 });
    }

    const body = await request.json();
    const text = readPostText(body.body, POST_BODY_MAX, "내용");
    if (text instanceof NextResponse) return text;

    const { data, error } = await admin
      .from("extracurricular_posts")
      .insert({
        extracurricular_id: root.extracurricular_id,
        parent_id: root.id,
        student_id: studentId,
        author_role: role || "student",
        title: null,
        body: text,
        is_secret: false,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const names = await loadAuthorNames(admin, [data as PostRow]);
    return NextResponse.json({
      reply: serializePost(data as PostRow, {
        viewerId: studentId,
        canManage: access.canManage,
        authorName: names.get(studentId) ?? "",
      }),
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
