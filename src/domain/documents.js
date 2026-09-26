import { t as tr, th } from "../workspace/i18n.js";
export const READING_MODES = Object.freeze({
  general: tr("General"),
  academic_paper: tr("Academic Paper"),
  legal_case: tr("Legal Case"),
  policy_document: tr("Policy Document"),
});

export const SOURCE_TYPES = Object.freeze({
  text: "Text",
  markdown: "Markdown",
  pdf: "PDF",
  legacy: "Legacy",
});

export function makeId(prefix = "doc") {
  const value =
    globalThis.crypto?.randomUUID?.() ||
    String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  return prefix + "-" + value;
}

export function normalizeTags(tags) {
  const source = Array.isArray(tags) ? tags : String(tags || "").split(/[,，]/);
  return [
    ...new Set(source.map((tag) => String(tag).trim()).filter(Boolean)),
  ].slice(0, 12);
}

export function buildParagraphs(content) {
  const normalized = String(content || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n\s*\n+/);
  let cursor = 0;
  return blocks
    .map((block, index) => {
      const text = block.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
      const startOffset = normalized.indexOf(block, cursor);
      const endOffset = startOffset + block.length;
      cursor = endOffset;
      return {
        id: "p-" + (index + 1),
        paragraphIndex: index,
        text,
        startOffset,
        endOffset,
      };
    })
    .filter((paragraph) => paragraph.text);
}

export function createDocument(input = {}) {
  const now = new Date().toISOString();
  const rawContent = String(input.rawContent || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!rawContent && input.status !== "legacy_incomplete")
    throw new Error(tr("资料正文不能为空"));
  const readingMode = Object.hasOwn(READING_MODES, input.readingMode)
    ? input.readingMode
    : "general";
  const sourceType = Object.hasOwn(SOURCE_TYPES, input.sourceType)
    ? input.sourceType
    : "text";
  return {
    id: input.id || makeId(),
    title: String(input.title || tr("未命名资料"))
      .trim()
      .slice(0, 180),
    sourceType,
    sourceUrl: input.sourceUrl || null,
    rawContent,
    paragraphs:
      Array.isArray(input.paragraphs) && input.paragraphs.length
        ? input.paragraphs
        : buildParagraphs(rawContent),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    tags: normalizeTags(input.tags),
    readingMode,
    digestResultId: input.digestResultId || null,
    evidenceAnchorIds: Array.isArray(input.evidenceAnchorIds)
      ? input.evidenceAnchorIds
      : [],
    reviewState: input.reviewState || {
      dueCount: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
    },
    relationIds: Array.isArray(input.relationIds) ? input.relationIds : [],
    favorite: Boolean(input.favorite),
    status: input.status || "ready",
    metadata: {
      originalFileName: input.metadata?.originalFileName || null,
      mimeType: input.metadata?.mimeType || null,
      fileSize: Number(input.metadata?.fileSize) || null,
      pageCount: Number(input.metadata?.pageCount) || null,
      importedAt: input.metadata?.importedAt || now,
      legacyInsight: input.metadata?.legacyInsight || null,
      ...input.metadata,
    },
  };
}

export function matchesDocument(document, filters = {}) {
  const query = String(filters.query || "")
    .trim()
    .toLocaleLowerCase("zh-CN");
  const haystack = [
    document.title,
    document.rawContent,
    ...(document.tags || []),
  ]
    .join(" ")
    .toLocaleLowerCase("zh-CN");
  return (
    (!query || haystack.includes(query)) &&
    (!filters.sourceType ||
      filters.sourceType === "all" ||
      document.sourceType === filters.sourceType) &&
    (!filters.readingMode ||
      filters.readingMode === "all" ||
      document.readingMode === filters.readingMode) &&
    (!filters.tag ||
      filters.tag === "all" ||
      document.tags.includes(filters.tag)) &&
    (!filters.favorite || document.favorite)
  );
}
