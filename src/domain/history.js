// One searchable list of everything a student has learned with: materials, AI reading
// notes, knowledge points, review questions, tasks, answers and revisions, feedback and
// learning gaps. Each entry links to the place where it lives. Pure data, no DOM.

export const HISTORY_TYPES = ["material", "reading", "unit", "card", "task", "answer", "feedback", "gap"];

const enc = encodeURIComponent;
const text = (...parts) => parts.filter((p) => typeof p === "string" && p.trim()).join("\n");

export function buildHistoryIndex(data) {
  const docs = new Map((data.documents || []).map((d) => [d.id, d]));
  const tasks = new Map((data.tasks || []).map((t) => [t.id, t]));
  const attempts = new Map((data.attempts || []).map((a) => [a.id, a]));
  const entries = [];
  const add = (entry) => {
    entry.documentIds = (entry.documentIds || []).filter((id) => docs.has(id));
    entry.hay = (entry.title + "\n" + entry.body).toLowerCase();
    entries.push(entry);
  };
  const taskDocs = (task) => task?.documentIds || [];

  for (const d of docs.values())
    add({
      key: "material:" + d.id,
      type: "material",
      title: d.title,
      body: d.rawContent || "",
      date: d.updatedAt || d.createdAt,
      href: "/app/reader/" + enc(d.id),
      documentIds: [d.id],
    });

  for (const r of data.readingResults || []) {
    const doc = docs.get(r.documentId);
    if (!doc) continue;
    const where = r.scope?.label ? " · " + r.scope.label : "";
    const base = "/app/reader/" + enc(doc.id) + "?result=" + enc(r.id);
    if (r.overview?.summary)
      add({
        key: "reading:" + r.id,
        type: "reading",
        title: doc.title + where,
        body: text(r.overview.summary, ...(r.overview.points || []).map((p) => p.text)),
        date: r.createdAt,
        href: base,
        documentIds: [doc.id],
      });
    for (const section of Object.values(r.sections || {}))
      for (const claim of section.items || [])
        add({
          key: "reading:" + r.id + ":" + claim.id,
          type: "reading",
          title: doc.title + where,
          body: claim.text,
          date: r.createdAt,
          href: base + "&claim=" + enc(claim.id),
          documentIds: [doc.id],
          kind: claim.kind,
        });
  }

  for (const u of data.knowledgeUnits || [])
    add({
      key: "unit:" + u.id,
      type: "unit",
      title: u.label,
      body: u.summary || "",
      date: u.createdAt,
      href: "/app/graph?unit=" + enc(u.id),
      documentIds: [u.documentId],
    });

  for (const c of data.reviewCards || [])
    add({
      key: "card:" + c.id,
      type: "card",
      title: c.question,
      body: c.answer || "",
      date: c.lastReviewedAt || c.createdAt,
      href: "/app/review?manage=1&card=" + enc(c.id),
      documentIds: [c.documentId],
      status: c.status,
    });

  for (const t of tasks.values())
    add({
      key: "task:" + t.id,
      type: "task",
      title: t.title,
      body: text(t.prompt, t.rubric),
      date: t.updatedAt || t.createdAt,
      href: "/app/tasks/" + enc(t.id),
      documentIds: taskDocs(t),
    });

  for (const a of attempts.values()) {
    const task = tasks.get(a.taskId) || a.taskSnapshot;
    if (!task) continue;
    const revisions = a.revision || [];
    add({
      key: "answer:" + a.id,
      type: "answer",
      title: task.title || "",
      body: text(
        revisions.at(-1)?.userAnswer,
        ...revisions.map((r) => r.reflection),
        a.userAnswer,
      ),
      date: revisions.at(-1)?.createdAt || a.submittedAt,
      href: "/app/tasks/" + enc(a.taskId) + "?attempt=" + enc(a.id),
      documentIds: taskDocs(task),
      revised: revisions.length > 0,
    });
  }

  for (const f of data.feedback || []) {
    const a = attempts.get(f.attemptId);
    const task = a && (tasks.get(a.taskId) || a.taskSnapshot);
    if (!task) continue;
    const items = [...(f.gaps || []), ...(f.strengths || [])];
    add({
      key: "feedback:" + f.id,
      type: "feedback",
      title: task.title || "",
      body: text(
        f.overall,
        ...items.flatMap((i) => [i.explanation, i.suggestedAction]),
        f.suggestedNextStep,
      ),
      date: f.createdAt,
      href: "/app/tasks/" + enc(a.taskId) + "?attempt=" + enc(a.id),
      documentIds: taskDocs(task),
    });
  }

  for (const g of data.learningGaps || []) {
    const task = tasks.get(g.taskId) || attempts.get(g.attemptId)?.taskSnapshot;
    add({
      key: "gap:" + g.id,
      type: "gap",
      title: g.title || "",
      body: text(g.description, g.suggestedAction),
      date: g.updatedAt || g.createdAt,
      href: "/app/gaps/" + enc(g.id),
      documentIds: taskDocs(task),
      status: g.status,
    });
  }
  return entries;
}

const time = (e) => Date.parse(e.date) || 0;
export const queryTerms = (query) =>
  String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);

// Every term must appear; title hits rank first, then newer entries.
export function searchHistory(entries, query, { type = "all", documentId = null } = {}) {
  const terms = queryTerms(query);
  const scoped = entries.filter(
    (e) => (type === "all" || e.type === type) && (!documentId || e.documentIds.includes(documentId)),
  );
  if (!terms.length) return scoped.slice().sort((a, b) => time(b) - time(a));
  return scoped
    .filter((e) => terms.every((t) => e.hay.includes(t)))
    .map((e) => ({ e, score: terms.reduce((n, t) => n + (e.title.toLowerCase().includes(t) ? 3 : 1), 0) }))
    .sort((a, b) => b.score - a.score || time(b.e) - time(a.e))
    .map((x) => x.e);
}

export function countByType(entries, query, documentId = null) {
  const counts = Object.fromEntries(["all", ...HISTORY_TYPES].map((t) => [t, 0]));
  for (const e of searchHistory(entries, query, { documentId })) {
    counts.all++;
    counts[e.type]++;
  }
  return counts;
}

// A window of the body around the first match, so the reader sees why it matched.
export function snippet(entry, query, size = 140) {
  const body = entry.body.replace(/\s+/g, " ").trim();
  const lower = body.toLowerCase();
  const hit = queryTerms(query)
    .map((t) => lower.indexOf(t))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  if (hit === undefined || hit < size / 3) return body.length > size ? body.slice(0, size) + "…" : body;
  const start = Math.max(0, hit - Math.floor(size / 3));
  const end = Math.min(body.length, start + size);
  return (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
}
