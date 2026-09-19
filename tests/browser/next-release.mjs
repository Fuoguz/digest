// Real Chrome UI + deterministic AI fixture. No production credentials or user profile.
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
const out = path.resolve("qa-artifacts/next-release");
await mkdir(out, { recursive: true });
const port = 5193,
  base = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, ["tests/fixtures/mock-ai-server.mjs"], {
  env: { ...process.env, DIGEST_QA_PORT: String(port) },
  stdio: "pipe",
  windowsHide: true,
});
await new Promise((resolve, reject) => {
  server.stdout.once("data", resolve);
  server.once("error", reject);
  server.once("exit", (code) => reject(Error("QA server exit " + code)));
});
const browser = await chromium.launch({ channel: process.env.DIGEST_BROWSER_CHANNEL || "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  acceptDownloads: true,
});
let page = await context.newPage();
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(12000);
const check = (s) => {
  checks.push(s);
  console.log("PASS", s);
};
const source =
  "议程设置理论关注媒体如何影响公众对议题重要性的判断。它讨论人们想什么问题，而不直接等同于决定人们对问题的立场。\n\n框架理论关注媒体如何通过选择、强调和组织信息，为事件提供特定的解释方式。同一城市交通政策可以被框定为公共健康问题，也可以被框定为个人出行成本问题。\n\n比较两种理论时，需要区分议题显著性与解释框架，并用具体材料说明。单独出现报道数量的变化不足以证明公众态度已发生变化。";
const answer =
  "议程设置和框架理论都说明媒体影响公众，所以两者完全相同。报道多就说明公众支持。";
