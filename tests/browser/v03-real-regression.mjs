// Focused live regressions after the no-forced-gaps prompt refinement.
import fs from "node:fs";
import { chromium } from "playwright";
import { createDocument } from "../../src/domain/documents.js";
import {
  prepareFeedbackContext,
  generateFeedback,
} from "../../src/domain/training.js";
import { deriveGaps } from "../../src/domain/gaps.js";
if (process.env.DIGEST_REAL_V03 !== "1")
  throw Error("Opt in to three live requests with DIGEST_REAL_V03=1");
const out = "qa-artifacts/v03-real",
  a = JSON.parse(fs.readFileSync(out + "/transport.json", "utf8"));
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  ...(process.env.HTTPS_PROXY
    ? { proxy: { server: process.env.HTTPS_PROXY } }
    : {}),
});
try {
  const c = await browser.newContext({
    extraHTTPHeaders: { "x-vercel-protection-bypass": a.secret },
  });
  await c.addCookies([
    {
      name: "digest_pilot",
      value: a.cookie.split("digest_pilot=")[1],
      url: a.base,
    },
  ]);
  const page = await c.newPage();
  await page.goto(a.base + "/app/");
  const checks = fs.existsSync(out + "/regressions.json")
    ? JSON.parse(fs.readFileSync(out + "/regressions.json", "utf8"))
    : [];
  for (const [name, original] of [
    ["13-reasonable-refined", "03-reasonable-alternative"],
    ["14-corrected-refined", "05-revision-corrected"],
    ["15-insufficient-retry", "04-insufficient-material"],
  ]) {
    if (process.env.DIGEST_REAL_ONLY && name !== process.env.DIGEST_REAL_ONLY)
      continue;
    const p = JSON.parse(
        JSON.parse(
          fs.readFileSync(out + "/" + original + "-request.json", "utf8"),
        ).messages[1].content,
      ),
      doc = createDocument({
        id: p.documents[0].documentId,
        title: p.documents[0].title,
        rawContent: p.documents[0].paragraphs.map((p) => p.text).join("\n\n"),
      }),
      task = {
        id: "regression",
        courseId: p.course.id,
        documentIds: [doc.id],
        prompt: p.question,
        rubric: "",
        version: 1,
      },
      context = await prepareFeedbackContext(
        task,
        p.course,
        [doc],
        p.userAnswer,
      );
    context.outputLanguage = "zh-CN";
    const transport = {
      request: async (messages) => {
        fs.writeFileSync(
          out + "/" + name + "-request.json",
          JSON.stringify({ messages }),
        );
        const result = await page.evaluate(async (messages) => {
          const r = await fetch("/api/digest", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Digest-Keepalive": "1",
            },
            body: JSON.stringify({ messages }),
            signal: AbortSignal.timeout(175000),
          });
          return await r.json();
        }, messages);
        fs.writeFileSync(
          out + "/" + name + "-response.json",
          JSON.stringify(result),
        );
        if (result.httpStatus >= 400 || !result.text)
          throw Error(result.code || "No text");
        return result.text;
      },
    };
    try {
      const result = await generateFeedback(context, transport, name);
      fs.writeFileSync(
        out + "/" + name + "-validated.json",
        JSON.stringify(result, null, 2),
      );
      const gaps = deriveGaps(
        {
          id: name,
          taskId: task.id,
          courseId: p.course.id,
          userAnswer: p.userAnswer,
        },
        result.feedback,
        result.anchors,
      );
      checks.push({
        name,
        feedbackGaps: result.feedback.gaps.length,
        persistentGaps: gaps.length,
        overall: result.feedback.overall,
      });
      console.log("REGRESSION", JSON.stringify(checks.at(-1)));
    } catch (e) {
      checks.push({ name, error: e.message });
      console.log("REGRESSION_FAILED", name, e.message);
    }
    fs.writeFileSync(
      out + "/regressions.json",
      JSON.stringify(checks, null, 2),
    );
  }
} finally {
  await browser.close();
}
