import { createDocument, makeId } from "../domain/documents.js";
import {
  openDatabase,
  listDocuments,
  getDocument,
  getAllRecords,
} from "../data/db.js";
import {
  LEGACY_BACKUP_KEY,
  runLegacyMigration,
} from "../data/legacy-migration.js";
import { extractTextFile, fileExtension } from "../importers/text.js";
import { extractPdfFile } from "../importers/pdf.js";
import { shellHTML, renderLibrary, renderComingSoon } from "./views.js";
import { mountReader } from "../reader/reader.js";
import { mountReview } from "./review.js";
import { mountGraph } from "./graph.js";
import { mountSearch, mountSettings } from "./tools.js";
import { learningStats } from "../domain/learning.js";
import { el, button, link } from "./components.js";
import { sourceSignature } from "../domain/evidence.js";
import { atomic } from "../data/learning-repository.js";
import { mountTraining } from "./training.js";

const root = document.querySelector("#app");
const state = {
  documents: [],
  migration: null,
  filters: {
    query: "",
    sourceType: "all",
    readingMode: "all",
    tag: "all",
    favorite: false,
  },
  importData: null,
  importing: false,
};

let db;
let toastTimer;
let disposeReader;
let routeVersion = 0;
let importVersion = 0;

function normalizedPath() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "/app" ? "/app/" : path;
}

function currentTitle(path) {
  if (path === "/app/") return "Dashboard";
  if (path.startsWith("/app/courses")) return "课程";
  if (path.startsWith("/app/tasks")) return "学习任务";
  if (path.startsWith("/app/library")) return "资料库";
  if (path.startsWith("/app/reader")) return "Reader";
  if (path.startsWith("/app/review")) return "复习";
  if (path.startsWith("/app/graph")) return "知识图谱";
  if (path.startsWith("/app/search")) return "搜索";
  return "设置";
}

function updateNavigation(path) {
  document.querySelectorAll("[data-route]").forEach((link) => {
    const href = link.getAttribute("href");
    link.classList.toggle(
      "active",
      href === "/app/" ? path === href : path.startsWith(href),
    );
  });
  const crumb = document.querySelector("#page-crumb");
  if (crumb)
    crumb.innerHTML = "工作台 / <strong>" + currentTitle(path) + "</strong>";
  document.title = currentTitle(path) + " · Digest";
}

async function renderCurrent() {
  const version = ++routeVersion;
  disposeReader?.();
  disposeReader = null;
  const path = normalizedPath();
  document.body.classList.toggle(
    "reader-open",
    path.startsWith("/app/reader/"),
  );
  updateNavigation(path);
  const page = document.querySelector("#page-root");
  const fresh = await Promise.all([
    listDocuments(db),
    getAllRecords("reviewCards", db),
    getAllRecords("activities", db),
  ]);
  if (version !== routeVersion) return;
  state.documents = fresh[0];
  const currentCards = fresh[1].filter((c) =>
    state.documents.some(
      (d) => d.id === c.documentId && sourceSignature(d) === c.sourceSignature,
    ),
  );
  state.stats = learningStats(currentCards, fresh[2]);
  state.dueDocumentIds = new Set(
    currentCards
      .filter(
        (c) => c.status === "active" && new Date(c.nextReviewAt) <= new Date(),
      )
      .map((c) => c.documentId),
  );
  if (
    path === "/app/" ||
    path === "/app/courses" ||
    path.startsWith("/app/courses/") ||
    path.startsWith("/app/tasks/")
  ) {
    const dispose = await mountTraining(
      page,
      db,
      () => version === routeVersion,
    );
    if (version === routeVersion) disposeReader = dispose;
    else dispose?.();
  } else if (path === "/app/library") {
    page.innerHTML = renderLibrary(state);
    const source = page.querySelector("[data-source-filter]");
    if (source) source.value = state.filters.sourceType;
    const mode = page.querySelector("[data-mode-filter]");
    if (mode) mode.value = state.filters.readingMode;
  } else if (path.startsWith("/app/reader/")) {
    page.textContent = "正在打开资料…";
    try {
      const item = await getDocument(
        decodeURIComponent(path.slice("/app/reader/".length)),
        db,
      );
      if (version !== routeVersion) return;
      if (!item) {
        page.replaceChildren(
          el("p", "inline-feedback", "未找到这份资料。"),
          link("返回资料库", "/app/library"),
        );
        return;
      }
      const dispose = await mountReader(
        page,
        item,
        db,
        () => version === routeVersion,
      );
      if (version === routeVersion) disposeReader = dispose;
      else dispose();
    } catch {
      if (version === routeVersion)
        page.replaceChildren(
          el("p", "inline-feedback is-error", "资料加载失败。"),
          button("重试", renderSafely, "secondary-action"),
          link("返回资料库", "/app/library"),
        );
    }
  } else if (
    ["/app/review", "/app/graph", "/app/search", "/app/settings"].includes(path)
  ) {
    page.textContent = "正在加载…";
    const mount = {
      "/app/review": mountReview,
      "/app/graph": mountGraph,
      "/app/search": mountSearch,
      "/app/settings": mountSettings,
    }[path];
    const dispose = await mount(page, db, () => version === routeVersion);
    if (version === routeVersion) disposeReader = dispose;
    else dispose?.();
  } else {
    const id = path.startsWith("/app/reader/")
      ? decodeURIComponent(path.split("/").pop())
      : null;
    page.innerHTML = renderComingSoon(
      path,
      id ? await getDocument(id, db) : null,
    );
  }
  if (!path.startsWith("/app/reader/")) {
    const mobile = el("nav", "mobile-tools");
    mobile.setAttribute("aria-label", "更多工具");
    mobile.append(
      link("搜索", "/app/search"),
      link("设置与备份", "/app/settings"),
      link("知识图谱", "/app/graph"),
    );
    page.append(mobile);
  }
}

