// Search and review of everything learned: one index over materials, reading notes,
// knowledge points, review questions, tasks, answers, feedback and learning gaps.
// With no query it is a timeline of recent learning; ?doc= narrows it to one material.
import { t as tr } from "./i18n.js";
import { getAllRecords } from "../data/db.js";
import { el, button, page, empty, link, badge, icon } from "./components.js";
import { gapLabel, l } from "./learning-loop.js";
import {
  buildHistoryIndex,
  searchHistory,
  countByType,
  snippet,
  queryTerms,
  HISTORY_TYPES,
} from "../domain/history.js";

const STORES = ["documents", "readingResults", "knowledgeUnits", "reviewCards", "tasks", "attempts", "feedback", "learningGaps"];
const PAGE = 30;
const TYPE_LABEL = () => ({
  all: l("全部", "All"),
  material: l("资料", "Materials"),
  reading: l("研读笔记", "Reading notes"),
  unit: l("知识点", "Concepts"),
  card: l("复习题", "Review questions"),
  task: l("题目", "Questions"),
  answer: l("我的作答", "My answers"),
  feedback: l("反馈", "Feedback"),
  gap: l("理解缺口", "Gaps"),
});
// The three voices: the student, the source, the AI.
const TONE = { material: "source", reading: "ai", unit: "accent", card: "outline", task: "outline", answer: "outline", feedback: "ai", gap: "warning" };

