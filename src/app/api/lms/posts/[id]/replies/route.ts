/**
 * 답글 목록 (서버 전용)
 * GET /api/lms/posts/[id]/replies
 *
 * 답글은 항상 원글 밑에 평평하게 붙는다. 비밀글의 답글은 원글 열람 권한을 그대로 따른다.
 */
import { NextResponse } from "next/server";
import { assertStudent, lmsErrorResponse } from "@/lib/auth/lms-api";
import {
  assertBoardAccess,
  canReadSecret,
  loadAuthorNames,
  loadPost,
  serializePost,
  type PostRow,
} from "@/lib/lms-posts";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType, role } = result;

    const post = await loadPost(admin, Number((await params).id));
    if (post instanceof NextResponse) return post;

    // 답글 id 로 들어와도 원글 기준으로 답글을 모아 준다
    const root = post.parent_id === null ? post : await loadPost(admin, post.parent_id);
    if (root instanceof NextResponse) return root;

    const access = await assertBoardAccess(admin, studentId, studentType, role, root.extracurricular_id);
    if (access instanceof NextResponse) return access;

    if (!canReadSecret(root, studentId, access.canManage)) {
      return NextResponse.json({ error: "작성자와 운영자만 볼 수 있는 비밀글입니다." }, { status: 403 });
    }

    // 삭제된 답글은 내려보내지 않는다. 원글과 달리 아래에 매달린 글이 없다.
    const { data, error } = await admin
      .from("extracurricular_posts")
      .select("*")
      .eq("parent_id", root.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const replies = (data ?? []) as PostRow[];
    const names = await loadAuthorNames(admin, replies);

    return NextResponse.json({
      postId: root.id,
      replies: replies.map((row) =>
        serializePost(row, {
          viewerId: studentId,
          canManage: access.canManage,
          authorName: names.get(row.student_id) ?? "",
        }),
      ),
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
