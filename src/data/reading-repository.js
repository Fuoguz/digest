import { getDocument, getRecord, STORES } from './db.js';
import { sourceSignature, restoreAnchor } from '../domain/evidence.js';
import { AnalysisError } from '../ai/schema.js';

function guardedTransaction(db, snapshot, requestId, operation, signal, requireRequest = true) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.documents, STORES.readingResults, STORES.evidenceAnchors], 'readwrite');
    const documents = transaction.objectStore(STORES.documents);
    let failure;
    const cancel = () => { failure = new DOMException('Cancelled', 'AbortError'); try { transaction.abort(); } catch {} };
    signal?.addEventListener('abort', cancel, { once: true });
    transaction.oncomplete = () => { signal?.removeEventListener('abort', cancel); resolve(); };
    transaction.onabort = transaction.onerror = () => { signal?.removeEventListener('abort', cancel); reject(failure || transaction.error || new Error('保存失败')); };
    const request = documents.get(snapshot.documentId);
    request.onsuccess = () => {
      const current = request.result;
      if (signal?.aborted) { cancel(); return; }
      if (!current || sourceSignature(current) !== snapshot.signature || (requireRequest && current.activeAnalysisRequestId !== requestId)) {
        failure = new AnalysisError('document_changed', '资料或分析请求已变化。本次响应没有保存，请重新分析。');
        transaction.abort(); return;
      }
      operation(transaction, current);
    };
  });
}

export class ReadingRepository {
  constructor(db) { this.db = db; }
  async begin(snapshot, requestId, signal) {
    return guardedTransaction(this.db, snapshot, requestId, (transaction, current) => {
      transaction.objectStore(STORES.documents).put({ ...current, activeAnalysisRequestId: requestId });
    }, signal, false);
  }
  async commit(snapshot, payload, signal) {
    const { result, anchors } = payload;
    if (result.documentId !== snapshot.documentId || result.sourceRevision !== snapshot.sourceRevision ||
        result.id !== result.requestId || anchors.some((anchor) => anchor.documentId !== snapshot.documentId || anchor.sourceRevision !== snapshot.sourceRevision)) {
      throw new AnalysisError('document_changed', '结果与当前资料快照不一致。');
    }
    return guardedTransaction(this.db, snapshot, result.requestId, (transaction, current) => {
      transaction.objectStore(STORES.readingResults).put(result);
      for (const anchor of anchors) transaction.objectStore(STORES.evidenceAnchors).put(anchor);
      transaction.objectStore(STORES.documents).put({
        ...current, digestResultId: result.id, evidenceAnchorIds: anchors.map((anchor) => anchor.id),
        activeAnalysisRequestId: null
      });
    }, signal);
  }
  async load(snapshot) {
    const document = await getDocument(snapshot.documentId, this.db);
    if (!document?.digestResultId) return { result: null, anchors: [] };
    const result = await getRecord(STORES.readingResults, document.digestResultId, this.db);
    if (!result || result.documentId !== snapshot.documentId) return { result: null, anchors: [] };
    const anchors = (await Promise.all((document.evidenceAnchorIds || []).map((id) => getRecord(STORES.evidenceAnchors, id, this.db))))
      .filter(Boolean).map((anchor) => restoreAnchor(anchor, snapshot));
    return { result, anchors, stale: result.sourceRevision !== snapshot.sourceRevision };
  }
}
