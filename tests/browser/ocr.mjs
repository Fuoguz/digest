// Local OCR of a scanned (image-only) PDF in real Chrome. The PDF is generated here from
// rendered text, so no private document is used. No network beyond the local test server.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const out = "qa-artifacts/ocr-browser";
await mkdir(out, { recursive: true });
const port = "5189",
  base = "http://127.0.0.1:" + port;
const server = spawn(process.execPath, ["tests/fixtures/mock-ai-server.mjs"], {
  env: { ...process.env, DIGEST_QA_PORT: port },
  stdio: "pipe",
  windowsHide: true,
});
await new Promise((r) => server.stdout.once("data", r));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ locale: "zh-CN", viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
const errors = [];
const requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => requests.push(new URL(r.url()).origin));
const pass = (s) => console.log("PASS", s);

// Render lines of text to JPEG (like a scan) in the browser, then wrap each in a PDF page.
async function scanJpeg(lines) {
  const dataUrl = await page.evaluate((lines) => {
    const c = document.createElement("canvas");
    c.width = 1700;
    c.height = 1100;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#111";
    g.font = '58px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
    lines.forEach((line, i) => g.fillText(line, 110, 190 + i * 120));
    return c.toDataURL("image/jpeg", 0.92);
  }, lines);
  return { jpeg: Buffer.from(dataUrl.split(",")[1], "base64"), width: 1700, height: 1100 };
}
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
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}

try {
  await page.goto(base + "/app/library");
  const pdf = imagePdf([
    await scanJpeg(["认知失调理论", "当行为与态度不一致时，", "人会感到不适并调整态度。"]),
    await scanJpeg(["Cognitive dissonance theory", "explains attitude change", "after insufficient reward."]),
  ]);
  await page.getByRole("button", { name: /导入资料/ }).first().click();
  await page.locator("#file-input").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.locator(".ocr-offer").waitFor();
  assert.match(await page.locator("#file-status").innerText(), /未检测到可提取文本/);
  pass("an image-only PDF is detected as a scan and local OCR is offered");

  const started = Date.now();
  await page.getByRole("button", { name: "开始识别" }).click();
  await page.locator("#file-status.ready").waitFor({ timeout: 180000 });
  const seconds = Math.round((Date.now() - started) / 1000);
  const text = await page.locator("#import-content").inputValue();
  await page.screenshot({ path: out + "/ocr-done.png" });
  assert.match(text, /认知失调/);
  assert.match(text, /态度/);
  assert.match(text, /Cognitive\s+dissonance/i);
  assert.doesNotMatch(text, /认 知/);
  assert.match(await page.locator(".ocr-offer").innerText(), /已识别 2 页/);
  pass("2 scanned pages recognised locally in " + seconds + " s (Chinese and English, no spaces between Chinese characters)");

  await page.getByRole("button", { name: "保存到资料库", exact: true }).click();
  await page.locator(".document-row", { hasText: "scan" }).waitFor();
  await page.locator(".doc-title", { hasText: "scan" }).click();
  await page.locator(".ocr-note").waitFor();
  assert.match(await page.locator(".ocr-note").innerText(), /本地识别（OCR）/);
  const pages = await page.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open("digest-v02"); q.onsuccess = () => r(q.result); });
    const docs = await new Promise((r) => { const q = db.transaction("documents").objectStore("documents").getAll(); q.onsuccess = () => r(q.result); });
    db.close();
    const doc = docs.find((d) => d.title === "scan");
    return { pages: [...new Set(doc.paragraphs.map((p) => p.pageNumber))], ocr: doc.metadata.ocr };
  });
  assert.deepEqual(pages.pages, [1, 2]);
  assert.deepEqual(pages.ocr.pages, [1, 2]);
  pass("saved paragraphs keep page numbers 1–2; the Reader labels the text as OCR (confidence " + pages.ocr.confidence + ")");

  const foreign = [...new Set(requests)].filter((o) => o !== base);
  assert.deepEqual(foreign, []);
  pass("no request left the local origin (engine and language data served by Digest)");
  assert.deepEqual(errors, []);
  pass("no page errors");
} catch (e) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true }).catch(() => {});
  throw e;
} finally {
  await browser.close();
  server.kill();
}
