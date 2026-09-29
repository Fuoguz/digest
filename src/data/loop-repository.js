import { TrainingRepository, event } from "./training-repository.js";
import { atomic } from "./learning-repository.js";
import { makeId } from "../domain/documents.js";
import { sourceSignature } from "../domain/evidence.js";
const now = () => new Date().toISOString();
function sources(data, context) {
  for (const s of context.snapshots) {
    const d = data.documents.find((d) => d.id === s.documentId);
    if (!d || sourceSignature(d) !== s.signature)
      throw Error("课程材料版本已变化，请重新打开任务。 / Source changed.");
  }
}
export class LoopRepository extends TrainingRepository {
  completeUnchanged(id) {
    return atomic(
      this.db,
      ["attempts", "feedback", "activities"],
      (data, tx) => {
        const a = data.attempts.find((a) => a.id === id),
          f = data.feedback.find((f) => f.id === a?.feedbackId);
        if (
          !a ||
          a.activeRequestId ||
          !f ||
          f.gaps.length ||
          a.revision.length ||
          a.taskSnapshot.targetGapId
        )
          throw Error(
            "当前反馈仍需核查或修订。 / Review the current feedback first.",
          );
        const record = {
          ...a,
          status: "completed",
          completedWithoutRevision: true,
        };
        tx.objectStore("attempts").put(record);
        if (!a.completedWithoutRevision)
          event(tx, "task_completed", {
            attemptId: id,
            taskId: a.taskId,
            activationCandidate: false,
          });
        return record;
      },
    );
  }
  dismissGap(id) {
    return atomic(this.db, ["learningGaps", "activities"], (data, tx) => {
      const g = data.learningGaps.find((g) => g.id === id);
      if (!g) return;
      tx.objectStore("learningGaps").put({
        ...g,
        dismissedAt: now(),
        activeRequestId: null,
        updatedAt: now(),
      });
      event(tx, "learning_gap_dismissed", { gapId: id, courseId: g.courseId });
    });
  }
  deferGap(id) {
    return atomic(this.db, ["learningGaps"], (data, tx) => {
      const g = data.learningGaps.find((g) => g.id === id);
      if (!g || g.dismissedAt) return;
      tx.objectStore("learningGaps").put({
        ...g,
        deferredAt: now(),
        updatedAt: now(),
      });
    });
  }
  beginGap(id, requestId) {
    return atomic(this.db, ["learningGaps"], (data, tx) => {
      const g = data.learningGaps.find((g) => g.id === id);
      if (!g || g.dismissedAt)
        throw Error("问题已被忽略或不存在。 / Gap unavailable.");
      tx.objectStore("learningGaps").put({ ...g, activeRequestId: requestId });
    });
  }
  cancelGap(id, requestId) {
    return atomic(this.db, ["learningGaps"], (data, tx) => {
      const g = data.learningGaps.find((g) => g.id === id);
      if (g?.activeRequestId === requestId)
        tx.objectStore("learningGaps").put({ ...g, activeRequestId: null });
    });
  }
  commitChallenge(id, requestId, context, challenge, signal) {
    return atomic(
      this.db,
      [
        "learningGaps",
        "tasks",
        "attempts",
        "courses",
        "documents",
        "activities",
      ],
      (data, tx) => {
        signal?.throwIfAborted();
        const g = data.learningGaps.find((g) => g.id === id),
          old = data.tasks.find((t) => t.id === g?.taskId),
          a = data.attempts.find((a) => a.id === g?.attemptId),
          c = data.courses.find((c) => c.id === g?.courseId);
        if (
          !g ||
          g.dismissedAt ||
          g.activeRequestId !== requestId ||
          !old ||
          old.id !== context.task.id ||
          old.version !== context.task.version ||
          !a?.revision.length ||
          a.userAnswer !== context.answer ||
          !c ||
          challenge.targetGapId !== g.id
        )
          throw Error(
            "学习记录已变化，新题未保存。 / Learning record changed.",
          );
        sources(data, context);
        // Resuming an unfinished challenge does not generate duplicate tasks.
        const existing = data.tasks.find(
          (t) =>
            t.targetGapId === id &&
            !data.attempts.some((a) => a.taskId === t.id && a.retestId),
        );
        if (existing) {
          tx.objectStore("learningGaps").put({ ...g, activeRequestId: null });
          return existing;
        }
        const task = {
          id: makeId("task"),
          courseId: g.courseId,
          title: challenge.title,
          prompt: challenge.scenario + "\n\n" + challenge.prompt,
          description: "",
          rubric: "",
          documentIds: [...new Set(challenge.documentIds)],
          createdAt: now(),
          updatedAt: now(),
          version: 1,
          draftAnswer: "",
          targetGapId: id,
          challenge: structuredClone(challenge),
        };
        tx.objectStore("tasks").put(task);
        tx.objectStore("courses").put({
          ...c,
          taskIds: [...c.taskIds, task.id],
          updatedAt: now(),
        });
        tx.objectStore("learningGaps").put({
          ...g,
          status: "retesting",
          activeRequestId: null,
          deferredAt: null,
          updatedAt: now(),
        });
        event(tx, "challenge_generated", {
          gapId: id,
          taskId: task.id,
          courseId: g.courseId,
        });
        return task;
      },
      signal,
    );
  }
  beginRetest(attemptId, requestId) {
    return atomic(
      this.db,
      ["attempts", "learningGaps", "activities"],
      (data, tx) => {
        const a = data.attempts.find((a) => a.id === attemptId),
          g = data.learningGaps.find(
            (g) => g.id === a?.taskSnapshot.targetGapId,
          );
        if (!a || !g || g.dismissedAt)
          throw Error("问题已被忽略或不存在。 / Gap unavailable.");
        tx.objectStore("attempts").put({ ...a, activeRequestId: requestId });
        tx.objectStore("learningGaps").put({
          ...g,
          activeRequestId: requestId,
        });
        event(tx, "retest_started", { attemptId, gapId: g.id });
      },
    );
  }
  commitRetest(attemptId, requestId, context, result, signal) {
    return atomic(
      this.db,
      [
        "attempts",
        "tasks",
        "learningGaps",
        "retests",
        "feedback",
        "evidenceAnchors",
        "documents",
        "activities",
      ],
      (data, tx) => {
        signal?.throwIfAborted();
        const a = data.attempts.find((a) => a.id === attemptId),
          task = data.tasks.find((t) => t.id === a?.taskId),
          g = data.learningGaps.find((g) => g.id === task?.targetGapId);
        if (
          !a ||
          a.activeRequestId !== requestId ||
          !task ||
          task.id !== context.task.id ||
          task.version !== context.task.version ||
          a.userAnswer !== context.answer ||
          !g ||
          g.dismissedAt ||
          g.activeRequestId !== requestId
        )
          throw Error("再测请求已变化，原记录保留。 / Retest changed.");
        sources(data, context);
        const id = makeId("retest"),
          fId = makeId("feedback"),
          createdAt = now();
        const record = {
          id,
          gapId: g.id,
          courseId: g.courseId,
          taskId: task.id,
          attemptId,
          feedbackId: fId,
          outcome: result.outcome,
          reason: result.reason,
          nextStep: result.nextStep,
          userAnswerQuote: result.userAnswerQuote,
          evidenceRefs: result.anchors.map((a) => a.id),
          verificationLimited: result.verificationLimited,
          createdAt,
          sourceRevisions: context.snapshots.map((s) => ({
            documentId: s.documentId,
            sourceRevision: s.sourceRevision,
          })),
          modelInfo: { version: "targeted-retest-v1" },
        };
        if (
          !["resolved_once", "still_present", "inconclusive"].includes(
            record.outcome,
          )
        )
          throw Error("Invalid outcome");
        for (const anchor of result.anchors)
          tx.objectStore("evidenceAnchors").put(anchor);
        tx.objectStore("retests").put(record);
        tx.objectStore("feedback").put({
          id: fId,
          attemptId,
          overall: record.reason,
          summary: record.reason,
          strengths: [],
          gaps: [],
          suggestedNextStep: record.nextStep,
          evidenceRefs: record.evidenceRefs,
          sourceRevisions: record.sourceRevisions,
          createdAt,
          modelInfo: record.modelInfo,
          outputLanguage: context.outputLanguage || "zh-CN",
        });
        tx.objectStore("attempts").put({
          ...a,
          status: "reviewed",
          activeRequestId: null,
          feedbackId: fId,
          retestId: id,
        });
        tx.objectStore("learningGaps").put({
          ...g,
          status: record.outcome,
          activeRequestId: null,
          retestHistory: [...g.retestHistory, id],
          updatedAt: createdAt,
        });
        for (const type of [
          "retest_submitted",
          "retest_" + record.outcome,
          "challenge_completed",
        ])
          event(tx, type, {
            gapId: g.id,
            taskId: task.id,
            attemptId,
            retestId: id,
          });
        return record;
      },
      signal,
    );
  }
}
