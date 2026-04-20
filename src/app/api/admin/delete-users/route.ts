/**
 * 졸업생 일괄 삭제 API
 * POST: { student_ids: string[] }
 * Auth 계정 + students 테이블 + 관련 데이터 모두 삭제
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("서버 환경 변수가 필요합니다.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: Request) {
  try {
    // 인증 확인
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await anon.auth.getUser(token);
    if (userError || !user?.email) {
      return NextResponse.json({ error: "유효하지 않은 세션입니다." }, { status: 401 });
    }

    const admin = getAdminClient();
    const callerStudentId = user.email.replace(/@temp\.com$/i, "").trim();
    const { data: roleRow } = await admin.from("students").select("role").eq("student_id", callerStudentId).maybeSingle();
    const role = (roleRow?.role ?? "").trim().toLowerCase();
    if (role !== "admin") {
      return NextResponse.json({ error: "관리자만 가능합니다." }, { status: 403 });
    }

    const body = await request.json();
    const studentIds: string[] = body.student_ids ?? [];
    if (studentIds.length === 0) {
      return NextResponse.json({ error: "삭제할 학번이 없습니다." }, { status: 400 });
    }

    const results: { student_id: string; success: boolean; error?: string }[] = [];

    for (const sid of studentIds) {
      try {
        // 1. Auth 계정 찾기
        const email = `${sid}@temp.com`;
        const { data: { users } } = await admin.auth.admin.listUsers();
        const authUser = users.find((u) => u.email === email);

        // 2. 관련 데이터 삭제 (CASCADE로 대부분 처리되지만 명시적으로)
        await admin.from("mentoring_groups").delete().or(`mentor_id.eq.${sid},student_id.eq.${sid}`);
        await admin.from("assessment_responses").delete().eq("student_id", sid);
        await admin.from("assessment_sessions").delete().eq("student_id", sid);
        await admin.from("student_extracurricular").delete().eq("student_id", sid);
        await admin.from("student_courses").delete().eq("student_id", sid);
        await admin.from("diagnosis_results").delete().eq("student_id", sid);

        // 3. students 테이블 삭제
        await admin.from("students").delete().eq("student_id", sid);

        // 4. Auth 계정 삭제
        if (authUser?.id) {
          await admin.auth.admin.deleteUser(authUser.id);
        }

        results.push({ student_id: sid, success: true });
      } catch (err: any) {
        results.push({ student_id: sid, success: false, error: err.message ?? "알 수 없는 오류" });
      }
    }

    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);

    return NextResponse.json({ success, failed: failed.length, errors: failed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
