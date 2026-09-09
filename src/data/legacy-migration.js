import { createDocument } from "../domain/documents.js";
import { getSetting, putSetting, saveDocument } from "./db.js";

export const LEGACY_KEYS = ["digest_nodes", "digest:state:v1"];
export const MIGRATION_MARKER = "legacyMigrationV02";
export const LEGACY_BACKUP_KEY = "digest:v02:legacy-backup";

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function collectLegacySnapshot(storage) {
  const entries = {};
  for (const key of LEGACY_KEYS) {
    const value = storage?.getItem?.(key);
    if (value !== null && value !== undefined) entries[key] = value;
  }
  if (!Object.keys(entries).length) return null;
  return { createdAt: new Date().toISOString(), version: 1, entries };
}

export function extractLegacyNodes(snapshot) {
  if (!snapshot?.entries) return [];
  const nodes = [];
  const direct = safeParse(snapshot.entries.digest_nodes);
  if (Array.isArray(direct)) nodes.push(...direct);
  const state = safeParse(snapshot.entries["digest:state:v1"]);
  if (Array.isArray(state?.nodes)) nodes.push(...state.nodes);
  const seen = new Set();
  return nodes.filter((node) => {
    if (!node || typeof node !== "object") return false;
    const signature =
      String(node.id || "") +
      "|" +
      String(node.title || node.label || "") +
      "|" +
      String(node.createdAt || "");
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function legacyNodeToDocument(node, index = 0) {
  const title = String(node.title || node.label || "旧版知识条目").trim();
  const insight = String(
    node.insight || node.mainPoint || node.content || "",
  ).trim();
  return createDocument({
    id: "legacy-" + String(node.id || "item") + "-" + index,
    title,
    sourceType: "legacy",
    rawContent: "",
    createdAt: node.createdAt || new Date().toISOString(),
    updatedAt: node.updatedAt || node.createdAt || new Date().toISOString(),
    tags: node.tags,
    readingMode: "general",
    status: "legacy_incomplete",
    metadata: {
      legacyInsight: insight || null,
      hasOriginalSource: false,
      migrationNote: "旧版未保存原文，未生成题目或 Evidence。",
    },
  });
}

export async function runLegacyMigration({
  storage = globalThis.localStorage,
  db,
} = {}) {
  const previous = await getSetting(MIGRATION_MARKER, db);
  if (previous?.status === "completed") return previous;
  const snapshot = collectLegacySnapshot(storage);
  if (!snapshot) {
    const result = {
      status: "completed",
      migrated: 0,
      backupCreated: false,
      completedAt: new Date().toISOString(),
    };
    await putSetting(MIGRATION_MARKER, result, db);
    return result;
  }
  try {
    const backupJSON = JSON.stringify(snapshot, null, 2);
    try {
      storage?.setItem?.(LEGACY_BACKUP_KEY, backupJSON);
    } catch {
      /* IndexedDB backup remains available. */
    }
    await putSetting("legacyBackupV02", backupJSON, db);
    const documents = extractLegacyNodes(snapshot).map(legacyNodeToDocument);
    for (const document of documents) await saveDocument(document, db);
    const result = {
      status: "completed",
      migrated: documents.length,
      backupCreated: true,
      completedAt: new Date().toISOString(),
    };
    await putSetting(MIGRATION_MARKER, result, db);
    return result;
  } catch (error) {
    const result = {
      status: "failed",
      migrated: 0,
      backupCreated: Boolean(storage?.getItem?.(LEGACY_BACKUP_KEY)),
      message: error.message,
    };
    try {
      await putSetting(MIGRATION_MARKER, result, db);
    } catch {
      /* A later launch can retry. */
    }
    return result;
  }
}

export async function retryLegacyMigration(db) {
  await putSetting(MIGRATION_MARKER, { status: "retry" }, db);
  return runLegacyMigration({ db });
}
