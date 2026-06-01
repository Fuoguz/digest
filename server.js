// ============================================================
// Digest 本地静态服务器（零依赖，仅使用 Node 内置模块）
// ------------------------------------------------------------
// 作用：为本地演示提供一个 http:// 服务器。
// 因为 index.html 使用 ES Module（<script type="module">），
// 浏览器在 file:// 协议下会拦截模块脚本，必须通过 http:// 打开。
//
// 运行方式（任选其一）：
//   1) 双击 启动Digest.bat
//   2) 命令行执行：node server.js   或   npm start
// ============================================================

// 本项目 package.json 设了 "type": "module"，因此用 ES Module 语法（import）。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";

const PORT = 5180;
// ES Module 没有内置 __dirname，这里从当前文件 URL 推导出所在目录。
const ROOT = path.dirname(fileURLToPath(import.meta.url)); // 以本文件所在目录为站点根目录

// 常见文件类型的 MIME。其中 .js / .mjs 必须是 text/javascript，
// 否则浏览器会拒绝把它当作 ES Module 执行（这正是页面无法启动的根源之一）。
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const server = http.createServer((req, res) => {
  try {
    // 去掉查询参数，解码中文/特殊字符路径
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";

    // 归一化并阻止目录穿越（不允许访问站点根目录以外的文件）
    const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(ROOT, safePath);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("403 Forbidden");
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found: " + urlPath);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("500 Server Error");
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("\n[提示] 端口 " + PORT + " 已被占用。");
    console.error("可能 Digest 已经在运行，请直接在浏览器打开： http://127.0.0.1:" + PORT + "/\n");
  } else {
    console.error("\n[错误] 服务器启动失败：", err.message, "\n");
  }
  // 给用户留出阅读时间后退出
  setTimeout(() => process.exit(1), 100);
});

server.listen(PORT, () => {
  const url = "http://127.0.0.1:" + PORT + "/";
  console.log("============================================");
  console.log("   Digest 沉淀 · 本地服务器已启动");
  console.log("============================================");
  console.log("  访问地址： " + url);
  console.log("  正在为你自动打开浏览器...");
  console.log("  （关闭本窗口即可停止服务器）");
  console.log("============================================");

  // 服务器就绪后再打开浏览器：可靠、无引号嵌套、无时序竞争。
  // 设置环境变量 DIGEST_NO_OPEN=1 可跳过自动打开（用于开发预览，避免弹多余窗口）。
  if (!process.env.DIGEST_NO_OPEN) {
    // 跨平台：Windows 用 start，macOS 用 open，Linux 用 xdg-open。
    const opener =
      process.platform === "win32"
        ? 'cmd /c start "" "' + url + '"'
        : process.platform === "darwin"
        ? 'open "' + url + '"'
        : 'xdg-open "' + url + '"';
    exec(opener, () => {});
  }
});
