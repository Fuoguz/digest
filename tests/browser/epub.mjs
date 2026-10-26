// EPUB import and book-length Reader workflow with the deterministic mock AI (not real-model QA).
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { buildZip, sampleEpubFiles } from "../fixtures/epub-fixture.mjs";
const out = "qa-artifacts/epub-browser";
await mkdir(out, { recursive: true });
const port = "5196", base = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, ["tests/fixtures/mock-ai-server.mjs"], { env: { ...process.env, DIGEST_QA_PORT: port }, stdio: "pipe", windowsHide: true });
await new Promise((r) => server.stdout.once("data", r));

const CH = 20, PARAS = 15;
const sentence = (c, p) => `第${c}章第${p}段：议程设置关注公众认为什么重要，框架关注同一议题如何被解释；报道数量本身不能证明公众态度。`.repeat(10);
const files = [
  { name: "mimetype", content: "application/epub+zip", store: true },
  { name: "META-INF/container.xml", content: '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>' },
  { name: "OPS/book.opf", content: `<package><metadata><dc:title>媒介效果长篇教材</dc:title></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${Array.from({ length: CH }, (_, i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join("")}</manifest><spine>${Array.from({ length: CH }, (_, i) => `<itemref idref="c${i}"/>`).join("")}</spine></package>` },
  { name: "OPS/nav.xhtml", content: `<html><body><nav epub:type="toc"><ol>${Array.from({ length: CH }, (_, i) => `<li><a href="c${i}.xhtml">第${i + 1}章 媒介效果专题${i + 1}</a></li>`).join("")}</ol></nav></body></html>` },
  ...Array.from({ length: CH }, (_, i) => ({
    name: `OPS/c${i}.xhtml`,
    content: `<html><body><h1>第${i + 1}章 媒介效果专题${i + 1}</h1><h2>${i + 1}.1 核心概念</h2>${Array.from({ length: PARAS }, (_, p) => `<p>${sentence(i + 1, p + 1)}</p>`).join("")}</body></html>`,
  })),
];
const book = Buffer.from(await buildZip(files));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const pass = (s) => console.log("PASS", s);
const control = (text) => page.locator(".reading-controls label", { hasText: text }).locator("select, input").first();
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
try {
  await page.goto(base + "/app/settings");
  await page.getByText("开发者选项", { exact: true }).click();
  await page.getByRole("button", { name: "管理开发者服务" }).click();
  await page.getByLabel("Chat Completions 地址").fill(base + "/success/v1");
  await page.getByLabel("模型名称", { exact: true }).fill("QA fixture");
  await page.getByLabel("API Key", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();

  // Small EPUB: DRM refusal, type label and filter.
  await page.goto(base + "/app/library");
  await page.getByRole("button", { name: /导入资料/ }).first().click();
  assert.match(await page.locator("#file-input").getAttribute("accept"), /\.epub/);
  await page.locator("#file-input").setInputFiles({ name: "locked.epub", mimeType: "application/epub+zip", buffer: Buffer.from(await buildZip(sampleEpubFiles({ encrypted: true }))) });
  await page.locator("#file-status.error").waitFor();
  assert.match(await page.locator("#file-status").innerText(), /DRM/);
  await page.locator("#file-input").setInputFiles({ name: "course.epub", mimeType: "application/epub+zip", buffer: Buffer.from(await buildZip(sampleEpubFiles())) });
  await page.locator("#file-status.ready").waitFor();
  assert.equal(await page.locator("#import-title").inputValue(), "传播学导论 & 案例");
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page.locator(".document-row").first().waitFor();
  assert.equal(await page.locator(".doc-type").first().innerText(), "EPUB");
  await page.locator("[data-source-filter]").selectOption("epub");
  assert.equal(await page.locator(".document-row").count(), 1);
  pass("DRM-protected EPUB is refused honestly; a DRM-free EPUB is saved with EPUB type and filter");

  // Edited text drops structure instead of keeping misaligned offsets.  await page.goto(base + "/app/library");
  await page.getByRole("button", { name: /导入资料/ }).first().click();
  await page.locator("#file-input").setInputFiles({ name: "book.epub", mimeType: "application/epub+zip", buffer: book });
  await page.locator("#file-status.ready").waitFor();
  assert.match(await page.locator("#import-structure").innerText(), /识别到 20 章/);
  assert.equal(await page.locator(".import-outline li").count(), 20);
  await page.screenshot({ path: out + "/book-import.png" });
  await page.locator("#import-content").press("Control+Home");
  await page.locator("#import-content").type("前言补充。\n\n");
  await page.locator(".import-structure-warning").waitFor();
  await page.locator("#import-title").fill("编辑过的教材");
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page.locator(".document-row").first().waitFor();
  await page.locator(".doc-title", { hasText: "编辑过的教材" }).click();
  await page.locator(".source-paragraph").first().waitFor();
  assert.equal(await page.locator(".source-paragraph.is-heading").count(), 0);
  assert.equal(await page.locator(".outline-control").innerText().then((t) => t.includes("跳到段落")), true);
  pass("structure preview lists 20 chapters; editing the text warns and saves without stale structure");

  await page.goto(base + "/app/library");
  await page.getByRole("button", { name: /导入资料/ }).first().click();
  await page.locator("#file-input").setInputFiles({ name: "book.epub", mimeType: "application/epub+zip", buffer: book });
  await page.locator("#file-status.ready").waitFor();
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page.locator(".doc-title", { hasText: "媒介效果长篇教材" }).click();
  await page.locator(".source-paragraph").first().waitFor();
  assert.equal(await page.locator(".source-paragraph.heading-1").count(), 20);
  assert.equal(await page.locator(".source-paragraph.heading-2").count(), 20);
  assert.equal(await page.locator('.paragraph-text[role="heading"][aria-level="3"]').count(), 20);
  assert.equal(await page.locator(".chapter-rule").count(), 19);
  pass("Reader renders 20 chapter headings and 20 section headings with heading semantics");

  const range = control("研读范围");
  assert.equal(await range.inputValue(), "chapters");
  assert.equal(await page.locator('option[value="all"]').evaluate((o) => o.disabled), true);
  assert.match(await page.locator(".scope-hint").innerText(), /^第1章 媒介效果专题1 · 预计分段：1 \/ 12/);
  await control("结束章节").selectOption("19");
  assert.match(await page.locator(".scope-hint.is-error").innerText(), /超过单次 12 个分段的上限/);
  assert.equal(await page.getByRole("button", { name: "开始研读", exact: true }).isDisabled(), true);
  await page.screenshot({ path: out + "/book-scope-error.png" });
  await control("结束章节").selectOption("0");
  assert.equal(await page.getByRole("button", { name: "开始研读", exact: true }).isDisabled(), false);
  pass("whole book is marked over the limit; chapter scope defaults to chapter 1 and over-limit ranges are blocked before any request");

  await page.getByRole("button", { name: "开始研读", exact: true }).click();
  await page.locator(".reading-section").first().waitFor();
  assert.match(await page.locator(".ai-panel .scope-notice").innerText(), /第1章 媒介效果专题1/);
  await control("起始章节").selectOption("1");
  await page.getByRole("button", { name: "重新研读", exact: true }).click();
  await page.locator(".reading-records select").waitFor();
  assert.match(await page.locator(".ai-panel .scope-notice").innerText(), /第2章/);
  assert.equal(await page.locator(".reading-records option").count(), 2);
  pass("chapter 1 and chapter 2 readings both complete and are listed as reading records");

  await page.locator(".reading-records select").selectOption({ index: 1 });
  await page.waitForURL(/result=/);
  await page.locator(".reading-section").first().waitFor();
  assert.match(await page.locator(".ai-panel .scope-notice").innerText(), /第1章/);
  await page.getByRole("button", { name: "沉淀为知识点", exact: true }).first().click();
  await page.getByLabel("知识点名称", { exact: true }).fill("议程设置（第一章）");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".inline-feedback.is-error").count(), 0);
  await page.screenshot({ path: out + "/book-records.png" });
  pass("switching back to the chapter 1 reading works and saving a concept from it succeeds");

  await control("目录").selectOption({ label: "第15章 媒介效果专题15" });
  await page.waitForFunction(() => /第15章/.test(document.querySelector(".reading-position").textContent));
  assert.match(await page.locator(".reading-position").innerText(), /第 \d+ \/ \d+ 段/);
  await page.screenshot({ path: out + "/book-reader-1440.png" });
  pass("contents menu jumps to chapter 15 and the live position follows");

  for (const w of [1024, 768, 390]) {
    await page.setViewportSize({ width: w, height: 860 });
    assert.ok(await overflow(), "overflow " + w);
  }
  assert.equal(await page.locator(".reading-controls > .outline-control").isVisible(), true);
  assert.equal(await range.isVisible(), false);
  await page.screenshot({ path: out + "/book-reader-390.png" });
  await page.getByRole("tab", { name: "AI 研读" }).click();
  assert.equal(await range.isVisible(), true);
  assert.equal(await page.locator(".reading-controls > .outline-control").isVisible(), false);
  await page.screenshot({ path: out + "/book-reader-390-ai.png" });
  pass("no horizontal overflow at 1024/768/390; phone shows only the controls for the active tab");
  assert.deepEqual(errors, []);
  pass("no page errors");
} catch (e) {
  await page.screenshot({ path: out + "/book-failure.png", fullPage: true }).catch(() => {});
  throw e;
} finally {
  await browser.close();
  server.kill();
}
