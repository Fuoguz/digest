// Fresh browser profile. Deterministic model fixtures, not model acceptance.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const out = "qa-artifacts/upgrade/browser";
await mkdir(out, { recursive: true });
const base = "http://127.0.0.1:5194";
const server = spawn(process.execPath, ["tests/fixtures/mock-ai-server.mjs"], {
  env: { ...process.env, DIGEST_QA_PORT: "5194" },
  stdio: "pipe",
  windowsHide: true,
});
await new Promise((resolve, reject) => {
  server.stdout.once("data", resolve);
  server.once("error", reject);
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  locale: "zh-CN",
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (s) => {
  checks.push(s);
  console.log("PASS", s);
};
try {
  await page.goto(base + "/app/");
  await page
    .getByLabel("课程名称", { exact: true })
    .fill("媒体真实性 · User-owned title");
  await page.getByLabel("界面语言", { exact: true }).selectOption("en");
  await page.getByLabel("Course name", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Course name", { exact: true }).inputValue(),
    "媒体真实性 · User-owned title",
  );
  check("language switch preserves unsaved course form and user title");
  await page
    .getByRole("button", { name: "Create course", exact: true })
    .click();
  await page.waitForURL("**/app/courses/*");
  const course = page.url();
  await page
    .getByRole("button", { name: "Add course material", exact: true })
    .click();
  const pdf = process.env.DIGEST_TEST_PDF;
  if (pdf) {
    await page.locator("#file-input").setInputFiles(pdf);
    await page.locator("#file-status.ready").waitFor();
    assert.equal(
      (await page.locator("#import-content").inputValue()).length,
      32285,
    );
    check(
      "actual Guardian PDF imports 32,285 characters through browser upload",
    );
  } else {
    await page
      .locator("#import-content")
      .fill(
        Array.from(
          { length: 50 },
          (_, i) =>
            "Paragraph " + i + ": " + "Distinct source context. ".repeat(50),
        ).join("\n\n"),
      );
  }
  await page.locator("#import-title").fill("Guardian · Authenticity study");
  await page
    .getByRole("button", { name: "Save to library", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "媒体真实性 · User-owned title",
      exact: true,
    })
    .waitFor();
  assert.equal(page.url(), course);
  await page
    .getByRole("link", { name: "Guardian · Authenticity study", exact: true })
    .click();
  await page.locator(".source-paragraph").first().waitFor();
  const reader = page.url();
  assert.equal(await page.locator(".source-paragraph").count(), pdf ? 54 : 50);
  check(
    "course import links material directly and retains original paragraphs",
  );
  await page.goto(base + "/app/settings");
  await page.getByText("Developer options", { exact: true }).click();
  await page.getByRole("button", { name: "Manage developer service" }).click();
  await page.getByLabel("Chat Completions URL").fill(base + "/success/v1");
  await page.getByLabel("Model name", { exact: true }).fill("fixture");
  await page.getByLabel("API Key", { exact: true }).fill("fixture");
  await page
    .getByRole("button", { name: "Save configuration", exact: true })
    .click();
  await page.goto(reader);
  let sectionCalls = 0;
  await page.route("**/success/v1/chat/completions", route => {
    sectionCalls++;
    return sectionCalls === 2
      ? route.fulfill({status:503,contentType:'application/json',body:'{}'})
      : route.continue();
  });
  await page
    .getByRole("button", { name: "Analyze source", exact: true })
    .click();
  await page.locator(".analysis-error").waitFor();
  assert.equal(await page.locator(".reading-overview").count(),0);
  await page.reload();
  await page.getByRole("button", {name:"Analyze source",exact:true}).click();
  await page.locator(".reading-overview").waitFor();
  // One failed request, each source section once, one synthesis: completed section was reused.
  if (pdf) assert.equal(sectionCalls,6);
  await page.unroute("**/success/v1/chat/completions");
  check("second-section failure → refresh → checkpoint resume; no false completed overview");
  if (pdf)
    assert.ok((await page.locator(".scope-notice").innerText()).includes("4"));
  await page.reload();
  await page.locator(".reading-overview").waitFor();
  check("full-source chunk reading, synthesis and reload persistence");
  await page.locator(".evidence-action").first().click();
  await page.locator("mark.evidence-highlight").waitFor();
  check("chunked evidence links to exact original paragraph");
  await page.goto(course);
  await page
    .getByLabel("Task name", { exact: true })
    .fill("Explain authenticity");
  await page
    .getByLabel("Question to answer", { exact: true })
    .fill(
      "Why can commercial incentives undermine authenticity in food influencer recommendations?",
    );
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page.waitForURL("**/app/tasks/*");
  const answer =
    "My original answer: commercial incentives can shape what is shown, but payment alone does not establish deception.";
  await page
    .getByLabel("Write your own answer first", { exact: true })
    .fill(answer);
  await page
    .getByText("Draft saved in this browser.", { exact: true })
    .waitFor();
  await page
    .getByLabel("Interface language", { exact: true })
    .selectOption("zh-CN");
  await page.getByLabel("先写下你自己的答案", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("先写下你自己的答案", { exact: true }).inputValue(),
    answer,
  );
  await page.getByLabel("界面语言", { exact: true }).selectOption("en");
  await page
    .getByLabel("Write your own answer first", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Write your own answer first", { exact: true })
      .inputValue(),
    answer,
  );
  check("answer draft survives both language switches");
  await page
    .getByRole("button", { name: "Save answer & get feedback", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Gaps to address", exact: true })
    .waitFor();
  const attempt = page.url();
  await page
    .getByLabel("Revise your answer", { exact: true })
    .fill(
      answer +
        " I will distinguish sponsorship, disclosure and evidence of deception.",
    );
  await page
    .getByLabel("What did you change, and why?", { exact: true })
    .fill("Separated incentives from demonstrated deception.");
  await page
    .getByRole("button", {
      name: "Save revision & finish practice",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", { name: "Revision complete", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "Revision complete", exact: true })
    .waitFor();
  check("English answer-feedback-revision loop persists");
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(base + "/app/");
    await page.locator(".language-control select").selectOption(locale);
    await page.locator("#page-root h1").waitFor();
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, url] of [
        ["landing", base + "/"],
        ["desk", base + "/app/"],
        ["library", base + "/app/library"],
        ["reader", reader],
        ["review", base + "/app/review"],
        ["graph", base + "/app/graph"],
        ["course", course],
        ["task", attempt],
        ["settings", base + "/app/settings"],
      ]) {
        await page.goto(url);
        await page
          .locator(name === "landing" ? ".hero" : "#page-root>section")
          .waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          locale + " " + name + " " + width + " overflow",
        );
        if (width === 1440 || width === 390)
          await page.screenshot({
            path: out + "/" + locale + "-" + name + "-" + width + ".png",
            fullPage: true,
          });
      }
    }
  }
  check(
    "two languages, nine pages at 1440/1024/768/390: no horizontal overflow",
  );
  assert.deepEqual(errors, []);
  check("no uncaught browser errors");
  await writeFile(
    out + "/results.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
} finally {
  await browser.close();
  server.kill();
}
