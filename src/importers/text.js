import { t as tr, th } from "../workspace/i18n.js";
import { buildParagraphs } from '../domain/documents.js';

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown']);

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

export async function extractTextFile(file) {
  const extension = fileExtension(file.name);
  if (!['txt', ...MARKDOWN_EXTENSIONS].includes(extension)) throw new Error(tr('仅支持 PDF、TXT 和 Markdown 文件'));
  const original = await file.text();
  const rawContent = MARKDOWN_EXTENSIONS.has(extension) ? stripMarkdown(original) : original.trim();
  if (!rawContent) throw new Error(tr('文件中没有可导入的正文'));
  return {
    title: file.name.replace(/\.[^.]+$/, ''),
    sourceType: MARKDOWN_EXTENSIONS.has(extension) ? 'markdown' : 'text',
    rawContent,
    paragraphs: buildParagraphs(rawContent),
    metadata: { originalFileName: file.name, mimeType: file.type || 'text/plain', fileSize: file.size, originalFormat: extension }
  };
}