export async function mountSearch(container, db, isCurrent) {
  const records = await Promise.all(STORES.map((s) => getAllRecords(s, db).catch(() => [])));
  if (!isCurrent()) return () => {};
  const data = Object.fromEntries(STORES.map((s, i) => [s, records[i]]));
  const docs = new Map(data.documents.map((d) => [d.id, d]));
  const entries = buildHistoryIndex(data);
  const labels = TYPE_LABEL();
  const params = new URLSearchParams(location.search);
  let type = HISTORY_TYPES.includes(params.get("type")) ? params.get("type") : "all";
  let documentId = docs.has(params.get("doc")) ? params.get("doc") : null;
  let shown = PAGE;

  const root = page(
    l("搜索与回顾", "Search & review"),
    tr("Search"),
    l(
      "在资料、研读笔记、知识点、复习题、你的作答、反馈和理解缺口里查找。不输入时按时间回顾最近的学习。",
      "Search materials, reading notes, concepts, review questions, your answers, feedback and gaps. Leave it empty to review recent learning.",
    ),
  );
  const input = el("input", "core-input search-main");
  input.type = "search";
  input.value = params.get("q") || "";
  input.placeholder = l("概念、题目、原文片段或你写过的话", "A concept, question, quote or something you wrote");
  input.setAttribute("aria-label", tr("全库搜索"));
  const scope = el("div", "search-scope");
  const chips = el("div", "filter-chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", l("按类型筛选", "Filter by type"));
  const status = el("p", "search-status");
  status.setAttribute("role", "status");
  const results = el("div", "search-results");
  root.append(input, scope, chips, status, results);
  container.replaceChildren(root);

  function syncURL() {
    const next = new URLSearchParams();
    if (input.value.trim()) next.set("q", input.value.trim());
    if (type !== "all") next.set("type", type);
    if (documentId) next.set("doc", documentId);
    history.replaceState(history.state, "", location.pathname + (next.size ? "?" + next : ""));
  }
  function renderScope() {
    scope.replaceChildren();
    if (!documentId) return;
    const d = docs.get(documentId);
    scope.append(
      el("span", "", l("只看这份资料的学习记录：", "Only learning from: ")),
      link(d.title, "/app/reader/" + encodeURIComponent(d.id), "quiet-link"),
      button(l("看全部", "Show all"), () => {
        documentId = null;
        render();
      }, "quiet-link"),
    );
  }
  function renderChips(counts) {
    chips.replaceChildren();
    for (const value of ["all", ...HISTORY_TYPES]) {
      if (value !== "all" && value !== type && !counts[value]) continue;
      const chip = button(labels[value] + " " + counts[value], () => {
        type = value;
        shown = PAGE;
        render();
      }, "filter-chip" + (type === value ? " active" : ""));
      chip.setAttribute("aria-pressed", String(type === value));
      chips.append(chip);
    }
  }
  // Highlight the query terms inside plain text, without parsing any HTML.
  function marked(textValue, terms) {
    const node = el("p", "search-snippet");
    if (!terms.length) {
      node.textContent = textValue;
      return node;
    }
    const pattern = new RegExp("(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
    for (const part of textValue.split(pattern)) {
      if (!part) continue;
      node.append(terms.includes(part.toLowerCase()) ? el("mark", "", part) : document.createTextNode(part));
    }
    return node;
  }
  function day(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return l("更早", "Earlier");
    const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((start(new Date()) - start(date)) / 86400000);
    if (diff === 0) return l("今天", "Today");
    if (diff === 1) return l("昨天", "Yesterday");
    return date.toLocaleDateString(l("zh-CN", "en"), { year: "numeric", month: "long", day: "numeric" });
  }
  function row(entry, terms) {
    const r = el("article", "learning-row search-row");
    const body = el("div", "row-body");
    const head = el("div", "search-row-head");
    head.append(badge(labels[entry.type], TONE[entry.type]));
    if (entry.type === "gap" && entry.status) head.append(el("span", "reader-muted", gapLabel(entry.status)));
    if (entry.type === "card" && entry.status === "paused") head.append(el("span", "reader-muted", l("已暂停", "Paused")));
    if (entry.type === "answer" && entry.revised) head.append(el("span", "reader-muted", l("已修订", "Revised")));
    body.append(head, link(entry.title || labels[entry.type], entry.href, "row-title"));
    const textValue = snippet(entry, input.value);
    if (textValue) body.append(marked(textValue, terms));
    const origin = entry.type === "material" ? null : docs.get(entry.documentIds[0]);
    const meta = [
      new Date(entry.date).toLocaleDateString(l("zh-CN", "en")),
      origin ? l("资料：", "Material: ") + origin.title : "",
    ].filter(Boolean);
    body.append(el("p", "search-meta", meta.join(" · ")));
    r.append(body, icon("chevronRight", "icon row-chevron"));
    return r;
  }
  function render() {
    syncURL();
    renderScope();
    const query = input.value;
    const terms = queryTerms(query);
    const counts = countByType(entries, query, documentId);
    renderChips(counts);
    const found = searchHistory(entries, query, { type, documentId });
    results.replaceChildren();
    if (!entries.length) {
      status.textContent = "";
      empty(results, l("还没有学习记录", "Nothing here yet"), l("先导入一份资料，或在首页练一道题。", "Import a material, or practise one question on the home page."));
      return;
    }
    if (!found.length) {
      status.textContent = "";
      empty(
        results,
        l("没有找到相关内容", "No matches"),
        l("换一个关键词，或减少筛选条件。", "Try another word or fewer filters."),
        "/app/search",
        l("清除搜索", "Clear search"),
      );
      return;
    }
    status.textContent = terms.length
      ? l("找到 " + found.length + " 条", found.length + " found")
      : documentId
        ? l("这份资料的 " + found.length + " 条学习记录，最新的在前", found.length + " records for this material, newest first")
        : l("最近的学习，最新的在前", "Recent learning, newest first");
    let lastDay = null;
    for (const entry of found.slice(0, shown)) {
      // Without a query the list is a timeline grouped by day.
      if (!terms.length) {
        const label = day(entry.date);
        if (label !== lastDay) {
          results.append(el("h2", "search-day", label));
          lastDay = label;
        }
      }
      results.append(row(entry, terms));
    }
    if (found.length > shown)
      results.append(
        button(l("再显示 " + Math.min(PAGE, found.length - shown) + " 条", "Show " + Math.min(PAGE, found.length - shown) + " more"), () => {
          shown += PAGE;
          render();
        }, "secondary-action search-more"),
      );
  }
  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    shown = PAGE;
    timer = setTimeout(render, 120);
  };
  input.addEventListener("input", schedule);
  input.addEventListener("compositionend", schedule);
  render();
  if (!matchMedia("(pointer: coarse)").matches) input.focus();
  return () => clearTimeout(timer);
}
