/**
 * 수료증 (서버 전용)
 * GET /api/lms/certificate/[no]
 *
 * 인쇄용 HTML 을 반환한다 (브라우저에서 PDF 로 저장).
 * jsPDF 기본 폰트는 한글을 렌더링하지 못해 이름·프로그램명이 깨지므로,
 * 한글 웹폰트를 쓰는 인쇄용 문서로 제공한다.
 *
 * 본인 또는 LMS 조회 권한자만 열람할 수 있다. 수료번호를 안다고 열리면 안 된다.
 */
import { NextResponse } from "next/server";
import { assertStudent, lmsErrorResponse } from "@/lib/auth/lms-api";
import { canViewLmsProgress } from "@/lib/auth/lms-permissions";

type Params = { params: Promise<{ no: string }> };

// 수료증 문구는 수료자의 role 에 맞춘다. role 값은 students.role 7개를 그대로 쓴다.
// student 외 6개는 전부 교직원으로 묶어 한 가지 문구를 쓴다.
const STAFF_ROLES = ["professor", "staff", "admin", "career_center", "counseling_center", "ctl"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// 제목 끝에 붙는 목적격 조사. 마지막 한글 음절의 종성으로 가린다. 한글이 없으면 "을".
function objectParticle(value: string): string {
  for (let i = value.length - 1; i >= 0; i -= 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 === 0 ? "를" : "을";
  }
  return "을";
}

function formatKoreanDate(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric",
  }).formatToParts(d);
  return parts.map((p) => p.value).join("");
}

