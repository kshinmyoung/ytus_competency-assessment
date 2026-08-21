# 비교과 영상 LMS 설계서 v3

> 대상: YOUNG SHINY (영남신학대 역량관리시스템)
> Supabase: `ytus_project` / PostgreSQL 17 · 배포: Vercel (Next.js)
> 영상 호스팅: **Cloudflare Stream**
> Claude Code 구현 입력용 스펙. 14장 순서대로 진행한다.

## v2 대비 수정 사항 (실 DB 확인 결과 반영)

| 항목 | v2 (오류) | v3 (수정) |
|---|---|---|
| 마일리지 중복 방지 | 전체 유니크 인덱스 | **비교과 한정 부분 인덱스** — 상담 예약에 정상 중복 존재 |
| 권한 | `lms_manager` 신설 | **기존 7개 role 활용** — 이미 센터별로 구분되어 있음 |
| 수강 상태 | 신청 시 `참여중`으로 전환 | **`신청` 유지** — `참여중`은 실사용 이력 없음 |

**확인된 실제 값**

- `students.role`: `student`, `professor`, `staff`, `admin`, `career_center`, `counseling_center`, `ctl` — **CHECK 제약 없음**
- `student_extracurricular.status`: 실제 사용값은 `신청`, `완료` 뿐 (`참여중`은 정의만 존재)
- `mileage_records`: 847건 중 484건이 `source_id` NULL. `center_reservation`에 정상 중복 존재(한 학생 최대 11회). **비교과 유형은 중복 0건**

---

## 1. 전제와 원칙

### 1.1 확정된 정책

- 영상형 비교과는 **신청 즉시 수강 가능**. 승인 대기 없음.
- 영상형은 **정원 무제한**. 관리자 폼에서 정원 입력란 비활성화.
- **유학생은 별도 트랙**: 핵심역량 진단 별도, 마일리지 미지급, 영상 이수 실적만 관리.
- 이수 기준: 필수 콘텐츠 각각 **90% 이상** 시청 (프로그램별 조정 가능)
- 배속 상한 **1.5배**, 이수 **자동 확정**(관리자 수동 취소 가능)
- 다국어 자막은 **테이블 구조만** 만들고 기능 보류

### 1.2 절대 원칙

1. 영상 프로그램도 `extracurricular` 레코드다. 별도 프로그램 테이블 금지.
2. 유학생용 테이블을 따로 만들지 않는다. **구분 컬럼으로 분기**한다.
3. 진도율은 클라이언트가 계산하지 않는다. 클라이언트는 시청 구간만 보고한다.
4. 모든 쓰기는 Next.js Route Handler를 경유한다. `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용.
   (커스텀 인증이라 `auth.uid()`가 없어 RLS가 실질 방어선이 못 된다)
5. 이수 확정은 스냅샷이다. 기준이 바뀌어도 과거 실적은 불변.
6. 마일리지는 append-only. 취소는 음수 상계 레코드로 처리.
7. Cloudflare 자격증명에 **`NEXT_PUBLIC_` 접두사를 붙이지 않는다.**
8. **기존 데이터의 상태값·역할값을 새로 만들지 않는다.** 이미 쓰이는 값을 활용한다.

---

## 2. 환경변수

```
CLOUDFLARE_ACCOUNT_ID          # dash.cloudflare.com/{여기}/stream
CLOUDFLARE_STREAM_API_TOKEN    # Account / Stream / Edit 권한
CLOUDFLARE_STREAM_KEY_ID       # 서명 키 ID
CLOUDFLARE_STREAM_KEY_PEM      # 서명 키 PEM (줄바꿈 포함)
```

Vercel Project Settings → Environment Variables. 전부 서버 전용.
로컬 `.env.local`에서는 PEM을 큰따옴표로 감싼다.

---

## 3. 권한 설계 (수정됨)

새 role을 만들지 않는다. 이미 존재하는 값에 LMS 권한을 매핑한다.

```ts
// lib/auth/lms-permissions.ts
export const LMS_MANAGER_ROLES = [
  'admin',
  'career_center',       // 취창업진로지원센터
  'counseling_center',   // 상담센터
  'ctl',                 // 교수학습개발원
] as const;

export const LMS_VIEWER_ROLES = [
  ...LMS_MANAGER_ROLES, 'staff', 'professor',
] as const;

