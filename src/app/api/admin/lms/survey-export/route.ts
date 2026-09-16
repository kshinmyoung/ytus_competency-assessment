/**
 * 이수 설문 결과 내보내기 (서버 전용)
 * GET /api/admin/lms/survey-export?programId=1
 *
 * 진도 내보내기와 같은 방식으로 행 배열(JSON)만 만들고 파일 생성은 클라이언트가 한다.
 * 수강생 전원을 담는다. 미제출자도 행으로 남겨야 누가 안 냈는지 보인다.
 */
import { NextResponse } from "next/server";
import { assertLmsViewer, lmsErrorResponse } from "@/lib/auth/lms-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { domestic: "내국인", international: "유학생" };

/** 설문 화면과 동일한 5점 척도 문구 */
const LIKERT = ["전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다"];

function formatAnswer(type: string | null, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (type === "likert") {
    const n = Number(value);
    return Number.isFinite(n) ? `${n}(${LIKERT[n - 1] ?? ""})` : String(value);
  }
  return String(value);
}

export async function GET(request: Request) {
  try {
    const result = await assertLmsViewer(request);
    if (result instanceof NextResponse) return result;
    const { admin } = result;

    const { searchParams } = new URL(request.url);
    const programId = Number(searchParams.get("programId"));
    if (!programId) return NextResponse.json({ error: "programId가 필요합니다." }, { status: 400 });

    const { data: program } = await admin
      .from("extracurricular")
      .select("id, name, completion_rule")
      .eq("id", programId)
      .maybeSingle();
    if (!program) return NextResponse.json({ error: "프로그램을 찾을 수 없습니다." }, { status: 404 });

    const rule = (program.completion_rule ?? {}) as { require_survey?: boolean; survey_id?: number | null };
    const surveyId = rule.require_survey ? rule.survey_id ?? null : null;
    if (!surveyId) {
      return NextResponse.json({ programName: program.name, surveyLinked: false, rows: [] });
    }

    const [{ data: survey }, { data: questions }, { data: enrollments }] = await Promise.all([
      admin.from("surveys").select("id, title").eq("id", surveyId).maybeSingle(),
      admin.from("survey_questions").select("id, question_text, question_type, question_order")
        .eq("survey_id", surveyId).order("question_order").order("id"),
      admin.from("student_extracurricular").select("student_id, created_at").eq("extracurricular_id", programId),
    ]);

    const questionList = questions ?? [];
    const studentIds = (enrollments ?? []).map((e) => e.student_id);
    if (studentIds.length === 0) {
      return NextResponse.json({
        programName: program.name,
        surveyLinked: true,
        surveyTitle: survey?.title ?? "",
        rows: [],
      });
    }

    const [{ data: students }, { data: responses }, { data: completions }, { data: departments }] = await Promise.all([
      admin.from("students").select("student_id, name, student_type, department_id").in("student_id", studentIds),
      admin.from("survey_responses").select("student_id, answers, submitted_at").eq("survey_id", surveyId).in("student_id", studentIds),
      admin.from("extracurricular_completions").select("student_id, completed_at, revoked_at").eq("extracurricular_id", programId),
      admin.from("departments").select("id, name"),
    ]);

    const studentById = new Map((students ?? []).map((s) => [s.student_id, s]));
    const responseByStudent = new Map((responses ?? []).map((r) => [r.student_id, r]));
    const completionByStudent = new Map((completions ?? []).map((c) => [c.student_id, c]));
    const deptById = new Map((departments ?? []).map((d) => [d.id, d.name]));

    const rows = (enrollments ?? []).map((e) => {
      const s = studentById.get(e.student_id);
      const response = responseByStudent.get(e.student_id);
      const completion = completionByStudent.get(e.student_id);
      const answers = (response?.answers ?? {}) as Record<string, unknown>;

      const row: Record<string, unknown> = {
        학번: e.student_id,
        이름: s?.name ?? "",
        학과: s?.department_id ? deptById.get(s.department_id) ?? "" : "",
        학생유형: TYPE_LABEL[s?.student_type ?? "domestic"] ?? s?.student_type ?? "",
        이수여부: completion && !completion.revoked_at ? "이수" : completion?.revoked_at ? "취소됨" : "미이수",
        이수일: completion && !completion.revoked_at && completion.completed_at
          ? String(completion.completed_at).slice(0, 10) : "",
        설문제출: response ? "제출" : "미제출",
        제출일시: response?.submitted_at ? String(response.submitted_at).slice(0, 16).replace("T", " ") : "",
      };

      questionList.forEach((q, i) => {
        row[`${i + 1}. ${q.question_text}`] = formatAnswer(q.question_type, answers[String(q.id)]);
      });
      return row;
    });

    return NextResponse.json({
      programName: program.name,
      surveyLinked: true,
      surveyTitle: survey?.title ?? "",
      submitted: rows.filter((r) => r.설문제출 === "제출").length,
      rows,
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
