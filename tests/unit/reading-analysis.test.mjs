import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase, saveDocument, getDocument } from '../../src/data/db.js';
import { ReadingRepository } from '../../src/data/reading-repository.js';
import { createDocument } from '../../src/domain/documents.js';
import { documentSnapshot } from '../../src/domain/evidence.js';
import { MODE_SECTIONS, validateReadingOutput } from '../../src/ai/schema.js';
import { DigestAIService } from '../../src/ai/service.js';
import { AnalysisSession } from '../../src/ai/analysis-session.js';
import { DeveloperTransport } from '../../src/ai/developer-transport.js';
import { outputFor } from '../fixtures/reading-output.mjs';

async function setup() {
  const db = await openDatabase(new IDBFactory());
  const item = createDocument({ rawContent: '第一段：主动回忆需要先尝试回答。\n\n第二段：间隔练习分布在多天进行。\n\n第三段：引用不能用模型改写内容替代。' });
  await saveDocument(item, db);
  return { db, item, snapshot: await documentSnapshot(item), repository: new ReadingRepository(db) };
}
const transportFor = (snapshot) => ({ request: async () => JSON.stringify(outputFor(snapshot)) });

test('all four reading-mode schemas validate and accept honest missing sections', async () => {
  for (const readingMode of Object.keys(MODE_SECTIONS)) {
    const snapshot = await documentSnapshot(createDocument({ rawContent: '真实学习资料。', readingMode }));
    const output = outputFor(snapshot);
    assert.equal(validateReadingOutput(output, readingMode).readingMode, readingMode);
    delete output.sections[Object.keys(MODE_SECTIONS[readingMode])[0]];
    assert.throws(() => validateReadingOutput(output, readingMode), { code: 'schema_invalid' });
  }
});
test('schema rejects empty result, duplicate claim IDs and mismatched modes', async () => {
  const { snapshot, db } = await setup();
  const output = outputFor(snapshot);
  output.sections.mainPoints.items[0].id = output.sections.summary.items[0].id;
  assert.throws(() => validateReadingOutput(output, 'general'), { code: 'schema_invalid' });
  assert.throws(() => validateReadingOutput(output, 'legal_case'), { code: 'schema_invalid' });
  for (const section of Object.values(output.sections)) Object.assign(section, { status: 'missing', items: [], missingReason: '不足' });
  assert.throws(() => validateReadingOutput(output, 'general'), { code: 'empty_result' }); db.close();
});
test('service repairs invalid JSON once only; does not repair invalid evidence', async () => {
  const { snapshot, db } = await setup();
  let calls = 0;
  const service = new DigestAIService({ request: async () => ++calls === 1 ? 'invalid' : JSON.stringify(outputFor(snapshot, { invalid: true })) });
  const payload = await service.analyze(snapshot, { requestId: 'r' });
  assert.equal(calls, 2);
  assert.equal(payload.result.status, 'needs_attention');
  assert.ok(payload.anchors.some((anchor) => anchor.validationStatus === 'invalid'));
  assert.equal(new Set(payload.anchors.map((anchor) => anchor.id)).size, payload.anchors.length);
  calls = 0;
  await assert.rejects(() => new DigestAIService({ request: async () => { calls++; return '{}'; } }).analyze(snapshot, { requestId: 'bad' }));
  assert.equal(calls, 2); db.close();
});
test('refresh persistence restores claims and revalidates anchors', async () => {
  const { snapshot, repository, db } = await setup();
  const payload = await new AnalysisSession(repository).run(snapshot, new DigestAIService(transportFor(snapshot)));
  const restored = await new ReadingRepository(db).load(snapshot);
  assert.deepEqual(restored.result.sections, payload.result.sections);
  assert.ok(restored.anchors.every((anchor) => anchor.validationStatus === 'matched'));
  assert.ok(restored.anchors.every((anchor) => snapshot.source.slice(anchor.startOffset, anchor.endOffset) === anchor.quote));
  db.close();
});
test('re-analyze failure preserves previous successful result', async () => {
  const { snapshot, repository, db } = await setup();
  const session = new AnalysisSession(repository);
  const first = await session.run(snapshot, new DigestAIService(transportFor(snapshot)));
  await assert.rejects(() => session.run(snapshot, new DigestAIService({ request: async () => { throw new Error('Network failure'); } })));
  assert.equal((await repository.load(snapshot)).result.id, first.result.id); db.close();
});
test('cancelled transport response cannot persist even if transport ignores abort', async () => {
  const { snapshot, repository, db } = await setup();
  const session = new AnalysisSession(repository);
  let release, started;
  const ready = new Promise((resolve) => { started = resolve; });
  const pending = session.run(snapshot, new DigestAIService({ request: () => { started(); return new Promise((resolve) => { release = resolve; }); } }));
  await ready; session.cancel(); release(JSON.stringify(outputFor(snapshot)));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal((await repository.load(snapshot)).result, null); db.close();
});
test('changed document and superseded request are rejected atomically', async () => {
  const { snapshot, repository, db, item } = await setup();
  await repository.begin(snapshot, 'old');
  const old = await new DigestAIService(transportFor(snapshot)).analyze(snapshot, { requestId: 'old' });
  await repository.begin(snapshot, 'new');
  await assert.rejects(() => repository.commit(snapshot, old), { code: 'document_changed' });
  await saveDocument({ ...item, rawContent: '修改后的原文。' }, db);
  await assert.rejects(() => repository.begin(snapshot, 'changed'), { code: 'document_changed' });
  assert.equal((await getDocument(item.id, db)).digestResultId, null); db.close();
});
test('DeveloperTransport handles missing config, HTTP, network, timeout and cancellation', async () => {
  const config = { endpoint: 'https://example.test/v1', model: 'test', key: 'fixture-key' };
  await assert.rejects(() => new DeveloperTransport({}).request([]), { code: 'no_configuration' });
  await assert.rejects(() => new DeveloperTransport(config, { fetchImpl: async () => ({ ok: false, status: 503 }) }).request([]), { code: 'http_error' });
  await assert.rejects(() => new DeveloperTransport(config, { fetchImpl: async () => { throw new Error('offline'); } }).request([]), { code: 'network_error' });
  const waitFetch = (_, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
    else signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  await assert.rejects(() => new DeveloperTransport(config, { fetchImpl: waitFetch, timeoutMs: 5 }).request([]), { code: 'timeout' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => new DeveloperTransport(config, { fetchImpl: waitFetch }).request([], { signal: controller.signal }), { name: 'AbortError' });
});
