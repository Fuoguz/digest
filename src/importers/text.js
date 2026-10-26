import { t as tr, th } from "../workspace/i18n.js";
import { buildParagraphs, chaptersFromHeadings } from '../domain/documents.js';

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown']);
const HEADING = /^\s{0,3}(#{1,6})\s+\S/;

export function fileExtension(name = '') {
  return String(name).split('.').pop()?.toLowerCase() || '';
}

export function stripMarkdown(markdown) {
  return String(markdown || '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(`{1,3}|\*\*|__|~~)/g, '')
    .trim();
}

// Markdown blocks with their heading level; a heading line always becomes its own block.
export function markdownBlocks(markdown) {
  const blocks = [];
  for (const block of String(markdown || '').replace(/\r\n?/g, '\n').split(/\n\s*\n+/)) {
    const lines = block.split('\n');
    const first = lines.findIndex((line) => line.trim());
    if (first < 0) continue;
    const match = HEADING.exec(lines[first]);
    const parts = match
      ? [{ source: lines[first], heading: match[1].length }, { source: lines.slice(first + 1).join('\n'), heading: null }]
      : [{ source: block, heading: null }];
    for (const part of parts) {
      const text = stripMarkdown(part.source);
      if (text) blocks.push({ text: part.heading ? text.replace(/\s+/g, ' ') : text, heading: part.heading });
    }
  }
  return blocks;
}

export async function extractTextFile(file) {
  const extension = fileExtension(file.name);
  if (!['txt', ...MARKDOWN_EXTENSIONS].includes(extension)) throw new Error(tr('仅支持 PDF、EPUB、TXT 和 Markdown 文件'));
  const original = await file.text();
  const markdown = MARKDOWN_EXTENSIONS.has(extension);
  const blocks = markdown ? markdownBlocks(original) : null;
  const rawContent = markdown ? blocks.map((block) => block.text).join('\n\n') : original.trim();
  if (!rawContent) throw new Error(tr('文件中没有可导入的正文'));
  const paragraphs = buildParagraphs(rawContent);
  let chapters = [];
  if (markdown && paragraphs.length === blocks.length) {
    paragraphs.forEach((paragraph, index) => {
      if (blocks[index].heading) paragraph.heading = blocks[index].heading;
    });
    chapters = chaptersFromHeadings(paragraphs);
  }
  return {
    title: file.name.replace(/\.[^.]+$/, ''),
    sourceType: markdown ? 'markdown' : 'text',
    rawContent,
    paragraphs,
    metadata: {
      originalFileName: file.name,
      mimeType: file.type || 'text/plain',
      fileSize: file.size,
      originalFormat: extension,
      ...(chapters.length ? { chapters } : {}),
    },
  };
}
