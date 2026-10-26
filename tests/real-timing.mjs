// Opt-in, paid: measures real-model waiting time for the app's own AI flows.
// Run it yourself with the same variables as production (they are read from the
// environment, never written anywhere):
//   DIGEST_REAL_TIMING=1 MODEL_API_BASE_URL=... MODEL_NAME=... MODEL_API_KEY=... npm run qa:real-timing
// Optional: DIGEST_TIMING_FILE (txt/md/docx/pptx/epub), DIGEST_TIMING_QUESTION,
// DIGEST_TIMING_ANSWER, DIGEST_TIMING_RUNS (default 1).
// Output: timings and counts only (no material, answers or model text).
import fs from "node:fs";
import path from "node:path";
import { createDocument } from "../src/domain/documents.js";
import { documentSnapshot } from "../src/domain/evidence.js";
import { prepareFeedbackContext, generateFeedback } from "../src/domain/training.js";
import { rescueRetrieval } from "../src/ai/retrieval-rescue.js";
import { suggestTasks } from "../src/ai/task-suggestions.js";
import { DigestAIService } from "../src/ai/service.js";
import { readingChunks } from "../src/domain/context.js";
import { documentChapters } from "../src/domain/documents.js";

const env = process.env;
if (env.DIGEST_REAL_TIMING !== "1") throw Error("Opt in with DIGEST_REAL_TIMING=1 (paid model calls).");
for (const name of ["MODEL_API_BASE_URL", "MODEL_NAME", "MODEL_API_KEY"])
  if (!env[name]) throw Error("Missing " + name + " in the environment.");

const endpoint = new URL(env.MODEL_API_BASE_URL);
endpoint.pathname = endpoint.pathname.replace(/\/$/, "");
if (!endpoint.pathname.endsWith("/chat/completions")) endpoint.pathname += "/chat/completions";

// Same request shape as the production proxy (pilot/handler.js).
const calls = [];
const transport = {
  async request(messages, { signal } = {}) {
    const started = performance.now();
    const send = (format) =>
      fetch(endpoint, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.MODEL_API_KEY },
        body: JSON.stringify({
          model: env.MODEL_NAME,
          messages,
          ...(format ? { response_format: { type: "json_object" } } : {}),
          temperature: 0.2,
          max_tokens: 12000,
        }),
      });
    let response = await send(true);
    if (response.status === 400 || response.status === 422) response = await send(false);
    const ms = Math.round(performance.now() - started);
    const chars = messages.reduce((n, m) => n + m.content.length, 0);
    if (!response.ok) {
      calls.push({ ms, chars, status: response.status });
      throw Error("Model HTTP " + response.status);
    }
    const data = await response.json();
    calls.push({ ms, chars, status: 200 });
    return data.choices?.[0]?.message?.content || "";
  },
};

