import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  openDatabase,
  saveDocument,
  DB_NAME,
  STORES,
} from "../../src/data/db.js";
import { createDocument } from "../../src/domain/documents.js";
import {
  prepareFeedbackContext,
  generateFeedback,
  feedbackMessages,
} from "../../src/domain/training.js";
import {
  deriveGaps,
  prioritizeFeedback,
  revisionDiff,
} from "../../src/domain/gaps.js";
import {
  validateChallenge,
  generateChallenge,
  validateRetest,
  generateRetest,
  challengeMessages,
  retestMessages,
} from "../../src/ai/learning-loop.js";
import { rescueRetrieval } from "../../src/ai/retrieval-rescue.js";
import { LoopRepository } from "../../src/data/loop-repository.js";
import { exportBackup, restoreBackup } from "../../src/data/backup.js";
import { feedbackOutput } from "../fixtures/feedback-output.mjs";
import { loopOutput } from "../fixtures/loop-output.mjs";
import { suggestTasks } from "../../src/ai/task-suggestions.js";
const original = "我认为议程设置与框架完全相同，增加报道就必然改变公众的立场。";
async function setup() {
  const db = await openDatabase(new IDBFactory()),
    repo = new LoopRepository(db),
    doc = createDocument({
      title: "Concepts",
      rawContent:
        "议程设置影响公众关注哪些议题，不能由此推断公众立场被直接决定。框架影响人们如何解释一个问题。\n\n报道频率和问题解释是不同维度。",
    });
  await saveDocument(doc, db);
  const course = await repo.saveCourse({
      title: "传播学",
      documentIds: [doc.id],
    }),
    task = await repo.saveTask({
      courseId: course.id,
      title: "区分概念",
      prompt: "解释议程设置和框架的区别。",
      documentIds: [doc.id],
    }),
    context = await prepareFeedbackContext(task, course, [doc], original);
  const a = await repo.submit(task.id, original);
  const raw = feedbackOutput(JSON.parse(feedbackMessages(context)[1].content));
  Object.assign(raw.gaps[0], {
    gapKind: "concept_misconception",
    learningGoal: "作用边界",
    userAnswerQuote: original,
  });
  const payload = await generateFeedback(
    context,
    { request: async () => JSON.stringify(raw) },
    "f",
  );
  await repo.begin(a.id, "r");
  await repo.commit(a.id, "r", context, payload);
  const gap = (await repo.list("learningGaps"))[0];
  return { db, repo, doc, course, task, context, a, gap, payload };
}
async function challenged() {
  const s = await setup();
  await s.repo.revise(
    s.a.id,
    "议程设置涉及议题关注，而框架涉及解释角度，不能直接推断态度。",
    "区分两种作用。",
  );
  s.a = await s.repo.get("attempts", s.a.id);
  const raw = loopOutput(
    JSON.parse(
      challengeMessages(s.context, s.gap, s.a, s.payload.feedback)[1].content,
    ),
  );
  const c = validateChallenge(raw, s.context, s.gap);
  await s.repo.beginGap(s.gap.id, "c");
  s.challenge = await s.repo.commitChallenge(s.gap.id, "c", s.context, c);
  return s;
}
async function retestSetup() {
  const s = await challenged();
  s.answer =
    "报道频率影响议题关注，解释角度体现框架，未调查读者就不能推断立场。";
  s.second = await s.repo.submit(s.challenge.id, s.answer);
  s.secondContext = await prepareFeedbackContext(
    s.challenge,
    s.course,
    [s.doc],
    s.answer,
  );
  return s;
}
test("LearningGap derives 1–3 traceable observations and persists original answer", async () => {
  const s = await setup();
  assert.equal(s.gap.attemptId, s.a.id);
  assert.equal(s.gap.feedbackId, "f");
  assert.equal(s.gap.status, "observed");
  assert.equal(s.gap.userAnswerExcerpt, original);
  assert.ok(s.gap.evidenceRefs.length);
  assert.equal((await s.repo.get("attempts", s.a.id)).userAnswer, original);
  s.db.close();
});
test("Gap extraction rejects forged answer excerpt, internal field prose, and style-only advice", async () => {
  const s = await setup(),
    f = structuredClone(s.payload.feedback);
  for (const change of [
    { userAnswerQuote: "forged" },
    { explanation: "answerChecks sourceRevision" },
    { gapKind: null, type: "标点和文风" },
  ]) {
    Object.assign(f.gaps[0], s.payload.feedback.gaps[0], change);
    assert.equal(deriveGaps(s.a, f, s.payload.anchors).length, 0);
  }
  s.db.close();
});
test("Unsupported material produces inconclusive observation, not proven misconception", async () => {
  const s = await setup();
  const gaps = deriveGaps(s.a, s.payload.feedback, []);
  assert.equal(gaps[0].status, "inconclusive");
  assert.deepEqual(gaps[0].evidenceRefs, []);
  s.db.close();
});
test("Feedback deterministic duplicate merge keeps evidence and prioritizes substantive gaps", async () => {
  const s = await setup(),
    item = s.payload.feedback.gaps[0];
  const result = prioritizeFeedback([
    {
      ...item,
      type: "style",
      gapKind: null,
      explanation: "Use fewer commas",
      evidenceIds: [],
    },
    item,
    { ...item, evidenceIds: ["extra"] },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].mergedCount, 2);
  assert.ok(result[0].evidenceIds.includes("extra"));
  s.db.close();
});
test("Re-running feedback does not duplicate the same observed gap", async () => {
  const s = await setup();
  await s.repo.begin(s.a.id, "again");
  await s.repo.commit(s.a.id, "again", s.context, s.payload);
  assert.equal((await s.repo.list("learningGaps")).length, 1);
  s.db.close();
});
test("Gap dismissal and later-recheck survive repository reload", async () => {
  const s = await setup();
  await s.repo.deferGap(s.gap.id);
  assert.ok(
    (await new LoopRepository(s.db).get("learningGaps", s.gap.id)).deferredAt,
  );
  await s.repo.dismissGap(s.gap.id);
  assert.ok((await s.repo.get("learningGaps", s.gap.id)).dismissedAt);
  await assert.rejects(s.repo.beginGap(s.gap.id, "x"));
  s.db.close();
});
test("Revision diff reconstructs exact original and revision, including Unicode and long answers", () => {
  for (const [a, b] of [
    ["初次😀回答", "修订😀回答"],
    ["abc", "abc"],
    ["", "new"],
    ["old", ""],
    ["a".repeat(16000), "a".repeat(7000) + "change" + "a".repeat(6000)],
  ]) {
    const parts = revisionDiff(a, b);
    assert.equal(
      parts
        .filter((p) => p.type !== "added")
        .map((p) => p.text)
        .join(""),
      a,
    );
    assert.equal(
      parts
        .filter((p) => p.type !== "removed")
        .map((p) => p.text)
        .join(""),
      b,
    );
  }
});
test("Challenge requires revision, targets a real gap, persists as Task without changing original", async () => {
  const s = await challenged();
  assert.equal(s.challenge.targetGapId, s.gap.id);
  assert.ok(s.challenge.challenge.rationale);
  assert.equal((await s.repo.get("attempts", s.a.id)).userAnswer, original);
  assert.equal(
    (await s.repo.get("learningGaps", s.gap.id)).status,
    "retesting",
  );
  await assert.rejects(s.repo.saveTask({ ...s.challenge, prompt: "changed" }));
  s.db.close();
});
test("Challenge validator rejects repeated question, repeated surface case and outside documents", async () => {
  const s = await challenged(),
    raw = s.challenge.challenge;
  for (const c of [
    { ...raw, prompt: s.context.task.prompt },
    { ...raw, newContext: raw.originalContext },
    { ...raw, documentIds: ["outside"] },
  ])
    assert.throws(() => validateChallenge(c, s.context, s.gap));
  s.db.close();
});
test("Challenge failure and cancellation preserve gap and original revision", async () => {
  const s = await challenged();
  await assert.rejects(
    generateChallenge(s.context, s.gap, s.a, s.payload.feedback, {
      request: async () => {
        throw Error("network");
      },
    }),
  );
  const ctrl = new AbortController();
  await assert.rejects(
    generateChallenge(
      s.context,
      s.gap,
      s.a,
      s.payload.feedback,
      {
        request: async () => {
          ctrl.abort();
          return JSON.stringify(s.challenge.challenge);
        },
      },
      ctrl.signal,
    ),
  );
  assert.equal((await s.repo.list("tasks")).length, 2);
  s.db.close();
});
test("Old, cancelled or source-changed challenge requests cannot write", async () => {
  const s = await challenged();
  await s.repo.beginGap(s.gap.id, "old");
  await s.repo.beginGap(s.gap.id, "new");
  await assert.rejects(
    s.repo.commitChallenge(s.gap.id, "old", s.context, s.challenge.challenge),
  );
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(
    s.repo.commitChallenge(
      s.gap.id,
      "new",
      s.context,
      s.challenge.challenge,
      ctrl.signal,
    ),
  );
  await saveDocument({ ...s.doc, rawContent: "changed" }, s.db);
  await assert.rejects(
    s.repo.commitChallenge(s.gap.id, "new", s.context, s.challenge.challenge),
  );
  assert.equal((await s.repo.list("tasks")).length, 2);
  s.db.close();
});
for (const outcome of ["resolved_once", "still_present", "inconclusive"])
  test(
    "Retest " +
      outcome +
      " persists reason, evidence, history and immutable second answer",
    async () => {
      const s = await retestSetup(),
        raw = loopOutput(
          JSON.parse(
            retestMessages(s.secondContext, s.gap, s.challenge.challenge)[1]
              .content,
          ),
        );
      raw.outcome = outcome;
      const result = validateRetest(raw, s.secondContext, "r");
      await s.repo.beginRetest(s.second.id, "r");
      const r = await s.repo.commitRetest(
        s.second.id,
        "r",
        s.secondContext,
        result,
      );
      assert.equal(r.outcome, outcome);
      assert.equal(
        (await s.repo.get("learningGaps", s.gap.id)).status,
        outcome,
      );
      assert.equal(
        (await s.repo.get("attempts", s.second.id)).userAnswer,
        s.answer,
      );
      assert.ok(
        (await s.repo.get("learningGaps", s.gap.id)).retestHistory.includes(
          r.id,
        ),
      );
      s.db.close();
    },
  );
