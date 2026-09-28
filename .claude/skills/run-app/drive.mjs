/**
 * 로그인한 상태로 브라우저를 띄워 화면을 직접 조작한다.
 *
 *   npm install playwright-core --prefix /tmp/pw --silent
 *   ln -sfn /tmp/pw/node_modules/playwright-core node_modules/playwright-core
 *   node .claude/skills/run-app/drive.mjs
 *
 * 저장소 루트에서 실행한다 (.env.local 과 node_modules 를 쓴다).
 * 시나리오는 맨 아래 main() 만 고쳐 쓰면 된다.
 */
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

export const BASE = process.env.BASE ?? "http://localhost:3000";
export const SHOTS = "/tmp/shots";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter(Boolean)
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);

export const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// supabase-js 의 기본 저장 키: sb-{URL 첫 서브도메인}-auth-token
const STORAGE_KEY = `sb-${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

/** 비밀번호를 쓰지 않고 세션만 얻는다. 계정 자격증명은 바뀌지 않는다. */
async function sessionFor(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`${email}: ${error.message}`);
  const v = await anon.auth.verifyOtp({ email, token: data.properties.email_otp, type: "magiclink" });
  if (v.error) throw new Error(`${email}: ${v.error.message}`);
  return v.data.session;
}

/** 로그인 화면을 거치지 않고 세션을 심은 새 탭을 연다. 콘솔 오류도 같이 모은다. */
export async function pageFor(browser, email) {
  const session = await sessionFor(email);
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(session)]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  return { page, ctx, errors };
}

export async function launch() {
  fs.mkdirSync(SHOTS, { recursive: true });
  return chromium.launch({ channel: "chrome", headless: true });   // 시스템 Chrome. 내려받지 않는다
}

// ---------------------------------------------------------------------------
// 시나리오 — 영상 자료를 붙이고, 학생이 받고, 다시 지운다.
// 운영 DB 를 쓰므로 마지막에 반드시 원상복구한다.
// ---------------------------------------------------------------------------
async function main() {
  const PROGRAM_ID = 59, CONTENT_ID = 21;
  const PDF = "/tmp/첨부확인.pdf";
  fs.writeFileSync(PDF, "%PDF-1.4\ntrailer<</Root 1 0 R>>\n%%EOF\n");

  const browser = await launch();
  const mgr = await pageFor(browser, "admin@temp.com");

  await mgr.page.goto(`${BASE}/admin/lms/${PROGRAM_ID}/contents`, { waitUntil: "networkidle", timeout: 90000 });
  await mgr.page.getByRole("button", { name: "자료 추가" }).first().waitFor({ timeout: 30000 });

  // 파일 input 은 숨겨져 있다. 버튼을 실제로 눌러야 uploadTargetRef 가 채워진다.
  const [chooser] = await Promise.all([
    mgr.page.waitForEvent("filechooser"),
    mgr.page.getByRole("button", { name: "자료 추가" }).first().click(),
  ]);
  await chooser.setFiles(PDF);
  await mgr.page.getByRole("button", { name: /첨부확인\.pdf/ }).waitFor({ timeout: 60000 });
  await mgr.page.screenshot({ path: `${SHOTS}/관리자.png` });
  console.log("관리자 업로드 ok");

  await admin.from("student_extracurricular").insert({ student_id: "lmstest02", extracurricular_id: PROGRAM_ID, status: "신청" });
  const stu = await pageFor(browser, "lmstest02@temp.com");
  await stu.page.goto(`${BASE}/lms/${PROGRAM_ID}`, { waitUntil: "networkidle", timeout: 90000 });

  const [download] = await Promise.all([
    stu.page.waitForEvent("download", { timeout: 60000 }),
    stu.page.getByRole("button", { name: /첨부확인\.pdf/ }).first().click(),
  ]);
  const same = Buffer.compare(fs.readFileSync(await download.path()), fs.readFileSync(PDF)) === 0;
  await stu.page.screenshot({ path: `${SHOTS}/학생.png`, fullPage: true });
  console.log("학생 다운로드:", download.suggestedFilename(), same ? "원본과 동일" : "불일치!!");

  // --- 원상복구 ---
  mgr.page.on("dialog", (d) => d.accept());
  await mgr.page.reload({ waitUntil: "networkidle" });
  await mgr.page.locator('button[title="첨부 삭제"]').first().click();
  await mgr.page.getByRole("button", { name: /첨부확인\.pdf/ }).first().waitFor({ state: "detached", timeout: 30000 });
  await admin.from("student_extracurricular").delete().eq("student_id", "lmstest02").eq("extracurricular_id", PROGRAM_ID);

  console.log("남은 행:", (await admin.from("content_attachments").select("id")).data.length,
    "· 남은 객체:", (await admin.storage.from("lms-attachments").list(`${PROGRAM_ID}/${CONTENT_ID}`)).data.map((o) => o.name));

  // localhost 에서는 Cloudflare 재생 차단과 미신청자 게시판 403 이 정상이다
  const noise = /favicon|Download the React|403/i;
  const errs = [...mgr.errors, ...stu.errors].filter((e) => !noise.test(e));
  console.log("콘솔 오류:", errs.length ? errs : "없음");

  await browser.close();
  fs.unlinkSync(PDF);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
