// One student's full journey through the product, start to finish, as a demo script:
// import → AI reading → keep a concept and a review question → read a selected passage →
// practise a question on the same material → feedback → revision → search and review
// everything learned. Mock AI as a developer endpoint (not real-model QA).
// Screenshots: qa-artifacts/journey/*.png
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildZip, docxFiles } from "../fixtures/office-fixture.mjs";

const out = "qa-artifacts/journey";
await mkdir(out, { recursive: true });
const port = "5195",
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
let step = 0;
const pass = (s) => console.log("PASS", s);
const shot = (name, fullPage = false) => page.screenshot({ path: out + "/" + String(++step).padStart(2, "0") + "-" + name + ".png", fullPage });
const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
async function select(paragraphIndex, text) {
  await page.evaluate(
    ({ paragraphIndex, text }) => {
      const node = document.querySelector(`.source-paragraph[data-paragraph-index="${paragraphIndex}"] .paragraph-text`).firstChild;
      const start = node.data.indexOf(text);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      document.getSelection().removeAllRanges();
      document.getSelection().addRange(range);
    },
    { paragraphIndex, text },
  );
  await page.locator(".selection-action:not([hidden])").waitFor();
}
const settle = () => page.waitForTimeout(400); // let the page fade-in finish before screenshots

