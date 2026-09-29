import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { assertRestoredStores } from "./restore-check.mjs";
import { feedbackOutput } from "../fixtures/feedback-output.mjs";
const out = "qa-artifacts/v03-browser";
await mkdir(out, { recursive: true });
const base = "http://127.0.0.1:5195";
const server = spawn(process.execPath, ["tests/fixtures/mock-ai-server.mjs"], {
  env: { ...process.env, DIGEST_QA_PORT: "5195" },
  stdio: "pipe",
  windowsHide: true,
});
await new Promise((r, j) => {
  server.stdout.once("data", r);
  server.once("error", j);
});
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  ctx = await browser.newContext({
    locale: "zh-CN",
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    reducedMotion: "reduce",
  });
let page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = [],
  checks = [],
  network = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400)
    network.push({ path: new URL(r.url()).pathname, status: r.status() });
});
const pass = (s) => {
  checks.push(s);
  console.log("PASS", s);
};
try {
  await page.goto(base + "/");
  await page.locator(".hero").waitFor();
  await page.goto(base + "/app/settings");
  await page.getByText("开发者选项", { exact: true }).click();
  await page.getByRole("button", { name: "管理开发者服务" }).click();
  await page.getByLabel("Chat Completions 地址").fill(base + "/loop/v1");
  await page.getByLabel("模型名称", { exact: true }).fill("QA fixture");
  await page.getByLabel("API Key", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await page.goto(base + "/app/");
  await page.getByLabel("课程名称", { exact: true }).fill("v0.3 传播学训练");
  await page.getByRole("button", { name: "创建课程", exact: true }).click();
  await page.waitForURL("**/app/courses/*");
  const course = page.url();
  await page.getByRole("button", { name: "添加课程材料", exact: true }).click();
  await page.locator("#file-input").setInputFiles({
    name: "course.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "议程设置影响公众关注什么问题，但不能据此推断公众态度。框架影响对同一问题的解释角度。\n\n报道频率与解释角度是不同维度，不能混为一谈。",
    ),
  });
  await page.locator("#file-status.ready").waitFor();
  await page.locator("#import-title").fill("传播学材料");
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page
    .getByRole("button", { name: "帮我生成几个练习任务", exact: true })
    .click();
  await page.locator(".suggested-task").first().waitFor();
  assert.equal(await page.locator(".suggested-task").count(), 3);
  await page
    .getByRole("button", { name: "使用这道题", exact: true })
    .first()
    .click();
  pass(
    "three material-scoped suggestions prefill an editable task without automatic creation",
  );
  await page.getByLabel("任务名称", { exact: true }).fill("解释理论区别");
  await page
    .getByLabel("需要回答的问题", { exact: true })
    .fill("解释议程设置与框架的区别。");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await page.waitForURL("**/app/tasks/*");
  const task = page.url();
  const original = "议程设置与框架完全相同，报道数量增加就必然说明公众支持。";
  await page.getByLabel("先写下你自己的答案", { exact: true }).fill(original);
  await page
    .getByRole("button", { name: "保存答案并获取反馈", exact: true })
    .click();
  await page.locator(".gap-card").waitFor();
  const attempt = page.url();
  pass(
    "first visit → course → actual text upload → task → first answer → feedback and traceable gap",
  );
  const preview = page
    .getByRole("button", { name: "预览依据", exact: true })
    .first();
  await preview.click();
  await page.locator("dialog.evidence-drawer mark").waitFor();
  assert.ok(await page.locator(".training-feedback").isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog.evidence-drawer").count(), 0);
  assert.equal(
    await preview.evaluate((e) => e === document.activeElement),
    true,
  );
  pass(
    "evidence drawer retains task, highlights exact quote, Escape restores focus",
  );
  await preview.click();
  const previousScroll = await page.evaluate(() => scrollY);
  await page.getByRole("link", { name: "查看完整原文", exact: true }).click();
  await page.getByRole("link", { name: "← 返回学习任务", exact: true }).click();
  await page.locator(".gap-card").waitFor();
  await page.waitForFunction((y) => Math.abs(scrollY - y) < 4, previousScroll);
  pass(
    "evidence drawer → full Reader → task restores scroll and saved attempt",
  );
  await page
    .getByLabel("根据反馈修订答案", { exact: true })
    .fill(
      "议程设置影响议题关注，框架影响解释角度。报道数量不能直接推出公众支持，需要独立态度证据。",
    );
  await page
    .getByLabel("你本次主要修正了什么？", { exact: true })
    .fill("区分两个机制，撤回无依据的态度推论。");
  await page
    .getByRole("button", { name: "保存修订并完成本次练习", exact: true })
    .click();
  await page.getByText("查看我改了什么", { exact: true }).click();
  assert.ok(await page.locator(".revision-diff ins").count());
  assert.ok(await page.locator(".revision-diff del").count());
  await page.locator(".original-answer summary").click();
  assert.equal(
    await page.locator(".original-answer .training-prose").innerText(),
    original,
  );
  pass(
    "revision diff shows real changes while original answer stays immutable",
  );
  await page.getByRole("button", { name: "稍后再测", exact: true }).click();
  await page.goto(base + "/app/");
  await page
    .getByRole("heading", { name: "待再次检验", exact: true })
    .waitFor();
  await page.goto(course);
  await page
    .getByRole("heading", { name: "待再次检验", exact: true })
    .waitFor();
  pass("later recheck returns on both home and course");
  await page.route("**/loop/v1/chat/completions", (r) =>
    r.fulfill({ status: 503, body: "{}" }),
  );
  await page.getByRole("button", { name: "立即换题检验", exact: true }).click();
  await page.locator(".gap-card .is-error").waitFor();
  assert.equal(page.url(), course);
  await page.unroute("**/loop/v1/chat/completions");
  await page.route("**/loop/v1/chat/completions", () => {});
  await page.getByRole("button", { name: "立即换题检验", exact: true }).click();
  await page.getByRole("button", { name: "取消准备", exact: true }).click();
  await page.getByText("已取消，学习记录保留。", { exact: true }).waitFor();
  await page.unroute("**/loop/v1/chat/completions");
  pass("challenge failure and cancellation preserve the gap and revision");
  await page.getByRole("button", { name: "立即换题检验", exact: true }).click();
  await page.getByLabel("独立回答新问题", { exact: true }).waitFor();
  const challenge = page.url();
  assert.notEqual(challenge, task);
  assert.equal(await page.getByText(original, { exact: true }).count(), 0);
  pass(
    "new hypothetical challenge opens without old answer or hidden rationale",
  );
  await page
    .getByLabel("独立回答新问题", { exact: true })
    .fill(
      "案例里报道数量影响议题关注，不同解释角度体现框架，未调查态度就不能推断公众支持。",
    );
  await page.route("**/loop/v1/chat/completions", (r) =>
    r.fulfill({ status: 503, body: "{}" }),
  );
  await page
    .getByRole("button", { name: "保存回答并检验", exact: true })
    .click();
  await page.locator(".is-error").waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "获取再测结果 / 重试", exact: true })
    .waitFor();
  await page.unroute("**/loop/v1/chat/completions");
  await page
    .getByRole("button", { name: "获取再测结果 / 重试", exact: true })
    .click();
  await page.locator(".retest-outcome").waitFor();
  assert.match(await page.locator(".retest-outcome").innerText(), /本次已解决/);
  const retest = page.url();
  await page.reload();
  await page.locator(".retest-outcome").waitFor();
  pass(
    "second answer survives AI failure and reload; retry persists resolved_once",
  );
  await page
    .getByRole("link", { name: "回看完整学习轨迹", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "第一次回答", exact: true })
    .waitFor();
  const history = page.url();
  await page.close();
  page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(history);
  await page
    .getByRole("heading", { name: "换情境检验", exact: true })
    .waitFor();
  await page.getByLabel("界面语言", { exact: true }).selectOption("en");
  await page
    .getByRole("heading", { name: "First answer", exact: true })
    .waitFor();
  await page
    .getByLabel("Interface language", { exact: true })
    .selectOption("zh-CN");
  await page
    .getByRole("heading", { name: "第一次回答", exact: true })
    .waitFor();
  pass(
    "close/reopen restores original → gap → revision → challenge → outcome history",
  );
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, url] of [
      ["task", attempt],
      ["history", history],
      ["retest", retest],
      ["course", course],
      ["home", base + "/app/"],
    ]) {
      await page.goto(url);
      await page.locator("#page-root h1").waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        name + " overflow " + width,
      );
      if (width === 1440 || width === 390)
        await page.screenshot({
          path: out + "/" + name + "-" + width + ".png",
          fullPage: true,
        });
    }
    await page.goto(attempt);
    await page
      .getByRole("button", { name: "预览依据", exact: true })
      .first()
      .click();
    await page.locator(".evidence-drawer mark").waitFor();
    await page.screenshot({ path: out + "/evidence-" + width + ".png" });
    await page.getByRole("button", { name: "关闭依据", exact: true }).click();
  }
  pass(
    "1440/1024/768/390 task, history, recheck, course, home and evidence overlay",
  );
  await page.goto(base + "/app/settings");
  let download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出完整 JSON 备份", exact: true })
    .click();
  const file = out + "/backup.json";
  await (await download).saveAs(file);
  const backup = JSON.parse(await readFile(file, "utf8"));
  assert.ok(backup.stores.learningGaps.length && backup.stores.retests.length);
  const restored = await browser.newContext({
    locale: "zh-CN",
    acceptDownloads: true,
  });
  const rp = await restored.newPage();
  await rp.goto(base + "/app/settings");
  await rp.getByLabel("选择 Digest JSON 备份").setInputFiles(file);
  await rp.getByText(/已恢复 1 份资料/).waitFor();
  await rp.goto(history);
  await rp.getByRole("heading", { name: "换情境检验", exact: true }).waitFor();
  await rp.goto(base + "/app/settings");
  download = rp.waitForEvent("download");
  await rp
    .getByRole("button", { name: "导出完整 JSON 备份", exact: true })
    .click();
  await (await download).saveAs(out + "/restored.json");
  assertRestoredStores(
    backup,
    JSON.parse(await readFile(out + "/restored.json", "utf8")),
  );
  await restored.close();
  pass(
    "actual backup download → empty browser upload restores gap/challenge/retest with old assets",
  );
  await page.goto(course);
  await page.getByText("创建学习任务", { exact: true }).click();
  await page.getByLabel("任务名称", { exact: true }).fill("无需强制修订");
  await page
    .getByLabel("需要回答的问题", { exact: true })
    .fill("请解释两个机制的区别。");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await page.waitForURL("**/app/tasks/*");
  await page.route("**/loop/v1/chat/completions", async (route) => {
    const p = JSON.parse(route.request().postDataJSON().messages[1].content),
      output = feedbackOutput(p);
    output.gaps = [];
    await route.fulfill({
      json: { choices: [{ message: { content: JSON.stringify(output) } }] },
    });
  });
  await page
    .getByLabel("先写下你自己的答案", { exact: true })
    .fill("议程设置影响议题关注，框架影响解释角度，不能仅凭报道量推断支持。");
  await page
    .getByRole("button", { name: "保存答案并获取反馈", exact: true })
    .click();
  await page
    .getByRole("button", { name: "保留原答案，完成本次检查", exact: true })
    .click();
  await page.reload();
  await page
    .getByText("本次检查已完成，原答案保留。", { exact: true })
    .waitFor();
  await page.unroute("**/loop/v1/chat/completions");
  pass(
    "sound answer finishes without a fabricated revision; completion survives reload",
  );
  assert.deepEqual(errors, []);
  assert.ok(
    network.every((r) => r.status === 503 && r.path.includes("/loop/")),
  );
  pass("no uncaught console errors; expected injected 503 failures only");
  await writeFile(
    out + "/results.json",
    JSON.stringify({ checks, errors, network }, null, 2),
  );
} catch (e) {
  console.log((await page.locator("body").innerText()).slice(-5000));
  throw e;
} finally {
  await browser.close();
  server.kill();
}
