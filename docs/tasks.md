# 비교과 영상 LMS 구현 작업 목록

> 이 파일은 Claude Code가 직접 읽고 실행하는 작업 지시서다.
> 설계서: `docs/video-lms-spec.md` (작업 전 반드시 읽을 것)
>
> **규칙: 한 번에 한 단계만 진행한다.** 사용자가 "N단계 해줘"라고 하면 그 단계만 수행하고,
> 완료 후 "✅ 확인 방법"에 적힌 대로 검증한 뒤 결과를 보고하고 멈춘다.
> 다음 단계로 자동으로 넘어가지 않는다.

---

## 확정된 값 (그대로 사용할 것)

```
Cloudflare Account ID : e29901a30676b8dc4fa232711fb54815
테스트 영상 UID        : 26c2f463075e106aceea61e8c16859c3
배포 도메인            : ytus-competency-assessment.vercel.app
```

## 확정된 정책 (설계서와 동일, 재확인용)

- 영상형 비교과는 신청 즉시 수강 가능 (승인 대기 없음)
- 영상형은 정원 무제한
- 유학생(`student_type='international'`)은 핵심역량 진단 별도, 마일리지 미지급, 영상 이수 실적만 관리
- 이수 기준: 필수 콘텐츠 각각 진도 90% 이상
- 배속 상한 1.5배, 이수 자동 확정
- `students.role`은 기존 7개 값만 사용: student, professor, staff, admin, career_center, counseling_center, ctl
- `student_extracurricular.status`는 `신청`/`완료`만 사용. `참여중` 도입 금지
- 진도율은 서버(DB 함수)에서만 계산. 클라이언트 계산 금지
- `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_*`는 서버 전용, `NEXT_PUBLIC_` 금지

---

## 1단계 — 데이터베이스 마이그레이션

**목표**: 설계서 4장·5장의 마이그레이션 001~008을 적용한다.

**작업**:
1. `docs/video-lms-spec.md`의 4장, 5장을 읽는다
2. Supabase MCP의 `apply_migration`으로 001~008을 순서대로 적용한다
   (파일명 예: `001_students_type`, `002_extracurricular_video` 등 설계서 번호·제목을 따른다)
3. 001의 `role` CHECK 제약에는 기존 7개 값을 **반드시 모두** 포함한다.
   하나라도 누락하면 기존 계정이 잠긴다.
4. 008은 전체 유니크 인덱스가 아니라 `WHERE source_type = 'extracurricular'` 부분 인덱스다.
   `center_reservation` 유형에는 정상적인 중복이 있으므로 전체로 걸면 실패한다.
5. 적용 후 `list_tables`로 결과를 확인한다

**✅ 확인 방법**: 아래 5개 테이블이 새로 생겼는지 확인하고 사용자에게 보고한다.
- `extracurricular_contents`
- `content_captions`
- `video_progress`
- `video_watch_batches`
- `extracurricular_completions`

---

## 2단계 — 진도 계산 DB 함수 ⭐ 핵심 단계

**목표**: 설계서 6장의 DB 함수 2개를 만들고 반드시 직접 검증한다.

**작업**:
1. `lms_record_watch_batch` 함수 생성
2. `lms_finalize_completion` 함수 생성
3. 아래 검증을 **반드시 실행**하고 결과를 보고한다:
   - 테스트용 `extracurricular` 레코드 1개, `extracurricular_contents` 3개(각 길이 600초)를 임시 생성
   - `lms_record_watch_batch`로 `[[0,10],[10,20]]` 전송 → progress가 3.33이 나오는지 확인
   - **동일 구간 `[[0,10],[10,20]]`을 다시 전송 → progress가 여전히 3.33인지 확인 (중복 합산 금지가 핵심)**
   - `[[0,60]]`처럼 15초 초과 구간 → 거부되는지 확인
   - `rate=2.0` → `RATE_EXCEEDED`로 거부되는지 확인
   - `lms_finalize_completion`을 진도 미달 상태로 호출 → `incomplete` 반환 확인
4. 검증이 끝나면 테스트 데이터를 삭제한다

**✅ 확인 방법**: 위 5개 검증 결과를 표로 정리해 보고한다.
**중복 구간 재전송 시 progress가 오르지 않는 것**을 반드시 확인한다.
이게 안 되면 다음 단계로 넘어가지 말고 원인을 먼저 고친다.

---

