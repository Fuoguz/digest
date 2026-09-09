import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openDatabase, saveDocument, getRecord } from "../../src/data/db.js";
import { createDocument } from "../../src/domain/documents.js";
import { documentSnapshot } from "../../src/domain/evidence.js";
import {
  LearningRepository,
  atomic,
} from "../../src/data/learning-repository.js";
import { ReadingRepository } from "../../src/data/reading-repository.js";
import { DigestAIService } from "../../src/ai/service.js";
import {
  schedule,
  learningStats,
  validateRelations,
  confirmedGraph,
} from "../../src/domain/learning.js";
import { outputFor } from "../fixtures/reading-output.mjs";
import { exportBackup, restoreBackup } from "../../src/data/backup.js";
async function setup() {
  const db = await openDatabase(new IDBFactory()),
    repo = new LearningRepository(db),
    doc = createDocument({
      rawContent:
        "间隔复习帮助长期记忆。\n\n主动回忆用于检查理解。\n\n复习需要核查来源。",
    });
  await saveDocument(doc, db);
  const snapshot = await documentSnapshot(doc);
  const payload = await new DigestAIService({
    request: async () => JSON.stringify(outputFor(snapshot)),
  }).analyze(snapshot, { requestId: "r1" });
  const reading = new ReadingRepository(db);
  await reading.begin(snapshot, "r1");
  await reading.commit(snapshot, payload);
  return {
    db,
    repo,
    doc,
    snapshot,
    result: payload.result,
    claim: payload.result.sections.summary.items[0],
  };
}
test("scheduler uses calendar days, reset and increasing intervals", () => {
  const now = new Date("2026-09-07T10:00:00Z");
  for (const [r, n] of Object.entries({
    again: 1,
    hard: 3,
    good: 7,
    easy: 14,
  })) {
    assert.equal(schedule({}, r, now).intervalDays, n);
  }
  assert.equal(schedule({ intervalDays: 14 }, "good", now).intervalDays, 28);
  assert.equal(schedule({ intervalDays: 50 }, "again", now).intervalDays, 1);
  assert.throws(() => schedule({}, "fake"));
});
test("duplicate question is prevented in concurrent transactions; refresh retains schedule and history", async () => {
  const { db, repo, snapshot, result, claim } = await setup();
  const q = {
    question: "什么是主动回忆？",
    answer: "先回忆再核对",
    claimIds: [claim.id],
  };
  const [a, b] = await Promise.all([
    repo.addReview(snapshot, result, q),
    repo.addReview(snapshot, result, q),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.evidenceIds.length, 1);
  const now = new Date(Date.now() + 1000);
  const rated = await repo.rate(a.id, "good", 0, now);
  assert.equal(rated.intervalDays, 7);
  await assert.rejects(repo.rate(a.id, "good", 0, now));
  const restored = await getRecord("reviewCards", a.id, db);
  assert.equal(restored.nextReviewAt, rated.nextReviewAt);
  assert.equal(restored.history.length, 1);
  assert.equal(
    (await repo.list("activities")).filter((a) => a.type === "review_rated")
      .length,
    1,
  );
});
test("stale source blocks review grading and knowledge confirmation", async () => {
  const { db, repo, snapshot, result, doc, claim } = await setup();
  const card = await repo.addReview(snapshot, result, {
    question: "q",
    answer: "a",
  });
  await saveDocument(
    { ...doc, rawContent: "changed", digestResultId: result.id },
    db,
  );
  await assert.rejects(
    repo.rate(card.id, "good", 0, new Date(Date.now() + 1000)),
  );
  await assert.rejects(repo.confirmUnit(snapshot, result, claim, "主动回忆"));
  assert.equal((await repo.list("reviewCards"))[0].version, 0);
});
test("knowledge units are explicit, deduplicated and retain source claim", async () => {
  const { repo, snapshot, result, claim } = await setup();
  assert.equal((await repo.list("knowledgeUnits")).length, 0);
  const a = await repo.confirmUnit(snapshot, result, claim, "间隔复习"),
    b = await repo.confirmUnit(snapshot, result, claim, "重复");
  assert.equal(a.id, b.id);
  assert.equal(a.claimId, claim.id);
  await repo.editUnit(a.id, "长期记忆");
  assert.equal((await repo.list("knowledgeUnits"))[0].label, "长期记忆");
  await repo.removeUnit(a.id);
  assert.equal((await repo.list("knowledgeUnits")).length, 0);
});
test("relations allow empty, reject invalid direction/type/reason and only confirmed enter graph", () => {
  const units = [
    { id: "a", status: "confirmed", evidenceIds: ["e"] },
    { id: "b", status: "confirmed", evidenceIds: [] },
  ];
  assert.deepEqual(validateRelations({ relations: [] }, units), []);
  const r = {
    sourceKnowledgeUnitId: "a",
    targetKnowledgeUnitId: "b",
    type: "supports",
    reason: "材料支持这一论点",
    evidenceIds: ["fake", "e"],
  };
  const [clean] = validateRelations({ relations: [r] }, units);
  assert.deepEqual(clean.evidenceIds, ["e"]);
  assert.equal(confirmedGraph(units, [clean]).links.length, 0);
  assert.equal(
    confirmedGraph(units, [{ ...clean, status: "confirmed" }]).links.length,
    1,
  );
  assert.equal(
    confirmedGraph(
      [{ ...units[0], stale: true }, units[1]],
      [{ ...clean, status: "confirmed" }],
    ).links.length,
    0,
  );
  for (const bad of [
    { ...r, type: "same_tag" },
    { ...r, reason: "" },
    { ...r, targetKnowledgeUnitId: "a" },
    { ...r, targetKnowledgeUnitId: "missing" },
  ])
    assert.throws(() => validateRelations({ relations: [bad] }, units));
});
test("relation suggestion rejects edited source and confirm/delete are persistent", async () => {
  const { repo, snapshot, result, claim } = await setup();
  const a = await repo.confirmUnit(snapshot, result, claim, "A"),
    b = await repo.confirmUnit(
      snapshot,
      result,
      result.sections.mainPoints.items[0],
      "B",
    );
  const input = {
    relations: [
      {
        sourceKnowledgeUnitId: a.id,
        targetKnowledgeUnitId: b.id,
        type: "related_to",
        reason: "两个判断共同讨论记忆方法",
        evidenceIds: [],
      },
    ],
  };
  await repo.suggestRelations(input, [a, b]);
  let r = (await repo.list("relations"))[0];
  assert.equal(r.status, "suggested");
  await repo.decideRelation(r.id, "confirmed");
  assert.equal((await repo.list("relations"))[0].status, "confirmed");
  await repo.editUnit(a.id, "edited");
  await assert.rejects(repo.suggestRelations(input, [a, b]));
  await repo.removeUnit(a.id);
  assert.equal((await repo.list("relations")).length, 0);
});
test("transaction failure rolls back writes and allows retry", async () => {
  const { db, repo } = await setup();
  await assert.rejects(
    atomic(db, ["activities"], (_, tx) => {
      tx.objectStore("activities").put({ id: "must-rollback" });
      throw new Error("injected failure");
    }),
  );
  assert.equal(
    (await repo.list("activities")).some((a) => a.id === "must-rollback"),
    false,
  );
  await atomic(db, ["activities"], (_, tx) =>
    tx.objectStore("activities").put({ id: "retry-success" }),
  );
  assert.equal(
    (await repo.list("activities")).some((a) => a.id === "retry-success"),
    true,
  );
});
test("dashboard counts only real completed review events and local consecutive days", () => {
  const now = new Date(2026, 8, 7, 12);
  const activities = [
    { type: "review_rated", createdAt: new Date(2026, 8, 7, 10).toISOString() },
    {
      type: "reading_completed",
      createdAt: new Date(2026, 8, 6, 10).toISOString(),
    },
  ];
  const stats = learningStats(
    [
      { status: "active", nextReviewAt: new Date(2026, 8, 7, 0).toISOString() },
      { status: "paused", nextReviewAt: new Date(2026, 8, 7, 0).toISOString() },
    ],
    activities,
    now,
  );
  assert.deepEqual(stats, { due: 1, completed: 1, streak: 2 });
});
test("backup restores reading, evidence and review atomically without secrets or overwriting data", async () => {
  const { db, repo, snapshot, result, claim } = await setup();
  await repo.addReview(snapshot, result, {
    question: "测试问题",
    answer: "测试答案",
    claimIds: [claim.id],
  });
  await repo.confirmUnit(snapshot, result, claim, "测试概念");
  const backup = await exportBackup(db);
  assert.equal(backup.stores.settings, undefined);
  const fresh = await openDatabase(new IDBFactory());
  assert.equal(await restoreBackup(fresh, backup), 1);
  assert.equal(
    (await new LearningRepository(fresh).list("reviewCards")).length,
    1,
  );
  const loaded = await new ReadingRepository(fresh).load(snapshot);
  assert.equal(loaded.result.id, result.id);
  assert.equal(loaded.anchors[0].validationStatus, "matched");
  await assert.rejects(restoreBackup(db, backup));
  assert.equal((await repo.list("documents")).length, 1);
  const invalid = structuredClone(backup);
  invalid.stores.reviewCards[0].nextReviewAt = "invalid";
  const empty = await openDatabase(new IDBFactory());
  await assert.rejects(restoreBackup(empty, invalid));
  assert.equal(
    (await new LearningRepository(empty).list("documents")).length,
    0,
  );
});
