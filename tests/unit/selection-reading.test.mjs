import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase, saveDocument, getAllRecords } from '../../src/data/db.js';
import { ReadingRepository } from '../../src/data/reading-repository.js';
import { createDocument } from '../../src/domain/documents.js';
import { documentSnapshot, selectionText, validFocus, anchorInFocus, MAX_FOCUS_CHARS } from '../../src/domain/evidence.js';
import { DigestAIService } from '../../src/ai/service.js';
import { AnalysisSession } from '../../src/ai/analysis-session.js';
import { outputFor } from '../fixtures/reading-output.mjs';

const SOURCE = '第一段：主动回忆需要先尝试回答。\n\n第二段：间隔练习把复习分布在多天进行，比集中复习保持得更久。\n\n第三段：引用不能用模型改写的内容替代。';

async function setup() {
  const db = await openDatabase(new IDBFactory());
  const item = createDocument({ rawContent: SOURCE });
  await saveDocument(item, db);
  return { db, item, snapshot: await documentSnapshot(item), repository: new ReadingRepository(db) };
}
const focusOf = (snapshot, a, from, b, to) => {
  const focus = { start: { paragraphIndex: a, offset: from }, end: { paragraphIndex: b, offset: to } };
  return { ...focus, text: selectionText(snapshot.paragraphs, focus) };
};
// A transport that records prompts and answers like the QA mock (it reads the focus from the prompt).
function recordingTransport() {
  const prompts = [];
  return {
    prompts,
    request: async (messages) => {
      const prompt = JSON.parse(messages.find((m) => m.role === 'user').content);
      prompts.push(prompt);
      return JSON.stringify(outputFor({ ...prompt.document, readingMode: prompt.readingMode, focus: prompt.focus }));
    },
  };
}

test('selected passage text is rebuilt from paragraph offsets and must match the source exactly', async () => {
  const { snapshot, db } = await setup();
  const one = focusOf(snapshot, 1, 4, 1, 12);
  assert.equal(one.text, '间隔练习把复习分');
  assert.ok(validFocus(one, snapshot.paragraphs));
  const across = focusOf(snapshot, 0, 4, 1, 8);
  assert.equal(across.text, '主动回忆需要先尝试回答。\n\n第二段：间隔练习');
  assert.ok(validFocus(across, snapshot.paragraphs));
  assert.equal(validFocus({ ...one, text: '间隔练习把复习分开' }, snapshot.paragraphs), false);
  assert.equal(validFocus({ ...one, end: { paragraphIndex: 1, offset: 4 } }, snapshot.paragraphs), false);
  assert.equal(validFocus({ ...one, end: { paragraphIndex: 9, offset: 1 } }, snapshot.paragraphs), false);
  assert.equal(validFocus({ ...one, text: 'x'.repeat(MAX_FOCUS_CHARS + 1) }, snapshot.paragraphs), false);
  assert.equal(anchorInFocus({ validationStatus: 'matched', paragraphIndex: 1, paragraphStartOffset: 0, paragraphEndOffset: 6 }, one), true);
  assert.equal(anchorInFocus({ validationStatus: 'matched', paragraphIndex: 1, paragraphStartOffset: 20, paragraphEndOffset: 26 }, one), false);
  assert.equal(anchorInFocus({ validationStatus: 'invalid', paragraphIndex: 1, paragraphStartOffset: 4, paragraphEndOffset: 8 }, one), false);
  db.close();
});

test('a passage reading sends the selection to the model, keeps its evidence checked and records who wrote it', async () => {
  const { snapshot, db } = await setup();
  const focus = focusOf(snapshot, 1, 4, 1, 30);
  const transport = recordingTransport();
  const service = new DigestAIService(transport);
  service.options = { start: 0, end: 2, label: '选段', focus, provenance: { service: 'developer', host: '127.0.0.1:5189', model: 'qa-mock', key: 'sk-never-stored' } };
  const { result, anchors } = await service.analyze(snapshot, { requestId: 'sel' });
  assert.equal(transport.prompts.length, 1);
  assert.equal(transport.prompts[0].focus.text, focus.text);
  assert.deepEqual(transport.prompts[0].focus.paragraphIndexes, [1]);
  assert.match(transport.prompts[0].task, /focus\.text/);
  assert.deepEqual(result.scope.focus, { start: focus.start, end: focus.end, text: focus.text });
  assert.deepEqual(result.provenance, { service: 'developer', host: '127.0.0.1:5189', model: 'qa-mock' });
  const first = result.sections.summary.items[0];
  const anchor = anchors.find((a) => a.id === first.evidenceIds[0]);
  assert.equal(anchor.validationStatus, 'matched');
  assert.equal(snapshot.source.slice(anchor.startOffset, anchor.endOffset), anchor.quote);
  assert.ok(anchorInFocus(anchor, result.scope.focus));
  // Trial-service readings carry no host or model.
  service.options = { ...service.options, provenance: { service: 'trial', model: 'x' } };
  assert.deepEqual((await service.analyze(snapshot, { requestId: 'sel2' })).result.provenance, { service: 'trial' });
  db.close();
});

