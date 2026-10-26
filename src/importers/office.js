import { t as tr } from "../workspace/i18n.js";
import { buildParagraphs, chaptersFromHeadings } from "../domain/documents.js";
import { readZipEntries, readZipText, decodeEntities } from "./epub.js";

// Word (.docx) and PowerPoint (.pptx) are ZIPs of XML. Text is extracted locally;
// images, layout, comments and speaker notes are not kept.
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const NO_TEXT = tr("文件中没有可导入的正文。");
export const LEGACY_OFFICE_MESSAGE = tr(
  "暂不支持旧版 .doc / .ppt 格式。请在 Word 或 PowerPoint 中另存为 .docx / .pptx 后再导入。",
);

function attr(tag, name) {
  const match = new RegExp("\\b" + name + '\\s*=\\s*"([^"]*)"').exec(tag);
  return match ? decodeEntities(match[1]) : null;
}
const clean = (text) =>
  text
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

// Builds paragraphs from blocks so that block i is paragraph i, then keeps heading levels.
function structured(blocks) {
  const rawContent = blocks.map((b) => b.text).join("\n\n");
  const paragraphs = buildParagraphs(rawContent);
  if (paragraphs.length !== blocks.length) return { rawContent, paragraphs, aligned: false };
  paragraphs.forEach((p, i) => {
    if (blocks[i].heading) p.heading = blocks[i].heading;
  });
  return { rawContent, paragraphs, aligned: true };
}

async function openZip(file) {
  if (file.size > MAX_FILE_SIZE) throw new Error(tr("文件不能超过 50 MB"));
  return readZipEntries(new Uint8Array(await file.arrayBuffer()));
}

async function documentTitle(entries) {
  const core = (await readZipText(entries, "docProps/core.xml")) || "";
  const match = /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(core);
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, "")).trim() : "";
}

// ---------- Word ----------
function wordRunsText(xml) {
  let text = "";
  for (const match of xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\b[^>]*\/>/g)) {
    if (match[1] !== undefined) text += decodeEntities(match[1]);
    else text += match[0].startsWith("<w:tab") ? " " : "\n";
  }
  return text;
}

export async function extractDocxBytes(entries, fileName = "document.docx") {
  const xml = await readZipText(entries, "word/document.xml");
  if (!xml) throw new Error(tr("无法读取这个 Word 文件，文件可能已损坏。"));
  // Style id → heading level, from style names ("heading 1", "Title") or outline levels.
  const styles = (await readZipText(entries, "word/styles.xml")) || "";
  const levels = new Map();
  for (const match of styles.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const id = attr(match[1], "w:styleId");
    const name = (attr(/<w:name\b[^>]*\/>/.exec(match[2])?.[0] || "", "w:val") || "").toLowerCase();
    const outline = attr(/<w:outlineLvl\b[^>]*\/>/.exec(match[2])?.[0] || "", "w:val");
    const level = name === "title"
      ? 1
      : /^heading\s*([1-6])$/.exec(name)?.[1] ?? (outline !== null && Number(outline) < 6 ? Number(outline) + 1 : null);
    if (id && level) levels.set(id, Number(level));
  }
  const body = xml
    .replace(/<w:del\b[\s\S]*?<\/w:del>/g, "")
    .replace(/<w:instrText\b[\s\S]*?<\/w:instrText>/g, "");
  const blocks = [];
  for (const match of body.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const inner = match[1] || "";
    const text = clean(wordRunsText(inner));
    if (!text) continue;
    const props = /<w:pPr\b[\s\S]*?<\/w:pPr>/.exec(inner)?.[0] || "";
    const style = attr(/<w:pStyle\b[^>]*\/>/.exec(props)?.[0] || "", "w:val");
    const outline = attr(/<w:outlineLvl\b[^>]*\/>/.exec(props)?.[0] || "", "w:val");
    const heading =
      (style && levels.get(style)) ||
      (outline !== null && Number(outline) < 6 ? Number(outline) + 1 : null);
    // A "heading" longer than a short paragraph is almost always mis-styled body text.
    blocks.push({ text: heading && text.length <= 160 ? text.replace(/\n/g, " ") : text, heading: heading && text.length <= 160 ? heading : null });
  }
  if (blocks.map((b) => b.text).join("").replace(/\s/g, "").length < 2) throw new Error(NO_TEXT);
  const { rawContent, paragraphs, aligned } = structured(blocks);
  const chapters = aligned ? chaptersFromHeadings(paragraphs) : [];
  return {
    title: (await documentTitle(entries)) || fileName.replace(/\.docx$/i, ""),
    rawContent,
    paragraphs,
    chapters,
  };
}

