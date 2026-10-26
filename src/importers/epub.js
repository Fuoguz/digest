import { t as tr } from "../workspace/i18n.js";
import { buildParagraphs } from "../domain/documents.js";

// EPUB is a ZIP of XHTML chapters. Text is extracted locally in spine order;
// images, styles and layout are not kept, and DRM-protected books are refused.
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_UNPACKED_SIZE = 200 * 1024 * 1024;
const FONT_OBFUSCATION = [
  "http://www.idpf.org/2008/embedding",
  "http://ns.adobe.com/pdf/enc#RC",
];

export const EPUB_ENCRYPTED_MESSAGE = tr(
  "这本 EPUB 受 DRM 加密保护，无法提取正文。请使用无加密版本，或复制需要的章节后粘贴。",
);
export const EPUB_NO_TEXT_MESSAGE = tr(
  "这本 EPUB 未提取到可用正文，可能是图片版电子书。请复制需要的章节后粘贴。",
);
const INVALID_MESSAGE = tr("无法读取这个 EPUB 文件，文件可能已损坏。");

export function readZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error(INVALID_MESSAGE);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff)
    throw new Error(INVALID_MESSAGE);
  const decoder = new TextDecoder();
  const entries = new Map();
  let unpacked = 0;
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error(INVALID_MESSAGE);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    unpacked += size;
    if (unpacked > MAX_UNPACKED_SIZE)
      throw new Error(tr("EPUB 解压后内容过大，请拆分后导入。"));
    if (view.getUint32(localOffset, true) !== 0x04034b50)
      throw new Error(INVALID_MESSAGE);
    const start =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    entries.set(name, {
      method,
      size,
      data: bytes.subarray(start, start + compressedSize),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(entry) {
  if (entry.method === 0) return entry.data;
  if (entry.method !== 8) throw new Error(INVALID_MESSAGE);
  const stream = new Blob([entry.data])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipText(entries, name) {
  const entry = entries.get(name);
  if (!entry) return null;
  return new TextDecoder().decode(await inflate(entry));
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g))
    result[match[1].toLowerCase()] = match[3] ?? match[4];
  return result;
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", middot: "·", copy: "©", shy: "" };
export function decodeEntities(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === "#") {
      const value = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

const BLOCK =
  "p|div|li|blockquote|section|article|header|footer|aside|tr|pre|dd|dt|figcaption|caption|table|ul|ol|dl|hr|nav|main|figure";
// Private-use markers survive tag stripping and never occur in book text we keep.
const HEADING_MARK = /^([1-6])/;
const cleanLines = (block) =>
  block
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

// Returns chapter blocks in reading order; heading blocks keep their level.
export function xhtmlToBlocks(xhtml) {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(xhtml)?.[1] ?? xhtml;
  return decodeEntities(
    body
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|rt|rp)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/[]/g, "")
      .replace(/<br\b[^>]*>/gi, "\n")
      .replace(/<h([1-6])\b[^>]*>/gi, "\n\n$1")
      .replace(/<\/h[1-6]\s*>/gi, "\n\n")
      .replace(new RegExp("</?(?:" + BLOCK + ")\\b[^>]*>", "gi"), "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split(/\n\s*\n+/)
    .map((block) => {
      const mark = HEADING_MARK.exec(block.trimStart());
      const text = cleanLines(mark ? block.trimStart().slice(mark[0].length) : block);
      // A heading's own line breaks are presentation; keep it as one line.
      return mark
        ? { text: text.replace(/\n/g, " "), heading: Number(mark[1]) }
        : { text, heading: null };
    })
    .filter((block) => block.text);
}

export function xhtmlToText(xhtml) {
  return xhtmlToBlocks(xhtml)
    .map((block) => block.text)
    .join("\n\n");
}

function resolvePath(base, href) {
  const parts = (base ? base.split("/") : []).concat(
    decodeURIComponent(href.split("#")[0]).split("/"),
  );
  const out = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function isEncrypted(encryptionXml) {
  if (!encryptionXml) return false;
  const methods = [...encryptionXml.matchAll(/<(?:\w+:)?EncryptionMethod\b[^>]*>/g)].map(
    (m) => attributes(m[0]).algorithm,
  );
  return methods.some((algorithm) => !FONT_OBFUSCATION.includes(algorithm));
}

const plain = (html) =>
  decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Table-of-contents labels by chapter file, from the EPUB 3 nav or the EPUB 2 NCX.
async function tocLabels(entries, opf, manifest, base) {
  const labels = new Map();
  const add = (fromPath, href, label) => {
    const path = resolvePath(fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "", href);
    if (label && !labels.has(path)) labels.set(path, label.slice(0, 120));
  };
  const items = [...manifest.values()];
  const nav = items.find((item) => /\bnav\b/.test(item.properties || ""));
  if (nav) {
    const navPath = resolvePath(base, nav.href);
    const xhtml = (await readZipText(entries, navPath)) || "";
    const toc =
      /<nav\b[^>]*epub:type\s*=\s*["'][^"']*\btoc\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i.exec(xhtml)?.[1] ??
      /<nav\b[^>]*>([\s\S]*?)<\/nav>/i.exec(xhtml)?.[1] ??
      "";
    for (const match of toc.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = attributes(match[1]).href;
      if (href) add(navPath, href, plain(match[2]));
    }
  }
  const spineToc = attributes(/<(?:\w+:)?spine\b[^>]*>/i.exec(opf)?.[0] || "").toc;
  const ncx =
    manifest.get(spineToc) ||
    items.find((item) => /application\/x-dtbncx\+xml/i.test(item["media-type"] || ""));
  if (ncx) {
    const ncxPath = resolvePath(base, ncx.href);
    const xml = (await readZipText(entries, ncxPath)) || "";
    for (const match of xml.matchAll(/<navPoint\b[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\b([^>]*)>/gi)) {
      const src = attributes(match[2]).src;
      if (src) add(ncxPath, src, plain(match[1]));
    }
  }
  return labels;
}

export async function extractEpubBytes(bytes, fileName = "book.epub") {
  const entries = readZipEntries(bytes);
  if (entries.has("META-INF/rights.xml") || isEncrypted(await readZipText(entries, "META-INF/encryption.xml")))
    throw new Error(EPUB_ENCRYPTED_MESSAGE);
  const container = await readZipText(entries, "META-INF/container.xml");
  const rootTag = container && /<rootfile\b[^>]*>/i.exec(container)?.[0];
  const opfPath = rootTag && attributes(rootTag)["full-path"];
  const opf = opfPath && (await readZipText(entries, opfPath));
  if (!opf) throw new Error(INVALID_MESSAGE);
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";
  const manifest = new Map();
  for (const match of opf.matchAll(/<(?:\w+:)?item\b[^>]*>/gi)) {
    const item = attributes(match[0]);
    if (item.id && item.href) manifest.set(item.id, item);
  }
  const labels = await tocLabels(entries, opf, manifest, base);
  const blocks = [],
    chapters = [];
  for (const match of opf.matchAll(/<(?:\w+:)?itemref\b[^>]*>/gi)) {
    const item = manifest.get(attributes(match[0]).idref);
    if (!item || /\bnav\b/.test(item.properties || "")) continue;
    if (!/x?html/i.test(item["media-type"] || "")) continue;
    const path = resolvePath(base, item.href);
    const xhtml = await readZipText(entries, path);
    const chapterBlocks = xhtml ? xhtmlToBlocks(xhtml) : [];
    if (!chapterBlocks.length) continue;
    const start = blocks.length;
    blocks.push(...chapterBlocks.map((block) => ({ ...block, chapter: chapters.length })));
    chapters.push({
      title:
        labels.get(path) ||
        chapterBlocks.find((block) => block.heading)?.text.slice(0, 120) ||
        chapterBlocks[0].text.replace(/\s+/g, " ").slice(0, 40),
      start,
      end: blocks.length - 1,
    });
  }
  const rawContent = blocks.map((block) => block.text).join("\n\n");
  if (rawContent.replace(/\s/g, "").length < 20) throw new Error(EPUB_NO_TEXT_MESSAGE);
  const paragraphs = buildParagraphs(rawContent);
  // One block becomes exactly one paragraph; annotate only when that still holds.
  const structured = paragraphs.length === blocks.length;
  if (structured)
    paragraphs.forEach((paragraph, index) => {
      if (blocks[index].heading) paragraph.heading = blocks[index].heading;
      paragraph.chapter = blocks[index].chapter;
    });
  const titleMatch = /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opf);
  const title =
    (titleMatch && decodeEntities(titleMatch[1].replace(/<[^>]+>/g, "")).trim()) ||
    fileName.replace(/\.epub$/i, "");
  return {
    title,
    rawContent,
    paragraphs,
    chapters: structured ? chapters : [],
    chapterCount: chapters.length,
  };
}

export async function extractEpubFile(file) {
  if (file.size > MAX_FILE_SIZE) throw new Error(tr("EPUB 文件不能超过 50 MB"));
  const { title, rawContent, paragraphs, chapters, chapterCount } =
    await extractEpubBytes(new Uint8Array(await file.arrayBuffer()), file.name);
  return {
    title,
    sourceType: "epub",
    rawContent,
    paragraphs,
    metadata: {
      originalFileName: file.name,
      mimeType: file.type || "application/epub+zip",
      fileSize: file.size,
      chapterCount,
      chapters,
      originalFormat: "epub",
    },
  };
}
