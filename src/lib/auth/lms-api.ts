/**
 * LMS 관리자 API 공통 인증 (서버 전용)
 *
 * 기존 관리자 Route Handler 의 assertAdmin 패턴을 그대로 따르되,
 * admin 고정 비교 대신 canManageLms / canViewLmsProgress 로 판정한다.
 * SUPABASE_SERVICE_ROLE_KEY 는 이 파일 안에서만 쓰인다.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { canManageLms, canViewLmsProgress } from "@/lib/auth/lms-permissions";
import { CloudflareError } from "@/lib/cloudflare-stream";

/**
 * catch 블록 공통 응답.
 * 잘못된 UID 처럼 담당자가 고칠 수 있는 Cloudflare 4xx 는 400 으로 내려보내고,
 * 나머지는 500 으로 둔다.
 */
export function lmsErrorResponse(e: unknown) {
  if (e instanceof CloudflareError && e.status >= 400 && e.status < 500) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  const message = e instanceof Error ? e.message : "알 수 없는 오류";
  return NextResponse.json({ error: message }, { status: 500 });
}

export function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 등 서버 환경 변수가 필요합니다.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type LmsSession = {
  admin: ReturnType<typeof getAdminClient>;
  studentId: string;
  role: string;
};

/** Bearer 토큰에서 학번과 role 을 확보한다. 요청 body 의 값은 신뢰하지 않는다. */
async function resolveSession(request: Request): Promise<LmsSession | NextResponse> {
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
  const { data: roleRow } = await admin
    .from("students")
    .select("role")
    .eq("student_id", studentId)
    .maybeSingle();
  const role = (roleRow?.role ?? "").trim().toLowerCase();
  return { admin, studentId, role };
}

/** 프로그램·콘텐츠 관리 권한 확인 */
export async function assertLmsManager(request: Request): Promise<LmsSession | NextResponse> {
  const session = await resolveSession(request);
  if (session instanceof NextResponse) return session;
  if (!canManageLms(session.role)) {
    return NextResponse.json({ error: "LMS 관리 권한이 없습니다." }, { status: 403 });
  }
  return session;
}

/** 진도 현황 조회 권한 확인 */
export async function assertLmsViewer(request: Request): Promise<LmsSession | NextResponse> {
  const session = await resolveSession(request);
  if (session instanceof NextResponse) return session;
  if (!canViewLmsProgress(session.role)) {
    return NextResponse.json({ error: "LMS 조회 권한이 없습니다." }, { status: 403 });
  }
  return session;
}

export type StudentSession = LmsSession & { studentType: string };

/**
 * 학생 본인 세션 확인.
 * student_id 는 항상 여기서 나온 값을 쓰고 요청 body 값은 신뢰하지 않는다.
 */
export async function assertStudent(request: Request): Promise<StudentSession | NextResponse> {
  const session = await resolveSession(request);
  if (session instanceof NextResponse) return session;

  const { data: row } = await session.admin
    .from("students")
    .select("student_type")
    .eq("student_id", session.studentId)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "학생 정보를 찾을 수 없습니다." }, { status: 403 });
  }
  return { ...session, studentType: (row.student_type ?? "domestic").trim() };
}

/** 프로그램 대상(target_audience)과 학생 유형이 맞는지 */
export function audienceMatches(targetAudience: string, studentType: string): boolean {
  return targetAudience === "all" || targetAudience === studentType;
}

export type ContentAccess = {
  content: { id: number; source_ref: string; extracurricular_id: number; title: string; duration_sec: number };
  programId: number;
};

/**
 * 설계서 8.3 의 검증 순서 — 재생·진도 기록 양쪽에서 동일하게 쓴다.
 *   1) 콘텐츠·프로그램 존재  2) 신청 여부  3) 대상 일치
 * student_id 는 반드시 세션에서 온 값을 넘긴다.
 */
export async function assertContentAccess(
  admin: ReturnType<typeof getAdminClient>,
  studentId: string,
  studentType: string,
  contentId: number,
): Promise<ContentAccess | NextResponse> {
  const { data: content, error } = await admin
    .from("extracurricular_contents")
    .select("id, source_ref, extracurricular_id, title, duration_sec")
    .eq("id", contentId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!content) return NextResponse.json({ error: "콘텐츠를 찾을 수 없습니다." }, { status: 404 });

  const { data: program } = await admin
    .from("extracurricular")
    .select("id, target_audience, is_active")
    .eq("id", content.extracurricular_id)
    .maybeSingle();
  if (!program || !program.is_active) {
    return NextResponse.json({ error: "프로그램을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: enrollment } = await admin
    .from("student_extracurricular")
    .select("status")
    .eq("student_id", studentId)
    .eq("extracurricular_id", program.id)
    .maybeSingle();
  if (!enrollment) {
    return NextResponse.json({ error: "신청하지 않은 프로그램입니다." }, { status: 403 });
  }

  if (!audienceMatches(program.target_audience, studentType)) {
    return NextResponse.json({ error: "수강 대상이 아닌 프로그램입니다." }, { status: 403 });
  }

  return { content, programId: program.id };
}

/** 설계서 7장 — 진도 데이터로부터 학습 상태를 파생한다. DB status 는 건드리지 않는다. */
export function deriveStatus(hasCompletion: boolean, watchedSec: number): "신청" | "학습중" | "이수완료" {
  if (hasCompletion) return "이수완료";
  if (watchedSec > 0) return "학습중";
  return "신청";
}
