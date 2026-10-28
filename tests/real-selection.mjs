// Opt-in, paid: one real-model passage reading through the app's own DigestAIService,
// with the same request shape as the production proxy (pilot/handler.js).
// Run it yourself; the variables are read from the environment and never written anywhere:
//   DIGEST_REAL_MODEL=1 MODEL_API_BASE_URL=... MODEL_NAME=... MODEL_API_KEY=... npm run qa:real-selection
// The material is a built-in synthetic sample. Output: the notes for that sample on the
// console, and counts/timings only in qa-artifacts/real-selection/summary.json.
import fs from "node:fs";
import { createDocument } from "../src/domain/documents.js";
import { documentSnapshot, selectionText, anchorInFocus } from "../src/domain/evidence.js";
import { DigestAIService } from "../src/ai/service.js";

const env = process.env;
if (env.DIGEST_REAL_MODEL !== "1") throw Error("Opt in with DIGEST_REAL_MODEL=1 (one or two paid model calls).");
for (const name of ["MODEL_API_BASE_URL", "MODEL_NAME", "MODEL_API_KEY"])
  if (!env[name]) throw Error("Missing " + name + " in the environment.");
const endpoint = new URL(env.MODEL_API_BASE_URL);
endpoint.pathname = endpoint.pathname.replace(/\/$/, "");
if (!endpoint.pathname.endsWith("/chat/completions")) endpoint.pathname += "/chat/completions";

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
    calls.push({ ms: Math.round(performance.now() - started), status: response.status });
    if (!response.ok) throw Error("Model HTTP " + response.status);
    return (await response.json()).choices?.[0]?.message?.content || "";
  },
};

const text = [
  "议程设置理论关注媒体如何影响公众认为哪些议题重要，而不是直接决定人们对议题的立场。",
  "框架理论关注报道如何选择和突出现实的某些方面，从而影响问题定义、因果解释与解决办法。",
  "仅凭报道数量上升，不能推断公众支持某项政策；判断态度需要独立的态度测量。",
  "实验研究可以改变报道量并比较受试者对议题重要性的评价，但外部效度有限。",
].join("\n\n");
const snapshot = await documentSnapshot(createDocument({ sourceType: "text", rawContent: text, title: "sample" }));
const passage = "仅凭报道数量上升，不能推断公众支持某项政策";
const at = snapshot.paragraphs[2].text.indexOf(passage);
const focus = { start: { paragraphIndex: 2, offset: at }, end: { paragraphIndex: 2, offset: at + passage.length } };
focus.text = selectionText(snapshot.paragraphs, focus);

const service = new DigestAIService(transport);
service.options = {
  start: 1,
  end: 3,
  label: "选段",
  language: "zh-CN",
  focus,
  provenance: { service: "developer", host: endpoint.host, model: env.MODEL_NAME },
};
const started = performance.now();
const { result, anchors } = await service.analyze(snapshot, { requestId: "real-selection" });
const totalMs = Math.round(performance.now() - started);
const claims = Object.values(result.sections).flatMap((s) => s.items);
const byId = new Map(anchors.map((a) => [a.id, a]));
const matched = anchors.filter((a) => a.validationStatus === "matched");
const summary = {
  model: env.MODEL_NAME,
  totalMs,
  calls,
  claims: claims.length,
  claimsWithMatchedEvidence: claims.filter((c) => c.evidenceIds.some((id) => byId.get(id)?.validationStatus === "matched")).length,
  anchors: anchors.length,
  matchedAnchors: matched.length,
  anchorsInPassage: matched.filter((a) => anchorInFocus(a, result.scope.focus)).length,
  reviewQuestions: result.reviewQuestions.length,
  status: result.status,
};
for (const [name, section] of Object.entries(result.sections)) {
  console.log("\n## " + name + (section.status === "missing" ? " (missing: " + section.missingReason + ")" : ""));
  for (const claim of section.items) {
    console.log("- [" + claim.kind + "] " + claim.text);
    for (const id of claim.evidenceIds) {
      const a = byId.get(id);
      console.log("    " + a.validationStatus + (anchorInFocus(a, result.scope.focus) ? " · in passage" : "") + " · ¶" + (a.paragraphIndex + 1) + " “" + a.quote + "”");
    }
  }
}
fs.mkdirSync("qa-artifacts/real-selection", { recursive: true });
fs.writeFileSync("qa-artifacts/real-selection/summary.json", JSON.stringify(summary, null, 2));
console.log("\n" + JSON.stringify(summary, null, 2));
