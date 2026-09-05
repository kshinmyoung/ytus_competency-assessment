/**
 * 게시글 단건 수정·삭제 (서버 전용)
 * PATCH  /api/lms/posts/[id]  작성자 본인만
 * DELETE /api/lms/posts/[id]  작성자 본인 또는 LMS 관리 권한. 소프트 삭제
 *
 * 삭제는 deleted_at 만 세운다. 답글은 그대로 두고 원글만 '삭제된 글'로 보이게 한다.
 */
import { NextResponse } from "next/server";
import { assertStudent, lmsErrorResponse } from "@/lib/auth/lms-api";
import {
  assertBoardAccess,
  loadAuthorNames,
  loadPost,
  POST_BODY_MAX,
  POST_TITLE_MAX,
  readPostText,
  serializePost,
  type PostRow,
} from "@/lib/lms-posts";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType, role } = result;

    const post = await loadPost(admin, Number((await params).id));
    if (post instanceof NextResponse) return post;

    const access = await assertBoardAccess(admin, studentId, studentType, role, post.extracurricular_id);
    if (access instanceof NextResponse) return access;

    // 수정은 작성자 본인만. 관리 권한자도 남의 글 내용은 고치지 않는다.
    if (post.student_id !== studentId) {
      return NextResponse.json({ error: "본인이 작성한 글만 수정할 수 있습니다." }, { status: 403 });
    }
    if (post.deleted_at) {
      return NextResponse.json({ error: "삭제된 글은 수정할 수 없습니다." }, { status: 400 });
    }

    const body = await request.json();
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const text = readPostText(body.body, POST_BODY_MAX, "내용");
    if (text instanceof NextResponse) return text;
    payload.body = text;

    // 제목과 비밀글 여부는 원글에만 있다 (답글은 DB 제약으로 title NULL, is_secret false)
    if (post.parent_id === null) {
      if (body.title !== undefined) {
        const title = readPostText(body.title, POST_TITLE_MAX, "제목");
        if (title instanceof NextResponse) return title;
        payload.title = title;
      }
      if (typeof body.isSecret === "boolean") payload.is_secret = body.isSecret;
    }

    const { data, error } = await admin
      .from("extracurricular_posts")
      .update(payload)
      .eq("id", post.id)
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

export async function DELETE(request: Request, { params }: Params) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType, role } = result;

    const post = await loadPost(admin, Number((await params).id));
    if (post instanceof NextResponse) return post;

    const access = await assertBoardAccess(admin, studentId, studentType, role, post.extracurricular_id);
    if (access instanceof NextResponse) return access;

    if (post.student_id !== studentId && !access.canManage) {
      return NextResponse.json({ error: "본인이 작성한 글만 삭제할 수 있습니다." }, { status: 403 });
    }
    if (post.deleted_at) return NextResponse.json({ success: true });

    const now = new Date().toISOString();
    const { error } = await admin
      .from("extracurricular_posts")
      .update({ deleted_at: now, deleted_by: studentId, updated_at: now })
      .eq("id", post.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
