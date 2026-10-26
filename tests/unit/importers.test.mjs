import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTextFile, stripMarkdown } from '../../src/importers/text.js';
import { groupPageText, PDF_NO_TEXT_MESSAGE } from '../../src/importers/pdf.js';
import { extractEpubFile, extractEpubBytes, decodeEntities, xhtmlToText, EPUB_ENCRYPTED_MESSAGE, EPUB_NO_TEXT_MESSAGE } from '../../src/importers/epub.js';
import { buildZip, sampleEpubFiles } from '../fixtures/epub-fixture.mjs';

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

test('EPUB import follows spine order, skips navigation and keeps paragraphs', async () => {
  const bytes = await buildZip(sampleEpubFiles());
  const file = new File([bytes], 'course.epub', { type: 'application/epub+zip' });
  const result = await extractEpubFile(file);
  assert.equal(result.sourceType, 'epub');
  assert.equal(result.title, '传播学导论 & 案例');
  assert.equal(result.metadata.chapterCount, 2);
  assert.equal(result.metadata.originalFileName, 'course.epub');
  const text = result.rawContent;
  assert.ok(text.indexOf('第一章 议程设置') < text.indexOf('第二章 框架'));
  assert.match(text, /媒体影响公众认为哪些议题重要，但不直接决定态度。/);
  assert.match(text, /报道数量 不能证明支持。框架另行讨论。/);
  assert.doesNotMatch(text, /不应出现的目录|alert|kuàngjià|color:red/);
  assert.deepEqual(result.paragraphs.map((p) => p.text), [
    '第一章 议程设置',
    '媒体影响公众认为哪些议题重要，但不直接决定态度。',
    '报道数量 不能证明支持。框架另行讨论。',
    '第二章 框架',
    '框架影响解释角度。 同一议题可有不同框架。',
  ]);
});

test('EPUB import refuses DRM-encrypted and damaged files', async () => {
  const encrypted = await buildZip(sampleEpubFiles({ encrypted: true }));
  await assert.rejects(() => extractEpubBytes(encrypted, 'locked.epub'), (e) => e.message === EPUB_ENCRYPTED_MESSAGE);
  await assert.rejects(() => extractEpubBytes(new TextEncoder().encode('not a zip'), 'bad.epub'), /无法读取这个 EPUB/);
  const noText = sampleEpubFiles().map((f) => (f.name.includes('/text/') ? { ...f, content: '<html><body><img src="a.jpg"/></body></html>' } : f));
  const imagesOnly = await buildZip(noText);
  await assert.rejects(() => extractEpubBytes(imagesOnly, 'images.epub'), (e) => e.message === EPUB_NO_TEXT_MESSAGE);
});

test('XHTML conversion decodes entities without inventing text', () => {
  assert.equal(decodeEntities('A&amp;B &#x4e2d;&#25991; &unknown;'), 'A&B 中文 &unknown;');
  assert.equal(xhtmlToText('<body><p> </p></body>'), '');
});