## 3단계 — 권한 유틸

**목표**: 설계서 3장에 따라 역할 기반 권한 함수를 만든다.

**작업**:
1. 기존 코드에서 관리자 권한을 체크하는 방식이 있는지 먼저 찾는다
2. 있으면 그 파일에 추가, 없으면 `lib/auth/lms-permissions.ts`를 새로 만든다
3. `canManageLms(role)`: admin, career_center, counseling_center, ctl → true
4. `canViewLmsProgress(role)`: 위 + staff, professor → true

**✅ 확인 방법**: 함수가 정의된 파일 경로와 export 목록을 보고한다.

---

## 4단계 — Cloudflare 연동 (서명 키 자동 발급 포함)

**목표**: 설계서 8장에 따라 Cloudflare Stream 연동 유틸을 만든다. 서명 키는 대시보드에서 발급 불가하므로 API로 받는다.

**작업**:
1. 아래 API를 호출해 서명 키를 발급받는다:
   ```
   POST https://api.cloudflare.com/client/v4/accounts/e29901a30676b8dc4fa232711fb54815/stream/keys
   Authorization: Bearer {CLOUDFLARE_STREAM_API_TOKEN}
   ```
2. 응답의 `id`와 `pem`을 **화면에 그대로 출력**한다 (사용자가 Vercel에 등록해야 함)
3. `lib/cloudflare-stream.ts`에 아래 함수를 만든다:
   - `getVideoMeta(uid)`: duration, thumbnail, readyToStream 조회
   - `createPlaybackToken(uid, expiresInSec)`: 서명 JWT 생성 (기본 만료 4시간)
   - `updateVideoSettings(uid)`: `requireSignedURLs=true`, `allowedOrigins=["ytus-competency-assessment.vercel.app"]` 설정
4. 환경변수: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, `CLOUDFLARE_STREAM_KEY_ID`, `CLOUDFLARE_STREAM_KEY_PEM` (전부 서버 전용, `NEXT_PUBLIC_` 금지)
5. 테스트 영상 UID `26c2f463075e106aceea61e8c16859c3`로 `getVideoMeta`가 정상 동작하는지 확인한다

**✅ 확인 방법**: 서명 키 `id`/`pem` 값을 사용자에게 명확히 제시하고,
"이 값을 Vercel 환경변수 CLOUDFLARE_STREAM_KEY_ID, CLOUDFLARE_STREAM_KEY_PEM에 등록해주세요"라고 안내한다.
`getVideoMeta` 결과(duration 등)도 함께 보고한다.

**❌ 403 에러 발생 시**: API 토큰 권한이 `Account / Stream / Edit`가 맞는지 사용자에게 확인 요청.

---

## 5단계 — 관리자 콘텐츠 등록 화면

**목표**: 설계서 11장에 따라 영상 등록 관리자 화면을 만든다.

**작업**:
1. `/admin/lms`: 영상형(`delivery_type='video'`) 프로그램 목록
2. `/admin/lms/[programId]/contents`: 콘텐츠 등록·수정·순서 관리
3. video uid 입력 → `getVideoMeta`로 duration 자동 조회 (수기 입력란 금지)
4. 등록 직후 미리보기 재생 가능하게
5. 순서 변경은 숫자 입력으로 (드래그 정렬 불필요)
6. 영상형 선택 시 정원(`capacity`) 입력란 비활성화
7. 권한 체크: `canManageLms`
8. 기존 관리자 화면의 레이아웃·컴포넌트를 그대로 재사용한다

**✅ 확인 방법**: 테스트 UID `26c2f463075e106aceea61e8c16859c3`로 콘텐츠를 등록하고,
duration이 자동으로 채워지는지, 미리보기가 재생되는지 확인해 보고한다.

---

## 6단계 — 학생용 API

**목표**: 설계서 10장의 학생용 API Route 3개를 만든다.

**작업**:
1. `GET /api/lms/programs`: 영상형 목록, `target_audience`와 학생 `student_type` 대조 필터링, 진도 포함
2. `GET /api/lms/programs/[id]`: 커리큘럼 + 콘텐츠별 진도 + 이수 상태
3. `POST /api/lms/playback-token`: 설계서 8.3의 검증 순서를 반드시 지킨다
   - 세션에서 student_id 확보
   - 신청 여부 확인 (`student_extracurricular`)
   - `target_audience`와 `student_type` 일치 확인
   - 서명 JWT 발급 (4시간 유효)

