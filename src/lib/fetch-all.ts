/**
 * PostgREST 는 한 번에 1,000행까지만 준다. `.limit(100000)` 을 적어도 1,000행에서 잘린다.
 *
 * 이 때문에 조용히 틀린 화면이 여러 군데 있었다 — 직원 마일리지 합계가 9,465점인데
 * 5,180점으로 나왔고(마일리지 1,277행 중 1,000행만 읽혔다), 재학생 1,132명 중
 * 뒤쪽 학생의 이름이 빈칸이었다. 오류가 나지 않으니 숫자만 보고는 알 수 없다.
 *
 * 서버 라우트에는 같은 일을 하는 루프가 이미 있다(`/api/admin/students` 등).
 * 브라우저에서 읽는 자리도 이 함수를 거친다.
 *
 *   const students = await fetchAllRows<Row>((from, to) =>
 *     supabase.from("students").select("student_id, name").range(from, to));
 */
const PAGE = 1000;

/** 페이지를 끝까지 넘겨 받는다. 한 페이지라도 실패하면 그 오류를 던진다. */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}
