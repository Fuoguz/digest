// The production build under the production headers: serves dist/ with exactly the
// headers and rewrites in vercel.json, then exercises the parts a strict Content
// Security Policy could break (module workers, WebAssembly OCR, PDF.js, d3, AI calls,
// backup download). Any CSP violation fails the test. Mock AI (not real-model QA).
import { spawn, execFileSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "ignore" });
const vercel = JSON.parse(await fs.readFile("vercel.json", "utf8"));
const headers = vercel.headers[0].headers;
const csp = headers.find((h) => h.key === "Content-Security-Policy").value;
const out = "qa-artifacts/csp-browser";
await fs.mkdir(out, { recursive: true });
const mockPort = "5199",
  port = "5198",
  base = "http://127.0.0.1:" + port;
const mock = spawn(process.execPath, ["tests/fixtures/mock-ai-server.mjs"], {
  env: { ...process.env, DIGEST_QA_PORT: mockPort },
  stdio: "pipe",
  windowsHide: true,
});
await new Promise((r) => mock.stdout.once("data", r));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm" };
const dist = path.resolve("dist");
const server = http.createServer(async (req, res) => {
  for (const h of headers) res.setHeader(h.key, h.value);
  const url = new URL(req.url, base);
  if (req.method === "POST") {
    // Developer AI endpoint on the same origin, answered by the QA mock.
    const body = [];
    for await (const c of req) body.push(c);
    const upstream = await fetch("http://127.0.0.1:" + mockPort + url.pathname, { method: "POST", headers: { "content-type": "application/json" }, body: Buffer.concat(body) });
    res.setHeader("Content-Type", "application/json");
    res.end(Buffer.from(await upstream.arrayBuffer()));
    return;
  }
  let file = url.pathname === "/" ? "/index.html" : url.pathname;
  if ((file === "/app" || file.startsWith("/app/")) && !path.extname(file)) file = "/app/index.html";
  const target = path.join(dist, file);
  if (!target.startsWith(dist + path.sep)) return res.writeHead(403).end();
  try {
    const data = await fs.readFile(target);
    res.setHeader("Content-Type", types[path.extname(target)] || "application/octet-stream");
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(Number(port), "127.0.0.1", r));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ locale: "zh-CN", viewport: { width: 1280, height: 860 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const violations = [];
const errors = [];
page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && violations.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
await ctx.addInitScript(() => {
  document.addEventListener("securitypolicyviolation", (e) => (window.__csp = [...(window.__csp || []), e.violatedDirective + " " + e.blockedURI]));
});
const pass = (s) => console.log("PASS", s);
const cspEvents = () => page.evaluate(() => window.__csp || []);

function imagePdf(images) {
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;
  const catalog = add(null);
  const pages = add(null);
  const kids = [];
  for (const img of images) {
    const image = add(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`),
      img.jpeg,
      Buffer.from("\nendstream"),
    ]));
    const w = 612, h = Math.round((612 * img.height) / img.width);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    const stream = add(Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    kids.push(add(Buffer.from(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${stream} 0 R >>`)));
  }
  objects[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pages} 0 R >>`);
  objects[pages - 1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`);
  const parts = [Buffer.from("%PDF-1.4\n")];
  const offsets = [];
  let length = parts[0].length;
  objects.forEach((body, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
    parts.push(chunk);
    length += chunk.length;
  });
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(parts);
}

try {
  const landing = await page.goto(base + "/");
  assert.equal(landing.headers()["content-security-policy"], csp);
  await page.goto(base + "/app/settings");
  await page.getByText("开发者选项", { exact: true }).click();
  await page.getByRole("button", { name: "管理开发者服务" }).click();
  await page.getByLabel("Chat Completions 地址").fill(base + "/success/v1");
  await page.getByLabel("模型名称", { exact: true }).fill("QA fixture");
  await page.getByLabel("API Key", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  pass("landing and app load from the production build with the production CSP");

  await page.goto(base + "/app/library");
  await page.getByRole("button", { name: /导入资料/ }).first().click();
  const text = "第一段：主动回忆要求先尝试回答。\n\n第二段：间隔练习把复习分布在多天进行。";
  await page.locator("#file-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from(text) });
  await page.locator("#file-status.ready").waitFor();
  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page.locator(".doc-title", { hasText: "notes" }).click();
  await page.getByRole("button", { name: "开始研读", exact: true }).click();
  await page.locator(".reading-claim").first().waitFor();
  await page.getByRole("button", { name: "沉淀为知识点", exact: true }).first().click();
  await page.getByLabel("知识点名称", { exact: true }).fill("主动回忆");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await page.goto(base + "/app/graph");
  await page.locator("svg").first().waitFor();
  pass("AI reading (same-origin call) and the knowledge graph (d3) work under the CSP");

  // Scanned PDF: PDF.js worker + Tesseract worker + WebAssembly.
  const jpeg = Buffer.from(
    (await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 1700;
      c.height = 700;
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = "#111";
      g.font = '58px "Microsoft YaHei", "PingFang SC", sans-serif';
      ["认知失调理论", "Cognitive dissonance theory"].forEach((line, i) => g.fillText(line, 110, 190 + i * 120));
      return c.toDataURL("image/jpeg", 0.92);
    })).split(",")[1],
    "base64",
  );
  await page.goto(base + "/app/library");
  await page.getByRole("button", { name: /导入资料/ }).first().click();
  await page.locator("#file-input").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: imagePdf([{ jpeg, width: 1700, height: 700 }]) });
  await page.locator(".ocr-offer").waitFor();
  await page.getByRole("button", { name: "开始识别" }).click();
  await page.locator("#file-status.ready").waitFor({ timeout: 180000 });
  assert.match(await page.locator("#import-content").inputValue(), /认知失调/);
  pass("PDF.js and local OCR (workers + WebAssembly) run under the CSP");

  await page.keyboard.press("Escape");
  await page.goto(base + "/app/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整 JSON 备份" }).click();
  await download;
  pass("backup download works under the CSP");

  assert.deepEqual(violations, [], "console CSP violations");
  assert.deepEqual(await cspEvents(), []);
  assert.deepEqual(errors, []);
  pass("no CSP violations and no page errors");

  // The policy is really enforced: an injected inline script does not run.
  const ran = await page.evaluate(() => {
    const s = document.createElement("script");
    s.textContent = "window.__injected = true";
    document.body.append(s);
    return window.__injected === true;
  });
  assert.equal(ran, false);
  assert.ok((await cspEvents()).some((v) => v.startsWith("script-src")));
  pass("an injected inline script is blocked by the policy");
} catch (e) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true }).catch(() => {});
  console.log("violations:", violations);
  throw e;
} finally {
  await browser.close();
  server.close();
  mock.kill();
}