**✅ 확인 방법**: 신청하지 않은 학생, 또는 대상이 안 맞는 학생에게 토큰이 발급되지 않는지 확인해 보고한다.

---

## 7단계 — 학생 화면

**목표**: 설계서 11장에 따라 학생용 LMS 목록·커리큘럼 화면을 만든다.

**작업**:
1. `/lms`: 학습 홈 (학습중 / 신청가능 / 이수완료 탭)
2. `/lms/[programId]`: 커리큘럼
3. `app/lms/layout.tsx`: LMS 전용 사이드바 레이아웃 (전역 헤더는 유지)
4. 상태 표시는 설계서 7장의 `deriveStatus` 로직 사용. DB의 `status` 값 자체는 변경하지 않는다
5. 이 단계에서 플레이어는 만들지 않는다. 콘텐츠 클릭 시 이동할 링크만 연결한다

**✅ 확인 방법**: `/lms`에 5단계에서 등록한 프로그램이 표시되는지 확인해 보고한다.

---

## 8단계 — 영상 플레이어 ⭐ 핵심 단계

**세 개의 하위 단계로 나눠서 진행한다. 한 번에 하나씩.**

### 8-1. 재생 껍데기

**작업**:
1. `/lms/[programId]/watch/[contentId]` 페이지 생성
2. 몰입형 레이아웃 (헤더·푸터 없음, 좌 플레이어 / 우 커리큘럼, 모바일은 하단 접이식)
3. Cloudflare Stream SDK를 `next/script`로 이 페이지에서만 로드
   (`https://embed.cloudflarestream.com/embed/sdk.latest.js`)
4. `playback-token` API로 토큰을 받아 iframe에 적용
5. 배속 선택지는 1.0 / 1.25 / 1.5만
6. 학번·이름 반투명 워터마크, 5분마다 위치 이동
7. 진도 전송은 아직 만들지 않는다. hls.js는 사용하지 않는다.

**✅ 확인 방법**: 재생이 되는지 확인해 보고한다.

### 8-2. 진도 수집

**작업**: 설계서 9.1을 정확히 따른다.
1. 재생 중 10초 단위 구간을 로컬 배열에 축적
2. 60초마다(6구간) `POST /api/lms/watch`로 일괄 전송
3. 일시정지·페이지 이탈 시 즉시 flush
4. 전송 실패 시 큐 유지 후 재전송 (최대 10구간)
5. 탭 비활성화 시 자동 일시정지
6. 새로고침 시 `last_position_sec`부터 이어보기
7. 시킹은 허용하되 진도 미반영, "건너뛴 구간은 진도에 포함되지 않습니다" 안내
8. `POST /api/lms/watch`도 함께 만든다. 진도율은 서버 응답을 그대로 표시하고 클라이언트에서 계산하지 않는다.

**✅ 확인 방법**: 다음 8-3에서 종합 검증.

### 8-3. 검증

**작업**: 아래 항목을 실제로 재생하며 확인한다.
1. 2분 재생 → `video_progress.progress` 상승 확인
2. 앞으로 되돌려 같은 구간 재생 → progress가 오르지 않는지 확인
3. 진행바로 끝까지 점프 → progress가 100%가 되지 않는지 확인
4. 새로고침 → 보던 지점부터 재생되는지 확인
5. 탭 전환 → 일시정지되는지 확인
6. 개발자도구로 요청 조작 시도 → 서버가 거부하는지 확인

**✅ 확인 방법**: 각 항목의 결과와 `video_progress` 테이블 실제 값을 표로 정리해 보고한다.
**2번과 3번이 통과하지 않으면 이수 판정 전체가 무의미하므로, 이 경우 다음 단계로 넘어가지 말고 원인을 먼저 고친다.**

---

## 9단계 — 이수 확정 처리

**목표**: 설계서 6.2에 따라 이수 판정을 화면과 연결한다.

**작업**:
1. `POST /api/lms/complete`: 마지막 필수 콘텐츠가 90% 도달 시 클라이언트에서 자동 호출
2. 결과별 모달: `completed` / `incomplete` / `survey_required` / `already_completed`
3. 내국인은 마일리지 획득 표시, 유학생(`international`)은 표시하지 않음
4. `GET /api/lms/certificate/[no]`: 수료증 PDF