try {
  await page.goto(base + "/app/settings");
  await page.getByText("开发者选项", { exact: true }).click();
  await page.getByRole("button", { name: "管理开发者服务" }).click();
  await page.getByLabel("Chat Completions 地址").fill(base + "/loop/v1");
  await page.getByLabel("模型名称", { exact: true }).fill("QA fixture");
  await page.getByLabel("API Key", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();

  // 1. Import a Word lecture; its headings become chapters.
  await page.goto(base + "/app/library");
  await page.getByRole("button", { name: /导入资料/ }).first().click();
  await page.locator("#file-input").setInputFiles({
    name: "lecture.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(await buildZip(docxFiles())),
  });
  await page.locator("#file-status.ready").waitFor();
  await settle();
  await shot("import-preview");
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page.locator(".doc-title", { hasText: "心理学导论讲义" }).click();
  await page.locator(".source-paragraph").first().waitFor();
  const readerURL = page.url();
  pass("import a Word lecture and open it in the Reader");

  // 2. AI reading; keep a review question and a concept from it.
  await page.getByRole("button", { name: "开始研读", exact: true }).click();
  await page.getByRole("button", { name: "加入复习", exact: true }).first().click();
  await page.getByRole("button", { name: "沉淀为知识点", exact: true }).first().click();
  await page.getByLabel("知识点名称", { exact: true }).fill("认知失调");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await settle();
  await shot("reading-notes");
  pass("AI reading with checked evidence; a review question and a concept are kept");

  // 3. Select a passage and read just that.
  await select(1, "人会感到不适");
  await shot("selection-bar");
  await page.getByRole("button", { name: "AI 研读选段" }).click();
  await page.locator(".focus-passage").waitFor();
  await settle();
  await shot("passage-reading");
  pass("a selected passage gets its own reading, quoted and highlighted");

  // 4. From the material straight to practice.
  await page.getByText("更多 ···").click();
  await page.getByRole("link", { name: "用这份资料练一道题" }).click();
  await page.locator(".quick-chosen.is-ready").waitFor();
  assert.match(await page.locator(".quick-chosen").innerText(), /心理学导论讲义/);
  await page.getByLabel("题目", { exact: true }).fill("用认知失调解释：为什么报酬越少，态度改变可能越大？");
  await settle();
  await shot("practice-from-reader");
  await page.getByRole("button", { name: "开始作答" }).click();
  await page.getByLabel("先写下你自己的答案", { exact: true }).fill("报酬少的时候人更难用外部理由解释行为，所以改变态度。");
  await page.getByRole("button", { name: "保存答案并获取反馈", exact: true }).click();
  await page.locator(".feedback-item.is-key").waitFor();
  await settle();
  await shot("feedback", true);
  await page.getByLabel("根据反馈修订答案", { exact: true }).fill("报酬少时外部理由不足，行为与态度不一致带来不适，人通过改变态度来减少失调。");
  await page.getByLabel("你本次主要修正了什么？", { exact: true }).fill("补上了不适感这一动机。");
  await page.getByRole("button", { name: "保存修订并完成本次练习", exact: true }).click();
  await page.getByRole("heading", { name: "本次修订已完成" }).waitFor();
  pass("Reader → practise on the same material → answer → feedback → revision");

  // 5. Review everything learned, then search across all of it.
  await page.goto(base + "/app/search");
  await page.locator(".search-day").first().waitFor();
  assert.equal(await page.locator(".search-day").first().innerText(), "今天");
  const chips = await page.locator(".filter-chips").innerText();
  for (const label of ["资料", "研读笔记", "知识点", "复习题", "题目", "我的作答", "反馈"]) assert.match(chips, new RegExp(label));
  await settle();
  await shot("history-timeline");
  await page.getByLabel("全库搜索").fill("态度");
  await page.locator(".search-snippet mark").first().waitFor();
  const types = await page.locator(".search-row-head .badge").allInnerTexts();
  for (const label of ["资料", "研读笔记", "我的作答"]) assert.ok(types.includes(label), label + " in " + types);
  assert.match(page.url(), /q=%E6%80%81%E5%BA%A6/);
  await shot("search-results");
  pass("search & review: a dated timeline, then one query finds materials, notes and the student's own answers");

  await page.locator(".filter-chip", { hasText: "研读笔记" }).click();
  await page.locator(".search-row .row-title").first().click();
  await page.locator(".reading-claim.claim-selected").waitFor();
  pass("a reading-note result opens the Reader at that note");

  // 6. Everything learned from one material.
  await page.goto(readerURL);
  await page.locator(".source-paragraph").first().waitFor();
  await page.getByText("更多 ···").click();
  await page.getByRole("link", { name: "这份资料的学习记录" }).click();
  await page.locator(".search-scope").getByText("心理学导论讲义").waitFor();
  const scoped = await page.locator(".search-row-head .badge").allInnerTexts();
  for (const label of ["我的作答", "反馈", "知识点"]) assert.ok(scoped.includes(label), label + " in " + scoped);
  pass("the Reader leads to every record learned from that material");

  // 7. Days later the home page asks for a backup; exporting one clears the reminder.
  await page.goto(base + "/app/");
  await page.locator(".quick-practice").waitFor();
  assert.equal(await page.locator(".backup-nudge").count(), 0, "no reminder on the first day");
  await page.clock.setFixedTime(new Date(Date.now() + 5 * 86400000));
  await page.goto(base + "/app/");
  await page.locator(".backup-nudge").waitFor();
  await settle();
  await shot("backup-reminder");
  await page.locator(".backup-nudge").getByRole("link", { name: "去导出备份" }).click();
  await page.locator(".storage-protection").getByText("还没有导出过备份").waitFor();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整 JSON 备份" }).click();
  const file = await download;
  assert.match(file.suggestedFilename(), /^digest-v02-.*\.json$/);
  await page.locator(".storage-protection").getByText(/上次备份/).waitFor();
  await page.goto(base + "/app/");
  await page.locator(".quick-practice").waitFor();
  assert.equal(await page.locator(".backup-nudge").count(), 0);
  pass("learning that no backup covers triggers a reminder; exporting a backup records it and clears the reminder");

  // 8. Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/app/search?q=" + encodeURIComponent("态度"));
  await page.locator(".search-row").first().waitFor();
  assert.ok(await noOverflow());
  await settle();
  await shot("search-390", true);
  await page.goto(readerURL);
  await page.locator(".source-paragraph").first().waitFor();
  await select(1, "倾向于调整态度");
  const bar = await page.locator(".selection-action").boundingBox();
  assert.ok(bar.x >= 0 && bar.x + bar.width <= 390, "selection bar fits the screen");
  assert.ok(await noOverflow());
  await shot("reader-390-selection");
  pass("phone width: search and the passage button fit without horizontal scrolling");

  assert.deepEqual(errors, []);
  pass("no page errors");
} catch (e) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true }).catch(() => {});
  throw e;
} finally {
  await browser.close();
  server.kill();
}
