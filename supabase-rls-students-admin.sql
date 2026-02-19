-- =============================================================================
-- students 테이블: 관리자(role = 'admin')가 전체 조회 가능하도록 RLS 정책
-- Supabase Dashboard > SQL Editor 에서 실행 후 적용하세요.
-- =============================================================================
-- 참고: 현재 앱은 관리자 학생 목록을 /api/admin/students (서버 API)로 조회하므로
-- RLS가 있어도 목록은 동작합니다. 아래 정책은 클라이언트에서 직접
-- supabase.from('students').select() 할 때(예: 로그인 직후 role 조회, 대시보드 이름 조회 등) 필요합니다.
-- =============================================================================

-- 1) RLS 활성화 (이미 되어 있으면 무시)
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- 2) 기존 정책이 있다면 필요 시 삭제 후 재생성 (이름은 프로젝트에 맞게 변경)
-- DROP POLICY IF EXISTS "students_select_own" ON public.students;
-- DROP POLICY IF EXISTS "admin_select_all_students" ON public.students;

-- 3) 본인 행 조회 (로그인 직후 role/이름 조회용)
CREATE POLICY "students_select_own"
ON public.students
FOR SELECT
USING (student_id = TRIM(SPLIT_PART(auth.jwt() ->> 'email', '@', 1)));

-- 4) 관리자는 모든 행 조회 가능 (role = 'admin'인 경우)
-- (auth.jwt() ->> 'email' 로 로그인 이메일을 얻고, 해당 이메일의 student_id로 students에서 role 조회가 필요하면
--  함수를 쓰거나, 아래는 "현재 요청의 JWT에 담긴 사용자"가 students 테이블에 있고 role이 admin인 경우만 허용)
-- JWT의 email이 학번@temp.com 형식일 때, 학번 추출 후 해당 행의 role이 admin이면 전체 SELECT 허용
CREATE POLICY "admin_select_all_students"
ON public.students
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.student_id = TRIM(SPLIT_PART(auth.jwt() ->> 'email', '@', 1))
      AND LOWER(TRIM(s.role)) = 'admin'
  )
);

-- 위 정책이 복잡하면, 대안: "인증된 사용자 중 본인 행만 조회" + "admin은 전체 조회"를 나누려면
-- Supabase는 auth.uid()만 제공하므로 student_id와 매핑이 필요합니다.
-- 이메일이 학번@temp.com 형식이므로, 이메일에서 학번을 추출해 비교하는 함수 예시:
--
-- CREATE OR REPLACE FUNCTION public.current_student_id()
-- RETURNS text AS $$
--   SELECT LOWER(TRIM(SPLIT_PART(auth.jwt() ->> 'email', '@', 1)));
-- $$ LANGUAGE sql STABLE;
--
-- CREATE POLICY "students_select_own_or_admin"
-- ON public.students FOR SELECT
-- USING (
--   student_id = public.current_student_id()
--   OR EXISTS (
--     SELECT 1 FROM public.students s
--     WHERE s.student_id = public.current_student_id() AND LOWER(TRIM(s.role)) = 'admin'
--   )
-- );
