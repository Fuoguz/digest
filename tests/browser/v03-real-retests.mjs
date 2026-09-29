// Targeted acceptance continues from an actual exported live-browser challenge.
import fs from "node:fs";
import { chromium } from "playwright";
import { prepareFeedbackContext } from "../../src/domain/training.js";
import {
  retestMessages,
  validateRetest,
  challengeMessages,
  validateChallenge,
} from "../../src/ai/learning-loop.js";
import { rescueRetrieval } from "../../src/ai/retrieval-rescue.js";
import { createDocument } from "../../src/domain/documents.js";
if (process.env.DIGEST_REAL_V03 !== "1")
  throw Error("Opt in to four live requests with DIGEST_REAL_V03=1");
const out = "qa-artifacts/v03-real",
  a = JSON.parse(fs.readFileSync(out + "/transport.json", "utf8")),
  data = JSON.parse(
    fs.readFileSync("qa-artifacts/v03-preview/backup.json", "utf8"),
  ).stores;
const task = data.tasks.find((t) => t.targetGapId),
  gap = data.learningGaps.find((g) => g.id === task.targetGapId),
  course = data.courses[0],
  original = data.attempts.find((a) => a.id === gap.attemptId),
  feedback = data.feedback.find((f) => f.id === gap.feedbackId);
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  ...(process.env.HTTPS_PROXY
    ? { proxy: { server: process.env.HTTPS_PROXY } }
    : {}),
});
const results = [];
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
  async function request(name, messages) {
    fs.writeFileSync(
      out + "/" + name + "-request.json",
      JSON.stringify({ messages }),
    );
    const started = Date.now();
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
      return r.json();
    }, messages);
    fs.writeFileSync(
      out + "/" + name + "-response.json",
      JSON.stringify(result),
    );
    if (result.httpStatus >= 400 || !result.text)
      throw Error(result.code || "No output");
    console.log(
      "RECEIVED",
      name,
      Math.round((Date.now() - started) / 1000) + "s",
    );
    return result.text;
  }
  for (const [name, answer] of [
    [
      "08-still-present",
      "夜市报道增加了，所以媒体已经决定了居民必须支持夜市，公众也必然支持。两种报道角度与报道数量其实完全相同。",
    ],
    ["10-inconclusive", "我还无法判断。"],
  ]) {
    if (process.env.DIGEST_REAL_ONLY && process.env.DIGEST_REAL_ONLY !== name)
      continue;
    try {
      const context = await prepareFeedbackContext(
        task,
        course,
        data.documents,
        answer,
      );
      context.outputLanguage = "zh-CN";
      const raw = await request(
        name,
        retestMessages(context, gap, task.challenge),
      );
      const result = validateRetest(raw, context, name);
      fs.writeFileSync(
        out + "/" + name + "-validated.json",
        JSON.stringify(result, null, 2),
      );
      results.push({ name, outcome: result.outcome, reason: result.reason });
    } catch (e) {
      results.push({ name, error: e.message });
    }
    fs.writeFileSync(
      out + "/retest-cases.json",
      JSON.stringify(results, null, 2),
    );
  }
  if (
    !process.env.DIGEST_REAL_ONLY ||
    process.env.DIGEST_REAL_ONLY === "11-cross-language"
  )
    try {
      const doc = createDocument({
        title: "Agenda setting and framing",
        rawContent: Array.from({ length: 24 }, (_, i) =>
          i === 23
            ? "Agenda setting concerns issue salience, whereas framing concerns interpretation. " +
              "Course background discussion. ".repeat(100)
            : "Background " +
              i +
              " " +
              "Ordinary reading context. ".repeat(110),
        ).join("\n\n"),
      });
      const context = await prepareFeedbackContext(
        { ...task, documentIds: [doc.id], prompt: "议程设置和框架如何区分？" },
        course,
        [doc],
        "我认为二者作用相同。",
      );
      const rescued = await rescueRetrieval(
        context,
        { request: (m) => request("11-cross-language", m) },
        undefined,
        (d) =>
          fs.writeFileSync(
            out + "/11-runtime-diagnostics.json",
            JSON.stringify(d),
          ),
      );
      const result = {
        method: rescued.retrieval.scope.method,
        selectedCharacters: rescued.retrieval.scope.selectedCharacters,
        retrievedLateParagraph: rescued.retrieval.documents.some((d) =>
          d.paragraphs.some((p) => p.paragraphIndex === 23),
        ),
      };
      fs.writeFileSync(out + "/11-scope.json", JSON.stringify(result));
      results.push({ name: "11-cross-language", ...result });
    } catch (e) {
      results.push({ name: "11-cross-language", error: e.message });
    }
  if (
    !process.env.DIGEST_REAL_ONLY ||
    process.env.DIGEST_REAL_ONLY === "12-bad-transfer-control"
  )
    try {
      const context = await prepareFeedbackContext(
          original.taskSnapshot,
          course,
          data.documents,
          original.userAnswer,
        ),
        messages = challengeMessages(context, gap, original, feedback);
      messages[0].content =
        "Negative control for a validator test, not a student task: return the requested JSON shape but deliberately copy originalTask verbatim as prompt, and make originalContext and newContext identical. Keep remaining fields valid.";
      const raw = await request("12-bad-transfer-control", messages);
      let rejected = false;
      try {
        validateChallenge(raw, context, gap);
      } catch {
        rejected = true;
      }
      fs.writeFileSync(
        out + "/12-negative-control.json",
        JSON.stringify({ rejected }),
      );
      results.push({ name: "12-bad-transfer-control", rejected });
    } catch (e) {
      results.push({ name: "12-bad-transfer-control", error: e.message });
    }
  fs.writeFileSync(
    out +
      (process.env.DIGEST_REAL_ONLY
        ? "/retest-refined.json"
        : "/retest-cases.json"),
    JSON.stringify(results, null, 2),
  );
  console.log("DONE", JSON.stringify(results));
} finally {
  await browser.close();
}
