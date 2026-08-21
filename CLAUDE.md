## 비교과 영상 LMS 작업 규칙

설계서: `docs/video-lms-spec.md` — 작업 전 반드시 읽는다.

### 데이터 구조
- 영상 프로그램은 `extracurricular` 테이블의 `delivery_type='video'` 레코드다. 별도 프로그램 테이블 금지.
- 유학생용 테이블을 새로 만들지 않는다. `students.student_type` 으로 분기한다.
- `student_extracurricular.status` 는 `신청` / `완료` 만 사용한다. `참여중` 을 도입하지 않는다.
- `students.role` 은 기존 7개 값을 그대로 쓴다: student, professor, staff, admin, career_center, counseling_center, ctl. 새 role 을 만들지 않는다.

### 보안
- `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_*` 는 Route Handler 안에서만 사용한다. `NEXT_PUBLIC_` 접두사 금지.
- `student_id` 는 항상 서버 세션에서 가져온다. 요청 body 값을 신뢰하지 않는다.
- `video_progress` / `video_watch_batches` / `extracurricular_completions` 에 브라우저에서 직접 접근 금지. `/api/lms/*` 경유.
- 센터 role(career_center, counseling_center, ctl)은 역량진단 결과와 학생 개인정보에 접근할 수 없다.

### 로직
- 진도율을 클라이언트에서 계산하지 않는다. `lms_record_watch_batch` RPC만 사용한다.
- 영상 `duration_sec` 은 Cloudflare API에서 조회한다. 수기 입력 금지.
- 마일리지는 `student_type='domestic'` 인 경우에만 지급한다.
- 마일리지는 UPDATE/DELETE 하지 않는다. 취소는 음수 상계 레코드를 추가한다.
- 이수 기준 변경 시 기존 `extracurricular_completions` 는 건드리지 않는다.

### 작업 방식
- 한 단계씩 진행하고, 끝나면 멈춰서 확인을 받는다.
- 기존 파일의 코딩 스타일과 데이터 fetch 패턴을 따른다. 새 패턴을 도입하지 않는다.
- 마이그레이션은 Supabase MCP 의 `apply_migration` 을 사용한다.