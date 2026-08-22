/**
 * CSV 파싱.
 *
 * 예전 파서는 줄 단위로 잘라서 한 줄씩 따옴표를 세었다. 그래서 값 안에 줄바꿈이
 * 들어가면 한 레코드가 두 줄로 쪼개져 열이 밀렸고, 이스케이프된 따옴표("")는
 * 그냥 사라졌다. 여기서는 텍스트 전체를 한 번에 훑는다.
 */

/** 헤더 표기 흔들림을 한 이름으로 모은다. Excel 에서 한글 헤더로 내보내는 경우가 많다. */
const HEADER_ALIASES: Record<string, string> = {
  // 학생
  "학번": "student_id",
  "학번(id)": "student_id",
  "아이디": "student_id",
  "이름": "name",
  "성명": "name",
  "비밀번호": "password",
  "암호": "password",
  "패스워드": "password",
  "역할": "role",
  "권한": "role",
  "학과": "department_id",
  "학과id": "department_id",
  "학과번호": "department_id",
  "학년": "grade_year",
  "입학연도": "admission_year",
  "입학년도": "admission_year",
  "연락처": "phone",
  "전화번호": "phone",
  "휴대폰": "phone",
  "이메일": "email",
  "메일": "email",
  // 비교과·교과
  "프로그램명": "name",
  "프로그램id": "extracurricular_id",
  "과목명": "name",
  "카테고리": "category",
  "주관": "organizer",
  "설명": "description",
  "시작일": "start_date",
  "종료일": "end_date",
  "최대인원": "max_participants",
  "정원": "max_participants",
  "마일리지": "completion_mileage",
  "이수마일리지": "completion_mileage",
  "상태": "status",
};

/** 헤더 한 칸을 표준 이름으로. 소문자·공백제거 후 별칭표를 본다. */
export function normalizeHeader(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (HEADER_ALIASES[key]) return HEADER_ALIASES[key];
  // 한글 헤더는 공백 외에 밑줄도 흔들리므로 한 번 더 본다
  const compact = key.replace(/_/g, "");
  return HEADER_ALIASES[compact] ?? key;
}

/**
 * CSV 텍스트를 셀 배열의 배열로. 따옴표 안의 쉼표·줄바꿈과 "" 이스케이프를 처리한다.
 * 빈 줄은 버린다.
 */
export function parseCsvRows(csvText: string): string[][] {
  // Excel 이 붙이는 BOM 을 떼지 않으면 첫 헤더 이름이 어긋난다
  const text = csvText.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  const endCell = () => { row.push(cur.trim()); cur = ""; };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        // "" 는 따옴표 한 개를 뜻한다. 그 외의 " 는 인용 끝.
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += c;
      }
      continue;
    }

    if (c === '"') inQuotes = true;
    else if (c === ",") endCell();
    else if (c === "\r") { /* \r\n 의 \r 은 버린다 */ }
    else if (c === "\n") endRow();
    else cur += c;
  }
  if (cur !== "" || row.length > 0) endRow();

  return rows;
}

/** CSV 텍스트를 객체 배열로 변환 (첫 줄 헤더). 헤더는 표준 이름으로 정규화된다. */
export function parseCsv(csvText: string): Record<string, string>[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) return [];

  const header = rows[0].map(normalizeHeader);
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    header.forEach((key, idx) => { obj[key] = cells[idx] ?? ""; });
    return obj;
  });
}

/** 한 줄만 파싱해야 할 때. */
export function parseCsvLine(line: string): string[] {
  return parseCsvRows(line)[0] ?? [];
}
