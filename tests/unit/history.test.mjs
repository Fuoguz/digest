import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryIndex, searchHistory, countByType, snippet } from '../../src/domain/history.js';

const data = {
  documents: [
    { id: 'd1', title: '认知失调讲义', rawContent: '当行为与态度不一致时，人会感到不适并调整态度。', updatedAt: '2026-10-01T08:00:00Z' },
    { id: 'd2', title: 'Framing notes', rawContent: 'Framing selects some aspects of reality.', updatedAt: '2026-10-02T08:00:00Z' },
  ],
  readingResults: [
    {
      id: 'r1', documentId: 'd1', createdAt: '2026-10-03T08:00:00Z', scope: { label: '选段 · 「行为与态度」' },
      overview: { summary: '概览：失调带来调整。', points: [] },
      sections: { summary: { items: [{ id: 'c1', text: '报酬越少，态度改变越大。', kind: 'inference', evidenceIds: [] }] } },
    },
    { id: 'orphan', documentId: 'gone', createdAt: '2026-10-03T08:00:00Z', sections: { summary: { items: [{ id: 'x', text: '孤立结果', kind: 'inference', evidenceIds: [] }] } } },
  ],
  knowledgeUnits: [{ id: 'u1', documentId: 'd1', label: '认知失调', summary: '态度与行为冲突', createdAt: '2026-10-04T08:00:00Z' }],
  reviewCards: [{ id: 'k1', documentId: 'd2', question: 'What does framing select?', answer: 'Some aspects of reality', status: 'paused', createdAt: '2026-10-05T08:00:00Z' }],
  tasks: [{ id: 't1', title: '解释失调', prompt: '为什么报酬越少态度改变越大？', documentIds: ['d1'], createdAt: '2026-10-06T08:00:00Z' }],
  attempts: [{
    id: 'a1', taskId: 't1', userAnswer: '因为外部理由不足。', submittedAt: '2026-10-07T08:00:00Z',
    revision: [{ userAnswer: '外部理由不足时，人会改变态度来减少失调。', reflection: '补上了机制', createdAt: '2026-10-08T08:00:00Z' }],
  }],
  feedback: [{ id: 'f1', attemptId: 'a1', overall: '抓住了外部理由', createdAt: '2026-10-07T09:00:00Z',
    gaps: [{ explanation: '没有说明失调的不适感', suggestedAction: '补充心理不适' }], strengths: [] }],
  learningGaps: [{ id: 'g1', taskId: 't1', attemptId: 'a1', title: '失调的动机作用', description: '缺少不适感', status: 'observed', createdAt: '2026-10-07T09:00:00Z' }],
};

test('the history index covers every kind of learning record and links each to its place', () => {
  const entries = buildHistoryIndex(data);
  const types = entries.map((e) => e.type);
  for (const t of ['material', 'reading', 'unit', 'card', 'task', 'answer', 'feedback', 'gap']) assert.ok(types.includes(t), t);
  assert.ok(!entries.some((e) => e.body.includes('孤立结果')), 'readings of deleted materials are left out');
  const claim = entries.find((e) => e.key === 'reading:r1:c1');
  assert.equal(claim.href, '/app/reader/d1?result=r1&claim=c1');
  assert.equal(entries.find((e) => e.type === 'answer').href, '/app/tasks/t1?attempt=a1');
  assert.equal(entries.find((e) => e.type === 'gap').href, '/app/gaps/g1');
  assert.deepEqual(entries.find((e) => e.type === 'gap').documentIds, ['d1']);
  assert.match(entries.find((e) => e.type === 'answer').body, /减少失调/);
});

test('search needs every term, ranks title hits first and can be narrowed by type or material', () => {
  const entries = buildHistoryIndex(data);
  const hits = searchHistory(entries, '失调');
  assert.equal(hits[0].title.includes('失调'), true);
  assert.ok(hits.some((e) => e.type === 'answer'));
  assert.equal(searchHistory(entries, '失调 framing').length, 0);
  assert.deepEqual(searchHistory(entries, 'FRAMING', { type: 'card' }).map((e) => e.key), ['card:k1']);
  const forD2 = searchHistory(entries, '', { documentId: 'd2' });
  assert.deepEqual(forD2.map((e) => e.type).sort(), ['card', 'material']);
  const timeline = searchHistory(entries, '');
  assert.ok(timeline.every((e, i) => i === 0 || Date.parse(timeline[i - 1].date) >= Date.parse(e.date)), 'empty query is newest first');
  const counts = countByType(entries, '失调');
  assert.equal(counts.all, hits.length);
  assert.equal(counts.card, 0);
});

test('snippets show the text around the match', () => {
  const entry = { body: '前文'.repeat(80) + '关键句在这里' + '后文'.repeat(80) };
  const s = snippet(entry, '关键句');
  assert.match(s, /^…/);
  assert.match(s, /关键句在这里/);
  assert.ok(s.length <= 142);
  assert.equal(snippet({ body: '短文本' }, '无关'), '短文本');
});
