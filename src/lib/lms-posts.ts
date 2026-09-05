/**
 * 비교과 게시판 공통 로직 (서버 전용)
 *
 * 게시판 테이블은 따로 없다. extracurricular_posts 를 extracurricular_id 로 묶은 것이 게시판이다.
 * 라우트 네 개가 같은 접근 판정과 비밀글 마스킹 규칙을 쓰므로 여기에 모은다.
 * student_id 는 항상 세션에서 온 값을 넘긴다. 요청 body 값을 신뢰하지 않는다.
 */
import { NextResponse } from "next/server";
import { audienceMatches, type LmsSession } from "@/lib/auth/lms-api";
import { canManageLms } from "@/lib/auth/lms-permissions";

type Admin = LmsSession["admin"];

export const POST_TITLE_MAX = 100;
export const POST_BODY_MAX = 2000;

const SECRET_BODY = "비밀글입니다.";
const DELETED_TITLE = "삭제된 글입니다.";
const DELETED_BODY = "삭제된 글입니다.";

export type PostRow = {
  id: number;
  extracurricular_id: number;
  parent_id: number | null;
  student_id: string;
  author_role: string;
  title: string | null;
  body: string;
  is_secret: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BoardAccess = {
  program: { id: number; name: string };
  enrolled: boolean;
  canManage: boolean;
};

/**
 * 게시판 접근 판정.
 * 학생은 수강 대상이면서 신청까지 한 경우에만 통과한다. LMS 관리 권한자는 신청 없이 통과한다.
 */
export async function assertBoardAccess(
  admin: Admin,
  studentId: string,
  studentType: string,
  role: string,
  programId: number,
): Promise<BoardAccess | NextResponse> {
  if (!programId) {
    return NextResponse.json({ error: "programId가 필요합니다." }, { status: 400 });
  }

  const canManage = canManageLms(role);

  const { data: program, error } = await admin
    .from("extracurricular")
    .select("id, name, target_audience, is_active")
    .eq("id", programId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 비활성 프로그램은 학생에게 숨기되, 운영 확인이 필요한 관리자에게는 남겨둔다.
  if (!program || (!program.is_active && !canManage)) {
    return NextResponse.json({ error: "프로그램을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: enrollment } = await admin
    .from("student_extracurricular")
    .select("status")
    .eq("student_id", studentId)
    .eq("extracurricular_id", programId)
    .maybeSingle();
  const enrolled = Boolean(enrollment);

  if (!canManage) {
    if (!audienceMatches(program.target_audience, studentType)) {
      return NextResponse.json({ error: "수강 대상이 아닌 프로그램입니다." }, { status: 403 });
    }
    if (!enrolled) {
      return NextResponse.json({ error: "신청한 학생만 이용할 수 있는 게시판입니다." }, { status: 403 });
    }
  }

  return { program: { id: program.id, name: program.name }, enrolled, canManage };
}

/** 원글 하나를 읽고 게시판 접근까지 확인한다. 답글 id 를 받으면 그 원글을 돌려준다. */
export async function loadPost(admin: Admin, postId: number): Promise<PostRow | NextResponse> {
  if (!postId) return NextResponse.json({ error: "잘못된 글 ID 입니다." }, { status: 400 });
  const { data, error } = await admin
    .from("extracurricular_posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });
  return data as PostRow;
}

/** 비밀글 열람 가능 여부. 작성자 본인과 LMS 관리 권한자만 원문을 본다. */
export function canReadSecret(root: PostRow, viewerId: string, canManage: boolean): boolean {
  return !root.is_secret || root.student_id === viewerId || canManage;
}

/** 공백 정리 후 길이 확인. 비었거나 한도를 넘으면 그대로 내려보낼 에러 응답을 돌려준다. */
export function readPostText(raw: unknown, max: number, label: string): string | NextResponse {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return NextResponse.json({ error: `${label}을 입력해 주세요.` }, { status: 400 });
  }
  if (value.length > max) {
    return NextResponse.json({ error: `${label}은 ${max}자까지 입력할 수 있습니다.` }, { status: 400 });
  }
  return value;
}

export type SerializedPost = {
  id: number;
  parentId: number | null;
  title: string | null;
  body: string;
  isSecret: boolean;
  masked: boolean;
  deleted: boolean;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  authorName: string;
  authorRole: string;
  isManagerPost: boolean;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * 응답 직렬화. 마스킹은 여기서만 한다.
 * 삭제된 글은 제목·본문을 대체 문구로 바꾸고, 비밀글은 본문만 가린다.
 */
export function serializePost(
  row: PostRow,
  opts: { viewerId: string; canManage: boolean; authorName: string; replyCount?: number },
): SerializedPost {
  const deleted = Boolean(row.deleted_at);
  const isMine = row.student_id === opts.viewerId;
  const masked = row.is_secret && !deleted && !isMine && !opts.canManage;

  return {
    id: row.id,
    parentId: row.parent_id,
    title: deleted ? DELETED_TITLE : row.title,
    body: deleted ? DELETED_BODY : masked ? SECRET_BODY : row.body,
    isSecret: row.is_secret,
    masked,
    deleted,
    isMine,
    canEdit: isMine && !deleted,
    canDelete: (isMine || opts.canManage) && !deleted,
    authorName: opts.authorName,
    authorRole: row.author_role,
    isManagerPost: canManageLms(row.author_role),
    replyCount: opts.replyCount ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 작성자 학번 → 이름. 학생 목록을 한 번에 읽어 라우트마다 반복 조회하지 않는다. */
export async function loadAuthorNames(admin: Admin, rows: PostRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.student_id))];
  if (ids.length === 0) return new Map();
  const { data } = await admin.from("students").select("student_id, name").in("student_id", ids);
  return new Map((data ?? []).map((s) => [s.student_id as string, (s.name as string) ?? ""]));
}
