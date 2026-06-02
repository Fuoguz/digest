import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const indexPath = resolve(root, "index.html");
const readmePath = resolve(root, "README.md");
const explanationPath = resolve(root, "PRODUCT_EXPLANATION.md");
const mainPath = resolve(root, "src/main.js");
const orchestratorPath = resolve(root, "src/app/orchestrator.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readUtf8(path) {
  return readFileSync(path, "utf8");
}

const indexHtml = readUtf8(indexPath);
const readme = readUtf8(readmePath);
const mainJs = readUtf8(mainPath);
const orchestratorJs = readUtf8(orchestratorPath);

const requiredPageSignals = [
  "Digest 不是新的通用 AI 助手",
  "核心痛点",
  "学习闭环流程",
  "与通用 AI 工具的差异",
  "项目已有基础",
  "市场验证与商业化路径",
  "配置 AI 服务",
  "API Key",
  "知识节点沉淀",
  "主动回忆"
];

for (const signal of requiredPageSignals) {
  assert(indexHtml.includes(signal), `index.html should explain: ${signal}`);
}

assert(
  indexHtml.includes('class="foundation-section"'),
  "index.html should include a project foundation section for demo credibility"
);

assert(
  indexHtml.includes('class="loop-map"'),
  "index.html should include a named learning-loop visual component"
);

assert(
  indexHtml.includes('id="apiKeyOpenBtn"') &&
    indexHtml.includes('id="apiKeyModal"') &&
    indexHtml.includes('id="apiKeyInput"') &&
    indexHtml.includes('id="saveApiKeyBtn"'),
  "index.html should include a visible API Key configuration flow for live demos"
);

assert(
  indexHtml.includes("src/main.js?v=api-key-config-1") &&
    mainJs.includes("orchestrator.js?v=api-key-config-1") &&
    orchestratorJs.includes("ui.js?v=api-key-config-1") &&
    orchestratorJs.includes("config.js?v=api-key-config-1"),
  "API Key demo modules should be cache-busted so browsers do not reuse stale event-binding code"
);

assert(
  existsSync(explanationPath),
  "PRODUCT_EXPLANATION.md should exist for defense-friendly explanation"
);

const explanation = existsSync(explanationPath) ? readUtf8(explanationPath) : "";
const requiredDocSignals = [
  "为什么学生会用 Digest",
  "和 ChatGPT、Kimi、豆包有什么区别",
  "为什么不是普通 AI 总结工具",
  "商业化",
  "白话解释版"
];

for (const signal of requiredDocSignals) {
  assert(explanation.includes(signal), `PRODUCT_EXPLANATION.md should cover: ${signal}`);
}

assert(
  readme.includes("运行方式") && readme.includes("项目定位") && readme.includes("产品亮点"),
  "README.md should be optimized for setup and product presentation"
);

console.log("product-narrative smoke passed");
