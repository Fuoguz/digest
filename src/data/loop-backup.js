import { GAP_STATES, GAP_KINDS } from "../domain/gaps.js";
export function validateLoopBackup(data, fail) {
  const text = (v) => typeof v === "string" && !!v.trim(),
    date = (v) => text(v) && Number.isFinite(Date.parse(v));
  const ref = (store, id) => data[store].find((r) => r.id === id);
  const ids = (list, store) =>
    Array.isArray(list) &&
    new Set(list).size === list.length &&
    list.every((id) => ref(store, id));
  for (const g of data.learningGaps) {
    const a = ref("attempts", g.attemptId),
      f = ref("feedback", g.feedbackId),
      task = ref("tasks", g.taskId);
    if (
      !a ||
      !f ||
      !task ||
      !ref("courses", g.courseId) ||
      a.taskId !== task.id ||
      a.courseId !== g.courseId ||
      f.attemptId !== a.id ||
      !GAP_STATES.includes(g.status) ||
      !GAP_KINDS.includes(g.kind) ||
      !text(g.title) ||
      !text(g.description) ||
      !text(g.suggestedAction) ||
      !date(g.createdAt) ||
      !date(g.updatedAt) ||
      !(
        g.userAnswerExcerpt === null ||
        (text(g.userAnswerExcerpt) &&
          a.userAnswer.includes(g.userAnswerExcerpt))
      ) ||
      !ids(g.evidenceRefs, "evidenceAnchors") ||
      g.evidenceRefs.some((id) => !f.evidenceRefs.includes(id)) ||
      !ids(g.retestHistory, "retests") ||
      !(g.dismissedAt === null || date(g.dismissedAt)) ||
      !(g.deferredAt === null || date(g.deferredAt))
    )
      fail();
    if (
      !Number.isInteger(g.feedbackItemIndex) ||
      !f.gaps[g.feedbackItemIndex] ||
      f.gaps[g.feedbackItemIndex].explanation !== g.description
    )
      fail();
    if (g.retestHistory.some((id) => ref("retests", id).gapId !== g.id)) fail();
    if (
      ["resolved_once", "still_present"].includes(g.status) &&
      !g.retestHistory.length
    )
      fail();
    if (
      g.retestHistory.length &&
      ["resolved_once", "still_present"].includes(g.status) &&
      ref("retests", g.retestHistory.at(-1)).outcome !== g.status
    )
      fail();
    if (
      g.evidenceRefs.some(
        (id) => ref("evidenceAnchors", id).validationStatus !== "matched",
      )
    )
      g.status = "inconclusive";
    g.activeRequestId = null;
  }
  for (const task of data.tasks)
    if (task.targetGapId) {
      const g = ref("learningGaps", task.targetGapId),
        c = task.challenge;
      if (
        !g ||
        g.courseId !== task.courseId ||
        !c ||
        c.targetGapId !== g.id ||
        !text(c.rationale) ||
        !text(c.scenario) ||
        !text(c.prompt) ||
        !text(c.originalContext) ||
        !text(c.newContext) ||
        !ids(c.documentIds, "documents")
      )
        fail();
    }
  for (const r of data.retests) {
    const g = ref("learningGaps", r.gapId),
      a = ref("attempts", r.attemptId),
      task = ref("tasks", r.taskId),
      f = ref("feedback", r.feedbackId);
    if (
      !g ||
      !a ||
      !task ||
      !f ||
      !g.retestHistory.includes(r.id) ||
      a.taskId !== task.id ||
      a.courseId !== r.courseId ||
      g.courseId !== r.courseId ||
      task.targetGapId !== g.id ||
      f.attemptId !== a.id ||
      !["resolved_once", "still_present", "inconclusive"].includes(r.outcome) ||
      !text(r.reason) ||
      !text(r.nextStep) ||
      !date(r.createdAt) ||
      !ids(r.evidenceRefs, "evidenceAnchors") ||
      r.evidenceRefs.some((id) => !f.evidenceRefs.includes(id)) ||
      !(
        r.userAnswerQuote === null ||
        (text(r.userAnswerQuote) && a.userAnswer.includes(r.userAnswerQuote))
      )
    )
      fail();
    if (
      r.outcome !== "inconclusive" &&
      (!r.userAnswerQuote ||
        !r.evidenceRefs.some(
          (id) => ref("evidenceAnchors", id).validationStatus === "matched",
        ))
    ) {
      r.outcome = "inconclusive";
      r.verificationLimited = true;
      if (g.retestHistory.at(-1) === r.id) g.status = "inconclusive";
    }
  }
  for (const a of data.attempts)
    if (
      a.retestId &&
      !data.retests.some((r) => r.id === a.retestId && r.attemptId === a.id)
    )
      fail();
}
