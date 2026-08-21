import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as
  | string
  | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경 변수가 설정되지 않았습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 추가해 주세요.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Auth 세션에서 학번 추출 (이메일이 학번@temp.com 형식일 때) */
export async function getCurrentStudentId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email;
  if (!email || !/@temp\.com$/i.test(email)) return null;
  return email.replace(/@temp\.com$/i, "").trim();
}

const SESSION_RETRIES = 4;
const SESSION_RETRY_MS = 250;

/**
 * 페이지 진입 직후에는 세션이 아직 localStorage 에서 복원되지 않았을 수 있다.
 * 한 번만 물어보고 없으면 포기하면 화면이 빈 채로 남으므로 잠깐 기다렸다 다시 묻는다.
 * 실제로 로그아웃 상태면 최대 1초 뒤 null 을 돌려준다.
 */
export async function waitForStudentId(): Promise<string | null> {
  for (let i = 0; i < SESSION_RETRIES; i++) {
    const studentId = await getCurrentStudentId();
    if (studentId) return studentId;
    if (i < SESSION_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, SESSION_RETRY_MS));
    }
  }
  return null;
}

/** 같은 이유로 액세스 토큰도 복원될 때까지 기다린다. */
export async function waitForAccessToken(): Promise<string | null> {
  for (let i = 0; i < SESSION_RETRIES; i++) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (token) return token;
    if (i < SESSION_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, SESSION_RETRY_MS));
    }
  }
  return null;
}

