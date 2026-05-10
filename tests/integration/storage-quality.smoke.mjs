import { evaluateDigestQuality, normalizeDigestNode } from "../../src/modules/storage.js";
import { normalizeDigestOutput } from "../../src/modules/api.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const normalized = normalizeDigestNode({
    id: "n1",
    label: "demo",
    review: { count: 1, history: [{ at: new Date().toISOString(), intervalDays: 1 }] }
  });

  assert(typeof normalized.createdAt === "string", "normalizeDigestNode should provide createdAt");
  assert(Array.isArray(normalized.review.history), "normalizeDigestNode should preserve review.history");

  const output = normalizeDigestOutput({ mainPoint: "A", arguments: ["B"], framework: "C", question: "D" });
  assert(output.arguments.length === 1, "normalizeDigestOutput should preserve arguments");

  const quality = evaluateDigestQuality("注意力 与 算法", {
    mainPoint: "注意力被算法塑造",
    arguments: ["短视频通过即时奖励强化停留"],
    framework: "刺激-反馈-依赖",
    question: "如何重新夺回注意力？"
  });

  assert(Number.isFinite(quality.confidence), "quality confidence should be numeric");
  assert(quality.completeness >= 75, "quality completeness should be >= 75 in smoke case");

  console.log("storage-quality smoke passed");
}

run();
