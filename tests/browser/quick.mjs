// Quick practice, background AI jobs and Word/PPT import, with the deterministic mock AI
// (not real-model QA).
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildZip, docxFiles, pptxFiles } from "../fixtures/office-fixture.mjs";

const out = "qa-artifacts/quick-browser";
await mkdir(out, { recursive: true });
const port = "5191",
  base = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, ["tests/fixtures/mock-ai-server.mjs"], {
  env: { ...process.env, DIGEST_QA_PORT: port },
  stdio: "pipe",
  windowsHide: true,
});
await new Promise((r) => server.stdout.once("data", r));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const pass = (s) => console.log("PASS", s);
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
async function developer(endpoint) {
  await page.goto(base + "/app/settings");
  await page.getByText("开发者选项", { exact: true }).click();
  await page.getByRole("button", { name: "管理开发者服务" }).click();
  await page.getByLabel("Chat Completions 地址").fill(base + endpoint);
  await page.getByLabel("模型名称", { exact: true }).fill("QA fixture");
  await page.getByLabel("API Key", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
}
// Hold model calls until released, to observe running jobs.
let release = () => {};
async function hold(pattern) {
  const gate = new Promise((r) => (release = r));
  await page.route(pattern, async (route) => {
    await gate;
    await route.fallback().catch(() => {});
  });
}
try {
  await developer("/loop/v1");
  await page.goto(base + "/app/");
  await page.locator(".quick-practice").waitFor();
  assert.ok(await page.getByLabel("课程名称", { exact: true }).isVisible());
  await page.screenshot({ path: out + "/home-first.png", fullPage: true });
  await page.getByLabel("选择材料文件").setInputFiles({
    name: "lecture.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(await buildZip(docxFiles())),
  });
  await page.locator(".quick-chosen.is-ready").waitFor();
  assert.match(await page.locator(".quick-chosen").innerText(), /心理学导论讲义 · 9 段 · 2 章/);
  await page.getByRole("button", { name: /没有题目/ }).click();
  await page.locator(".quick-suggestions .suggested-task").first().waitFor();
  await page.getByLabel("题目", { exact: true }).fill("用认知失调解释：为什么报酬越少，态度改变可能越大？");
  await page.getByRole("button", { name: "开始作答" }).click();
  await page.waitForURL("**/app/tasks/*");
  await page.getByLabel("先写下你自己的答案", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement?.closest("label")?.textContent?.includes("先写下你自己的答案")),
    true,
  );
  assert.ok(!page.url().includes("start=1"));
  pass("quick practice: Word material + suggested questions + own question → answering, no course form");

  const taskUrl = page.url();
  await page.getByLabel("先写下你自己的答案", { exact: true }).fill("报酬少的时候人更难用外部理由解释行为，所以改变态度。");
  await hold("**/loop/v1/chat/completions");
  await page.getByRole("button", { name: "保存答案并获取反馈", exact: true }).click();
  await page.getByRole("button", { name: "取消反馈", exact: true }).waitFor();
  await page.getByRole("link", { name: "资料库" }).first().click();
  await page.locator(".job-summary").waitFor();
  assert.match(await page.locator(".job-summary").innerText(), /进行中 1/);
  await page.screenshot({ path: out + "/job-running.png" });
  release();
  await page.locator(".toast-action").waitFor();
  assert.match(await page.locator(".toast").innerText(), /已完成/);
  await page.unroute("**/loop/v1/chat/completions");
  await page.locator(".toast-action").click();
  await page.locator(".feedback-item.is-key").waitFor();
  assert.match(await page.locator(".key-label").innerText(), /最需要先改/);
  await page.screenshot({ path: out + "/feedback-key.png", fullPage: true });
  pass("feedback keeps running after leaving the task; indicator and toast lead back; key issue first");

  await page.goto(base + "/app/");
  await page.locator(".quick-practice").waitFor();
  await page.locator(".quick-library").selectOption({ label: "心理学导论讲义" });
  await page.getByLabel("题目", { exact: true }).fill("社会认同理论如何解释群体偏好？");
  await page.locator(".quick-answer > summary").click();
  await page.getByLabel("我的答案", { exact: true }).fill("人们通过所属群体界定自我，所以会偏爱自己的群体。");
  await page.getByRole("button", { name: "提交答案，获取反馈" }).click();
  await page.waitForURL(/attempt=/);
  await page.locator(".feedback-item").first().waitFor();
  assert.ok(!page.url().includes("run=feedback"));
  assert.equal(await page.locator(".original-answer .training-prose").textContent(), "人们通过所属群体界定自我，所以会偏爱自己的群体。");
  pass("bringing an existing answer saves it first and runs feedback directly");

  await page.goto(base + "/app/courses");
  await page.locator(".course-card", { hasText: "快速练习" }).waitFor();
  assert.equal(await page.locator(".course-card", { hasText: "快速练习" }).count(), 1);
  pass("both quick practices share one auto-created course");

  await developer("/success/v1");
  await page.goto(base + "/app/library");
  await page.getByRole("button", { name: /导入资料/ }).first().click();
  await page.locator("#file-input").setInputFiles({
    name: "philosophy.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: Buffer.from(await buildZip(pptxFiles())),
  });
  await page.locator("#file-status.ready").waitFor();
  assert.match(await page.locator("#import-structure").innerText(), /识别到 2 章/);
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page.locator(".document-row", { hasText: "philosophy" }).waitFor();
  assert.equal(await page.locator(".doc-type", { hasText: "PPT" }).count(), 1);
  await page.locator(".doc-title", { hasText: "philosophy" }).click();
  await page.locator(".source-paragraph.heading-2").first().waitFor();
  assert.equal(await page.locator(".source-paragraph.heading-2").count(), 2);
  pass("PPT import: sections become chapters, slide titles become headings in the Reader");

  const readerUrl = page.url();
  await hold("**/success/v1/chat/completions");
  await page.getByRole("button", { name: "开始研读", exact: true }).click();
  await page.locator(".analysis-running").waitFor();
  await page.getByRole("link", { name: /资料库/ }).first().click();
  await page.locator(".job-summary").waitFor();
  release();
  await page.locator(".toast-action").waitFor();
  await page.unroute("**/success/v1/chat/completions");
  await page.goto(readerUrl);
  await page.locator(".reading-claim").first().waitFor();
  pass("AI reading keeps running after leaving the Reader and is there on return");

  await page.goto(base + "/app/settings");
  await page.locator(".timing-table").waitFor();
  assert.ok((await page.locator(".timing-table tr").count()) >= 3);
  pass("settings shows local AI waiting times (durations only)");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/app/");
  await page.locator(".quick-practice").waitFor();
  assert.ok(await overflow());
  await page.screenshot({ path: out + "/home-390.png", fullPage: true });
  pass("home with quick practice has no overflow at 390");
  assert.deepEqual(errors, []);
  pass("no page errors");
} catch (e) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true }).catch(() => {});
  throw e;
} finally {
  await browser.close();
  server.kill();
}
