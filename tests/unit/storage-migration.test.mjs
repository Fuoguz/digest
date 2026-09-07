import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase, listDocuments, saveDocument, getDocument } from '../../src/data/db.js';
import { collectLegacySnapshot, extractLegacyNodes, LEGACY_BACKUP_KEY, runLegacyMigration } from '../../src/data/legacy-migration.js';
import { createDocument } from '../../src/domain/documents.js';

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    dump() { return Object.fromEntries(values); }
  };
}

test('IndexedDB saves and retrieves a structured Document', async () => {
  const db = await openDatabase(new IDBFactory());
  const input = createDocument({ title: '课程讲义', rawContent: '第一段。\n\n第二段。', tags: ['课程'] });
  await saveDocument(input, db);
  assert.deepEqual(await getDocument(input.id, db), input);
  assert.equal((await listDocuments(db)).length, 1);
  db.close();
});

test('legacy migration backs up old keys, retains source values, and marks incomplete', async () => {
  const oldNodes = [{ id: 'n1', title: '旧知识点', insight: '旧版洞察', tags: ['学习'], createdAt: '2025-01-01T00:00:00.000Z' }];
  const storage = createStorage({ digest_nodes: JSON.stringify(oldNodes) });
  const before = storage.getItem('digest_nodes');
  const db = await openDatabase(new IDBFactory());
  const result = await runLegacyMigration({ storage, db });
  const documents = await listDocuments(db);
  assert.equal(result.migrated, 1);
  assert.ok(storage.getItem(LEGACY_BACKUP_KEY));
  assert.equal(storage.getItem('digest_nodes'), before);
  assert.equal(documents[0].status, 'legacy_incomplete');
  assert.equal(documents[0].rawContent, '');
  assert.equal(documents[0].metadata.legacyInsight, '旧版洞察');
  assert.deepEqual(documents[0].evidenceAnchorIds, []);
  db.close();
});

test('legacy extraction tolerates invalid values without clearing them', () => {
  const storage = createStorage({ digest_nodes: '{broken', 'digest:state:v1': JSON.stringify({ nodes: [{ title: '保留项' }] }) });
  const snapshot = collectLegacySnapshot(storage);
  assert.equal(extractLegacyNodes(snapshot).length, 1);
  assert.equal(storage.getItem('digest_nodes'), '{broken');
});
