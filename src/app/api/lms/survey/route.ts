/**
 * 이수 설문 (서버 전용)
 * GET  /api/lms/survey?programId=   프로그램에 연결된 설문과 문항
 * POST /api/lms/survey              응답 저장 후 이수 확정까지 한 번에
 *
 * 설문은 기존 설문 시스템(surveys/survey_questions/survey_responses)을 그대로 쓴다.
 * 어떤 설문인지는 extracurricular.completion_rule 의 survey_id 가 정한다.
 * student_id 는 세션에서만 가져오고 요청 body 값을 신뢰하지 않는다.
 */
import { NextResponse } from "next/server";
import { assertStudent, audienceMatches, lmsErrorResponse, type LmsSession } from "@/lib/auth/lms-api";

type CompletionRule = { require_survey?: boolean; survey_id?: number | null };

type ProgramSurvey = {
  programId: number;
  surveyId: number;
};

/** 프로그램 접근 확인 + 연결된 설문 id. 설문이 없으면 null 을 돌려준다. */
async function resolveProgramSurvey(
  admin: LmsSession["admin"],
  studentId: string,
  studentType: string,
  programId: number,
): Promise<ProgramSurvey | null | NextResponse> {
  if (!programId) return NextResponse.json({ error: "programId가 필요합니다." }, { status: 400 });

  const { data: program, error } = await admin
    .from("extracurricular")
    .select("id, target_audience, is_active, completion_rule")
    .eq("id", programId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!program || !program.is_active) {
    return NextResponse.json({ error: "프로그램을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!audienceMatches(program.target_audience, studentType)) {
    return NextResponse.json({ error: "수강 대상이 아닌 프로그램입니다." }, { status: 403 });
  }

  const { data: enrollment } = await admin
    .from("student_extracurricular")
    .select("status")
    .eq("student_id", studentId)
    .eq("extracurricular_id", programId)
    .maybeSingle();
  if (!enrollment) {
    return NextResponse.json({ error: "신청하지 않은 프로그램입니다." }, { status: 403 });
  }

  const rule = (program.completion_rule ?? {}) as CompletionRule;
  if (!rule.require_survey || !rule.survey_id) return null;
  return { programId, surveyId: rule.survey_id };
}

export async function GET(request: Request) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType } = result;

    const { searchParams } = new URL(request.url);
    const programId = Number(searchParams.get("programId"));

    const resolved = await resolveProgramSurvey(admin, studentId, studentType, programId);
    if (resolved instanceof NextResponse) return resolved;
    if (!resolved) return NextResponse.json({ surveyId: null, questions: [] });

    const [surveyRes, questionRes, responseRes] = await Promise.all([
      admin.from("surveys").select("id, title, description").eq("id", resolved.surveyId).maybeSingle(),
      admin.from("survey_questions").select("*").eq("survey_id", resolved.surveyId).order("question_order").order("id"),
      admin.from("survey_responses").select("id").eq("survey_id", resolved.surveyId).eq("student_id", studentId).maybeSingle(),
    ]);

    if (!surveyRes.data) {
      return NextResponse.json({ error: "연결된 설문을 찾을 수 없습니다. 담당자에게 문의해 주세요." }, { status: 404 });
    }

    return NextResponse.json({
      surveyId: surveyRes.data.id,
      title: surveyRes.data.title,
      description: surveyRes.data.description,
      submitted: Boolean(responseRes.data),
      questions: (questionRes.data ?? []).map((q) => ({
        id: q.id,
        text: q.question_text,
        type: q.question_type ?? "text",
        options: q.options,
        order: q.question_order ?? 0,
        required: q.is_required ?? false,
      })),
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, studentType } = result;

    const body = await request.json();
    const programId = Number(body.programId);

    const resolved = await resolveProgramSurvey(admin, studentId, studentType, programId);
    if (resolved instanceof NextResponse) return resolved;
    if (!resolved) return NextResponse.json({ error: "이 프로그램에는 이수 설문이 없습니다." }, { status: 400 });

    const answers = (body.answers ?? {}) as Record<string, unknown>;

    // 필수 문항 확인. 화면에서 막고 있지만 서버에서도 확인한다.
    const { data: questions, error: qError } = await admin
      .from("survey_questions")
      .select("id, question_text, is_required")
      .eq("survey_id", resolved.surveyId);
    if (qError) return NextResponse.json({ error: qError.message }, { status: 500 });

    const missing = (questions ?? []).filter((q) => {
      if (!q.is_required) return false;
      const v = answers[String(q.id)];
      return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
    });
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `필수 문항 ${missing.length}개에 답해 주세요.` },
        { status: 400 },
      );
    }

    // 이미 응답한 설문이면 그대로 둔다 (survey_id + student_id 유니크).
    // 설문 마일리지는 여기서 지급하지 않는다. 영상형 비교과의 마일리지는 이수 확정 한 곳에서만 지급한다.
    const { data: already } = await admin
      .from("survey_responses")
      .select("id")
      .eq("survey_id", resolved.surveyId)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!already) {
      const { error: insertError } = await admin.from("survey_responses").insert({
        survey_id: resolved.surveyId,
        student_id: studentId,
        answers,
      });
      // 같은 순간에 두 번 제출된 경우(23505)는 이미 저장된 것으로 본다
      if (insertError && insertError.code !== "23505") {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }
    }

    // 설문까지 끝났으므로 이수 판정을 다시 돌린다
    const { data: completion, error: rpcError } = await admin.rpc("lms_finalize_completion", {
      p_student_id: studentId,
      p_program_id: programId,
    });
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });

    const payload = completion as Record<string, unknown>;
    if (studentType !== "domestic") delete payload.mileage_granted;

    return NextResponse.json({ submitted: true, completion: payload });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
