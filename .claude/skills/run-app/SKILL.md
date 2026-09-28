---
name: run-app
description: YOUNG SHINY(영남신학대 역량관리시스템)를 로컬에서 띄우고 브라우저로 직접 조작해 확인한다. 로그인한 관리자·학생 화면을 열어야 할 때 쓴다 — 비밀번호 없이 세션을 심는 방법, 파일 업로드·다운로드를 실제로 클릭해 보는 방법, localhost 에서만 나는 함정들이 들어 있다.
---

# 앱 띄우고 브라우저로 확인하기

Next.js + Supabase. 커스텀 인증이라 이메일이 `{학번}@temp.com` 형식이다.

## ⚠️ 로컬과 운영이 같은 Supabase 를 쓴다

`.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` 은 운영 프로젝트(`ytus_project`)다.
**로컬에서 만든 데이터는 운영 데이터다.** 확인이 끝나면 반드시 지운다.
운영 영상 프로그램은 `id=59` 하나뿐이라 여기에 붙인 자료는 실제 학생에게 보인다.

## 1. 띄우기

```bash
lsof -ti:3000 -sTCP:LISTEN | xargs kill 2>/dev/null
(npm run dev > /tmp/dev.log 2>&1 &)
for i in $(seq 1 60); do curl -sf http://localhost:3000/login >/dev/null && break; sleep 1; done
```

macOS 에는 `timeout` 이 없다. `sleep 5` 대신 위처럼 포트를 폴링한다.
멈출 때도 `lsof ... | xargs kill` 을 쓴다 — `npm run dev &` 의 `$!` 는 npm 래퍼라 서버가 안 죽는다.
`pkill -f` 는 에이전트 자기 명령줄까지 잡을 수 있으니 쓰지 않는다.

## 2. 브라우저 드라이버

`playwright-core` 를 **저장소 바깥에** 설치하고 심볼릭 링크로 쓴다. `package.json` 을 건드리지 않기 위해서다.
브라우저는 내려받지 않고 설치된 Chrome 을 `channel: "chrome"` 으로 쓴다.

```bash
npm install playwright-core --prefix /tmp/pw --silent
ln -sfn /tmp/pw/node_modules/playwright-core node_modules/playwright-core
# 끝나면: rm -f node_modules/playwright-core && rm -rf /tmp/pw
```

## 3. 로그인 — 비밀번호 없이 세션을 심는다

계정 비밀번호를 모르고 물어볼 일도 아니다. service role 로 매직링크를 만들어 세션만 받아
`localStorage` 에 넣는다. 계정 자격증명은 바뀌지 않는다.

supabase-js 는 세션을 `sb-{프로젝트ref}-auth-token` 키에 **평문 JSON** 으로 둔다
(`setItemAsync` = `JSON.stringify`). ref 는 Supabase URL 의 첫 서브도메인이다.

`drive.mjs` 의 `pageFor(email)` 이 이걸 다 해 준다. 그대로 쓰면 된다.

```bash
node .claude/skills/run-app/drive.mjs          # 기본 시나리오 실행
```

**계정** — `admin@temp.com`(관리자) · `lmstest02@temp.com`(내국인 학생) ·
`lmstest01@temp.com`(유학생). lmstest 두 개는 테스트 픽스처라 지우지 않는다.

## 4. 대표 시나리오 — 영상 자료 첨부

`drive.mjs` 에 들어 있다. 요지는 두 가지다.

**업로드** — 파일 input 이 숨겨져 있고 버튼이 대신 클릭한다. `setInputFiles` 를 input 에 직접
꽂으면 `uploadTargetRef` 가 비어 있어 아무 일도 일어나지 않는다. 버튼을 실제로 눌러
파일 선택 창 이벤트를 받아야 한다.

```js
const [chooser] = await Promise.all([
  page.waitForEvent("filechooser"),
  page.getByRole("button", { name: "자료 추가" }).first().click(),
]);
await chooser.setFiles("/tmp/자료.pdf");
```

**다운로드** — 서명 URL 이 `Content-Disposition: attachment` 로 내려와 페이지 이동 없이 받아진다.

