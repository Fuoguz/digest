import { SUPPORT } from "../domain/training.js";
export function validateTrainingBackup(data, fail) {
  const text = (v) => typeof v === "string",
    date = (v) => text(v) && Number.isFinite(Date.parse(v));
  const ids = (v, source) =>
    Array.isArray(v) &&
    v.every((id) => text(id) && source.some((r) => r.id === id)) &&
    new Set(v).size === v.length;
  for (const c of data.courses)
    if (
      !text(c.title) ||
      !c.title.trim() ||
      !text(c.description) ||
      !date(c.createdAt) ||
      !date(c.updatedAt) ||
      !ids(c.documentIds, data.documents) ||
      !ids(c.taskIds, data.tasks)
    )
      fail();
  for (const t of data.tasks) {
    const c = data.courses.find((c) => c.id === t.courseId);
    if (
      !c ||
      !c.taskIds.includes(t.id) ||
      !text(t.title) ||
      !text(t.prompt) ||
      !t.prompt.trim() ||
      !text(t.rubric) ||
      !text(t.draftAnswer) ||
      !Number.isInteger(t.version) ||
      !date(t.createdAt) ||
      !date(t.updatedAt) ||
      !ids(t.documentIds, data.documents)
    )
      fail();
  }
  for (const c of data.courses)
    if (
      c.taskIds.some(
        (id) => !data.tasks.some((t) => t.id === id && t.courseId === c.id),
      )
    )
      fail();
  for (const a of data.attempts) {
    const t = data.tasks.find((t) => t.id === a.taskId);
    if (
      !t ||
      t.courseId !== a.courseId ||
      !text(a.userAnswer) ||
      !a.userAnswer.trim() ||
      !date(a.submittedAt) ||
      !["submitted", "reviewed", "completed"].includes(a.status) ||
      !Array.isArray(a.revision) ||
      !a.taskSnapshot ||
      a.taskSnapshot.id !== t.id ||
      !text(a.taskSnapshot.prompt) ||
      !text(a.taskSnapshot.title) ||
      !text(a.taskSnapshot.rubric) ||
      !Number.isInteger(a.taskSnapshot.version) ||
      !ids(a.taskSnapshot.documentIds, data.documents)
    )
      fail();
    if (
      a.feedbackId &&
      !data.feedback.some((f) => f.id === a.feedbackId && f.attemptId === a.id)
    )
      fail();
    if (
      (a.status === "completed") !== a.revision.length > 0 ||
      (a.status !== "submitted" && !a.feedbackId)
    )
      fail();
    for (const r of a.revision)
      if (
        !text(r.id) ||
        !text(r.userAnswer) ||
        !text(r.reflection) ||
        !date(r.createdAt) ||
        !data.feedback.some(
          (f) => f.id === r.feedbackId && f.attemptId === a.id,
        )
      )
        fail();
    a.activeRequestId = null;
  }
  for (const f of data.feedback) {
    if (
      !data.attempts.some((a) => a.id === f.attemptId) ||
      !text(f.overall) ||
      !text(f.suggestedNextStep) ||
      !date(f.createdAt) ||
      !f.modelInfo ||
      !text(f.modelInfo.version) ||
      !Array.isArray(f.sourceRevisions) ||
      !ids(f.evidenceRefs, data.evidenceAnchors)
    )
      fail();
    for (const r of f.sourceRevisions)
      if (
        !data.documents.some((d) => d.id === r.documentId) ||
        !text(r.sourceRevision)
      )
        fail();
    for (const key of ["strengths", "gaps"]) {
      if (!Array.isArray(f[key]) || f[key].length > 12) fail();
      for (const i of f[key])
        if (
          !i ||
          !text(i.type) ||
          !text(i.explanation) ||
          !text(i.suggestedAction) ||
          !SUPPORT.includes(i.support) ||
          !(i.userAnswerQuote === null || text(i.userAnswerQuote)) ||
          !ids(i.evidenceIds, data.evidenceAnchors) ||
          i.evidenceIds.some((id) => !f.evidenceRefs.includes(id))
        )
          fail();
      const answer = data.attempts.find((a) => a.id === f.attemptId).userAnswer;
      for (const i of f[key]) {
        i.answerQuoteVerified =
          !!i.userAnswerQuote && answer.includes(i.userAnswerQuote);
        if (!i.answerQuoteVerified) i.userAnswerQuote = null;
        if (
          !i.evidenceIds.some((id) =>
            data.evidenceAnchors.some(
              (a) => a.id === id && a.validationStatus === "matched",
            ),
          )
        )
          i.support = "no_evidence";
      }
    }
    for (const eid of f.evidenceRefs) {
      const anchor = data.evidenceAnchors.find((a) => a.id === eid);
      if (
        !f.sourceRevisions.some(
          (r) =>
            r.documentId === anchor.documentId &&
            r.sourceRevision === anchor.sourceRevision,
        )
      )
        fail();
    }
  }
}
