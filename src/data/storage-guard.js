// Everything a student has lives only in this browser. Two guards against losing it:
// ask the browser to keep the storage (not evict it under pressure), and remind the
// student to export a backup when there is learning that no backup contains yet.
import { getSetting, putSetting } from "./db.js";

const DAY = 86400000;
export const LAST_BACKUP = "last-backup";
export const BACKUP_SNOOZE = "backup-reminder-snooze";

export async function storageStatus(storage = globalThis.navigator?.storage) {
  if (!storage?.persisted) return { supported: false, persisted: false };
  try {
    const [persisted, estimate] = await Promise.all([
      storage.persisted(),
      storage.estimate ? storage.estimate().catch(() => null) : null,
    ]);
    return { supported: true, persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null };
  } catch {
    return { supported: false, persisted: false };
  }
}

// Called after the student saves something; browsers may grant it silently or ask once.
export async function requestPersistence(storage = globalThis.navigator?.storage) {
  if (!storage?.persist) return false;
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return false;
  }
}

export const recordBackup = (db, now = new Date()) => putSetting(LAST_BACKUP, { at: now.toISOString() }, db);
export const snoozeBackupReminder = (db, days = 7, now = new Date()) =>
  putSetting(BACKUP_SNOOZE, { until: new Date(now.getTime() + days * DAY).toISOString() }, db);

// Pure: is a reminder due? `changes` are the dates of learning records (activities).
export function backupDue({ lastBackup, snoozedUntil, changes, now = new Date() }) {
  const times = changes.map((c) => Date.parse(c)).filter(Number.isFinite);
  if (!times.length) return false;
  if (snoozedUntil && Date.parse(snoozedUntil) > now.getTime()) return false;
  const latest = Math.max(...times);
  if (!lastBackup) return now.getTime() - Math.min(...times) >= 3 * DAY;
  const last = Date.parse(lastBackup);
  return latest > last && now.getTime() - last >= 14 * DAY;
}

export async function backupReminder(db, activities, now = new Date()) {
  const [last, snooze] = await Promise.all([getSetting(LAST_BACKUP, db), getSetting(BACKUP_SNOOZE, db)]);
  return {
    due: backupDue({
      lastBackup: last?.at,
      snoozedUntil: snooze?.until,
      changes: activities.map((a) => a.createdAt),
      now,
    }),
    lastBackup: last?.at || null,
  };
}