async function loadMaterial() {
  if (!env.DIGEST_TIMING_FILE) {
    const text = [
      "议程设置理论关注媒体如何影响公众认为哪些议题重要，而不是直接决定人们对议题的立场。",
      "框架理论关注报道如何选择和突出现实的某些方面，从而影响问题定义、因果解释与解决办法。",
      "仅凭报道数量上升，不能推断公众支持某项政策；判断态度需要独立的态度测量。",
      "实验研究可以改变报道量并比较受试者对议题重要性的评价，但外部效度有限。",
    ].join("\n\n");
    return createDocument({ sourceType: "text", rawContent: text, title: "sample" });
  }
  const file = path.resolve(env.DIGEST_TIMING_FILE);
  const bytes = fs.readFileSync(file);
  const ext = path.extname(file).slice(1).toLowerCase();
  const blob = new File([bytes], path.basename(file));
  const started = performance.now();
  let result;
  if (["docx", "pptx"].includes(ext)) result = await (await import("../src/importers/office.js")).extractOfficeFile(blob);
  else if (ext === "epub") result = await (await import("../src/importers/epub.js")).extractEpubFile(blob);
  else if (["txt", "md", "markdown"].includes(ext)) result = await (await import("../src/importers/text.js")).extractTextFile(blob);
  else throw Error("Use txt, md, docx, pptx or epub for this script (PDF parsing needs the browser).");
  extractMs = Math.round(performance.now() - started);
  return createDocument({ ...result, readingMode: "general" });
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
let extractMs = null;
const runs = Math.max(1, Number(env.DIGEST_TIMING_RUNS) || 1);
const doc = await loadMaterial();
const snapshot = await documentSnapshot(doc);
const course = { title: "timing", description: "" };
const task = {
  documentIds: [doc.id],
  prompt: env.DIGEST_TIMING_QUESTION || "请结合材料解释议程设置与框架的区别，并说明为什么报道数量不能证明公众支持。",
  rubric: "",
  title: "timing",
};
const answer = env.DIGEST_TIMING_ANSWER || "议程设置和框架是一回事，报道越多说明公众越支持。";
const results = { feedback: [], reading: [], suggestions: [] };

for (let i = 0; i < runs; i++) {
  // Feedback: context, optional retrieval rescue, structured feedback.
  calls.length = 0;
  let t0 = performance.now();
  try {
    let context = await prepareFeedbackContext(task, course, [doc], answer);
    const prepared = performance.now();
    context = await rescueRetrieval(context, transport);
    const rescued = performance.now();
    const payload = await generateFeedback(context, transport, "timing-" + i);
    const done = performance.now();
    results.feedback.push({
      ok: true,
      prepareMs: Math.round(prepared - t0),
      rescueMs: Math.round(rescued - prepared),
      modelMs: Math.round(done - rescued),
      totalMs: Math.round(done - t0),
      calls: calls.map((c) => ({ ms: c.ms, chars: c.chars })),
      gaps: payload.feedback?.gaps?.length ?? payload.gaps?.length ?? null,
      partialScope: !!context.retrieval?.scope?.partial,
    });
  } catch (e) {
    results.feedback.push({ ok: false, error: e.message, totalMs: Math.round(performance.now() - t0), calls: calls.length });
  }

  // Reading: the default the Reader now offers (first chapter, or the whole text if it fits).
  calls.length = 0;
  t0 = performance.now();
  const chapters = documentChapters(doc, snapshot.paragraphs.length);
  const end = chapters.length > 1 ? chapters[0].end : snapshot.paragraphs.length - 1;
  const chunks = readingChunks(snapshot.paragraphs.slice(0, end + 1)).length;
  const marks = [];
  try {
    const service = new DigestAIService(transport);
    service.options = {
      start: 0,
      end,
      language: "zh-CN",
      progress: (done, total, synth) => marks.push({ done, synth: !!synth, ms: Math.round(performance.now() - t0) }),
      save: async () => marks.push({ saved: true, ms: Math.round(performance.now() - t0) }),
    };
    const payload = await service.analyze(snapshot, { requestId: "timing-reading-" + i });
    results.reading.push({
      ok: true,
      chunks,
      firstSectionMs: marks.find((m) => m.saved)?.ms ?? null,
      totalMs: Math.round(performance.now() - t0),
      calls: calls.map((c) => ({ ms: c.ms, chars: c.chars })),
      claims: Object.values(payload.result.sections).flatMap((s) => s.items).length,
    });
  } catch (e) {
    results.reading.push({ ok: false, chunks, error: e.message, totalMs: Math.round(performance.now() - t0), calls: calls.length });
  }

  // Question suggestions used by quick practice.
  calls.length = 0;
  t0 = performance.now();
  try {
    const context = await prepareFeedbackContext(
      { documentIds: [doc.id], prompt: "Explain compare apply critique" },
      course,
      [doc],
      "Practice task suggestions",
    );
    context.outputLanguage = "zh-CN";
    const candidates = await suggestTasks(context, transport);
    results.suggestions.push({ ok: true, totalMs: Math.round(performance.now() - t0), count: candidates.length });
  } catch (e) {
    results.suggestions.push({ ok: false, error: e.message, totalMs: Math.round(performance.now() - t0) });
  }
}

const summary = {
  model: env.MODEL_NAME,
  runs,
  material: { paragraphs: snapshot.paragraphs.length, characters: snapshot.source.length, extractMs },
  feedbackMedianMs: median(results.feedback.filter((r) => r.ok).map((r) => r.totalMs)),
  readingFirstSectionMedianMs: median(results.reading.filter((r) => r.ok).map((r) => r.firstSectionMs)),
  readingTotalMedianMs: median(results.reading.filter((r) => r.ok).map((r) => r.totalMs)),
  suggestionsMedianMs: median(results.suggestions.filter((r) => r.ok).map((r) => r.totalMs)),
  failures: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.filter((r) => !r.ok).length])),
};
const out = "qa-artifacts/real-timing";
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, "timing-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
fs.writeFileSync(file, JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
console.log("Details (timings and counts only): " + file);
