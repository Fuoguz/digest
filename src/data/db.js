export const DB_NAME = 'digest-v02';
export const DB_VERSION = 1;
export const STORES = Object.freeze({
  documents: 'documents',
  readingResults: 'readingResults',
  evidenceAnchors: 'evidenceAnchors',
  reviewCards: 'reviewCards',
  knowledgeUnits: 'knowledgeUnits',
  relations: 'relations',
  activities: 'activities',
  settings: 'settings'
});

let databasePromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB 事务失败'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB 事务已中止'));
  });
}

export function openDatabase(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl) return Promise.reject(new Error('当前浏览器不支持 IndexedDB'));
  if (indexedDBImpl === globalThis.indexedDB && databasePromise) return databasePromise;
  const opening = new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.documents)) {
        const documents = db.createObjectStore(STORES.documents, { keyPath: 'id' });
        documents.createIndex('updatedAt', 'updatedAt');
        documents.createIndex('sourceType', 'sourceType');
        documents.createIndex('favorite', 'favorite');
      }
      for (const storeName of Object.values(STORES).filter((name) => name !== STORES.documents)) {
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开 Digest 资料库'));
  });
  if (indexedDBImpl === globalThis.indexedDB) databasePromise = opening;
  return opening;
}

export async function putRecord(storeName, record, db) {
  const database = db || await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(record);
  await transactionDone(transaction);
  return record;
}

export async function getRecord(storeName, id, db) {
  const database = db || await openDatabase();
  return requestResult(database.transaction(storeName, 'readonly').objectStore(storeName).get(id));
}

export async function getAllRecords(storeName, db) {
  const database = db || await openDatabase();
  return requestResult(database.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

export async function deleteRecord(storeName, id, db) {
  const database = db || await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(id);
  await transactionDone(transaction);
}

export async function saveDocument(document, db) {
  await putRecord(STORES.documents, document, db);
  return document;
}

export async function getDocument(id, db) {
  return getRecord(STORES.documents, id, db);
}

export async function listDocuments(db) {
  const documents = await getAllRecords(STORES.documents, db);
  return documents.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function removeDocument(id, db) {
  return deleteRecord(STORES.documents, id, db);
}

export async function addActivity(activity, db) {
  return putRecord(STORES.activities, activity, db);
}

export async function listActivities(db) {
  const activities = await getAllRecords(STORES.activities, db);
  return activities.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function putSetting(id, value, db) {
  return putRecord(STORES.settings, { id, value, updatedAt: new Date().toISOString() }, db);
}

export async function getSetting(id, db) {
  const record = await getRecord(STORES.settings, id, db);
  return record?.value;
}