```js
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 60000 }),
  page.getByRole("button", { name: /자료\.pdf/ }).click(),
]);
fs.readFileSync(await download.path());   // 원본과 바이트 비교
```

## 5. 영상 재생까지 확인할 때

**`window.Stream(iframe).play()` 로는 재생이 시작되지 않는다.** 페이지가 이미 만들어 둔
플레이어와 별개의 래퍼가 생길 뿐이고, 그 래퍼의 `currentTime` 은 0 에 머문다.
게다가 `play()` 가 돌려주는 프로미스는 풀리지 않아 `page.evaluate` 가 그대로 멈춘다
(이걸로 7분을 날렸다). 재생 버튼도 `.vjs-big-play-button` 으로는 잡히지 않는다.

**iframe 안의 `<video>` 를 직접 잡는다.** Playwright 는 교차 출처 프레임 안에도 들어간다.

```js
const frame = page.frameLocator("iframe").first();
await frame.locator("video").waitFor();
await frame.locator("video").evaluate((v) => { v.muted = true; v.play()?.catch(() => {}); });

// 진짜 상태는 여기서 본다. SDK 래퍼 말고 video 요소가 근거다
const s = await frame.locator("video").evaluate((v) => ({ t: v.currentTime, paused: v.paused, err: v.error?.code ?? null }));
```

헤드리스 크롬은 제스처 없이 재생을 막으므로 `chromium.launch({ channel: "chrome",
args: ["--autoplay-policy=no-user-gesture-required"] })` 로 띄운다.

**진도는 60초마다 나간다.** 75초를 재생하면 10초 구간 5개가 한 배치로 올라가
`video_progress.watched_sec = 50` 이 된다. 진행 중이던 6번째 구간은 포함되지 않는다.
재생 시간과 기록이 정확히 같지 않은 것이 정상이다.

확인이 끝나면 `video_progress`·`video_watch_batches`·`student_extracurricular` 를 지운다.

## 6. localhost 에서만 나는 것들 — 버그가 아니다

- **`This video has not been configured to be allowed on this domain.`**
  Cloudflare 가 허용 도메인을 **Referer 로** 검사하는데 localhost 가 목록에 없다.
  재생만 막히고 나머지 화면(진도 UI, 첨부, 커리큘럼)은 정상이다. 재생까지 봐야 하면 배포본에서 본다.
- **미신청자 화면의 `/api/lms/posts` 403** — 게시판이 미신청자를 막는 정상 동작이다.
  화면에는 "신청한 학생만 이용할 수 있는 게시판입니다." 로 나온다.
- 첫 진입은 라우트를 그때 컴파일하므로 느리다. 타임아웃을 60~90초로 잡는다.

## 7. 배포본 확인

CLI 토큰이 만료돼 있으면 `npx vercel ls` 가 `token is not valid` 로 떨어진다.
직접 로그인해야 한다 — 세션에 `! npx vercel login` 을 쳐 달라고 요청한다.

토큰 없이도 배포 여부는 확인된다. 새 라우트에 인증 없이 요청해서 **401 JSON** 이 오면 배포된 것이고,
**404 HTML** 이면 아직 옛 빌드다.

```bash
curl -s -o- -w ' [%{http_code}]' https://ytus-competency-assessment.vercel.app/api/lms/attachments/1
# {"error":"인증이 필요합니다."} [401]  → 배포됨
```

`drive.mjs` 의 `BASE` 만 운영 주소로 바꾸면 같은 시나리오를 배포본에 돌릴 수 있다.
운영 데이터를 건드리므로 **끝나면 반드시 지운다.**

## 8. 치우기

```bash
lsof -ti:3000 -sTCP:LISTEN | xargs kill 2>/dev/null
rm -f node_modules/playwright-core && rm -rf /tmp/pw /tmp/shots
git status --short          # 비어 있어야 한다
```

DB·스토리지에 남긴 것도 확인한다. `content_attachments` 행, `lms-attachments` 버킷 객체,
`student_extracurricular` 의 테스트 신청 기록.
