import { buildParagraphs } from '../domain/documents.js';

export const PDF_NO_TEXT_MESSAGE = '当前 PDF 未检测到可提取文本，请使用文本版 PDF 或粘贴正文。';
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function groupPageText(items = []) {
  const lines = [];
  let current = [];
  let previousY = null;
  for (const item of items) {
    const value = String(item.str || '').trim();
    if (!value) continue;
    const y = Math.round(item.transform?.[5] || 0);
    if (previousY !== null && Math.abs(previousY - y) > 5) {
      const gap = Math.abs(previousY - y);
      if (current.length) lines.push(current.join(' '));
      if (gap > 18 && lines.at(-1) !== '') lines.push('');
      current = [];
    }
    current.push(value);
    previousY = y;
    if (item.hasEOL) { lines.push(current.join(' ')); current = []; }
  }
  if (current.length) lines.push(current.join(' '));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractPdfFile(file) {
  if (file.size > MAX_FILE_SIZE) throw new Error('PDF 文件不能超过 20 MB');
  const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = groupPageText(content.items);
    if (text) pages.push(text);
  }
  const rawContent = pages.join('\n\n').trim();
  await pdf.destroy();
  if (rawContent.replace(/\s/g, '').length < 20) throw new Error(PDF_NO_TEXT_MESSAGE);
  return {
    title: file.name.replace(/\.pdf$/i, ''),
    sourceType: 'pdf',
    rawContent,
    paragraphs: buildParagraphs(rawContent),
    metadata: { originalFileName: file.name, mimeType: file.type || 'application/pdf', fileSize: file.size, pageCount }
  };
}