export async function GET(request: Request, { params }: Params) {
  try {
    const result = await assertStudent(request);
    if (result instanceof NextResponse) return result;
    const { admin, studentId, role } = result;

    const certificateNo = decodeURIComponent((await params).no).trim();
    if (!certificateNo) return NextResponse.json({ error: "수료번호가 필요합니다." }, { status: 400 });

    const { data: completion, error } = await admin
      .from("extracurricular_completions")
      .select("student_id, extracurricular_id, student_type, final_progress, mileage_granted, certificate_no, completed_at, revoked_at")
      .eq("certificate_no", certificateNo)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!completion) return NextResponse.json({ error: "수료증을 찾을 수 없습니다." }, { status: 404 });

    if (completion.student_id !== studentId && !canViewLmsProgress(role)) {
      return NextResponse.json({ error: "열람 권한이 없습니다." }, { status: 403 });
    }
    if (completion.revoked_at) {
      return NextResponse.json({ error: "취소된 수료증입니다." }, { status: 410 });
    }

    const [{ data: student }, { data: program }, { data: contentRows }] = await Promise.all([
      admin.from("students").select("name, role").eq("student_id", completion.student_id).maybeSingle(),
      admin.from("extracurricular").select("name, organizer, delivery_type").eq("id", completion.extracurricular_id).maybeSingle(),
      admin.from("extracurricular_contents").select("title, is_required, content_order, id")
        .eq("extracurricular_id", completion.extracurricular_id).order("content_order").order("id"),
    ]);

    // 조회자(role)가 아니라 수료자 본인의 role 로 문구를 고른다.
    const holderRole = student?.role ?? "";
    const isStaff = STAFF_ROLES.includes(holderRole);
    const subject = isStaff ? "위 교직원은" : holderRole === "student" ? "위 학생은" : "위 사람은";
    const idLabel = isStaff ? "직 번" : holderRole === "student" ? "학 번" : "번 호";

    // 영상형은 필수 콘텐츠가 이수 단위다. 한 편이면 그 영상 제목이 이수 대상이다.
    const contents = contentRows ?? [];
    const required = contents.filter((c) => c.is_required);
    const videoContents = required.length ? required : contents;
    const isVideo = program?.delivery_type === "video";

    const subjectTitle = isVideo && videoContents.length === 1
      ? videoContents[0].title
      : (program?.name ?? "-");

    // 교직원 수료증은 제목을 본문 문장 안에 넣는다. 표제를 따로 두면 같은 제목이 두 번 찍힌다.
    const sentence = isStaff
      ? videoContents.length > 1
        ? `${subject} \u201c${subjectTitle}\u201d 과정(총 ${videoContents.length}편)을`
        : `${subject} \u201c${subjectTitle}\u201d${objectParticle(subjectTitle)}`
      : !isVideo
        ? `${subject} 본교 비교과 프로그램을`
        : videoContents.length > 1
          ? `${subject} 위 영상 과정(총 ${videoContents.length}편)을`
          : `${subject} 위 영상을`;

    const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>수료증 ${escapeHtml(certificateNo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Noto Serif KR", serif; background: #f1f5f9;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .sheet { width: 210mm; min-height: 297mm; background: #fff; padding: 28mm 24mm;
           box-shadow: 0 10px 40px rgba(0,0,0,.12); position: relative; }
  .frame { border: 3px double #1e3a5f; height: 100%; min-height: 241mm; padding: 18mm 14mm;
           display: flex; flex-direction: column; align-items: center; }
  .no { position: absolute; top: 16mm; right: 24mm; font-size: 10pt; color: #64748b; letter-spacing: .04em; }
  h1 { font-size: 32pt; font-weight: 700; letter-spacing: 1.2em; color: #1e3a5f;
       margin: 6mm 0 14mm; text-indent: 1.2em; }
  .row { font-size: 12pt; color: #334155; margin: 2.5mm 0; }
  .row b { display: inline-block; width: 26mm; color: #64748b; font-weight: 400; }
  .title { font-size: 17pt; font-weight: 600; color: #0f172a; margin: 12mm 0 10mm; text-align: center; line-height: 1.5; word-break: keep-all; }
  .body { font-size: 12.5pt; line-height: 2.1; color: #1f2937; text-align: center; margin-top: 6mm; word-break: keep-all; }
  .body.lead { font-size: 14pt; margin-top: 22mm; max-width: 150mm; }
  .date { margin-top: auto; padding-top: 16mm; font-size: 13pt; color: #0f172a; }
  .issuer { margin-top: 8mm; font-size: 15pt; font-weight: 700; color: #1e3a5f; letter-spacing: .12em; }
  .foot { margin-top: 10mm; font-size: 8.5pt; color: #94a3b8; text-align: center; line-height: 1.6; }
  @media print {
    body { background: #fff; padding: 0; display: block; }
    .sheet { box-shadow: none; width: auto; min-height: auto; padding: 18mm 16mm; }
    @page { size: A4; margin: 0; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="no">수료번호 ${escapeHtml(certificateNo)}</div>
    <div class="frame">
      <h1>수 료 증</h1>

      <div style="align-self:flex-start">
        <div class="row"><b>성 명</b>${escapeHtml(student?.name ?? "-")}</div>
        <div class="row"><b>${escapeHtml(idLabel)}</b>${escapeHtml(completion.student_id)}</div>
        <div class="row"><b>이수일</b>${escapeHtml(formatKoreanDate(completion.completed_at))}</div>
      </div>

      ${isStaff ? "" : `<div class="title">${escapeHtml(subjectTitle)}</div>`}

      <div class="body${isStaff ? " lead" : ""}">
        ${escapeHtml(sentence)}<br>
        성실히 이수하였기에 이 증서를 수여합니다.
      </div>

      <div class="date">${escapeHtml(formatKoreanDate(completion.completed_at))}</div>
      <div class="issuer">${escapeHtml(program?.organizer ?? "영남신학대학교")}</div>

      <div class="foot">
        최종 진도율 ${completion.final_progress}%<br>
        이 수료증의 진위는 수료번호로 확인할 수 있습니다.
      </div>
    </div>
  </div>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });</script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return lmsErrorResponse(e);
  }
}