export function canManageLms(role?: string) {
  return !!role && (LMS_MANAGER_ROLES as readonly string[]).includes(role);
}
export function canViewLmsProgress(role?: string) {
  return !!role && (LMS_VIEWER_ROLES as readonly string[]).includes(role);
}
```

| 권한 | 대상 role | 범위 |
|---|---|---|
| 관리 | `admin`, `career_center`, `counseling_center`, `ctl` | 프로그램 개설, 콘텐츠 등록, 이수 확인 |
| 조회 | 위 + `staff`, `professor` | 진도 현황 조회만 |
| 학생 | `student` | 본인 학습 |

**중요:** 센터 계정은 **역량진단 결과와 학생 개인정보에 접근할 수 없다.** `/admin/diagnosis*`, `/admin/students*` 경로는 `admin`만 통과시킨다. 감사 대응 항목이다.

> 미결: 주관 부서가 확정되면 `LMS_MANAGER_ROLES`를 좁힌다. 현재는 3개 센터 모두 허용으로 시작.

---

## 4. 스키마 — 기존 테이블 확장

### 4.1 마이그레이션 001: 학생 구분 및 role 제약

```sql
alter table public.students
  add column if not exists student_type text not null default 'domestic'
    check (student_type in ('domestic', 'international')),
  add column if not exists preferred_locale text not null default 'ko';

create index if not exists idx_students_type on public.students (student_type);

-- role CHECK 신규 추가 (기존 제약 없음. 현재 사용 중인 7개 값을 모두 포함해야 한다)
alter table public.students
  add constraint students_role_check
  check (role in ('student','professor','staff','admin',
                  'career_center','counseling_center','ctl'));
```

> **주의:** `students`에 role 관련 CHECK 제약은 존재하지 않는다. drop 하지 말 것.
> 위 7개 값 중 하나라도 누락하면 기존 계정이 잠긴다.

### 4.2 마이그레이션 002: 프로그램 확장

```sql
alter table public.extracurricular
  add column if not exists delivery_type text not null default 'offline'
    check (delivery_type in ('offline', 'video', 'hybrid')),
  add column if not exists target_audience text not null default 'all'
    check (target_audience in ('all', 'domestic', 'international')),
  add column if not exists completion_mileage int not null default 0,
  add column if not exists thumbnail_url text,
  add column if not exists completion_rule jsonb not null default
    '{"min_progress": 90, "require_all_required_contents": true, "require_survey": false, "survey_id": null}'::jsonb;

create index if not exists idx_ec_delivery
  on public.extracurricular (delivery_type, target_audience) where is_active = true;
```

> `extracurricular.category`는 자유 텍스트로 오염되어 있다(`학습, 상담` / `학습,상담` / `학습 특강` 혼재). 영상 여부·대상 구분을 여기에 넣지 말고 전용 컬럼을 쓴다.

**목록 필터**

```sql
where is_active = true
  and (target_audience = 'all' or target_audience = {학생의 student_type})
```

**정원**: `delivery_type='video'`이면 `capacity`를 무시한다. 관리자 폼에서 입력란 비활성화, 신청 API에서 정원 체크 생략.

### 4.3 마이그레이션 003: 역량 항목 대상 구분

유학생용 핵심역량을 **새 테이블 없이** 기존 구조에 추가한다.

```sql
alter table public.core_competencies
  add column if not exists applies_to text not null default 'domestic'
    check (applies_to in ('all', 'domestic', 'international'));

alter table public.major_competencies
  add column if not exists applies_to text not null default 'domestic'
    check (applies_to in ('all', 'domestic', 'international'));
