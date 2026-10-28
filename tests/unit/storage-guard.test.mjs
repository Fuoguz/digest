import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase } from '../../src/data/db.js';
import { backupDue, backupReminder, recordBackup, snoozeBackupReminder, requestPersistence, storageStatus } from '../../src/data/storage-guard.js';

const now = new Date('2026-10-29T12:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

test('a backup reminder is due only when learning exists that no recent backup covers', () => {
  assert.equal(backupDue({ changes: [], now }), false, 'nothing learned yet');
  assert.equal(backupDue({ changes: [daysAgo(1)], now }), false, 'first days: no nagging');
  assert.equal(backupDue({ changes: [daysAgo(4), daysAgo(1)], now }), true, 'never backed up after 3 days');
  assert.equal(backupDue({ lastBackup: daysAgo(20), changes: [daysAgo(30)], now }), false, 'nothing new since the backup');
  assert.equal(backupDue({ lastBackup: daysAgo(20), changes: [daysAgo(2)], now }), true, 'new learning, old backup');
  assert.equal(backupDue({ lastBackup: daysAgo(5), changes: [daysAgo(1)], now }), false, 'recent backup');
  assert.equal(backupDue({ snoozedUntil: daysAgo(-2), changes: [daysAgo(10)], now }), false, 'snoozed');
});

test('backup and snooze dates are stored locally and drive the reminder', async () => {
  const db = await openDatabase(new IDBFactory());
  const activities = [{ createdAt: daysAgo(10) }];
  assert.equal((await backupReminder(db, activities, now)).due, true);
  await snoozeBackupReminder(db, 7, now);
  assert.equal((await backupReminder(db, activities, now)).due, false);
  await recordBackup(db, now);
  const later = new Date(now.getTime() + 30 * 86400000);
  const r = await backupReminder(db, [...activities, { createdAt: later.toISOString() }], new Date(later.getTime() + 15 * 86400000));
  assert.equal(r.lastBackup, now.toISOString());
  assert.equal(r.due, true);
  db.close();
});

test('persistent storage is requested once and reported honestly', async () => {
  let asked = 0;
  const storage = { persisted: async () => asked > 0, persist: async () => (++asked, true), estimate: async () => ({ usage: 10, quota: 100 }) };
  assert.deepEqual(await storageStatus(storage), { supported: true, persisted: false, usage: 10, quota: 100 });
  assert.equal(await requestPersistence(storage), true);
  assert.equal(await requestPersistence(storage), true);
  assert.equal(asked, 1);
  assert.equal(await requestPersistence(undefined), false);
  assert.deepEqual(await storageStatus(undefined), { supported: false, persisted: false });
  assert.equal(await requestPersistence({ persisted: async () => { throw new Error('blocked'); }, persist: async () => true }), false);
});
