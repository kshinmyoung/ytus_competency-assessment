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

