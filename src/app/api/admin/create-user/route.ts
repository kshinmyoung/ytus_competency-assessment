/**
 * 관리자용 사용자 생성 API (서버 전용)
 * - .env.local의 SUPABASE_SERVICE_ROLE_KEY를 사용해 관리자 전용 클라이언트 생성 (Next.js가 서버에서 자동 로드)
 * - 이 키는 process.env에서만 참조되므로 클라이언트 번들에 노출되지 않음.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { findAuthUserIdByEmail } from "@/lib/auth/admin-users";

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
    const role = typeof body.role === "string" ? body.role.trim() : "student";
    const department_id = typeof body.department_id === "number" ? body.department_id : null;
    const grade_year = typeof body.grade_year === "number" ? body.grade_year : null;
    const admission_year = typeof body.admission_year === "number" ? body.admission_year : null;
    const phone = typeof body.phone === "string" ? body.phone.trim() : null;
    const email_field = typeof body.email === "string" ? body.email.trim() : null;
    // 이미 있는 계정의 비밀번호는 건드리지 않는다. CSV 를 다시 올렸다고 해서
    // 본인이 바꾼 비밀번호가 초기값으로 되돌아가면 안 된다.
    // 관리자가 한 명을 콕 집어 초기화할 때만 true 로 보낸다.
    const resetPassword = body.resetPassword === true;

    if (!student_id || !password) {
      return NextResponse.json(
        { error: "학번과 비밀번호는 필수입니다." },
        { status: 400 }
      );
    }

    const email = `${student_id}@temp.com`;

    // 1단계: Auth 계정 생성. 이미 있으면 그대로 두고 프로필만 갱신한다.
    let existed = false;
    let passwordReset = false;
    const { error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes("already been registered")) {
        const existingId = await findAuthUserIdByEmail(admin, email);
        if (existingId) {
          existed = true;
          // 명시적으로 요청했을 때만 비밀번호를 초기화한다
          if (resetPassword) {
            const { error: resetError } = await admin.auth.admin.updateUserById(existingId, { password });
            if (resetError) {
              return NextResponse.json({ error: "비밀번호 초기화 실패: " + resetError.message, step: "auth" }, { status: 400 });
            }
            passwordReset = true;
          }
        } else {
          return NextResponse.json({ error: "기존 Auth 계정을 찾을 수 없습니다.", step: "auth" }, { status: 400 });
        }
      } else {
        console.error("[create-user] Auth 생성 실패:", authError.message, { student_id, email });
        return NextResponse.json({ error: "Auth 계정 생성 실패: " + authError.message, step: "auth" }, { status: 400 });
      }
    }

    // 2단계: students 테이블에 upsert (기존이면 업데이트)
    const payload: Record<string, unknown> = {
      student_id,
      name: name || null,
      role: role || "student",
    };
    // students.password 는 초기 비밀번호 사본이다. 실제 비밀번호를 바꿀 때만 같이 쓴다.
    // 그냥 덮어쓰면 본인이 바꾼 계정의 사본이 초기값으로 되살아나 관리자를 헷갈리게 한다.
    if (!existed || passwordReset) payload.password = password;
    if (department_id !== null) payload.department_id = department_id;
    if (grade_year !== null) payload.grade_year = grade_year;
    if (admission_year !== null) payload.admission_year = admission_year;
    if (phone) payload.phone = phone;
    if (email_field) payload.email = email_field;

    const { error: upsertError } = await admin.from("students").upsert(payload, { onConflict: "student_id" });

    if (upsertError) {
      console.error("[create-user] DB 저장 실패:", upsertError.message, { student_id });
      return NextResponse.json(
        { error: "students 테이블 저장 실패: " + upsertError.message, step: "db" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      student_id,
      email,
      existed,
      passwordReset,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    console.error("[create-user] 예외:", e);
    return NextResponse.json({ error: message, step: "server" }, { status: 500 });
  }
}