test("Retest forces inconclusive for bad quote, weak task, missing material or invalid evidence", async () => {
  const s = await retestSetup(),
    raw = loopOutput(
      JSON.parse(
        retestMessages(s.secondContext, s.gap, s.challenge.challenge)[1]
          .content,
      ),
    );
  for (const patch of [
    { userAnswerQuote: "invented" },
    { challengeAdequate: false },
    { materialSufficient: false },
    { evidenceCandidates: [] },
    {
      evidenceCandidates: [
        { documentId: s.doc.id, paragraphIndex: 0, quoteId: "wrong" },
      ],
    },
  ])
    assert.equal(
      validateRetest({ ...raw, ...patch }, s.secondContext, "r").outcome,
      "inconclusive",
    );
  s.db.close();
});
test("Retest failure, ignored cancellation and stale requests do not overwrite results", async () => {
  const s = await retestSetup();
  await assert.rejects(
    generateRetest(
      s.secondContext,
      s.gap,
      s.challenge.challenge,
      {
        request: async () => {
          throw Error("network");
        },
      },
      "r",
    ),
  );
  const ctrl = new AbortController(),
    raw = loopOutput(
      JSON.parse(
        retestMessages(s.secondContext, s.gap, s.challenge.challenge)[1]
          .content,
      ),
    );
  await assert.rejects(
    generateRetest(
      s.secondContext,
      s.gap,
      s.challenge.challenge,
      {
        request: async () => {
          ctrl.abort();
          return JSON.stringify(raw);
        },
      },
      "r",
      ctrl.signal,
    ),
  );
  await s.repo.beginRetest(s.second.id, "old");
  await s.repo.beginRetest(s.second.id, "new");
  await assert.rejects(
    s.repo.commitRetest(
      s.second.id,
      "old",
      s.secondContext,
      validateRetest(raw, s.secondContext, "r"),
    ),
  );
  assert.equal((await s.repo.list("retests")).length, 0);
  assert.equal(
    (await s.repo.get("attempts", s.second.id)).userAnswer,
    s.answer,
  );
  s.db.close();
});
test("Current backup roundtrip includes gaps, challenges and retests; corrupt foreign keys reject atomically", async () => {
  const s = await retestSetup(),
    raw = loopOutput(
      JSON.parse(
        retestMessages(s.secondContext, s.gap, s.challenge.challenge)[1]
          .content,
      ),
    );
  await s.repo.beginRetest(s.second.id, "r");
  await s.repo.commitRetest(
    s.second.id,
    "r",
    s.secondContext,
    validateRetest(raw, s.secondContext, "r"),
  );
  const backup = await exportBackup(s.db),
    target = await openDatabase(new IDBFactory());
  assert.equal(backup.version, 3);
  await restoreBackup(target, backup);
  assert.equal((await new LoopRepository(target).list("retests")).length, 1);
  assert.deepEqual(
    (await exportBackup(target)).stores.learningGaps,
    backup.stores.learningGaps,
  );
  const bad = structuredClone(backup);
  bad.stores.retests[0].gapId = "broken";
  const empty = await openDatabase(new IDBFactory());
  await assert.rejects(restoreBackup(empty, bad));
  assert.equal((await new LoopRepository(empty).list("documents")).length, 0);
  s.db.close();
  target.close();
  empty.close();
});
test("v2 backup restores into current DB with empty new stores", async () => {
  const s = await setup(),
    backup = await exportBackup(s.db);
  backup.version = 2;
  delete backup.stores.learningGaps;
  delete backup.stores.retests;
  const target = await openDatabase(new IDBFactory());
  await restoreBackup(target, backup);
  assert.equal(
    (await new LoopRepository(target).list("learningGaps")).length,
    0,
  );
  assert.equal((await new LoopRepository(target).list("attempts")).length, 1);
  s.db.close();
  target.close();
});
test("Physical v2 upgrade preserves every old store and record", async () => {
  const factory = new IDBFactory();
  await new Promise((resolve, reject) => {
    const r = factory.open(DB_NAME, 2);
    r.onupgradeneeded = () => {
      for (const name of Object.values(STORES).filter(
        (n) => !["learningGaps", "retests"].includes(n),
      ))
        r.result.createObjectStore(name, { keyPath: "id" });
      r.transaction
        .objectStore("settings")
        .put({ id: "untouched", value: "retained" });
    };
    r.onsuccess = () => {
      r.result.close();
      resolve();
    };
    r.onerror = reject;
  });
  const db = await openDatabase(factory);
  assert.equal(db.version, 3);
  assert.equal(
    (await new LoopRepository(db).get("settings", "untouched")).value,
    "retained",
  );
  db.close();
});
test("Deleting course removes learning loop records but preserves source documents", async () => {
  const s = await retestSetup();
  await s.repo.removeCourse(s.course.id);
  for (const name of ["learningGaps", "retests", "tasks", "attempts"])
    assert.equal((await s.repo.list(name)).length, 0);
  assert.equal((await s.repo.list("documents")).length, 1);
  s.db.close();
});
async function largeContext() {
  const doc = createDocument({
    rawContent: Array.from({ length: 24 }, (_, i) =>
      i === 23
        ? "Agenda setting concerns issue salience; framing concerns interpretation. " +
          "discussion context ".repeat(150)
        : "Background " + i + " " + "ordinary context ".repeat(170),
    ).join("\n\n"),
  });
  return prepareFeedbackContext(
    { documentIds: [doc.id], prompt: "议程设置和框架如何区分？" },
    { id: "c" },
    [doc],
    "我认为二者作用相同。",
  );
}
test("Cross-language rescue retrieves source-language terms from a late relevant section", async () => {
  const c = await largeContext();
  const r = await rescueRetrieval(c, {
    request: async () =>
      JSON.stringify({ terms: ["agenda setting", "framing"] }),
  });
  assert.equal(r.retrieval.scope.method, "lexical-rescue-v1");
  assert.ok(
    r.retrieval.documents[0].paragraphs.some((p) => p.paragraphIndex === 23),
  );
  assert.ok(r.retrieval.scope.selectedCharacters <= 24000);
  assert.equal(c.snapshots[0].source, r.snapshots[0].source);
});
test("Rescue errors, malformed terms and unhelpful expansion fall back to original retrieval", async () => {
  const c = await largeContext();
  for (const raw of ["not-json", '{"terms":["unicorn"]}', '{"terms":[]}'])
    assert.equal(await rescueRetrieval(c, { request: async () => raw }), c);
  assert.equal(
    await rescueRetrieval(c, {
      request: async () => {
        throw Error("network");
      },
    }),
    c,
  );
});
test("Retest cannot commit after source changes or gap dismissal", async () => {
  for (const change of ["source", "dismiss"]) {
    const s = await retestSetup(),
      raw = loopOutput(
        JSON.parse(
          retestMessages(s.secondContext, s.gap, s.challenge.challenge)[1]
            .content,
        ),
      );
    await s.repo.beginRetest(s.second.id, "r");
    if (change === "source")
      await saveDocument({ ...s.doc, rawContent: "changed source" }, s.db);
    else await s.repo.dismissGap(s.gap.id);
    await assert.rejects(
      s.repo.commitRetest(
        s.second.id,
        "r",
        s.secondContext,
        validateRetest(raw, s.secondContext, "r"),
      ),
    );
    assert.equal((await s.repo.list("retests")).length, 0);
    s.db.close();
  }
});
test("Backup rejects a fabricated successful gap with no retest history", async () => {
  const s = await setup(),
    backup = await exportBackup(s.db),
    target = await openDatabase(new IDBFactory());
  backup.stores.learningGaps[0].status = "resolved_once";
  await assert.rejects(restoreBackup(target, backup));
  assert.equal((await new LoopRepository(target).list("documents")).length, 0);
  target.close();
  s.db.close();
});
test("Suggested tasks are limited, scoped, deduplicated and cancellable", async () => {
  const s = await setup(),
    transport = {
      request: async (m) =>
        JSON.stringify(loopOutput(JSON.parse(m[1].content))),
    };
  const tasks = await suggestTasks(s.context, transport);
  assert.equal(tasks.length, 3);
  await assert.rejects(
    suggestTasks(s.context, {
      request: async () =>
        JSON.stringify({ tasks: [{ ...tasks[0], documentIds: ["outside"] }] }),
    }),
  );
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(suggestTasks(s.context, transport, ctrl.signal));
  assert.equal((await s.repo.list("tasks")).length, 1);
  s.db.close();
});
test("Retrieval cancellation propagates, never falls back to commit a cancelled request", async () => {
  const c = await largeContext(),
    ctrl = new AbortController();
  await assert.rejects(
    rescueRetrieval(
      c,
      {
        request: async () => {
          ctrl.abort();
          throw new DOMException("cancel", "AbortError");
        },
      },
      ctrl.signal,
    ),
  );
});
