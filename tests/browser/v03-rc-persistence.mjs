// Full Chrome process restart, using an isolated persisted profile and actual live QA records.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
const out = "qa-artifacts/v03-rc/restart";
await fs.mkdir(out, { recursive: true });
const profile = path.resolve(out, "profile");
const record = JSON.parse(
  await fs.readFile("qa-artifacts/v03-rc/e2e/results.json", "utf8"),
);
const backup = JSON.parse(
  await fs.readFile("qa-artifacts/v03-rc/e2e/backup.json", "utf8"),
);
const options = {
  channel: "chrome",
  headless: true,
  locale: "zh-CN",
  viewport: { width: 1440, height: 1000 },
  ...(process.env.HTTPS_PROXY
    ? { proxy: { server: process.env.HTTPS_PROXY } }
    : {}),
};
let context = await chromium.launchPersistentContext(profile, options);
try {
  const p = await context.newPage();
  await p.goto(record.base + "/app/settings");
  await p
    .getByLabel("选择 Digest JSON 备份")
    .setInputFiles("qa-artifacts/v03-rc/e2e/backup.json");
  await p.getByText(/已恢复 1 份资料/).waitFor();
  await p.goto(record.history);
  await p.getByRole("heading", { name: "换情境检验", exact: true }).waitFor();
} finally {
  await context.close();
}
context = await chromium.launchPersistentContext(profile, options);
try {
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(record.history);
  await p.getByRole("heading", { name: "第一次回答", exact: true }).waitFor();
  await p.getByRole("heading", { name: "换情境检验", exact: true }).waitFor();
  const after = await p.evaluate(async () => {
    const { openDatabase } = await import("/src/data/db.js"),
      { exportBackup } = await import("/src/data/backup.js");
    const db = await openDatabase(),
      b = await exportBackup(db);
    db.close();
    return b.stores;
  });
  assert.deepEqual(after.attempts, backup.stores.attempts);
  assert.deepEqual(after.learningGaps, backup.stores.learningGaps);
  assert.deepEqual(after.retests, backup.stores.retests);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + "/results.json",
    JSON.stringify(
      {
        base: record.base,
        fullChromeProcessRestart: true,
        originalAndRevisionsEqual: true,
        gapsAndRetestsEqual: true,
        errors,
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS full Chrome close/relaunch: original, revisions, gaps and retests remain identical",
  );
} finally {
  await context.close();
}
