import { getAgentRuntimeConfig } from "./app/config.js";
import { createApp } from "./app/orchestrator.js";

// 启动核心应用。
// 注意：本文件是 ES Module（被 index.html 以 <script type="module"> 引入）。
// 浏览器在 file:// 协议下会出于安全策略拦截模块脚本，导致这里不会执行——
// 这正是"双击打开后点击无反应"的根因。因此我们在成功启动后写入一个全局标记，
// 供 index.html 里的兜底引导脚本判断：是正常运行，还是被 file:// 拦截了。
try {
  const app = createApp(getAgentRuntimeConfig());
  app.start();
  // 标记核心模块已成功启动（兜底引导脚本据此区分 file:// 拦截 vs 正常运行）。
  window.__DIGEST_BOOTED__ = true;
} catch (error) {
  // 真正的运行时错误也会走到这里，方便在控制台定位（而不是静默失败）。
  console.error("Digest 启动失败：", error);
}
