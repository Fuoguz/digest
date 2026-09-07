import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTextFile, stripMarkdown } from '../../src/importers/text.js';
import { groupPageText, PDF_NO_TEXT_MESSAGE } from '../../src/importers/pdf.js';

test('Markdown import keeps readable content and source metadata', async () => {
  const file = new File(['# 研究问题\n\n**结论**：[间隔学习](https://example.com)有效。'], 'paper.md', { type: 'text/markdown' });
  const result = await extractTextFile(file);
  assert.equal(result.sourceType, 'markdown');
  assert.equal(result.title, 'paper');
  assert.match(result.rawContent, /研究问题/);
  assert.doesNotMatch(result.rawContent, /https:\/\//);
  assert.equal(result.metadata.originalFileName, 'paper.md');
});

test('plain text import rejects empty files', async () => {
  const file = new File(['  '], 'empty.txt', { type: 'text/plain' });
  await assert.rejects(() => extractTextFile(file), /没有可导入的正文/);
});

test('PDF text items are grouped by visual lines', () => {
  const text = groupPageText([
    { str: '第一行', transform: [1, 0, 0, 1, 10, 100] },
    { str: '续句', transform: [1, 0, 0, 1, 80, 100], hasEOL: true },
    { str: '第二行', transform: [1, 0, 0, 1, 10, 80] }
  ]);
  assert.equal(text, '第一行 续句\n\n第二行');
  assert.equal(PDF_NO_TEXT_MESSAGE, '当前 PDF 未检测到可提取文本，请使用文本版 PDF 或粘贴正文。');
});

test('stripMarkdown does not invent missing content', () => {
  assert.equal(stripMarkdown(''), '');
});
