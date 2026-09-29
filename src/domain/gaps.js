// Deterministic selection: model feedback remains an observation, never a mastery score.
export const GAP_STATES = [
  "observed",
  "retesting",
  "resolved_once",
  "still_present",
  "inconclusive",
];
export const GAP_KINDS = [
  "concept_misconception",
  "boundary_confusion",
  "missing_condition",
  "important_omission",
  "unsupported_inference",
  "incorrect_application",
  "reasoning_error",
  "evidence_misuse",
];
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\s]/gu, "");
export function similarity(a, b) {
  const grams = (s) =>
    new Set(
      Array.from({ length: Math.max(0, s.length - 1) }, (_, i) =>
        s.slice(i, i + 2),
      ),
    );
  const x = grams(norm(a)),
    y = grams(norm(b));
  return !x.size || !y.size
    ? Number(norm(a) === norm(b))
    : [...x].filter((v) => y.has(v)).length / Math.max(x.size, y.size);
}
export function gapKind(item) {
  if (GAP_KINDS.includes(item.gapKind)) return item.gapKind;
  const value = item.type || "";
  return (
    [
      ["concept_misconception", /概念|混淆|混用|misconcept|conceptual/i],
      ["boundary_confusion", /边界|boundary/i],
      ["missing_condition", /条件|condition/i],
      ["important_omission", /缺失|遗漏|omission|missing/i],
      [
        "unsupported_inference",
        /无依据|证据不足|unsupported|insufficient evidence/i,
      ],
      ["incorrect_application", /适用|应用|application/i],
      ["reasoning_error", /推理|跳跃|reasoning/i],
      ["evidence_misuse", /证据误用|evidence misuse/i],
    ].find(([, rx]) => rx.test(value))?.[0] || null
  );
}
export function prioritizeFeedback(items) {
  const result = [];
  for (const original of items) {
    const item = structuredClone(original);
    const duplicate = result.find(
      (old) =>
        norm(old.explanation) === norm(item.explanation) ||
        (gapKind(old) &&
          gapKind(old) === gapKind(item) &&
          item.userAnswerQuote &&
          norm(old.userAnswerQuote) === norm(item.userAnswerQuote) &&
          similarity(old.suggestedAction, item.suggestedAction) > 0.55) ||
        similarity(old.explanation, item.explanation) > 0.78,
    );
    if (duplicate) {
      duplicate.evidenceIds = [
        ...new Set([...duplicate.evidenceIds, ...item.evidenceIds]),
      ];
      duplicate.mergedCount = (duplicate.mergedCount || 1) + 1;
    } else result.push(item);
  }
  return result.sort((a, b) => score(b) - score(a));
}
function score(i) {
  return (
    Number(!!gapKind(i)) * 4 +
    Number(i.answerQuoteVerified) * 2 +
    Number(i.support === "supported") +
    Number(i.evidenceIds?.length > 0)
  );
}
export function deriveGaps(attempt, feedback, anchors) {
  return prioritizeFeedback(feedback.gaps)
    .flatMap((item, index) => {
      const kind = gapKind(item);
      if (
        item.answerQuoteInvalid ||
        !kind ||
        !item.explanation?.trim() ||
        /answerChecks|evidenceCandidates|userAnswerQuote|targetGapId|sourceRevision|outputShape/.test(
          item.explanation,
        )
      )
        return [];
      if (
        item.userAnswerQuote &&
        !attempt.userAnswer.includes(item.userAnswerQuote)
      )
        return [];
      if (!item.userAnswerQuote && kind !== "important_omission") return [];
      // Ambiguous advice about a fragment also praised as correct is not a durable deficit.
      if (
        kind === "important_omission" &&
        item.userAnswerQuote &&
        feedback.strengths.some(
          (s) =>
            s.userAnswerQuote &&
            norm(s.userAnswerQuote) === norm(item.userAnswerQuote),
        )
      )
        return [];
      const evidenceRefs = item.evidenceIds.filter((id) =>
        anchors.some((a) => a.id === id && a.validationStatus === "matched"),
      );
      const supported =
        evidenceRefs.length &&
        ["supported", "partially_supported"].includes(item.support);
      return [
        {
          id: "gap-" + feedback.id + "-" + index,
          courseId: attempt.courseId,
          taskId: attempt.taskId,
          attemptId: attempt.id,
          feedbackId: feedback.id,
          feedbackItemIndex: feedback.gaps.findIndex(
            (g) => g.explanation === item.explanation,
          ),
          kind,
          title: item.learningGoal || item.type,
          description: item.explanation,
          suggestedAction: item.suggestedAction,
          userAnswerExcerpt: item.userAnswerQuote || null,
          observationBasis: item.userAnswerQuote
            ? "answer_excerpt"
            : "omission_in_answer",
          evidenceRefs,
          status: supported ? "observed" : "inconclusive",
          dismissedAt: null,
          deferredAt: null,
          retestHistory: [],
          activeRequestId: null,
          createdAt: feedback.createdAt,
          updatedAt: feedback.createdAt,
        },
      ];
    })
    .slice(0, 3);
}
// A bounded character diff works for Chinese and English and reconstructs both answers exactly.
// Common edges give a clear, conservative change span without quadratic memory on 16k answers.
export function revisionDiff(original, revised) {
  let start = 0,
    end = 0;
  while (
    start < original.length &&
    start < revised.length &&
    original[start] === revised[start]
  )
    start++;
  while (
    end < original.length - start &&
    end < revised.length - start &&
    original.at(-end - 1) === revised.at(-end - 1)
  )
    end++;
  return [
    { type: "same", text: original.slice(0, start) },
    { type: "removed", text: original.slice(start, original.length - end) },
    { type: "added", text: revised.slice(start, revised.length - end) },
    { type: "same", text: end ? original.slice(-end) : "" },
  ].filter((x) => x.text);
}
export function needsRecheck(g) {
  return !g.dismissedAt && g.status !== "resolved_once";
}
