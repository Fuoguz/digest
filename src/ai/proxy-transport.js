import { t as tr, th } from "../workspace/i18n.js";
import { AnalysisError } from "./schema.js";
import {
  DeveloperTransport,
  readDeveloperConfig,
} from "./developer-transport.js";
import { el, button } from "../reader/dom.js";
export function useProxy() {
  return (
    !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) &&
    localStorage.getItem("digest:ai-mode") !== "developer"
  );
}
export function accessDialog(signal) {
  return new Promise((resolve, reject) => {
    const dialog = el("dialog", "developer-dialog"),
      form = el("form", "developer-form"),
      title = el("h2", "", tr("加入 Digest 试用")),
      info = el(
        "p",
        "",
        tr(
          "请输入邀请人提供的试用码。资料保存在此浏览器；分析时所选资料会发送至试用 AI 服务。",
        ),
      ),
      input = el("input", "core-input"),
      status = el("p");
    input.type = "password";
    input.autocomplete = "off";
    input.required = true;
    input.maxLength = 256;
    input.setAttribute("aria-label", tr("试用码"));
    const submit = el("button", "primary-action", tr("验证并继续"));
    submit.type = "submit";
    let finished = false;
    const end = (error) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", abort);
      dialog.close();
      dialog.remove();
      error ? reject(error) : resolve();
    };
    const abort = () => end(new DOMException("Cancelled", "AbortError"));
    form.append(title, info, input, status, submit, button(tr("取消"), abort));
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      abort();
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    dialog.showModal();
    input.focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      submit.disabled = true;
      try {
        const response = await fetch("/api/access", {
          method: "POST",
          credentials: "same-origin",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: input.value }),
        });
        const data = await response.json();
        input.value = "";
        if (!response.ok) throw Error(tr(data.message) || tr("验证失败"));
        end();
      } catch (error) {
        status.textContent =
          error.name === "AbortError" ? tr("验证已取消") : error.message;
        status.setAttribute("role", "alert");
      } finally {
        submit.disabled = false;
      }
    });
  });
}
export class ProxyTransport {
  constructor(
    kind = "digest",
    { timeoutMs = 175000, fetchImpl = globalThis.fetch.bind(globalThis) } = {},
  ) {
    this.kind = kind;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }
  async request(messages, { signal } = {}) {
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const call = () =>
      this.fetchImpl("/api/" + this.kind, {
        method: "POST",
        credentials: "same-origin",
        signal: combined,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
    try {
      let response = await call();
      if (response.status === 401) {
        await accessDialog(combined);
        response = await call();
      }
      let data;
      try {
        data = await response.json();
      } catch (error) {
        combined.throwIfAborted();
        throw new AnalysisError(
          "invalid_response",
          response.ok
            ? tr("AI 服务返回了无法读取的响应，请重试。")
            : tr("试用服务返回 HTTP ") + response.status + tr("，请稍后重试。"),
        );
      }
      combined.throwIfAborted();
      if (!response.ok)
        throw new AnalysisError(
          data?.code || "proxy_error",
          tr(data?.message) || tr("试用 AI 暂时不可用，请重试"),
        );
      if (typeof data?.text !== "string" || !data.text.trim())
        throw new AnalysisError("empty_result", tr("AI 返回为空"));
      return data.text;
    } catch (error) {
      if (deadline.aborted && !signal?.aborted)
        throw new AnalysisError(
          "timeout",
          tr("AI 响应超时，已有答案与结果保留，请稍后重试。"),
        );
      if (error instanceof AnalysisError || error.name === "AbortError")
        throw error;
      throw new AnalysisError(
        "network_error",
        tr("无法连接试用服务，请检查网络后重试"),
      );
    }
  }
}
export function createTransport(kind = "digest") {
  return useProxy()
    ? new ProxyTransport(kind)
    : new DeveloperTransport(readDeveloperConfig());
}
