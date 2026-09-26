import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  openDatabase,
  saveDocument,
  getRecord,
  getAllRecords,
  DB_NAME,
} from "../../src/data/db.js";
import { createDocument } from "../../src/domain/documents.js";
import { TrainingRepository } from "../../src/data/training-repository.js";
import {
  prepareFeedbackContext,
  generateFeedback,
  feedbackMessages,
  parseFeedback,
} from "../../src/domain/training.js";
import { restoreAnchor, documentSnapshot } from "../../src/domain/evidence.js";
import { exportBackup, restoreBackup } from "../../src/data/backup.js";
import { feedbackOutput } from "../fixtures/feedback-output.mjs";
const answer = "议程设置说明人们关注什么问题。框架理论与它完全相同。";
async function setup() {
  const factory = new IDBFactory(),
    db = await openDatabase(factory),
    repo = new TrainingRepository(db);
  const doc = createDocument({
    title: "传播学课程笔记",
    rawContent:
      "议程设置关注议题的重要性；框架关注问题如何被解释。\n\n同一新闻可以通过不同角度呈现。",
  });
  await saveDocument(doc, db);
  const course = await repo.saveCourse({
    title: "传播学理论",
    documentIds: [doc.id],
  });
  const task = await repo.saveTask({
    title: "区分两个理论",
    prompt: "解释议程设置与框架的区别。",
    courseId: course.id,
    documentIds: [doc.id],
  });
  const context = await prepareFeedbackContext(task, course, [doc], answer);
  return { factory, db, repo, doc, course, task, context };
}
async function feedback(s, id = "feedback-1") {
  return generateFeedback(
    s.context,
    {
      request: async () =>
        JSON.stringify(
          feedbackOutput(JSON.parse(feedbackMessages(s.context)[1].content)),
        ),
    },
    id,
  );
}
async function reviewed(s) {
  const a = await s.repo.submit(s.task.id, answer);
  await s.repo.begin(a.id, "r");
  await s.repo.commit(a.id, "r", s.context, await feedback(s));
  return a;
}
test("Course and Task CRUD preserve Documents and remove only their own training records", async () => {
  const s = await setup();
  const c = await s.repo.saveCourse({ ...s.course, title: "新版课程名" });
  assert.equal(c.id, s.course.id);
  const t = await s.repo.saveTask({ ...s.task, prompt: "更新问题" });
  assert.equal(t.version, 2);
  await s.repo.removeTask(t.id);
  assert.equal((await s.repo.get("courses", c.id)).taskIds.length, 0);
  await s.repo.removeCourse(c.id);
  assert.equal((await s.repo.list("courses")).length, 0);
  assert.equal(
    (await s.repo.list("documents"))[0].rawContent,
    s.doc.rawContent,
  );
});
test("Attempt persists before AI and survives closing and reopening the database", async () => {
  const s = await setup();
  await s.repo.saveDraft(s.task.id, answer);
  const a = await s.repo.submit(s.task.id, answer);
  s.db.close();
  const reopened = await openDatabase(s.factory);
  assert.equal(
    (await getRecord("attempts", a.id, reopened)).userAnswer,
    answer,
  );
  assert.equal((await getRecord("tasks", s.task.id, reopened)).draftAnswer, "");
});
test("Revision appends without overwriting original; unchanged revisions cannot activate", async () => {
  const s = await setup(),
    a = await reviewed(s);
  await assert.rejects(s.repo.revise(a.id, answer, "没有改"));
  await s.repo.revise(
    a.id,
    "修订：两种理论分别解释重要性与解释方式。",
    "纠正概念混用",
  );
  await s.repo.revise(
    a.id,
    "修订：两种理论分别解释重要性与解释方式，并用新闻案例说明。",
    "增加案例",
  );
  const saved = await s.repo.get("attempts", a.id);
  assert.equal(saved.userAnswer, answer);
  assert.equal(saved.revision.length, 2);
  assert.equal(
    (await s.repo.list("activities")).filter((e) => e.type === "task_completed")
      .length,
    1,
  );
});
test("Feedback strict schema rejects empty, malformed, missing and invalid support", async () => {
  const s = await setup(),
    valid = feedbackOutput(JSON.parse(feedbackMessages(s.context)[1].content));
  for (const bad of [
    "",
    "{",
    "{}",
    { ...valid, gaps: null },
    { ...valid, strengths: [], gaps: [] },
    { ...valid, gaps: [{ ...valid.gaps[0], support: "99%" }] },
  ])
    assert.throws(() => parseFeedback(bad));
  assert.equal(parseFeedback(JSON.stringify(valid)).gaps.length, 1);
});
test("AI failure preserves original Attempt and existing Feedback", async () => {
  const s = await setup(),
    a = await reviewed(s),
    old = await s.repo.get("attempts", a.id);
  await s.repo.begin(a.id, "retry");
  await assert.rejects(
    generateFeedback(
      s.context,
      {
        request: async () => {
          throw Error("503");
        },
      },
      "new",
    ),
  );
  await s.repo.cancel(a.id, "retry");
  assert.equal((await s.repo.get("attempts", a.id)).feedbackId, old.feedbackId);
  assert.equal((await s.repo.get("attempts", a.id)).userAnswer, answer);
});
test("Evidence invalid, wrong document and fabricated user quote never acquire trusted links", async () => {
  const s = await setup(),
    value = feedbackOutput(JSON.parse(feedbackMessages(s.context)[1].content));
  value.gaps[0].evidenceCandidates[0].quote = "不在原文";
  value.gaps[0].userAnswerQuote = "用户没有写过";
  value.strengths[0].evidenceCandidates[0].documentId = "outside-course";
  const p = await generateFeedback(
    s.context,
    { request: async () => JSON.stringify(value) },
    "f",
  );
  assert.equal(p.feedback.gaps[0].support, "no_evidence");
  assert.equal(p.feedback.gaps[0].userAnswerQuote, null);
  assert.equal(p.feedback.strengths[0].evidenceIds.length, 0);
  assert.equal(p.anchors[0].validationStatus, "invalid");
});
test("Source changes make old evidence stale and reject Feedback commit", async () => {
  const s = await setup(),
    a = await s.repo.submit(s.task.id, answer),
    p = await feedback(s);
  await s.repo.begin(a.id, "r");
  const changed = { ...s.doc, rawContent: s.doc.rawContent + "新的内容" };
  await saveDocument(changed, s.db);
  await assert.rejects(s.repo.commit(a.id, "r", s.context, p), /版本/);
  assert.equal(
    restoreAnchor(p.anchors[0], await documentSnapshot(changed))
      .validationStatus,
    "stale",
  );
  assert.equal((await s.repo.list("feedback")).length, 0);
});
test("Old request and cancelled request cannot write or cancel newer feedback", async () => {
  const s = await setup(),
    a = await s.repo.submit(s.task.id, answer),
    p = await feedback(s);
  await s.repo.begin(a.id, "old");
  await s.repo.begin(a.id, "new");
  await s.repo.cancel(a.id, "old");
  await assert.rejects(s.repo.commit(a.id, "old", s.context, p));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    s.repo.commit(a.id, "new", s.context, p, controller.signal),
    { name: "AbortError" },
  );
  await s.repo.commit(a.id, "new", s.context, p);
  assert.equal((await s.repo.list("feedback")).length, 1);
});
test("Transport ignoring cancellation still cannot generate feedback", async () => {
  const s = await setup(),
    ctrl = new AbortController();
  await assert.rejects(
    generateFeedback(
      s.context,
      {
        request: async () => {
          ctrl.abort();
          return JSON.stringify(
            feedbackOutput(JSON.parse(feedbackMessages(s.context)[1].content)),
          );
        },
      },
      "f",
      ctrl.signal,
    ),
    { name: "AbortError" },
  );
});
test("Task editing during AI rejects the historical response", async () => {
  const s = await setup(),
    a = await s.repo.submit(s.task.id, answer);
  await s.repo.begin(a.id, "r");
  await s.repo.saveTask({ ...s.task, prompt: "新的问题" });
  await assert.rejects(
    s.repo.commit(a.id, "r", s.context, await feedback(s)),
    /任务/,
  );
});
test("Backup v2 roundtrip includes original, revisions, feedback and anchors; corrupt references write nothing", async () => {
  const s = await setup(),
    a = await reviewed(s);
  await s.repo.revise(a.id, "经过修改的答案", "解释区别");
  const backup = await exportBackup(s.db),
    fresh = await openDatabase(new IDBFactory());
  await restoreBackup(fresh, backup);
  assert.deepEqual(
    (await getRecord("attempts", a.id, fresh)).revision,
    (await s.repo.get("attempts", a.id)).revision,
  );
  assert.equal((await getRecord("attempts", a.id, fresh)).userAnswer, answer);
  assert.equal((await getAllRecords("feedback", fresh)).length, 1);
  const broken = structuredClone(backup);
  broken.stores.feedback[0].attemptId = "missing";
  const empty = await openDatabase(new IDBFactory());
  await assert.rejects(restoreBackup(empty, broken));
  assert.equal((await getAllRecords("documents", empty)).length, 0);
});
test("Old v1 backup restores safely with empty training stores", async () => {
  const s = await setup(),
    backup = await exportBackup(s.db);
  backup.version = 1;
  for (const name of ["courses", "tasks", "attempts", "feedback"])
    delete backup.stores[name];
  const db = await openDatabase(new IDBFactory());
  await restoreBackup(db, backup);
  assert.equal((await getAllRecords("courses", db)).length, 0);
  assert.equal((await getAllRecords("documents", db)).length, 1);
});
test("Physical schema upgrade preserves an existing v1 Document without clearing any store", async () => {
  const factory = new IDBFactory();
  const legacy = await new Promise((resolve) => {
    const req = factory.open(DB_NAME, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("documents", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
  });
  await saveDocument({ id: "old", title: "必须保留" }, legacy);
  legacy.close();
  const next = await openDatabase(factory);
  assert.equal(next.version, 2);
  assert.equal((await getRecord("documents", "old", next)).title, "必须保留");
  assert.ok(next.objectStoreNames.contains("attempts"));
});
test("Oversized material uses bounded retrieval without losing original source or hiding scope", async () => {
  const s = await setup();
  const source="字".repeat(60001);
  const context=await prepareFeedbackContext(s.task,s.course,[{...s.doc,rawContent:source}],answer);
  assert.equal(context.snapshots[0].source,source);
  assert.equal(context.retrieval.scope.partial,true);
  assert.ok(context.retrieval.scope.selectedCharacters<=24000);
  assert.equal(context.retrieval.scope.totalCharacters,60001);
  s.db.close();
});

test("Analytics contain metadata only, never the submitted answer or source text", async () => {
  const s = await setup();
  await reviewed(s);
  const log = JSON.stringify(await s.repo.list("activities"));
  assert.ok(!log.includes(answer));
  assert.ok(!log.includes(s.doc.rawContent));
});
test("Deleting a course with reviewed attempts removes training records but keeps original documents and anchors", async () => {
  const s = await setup();
  await reviewed(s);
  const before = await s.repo.list("evidenceAnchors");
  await s.repo.removeCourse(s.course.id);
  for (const name of ["courses", "tasks", "attempts", "feedback"])
    assert.equal((await s.repo.list(name)).length, 0);
  assert.equal((await s.repo.list("documents")).length, 1);
  assert.deepEqual(await s.repo.list("evidenceAnchors"), before);
});
test("Backup restore distrusts forged answer quotes and Evidence matched flags", async () => {
  const s = await setup();
  await reviewed(s);
  const backup = await exportBackup(s.db);
  backup.stores.feedback[0].gaps[0].userAnswerQuote = "学生根本没写过这句话";
  for (const anchor of backup.stores.evidenceAnchors) {
    anchor.quote = "这句话不在课程材料";
    anchor.validationStatus = "matched";
  }
  const db = await openDatabase(new IDBFactory());
  await restoreBackup(db, backup);
  const f = (await getAllRecords("feedback", db))[0];
  assert.equal(f.gaps[0].userAnswerQuote, null);
  assert.equal(f.gaps[0].support, "no_evidence");
  assert.ok(
    (await getAllRecords("evidenceAnchors", db)).every(
      (a) => a.validationStatus === "invalid",
    ),
  );
});
