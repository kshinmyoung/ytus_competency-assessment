/**
 * Auth 계정 조회 (서버 전용)
 *
 * auth.users 는 PostgREST 로 못 읽으므로 Admin API 로 찾는다.
 * listUsers() 는 한 번에 기본 50명만 준다. 학생 수가 그보다 많으므로
 * 끝까지 넘겨보며 찾아야 한다. 한 페이지만 보면 뒤쪽 학생은 '없음'으로 나온다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const PER_PAGE = 200;
const MAX_PAGES = 50;

export async function findAuthUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < PER_PAGE) return null;
  }
  return null;
}
