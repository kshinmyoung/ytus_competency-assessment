/**
 * 본인 비밀번호 변경 (서버 전용)
 * POST /api/auth/change-password  body: { studentId, currentPassword, newPassword }
 *
 * 로그인은 Supabase Auth 가 처리한다. 그래서 비밀번호도 Auth 에서 바꿔야 한다.
 * students.password 만 고치면 화면에는 성공으로 보여도 로그인 비밀번호는 예전 그대로다.
 *
 * 현재 비밀번호 확인은 Auth 로그인으로 한다. students.password 와 비교하지 않는다.
 * 그 값은 발급 당시의 초기 비밀번호 사본일 뿐이라 실제 로그인 비밀번호와 다를 수 있다.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const MIN_LENGTH = 8;
const MAX_LENGTH = 72; // bcrypt 한도

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ error: "서버 환경 변수 오류" }, { status: 500 });
    }

    const body = await request.json();
    const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
    // 비밀번호는 공백도 값이므로 trim 하지 않는다
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!studentId || !currentPassword || !newPassword) {
      return NextResponse.json({ error: "학번과 비밀번호를 모두 입력해 주세요." }, { status: 400 });
    }
    if (newPassword.length < MIN_LENGTH || newPassword.length > MAX_LENGTH) {
      return NextResponse.json(
        { error: `새 비밀번호는 ${MIN_LENGTH}자 이상 ${MAX_LENGTH}자 이하로 입력해 주세요.` },
        { status: 400 },
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json({ error: "새 비밀번호가 현재 비밀번호와 같습니다." }, { status: 400 });
    }

    // 1단계: 현재 비밀번호로 실제 로그인해 본인 확인. 로그아웃 상태에서도 쓸 수 있다.
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const email = `${studentId}@temp.com`;
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInError || !signIn.user) {
      return NextResponse.json(
        { error: "학번 또는 현재 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      );
    }

    // 2단계: Auth 비밀번호 변경
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: updateError } = await admin.auth.admin.updateUserById(signIn.user.id, {
      password: newPassword,
    });
    if (updateError) {
      console.error("[change-password] Auth 변경 실패:", updateError.message, { studentId });
      return NextResponse.json({ error: "비밀번호를 변경하지 못했습니다." }, { status: 400 });
    }

    // 3단계: students.password 는 초기 비밀번호 사본이다.
    // 본인이 바꾼 비밀번호를 평문으로 남기지 않고 비워, 관리자 화면에서 '본인 변경'으로 보이게 한다.
    const { error: mirrorError } = await admin
      .from("students")
      .update({ password: null })
      .eq("student_id", studentId);
    if (mirrorError) {
      // 비밀번호 자체는 이미 바뀌었다. 사본 정리 실패로 실패 응답을 주면 안 된다.
      console.error("[change-password] students.password 정리 실패:", mirrorError.message, { studentId });
    }

    // 4단계: 예전 비밀번호로 열려 있던 세션을 모두 끊는다
    const { error: signOutError } = await anon.auth.signOut({ scope: "global" });
    if (signOutError) {
      console.error("[change-password] 기존 세션 정리 실패:", signOutError.message, { studentId });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    console.error("[change-password] 예외:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