```

기존 6개 역량(영성 / 기독교적 성찰 / 창의수행 / 융합사고 / 공감소통 / 글로컬시민)은 `domestic`으로 유지. 유학생용 역량은 새 행으로 추가하고 `applies_to='international'`로 표시한다.

진단 문항 로딩·점수 산출·레이더 차트 컴포넌트를 그대로 재사용하고, 조회 시 학생 유형으로 거르기만 한다.

> 유학생용 역량 항목 정의는 교무·국제교류처 결정 사항. 문항 번역은 역번역(back-translation) 검증을 거쳐야 측정 타당성이 확보된다. 시스템은 구조만 제공한다.

---

## 5. 스키마 — 신규 테이블

### 5.1 마이그레이션 004: 콘텐츠

```sql
create table if not exists public.extracurricular_contents (
  id                 bigserial primary key,
  extracurricular_id int  not null references public.extracurricular(id) on delete cascade,
  title              text not null,
  description        text,
  provider           text not null default 'cloudflare'
                       check (provider in ('cloudflare', 'youtube', 'vimeo', 'link')),
  source_ref         text not null,             -- Cloudflare Stream video uid
  duration_sec       int  not null check (duration_sec > 0),
  language           text not null default 'ko',
  content_group      text,                      -- 동일 내용의 언어 변형 묶음 키
  content_order      int  not null default 0,
  is_required        boolean not null default true,
  attachment_url     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index on public.extracurricular_contents (extracurricular_id, content_order);
alter table public.extracurricular_contents enable row level security;
```

**`duration_sec`는 수기 입력받지 않는다.** video uid 등록 시 Cloudflare API에서 조회해 자동 저장한다. 이 값이 진도율 분모이므로 오타 하나로 이수 판정이 전부 틀어진다.

### 5.2 마이그레이션 005: 자막 (구조만)

```sql
create table if not exists public.content_captions (
  id          bigserial primary key,
  content_id  bigint not null references public.extracurricular_contents(id) on delete cascade,
  language    text not null,
  label       text not null,
  status      text not null default 'draft' check (status in ('draft', 'reviewed')),
  source      text not null default 'manual' check (source in ('stt', 'ai_translation', 'manual')),
  reviewed_by text,
  created_at  timestamptz not null default now(),
  unique (content_id, language)
);

alter table public.content_captions enable row level security;
```

**지금은 테이블만 만들고 비워둔다.** 나중에 마이그레이션을 다시 하지 않기 위함. 기능 구현 시 학생 플레이어에는 `status='reviewed'`만 내려보낸다 — AI 초벌이 노출되면 오역 민원이 발생한다.

### 5.3 마이그레이션 006: 진도

```sql
create table if not exists public.video_progress (
  student_id        text   not null references public.students(student_id) on delete cascade,
  content_id        bigint not null references public.extracurricular_contents(id) on delete cascade,
  watched           int4multirange not null default '{}'::int4multirange,
  watched_sec       int    not null default 0,
  progress          numeric(5,2) not null default 0,
  last_position_sec int    not null default 0,
  max_rate          numeric(3,1) not null default 1.0,
  batch_count       int    not null default 0,
  first_played_at   timestamptz not null default now(),
  last_played_at    timestamptz not null default now(),
  completed_at      timestamptz,
  primary key (student_id, content_id)
);

create index on public.video_progress (student_id);
create index on public.video_progress (content_id);

create table if not exists public.video_watch_batches (
  id            bigserial primary key,
  student_id    text   not null,
  content_id    bigint not null,
  segments      jsonb  not null,
  accepted      int    not null default 0,
  rejected      int    not null default 0,
  reject_reason text,
  playback_rate numeric(3,1) not null default 1.0,
  created_at    timestamptz not null default now()
);

create index on public.video_watch_batches (student_id, content_id, created_at desc);

alter table public.video_progress      enable row level security;
alter table public.video_watch_batches enable row level security;
```

**`int4multirange`를 쓰는 이유**: 재생 시간을 단순 누적하면 같은 10초 구간을 반복 재생해도 이수가 된다. 구간 합집합이어야 고유 시청률이 나온다. PG14+ 기능이며 현재 PG17.

### 5.4 마이그레이션 007: 이수 확정 및 다국어

```sql
create table if not exists public.extracurricular_completions (
  id                 bigserial primary key,
  student_id         text not null references public.students(student_id),
  extracurricular_id int  not null references public.extracurricular(id),
  student_type       text not null,          -- 확정 시점 스냅샷
  final_progress     numeric(5,2) not null,
  contents_snapshot  jsonb not null,
  rule_snapshot      jsonb not null,
  mileage_granted    int  not null default 0,
  certificate_no     text unique,
  approved_by        text,
  revoked_at         timestamptz,
  revoke_reason      text,
  completed_at       timestamptz not null default now(),
  unique (student_id, extracurricular_id)
);

create index on public.extracurricular_completions (extracurricular_id);
create index on public.extracurricular_completions (student_type, completed_at);

create table if not exists public.extracurricular_i18n (
  extracurricular_id int  references public.extracurricular(id) on delete cascade,
  locale             text not null,
  name               text not null,
  description        text,
  primary key (extracurricular_id, locale)
);

alter table public.extracurricular_completions enable row level security;
alter table public.extracurricular_i18n        enable row level security;
```

`student_type`을 스냅샷으로 남기는 이유: 학생 신분이 나중에 바뀌어도 당시 실적 집계가 흔들리지 않아야 한다.

### 5.5 마이그레이션 008: 마일리지 중복 방지 (수정됨)

```sql
-- 비교과 마일리지에만 적용하는 부분 유니크 인덱스
create unique index if not exists uq_mileage_ec_dedup
  on public.mileage_records (student_id, source_id, reason)
  where source_type = 'extracurricular' and source_id is not null;
```

**전체 유니크 인덱스를 걸면 안 된다.** `center_reservation` 유형에는 정상적인 중복이 존재한다 — 한 학생이 같은 센터 상담을 11회 받은 기록이 있으며 이는 버그가 아니라 반복 이용 실적이다. 게다가 847건 중 484건이 `source_id` NULL이라 구분이 불가능하다.

비교과(`extracurricular`) 유형은 현재 중복 0건이며, 영상 이수 마일리지의 이중 지급만 막으면 되므로 위 부분 인덱스로 충분하다.

> 별건 개선 과제: `center_reservation` 마일리지에 `source_id`(예약 ID)를 채우는 작업. 현재는 어떤 예약에 대한 지급인지 추적 불가.

---

## 6. DB 함수

### 6.1 배치 시청 기록

```sql
create or replace function public.lms_record_watch_batch(
  p_student_id text,
  p_content_id bigint,
  p_segments   jsonb,                    -- [[start,end], ...] 최대 10개
  p_rate       numeric default 1.0
)
returns table (progress numeric, watched_sec int, duration_sec int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration int;
  v_seg      jsonb;
  v_s        int;
  v_e        int;
  v_union    int4multirange := '{}'::int4multirange;
  v_ok       int := 0;
  v_ng       int := 0;
  v_reason   text;
  v_merged   int4multirange;
  v_total    int;
  v_min      numeric;
begin
  select c.duration_sec, coalesce((e.completion_rule->>'min_progress')::numeric, 90)
    into v_duration, v_min
    from extracurricular_contents c
    join extracurricular e on e.id = c.extracurricular_id
   where c.id = p_content_id;

  if v_duration is null then raise exception 'CONTENT_NOT_FOUND'; end if;

  if p_rate > 1.5 then
    insert into video_watch_batches(student_id, content_id, segments, rejected, reject_reason, playback_rate)
      values (p_student_id, p_content_id, p_segments, jsonb_array_length(p_segments), 'RATE_EXCEEDED', p_rate);
    raise exception 'RATE_EXCEEDED';
  end if;

  if jsonb_array_length(p_segments) > 10 then
    raise exception 'TOO_MANY_SEGMENTS';
  end if;

  for v_seg in select * from jsonb_array_elements(p_segments) loop
    v_s := greatest((v_seg->>0)::int, 0);
    v_e := least((v_seg->>1)::int, v_duration);

    if v_e <= v_s or (v_e - v_s) > 15 then
      v_ng := v_ng + 1;
      v_reason := 'INVALID_SEGMENT';
      continue;
    end if;

    v_union := v_union + int4multirange(int4range(v_s, v_e));
    v_ok := v_ok + 1;
  end loop;

  insert into video_watch_batches(student_id, content_id, segments, accepted, rejected, reject_reason, playback_rate)
    values (p_student_id, p_content_id, p_segments, v_ok, v_ng, v_reason, p_rate);

  if v_ok = 0 then raise exception 'NO_VALID_SEGMENT'; end if;

  insert into video_progress (student_id, content_id, watched, last_position_sec, max_rate, batch_count)
    values (p_student_id, p_content_id, v_union, upper(v_union), p_rate, 1)
  on conflict (student_id, content_id) do update
    set watched           = video_progress.watched + v_union,
        last_position_sec = greatest(upper(v_union), video_progress.last_position_sec),
        max_rate          = greatest(video_progress.max_rate, p_rate),
        batch_count       = video_progress.batch_count + 1,
        last_played_at    = now()
  returning video_progress.watched into v_merged;

  select coalesce(sum(upper(r) - lower(r)), 0)::int into v_total from unnest(v_merged) r;

  update video_progress vp
     set watched_sec  = v_total,
         progress     = round(v_total::numeric * 100 / v_duration, 2),
         completed_at = case
                          when vp.completed_at is null
                           and v_total::numeric * 100 / v_duration >= v_min then now()
                          else vp.completed_at end
   where vp.student_id = p_student_id and vp.content_id = p_content_id;

  return query
    select vp.progress, vp.watched_sec, v_duration
      from video_progress vp
     where vp.student_id = p_student_id and vp.content_id = p_content_id;
end $$;

revoke execute on function public.lms_record_watch_batch from anon, authenticated;
```

### 6.2 이수 판정 및 확정

```sql
create or replace function public.lms_finalize_completion(
  p_student_id text,
  p_program_id int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule     jsonb;
  v_min      numeric;
  v_name     text;
  v_mileage  int;
  v_type     text;
  v_total    int;
  v_passed   int;
  v_avg      numeric;
  v_snapshot jsonb;
  v_cert     text;
  v_granted  int := 0;
begin
  select e.completion_rule, e.name, e.completion_mileage
    into v_rule, v_name, v_mileage
    from extracurricular e where e.id = p_program_id;
  if v_rule is null then raise exception 'PROGRAM_NOT_FOUND'; end if;

  select s.student_type into v_type from students s where s.student_id = p_student_id;
  if v_type is null then raise exception 'STUDENT_NOT_FOUND'; end if;

  v_min := coalesce((v_rule->>'min_progress')::numeric, 90);

  if exists (select 1 from extracurricular_completions
              where student_id = p_student_id and extracurricular_id = p_program_id
                and revoked_at is null) then
    return jsonb_build_object('status', 'already_completed');
  end if;

  select count(*) filter (where c.is_required),
         count(*) filter (where c.is_required and coalesce(vp.progress, 0) >= v_min),
         round(avg(coalesce(vp.progress, 0)), 2),
         jsonb_agg(jsonb_build_object(
           'content_id', c.id, 'title', c.title, 'required', c.is_required,
           'progress', coalesce(vp.progress, 0),
           'watched_sec', coalesce(vp.watched_sec, 0),
           'duration_sec', c.duration_sec) order by c.content_order)
    into v_total, v_passed, v_avg, v_snapshot
    from extracurricular_contents c
    left join video_progress vp
      on vp.content_id = c.id and vp.student_id = p_student_id
   where c.extracurricular_id = p_program_id;

  if v_total = 0 or v_passed < v_total then
    return jsonb_build_object('status', 'incomplete',
      'required', v_total, 'passed', v_passed,
      'min_progress', v_min, 'contents', v_snapshot);
  end if;

  if coalesce((v_rule->>'require_survey')::boolean, false) then
    if not exists (select 1 from survey_responses sr
                    where sr.student_id = p_student_id
                      and sr.survey_id = (v_rule->>'survey_id')::int) then
      return jsonb_build_object('status', 'survey_required',
                                'survey_id', (v_rule->>'survey_id')::int);
    end if;
  end if;

  -- 마일리지는 내국인만
  if v_mileage > 0 and v_type = 'domestic' then
    v_granted := v_mileage;
  end if;

  v_cert := 'YS-' || to_char(now() at time zone 'Asia/Seoul', 'YYYY') || '-' ||
            lpad(nextval('extracurricular_completions_id_seq')::text, 6, '0');

  insert into extracurricular_completions
    (student_id, extracurricular_id, student_type, final_progress,
     contents_snapshot, rule_snapshot, mileage_granted, certificate_no)
  values (p_student_id, p_program_id, v_type, v_avg,
          v_snapshot, v_rule, v_granted, v_cert);

  -- status 는 기존 사용값인 '완료'만 사용한다 ('참여중' 도입하지 않음)
  update student_extracurricular
     set status = '완료', completed_at = now()
   where student_id = p_student_id and extracurricular_id = p_program_id;

  if v_granted > 0 then
    insert into mileage_records (student_id, points, reason, source_type, source_id)
    values (p_student_id, v_granted, '비교과 이수: ' || v_name, 'extracurricular', p_program_id)
    on conflict do nothing;
  end if;

  return jsonb_build_object('status', 'completed',
    'certificate_no', v_cert, 'final_progress', v_avg,
    'mileage_granted', v_granted, 'student_type', v_type);
end $$;

revoke execute on function public.lms_finalize_completion from anon, authenticated;
```

**유학생도 `extracurricular_completions`에는 정상 기록된다.** 마일리지 insert만 건너뛴다. 실적 집계는 내·외국인 동일하다.

`reason`을 `비교과 이수: {name}`으로 두면 기존 `비교과 신청: {name}`과 문자열이 달라 dedup 인덱스에 걸리지 않고, 통계에서 신청/이수를 구분할 수 있다.

---

## 7. 수강 상태 처리 (수정됨)

`student_extracurricular.status`는 **기존 사용값인 `신청` / `완료`만 사용한다.** `참여중`은 CHECK에 정의만 되어 있고 실사용 이력이 없으므로 도입하지 않는다. 기존 화면에서 어떻게 렌더링될지 보장할 수 없기 때문이다.

**학습 진행 상태는 진도 데이터로부터 계산한다.**

```ts
type LmsStatus = '신청' | '학습중' | '이수완료';

function deriveStatus(row: {
  hasCompletion: boolean;
  watchedSec: number;
}): LmsStatus {
  if (row.hasCompletion) return '이수완료';
  if (row.watchedSec > 0) return '학습중';
  return '신청';
}
```

DB 상태값을 건드리지 않으므로 기존 비교과 화면·통계가 영향받지 않는다. `/lms` 화면에서만 '학습중' 표시가 추가된다.

---

## 8. Cloudflare Stream 연동

### 8.1 업로드 (2단계)

**1단계 — 지금**: 담당자가 Cloudflare 대시보드에서 업로드 → 생성된 video uid를 관리자 화면에 붙여넣기. 시스템이 uid로 API를 조회해 `duration_sec`, 썸네일을 자동 저장.

**2단계 — 나중**: Direct Creator Upload. 서버가 일회용 업로드 URL을 발급하면 브라우저에서 Cloudflare로 직접 전송된다. 대용량 파일이 Vercel을 경유하지 않는다.

### 8.2 필수 보안 설정

모든 영상에 적용한다.

- `requireSignedURLs: true` — 링크만으로는 재생 불가
- `allowedOrigins: ["ytus-competency-assessment.vercel.app"]`

이 두 설정이 YouTube 미등록 방식과의 결정적 차이다. 미등록은 URL을 아는 누구나 로그인 없이 시청할 수 있어 강사 영상 보호가 되지 않는다.

### 8.3 서명 토큰 발급

```
POST /api/lms/playback-token
body: { contentId }
resp: { token, expiresAt }
```

서버 처리 순서:

1. 세션에서 `student_id` 확보
2. 해당 학생이 이 콘텐츠의 프로그램에 신청되어 있는지 확인 (`student_extracurricular`)
3. 프로그램의 `target_audience`가 학생의 `student_type`과 맞는지 확인
4. Cloudflare 서명 키로 JWT 생성 (**유효기간 4시간**, `sub` = video uid)
5. 토큰 반환

유효기간을 넉넉히 두는 이유: 콘텐츠당 1회만 발급되므로 재생 중 만료되면 안 된다.

### 8.4 플레이어

Cloudflare Stream SDK는 **iframe + 외부 스크립트** 방식이라 Next.js 번들에 포함되지 않는다.

```
https://embed.cloudflarestream.com/embed/sdk.latest.js
```

`/lms/[id]/watch/[cid]` 페이지에서만 `next/script`로 로드한다. 역량진단·마일리지 페이지 방문자는 플레이어 코드를 받지 않는다. **hls.js를 직접 쓰지 않는다** (번들 100KB 증가).

---

## 9. 진도 추적 (배치)

### 9.1 클라이언트 동작

- 재생 중 **10초 단위로 구간을 로컬 배열에 축적**
- **60초마다 6개 구간을 한 번에 전송** (일시정지·페이지 이탈 시 즉시 flush)
- 전송 실패 시 큐 유지, 다음 성공 시 함께 전송 (최대 10구간)
- `document.visibilitychange` → 탭 이탈 시 자동 일시정지
- 배속 셀렉트는 1.0 / 1.25 / 1.5만 노출
- 새로고침 시 `last_position_sec`부터 이어보기
- 진행바 시킹은 **허용하되 진도에 미반영**. "건너뛴 구간은 진도에 포함되지 않습니다" 안내 필수 (시킹 자체를 막으면 복습 불가로 불만이 크다)

### 9.2 부하

학생 1,000명 · 영상 40분 기준

| 방식 | 영상 1편당 | 연간(4편 × 1,000명) |
|---|---|---|
| 10초마다 전송 | 240회 | 96만 |
| **60초 배치** | **40회** | **16만** |

마감일에 200명 동시 시청 시 초당 3.3 요청. **영상 트래픽은 브라우저 ↔ Cloudflare 직결이므로 Vercel 대역폭 소모는 사실상 0이다.**

### 9.3 부정 시청 방지

| 계층 | 방식 |
|---|---|
| 구조 | **구간 합집합** — 같은 구간 반복 재생은 진도에 무의미 |
| 서버 | 15초 초과 / 역방향 구간 / 1.5배 초과 배속 → 거부 후 로그 |
| 서버 | `last_played_at - first_played_at < watched_sec / max_rate` 이면 이상치 |
| 클라이언트 | 탭 비활성 자동 정지, 배속 상한, 진도율 클라이언트 계산 금지 |
| 운영 | `video_watch_batches` 원본 보존 |
| 억제 | 플레이어 위 **학번·이름 반투명 워터마크**, 5분마다 위치 이동 |

완벽한 차단은 불가능하다. 목표는 **감사 대응이 가능한 합리적 증빙**이다.

---

## 10. API 계약

모두 Route Handler에서 service role로 실행. **세션에서 `student_id`를 확보하며 요청 body의 값은 신뢰하지 않는다.**

### 학생

| Method | Path | Body | 응답 |
|---|---|---|---|
| GET | `/api/lms/programs` | – | 영상형 목록 (student_type 필터) + 내 진도 |
| GET | `/api/lms/programs/[id]` | – | 커리큘럼 + 콘텐츠별 진도 + 이수 상태 |
| POST | `/api/lms/playback-token` | `{contentId}` | `{token, expiresAt}` |
| POST | `/api/lms/watch` | `{contentId, segments, rate}` | `{progress, watchedSec, durationSec}` |
| POST | `/api/lms/complete` | `{programId}` | `lms_finalize_completion` 결과 |
| GET | `/api/lms/resume` | – | 이어보기 1건 |
| GET | `/api/lms/certificate/[no]` | – | 수료증 PDF |

### 관리자

| Method | Path | 권한 |
|---|---|---|
| POST | `/api/admin/lms/contents` | `canManageLms` — uid 등록 시 duration 자동 조회 |
| PATCH | `/api/admin/lms/contents/[id]` | `canManageLms` |
| DELETE | `/api/admin/lms/contents/[id]` | `canManageLms` |
| GET | `/api/admin/lms/programs/[id]/progress` | `canViewLmsProgress` |
| POST | `/api/admin/lms/completions/revoke` | `canManageLms` — 마일리지 **음수 상계** |
| GET | `/api/admin/lms/export` | `canViewLmsProgress` — student_type 분리 |

---

## 11. 화면 명세

### 11.1 라우팅

```
/lms                                 학습 홈 — 학습중 / 신청가능 / 이수완료
/lms/[programId]                     커리큘럼
/lms/[programId]/watch/[contentId]   플레이어 (몰입형)
/lms/my                              내 학습 현황 + 수료증
/admin/lms                           영상 프로그램 관리
/admin/lms/[programId]/contents      콘텐츠 등록·순서
/admin/lms/[programId]/progress      진도 현황 + 엑셀
```

### 11.2 레이아웃

`/lms`는 역량관리시스템 안에 있으나 **전용 사이드바 레이아웃**을 갖는다. 플레이어 페이지는 헤더·푸터 제거, 좌측 플레이어 / 우측 커리큘럼(모바일은 하단 접이식).

### 11.3 기존 화면과의 연결 (현재 끊긴 지점)

1. **비교과 신청 페이지**: `delivery_type='video'`이면 배지 표시. 신청 후 **"학습 시작"** 버튼 노출 → `/lms/[id]`. **status는 `신청` 그대로 둔다.**
2. **메인 대시보드**: "이어보기" 카드 1개 (`/api/lms/resume`)
3. **역량진단 결과**: 하위 2개 역량의 `core_competency_tags`와 매칭되는 프로그램 추천 (내국인만)
4. **마일리지 내역**: `비교과 이수:` 항목이 자연스럽게 표시 (내국인만)

### 11.4 유학생 화면

**대시보드에서 마일리지 위젯을 렌더링하지 않는다.** 0점 표시는 "왜 안 쌓이냐" 문의를 유발한다. 그 자리에 **이수 완료 프로그램 수**와 **수료증**을 배치한다.

### 11.5 관리자 화면 필수 사항

- **영상 길이 자동 조회** — 수기 입력란 금지
- **등록 후 미리보기 재생** — 잘못된 uid나 서명 URL 오류를 담당자가 즉시 발견
- **순서 변경은 번호 입력으로 충분** — 드래그 정렬은 과함
- **영상형 선택 시 정원 입력란 비활성화**
- 프로그램별 `completion_rule` 편집
- 이수 **수동 승인/취소** — 예외는 반드시 생긴다

---

## 12. 다국어

전체 사이트 영어화는 불필요. 유학생 동선만 처리한다.

```
로그인 → /lms 목록 → 커리큘럼 → 플레이어 → 이수 완료
```

`next-intl` 등으로 `ko` / `en` 우선. 프로그램 표기는 `extracurricular_i18n`에서 `preferred_locale`에 맞는 행을 조회하고 없으면 한국어 폴백.

**자막은 보류.** 착수 시 순서: Whisper STT → 사람 검수 → Claude API 번역 → `reviewed` 전환 → Cloudflare 트랙 업로드. 자막은 저장 분수에 포함되지 않아 비용이 늘지 않는다. 우선순위는 유학생 필수 프로그램 3~5편의 영어 자막.

---

## 13. 비용

**저장 $5 / 1,000분 (선불)**, **전송 $1 / 1,000분 (후불)**. 대역폭 별도 과금 없음.

학생 1,000명 기준

| 시나리오 | 저장 | 전송 | 연 비용 |
|---|---|---|---|
| 영상 40편(30분), 1인당 연 4편 | 1,200분 | 12만분 | 약 $200 |
| 영상 80편, 1인당 연 6편(35분) | 2,400분 | 21만분 | 약 $390 |

재시청 여유 30% 포함해도 **연 60만원 이내**. 첫 해 예산 100만원이면 충분하다.
**저장은 선불이므로 업로드가 몰리는 달에는 블록을 미리 구매**해야 한다.

---

## 14. 구현 순서

1. **마이그레이션 001~008 적용**
2. **DB 함수 2개 생성** + 더미 데이터 검증
3. **권한 유틸** (`lib/auth/lms-permissions.ts`)
4. **Cloudflare 연동 유틸** (`lib/cloudflare-stream.ts`) — 메타 조회, 서명 토큰
5. **관리자 콘텐츠 CRUD** — 영상 등록이 안 되면 학생 화면 테스트 불가하므로 먼저
6. **API Route** (`programs` / `programs/[id]` / `playback-token`)
7. **학생 `/lms` 목록 + 커리큘럼**
8. **플레이어 + 배치 진도 전송** — 가장 까다로운 단계
9. **이수 확정 → 마일리지 분기 → 수료증**
10. **기존 화면 연결** (신청 버튼, 이어보기, 진단 추천)
11. **유학생 트랙 분기** (목록 필터, 마일리지 위젯 숨김, 통계 분리)
12. **관리자 진도 현황 + 엑셀** (`student_type` 분리)
13. **운영 점검 자동화** (15장)

---

## 15. 운영 점검 자동화 (LMS 안정화 후)

**자동 수정은 도입하지 않는다.** 감지는 자동, 판단과 수정은 사람이 한다.

```sql
create table if not exists public.system_health_log (
  id         bigserial primary key,
  check_name text not null,
  severity   text not null check (severity in ('info','warning','critical')),
  detail     jsonb,
  checked_at timestamptz default now()
);
```

pg_cron 매일 새벽 실행.

| 점검 | 심각도 |
|---|---|
| 이수 조건 충족했으나 `completions` 없음 | critical |
| 내국인 `completions` 있으나 마일리지 없음 | critical |
| **24시간 내 진도 기록 0건** | critical |
| `rejected` 배치 급증 | warning |
| 실경과시간 < 시청시간 | warning |

**"24시간 내 진도 기록 0건"이 가장 중요하다.** 플레이어가 조용히 죽으면 학생은 문의 없이 이탈하고, 마감 후에 발견되면 수습이 불가능하다.

---

## 16. 미결 사항

- [ ] 영상 비교과 주관 부서 확정 → `LMS_MANAGER_ROLES` 조정
- [ ] 영상 이수 마일리지 점수 (프로그램별 / 일괄)
- [ ] 이수 기준 90%가 학내 규정과 부합하는지
- [ ] 유학생용 핵심역량 항목 정의 (교무·국제교류처)
- [ ] 유학생 진단 문항 역번역 검증 주체
- [ ] 수료증 서식 및 직인 사용 가능 여부
- [ ] 강사 영상 온라인 게시 동의 범위
- [ ] Cloudflare 결제 수단 및 학교 회계 처리
- [ ] `center_reservation` 마일리지 `source_id` 채우기 (별건)
- [ ] `extracurricular.category` 표기 정규화 (별건)