// ---------- PowerPoint ----------
function slideParagraphs(xml) {
  const out = [];
  for (const match of xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    let text = "";
    for (const run of match[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g))
      text += run[1] !== undefined ? decodeEntities(run[1]) : "\n";
    text = clean(text);
    if (text) out.push(text);
  }
  return out;
}

export async function extractPptxBytes(entries, fileName = "slides.pptx") {
  const presentation = await readZipText(entries, "ppt/presentation.xml");
  const rels = await readZipText(entries, "ppt/_rels/presentation.xml.rels");
  if (!presentation || !rels) throw new Error(tr("无法读取这个 PPT 文件，文件可能已损坏。"));
  const targets = new Map();
  for (const match of rels.matchAll(/<Relationship\b[^>]*\/?>/g))
    targets.set(attr(match[0], "Id"), attr(match[0], "Target"));
  const slideIds = [...presentation.matchAll(/<p:sldId\b[^>]*\/?>/g)].map((m) => ({
    id: attr(m[0], "id"),
    rid: attr(m[0], "r:id"),
  }));
  // PowerPoint sections (if the author used them) become chapters.
  const sectionOf = new Map();
  const sections = [];
  for (const match of presentation.matchAll(/<p14:section\b([^>]*)>([\s\S]*?)<\/p14:section>/g)) {
    const index = sections.length;
    sections.push(attr(match[1], "name") || "");
    for (const id of match[2].matchAll(/<p14:sldId\b[^>]*\/?>/g)) sectionOf.set(attr(id[0], "id"), index);
  }
  const blocks = [];
  const slideStarts = [];
  let slideCount = 0;
  for (const [n, slide] of slideIds.entries()) {
    const target = targets.get(slide.rid);
    if (!target) continue;
    const path = "ppt/" + target.replace(/^\/?ppt\//, "").replace(/^\.\//, "");
    const xml = await readZipText(entries, path);
    if (!xml) continue;
    slideCount++;
    let title = "";
    let rest = xml;
    for (const shape of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g))
      if (/<p:ph\b[^>]*type="(?:title|ctrTitle)"/.test(shape[0])) {
        title = slideParagraphs(shape[0]).join(" ");
        rest = rest.replace(shape[0], "");
        break;
      }
    const body = slideParagraphs(rest);
    if (!title && !body.length) continue;
    slideStarts.push({ start: blocks.length, slide: n + 1, title, section: sectionOf.get(slide.id) });
    if (title) blocks.push({ text: title.replace(/\n/g, " "), heading: 2 });
    for (const text of body) blocks.push({ text, heading: null });
  }
  if (!blocks.length) throw new Error(NO_TEXT);
  const { rawContent, paragraphs, aligned } = structured(blocks);
  let chapters = [];
  if (aligned && sections.length > 1) {
    for (const s of slideStarts) {
      const last = chapters.at(-1);
      if (last && last.section === s.section) continue;
      chapters.push({ section: s.section, title: sections[s.section] || "", start: s.start });
    }
    chapters = chapters.map((c, i) => ({
      title: c.title || tr("未命名分节"),
      start: i === 0 ? 0 : c.start,
      end: i + 1 < chapters.length ? chapters[i + 1].start - 1 : paragraphs.length - 1,
    }));
    if (chapters.length < 2) chapters = [];
    chapters.forEach((c, i) => {
      for (let p = c.start; p <= c.end; p++) paragraphs[p].chapter = i;
    });
  }
  return {
    title: (await documentTitle(entries)) || fileName.replace(/\.pptx$/i, ""),
    rawContent,
    paragraphs,
    chapters,
    slideCount,
  };
}

export async function extractOfficeFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "doc" || extension === "ppt") throw new Error(LEGACY_OFFICE_MESSAGE);
  const entries = await openZip(file);
  const word = extension === "docx";
  const result = word
    ? await extractDocxBytes(entries, file.name)
    : await extractPptxBytes(entries, file.name);
  return {
    title: result.title,
    sourceType: word ? "docx" : "pptx",
    rawContent: result.rawContent,
    paragraphs: result.paragraphs,
    metadata: {
      originalFileName: file.name,
      mimeType: file.type || (word
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
      fileSize: file.size,
      originalFormat: extension,
      ...(result.chapters.length ? { chapters: result.chapters } : {}),
      ...(result.slideCount ? { slideCount: result.slideCount } : {}),
    },
  };
}
