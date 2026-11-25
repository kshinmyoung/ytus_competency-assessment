/**
 * 역량진단 문항별 응답 내보내기 (서버 전용, SUPABASE_SERVICE_ROLE_KEY 사용)
 *
 * GET /api/admin/assessment/responses?type=<diagnosis_types.key>
 *
 * assessment_responses 의 RLS 는 '본인 또는 admin' 이다. 그래서 브라우저에서 바로 읽으면
 * 교수학습지원센터(ctl) 계정에는 빈 표가 보인다 — 오류도 없이 조용히 0건이 된다.
 * 사후 학습자 역량진단은 CTL 이 운영하는 도구라 받아 갈 수 있어야 해서,
 * 역할 확인을 서버에서 하고 service role 로 읽어 내려 준다.
 *
 * 문항은 진단 유형 하나로 좁혀서 준다. 다섯 진단의 응답이 한 파일에 섞이면
 * 문항번호(question_order)가 유형마다 1부터 다시 시작하기 때문에 구분이 되지 않는다.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 진단 응답을 받아 갈 수 있는 역할.
 * 센터 역할은 원래 역량진단 결과를 보지 않지만(설계서 3장), CTL 은 학습자 역량진단의
 * 운영 부서라 예외로 둔다. 취창업·상담센터는 그대로 막아 둔다.
 */
const ALLOWED_ROLES = ["admin", "ctl"];

/** PostgREST 는 한 번에 1000행까지만 준다. 핵심역량진단 응답이 이미 1,450건이다. */
const PAGE = 1000;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY 등 서버 환경 변수가 필요합니다.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function assertAllowed(request: Request): Promise<{ admin: SupabaseClient; role: string } | NextResponse> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "환경 변수 오류" }, { status: 500 });

  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user?.email) return NextResponse.json({ error: "유효하지 않은 세션입니다." }, { status: 401 });

  const studentId = user.email.replace(/@temp\.com$/i, "").trim();
  const admin = getAdminClient();
  const { data: row } = await admin.from("students").select("role").eq("student_id", studentId).maybeSingle();
  const role = (row?.role ?? "").trim().toLowerCase();
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: "진단 응답을 볼 수 있는 권한이 없습니다." }, { status: 403 });
  }
  return { admin, role };
}

async function fetchAll<T>(
  admin: SupabaseClient,
  table: string,
  columns: string,
  shape: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => typeof q,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await shape(admin.from(table).select(columns)).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

type QuestionRow = {
  id: number; competency_id: number; question_text: string;
  question_order: number; is_active: boolean; department_id: number | null;
};

export async function GET(request: Request) {
  try {
    const gate = await assertAllowed(request);
    if (gate instanceof NextResponse) return gate;
    const { admin } = gate;

    const typeKey = (new URL(request.url).searchParams.get("type") ?? "").trim();
    if (!typeKey) {
      return NextResponse.json({ error: "type 파라미터가 필요합니다." }, { status: 400 });
    }

    const { data: type } = await admin
      .from("diagnosis_types").select("key, label").eq("key", typeKey).maybeSingle();
    if (!type) return NextResponse.json({ error: "진단 유형을 찾을 수 없습니다." }, { status: 404 });

    const [questions, subs, depts] = await Promise.all([
      fetchAll<QuestionRow>(admin, "assessment_questions",
        "id, competency_id, question_text, question_order, is_active, department_id",
        (q) => q.eq("competency_type", typeKey).order("competency_id").order("question_order")),
      admin.from("diagnosis_subcategories")
        .select("id, name, sort_order, department_id").eq("diagnosis_type_key", typeKey),
      admin.from("departments").select("id, name"),
    ]);

    const deptName = new Map(((depts.data ?? []) as { id: number; name: string }[]).map((d) => [d.id, d.name]));

    /**
     * 문항의 competency_id 에는 하위 영역의 id 가 아니라 sort_order 가 들어 있다
     * (진단 문항 관리 화면이 그렇게 저장한다). id 로 찾으면 영역 이름이 비어 '2영역' 처럼 나온다.
     * 전공역량진단은 학과마다 같은 sort_order 를 쓰므로 학과까지 같은 것을 먼저 고른다.
     */
    const subList = (subs.data ?? []) as { id: number; name: string; sort_order: number; department_id: number | null }[];
    const subNameOf = (sortOrder: number, deptId: number | null) =>
      subList.find((s) => s.sort_order === sortOrder && s.department_id === deptId)?.name
      ?? subList.find((s) => s.sort_order === sortOrder)?.name
      ?? `${sortOrder}영역`;

    const questionMeta = questions.map((q) => {
      const area = subNameOf(q.competency_id, q.department_id);
      const dept = q.department_id ? deptName.get(q.department_id) ?? null : null;
      return {
        id: q.id,
        areaOrder: q.competency_id,
        areaName: dept ? `${dept} · ${area}` : area,
        order: q.question_order,
        /**
         * 문항번호는 영역마다 1번부터 다시 시작한다. 영역을 붙여야 한 문항을 가리킨다.
         * 전공역량진단은 학과마다 같은 영역·번호를 쓰므로 학과까지 넣어야 열 이름이 겹치지 않는다.
         */
        label: dept ? `${dept}·${area}-${q.question_order}` : `${area}-${q.question_order}`,
        text: q.question_text,
        isActive: q.is_active,
        department: dept,
      };
    });

    const questionIds = questions.map((q) => q.id);
    if (questionIds.length === 0) {
      return NextResponse.json({ type, questions: [], responses: [], students: [], excludedArchived: 0 });
    }

    const responses = await fetchAll<{ id: number; student_id: string; question_id: number; answer_value: number; answered_at: string }>(
      admin, "assessment_responses", "id, student_id, question_id, answer_value, answered_at",
      (q) => q.in("question_id", questionIds).order("student_id").order("answered_at"),
    );

    // 응답한 사람의 신상은 꼭 필요한 것만 — 학번·이름·학과·학년. 연락처는 내려보내지 않는다.
    const ids = [...new Set(responses.map((r) => r.student_id))];
    const people: { student_id: string; name: string | null; department_id: number | null; grade_year: number | null; student_type: string | null; archived_at: string | null }[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await admin.from("students")
        .select("student_id, name, department_id, grade_year, student_type, archived_at")
        .in("student_id", ids.slice(i, i + 200));
      people.push(...((data ?? []) as typeof people));
    }

    // 보관 계정(학번이 다른 사람에게 넘어가 숨겨 둔 행)의 응답은 명단에 섞이면 안 된다.
    const archived = new Set(people.filter((p) => p.archived_at).map((p) => p.student_id));
    const students = people
      .filter((p) => !p.archived_at)
      .map((p) => ({
        studentId: p.student_id,
        name: p.name,
        department: p.department_id ? deptName.get(p.department_id) ?? null : null,
        gradeYear: p.grade_year,
        studentType: p.student_type,
      }));

    return NextResponse.json({
      type,
      questions: questionMeta,
      students,
      responses: responses
        .filter((r) => !archived.has(r.student_id))
        .map((r) => ({
          studentId: r.student_id, questionId: r.question_id,
          value: r.answer_value, answeredAt: r.answered_at,
        })),
      excludedArchived: responses.filter((r) => archived.has(r.student_id)).length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}