let courseURL, taskURL, attemptURL, readerURL;
async function config(endpoint = "success") {
  await page.goto(base + "/app/settings");
  await page.getByRole("button", { name: "管理开发者服务" }).click();
  await page
    .getByLabel("Chat Completions 地址")
    .fill(base + "/" + endpoint + "/v1");
  await page.getByLabel("模型名称").fill("QA-fixture-only");
  await page.getByLabel("API Key", { exact: true }).fill("fixture-only");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
}
async function screenshot(name) {
  await page.screenshot({
    path: path.join(out, name + ".png"),
    fullPage: true,
  });
}
try {
  await config();
  await page.goto(base + "/app/courses");
  await page
    .getByLabel("课程名称", { exact: true })
    .fill("传播学理论 · 浏览器验收");
  await page.getByRole("button", { name: "创建课程", exact: true }).click();
  await page.waitForURL("**/app/courses/*");
  courseURL = page.url();
  await page.getByRole("button", { name: "导入资料", exact: false }).click();
  await page
    .locator("#import-title")
    .fill("传播学理论：议程设置与框架（课程笔记）");
  await page.locator("#import-content").fill(source);
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page.waitForURL("**/app/library");
  await page.goto(courseURL);
  await page
    .getByRole("checkbox", { name: "传播学理论：议程设置与框架（课程笔记）" })
    .check();
  await page.getByRole("button", { name: "保存课程", exact: true }).click();
  await page
    .getByLabel("任务名称", { exact: true })
    .fill("区分议程设置与框架，并解释交通政策案例");
  await page
    .getByLabel("需要回答的问题", { exact: true })
    .fill(
      "解释议程设置与框架理论的区别，用材料中的城市交通政策案例说明，指出报道数量能否证明公众支持。",
    );
  await page
    .getByLabel("评价标准（可选）")
    .fill(
      "概念区分明确；案例与概念对应；结论有材料依据，不把报道量等同支持度。",
    );
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await page.waitForURL("**/app/tasks/*");
  taskURL = page.url();
  await page.getByLabel("先写下你自己的答案", { exact: true }).fill(answer);
  await page.getByText("草稿已保存到此浏览器。", { exact: true }).waitFor();
  await page.reload();
  assert.equal(
    await page.getByLabel("先写下你自己的答案", { exact: true }).inputValue(),
    answer,
  );
  check("draft persists after reload");
  await page
    .getByRole("button", { name: "保存答案并获取反馈", exact: true })
    .click();
  await page.getByRole("heading", { name: "具体缺口", exact: true }).waitFor();
  attemptURL = page.url();
  await screenshot("task-feedback-1440");
  await page
    .getByRole("link", { name: /查看课程依据/ })
    .first()
    .click();
  await page.locator("mark").first().waitFor();
  readerURL = page.url();
  assert.ok(
    (await page.locator("mark").first().innerText()).includes("议程设置"),
  );
  check("feedback evidence opens exact source in Reader");
  await page.getByRole("link", { name: "← 返回学习任务" }).click();
  await page
    .getByLabel("根据反馈修订答案", { exact: true })
    .fill(
      "议程设置关注议题的重要性，框架关注如何解释问题。城市交通政策既可从公共健康解释，也可从个人成本解释。报道数量本身不能证明公众支持。",
    );
  await page
    .getByLabel("你本次主要修正了什么？", { exact: true })
    .fill("区分概念，补充交通政策案例，并撤回无依据的支持度判断。");
  await page
    .getByRole("button", { name: "保存修订并完成本次练习", exact: true })
    .click();
  await page.getByRole("heading", { name: "本次修订已完成" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "本次修订已完成" }).waitFor();
  assert.equal(
    await page
      .locator(".training-feedback > .training-prose")
      .first()
      .innerText(),
    answer,
  );
  check("answer → feedback → evidence → revision → reload, original intact");
  // Existing learning assets are created through Reader controls, not synthetic DB writes.
  await page.goto(readerURL);
  await page.getByRole("button", { name: "开始研读", exact: true }).click();
  await page.getByRole("button", { name: "加入复习", exact: true }).waitFor();
  await page.getByRole("button", { name: "加入复习", exact: true }).click();
  for (const name of ["主动回忆", "间隔复习"]) {
    await page
      .getByRole("button", { name: "沉淀为知识点", exact: true })
      .first()
      .click();
    await page.getByLabel("知识点名称", { exact: true }).fill(name);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "保存", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await page.goto(base + "/app/graph");
  await page.getByRole("button", { name: /建议关系/ }).click();
  await page
    .getByRole("button", { name: /确认关系/ })
    .first()
    .click();
  check(
    "existing ReadingResult / Review / KnowledgeUnit / confirmed Relation created in UI",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/app/review");
  await page
    .getByLabel("先用自己的话回答（草稿不保存）")
    .fill("先自己回忆，再对照来源。");
  await page.getByRole("button", { name: "揭示答案", exact: true }).click();
  await page.locator(".rating-actions button").nth(2).click();
  await page.getByText("今天的复习已完成", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("今天的复习已完成", { exact: true }).waitFor();
  check("mobile Review recall → reveal → rating → reload");
  // Complete mobile flow as a separate Attempt, with old answers hidden initially.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(taskURL + "?attempt=new");
  assert.equal(await page.getByText(answer, { exact: true }).count(), 0);
  await page
    .getByLabel("先写下你自己的答案", { exact: true })
    .fill("手机作答：两种理论都关心传播效果，还需要区分机制。");
  await page
    .getByRole("button", { name: "保存答案并获取反馈", exact: true })
    .click();
  await page.getByRole("heading", { name: "具体缺口", exact: true }).waitFor();
  const mobileURL = page.url();
  await screenshot("task-feedback-390");
  await page
    .getByRole("link", { name: /查看课程依据/ })
    .first()
    .click();
  await page.locator("mark").first().waitFor();
  await screenshot("reader-evidence-390");
  await page.getByRole("button", { name: "← 返回反馈", exact: true }).click();
  await page
    .getByLabel("根据反馈修订答案", { exact: true })
    .fill(
      "手机修订：议程设置影响议题显著性，框架影响解释方式。交通政策可以有公共健康与个人成本两种框架。",
    );
  await page
    .getByLabel("你本次主要修正了什么？", { exact: true })
    .fill("区分两个机制并补充例子。");
  await page
    .getByRole("button", { name: "保存修订并完成本次练习", exact: true })
    .click();
  await page.getByRole("heading", { name: "本次修订已完成" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "本次修订已完成" }).waitFor();
  check("390px full answer-feedback-evidence-revision flow");
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, url] of [
      ["landing", base + "/"],
      ["dashboard", base + "/app/"],
      ["library", base + "/app/library"],
      ["reader", readerURL],
      ["review", base + "/app/review"],
      ["graph", base + "/app/graph"],
      ["course", courseURL],
      ["task", mobileURL],
    ]) {
      await page.goto(url);
      await page
        .locator(name === "landing" ? ".hero" : "#page-root > section")
        .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        name + " overflow at " + width,
      );
      await screenshot(name + "-" + width);
    }
  }
  check(
    "1440/1024/768/390 Landing Dashboard Library Reader Review Graph Course Task no overflow",
  );
  await page.goto(base + "/app/settings");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出完整 JSON 备份", exact: true })
    .click();
  const download = await downloadPromise,
    backupPath = path.join(out, "browser-backup.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  for (const name of [
    "documents",
    "readingResults",
    "evidenceAnchors",
    "reviewCards",
    "knowledgeUnits",
    "relations",
    "courses",
    "tasks",
    "attempts",
    "feedback",
  ])
    assert.ok(backup.stores[name].length, name + " empty");
  assert.equal(backup.stores.settings, undefined);
  // Fresh browser context = empty test environment, never clear a real user's origin.
  await context.close();
  const restored = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  page = await restored.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/app/settings");
  await page.getByLabel("选择 Digest JSON 备份").setInputFiles(backupPath);
  await page.getByText(/已恢复 1 份资料/).waitFor();
  await page.goto(attemptURL);
  await page.getByRole("heading", { name: "本次修订已完成" }).waitFor();
  await page
    .getByRole("link", { name: /查看课程依据/ })
    .first()
    .click();
  await page.locator("mark").first().waitFor();
  await page.goto(base + "/app/settings");
  const secondDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出完整 JSON 备份", exact: true })
    .click();
  const second = await secondDownload,
    secondPath = path.join(out, "restored-backup.json");
  await second.saveAs(secondPath);
  const roundtrip = JSON.parse(await readFile(secondPath, "utf8"));
  for (const name of Object.keys(backup.stores).filter(
    (n) => n !== "activities",
  ))
    assert.deepEqual(
      roundtrip.stores[name],
      backup.stores[name],
      name + " roundtrip differs",
    );
  check(
    "actual browser file download → empty context → upload restore → all ten data stores identical",
  );
  for (const endpoint of [
    "failed",
    "rate-limit",
    "empty",
    "malformed",
    "missing",
  ]) {
    await config(endpoint);
    await page.goto(taskURL + "?attempt=new");
    await page
      .getByLabel("先写下你自己的答案", { exact: true })
      .fill("故障测试答案：" + endpoint);
    await page
      .getByRole("button", { name: "保存答案并获取反馈", exact: true })
      .click();
    await page.locator(".inline-feedback.is-error").waitFor();
    await page
      .getByRole("button", { name: "获取反馈 / 重试", exact: true })
      .waitFor();
    await page.reload();
    await page
      .getByText("故障测试答案：" + endpoint, { exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "反馈", exact: true }).count(),
      0,
    );
  }
  check(
    "503 / 429 / empty / malformed / missing fields preserve submitted answer and allow retry",
  );
  await config("success");
  await page.route("**/chat/completions", (route) => route.abort("failed"));
  await page.goto(taskURL + "?attempt=new");
  await page
    .getByLabel("先写下你自己的答案", { exact: true })
    .fill("网络故障时答案应保留");
  await page
    .getByRole("button", { name: "保存答案并获取反馈", exact: true })
    .click();
  await page.locator(".inline-feedback.is-error").waitFor();
  await page.unroute("**/chat/completions");
  await page
    .getByRole("button", { name: "获取反馈 / 重试", exact: true })
    .click();
  await page.getByRole("heading", { name: "具体缺口", exact: true }).waitFor();
  check("network failure → retry same Attempt succeeds");
  await config("slow");
  await page.goto(taskURL + "?attempt=new");
  await page
    .getByLabel("先写下你自己的答案", { exact: true })
    .fill("慢请求取消测试");
  await page
    .getByRole("button", { name: "保存答案并获取反馈", exact: true })
    .click();
  await page.getByRole("button", { name: "取消反馈", exact: true }).click();
  await page
    .getByText("已取消，首次答案与已有反馈保留。", { exact: true })
    .waitFor();
  await page.reload();
  await page.getByText("慢请求取消测试", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "反馈", exact: true }).count(),
    0,
  );
  check("slow request cancel preserves answer, no false completion");
  await config("partial");
  await page.goto(taskURL + "?attempt=new");
  await page
    .getByLabel("先写下你自己的答案", { exact: true })
    .fill("无效引用测试答案");
  await page
    .getByRole("button", { name: "保存答案并获取反馈", exact: true })
    .click();
  await page
    .getByText("未找到足够可靠的课程材料依据。", { exact: true })
    .waitFor();
  assert.equal(await page.locator("#gap-0 a").count(), 0);
  check("invalid quote has honest message and no fabricated evidence link");
  await config("long");
  await page.goto(taskURL + "?attempt=new");
  await page
    .getByLabel("先写下你自己的答案", { exact: true })
    .fill("长反馈测试：" + "解释与证据需要联系。".repeat(90));
  await page
    .getByRole("button", { name: "保存答案并获取反馈", exact: true })
    .click();
  await page.getByRole("heading", { name: "具体缺口", exact: true }).waitFor();
  assert.equal(await page.locator('[id^="gap-"]').count(), 8);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page
    .getByRole("link", { name: /查看课程依据/ })
    .last()
    .click();
  await page.locator("mark").first().waitFor();
  check(
    "long answer and long feedback remain readable and evidence operable on mobile",
  );
  await page.goto(base + "/app/library");
  await page
    .getByRole("button", { name: /导入资料/ })
    .first()
    .click();
  await page.locator("#import-title").fill("长标题测试".repeat(25));
  await page
    .locator("#import-content")
    .fill("材料中的长段落需要自然换行，不能遮挡定位与返回操作。".repeat(400));
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page.locator("[data-open-document]").first().click();
  await page.locator(".source-article").waitFor();
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await screenshot("long-title-paragraph-390");
  check("long title and paragraph Reader at all four widths");
  await page.goto(base + "/app/courses");
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    "跳到主要内容",
  );
  await page.keyboard.press("Enter");
  assert.ok(
    await page.evaluate(
      () =>
        document.querySelector("#page-root").contains(document.activeElement) ||
        document.activeElement.id === "page-root",
    ),
  );
  check("keyboard skip link reaches main content");
  assert.deepEqual(errors, []);
  check("no uncaught browser errors");
  await writeFile(
    path.join(out, "results.json"),
    JSON.stringify(
      {
        ai: "deterministic mock; NOT real-model acceptance",
        checks,
        errors,
        backupCounts: Object.fromEntries(
          Object.entries(backup.stores).map(([k, v]) => [k, v.length]),
        ),
      },
      null,
      2,
    ),
  );
} catch (e) {
  await screenshot("failure").catch(() => {});
  console.error(e);
  console.error(
    "UI:",
    (
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    ).slice(-6500),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
