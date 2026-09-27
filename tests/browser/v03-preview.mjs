// Live deployment acceptance. Requires existing, private transport credentials in ignored qa-artifacts.
import { chromium } from "playwright";
import fs from "node:fs/promises";
const out = "qa-artifacts/v03-preview";
await fs.mkdir(out, { recursive: true });
const access = JSON.parse(
  await fs.readFile("qa-artifacts/v03-real/new-preview-transport.json", "utf8"),
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
  extraHTTPHeaders: { "x-vercel-protection-bypass": access.secret },
});
await context.addCookies([
  {
    name: "digest_pilot",
    value: access.cookie.split("digest_pilot=")[1],
    url: access.base,
  },
]);
let page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [],
  responses = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/")) {
    responses.push({ path: new URL(r.url()).pathname, status: r.status() });
    console.log("API", new URL(r.url()).pathname, r.status());
  }
});
const source =
  "议程设置指媒体通过议题选择和报道频率，影响公众认为哪些议题重要。不能仅凭报道增多推断公众赞成某政策，也不能据此声称媒体直接决定公众立场。\n\n框架指对同一个问题采用不同解释角度，例如把交通政策呈现为公共健康问题，或呈现为个人成本问题。议程设置与框架可以同时出现，但不是同一个机制。\n\n材料只阐述概念，不含任何效果百分比、实验结果或公众态度调查。";
try {
  await page.goto(access.base + "/");
  await page.locator(".hero").waitFor();
  await page.goto(access.base + "/app/");
  await page.getByLabel("课程名称", { exact: true }).fill("v0.3 真实模型验收");
  await page.getByRole("button", { name: "创建课程", exact: true }).click();
  await page.waitForURL("**/app/courses/*");
  await page.getByRole("button", { name: "添加课程材料", exact: true }).click();
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "teaching-material.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(source),
    });
  await page.locator("#file-status.ready").waitFor();
  await page.locator("#import-title").fill("议程设置与框架 · 教学构造");
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page.getByLabel("任务名称", { exact: true }).fill("解释两个机制的区别");
  await page
    .getByLabel("需要回答的问题", { exact: true })
    .fill(
      "解释议程设置与框架的区别，并说明为什么不能仅凭报道数量推断公众支持。",
    );
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await page.waitForURL("**/app/tasks/*");
  await page
    .getByLabel("先写下你自己的答案", { exact: true })
    .fill(
      "议程设置就是媒体告诉大家必须持有什么观点。框架与议程设置完全相同，只要报道增多，公众必然支持。",
    );
  await page
    .getByRole("button", { name: "保存答案并获取反馈", exact: true })
    .click();
  console.log("WAIT live feedback");
  await page.locator(".gap-card").first().waitFor({ timeout: 200000 });
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
      "议程设置影响公众认为哪些议题重要，框架影响如何解释同一问题。两种机制可以同时出现，但不能等同；增加报道不能证明公众支持某立场，态度结论还需要独立调查证据。",
    );
  await page
    .getByLabel("你本次主要修正了什么？", { exact: true })
    .fill("区分议题重要性和解释角度，撤回从报道数量直接推断公众态度的结论。");
  await page
    .getByRole("button", { name: "保存修订并完成本次练习", exact: true })
    .click();
  await page.getByText("查看我改了什么", { exact: true }).click();
  await page
    .getByRole("button", { name: "立即换题检验", exact: true })
    .first()
    .click();
  console.log("WAIT live transfer challenge");
  await page
    .getByLabel("独立回答新问题", { exact: true })
    .waitFor({ timeout: 200000 });
  const prompt = await page.locator(".challenge-prompt").innerText();
  await fs.writeFile(out + "/challenge.txt", prompt);
  console.log("CHALLENGE_READY", prompt);
  const deadline = Date.now() + 240000;
  let answer;
  while (Date.now() < deadline) {
    try {
      answer = await fs.readFile(out + "/independent-answer.txt", "utf8");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!answer) throw Error("Awaiting manually composed independent answer");
  await page.getByLabel("独立回答新问题", { exact: true }).fill(answer);
  await page
    .getByRole("button", { name: "保存回答并检验", exact: true })
    .click();
  console.log("WAIT live retest");
  await page.locator(".retest-outcome").waitFor({ timeout: 200000 });
  await fs.writeFile(
    out + "/retest.txt",
    await page.locator("#page-root").innerText(),
  );
  await page
    .getByRole("link", { name: "回看完整学习轨迹", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "第一次回答", exact: true })
    .waitFor();
  const url = page.url();
  await page.reload();
  await page
    .getByRole("heading", { name: "换情境检验", exact: true })
    .waitFor();
  await page.close();
  page = await context.newPage();
  await page.goto(url);
  await page
    .getByRole("heading", { name: "换情境检验", exact: true })
    .waitFor();
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ))
    )
      throw Error("Overflow " + width);
    await page.screenshot({
      path: out + "/history-" + width + ".png",
      fullPage: true,
    });
  }
  await page.goto(access.base + "/app/settings");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出完整 JSON 备份", exact: true })
    .click();
  await (await download).saveAs(out + "/backup.json");
  await fs.writeFile(
    out + "/results.json",
    JSON.stringify(
      { base: access.base, history: url, errors, responses, passed: true },
      null,
      2,
    ),
  );
  console.log(
    "PASS deployed live-model loop, evidence, revision diff, transfer, independent second answer, retest, reopen, four widths",
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
