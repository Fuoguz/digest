import { sourceSignature, restoreAnchor } from "../domain/evidence.js";
import { makeId } from "../domain/documents.js";
import {
  schedule,
  normalizeQuestion,
  validateRelations,
} from "../domain/learning.js";
import { getAllRecords } from "./db.js";

// All reads finish inside one transaction; mutation is synchronous, atomic and retryable.
export function atomic(db, names, mutate) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, "readwrite"),
      data = {};
    let pending = names.length,
      output,
      failure;
    tx.oncomplete = () => resolve(output);
    tx.onabort = tx.onerror = () =>
      reject(failure || tx.error || new Error("本地保存失败，请重试"));
    for (const name of names) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => {
        data[name] = request.result;
        if (--pending === 0)
          try {
            output = mutate(data, tx);
          } catch (error) {
            failure = error;
            tx.abort();
          }
      };
    }
  });
}
function guard(data, snapshot, result) {
  const doc = data.documents.find((d) => d.id === snapshot.documentId);
  if (
    !doc ||
    sourceSignature(doc) !== snapshot.signature ||
    doc.digestResultId !== result.id ||
    result.sourceRevision !== snapshot.sourceRevision
  )
    throw new Error("资料或研读版本已变化，请重新打开 Reader");
  return doc;
}
export class LearningRepository {
  constructor(db) {
    this.db = db;
  }
  list(name) {
    return getAllRecords(name, this.db);
  }
  addReview(snapshot, result, question) {
    return atomic(
      this.db,
      ["documents", "reviewCards", "evidenceAnchors"],
      (data, tx) => {
        guard(data, snapshot, result);
        const key = normalizeQuestion(question.question);
        const existing = data.reviewCards.find(
          (c) => c.documentId === snapshot.documentId && c.questionKey === key,
        );
        if (existing) return existing;
        const claimIds = (question.claimIds || []).filter((id) =>
          Object.values(result.sections).some((s) =>
            s.items.some((c) => c.id === id),
          ),
        );
        const claims = Object.values(result.sections)
          .flatMap((s) => s.items)
          .filter((c) => claimIds.includes(c.id));
        const card = {
          id: makeId("review"),
          documentId: snapshot.documentId,
          readingResultId: result.id,
          sourceRevision: snapshot.sourceRevision,
          sourceSignature: snapshot.signature,
          question: question.question,
          answer: question.answer,
          questionKey: key,
          claimIds,
          evidenceIds: [
            ...new Set(claims.flatMap((c) => c.evidenceIds)),
          ].filter((id) => {
            const a = data.evidenceAnchors.find((a) => a.id === id);
            return (
              a && restoreAnchor(a, snapshot).validationStatus === "matched"
            );
          }),
          status: "active",
          history: [],
          version: 0,
          nextReviewAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          scheduler: "simple-v1",
          intervalDays: 0,
        };
        tx.objectStore("reviewCards").put(card);
        return card;
      },
    );
  }
  rate(id, rating, version, now = new Date()) {
    return atomic(
      this.db,
      ["reviewCards", "activities", "documents"],
      (data, tx) => {
        const card = data.reviewCards.find((c) => c.id === id);
        const doc = data.documents.find((d) => d.id === card?.documentId);
        if (
          !card ||
          card.status !== "active" ||
          card.version !== version ||
          new Date(card.nextReviewAt) > now
        )
          throw new Error("这道题已处理或尚未到期，请刷新队列");
        if (!doc || sourceSignature(doc) !== card.sourceSignature)
          throw new Error("原文已变化，请暂停此题并重新研读");
        const next = {
          ...card,
          ...schedule(card, rating, now),
          version: version + 1,
          lastReviewedAt: now.toISOString(),
          history: [...card.history, { rating, createdAt: now.toISOString() }],
        };
        tx.objectStore("reviewCards").put(next);
        tx.objectStore("activities").put({
          id: makeId("activity"),
          type: "review_rated",
          cardId: id,
          documentId: card.documentId,
          createdAt: now.toISOString(),
        });
        return next;
      },
    );
  }
  setCardStatus(id, status) {
    if (!["active", "paused"].includes(status)) throw new Error("无效状态");
    return atomic(this.db, ["reviewCards"], (data, tx) => {
      const c = data.reviewCards.find((c) => c.id === id);
      if (!c) throw new Error("题目不存在");
      tx.objectStore("reviewCards").put({
        ...c,
        status,
        version: c.version + 1,
      });
    });
  }
  confirmUnit(snapshot, result, claim, label) {
    return atomic(
      this.db,
      ["documents", "knowledgeUnits", "activities", "evidenceAnchors"],
      (data, tx) => {
        const doc = guard(data, snapshot, result);
        if (!label.trim()) throw new Error("请输入知识点名称");
        if (
          !Object.values(result.sections).some((s) =>
            s.items.some((c) => c.id === claim.id && c.text === claim.text),
          )
        )
          throw new Error("判断已变化");
        const existing = data.knowledgeUnits.find(
          (u) =>
            u.documentId === doc.id &&
            u.claimId === claim.id &&
            u.readingResultId === result.id,
        );
        if (existing) return existing;
        const unit = {
          id: makeId("unit"),
          documentId: doc.id,
          readingResultId: result.id,
          claimId: claim.id,
          label: label.trim().slice(0, 100),
          summary: claim.text,
          type: claim.kind,
          evidenceIds: claim.evidenceIds.filter((id) => {
            const a = data.evidenceAnchors.find((a) => a.id === id);
            return (
              a && restoreAnchor(a, snapshot).validationStatus === "matched"
            );
          }),
          tags: doc.tags,
          status: "confirmed",
          sourceSignature: snapshot.signature,
          sourceRevision: snapshot.sourceRevision,
          createdAt: new Date().toISOString(),
          version: 0,
        };
        tx.objectStore("knowledgeUnits").put(unit);
        tx.objectStore("activities").put({
          id: makeId("activity"),
          type: "knowledge_confirmed",
          createdAt: unit.createdAt,
        });
        return unit;
      },
    );
  }
  editUnit(id, label) {
    return atomic(this.db, ["knowledgeUnits"], (data, tx) => {
      const u = data.knowledgeUnits.find((u) => u.id === id);
      if (!u || !label.trim()) throw new Error("知识点名称不能为空");
      tx.objectStore("knowledgeUnits").put({
        ...u,
        label: label.trim().slice(0, 100),
        version: u.version + 1,
      });
    });
  }
  removeUnit(id) {
    return atomic(this.db, ["knowledgeUnits", "relations"], (data, tx) => {
      tx.objectStore("knowledgeUnits").delete(id);
      for (const r of data.relations)
        if ([r.sourceKnowledgeUnitId, r.targetKnowledgeUnitId].includes(id))
          tx.objectStore("relations").delete(r.id);
    });
  }
  suggestRelations(input, snapshotUnits) {
    const clean = validateRelations(input, snapshotUnits);
    return atomic(
      this.db,
      ["knowledgeUnits", "relations", "documents"],
      (data, tx) => {
        for (const old of snapshotUnits) {
          const u = data.knowledgeUnits.find((u) => u.id === old.id),
            d = data.documents.find((d) => d.id === u?.documentId);
          if (
            !u ||
            u.version !== old.version ||
            !d ||
            sourceSignature(d) !== u.sourceSignature
          )
            throw new Error("知识点或来源已变化，请重新建议关系");
        }
        let count = 0;
        for (const r of clean) {
          if (
            data.relations.some(
              (v) =>
                v.sourceKnowledgeUnitId === r.sourceKnowledgeUnitId &&
                v.targetKnowledgeUnitId === r.targetKnowledgeUnitId &&
                v.type === r.type,
            )
          )
            continue;
          tx.objectStore("relations").put({
            ...r,
            id: makeId("relation"),
            createdAt: new Date().toISOString(),
          });
          count++;
        }
        return count;
      },
    );
  }
  decideRelation(id, status) {
    if (!["confirmed", "rejected"].includes(status))
      throw new Error("无效关系状态");
    return atomic(
      this.db,
      ["relations", "knowledgeUnits", "documents"],
      (data, tx) => {
        const r = data.relations.find((r) => r.id === id);
        if (!r) throw new Error("关系不存在");
        for (const uid of [r.sourceKnowledgeUnitId, r.targetKnowledgeUnitId]) {
          const u = data.knowledgeUnits.find((u) => u.id === uid),
            d = data.documents.find((d) => d.id === u?.documentId);
          if (!u || !d || sourceSignature(d) !== u.sourceSignature)
            throw new Error("关系来源已失效");
        }
        tx.objectStore("relations").put({ ...r, status });
      },
    );
  }
}