test('a selection that no longer matches the source is refused before any model call', async () => {
  const { snapshot, db } = await setup();
  const transport = recordingTransport();
  const service = new DigestAIService(transport);
  service.options = { start: 0, end: 2, focus: { ...focusOf(snapshot, 1, 4, 1, 12), text: '已经被改动的文字' } };
  await assert.rejects(() => service.analyze(snapshot, { requestId: 'x' }), { code: 'selection_changed' });
  service.options = { start: 2, end: 2, focus: focusOf(snapshot, 1, 4, 1, 12) };
  await assert.rejects(() => service.analyze(snapshot, { requestId: 'y' }), { code: 'selection_changed' });
  assert.equal(transport.prompts.length, 0);
  db.close();
});

test('checkpoints for a selection never resume a different selection or a plain range', async () => {
  const { snapshot, db } = await setup();
  const keys = [];
  const run = async (focus) => {
    const service = new DigestAIService(recordingTransport());
    service.options = { start: 0, end: 2, language: 'zh-CN', focus, save: async (value) => keys.push(value.key) };
    await service.analyze(snapshot, { requestId: 'k' + keys.length });
  };
  await run(null);
  await run(focusOf(snapshot, 1, 4, 1, 12));
  await run(focusOf(snapshot, 1, 4, 1, 14));
  assert.equal(JSON.parse(keys[0]).length, 5, 'plain range keys stay as before');
  assert.equal(new Set(keys).size, 3);
  assert.deepEqual(JSON.parse(keys[1])[5], { start: { paragraphIndex: 1, offset: 4 }, end: { paragraphIndex: 1, offset: 12 } });
  db.close();
});

test('a passage reading is saved with the document, reopens by id and logs no material text', async () => {
  const { snapshot, repository, db, item } = await setup();
  const focus = focusOf(snapshot, 1, 4, 1, 30);
  const service = new DigestAIService(recordingTransport());
  service.options = { start: 0, end: 2, label: '选段', focus, provenance: { service: 'trial' } };
  const payload = await new AnalysisSession(repository).run(snapshot, service);
  const reopened = await new ReadingRepository(db).load(snapshot, payload.result.id);
  assert.deepEqual(reopened.result.scope.focus, payload.result.scope.focus);
  assert.equal(reopened.result.provenance.service, 'trial');
  assert.ok(reopened.anchors.every((a) => a.validationStatus === 'matched'));
  const activity = (await getAllRecords('activities', db)).find((a) => a.type === 'reading_completed');
  assert.equal(activity.selection, true);
  assert.equal(activity.documentId, item.id);
  assert.ok(!JSON.stringify(activity).includes(focus.text.slice(0, 6)));
  db.close();
});

test('a passage reading survives backup and restore into an empty library, and stays searchable', async () => {
  const { exportBackup, restoreBackup } = await import('../../src/data/backup.js');
  const { buildHistoryIndex, searchHistory } = await import('../../src/domain/history.js');
  const { snapshot, repository, db } = await setup();
  const focus = focusOf(snapshot, 1, 4, 1, 30);
  const service = new DigestAIService(recordingTransport());
  service.options = { start: 0, end: 2, label: '选段', focus, provenance: { service: 'trial' } };
  const payload = await new AnalysisSession(repository).run(snapshot, service);
  const backup = JSON.parse(JSON.stringify(await exportBackup(db)));
  db.close();
  const fresh = await openDatabase(new IDBFactory());
  await restoreBackup(fresh, backup);
  const restored = await new ReadingRepository(fresh).load(snapshot, payload.result.id);
  assert.deepEqual(restored.result.scope.focus, payload.result.scope.focus);
  assert.deepEqual(restored.result.provenance, { service: 'trial' });
  assert.ok(restored.anchors.every((a) => a.validationStatus === 'matched'));
  const data = {};
  for (const s of ['documents', 'readingResults']) data[s] = await getAllRecords(s, fresh);
  const hits = searchHistory(buildHistoryIndex(data), 'QA 模拟', { type: 'reading' });
  assert.ok(hits.length >= 1);
  assert.match(hits[0].href, new RegExp('result=' + payload.result.id));
  fresh.close();
});
test('a passage reading does not replace the material\'s main reading', async () => {
  const { snapshot, repository, db } = await setup();
  const session = new AnalysisSession(repository);
  const whole = new DigestAIService(recordingTransport());
  whole.options = { start: 0, end: 2 };
  const main = await session.run(snapshot, whole);
  const passage = new DigestAIService(recordingTransport());
  passage.options = { start: 0, end: 2, focus: focusOf(snapshot, 1, 4, 1, 12) };
  const focused = await session.run(snapshot, passage);
  assert.equal((await repository.load(snapshot)).result.id, main.result.id, 'reopening shows the main reading');
  assert.equal((await repository.load(snapshot, focused.result.id)).result.id, focused.result.id, 'the passage reading opens by id');
  // A passage reading on a material with no reading yet becomes its default.
  const other = await setup();
  const first = new DigestAIService(recordingTransport());
  first.options = { start: 0, end: 2, focus: focusOf(other.snapshot, 1, 4, 1, 12) };
  const only = await new AnalysisSession(other.repository).run(other.snapshot, first);
  assert.equal((await other.repository.load(other.snapshot)).result.id, only.result.id);
  db.close();
  other.db.close();
});