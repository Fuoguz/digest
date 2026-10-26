import { t as tr } from "../workspace/i18n.js";
import { buildParagraphs } from "../domain/documents.js";

// Local OCR for scanned PDFs: pages are rendered with PDF.js and recognised by Tesseract.js
// running in a worker. Engine and language data are served from Digest itself; the file
// never leaves the browser. Recognised text can contain errors and must be checked.
export const OCR_MAX_PAGES = 60;
const CJK = "\\u3400-\\u9fff\\uf900-\\ufaff\\u3000-\\u303f\\uff00-\\uffef";

// Tesseract separates CJK characters with spaces and keeps visual line breaks.
export function normalizeOcrText(text) {
  const between = new RegExp("(?<=[" + CJK + "])[ \\t]+(?=[" + CJK + "])", "g");
  return text
    .split("\n")
    .map((line) => line.replace(between, "").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .reduce((joined, line) => {
      if (!joined) return line;
      if (/-$/.test(joined) && /^[a-z]/.test(line)) return joined.slice(0, -1) + line;
      const cjkJoin = new RegExp("[" + CJK + "]$").test(joined) || new RegExp("^[" + CJK + "]").test(line);
      return joined + (cjkJoin ? "" : " ") + line;
    }, "");
}

// Paragraph blocks from one page's Tesseract result.
export function pageBlocks(data, pageNumber) {
  const paragraphs = (data.blocks || []).flatMap((block) => block.paragraphs || []);
  const texts = paragraphs.length
    ? paragraphs.map((p) => p.text || "")
    : String(data.text || "").split(/\n\s*\n/);
  return texts
    .map((text) => normalizeOcrText(text))
    .filter((text) => text.replace(/\s/g, "").length > 1)
    .map((text) => ({ text, pageNumber }));
}

export function assembleOcr(blocks) {
  const rawContent = blocks.map((b) => b.text).join("\n\n");
  const paragraphs = buildParagraphs(rawContent);
  if (paragraphs.length === blocks.length)
    paragraphs.forEach((p, i) => (p.pageNumber = blocks[i].pageNumber));
  return { rawContent, paragraphs };
}

export async function ocrPdfFile(file, { from = 1, to, onProgress = () => {}, signal } = {}) {
  const pdfjs = await import("/vendor/pdfjs/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageCount = pdf.numPages;
  const last = Math.min(pageCount, to || pageCount);
  const first = Math.max(1, Math.min(from, last));
  if (last - first + 1 > OCR_MAX_PAGES) {
    await pdf.destroy();
    throw new Error(tr("单次最多识别 ") + OCR_MAX_PAGES + tr(" 页，请缩小页码范围。"));
  }
  onProgress({ phase: "engine", page: 0, total: last - first + 1 });
  const tesseract = await import("/vendor/tesseract/tesseract.esm.min.js");
  const { createWorker } = tesseract.default || tesseract;
  const worker = await createWorker(["chi_sim", "eng"], 1, {
    workerPath: "/vendor/tesseract/worker.min.js",
    corePath: "/vendor/tesseract/core",
    langPath: "/vendor/tesseract/lang",
    // Data files are gzip-compressed but named .traineddata (no .gz) so download
    // managers do not intercept them; Tesseract unpacks gzip by content.
    gzip: false,
    workerBlobURL: false,
  });
  const stop = () => worker.terminate().catch(() => {});
  signal?.addEventListener("abort", stop, { once: true });
  const blocks = [];
  const confidences = [];
  try {
    for (let n = first; n <= last; n++) {
      signal?.throwIfAborted();
      onProgress({ phase: "page", page: n - first + 1, total: last - first + 1 });
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // About 2000px wide: enough detail for small print without exhausting memory.
      const viewport = page.getViewport({ scale: Math.min(3, 2000 / base.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      signal?.throwIfAborted();
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      confidences.push(data.confidence || 0);
      blocks.push(...pageBlocks(data, n));
      page.cleanup();
      canvas.width = canvas.height = 0;
    }
  } finally {
    signal?.removeEventListener("abort", stop);
    await stop();
    await pdf.destroy();
  }
  if (blocks.map((b) => b.text).join("").replace(/\s/g, "").length < 10)
    throw new Error(tr("没有识别出可用的文字。请确认扫描清晰，或换一个页码范围。"));
  const { rawContent, paragraphs } = assembleOcr(blocks);
  const confidence = Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length);
  return {
    title: file.name.replace(/\.pdf$/i, ""),
    sourceType: "pdf",
    rawContent,
    paragraphs,
    metadata: {
      originalFileName: file.name,
      mimeType: file.type || "application/pdf",
      fileSize: file.size,
      pageCount,
      ocr: { engine: "tesseract.js", languages: ["chi_sim", "eng"], pages: [first, last], confidence },
    },
  };
}
