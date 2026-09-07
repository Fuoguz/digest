import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../../src/domain/documents.js';
import { documentSnapshot, validateEvidence, restoreAnchor } from '../../src/domain/evidence.js';

test('exact Chinese quote receives correct local and global UTF-16 offsets', async () => {
  const snapshot = await documentSnapshot(createDocument({ rawContent: '第一段。\n\n第二段：原文证据在这里。' }));
  const anchor = validateEvidence({ paragraphIndex: 1, quote: '原文证据' }, snapshot, 'e1');
  assert.equal(anchor.validationStatus, 'matched');
  assert.equal(anchor.paragraphStartOffset, 4);
  assert.equal(snapshot.source.slice(anchor.startOffset, anchor.endOffset), '原文证据');
});
test('emoji offsets retain surrogate pairs and exact whitespace', async () => {
  const snapshot = await documentSnapshot(createDocument({ rawContent: '😀开头。\n\n资料  📖\n换行原文。' }));
  const anchor = validateEvidence({ paragraphIndex: 1, quote: '📖\n换行' }, snapshot, 'e');
  assert.equal(anchor.validationStatus, 'matched');
  assert.equal(anchor.endOffset - anchor.startOffset, 5);
  assert.equal(snapshot.source.slice(anchor.startOffset, anchor.endOffset), '📖\n换行');
});
test('invalid, blank, out of range and rewritten quotes are not matched', async () => {
  const snapshot = await documentSnapshot(createDocument({ rawContent: '原始  空格和标点。' }));
  for (const proposal of [{ paragraphIndex: 0, quote: '原始 空格' }, { paragraphIndex: 0, quote: '' }, { paragraphIndex: 99, quote: '原始' }, { paragraphIndex: 0, quote: '伪造', validationStatus: 'matched', startOffset: 0 }]) {
    assert.equal(validateEvidence(proposal, snapshot, 'e').validationStatus, 'invalid');
  }
});
test('duplicate and overlapping occurrences are ambiguous', async () => {
  for (const [source, quote] of [['学习，学习。', '学习'], ['aaaa', 'aa']]) {
    const snapshot = await documentSnapshot(createDocument({ rawContent: source }));
    const anchor = validateEvidence({ paragraphIndex: 0, quote }, snapshot, 'e');
    assert.equal(anchor.validationStatus, 'ambiguous'); assert.equal(anchor.startOffset, null);
  }
});
test('page metadata comes only from source and stale revisions cannot locate', async () => {
  const item = createDocument({ rawContent: 'PDF 中的真实段落。' });
  item.paragraphs[0].pageNumber = 4;
  const snapshot = await documentSnapshot(item);
  const anchor = validateEvidence({ paragraphIndex: 0, quote: '真实段落', pageNumber: 88 }, snapshot, 'e');
  assert.equal(anchor.pageNumber, 4);
  const changed = await documentSnapshot({ ...item, rawContent: '已修改。' });
  assert.equal(restoreAnchor(anchor, changed).validationStatus, 'stale');
  delete item.paragraphs[0].pageNumber;
  assert.equal(validateEvidence({ paragraphIndex: 0, quote: '真实段落', pageNumber: 88 }, await documentSnapshot(item), 'e').pageNumber, null);
});