**✅ 확인 방법**: 유학생 테스트 계정으로 이수를 완료시켜서
`mileage_records`에 행이 생기지 않는지, `extracurricular_completions`에는 정상 기록되는지 확인해 보고한다.

---

## 10단계 — 기존 화면 연결

**목표**: 설계서 11.3에 따라 신청 페이지·대시보드·진단 결과와 LMS를 연결한다.

**작업**:
1. 비교과 신청 페이지: `delivery_type='video'`면 배지 표시, 신청 후 "학습 시작" 버튼 → `/lms/[id]`
   (`status`는 `신청` 그대로 유지)
2. 메인 대시보드: 이어보기 카드 1개 (`GET /api/lms/resume` 신규 생성)
3. 역량진단 결과: 하위 2개 역량의 `core_competency_tags`와 매칭되는 프로그램 추천 (내국인만)
4. 기존 페이지 수정은 최소한으로, 기존 동작을 깨지 않는다

**✅ 확인 방법**: 학생 계정으로 신청 → 학습 시작 → 재생까지 끊김 없이 이어지는지 확인해 보고한다.

---

## 11단계 — 유학생 트랙 분기

**목표**: 설계서 11.4에 따라 유학생 UI를 분리한다.

**작업**:
1. 대시보드에서 `student_type='international'`이면 마일리지 위젯을 렌더링하지 않는다 (0점 표시 금지)
2. 그 자리에 이수 완료 프로그램 수 + 수료증 배치
3. 역량진단도 `applies_to` 기준으로 학생 유형별 문항 필터링
4. 관리자 화면에 학생 유형 변경 기능 추가

**✅ 확인 방법**: 유학생 계정으로 로그인해 마일리지 위젯이 안 보이는지 확인해 보고한다.

---

## 12단계 — 관리자 진도 현황

**목표**: 진도 모니터링 및 엑셀 다운로드 기능을 만든다.

**작업**:
1. `/admin/lms/[programId]/progress`: 수강생별 콘텐츠 진도, 이수 여부
2. 내국인/유학생 분리 표시 (합산 금지 — 분모가 다름)
3. 이수 수동 승인/취소 (취소 시 마일리지 음수 상계 레코드 추가)
4. `GET /api/admin/lms/export`: 엑셀 다운로드
5. 권한: 조회는 `canViewLmsProgress`, 승인·취소는 `canManageLms`

**✅ 확인 방법**: 엑셀 다운로드가 정상 동작하는지 확인해 보고한다.

---

## 13단계 — 운영 점검 자동화 (LMS 실사용 시작 후에 진행)

**목표**: 설계서 15장에 따라 데이터 무결성 자동 점검을 추가한다.

**작업**:
1. `system_health_log` 테이블 생성
2. pg_cron으로 매일 새벽 점검 실행
3. 점검 항목: 이수 조건 충족했으나 completions 없음 / 마일리지 미지급 / 24시간 내 진도기록 0건 / rejected 배치 급증
4. **자동 수정 로직은 절대 넣지 않는다.** 감지와 기록만 한다.
5. critical 발생 시 관리자 대시보드 상단 배너 표시

**✅ 확인 방법**: 점검 로그가 정상적으로 쌓이는지 확인해 보고한다.

---

## 전체 체크리스트 (사용자 확인용)

| 단계 | 핵심 확인 | 완료 |
|---|---|---|
| 1 | 새 테이블 5개 생성 | ⬜ |
| 2 | ⭐ 중복 구간 재전송 시 진도 안 오름 | ⬜ |
| 3 | 권한 유틸 생성 | ⬜ |
| 4 | 서명 키 발급 → Vercel 등록 필요 | ⬜ |
| 5 | 영상 등록 시 duration 자동 조회 | ⬜ |
| 6 | API 3개 생성 | ⬜ |
| 7 | `/lms` 목록 표시 | ⬜ |
| 8 | ⭐ 되감기·점프로 진도 조작 불가 | ⬜ |
| 9 | 유학생 마일리지 미지급 확인 | ⬜ |
| 10 | 신청→학습시작→재생 연결 | ⬜ |
| 11 | 유학생 마일리지 위젯 숨김 | ⬜ |
| 12 | 진도 현황 엑셀 다운로드 | ⬜ |
| 13 | (운영 시작 후) 자동 점검 동작 | ⬜ |

⭐ 표시 항목은 통과하지 않으면 이후 단계를 진행하지 않는다.
