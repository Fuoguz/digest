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

async function readText(entries, name) {
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
  "p|div|h[1-6]|li|blockquote|section|article|header|footer|aside|tr|pre|dd|dt|figcaption|caption|table|ul|ol|dl|hr|nav|main|figure";
export function xhtmlToText(xhtml) {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(xhtml)?.[1] ?? xhtml;
  return decodeEntities(
    body
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(script|style|rt|rp)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\b[^>]*>/gi, "\n")
      .replace(new RegExp("</?(?:" + BLOCK + ")\\b[^>]*>", "gi"), "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split(/\n\s*\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean)
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

export async function extractEpubBytes(bytes, fileName = "book.epub") {
  const entries = readZipEntries(bytes);
  if (entries.has("META-INF/rights.xml") || isEncrypted(await readText(entries, "META-INF/encryption.xml")))
    throw new Error(EPUB_ENCRYPTED_MESSAGE);
  const container = await readText(entries, "META-INF/container.xml");
  const rootTag = container && /<rootfile\b[^>]*>/i.exec(container)?.[0];
  const opfPath = rootTag && attributes(rootTag)["full-path"];
  const opf = opfPath && (await readText(entries, opfPath));
  if (!opf) throw new Error(INVALID_MESSAGE);
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";
  const manifest = new Map();
  for (const match of opf.matchAll(/<(?:\w+:)?item\b[^>]*>/gi)) {
    const item = attributes(match[0]);
    if (item.id && item.href) manifest.set(item.id, item);
  }
  const chapters = [];
  for (const match of opf.matchAll(/<(?:\w+:)?itemref\b[^>]*>/gi)) {
    const item = manifest.get(attributes(match[0]).idref);
    if (!item || /\bnav\b/.test(item.properties || "")) continue;
    if (!/x?html/i.test(item["media-type"] || "")) continue;
    const xhtml = await readText(entries, resolvePath(base, item.href));
    const text = xhtml ? xhtmlToText(xhtml) : "";
    if (text) chapters.push(text);
  }
  const rawContent = chapters.join("\n\n").trim();
  if (rawContent.replace(/\s/g, "").length < 20) throw new Error(EPUB_NO_TEXT_MESSAGE);
  const titleMatch = /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opf);
  const title =
    (titleMatch && decodeEntities(titleMatch[1].replace(/<[^>]+>/g, "")).trim()) ||
    fileName.replace(/\.epub$/i, "");
  return { title, rawContent, chapterCount: chapters.length };
}

export async function extractEpubFile(file) {
  if (file.size > MAX_FILE_SIZE) throw new Error(tr("EPUB 文件不能超过 50 MB"));
  const { title, rawContent, chapterCount } = await extractEpubBytes(
    new Uint8Array(await file.arrayBuffer()),
    file.name,
  );
  return {
    title,
    sourceType: "epub",
    rawContent,
    paragraphs: buildParagraphs(rawContent),
    metadata: {
      originalFileName: file.name,
      mimeType: file.type || "application/epub+zip",
      fileSize: file.size,
      chapterCount,
      originalFormat: "epub",
    },
  };
}
