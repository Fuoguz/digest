import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTextFile, stripMarkdown } from '../../src/importers/text.js';
import { groupPageText, PDF_NO_TEXT_MESSAGE } from '../../src/importers/pdf.js';
import { extractEpubFile, extractEpubBytes, decodeEntities, xhtmlToText, EPUB_ENCRYPTED_MESSAGE, EPUB_NO_TEXT_MESSAGE } from '../../src/importers/epub.js';
import { buildZip, sampleEpubFiles } from '../fixtures/epub-fixture.mjs';
import { createDocument, documentChapters } from '../../src/domain/documents.js';
import { extractOfficeFile, LEGACY_OFFICE_MESSAGE } from '../../src/importers/office.js';
import { docxFiles, pptxFiles } from '../fixtures/office-fixture.mjs';
import { documentSnapshot } from '../../src/domain/evidence.js';

test('Markdown import keeps readable content and source metadata', async () => {
  const file = new File(['# 研究问题\n\n**结论**：[间隔学习](https://example.com)有效。'], 'paper.md', { type: 'text/markdown' });
  const result = await extractTextFile(file);
  assert.equal(result.sourceType, 'markdown');
  assert.equal(result.title, 'paper');
  assert.match(result.rawContent, /研究问题/);
  assert.doesNotMatch(result.rawContent, /https:\/\//);
  assert.equal(result.metadata.originalFileName, 'paper.md');
});

test('Markdown headings become heading paragraphs and top-level chapters', async () => {
  const source = '导读文字。\n\n# 第一章 议程设置\n媒体影响议题重要性。\n\n## 1.1 概念\n\n解释内容。\n\n# 第二章 框架\n\n框架影响解释。';
  const result = await extractTextFile(new File([source], 'notes.md'));
  assert.deepEqual(result.paragraphs.map((p) => [p.text, p.heading ?? null, p.chapter]), [
    ['导读文字。', null, 0],
    ['第一章 议程设置', 1, 0],
    ['媒体影响议题重要性。', null, 0],
    ['1.1 概念', 2, 0],
    ['解释内容。', null, 0],
    ['第二章 框架', 1, 1],
    ['框架影响解释。', null, 1],
  ]);
  assert.deepEqual(result.metadata.chapters, [
    { title: '第一章 议程设置', start: 0, end: 4 },
    { title: '第二章 框架', start: 5, end: 6 },
  ]);
  const doc = createDocument(result);
  const snapshot = await documentSnapshot(doc);
  assert.deepEqual(snapshot.paragraphs.map((p) => p.heading ?? null), [null, 1, null, 2, null, 1, null]);
  assert.equal(documentChapters(doc, snapshot.paragraphs.length).length, 2);
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
  assert.doesNotMatch(text, /目录：|alert|kuàngjià|color:red/);
  assert.deepEqual(result.paragraphs.map((p) => [p.heading ?? null, p.chapter]), [
    [1, 0], [null, 0], [null, 0], [2, 1], [null, 1],
  ]);
  assert.deepEqual(result.metadata.chapters, [
    { title: '目录：议程设置', start: 0, end: 2 },
    { title: '目录：框架理论', start: 3, end: 4 },
  ]);
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

test('EPUB structure survives into the document snapshot and is dropped once it no longer fits', async () => {
  const result = await extractEpubFile(new File([await buildZip(sampleEpubFiles())], 'course.epub'));
  const doc = createDocument(result);
  const snapshot = await documentSnapshot(doc);
  assert.deepEqual(snapshot.paragraphs.map((p) => p.heading ?? null), [1, null, null, 2, null]);
  assert.deepEqual(documentChapters(doc, snapshot.paragraphs.length).map((c) => [c.start, c.end]), [[0, 2], [3, 4]]);
  const edited = createDocument({ ...result, rawContent: '另写的一段。\n\n' + result.rawContent, paragraphs: undefined, metadata: { ...result.metadata, chapters: undefined } });
  const editedSnapshot = await documentSnapshot(edited);
  assert.ok(editedSnapshot.paragraphs.every((p) => p.heading === undefined && p.chapter === undefined));
  assert.deepEqual(documentChapters(edited, editedSnapshot.paragraphs.length), []);
  assert.deepEqual(documentChapters({ metadata: { chapters: [{ title: 'x', start: 0, end: 1 }] } }, 5), []);
});

test('Word import keeps heading styles, skips tracked deletions and builds chapters', async () => {
  const files = docxFiles();
  const doc = files.find((f) => f.name === 'word/document.xml');
  doc.content = doc.content.replace('<w:p><w:r><w:t>被删除的旧句子</w:t></w:r></w:p>', '');
  const result = await extractOfficeFile(new File([await buildZip(files)], 'lecture.docx'));
  assert.equal(result.sourceType, 'docx');
  assert.equal(result.title, '心理学导论讲义');
  assert.deepEqual(result.paragraphs.map((p) => [p.text, p.heading ?? null, p.chapter]), [
    ['第一章 认知失调', 1, 0],
    ['当行为与态度不一致时，人会感到不适，并倾向于调整态度。', null, 0],
    ['经典实验 报酬越少，态度改变越大。', null, 0],
    ['1.1 实验设计', 2, 0],
    ['组别', null, 0],
    ['报酬', null, 0],
    ['第二章 社会认同', 1, 1],
    ['人们通过所属群体界定自我。', null, 1],
  ]);
  assert.doesNotMatch(result.rawContent, /修订中删掉的内容/);
  assert.deepEqual(result.metadata.chapters.map((c) => [c.title, c.start, c.end]), [['第一章 认知失调', 0, 5], ['第二章 社会认同', 6, 7]]);
  const snapshot = await documentSnapshot(createDocument(result));
  assert.equal(snapshot.paragraphs[3].heading, 2);
});

test('PPT import follows slide order, marks titles and uses sections as chapters', async () => {
  const result = await extractOfficeFile(new File([await buildZip(pptxFiles())], 'philosophy.pptx'));
  assert.equal(result.sourceType, 'pptx');
  assert.equal(result.title, 'philosophy');
  assert.equal(result.metadata.slideCount, 3);
  assert.deepEqual(result.paragraphs.map((p) => [p.text, p.heading ?? null]), [
    ['什么是现象学', 2],
    ['回到事情本身', null],
    ['悬置自然态度', null],
    ['意向性：意识总是关于某物的意识', null],
    ['存在先于本质', 2],
    ['人首先存在，然后通过选择界定自己', null],
  ]);
  assert.deepEqual(result.metadata.chapters, [
    { title: '现象学基础', start: 0, end: 3 },
    { title: '存在主义', start: 4, end: 5 },
  ]);
  const plain = await extractOfficeFile(new File([await buildZip(pptxFiles({ sections: false }))], 'plain.pptx'));
  assert.equal(plain.metadata.chapters, undefined);
});

test('legacy .doc/.ppt and damaged Office files fail with clear messages', async () => {
  await assert.rejects(() => extractOfficeFile(new File(['x'], 'old.doc')), (e) => e.message === LEGACY_OFFICE_MESSAGE);
  await assert.rejects(() => extractOfficeFile(new File(['x'], 'old.ppt')), (e) => e.message === LEGACY_OFFICE_MESSAGE);
  await assert.rejects(() => extractOfficeFile(new File([new TextEncoder().encode('not a zip')], 'broken.docx')), /无法读取/);
});

test('OCR text normalisation joins CJK without spaces and keeps page numbers', async () => {
  const { normalizeOcrText, pageBlocks, assembleOcr } = await import('../../src/importers/ocr.js');
  assert.equal(normalizeOcrText('认 知 失 调\n理 论 很 重 要'), '认知失调理论很重要');
  assert.equal(normalizeOcrText('Cognitive disso-\nnance theory\nmatters'), 'Cognitive dissonance theory matters');
  const blocks = [...pageBlocks({ blocks: [{ paragraphs: [{ text: '第 一 段' }, { text: 'x' }] }] }, 3), ...pageBlocks({ text: '第 二 段\n\n第 三 段' }, 4)];
  const { paragraphs } = assembleOcr(blocks);
  assert.deepEqual(paragraphs.map((p) => [p.text, p.pageNumber]), [['第一段', 3], ['第二段', 4], ['第三段', 4]]);
});

test('XHTML conversion decodes entities without inventing text', () => {
  assert.equal(decodeEntities('A&amp;B &#x4e2d;&#25991; &unknown;'), 'A&B 中文 &unknown;');
  assert.equal(xhtmlToText('<body><p> </p></body>'), '');
});