function navigate(path) {
  if (window.location.pathname + window.location.search !== path)
    history.pushState({}, "", path);
  window.scrollTo({ top: 0, behavior: "instant" });
  renderSafely();
}
async function renderSafely() {
  const expectedVersion = routeVersion + 1;
  try {
    await renderCurrent();
  } catch (error) {
    if (expectedVersion !== routeVersion) return;
    const page = document.querySelector("#page-root");
    page.replaceChildren(
      el(
        "p",
        "inline-feedback is-error",
        "本地数据暂时不可用：" + error.message,
      ),
      button("重试", renderSafely, "secondary-action"),
      link("返回资料库", "/app/library"),
    );
  }
}

function showToast(message, type = "") {
  const target = document.querySelector("#toast-root");
  target.replaceChildren(el("div", "toast " + type, message));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    target.innerHTML = "";
  }, 3600);
}

function openImportDialog() {
  importVersion++;
  document.querySelector("#import-submit").disabled = false;
  state.importData = null;
  const form = document.querySelector("#import-form");
  form.reset();
  setFileStatus("");
  document.querySelector("#import-dialog").showModal();
  setTimeout(() => document.querySelector("#file-input").focus(), 50);
}

function closeImportDialog() {
  if (state.importing) return;
  importVersion++;
  document.querySelector("#import-dialog").close();
}

function setFileStatus(message, type = "") {
  const status = document.querySelector("#file-status");
  status.className = "file-status " + type;
  status.textContent = message;
}

async function processFile(file) {
  if (!file) return;
  const version = ++importVersion;
  state.importData = null;
  document.querySelector("#import-submit").disabled = true;
  setFileStatus("正在解析 " + file.name + "…");
  try {
    const extension = fileExtension(file.name);
    const result =
      extension === "pdf" || file.type === "application/pdf"
        ? await extractPdfFile(file)
        : await extractTextFile(file);
    if (version !== importVersion) return;
    state.importData = result;
    document.querySelector("#import-title").value = result.title;
    document.querySelector("#import-content").value = result.rawContent;
    setFileStatus(
      file.name +
        " · " +
        result.rawContent.length.toLocaleString("zh-CN") +
        " 字符 · " +
        result.paragraphs.length +
        " 个段落",
      "ready",
    );
  } catch (error) {
    if (version !== importVersion) return;
    setFileStatus(error.message || "文件解析失败，请重试。", "error");
  } finally {
    if (version === importVersion)
      document.querySelector("#import-submit").disabled = false;
  }
}

async function saveImport(event) {
  event.preventDefault();
  if (state.importing) return;
  const content = document.querySelector("#import-content").value.trim();
  if (!content) {
    setFileStatus("请先选择文件或粘贴正文。", "error");
    return;
  }
  state.importing = true;
  const submit = document.querySelector("#import-submit");
  submit.disabled = true;
  submit.innerHTML = '<span class="button-spinner"></span> 正在保存';
  try {
    const base = state.importData || {
      sourceType: "text",
      metadata: { inputMethod: "paste" },
    };
    const item = createDocument({
      ...base,
      rawContent: content,
      title:
        document.querySelector("#import-title").value ||
        base.title ||
        "未命名资料",
      readingMode: document.querySelector("#import-mode").value,
      tags: document.querySelector("#import-tags").value,
    });
    await atomic(db, ["documents", "activities"], (_, tx) => {
      tx.objectStore("documents").put(item);
      tx.objectStore("activities").put({
        id: makeId("activity"),
        type: "document_imported",
        documentId: item.id,
        createdAt: new Date().toISOString(),
      });
    });
    document.querySelector("#import-dialog").close();
    showToast("“" + item.title + "”已保存到资料库");
    navigate("/app/library");
  } catch (error) {
    setFileStatus(error.message || "导入失败。", "error");
  } finally {
    state.importing = false;
    submit.disabled = false;
    submit.textContent = "保存到资料库";
  }
}

