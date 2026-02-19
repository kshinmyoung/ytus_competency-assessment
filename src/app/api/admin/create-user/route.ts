/**
 * 관리자용 사용자 생성 API (서버 전용)
 * - .env.local의 SUPABASE_SERVICE_ROLE_KEY를 사용해 관리자 전용 클라이언트 생성 (Next.js가 서버에서 자동 로드)
 * - 이 키는 process.env에서만 참조되므로 클라이언트 번들에 노출되지 않음.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "서버 환경 변수 확인: .env.local에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 설정되어 있어야 합니다."
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  try {
    const admin = getAdminClient();
    const body = await request.json();
    const student_id = typeof body.student_id === "string" ? body.student_id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!student_id || !password) {
      return NextResponse.json(
        { error: "학번과 비밀번호는 필수입니다." },
        { status: 400 }
      );
    }

    const email = `${student_id}@temp.com`;

    // 1단계: 실제 로그인 계정 생성 (Authentication > Users에 계정 생성)
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      console.error("[create-user] Auth 생성 실패:", authError.message, { student_id, email });
      return NextResponse.json(
        { error: "Auth 계정 생성 실패: " + authError.message, step: "auth" },
        { status: 400 }
      );
    }

    // 2단계: 보안 — Auth 계정 생성이 성공했을 때만 students 테이블에 저장
    const { error: insertError } = await admin.from("students").insert({
      student_id,
      password,
      name: name || null,
      role: "student",
    });

    if (insertError) {
      console.error("[create-user] DB 저장 실패:", insertError.message, { student_id });
      if (authUser.user?.id) {
        await admin.auth.admin.deleteUser(authUser.user.id);
        console.error("[create-user] Auth 사용자 롤백 삭제 완료:", authUser.user.id);
      }
      return NextResponse.json(
        { error: "students 테이블 저장 실패: " + insertError.message, step: "db" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      student_id,
      email: authUser.user?.email ?? email,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    console.error("[create-user] 예외:", e);
    return NextResponse.json({ error: message, step: "server" }, { status: 500 });
  }
}
