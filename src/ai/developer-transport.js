import { AnalysisError } from "./schema.js";

export function readDeveloperConfig(storage = globalThis.localStorage) {
  try {
    const config = JSON.parse(storage.getItem("digest:developer-ai") || "{}");
    return {
      endpoint: config.endpoint || "",
      model: config.model || "",
      key: storage.getItem("digest_api_key") || "",
    };
  } catch {
    return { endpoint: "", model: "", key: "" };
  }
}
export function saveDeveloperConfig(config, storage = globalThis.localStorage) {
  const endpoint = new URL(config.endpoint);
  if (
    endpoint.protocol !== "https:" &&
    !(
      endpoint.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)
    )
  ) {
    throw new AnalysisError(
      "configuration",
      "服务地址必须使用 HTTPS，本地开发可使用 localhost HTTP。",
    );
  }
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new AnalysisError(
      "configuration",
      "请填写不含凭据或查询参数的服务地址。",
    );
  if (!config.model.trim())
    throw new AnalysisError("configuration", "请填写模型名称。");
  storage.setItem(
    "digest:developer-ai",
    JSON.stringify({ endpoint: endpoint.href, model: config.model.trim() }),
  );
  if (config.key) storage.setItem("digest_api_key", config.key.trim());
}

export class DeveloperTransport {
  constructor(
    config,
    { fetchImpl = globalThis.fetch.bind(globalThis), timeoutMs = 90000 } = {},
  ) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }
  async request(messages, { signal } = {}) {
    const { endpoint, model, key } = this.config;
    if (!endpoint || !model || !key)
      throw new AnalysisError(
        "no_configuration",
        "尚未配置 Developer AI Service。原文阅读不受影响。",
      );
    const url = endpoint.replace(/\/$/, "");
    const requestURL = url.endsWith("/chat/completions")
      ? url
      : url + "/chat/completions";
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(requestURL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });
      if (!response.ok)
        throw new AnalysisError(
          "http_error",
          "AI 服务返回 HTTP " +
            response.status +
            "。请检查模型、权限或稍后重试。",
        );
      const body = await response.json();
      const text = body?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim())
        throw new AnalysisError("empty_result", "AI 服务返回空结果。");
      return text;
    } catch (error) {
      if (timedOut)
        throw new AnalysisError(
          "timeout",
          "分析超时。可以重试，原有结果仍然保留。",
        );
      if (signal?.aborted)
        throw new DOMException("Analysis cancelled", "AbortError");
      if (error instanceof AnalysisError) throw error;
      throw new AnalysisError(
        "network_error",
        "无法连接 AI 服务，请检查网络、服务地址及浏览器 CORS 支持。",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
}