function downloadLegacyBackup() {
  const data = localStorage.getItem(LEGACY_BACKUP_KEY);
  if (!data) {
    showToast("没有找到旧数据备份。", "error");
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([data], { type: "application/json" }),
  );
  link.download =
    "digest-v01-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function toggleFavorite(id) {
  await atomic(db, ["documents"], (data, tx) => {
    const item = data.documents.find((d) => d.id === id);
    if (item)
      tx.objectStore("documents").put({ ...item, favorite: !item.favorite });
  });
  await renderSafely();
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    if (event.target.closest(".skip-link")) {
      event.preventDefault();
      document.querySelector("#page-root")?.focus();
      return;
    }
    const route = event.target.closest("[data-route]");
    if (route) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      const href = route.getAttribute("href");
      if (!href.startsWith("/app")) return;
      event.preventDefault();
      navigate(href);
      return;
    }
    const routeButton = event.target.closest("[data-route-button]");
    if (routeButton) {
      navigate(routeButton.dataset.routeButton);
      return;
    }
    if (event.target.closest("[data-open-import]")) {
      openImportDialog();
      return;
    }
    if (event.target.closest("[data-close-import]")) {
      closeImportDialog();
      return;
    }
    const open = event.target.closest("[data-open-document]");
    if (open) {
      navigate("/app/reader/" + encodeURIComponent(open.dataset.openDocument));
      return;
    }
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) {
      toggleFavorite(favorite.dataset.favorite).catch((e) =>
        showToast(e.message, "error"),
      );
      return;
    }
    const tag = event.target.closest("[data-tag]");
    if (tag) {
      state.filters.tag = tag.dataset.tag;
      renderSafely();
      return;
    }
    if (event.target.closest("[data-favorites]")) {
      state.filters.favorite = !state.filters.favorite;
      renderSafely();
      return;
    }
    if (event.target.closest("[data-due-filter]")) {
      state.filters.due = !state.filters.due;
      renderSafely();
      return;
    }
    if (event.target.closest("[data-download-backup]")) downloadLegacyBackup();
  });
  document.addEventListener("keydown", (event) => {
    const open = event.target.closest?.("[data-open-document]");
    if (open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      navigate("/app/reader/" + encodeURIComponent(open.dataset.openDocument));
    }
  });
  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-library-search]") && !event.isComposing) {
      state.filters.query = event.target.value;
      renderSafely().then(() =>
        document.querySelector("[data-library-search]")?.focus(),
      );
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-source-filter]")) {
      state.filters.sourceType = event.target.value;
      renderSafely();
    }
    if (event.target.matches("[data-mode-filter]")) {
      state.filters.readingMode = event.target.value;
      renderSafely();
    }
    if (event.target.matches("#file-input")) processFile(event.target.files[0]);
  });
  document.querySelector("#import-form").addEventListener("submit", saveImport);
  document
    .querySelector("#import-dialog")
    .addEventListener("cancel", (event) => {
      if (state.importing) event.preventDefault();
      else importVersion++;
    });
  const dropZone = document.querySelector("#drop-zone");
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      document.querySelector("#file-input").click();
    }
  });
  ["dragenter", "dragover"].forEach((name) =>
    dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    }),
  );
  ["dragleave", "drop"].forEach((name) =>
    dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    }),
  );
  dropZone.addEventListener("drop", (event) =>
    processFile(event.dataTransfer.files[0]),
  );
  window.addEventListener("popstate", renderSafely);
}

async function init() {
  try {
    root.innerHTML = shellHTML(normalizedPath());
    bindEvents();
    db = await openDatabase();
    state.migration = await runLegacyMigration({ db });
    state.documents = await listDocuments(db);
    await renderCurrent();
    if (state.migration.status === "failed")
      showToast(
        "旧数据迁移未完成，下次启动会自动重试。旧数据仍保留。",
        "error",
      );
  } catch (error) {
    const box = el("div", "boot-screen");
    box.append(
      el("p", "", "无法打开本地资料库：" + error.message),
      button("刷新重试", () => location.reload(), "secondary-action"),
    );
    root.replaceChildren(box);
  }
}

init();
