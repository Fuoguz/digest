import { atomic } from "./learning-repository.js";
import { documentSnapshot, restoreAnchor } from "../domain/evidence.js";
import { MODE_SECTIONS, CLAIM_KINDS } from "../ai/schema.js";
import { RELATION_TYPES, RATINGS } from "../domain/learning.js";
export const BACKUP_STORES = [
  "documents",
  "readingResults",
  "evidenceAnchors",
  "reviewCards",
  "knowledgeUnits",
  "relations",
  "activities",
];
export function exportBackup(db) {
  return atomic(db, BACKUP_STORES, (data) => ({
    format: "digest-v02",
    version: 1,
    createdAt: new Date().toISOString(),
    stores: data,
  }));
}
export async function restoreBackup(db, backup) {
  const fail = () => {
    throw new Error("备份格式或记录无效，未写入任何数据。");
  };
  const text = (v) => typeof v === "string",
    list = (v) => Array.isArray(v),
    date = (v) => text(v) && Number.isFinite(Date.parse(v));
  if (backup?.format !== "digest-v02" || backup.version !== 1 || !backup.stores)
    fail();
  const data = structuredClone(backup.stores);
  for (const name of BACKUP_STORES) {
    if (!list(data[name])) fail();
    const ids = new Set();
    for (const r of data[name]) {
      if (!r || !text(r.id) || !r.id || ids.has(r.id)) fail();
      ids.add(r.id);
    }
  }
  const docs = new Map(),
    snapshots = new Map();
  for (const d of data.documents) {
    if (
      !text(d.title) ||
      !text(d.rawContent) ||
      !list(d.tags) ||
      d.tags.some((t) => !text(t)) ||
      !list(d.paragraphs) ||
      !MODE_SECTIONS[d.readingMode] ||
      !date(d.createdAt) ||
      !date(d.updatedAt)
    )
      fail();
    docs.set(d.id, d);
    snapshots.set(d.id, await documentSnapshot(d));
    d.activeAnalysisRequestId = null;
  }
  const results = new Map();
  for (const r of data.readingResults) {
    if (
      !docs.has(r.documentId) ||
      !MODE_SECTIONS[r.readingMode] ||
      !r.sections ||
      !list(r.reviewQuestions) ||
      !date(r.createdAt)
    )
      fail();
    for (const s of Object.values(r.sections)) {
      if (!s || !["ready", "missing"].includes(s.status) || !list(s.items))
        fail();
      for (const c of s.items)
        if (
          !text(c.id) ||
          !text(c.text) ||
          !CLAIM_KINDS[c.kind] ||
          !list(c.evidenceIds)
        )
          fail();
    }
    for (const q of r.reviewQuestions)
      if (
        !text(q.question) ||
        !text(q.answer) ||
        (q.claimIds !== undefined && !list(q.claimIds))
      )
        fail();
    results.set(r.id, r);
  }
  for (const d of data.documents)
    if (d.digestResultId && !results.has(d.digestResultId)) fail();
  data.evidenceAnchors = data.evidenceAnchors.map((a) => {
    if (!docs.has(a.documentId) || !text(a.quote)) fail();
    return restoreAnchor(a, snapshots.get(a.documentId));
  });
  for (const c of data.reviewCards) {
    if (
      !docs.has(c.documentId) ||
      !results.has(c.readingResultId) ||
      !text(c.question) ||
      !text(c.answer) ||
      !text(c.questionKey) ||
      !list(c.evidenceIds) ||
      !list(c.history) ||
      !["active", "paused"].includes(c.status) ||
      !Number.isInteger(c.version) ||
      !date(c.nextReviewAt) ||
      !text(c.sourceSignature)
    )
      fail();
    for (const h of c.history)
      if (!RATINGS[h.rating] || !date(h.createdAt)) fail();
  }
  const units = new Set();
  for (const u of data.knowledgeUnits) {
    if (
      !docs.has(u.documentId) ||
      !results.has(u.readingResultId) ||
      !text(u.label) ||
      !text(u.summary) ||
      !list(u.evidenceIds) ||
      !list(u.tags) ||
      u.status !== "confirmed" ||
      !Number.isInteger(u.version) ||
      !text(u.sourceSignature)
    )
      fail();
    units.add(u.id);
  }
  for (const r of data.relations)
    if (
      !units.has(r.sourceKnowledgeUnitId) ||
      !units.has(r.targetKnowledgeUnitId) ||
      r.sourceKnowledgeUnitId === r.targetKnowledgeUnitId ||
      !RELATION_TYPES[r.type] ||
      !text(r.reason) ||
      !r.reason.trim() ||
      !["suggested", "confirmed", "rejected"].includes(r.status)
    )
      fail();
  for (const a of data.activities)
    if (!text(a.type) || !date(a.createdAt)) fail();
  return atomic(db, BACKUP_STORES, (current, tx) => {
    // Restore into an empty study space: no silent merge, overwrite or clearing.
    if (BACKUP_STORES.some((name) => current[name].length))
      throw new Error(
        "为避免覆盖学习记录，请在空的浏览器资料库中恢复。当前数据未修改。",
      );
    for (const name of BACKUP_STORES)
      for (const r of data[name]) tx.objectStore(name).put(r);
    return data.documents.length;
  });
}
