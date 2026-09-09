export const RATINGS = {
  again: "Again · 重来",
  hard: "Hard · 困难",
  good: "Good · 记得",
  easy: "Easy · 轻松",
};
export function schedule(card, rating, now = new Date()) {
  if (!Object.hasOwn(RATINGS, rating)) throw new Error("无效的复习评分");
  const previous = card.intervalDays || 0;
  const days =
    rating === "again"
      ? 1
      : rating === "hard"
        ? Math.max(3, Math.ceil(previous * 1.2))
        : rating === "good"
          ? Math.max(7, previous * 2)
          : Math.max(14, Math.ceil(previous * 2.5));
  const intervalDays = Math.min(days, 365);
  const next = new Date(now);
  next.setDate(next.getDate() + intervalDays);
  return {
    intervalDays,
    nextReviewAt: next.toISOString(),
    scheduler: "simple-v1",
  };
}
export function localDay(value) {
  const d = new Date(value);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
export function learningStats(cards, activities, now = new Date()) {
  const today = localDay(now);
  const days = new Set(
    activities
      .filter((a) =>
        [
          "review_rated",
          "reading_completed",
          "document_imported",
          "knowledge_confirmed",
        ].includes(a.type),
      )
      .map((a) => localDay(a.createdAt)),
  );
  const cursor = new Date(now);
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    due: cards.filter(
      (c) => c.status === "active" && new Date(c.nextReviewAt) <= now,
    ).length,
    completed: activities.filter(
      (a) => a.type === "review_rated" && localDay(a.createdAt) === today,
    ).length,
    streak,
  };
}
export const RELATION_TYPES = {
  related_to: "相关",
  supports: "支持",
  contradicts: "矛盾",
  example_of: "例证",
  prerequisite_of: "前提",
  causes: "导致",
};
export const normalizeQuestion = (text) =>
  text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
export function validateRelations(input, units) {
  if (!input || !Array.isArray(input.relations) || input.relations.length > 30)
    throw new Error("关系响应格式无效");
  const ids = new Set(units.map((u) => u.id));
  const seen = new Set();
  return input.relations.map((r) => {
    if (
      !r ||
      !ids.has(r.sourceKnowledgeUnitId) ||
      !ids.has(r.targetKnowledgeUnitId) ||
      r.sourceKnowledgeUnitId === r.targetKnowledgeUnitId ||
      !Object.hasOwn(RELATION_TYPES, r.type) ||
      typeof r.reason !== "string" ||
      !r.reason.trim() ||
      r.reason.length > 4000
    )
      throw new Error("关系的知识点、类型或理由无效");
    const key = [r.sourceKnowledgeUnitId, r.targetKnowledgeUnitId, r.type].join(
      ":",
    );
    if (seen.has(key)) throw new Error("关系建议重复");
    seen.add(key);
    const allowed = new Set(
      units
        .filter((u) =>
          [r.sourceKnowledgeUnitId, r.targetKnowledgeUnitId].includes(u.id),
        )
        .flatMap((u) => u.evidenceIds),
    );
    return {
      sourceKnowledgeUnitId: r.sourceKnowledgeUnitId,
      targetKnowledgeUnitId: r.targetKnowledgeUnitId,
      type: r.type,
      reason: r.reason.trim(),
      evidenceIds: (Array.isArray(r.evidenceIds) ? r.evidenceIds : []).filter(
        (id) => allowed.has(id),
      ),
      status: "suggested",
    };
  });
}
export function confirmedGraph(units, relations) {
  const nodes = units.filter((u) => u.status === "confirmed" && !u.stale);
  const ids = new Set(nodes.map((u) => u.id));
  return {
    nodes,
    links: relations.filter(
      (r) =>
        r.status === "confirmed" &&
        ids.has(r.sourceKnowledgeUnitId) &&
        ids.has(r.targetKnowledgeUnitId),
    ),
  };
}
