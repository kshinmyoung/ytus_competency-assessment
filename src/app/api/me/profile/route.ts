/**
 * 본인 프로필 (서버 전용)
 * GET  /api/me/profile  — 내 정보 조회
 * PATCH /api/me/profile — 연락처·이메일 수정
 *
 * student_id 는 항상 Bearer 토큰에서 가져온다. 요청 body 의 학번은 믿지 않는다.
 * 학번·이름·학과·학년은 학사 자료라 본인이 못 고친다. 틀렸으면 학사팀을 거쳐야 한다.
 * 비밀번호는 Auth 에서 바꿔야 하므로 /api/auth/change-password 가 따로 맡는다.
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 등 서버 환경 변수가 필요합니다.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStudentId(request: Request): Promise<string | NextResponse> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: "환경 변수 오류" }, { status: 500 });
  }
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user?.email) {
    return NextResponse.json({ error: "유효하지 않은 세션입니다." }, { status: 401 });
  }
  return user.email.replace(/@temp\.com$/i, "").trim();
}

export async function GET(request: Request) {
  try {
    const studentId = await resolveStudentId(request);
    if (studentId instanceof NextResponse) return studentId;

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("students")
      .select("student_id, name, phone, email, grade_year, student_type, department_id, archived_at")
      .eq("student_id", studentId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.archived_at) {
      return NextResponse.json({ error: "계정 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const { data: dept } = data.department_id
      ? await admin.from("departments").select("name").eq("id", data.department_id).maybeSingle()
      : { data: null };

    return NextResponse.json({
      studentId: data.student_id,
      name: data.name,
      phone: data.phone,
      email: data.email,
      gradeYear: data.grade_year,
      studentType: data.student_type,
      departmentName: dept?.name ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const studentId = await resolveStudentId(request);
    if (studentId instanceof NextResponse) return studentId;

    const body = await request.json();
    const patch: Record<string, string | null> = {};

    if ("phone" in body) {
      const raw = typeof body.phone === "string" ? body.phone.trim() : "";
      if (raw) {
        const digits = raw.replace(/\D/g, "");
        if (digits.length < 10 || digits.length > 11) {
          return NextResponse.json({ error: "휴대전화 번호를 다시 확인해 주세요." }, { status: 400 });
        }
        // 저장은 하이픈 있는 형태로 통일한다. 명단에서 들어온 값과 모양이 같아야 비교가 된다.
        patch.phone = digits.length === 11
          ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
          : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      } else {
        patch.phone = null;
      }
    }

    if ("email" in body) {
      const raw = typeof body.email === "string" ? body.email.trim() : "";
      if (raw) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) || raw.length > 254) {
          return NextResponse.json({ error: "이메일 주소를 다시 확인해 주세요." }, { status: 400 });
        }
        // 로그인 계정은 {학번}@temp.com 이다. 연락용 이메일로 그 형식을 받지 않는다.
        if (/@temp\.com$/i.test(raw)) {
          return NextResponse.json({ error: "연락받을 이메일 주소를 입력해 주세요." }, { status: 400 });
        }
        patch.email = raw;
      } else {
        patch.email = null;
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "수정할 내용이 없습니다." }, { status: 400 });
    }

    const admin = getAdminClient();
    // 보관 계정은 로그인 대상이 아니지만, 혹시라도 걸리면 쓰지 못하게 막는다
    const { data, error } = await admin
      .from("students")
      .update(patch)
      .eq("student_id", studentId)
      .is("archived_at", null)
      .select("phone, email")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "계정 정보를 찾을 수 없습니다." }, { status: 404 });

    return NextResponse.json({ success: true, phone: data.phone, email: data.email });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}
