// App-level AI jobs: they keep running while the user moves between pages.
// Pages subscribe to show progress; only an explicit cancel stops a job.
// Jobs live in this tab's memory; a reload ends them (saved answers stay safe,
// and pages offer retry exactly as before).
import { getLocale } from "./i18n.js";

const jobs = new Map();
const listeners = new Set();
const l = (zh, en) => (getLocale() === "en" ? en : zh);

function emit(job) {
  for (const fn of job.listeners) fn(job);
  for (const fn of listeners) fn(job, [...jobs.values()]);
}

// run(signal, update) resolves with the job result; update(patch) reports progress.
export function startJob(key, meta, run) {
  const existing = jobs.get(key);
  if (existing?.status === "running") return existing;
  const controller = new AbortController();
  const job = {
    key,
    ...meta,
    status: "running",
    progress: null,
    result: null,
    error: null,
    startedAt: performance.now(),
    timings: {},
    controller,
    listeners: existing?.listeners || new Set(),
  };
  jobs.set(key, job);
  const update = (patch) => {
    if (job.status !== "running") return;
    if (patch.firstResult && job.timings.firstResult === undefined)
      job.timings.firstResult = Math.round(performance.now() - job.startedAt);
    job.progress = { ...job.progress, ...patch };
    emit(job);
  };
  job.promise = (async () => {
    try {
      job.result = await run(controller.signal, update);
      job.status = "done";
    } catch (error) {
      job.error = error;
      job.status = error?.name === "AbortError" ? "cancelled" : "failed";
    } finally {
      job.timings.total = Math.round(performance.now() - job.startedAt);
      emit(job);
    }
    return job;
  })();
  emit(job);
  return job;
}

export function getJob(key) {
  return jobs.get(key) || null;
}
export function runningJob(key) {
  const job = jobs.get(key);
  return job?.status === "running" ? job : null;
}
export function cancelJob(key) {
  jobs.get(key)?.controller.abort();
}
// A finished job is shown once by the page that cares, then forgotten.
export function settleJob(key) {
  const job = jobs.get(key);
  if (!job || job.status === "running") return;
  if (job.listeners.size) jobs.set(key, { key, status: "idle", listeners: job.listeners });
  else jobs.delete(key);
}
export function watchJob(key, fn) {
  let job = jobs.get(key);
  if (!job) {
    job = { key, status: "idle", listeners: new Set() };
    jobs.set(key, job);
  }
  job.listeners.add(fn);
  return () => {
    job.listeners.delete(fn);
    if (job.status === "idle" && !job.listeners.size) jobs.delete(key);
  };
}
export function onJobs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function activeJobs() {
  return [...jobs.values()].filter((job) => job.status === "running");
}

// Browser notification only when the page is hidden and the viewer opted in.
export function canNotify() {
  return typeof Notification !== "undefined";
}
export function notificationsOn() {
  try {
    return canNotify() && Notification.permission === "granted" && localStorage.getItem("digest:notify") === "1";
  } catch {
    return false;
  }
}
export async function enableNotifications() {
  if (!canNotify()) return false;
  const permission = await Notification.requestPermission();
  try {
    localStorage.setItem("digest:notify", permission === "granted" ? "1" : "0");
  } catch {}
  return permission === "granted";
}
export function disableNotifications() {
  try {
    localStorage.setItem("digest:notify", "0");
  } catch {}
}
export function notifyDone(job) {
  if (!notificationsOn() || !document.hidden) return;
  const body =
    job.status === "done"
      ? l("已完成，点此查看。", "Ready. Click to open.")
      : l("没有完成，已保存的内容不受影响。", "Did not finish. Saved work is safe.");
  try {
    const note = new Notification("Digest · " + job.label, { body, tag: job.key });
    note.onclick = () => {
      window.focus();
      if (job.href && location.pathname + location.search !== job.href) {
        history.pushState({}, "", job.href);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      note.close();
    };
  } catch {}
}
