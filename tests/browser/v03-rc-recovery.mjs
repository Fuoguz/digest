// Real AI plus explicit Chrome slow-download conditions; never mock model contents.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
if (process.env.DIGEST_RC_REAL !== "1")
  throw Error("Explicit live QA opt-in required");
const out = "qa-artifacts/v03-rc/recovery";
await fs.mkdir(out, { recursive: true });
const a = JSON.parse(
  await fs.readFile("qa-artifacts/v03-rc/transport.json", "utf8"),
);
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  ...(process.env.HTTPS_PROXY
    ? { proxy: { server: process.env.HTTPS_PROXY } }
    : {}),
});
const context = await browser.newContext({
  locale: "zh-CN",
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
await context.addCookies([
  {
    name: "digest_pilot",
    value: a.cookie.split("digest_pilot=")[1],
    url: a.base,
  },
]);
const p = await context.newPage();
const errors = [],
  events = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("request", (r) => {
  if (new URL(r.url()).pathname === "/api/digest")
    events.push({ event: "start", at: Date.now() });
});
p.on("requestfailed", (r) => {
  if (new URL(r.url()).pathname === "/api/digest")
    events.push({
      event: "failed",
      error: r.failure()?.errorText,
      at: Date.now(),
    });
});
p.on("response", async (r) => {
  if (new URL(r.url()).pathname === "/api/digest")
    try {
      const body = await r.json();
      events.push({
        event: "response",
        at: Date.now(),
        status: r.status(),
        logicalStatus: body.httpStatus || r.status(),
        code: body.code,
      });
      await fs.writeFile(
        out + "/network.json",
        JSON.stringify(events, null, 2),
      );
    } catch {}
});
async function stores() {
  return p.evaluate(async () => {
    const { openDatabase } = await import("/src/data/db.js");
    const { exportBackup } = await import("/src/data/backup.js");
    const db = await openDatabase();
    const b = await exportBackup(db);
    // The app owns this cached connection; sampling must not close it.
    return b.stores;
  });
}
try {
  await p.goto(a.base + "/app/settings");
  await p
    .getByLabel("选择 Digest JSON 备份")
    .setInputFiles("qa-artifacts/v03-rc/e2e/backup.json");
  await p.getByText(/已恢复 1 份资料/).waitFor();
  const data = await stores();
  const original = data.tasks.find((t) => !t.targetGapId),
    beforeOriginal = data.attempts.find((x) => x.taskId === original.id);
  await p.goto(a.base + "/app/courses/" + original.courseId);
  await p.getByText("创建学习任务", { exact: true }).click();
  await p.getByLabel("任务名称", { exact: true }).fill("RC慢网取消恢复");
  await p.getByLabel("需要回答的问题", { exact: true }).fill(original.prompt);
  await p.getByRole("button", { name: "创建任务", exact: true }).click();
  await p.waitForURL("**/app/tasks/*");
  const taskId = p.url().split("/").at(-1);
  await p
    .getByLabel("先写下你自己的答案", { exact: true })
    .fill(beforeOriginal.userAnswer);
  const cdp = await context.newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: 32,
    uploadThroughput: -1,
  });
  await p
    .getByRole("button", { name: "保存答案并获取反馈", exact: true })
    .click();
  const start = Date.now(),
    samples = [];
  for (const seconds of [30, 60, 90]) {
    while (Date.now() - start < seconds * 1000)
      await p.waitForTimeout(
        Math.min(1000, seconds * 1000 - (Date.now() - start)),
      );
    assert.ok(
      await p
        .getByRole("button", { name: "取消反馈", exact: true })
        .isVisible(),
      "pending at " + seconds,
    );
    const text = await p.locator("#page-root").innerText();
    assert.ok(/正在核对相关材料|正在分析你的回答/.test(text));
    assert.ok(!/Thinking \d+%|预计还需/.test(text));
    samples.push({ seconds, text });
    await p.screenshot({
      path: out + "/pending-" + seconds + ".png",
      fullPage: true,
    });
    console.log("OBSERVED real-request slow network", seconds + "s");
  }
  await p.getByRole("button", { name: "取消反馈", exact: true }).click();
  await p
    .getByText("已取消，首次答案与已有反馈保留。", { exact: true })
    .waitFor();
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  const cancelled = await stores(),
    saved = cancelled.attempts.filter((x) => x.taskId === taskId);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].userAnswer, beforeOriginal.userAnswer);
  assert.equal(saved[0].feedbackId, null);
  assert.equal(saved[0].activeRequestId, null);
  assert.equal(
    cancelled.learningGaps.filter((g) => g.taskId === taskId).length,
    0,
  );
  assert.deepEqual(
    cancelled.attempts.find((x) => x.id === beforeOriginal.id).revision,
    beforeOriginal.revision,
  );
  await fs.writeFile(
    out + "/cancelled.json",
    JSON.stringify(
      {
        taskId,
        attemptId: saved[0].id,
        answerPreserved: true,
        revisionPreserved: true,
        noPartialGap: true,
      },
      null,
      2,
    ),
  );
  await p.getByRole("button", { name: "获取反馈 / 重试", exact: true }).click();
  const retryStart = Date.now();
  while (
    !(await p
      .locator(".gap-card")
      .first()
      .isVisible()
      .catch(() => false)) &&
    Date.now() - retryStart < 365000
  ) {
    const alerts = p.locator("[role=alert]");
    if ((await alerts.count()) && (await alerts.last().isVisible())) {
      await fs.writeFile(
        out + "/retry-error.txt",
        await alerts.last().innerText(),
      );
      break;
    }
    await p.waitForTimeout(1000);
  }
  await fs.writeFile(
    out + "/retry-body.txt",
    await p.locator("#page-root").innerText(),
  );
  await fs.writeFile(
    out + "/retry-backup.json",
    JSON.stringify(await stores()),
  );
  if (!(await p.locator(".gap-card").first().isVisible()))
    throw Error("Actual retry did not produce feedback; see recorded UI/state");
  const result = await stores();
  assert.equal(result.attempts.filter((x) => x.taskId === taskId).length, 1);
  assert.equal(
    result.feedback.filter((x) => x.attemptId === saved[0].id).length,
    1,
  );
  assert.equal(
    result.tasks.filter((t) => t.targetGapId).length,
    data.tasks.filter((t) => t.targetGapId).length,
  );
  assert.deepEqual(
    result.attempts.find((x) => x.id === beforeOriginal.id).revision,
    beforeOriginal.revision,
  );
  assert.deepEqual(errors, []);
  await p.reload();
  await p.locator(".gap-card").first().waitFor();
  await fs.writeFile(
    out + "/results.json",
    JSON.stringify(
      {
        base: a.base,
        profile:
          "real Chrome downloadThroughput=32 B/s, normal upload, zero added latency",
        samples,
        events,
        errors,
        cancelled: true,
        retryPassed: true,
        singleAttempt: true,
        noPartialGap: true,
        originalRevisionPreserved: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS real slow-network request cancel at 90s → normal-network retry; state intact and one attempt/feedback",
  );
} catch (e) {
  await fs.writeFile(
    out + "/failure.txt",
    e.message + "\n" + (await p.locator("body").innerText()),
  );
  await fs.writeFile(out + "/network.json", JSON.stringify(events, null, 2));
  await fs.writeFile(
    out + "/failure-backup.json",
    JSON.stringify(await stores()),
  );
  throw e;
} finally {
  await browser.close();
}
