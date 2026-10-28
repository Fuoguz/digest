// Select a passage in the Reader → AI reading → saved with the document → reopened.
// Uses the deterministic mock AI as a developer endpoint (not real-model QA); the
// result must say so instead of passing as the trial service.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const out = "qa-artifacts/selection-browser";
await mkdir(out, { recursive: true });
const port = "5193",
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
async function developer(endpoint) {
  await page.goto(base + "/app/settings");
  await page.getByText("开发者选项", { exact: true }).click();
  await page.getByRole("button", { name: "管理开发者服务" }).click();
  await page.getByLabel("Chat Completions 地址").fill(base + endpoint);
  await page.getByLabel("模型名称", { exact: true }).fill("QA fixture");
  await page.getByLabel("API Key", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
}
const PASSAGE = "间隔练习把复习分布在多天进行";
const SOURCE = [
  "第一段：主动回忆要求学习者先尝试回答，再查看答案。",
  "第二段：" + PASSAGE + "，比集中在一天复习保持得更久，但每次都要真正回忆。",
  "第三段：引用必须来自原文，不能用模型改写的内容替代。",
].join("\n\n");
// Select text inside one paragraph the way a mouse drag would.
async function select(paragraphIndex, text) {
  await page.evaluate(
    ({ paragraphIndex, text }) => {
      const node = document.querySelector(
        `.source-paragraph[data-paragraph-index="${paragraphIndex}"] .paragraph-text`,
      ).firstChild;
      const start = node.data.indexOf(text);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    },
    { paragraphIndex, text },
  );
  await page.locator(".selection-action:not([hidden])").waitFor();
}
const stored = () =>
  page.evaluate(async () => {
    const db = await new Promise((r) => {
      const q = indexedDB.open("digest-v02");
      q.onsuccess = () => r(q.result);
    });
    const all = (store) =>
      new Promise((r) => {
        const q = db.transaction(store).objectStore(store).getAll();
        q.onsuccess = () => r(q.result);
      });
    const value = { results: await all("readingResults"), activities: await all("activities") };
    db.close();
    return value;
  });

try {
  await developer("/success/v1");
  await page.goto(base + "/app/library");
  await page.getByRole("button", { name: /导入资料/ }).first().click();
  await page.locator("#file-input").setInputFiles({ name: "spacing.txt", mimeType: "text/plain", buffer: Buffer.from(SOURCE) });
  await page.locator("#file-status.ready").waitFor();
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page.locator(".doc-title", { hasText: "spacing" }).click();
  await page.locator(".source-paragraph").first().waitFor();
  const readerURL = page.url().split("?")[0];

  // 1. Select → the bar offers AI reading of exactly that passage.
  await select(1, PASSAGE);
  assert.match(await page.locator(".selection-action").innerText(), /AI 研读选段/);
  await page.screenshot({ path: out + "/selection-bar.png" });
  pass("selecting text in the Reader offers “AI 研读选段”");

  // 2–4. Run it; the model receives the selection; evidence is checked against the source.
  const bodies = [];
  await page.route("**/success/v1/chat/completions", async (route) => {
    bodies.push(route.request().postData());
    await route.fallback();
  });
  await page.getByRole("button", { name: "AI 研读选段" }).click();
  await page.locator(".focus-passage").waitFor();
  const prompt = JSON.parse(JSON.parse(bodies[0]).messages.find((m) => m.role === "user").content);
  assert.equal(prompt.focus.text, PASSAGE);
  assert.deepEqual(prompt.focus.paragraphIndexes, [1]);
  assert.deepEqual(prompt.document.paragraphs.map((p) => p.paragraphIndex), [0, 1, 2]);
  assert.equal(await page.locator(".focus-quote").innerText(), PASSAGE);
  const card = page.locator(".reading-claim", { hasText: "选段解读" });
  assert.match(await card.locator(".evidence-location").first().innerText(), /出自选段/);
  assert.equal(await page.evaluate(() => CSS.highlights.has("digest-focus")), true);
  pass("the model received the passage with one paragraph of context; notes quote it and the passage is highlighted");

  const provenance = await page.locator(".reading-provenance").innerText();
  assert.match(provenance, /开发者服务/);
  assert.match(provenance, new RegExp("127\\.0\\.0\\.1:" + port));
  assert.match(provenance, /不是试用服务/);
  pass("a mock/developer result is labelled as such, never as the trial service");
  await page.screenshot({ path: out + "/passage-reading.png" });

  // 5. Saved with the document; no material text in local events.
  const data = await stored();
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].scope.focus.text, PASSAGE);
  assert.deepEqual(data.results[0].provenance, { service: "developer", host: "127.0.0.1:" + port, model: "QA fixture" });
  assert.ok(!JSON.stringify(data.activities).includes(PASSAGE.slice(0, 6)));
  assert.ok(data.activities.some((a) => a.type === "reading_completed" && a.selection === true));
  pass("the reading is stored with its passage and source; activity records carry no passage text");

  // 6. Reopen after a reload.
  await page.unroute("**/success/v1/chat/completions");
  await page.reload();
  await page.locator(".focus-passage").waitFor();
  assert.equal(await page.locator(".focus-quote").innerText(), PASSAGE);
  pass("after a reload the passage reading is shown again");

  // A whole-text reading, then the same passage again opens the stored reading instead of a new call.
  await page.getByText("研读其他范围", { exact: true }).click();
  await page.getByRole("button", { name: "按此范围研读" }).click();
  await page.locator(".reading-records select").waitFor();
  assert.equal(await page.locator(".focus-passage").count(), 0);
  let calls = 0;
  await page.route("**/success/v1/chat/completions", async (route) => {
    calls++;
    await route.fallback();
  });
  await select(1, PASSAGE);
  await page.getByRole("button", { name: "查看这段的研读" }).click();
  await page.locator(".focus-passage").waitFor();
  assert.match(page.url(), /[?&]result=/);
  assert.equal(calls, 0);
  assert.equal(await page.evaluate(() => CSS.highlights.has("digest-focus")), true);
  pass("selecting the same passage again opens its stored reading without another model call");

  // A failed call saves nothing and keeps earlier readings; “重试” repeats the same passage.
  await page.unroute("**/success/v1/chat/completions");
  await page.goto(readerURL);
  await page.locator(".source-paragraph").first().waitFor();
  await page.route("**/success/v1/chat/completions", (route) => route.fulfill({ status: 503, body: "" }));
  await select(0, "主动回忆要求学习者");
  await page.getByRole("button", { name: "AI 研读选段" }).click();
  const retry = page.getByRole("button", { name: "重试", exact: true });
  await retry.waitFor();
  assert.equal((await stored()).results.length, 2);
  await page.unroute("**/success/v1/chat/completions");
  await retry.click();
  await page.locator(".focus-quote", { hasText: "主动回忆要求学习者" }).waitFor();
  assert.equal((await stored()).results.length, 3);
  pass("a failed passage reading saves nothing; retry runs the same passage and saves it");  assert.deepEqual(errors, []);
  pass("no page errors");
} catch (e) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true }).catch(() => {});
  throw e;
} finally {
  await browser.close();
  server.kill();
}
