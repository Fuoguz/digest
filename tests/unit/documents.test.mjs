import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParagraphs, createDocument, matchesDocument, READING_MODES } from '../../src/domain/documents.js';

test('buildParagraphs preserves stable indices and source offsets', () => {
  const source = '第一段内容。\n\n第二段内容更长。\n仍属于第二段。';
  const paragraphs = buildParagraphs(source);
  assert.equal(paragraphs.length, 2);
  assert.deepEqual(paragraphs.map((item) => item.paragraphIndex), [0, 1]);
  assert.equal(source.slice(paragraphs[0].startOffset, paragraphs[0].endOffset), '第一段内容。');
  assert.match(paragraphs[1].text, /仍属于第二段/);
});

test('Document supports every v0.2 reading mode', () => {
  for (const readingMode of Object.keys(READING_MODES)) {
    const document = createDocument({ title: readingMode, rawContent: '可追溯的测试正文。', readingMode });
    assert.equal(document.readingMode, readingMode);
    assert.ok(document.id.startsWith('doc-'));
    assert.equal(document.paragraphs.length, 1);
  }
});

test('Document search covers title, body, tags and filters', () => {
  const document = createDocument({ title: '间隔学习研究', rawContent: '延迟测试表现更好。', sourceType: 'pdf', tags: ['认知科学'], favorite: true });
  assert.equal(matchesDocument(document, { query: '延迟测试', sourceType: 'pdf', readingMode: 'general', tag: '认知科学', favorite: true }), true);
  assert.equal(matchesDocument(document, { readingMode: 'legal_case' }), false);
  assert.equal(matchesDocument(document, { query: '法律规则' }), false);
});

test('legacy incomplete entry may remain without invented source text', () => {
  const document = createDocument({ title: '旧条目', rawContent: '', sourceType: 'legacy', status: 'legacy_incomplete' });
  assert.equal(document.rawContent, '');
  assert.deepEqual(document.paragraphs, []);
});
