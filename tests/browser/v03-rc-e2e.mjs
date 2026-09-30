// Final public UI smoke: actual user-supplied Guardian PDF and real configured model.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
if (process.env.DIGEST_RC_REAL !== "1" || !process.env.DIGEST_TRIAL_CODE)
  throw Error("Explicit live QA opt-in and private trial code required");
const out = "qa-artifacts/v03-rc/e2e";
await fs.mkdir(out, { recursive: true });
const access = JSON.parse(
  await fs.readFile("qa-artifacts/v03-rc/transport.json", "utf8"),
);
const desktop = path.resolve(process.env.USERPROFILE, "Desktop");
const pdf = (await fs.readdir(desktop)).find(
  (n) => n.endsWith(".pdf") && n.includes("Guardian"),
);
if (!pdf) throw Error("User supplied PDF missing");
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  ...(process.env.HTTPS_PROXY
    ? { proxy: { server: process.env.HTTPS_PROXY } }
    : {}),
});
// No Vercel bypass header or preseeded authentication; enter Digest trial code in its own dialog.
const context = await browser.newContext({
  locale: "zh-CN",
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
let page = await context.newPage();
page.setDefaultTimeout(25000);
const events = [],
  errors = [],
  snapshots = [];
context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (new URL(r.url()).pathname === "/api/digest")
    events.push({ event: "start", at: Date.now() });
});
page.on("response", async (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/")) {
    try {
      const data = await r.json();
      events.push({
        event: "end",
        at: Date.now(),
        path: new URL(r.url()).pathname,
        status: r.status(),
        logicalStatus: data.httpStatus || r.status(),
        code: data.code,
        text: !!data.text,
      });
      await fs.writeFile(
        out + "/network.json",
        JSON.stringify(events, null, 2),
      );
    } catch (e) {
      events.push({ event: "body-error", at: Date.now(), error: e.message });
    }
  }
});
async function observe(stage) {
  const pending = page.locator(
    ".training-status, .gap-generation-status, .retest-status",
  );
  snapshots.push({
    stage,
    at: Date.now(),
    body: (await page.locator("#page-root").innerText()).slice(-5000),
  });
  await page.screenshot({ path: out + "/" + stage + ".png", fullPage: true });
  await fs.writeFile(out + "/loading.json", JSON.stringify(snapshots, null, 2));
}
async function waitStage(locator, stage, retry) {
  const start = Date.now();
  let boundary = 30,
    retried = false;
  while (Date.now() - start < 370000) {
    if (await locator.isVisible().catch(() => false)) return;
    if (Date.now() - start >= boundary * 1000) {
      await observe(stage + "-" + boundary + "s");
      if (stage === "feedback" && boundary === 90 && !retried) {
        retried = true;
        await page
          .getByRole("button", { name: "取消反馈", exact: true })
          .click();
        await page
          .getByText("已取消，首次答案与已有反馈保留。", { exact: true })
          .waitFor();
        snapshots.push({
          stage: "real cancel at 90s",
          at: Date.now(),
          body: await page.locator("#page-root").innerText(),
        });
        await fs.writeFile(
          out + "/loading.json",
          JSON.stringify(snapshots, null, 2),
        );
        await retry();
      }
      boundary += 30;
    }
    const alert = page.locator("[role=alert]");
    if ((await alert.count()) && (await alert.last().isVisible())) {
      const message = await alert.last().innerText();
      if (
        /超时|无法连接|不可用|重试|服务|返回|HTTP|timeout|failed/i.test(
          message,
        ) &&
        !retried
      ) {
        retried = true;
        await fs.writeFile(out + "/" + stage + "-failure.txt", message);
        await retry();
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error(stage + " did not finish; no unlimited retries");
}
try {
  await page.goto(access.base + "/");
  await page.locator(".hero").waitFor();
  assert.ok(!page.url().includes("vercel.com"));
  await page.goto(access.base + "/app/");
  await page
    .getByLabel("课程名称", { exact: true })
    .fill("食品影响者与真实性 · RC实际试用");
  await page.getByRole("button", { name: "创建课程", exact: true }).click();
  await page.waitForURL("**/app/courses/*");
  const course = page.url();
  await page.getByRole("button", { name: "添加课程材料", exact: true }).click();
  await page.locator("#file-input").setInputFiles(path.join(desktop, pdf));
  await page.locator("#file-status.ready").waitFor({ timeout: 60000 });
  await page
    .locator("#import-title")
    .fill("Guardian: food influencers and authenticity");
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page
    .getByLabel("任务名称", { exact: true })
    .fill("从证据判断真实性危机");
  await page
    .getByLabel("需要回答的问题", { exact: true })
    .fill(
      "文章如何解释食品影响者的真实性危机？区分作者提出的商业激励和可以由报道证明的事实，说明能否据此认定每位影响者都收钱造假。",
    );
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await page.waitForURL("**/app/tasks/*");
  await page
    .getByLabel("先写下你自己的答案", { exact: true })
    .fill(
      "文章证明了所有食品影响者都会收取餐厅的钱然后造假。既然不少人得到免费餐，就等于每一条推荐都不真实，作者已经证明整个行业完全没有可信内容。",
    );
  await page
    .getByRole("button", { name: "保存答案并获取反馈", exact: true })
    .click();
  await page.getByLabel("试用码", { exact: true }).waitFor();
  await page
    .getByLabel("试用码", { exact: true })
    .fill(process.env.DIGEST_TRIAL_CODE);
  await page.getByRole("button", { name: "验证并继续", exact: true }).click();
  await waitStage(page.locator(".gap-card").first(), "feedback", () =>
    page.getByRole("button", { name: "获取反馈 / 重试", exact: true }).click(),
  );
  await fs.writeFile(
    out + "/feedback.txt",
    await page.locator(".training-feedback").innerText(),
  );
  await page
    .getByRole("button", { name: "预览依据", exact: true })
    .first()
    .click();
  await page.locator(".evidence-drawer mark").waitFor();
  await page.screenshot({ path: out + "/evidence-1440.png" });
  await page.keyboard.press("Escape");
  await page
    .getByLabel("根据反馈修订答案", { exact: true })
    .fill(
      "文章把真实性危机与免费餐、付费合作、流量竞争和趋同的宣传内容联系起来，但报道中的具体案例不能推出所有影响者都收钱或每条推荐都造假。免费招待形成利益冲突风险，不等于每一次评价已被证实不真实；应区分商业激励、作者观察和仍需逐案核查的事实。",
    );
  await page
    .getByLabel("你本次主要修正了什么？", { exact: true })
    .fill("撤回所有人都造假的全称推断，区分商业风险与逐案证据。");
  await page
    .getByRole("button", { name: "保存修订并完成本次练习", exact: true })
    .click();
  await page.getByText("查看我改了什么", { exact: true }).click();
  const original = page.url();
  await page
    .getByRole("button", { name: "立即换题检验", exact: true })
    .first()
    .click();
  await waitStage(
    page.getByLabel("独立回答新问题", { exact: true }),
    "challenge",
    () =>
      page
        .getByRole("button", { name: "立即换题检验", exact: true })
        .first()
        .click(),
  );
  const prompt = await page.locator(".challenge-prompt").innerText();
  await fs.writeFile(out + "/challenge.txt", prompt);
  console.log("RC_CHALLENGE_READY", prompt);
  let answer;
  const stop = Date.now() + 240000;
  while (Date.now() < stop) {
    try {
      answer = await fs.readFile(out + "/independent-answer.txt", "utf8");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!answer) throw Error("No independent answer supplied");
  await page.getByLabel("独立回答新问题", { exact: true }).fill(answer);
  await page
    .getByRole("button", { name: "保存回答并检验", exact: true })
    .click();
  await waitStage(page.locator(".retest-outcome"), "retest", () =>
    page
      .getByRole("button", { name: "获取再测结果 / 重试", exact: true })
      .click(),
  );
  await fs.writeFile(
    out + "/retest.txt",
    await page.locator("#page-root").innerText(),
  );
  const retest = page.url();
  await page
    .getByRole("link", { name: "回看完整学习轨迹", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "第一次回答", exact: true })
    .waitFor();
  const history = page.url();
  await page.reload();
  await page
    .getByRole("heading", { name: "换情境检验", exact: true })
    .waitFor();
  await page.close();
  page = await context.newPage();
  await page.goto(history);
  await page
    .getByRole("heading", { name: "换情境检验", exact: true })
    .waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, url] of [
      ["history", history],
      ["original", original],
      ["retest", retest],
      ["course", course],
      ["recheck", access.base + "/app/"],
    ]) {
      await page.goto(url);
      await page.locator("#page-root").waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        name + " " + width,
      );
      await page.screenshot({
        path: out + "/" + name + "-" + width + ".png",
        fullPage: true,
      });
    }
  }
  await page.goto(access.base + "/app/settings");
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出完整 JSON 备份", exact: true })
    .click();
  await (await dl).saveAs(out + "/backup.json");
  const backup = JSON.parse(await fs.readFile(out + "/backup.json", "utf8"));
  assert.ok(backup.stores.retests.length);
  assert.equal(backup.stores.tasks.filter((t) => t.targetGapId).length, 1);
  assert.ok(
    backup.stores.attempts
      .find((a) => a.revision.length)
      ?.userAnswer.includes("所有食品影响者"),
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + "/results.json",
    JSON.stringify(
      {
        base: access.base,
        history,
        original,
        retest,
        errors,
        events,
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS RC public real PDF → real AI → revision → challenge → independent answer → retest → refresh/reopen 1440/390",
  );
} catch (e) {
  await fs.writeFile(
    out + "/failure.txt",
    e.message + "\n" + (await page.locator("body").innerText()),
  );
  throw e;
} finally {
  await browser.close();
}
