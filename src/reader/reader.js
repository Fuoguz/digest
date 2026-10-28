import { t as tr } from "../workspace/i18n.js";
import { createTransport, useProxy, ProxyTransport } from "../ai/proxy-transport.js";
import { el, button, highlightQuote } from "./dom.js";
import {
  documentSnapshot,
  restoreAnchor,
  selectionText,
  validFocus,
  anchorInFocus,
  MAX_FOCUS_CHARS,
} from "../domain/evidence.js";
import { getLocale, installLanguageControl } from "../workspace/i18n.js";
import { readingChunks } from "../domain/context.js";
import { getSetting, getRecord, getAllRecords } from "../data/db.js";
import { TrainingRepository } from "../data/training-repository.js";
import { LearningRepository } from "../data/learning-repository.js";
import { normalizeQuestion } from "../domain/learning.js";
import {
  READING_MODES,
  SOURCE_TYPES,
  documentChapters,
} from "../domain/documents.js";
import { MODE_SECTIONS, CLAIM_KINDS } from "../ai/schema.js";
import { DigestAIService } from "../ai/service.js";
import { readDeveloperConfig } from "../ai/developer-transport.js";
import { ReadingRepository } from "../data/reading-repository.js";
import { AnalysisSession } from "../ai/analysis-session.js";
import { openAIConfiguration } from "./config-dialog.js";
import { message, editName, link } from "../workspace/components.js";
import { icon } from "../workspace/icons.js";
import {
  startJob,
  getJob,
  runningJob,
  cancelJob,
  settleJob,
  watchJob,
} from "../workspace/jobs.js";

const MAX_CHUNKS = 12;
const l = (zh, en) => (getLocale() === "en" ? en : zh);
const KIND_TONE = {
  source_statement: "source",
  inference: "ai",
  reusable_insight: "insight",
};
// Per-viewer reading comfort only; the page works the same without storage.
const PREFS_KEY = "digest:reader-prefs";
const PREF_DEFAULTS = { size: "m", leading: "comfort", theme: "paper", notes: true, follow: true };
function loadPrefs() {
  try {
    return { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return { ...PREF_DEFAULTS };
  }
}
function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}
const short = (text, n = 36) => (text.length > n ? text.slice(0, n) + "…" : text);

export async function mountReader(container, item, db, isCurrent = () => true) {
  const snapshot = await documentSnapshot(item);
  const repository = new ReadingRepository(db);
  const learning = new LearningRepository(db);
  const routeParams = new URLSearchParams(location.search);
  let saved = await repository.load(snapshot, routeParams.get("result"));
  const externalAnchor = routeParams.get("evidence")
    ? await getRecord("evidenceAnchors", routeParams.get("evidence"), db)
    : null;
  if (externalAnchor && !saved.anchors.some((a) => a.id === externalAnchor.id))
    saved.anchors.push(restoreAnchor(externalAnchor, snapshot));
  const checkpointKey = "reading-progress:" + item.id;
  let [partial, cards, units, courses] = await Promise.all([
    getSetting(checkpointKey, db),
    learning.list("reviewCards").catch(() => []),
    learning.list("knowledgeUnits").catch(() => []),
    getAllRecords("courses", db).catch(() => []),
  ]);
  if (!isCurrent()) return () => {};
  try {
    if (
      partial &&
      (JSON.parse(partial.key)[0] !== snapshot.sourceRevision ||
        !Array.isArray(partial.parts))
    )
      partial = null;
  } catch {
    partial = null;
  }
  const prefs = loadPrefs();
  let disposed = false,
    status = saved.result
      ? saved.stale
        ? "needs_attention"
        : saved.result.status
      : "idle";
  let errorMessage = "",
    errorCode = "",
    progressText = "",
    progress = null,
    activeClaim = null,
    selectedAnchor = null,
    kindFilter = "all",
    records = [],
    currentIndex = 0,
    feedbackLine = null,
    positionFrame = 0,
    followPausedUntil = 0,
    retryScope = null,
    selectionFrame = 0;
  const total = snapshot.paragraphs.length;
  const chapters = documentChapters(item, total);
  const chapterAt = (index) =>
    chapters.findIndex((c) => index >= c.start && index <= c.end);
  // Most books already number their chapters in the title; only number the rest.
  const numbered =
    /^\s*(第\s*[\d一二三四五六七八九十百千零〇两]+\s*[章节篇部卷回讲课]|(chapter|part|section|lecture|unit)\s+[\divxlc]+\b|\d+(\.\d+)*[\s.、:：])/i;
  const chapterLabel = (i) =>
    numbered.test(chapters[i].title)
      ? chapters[i].title
      : l("第 " + (i + 1) + " 章 · ", "Ch. " + (i + 1) + " · ") + chapters[i].title;

  // ---------- Header ----------
  const root = el("section", "reader");
  root.dataset.tab = "source";
  const header = el("header", "reader-header");
  const back = el("a", "reader-back", tr("← 资料库"));
  back.href = "/app/library";
  back.dataset.route = "";
  const heading = el("div", "reader-heading");
  const title = el("h1", "", item.title);
  const metadata = el("div", "reader-metadata");
  const position = el("span", "reading-position tabular");
  metadata.append(
    el("span", "reader-source-type", SOURCE_TYPES[item.sourceType] || "Text"),
    el("span", "", READING_MODES[item.readingMode]),
    ...item.tags.map((tag) => el("span", "reader-tag", tag)),
    position,
  );
  heading.append(title, metadata);
  const tool = (iconName, text, label) => {
    const b = button("", () => {}, "reader-tool");
    b.append(typeof iconName === "string" ? icon(iconName) : iconName, el("span", "", text));
    b.setAttribute("aria-label", label);
    b.title = label;
    return b;
  };
  const tocButton = tool("library", l("目录", "Contents"), l("目录", "Contents"));
  const aa = el("b", "reader-aa", "Aa");
  aa.setAttribute("aria-hidden", "true");
  const prefsButton = tool(aa, l("阅读", "Reading"), l("阅读设置", "Reading settings"));
  prefsButton.setAttribute("aria-expanded", "false");
  const notesButton = tool("ai", l("笔记", "Notes"), l("研读笔记", "Study notes"));
  // "Re-read" repeats what is on screen: a passage reading re-reads its passage.
  const analyzeButton = button(
    tr("开始研读"),
    () => {
      const focus = saved.result?.scope?.focus;
      analyze(focus && !saved.stale && validFocus(focus, snapshot.paragraphs) ? selectionScope(focus) : null);
    },
    "primary-action",
  );
  const more = el("details", "reader-more");
  more.append(el("summary", "", tr("更多 ···")));
  const menu = el("div", "reader-more-menu");
  // From the material to practice and to everything already learned from it.
  const practiceLink = link(l("用这份资料练一道题", "Practise a question on this"), "/app/?practice=" + encodeURIComponent(item.id));
  const historyLink = link(l("这份资料的学习记录", "Learning from this material"), "/app/search?doc=" + encodeURIComponent(item.id));
  for (const a of [practiceLink, historyLink]) a.addEventListener("click", () => (more.open = false));
  menu.append(
    practiceLink,
    historyLink,
    ...(!useProxy()
      ? [
          button("Developer AI Service", () => {
            more.open = false;
            openAIConfiguration(() => {
              errorMessage = "";
              renderAI();
            });
          }),
        ]
      : []),
    button(tr("导出原文 TXT"), () => {
      more.open = false;
      const a = el("a");
      a.href = URL.createObjectURL(
        new Blob([snapshot.source], { type: "text/plain;charset=utf-8" }),
      );
      a.download = item.title.replace(/[\\/:*?"<>|]/g, "_") + ".txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }),
  );
  more.append(menu);
  const headerActions = el("div", "reader-header-actions");
  headerActions.append(tocButton, prefsButton, notesButton, analyzeButton, more);
  installLanguageControl(headerActions);
  header.append(back, heading, headerActions);
  const returnPath = routeParams.get("return");
  if (
    returnPath &&
    /^(?:\/app\/(?:review|graph|search)(?:\?|$)|\/app\/(?:tasks|courses)\/[a-zA-Z0-9_-]+(?:\?|$))/.test(
      returnPath,
    )
  ) {
    const returnLink = el("a", "reader-back reader-return", tr("← 返回学习任务"));
    returnLink.href = returnPath;
    returnLink.dataset.route = "";
    headerActions.append(returnLink);
  }

  // Reading settings popover.
  const prefsPanel = el("div", "reader-prefs");
  prefsPanel.hidden = true;
  prefsPanel.setAttribute("role", "group");
  prefsPanel.setAttribute("aria-label", l("阅读设置", "Reading settings"));
  for (const [key, label, options] of [
    ["size", l("字号", "Text size"), [["s", l("小", "S")], ["m", l("中", "M")], ["l", l("大", "L")]]],
    ["leading", l("行距", "Line spacing"), [["comfort", l("舒适", "Comfortable")], ["loose", l("宽松", "Loose")]]],
    ["theme", l("纸面", "Page"), [["paper", l("纸面", "Paper")], ["night", l("夜间", "Night")]]],
  ]) {
    prefsPanel.append(el("p", "reader-prefs-label", label));
    const group = el("div", "reader-seg");
    for (const [value, text] of options) {
      const b = button(text, () => {
        prefs[key] = value;
        savePrefs(prefs);
        applyPrefs();
      });
      b.dataset.pref = key;
      b.dataset.value = value;
      group.append(b);
    }
    prefsPanel.append(group);
  }
  function applyPrefs() {
    root.dataset.size = prefs.size;
    root.dataset.leading = prefs.leading;
    document.documentElement.dataset.readerTheme = prefs.theme;
    for (const b of prefsPanel.querySelectorAll("[data-pref]"))
      b.setAttribute("aria-pressed", String(prefs[b.dataset.pref] === b.dataset.value));
    root.classList.toggle("notes-collapsed", !prefs.notes);
    notesButton.setAttribute("aria-pressed", String(prefs.notes));
  }
  prefsButton.addEventListener("click", () => {
    prefsPanel.hidden = !prefsPanel.hidden;
    prefsButton.setAttribute("aria-expanded", String(!prefsPanel.hidden));
  });
  notesButton.addEventListener("click", () => {
    if (matchMedia("(max-width: 799px)").matches) {
      setTab(root.dataset.tab === "ai" ? "source" : "ai");
      return;
    }
    prefs.notes = !prefs.notes;
    savePrefs(prefs);
    applyPrefs();
  });

  // ---------- Tabs (phones) ----------
  const tabs = el("div", "reader-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", tr("阅读区域"));
  const sourceTab = button(tr("原文"), () => setTab("source"), "reader-tab");
  const aiTab = button(l("研读笔记", "Study notes"), () => setTab("ai"), "reader-tab");
  [sourceTab, aiTab].forEach((tab, index) => {
    tab.setAttribute("role", "tab");
    tab.id = index ? "ai-tab" : "source-tab";
    tab.setAttribute("aria-controls", index ? "reader-ai" : "reader-source");
    tab.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        setTab(index ? "source" : "ai");
        (index ? sourceTab : aiTab).focus();
      }
    });
  });
  tabs.append(sourceTab, aiTab);

  // ---------- Source ----------
  const split = el("div", "reader-split");
  const sourcePanel = el("section", "source-panel");
  sourcePanel.id = "reader-source";
  sourcePanel.setAttribute("aria-label", tr("原文"));
  const sourceScroll = el("div", "source-scroll");
  sourceScroll.tabIndex = 0;
  sourceScroll.setAttribute("aria-label", tr("原文滚动区域"));
  const article = el("article", "source-article");
  article.append(
    el("p", "source-eyebrow", tr("READ CLOSELY")),
    el("h2", "source-title", item.title),
  );
  if (item.metadata?.originalFileName)
    article.append(el("p", "source-filename", item.metadata.originalFileName));
  if (item.metadata?.ocr)
    article.append(
      el(
        "p",
        "scope-notice ocr-note",
        l(
          "这份材料的文字由本地识别（OCR）得到，可能有识别错误；核对引文时请对照原件第 ",
          "This text was recognised locally (OCR) and may contain errors. When checking quotes, compare with pages ",
        ) +
          item.metadata.ocr.pages.join("–") +
          l(" 页。", " of the original."),
      ),
    );
  const paragraphNodes = new Map();
  const wrappers = [];
  for (const paragraph of snapshot.paragraphs) {
    const chapterIndex = chapters.findIndex(
      (c) => c.start === paragraph.paragraphIndex,
    );
    // Chapter titles come from the book's table of contents; they are labels, not source text.
    if (chapterIndex >= 0 && !paragraph.heading) {
      const divider = el("p", "chapter-divider", chapterLabel(chapterIndex));
      divider.setAttribute("aria-hidden", "true");
      article.append(divider);
    } else if (chapterIndex > 0) article.append(el("hr", "chapter-rule"));
    const wrapper = el("div", "source-paragraph");
    wrapper.dataset.paragraphIndex = paragraph.paragraphIndex;
    const number = el(
      "span",
      "paragraph-number",
      String(paragraph.paragraphIndex + 1).padStart(2, "0"),
    );
    number.setAttribute("aria-hidden", "true");
    const text = el("p", "paragraph-text", paragraph.text);
    if (paragraph.heading) {
      wrapper.classList.add("is-heading", "heading-" + paragraph.heading);
      text.setAttribute("role", "heading");
      text.setAttribute("aria-level", String(Math.min(paragraph.heading + 2, 6)));
    }
    wrapper.append(number, text);
    article.append(wrapper);
    wrappers.push(wrapper);
    paragraphNodes.set(paragraph.paragraphIndex, { wrapper, text, mark: null });
  }
  if (!snapshot.source)
    article.append(
      el(
        "p",
        "reader-muted",
        tr("这份旧版条目没有保存原文。请重新导入资料后再分析。"),
      ),
    );
  sourceScroll.append(article);
  const returnButton = button(
    tr("← 返回 AI 判断"),
    () => {
      if (!activeClaim && returnPath) {
        const target = headerActions.querySelector("a.reader-return");
        if (target) {
          target.click();
          return;
        }
      }
      setTab("ai");
      focusCard(activeClaim);
    },
    "return-to-claim",
  );
  returnButton.hidden = true;
  sourcePanel.append(sourceScroll, returnButton);

  // ---------- Selected passage → AI reading ----------
  const selectionBar = el("div", "selection-action");
  selectionBar.hidden = true;
  selectionBar.setAttribute("role", "group");
  selectionBar.setAttribute("aria-label", l("选中的原文", "Selected text"));
  // Keep the text selection when the bar's buttons are pressed.
  selectionBar.addEventListener("pointerdown", (event) => event.preventDefault());
  const paragraphText = (i) => snapshot.paragraphs[i]?.text || "";
  function textOffset(root, container, offset) {
    const range = document.createRange();
    range.setStart(root, 0);
    range.setEnd(container, offset);
    return range.toString().length;
  }
  function readSelection() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!article.contains(range.commonAncestorContainer)) return null;
    const texts = [...article.querySelectorAll(".paragraph-text")].filter((t) =>
      range.intersectsNode(t),
    );
    if (!texts.length) return null;
    const first = texts[0],
      last = texts.at(-1);
    const index = (t) => Number(t.closest(".source-paragraph").dataset.paragraphIndex);
    let start = {
      paragraphIndex: index(first),
      offset: first.contains(range.startContainer)
        ? textOffset(first, range.startContainer, range.startOffset)
        : 0,
    };
    let end = {
      paragraphIndex: index(last),
      offset: last.contains(range.endContainer)
        ? textOffset(last, range.endContainer, range.endOffset)
        : paragraphText(index(last)).length,
    };
    // Drop whitespace and empty paragraph ends at the edges of the selection.
    while (start.paragraphIndex < end.paragraphIndex && !paragraphText(start.paragraphIndex).slice(start.offset).trim())
      start = { paragraphIndex: start.paragraphIndex + 1, offset: 0 };
    while (end.paragraphIndex > start.paragraphIndex && !paragraphText(end.paragraphIndex).slice(0, end.offset).trim())
      end = { paragraphIndex: end.paragraphIndex - 1, offset: paragraphText(end.paragraphIndex - 1).length };
    const head = paragraphText(start.paragraphIndex).slice(start.offset);
    start = { ...start, offset: start.offset + head.length - head.trimStart().length };
    end = { ...end, offset: paragraphText(end.paragraphIndex).slice(0, end.offset).trimEnd().length };
    const focus = { start, end, text: selectionText(snapshot.paragraphs, { start, end }) };
    return focus.text && focus.text.trim().length >= 2 ? focus : null;
  }
  const sameFocus = (a, b) =>
    !!a &&
    a.start.paragraphIndex === b.start.paragraphIndex &&
    a.start.offset === b.start.offset &&
    a.end.paragraphIndex === b.end.paragraphIndex &&
    a.end.offset === b.end.offset;
  function selectionScope(focus) {
    return {
      // One paragraph on each side lets the model read the passage in context.
      start: Math.max(0, focus.start.paragraphIndex - 1),
      end: Math.min(total - 1, focus.end.paragraphIndex + 1),
      label: l("选段 · ", "Passage · ") + "「" + short(focus.text.replace(/\s+/g, " "), 16) + "」",
      focus,
    };
  }
  function onSelection() {
    if (!selectionFrame) selectionFrame = requestAnimationFrame(updateSelection);
  }
  function updateSelection() {
    selectionFrame = 0;
    if (disposed) return;
    const focus = snapshot.source ? readSelection() : null;
    if (!focus) {
      selectionBar.hidden = true;
      return;
    }
    selectionBar.replaceChildren();
    if (focus.text.length > MAX_FOCUS_CHARS) {
      selectionBar.append(
        el(
          "span",
          "selection-hint",
          l(
            "选段超过 " + MAX_FOCUS_CHARS + " 字，请缩短，或改用章节研读。",
            "Over " + MAX_FOCUS_CHARS + " characters. Select less, or read the chapter.",
          ),
        ),
      );
    } else {
      // The same passage was read before: open that reading instead of paying for another.
      const existing = records.find((r) => sameFocus(r.scope?.focus, focus));
      if (existing && existing.id !== saved.result?.id)
        selectionBar.append(
          button(l("查看这段的研读", "Open this passage's reading"), () => {
            document.getSelection()?.removeAllRanges();
            selectionBar.hidden = true;
            openRecord(existing.id);
          }, "secondary-action btn-sm"),
        );
      const go = button(
        existing ? l("重新研读这段", "Read this passage again") : l("AI 研读选段", "Study passage with AI"),
        () => {
          document.getSelection()?.removeAllRanges();
          selectionBar.hidden = true;
          analyze(selectionScope(focus));
        },
        "primary-action btn-sm",
      );
      go.prepend(icon("ai"));
      go.disabled = !!runningJob(readingKey);
      if (go.disabled) go.title = l("当前研读完成后再试", "Wait for the current reading to finish");
      selectionBar.append(go);
    }
    selectionBar.hidden = false;
    const rect = document.getSelection().getRangeAt(0).getBoundingClientRect();
    const width = selectionBar.offsetWidth,
      height = selectionBar.offsetHeight;
    const below = rect.bottom + 8;
    selectionBar.style.top =
      (below + height > innerHeight - 8 ? Math.max(8, rect.top - height - 8) : below) + "px";
    selectionBar.style.left =
      Math.min(Math.max(8, rect.left), Math.max(8, innerWidth - width - 8)) + "px";
  }
  // Paint the passage a reading was made for, without touching the text nodes.
  function rangeIn(root, from, to) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let seen = 0,
      started = false;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.data.length;
      if (!started && from <= seen + length) {
        range.setStart(node, from - seen);
        started = true;
      }
      if (started && to <= seen + length) {
        range.setEnd(node, to - seen);
        return range;
      }
      seen += length;
    }
    return null;
  }
  function paintFocus() {
    const highlights = globalThis.CSS?.highlights;
    if (!highlights || typeof Highlight === "undefined") return;
    highlights.delete("digest-focus");
    const focus = saved.result?.scope?.focus;
    if (!focus || saved.stale || !validFocus(focus, snapshot.paragraphs)) return;
    const ranges = [];
    for (let i = focus.start.paragraphIndex; i <= focus.end.paragraphIndex; i++) {
      const node = paragraphNodes.get(i)?.text;
      if (!node) continue;
      const from = i === focus.start.paragraphIndex ? focus.start.offset : 0;
      const to = i === focus.end.paragraphIndex ? focus.end.offset : node.textContent.length;
      const range = rangeIn(node, from, to);
      if (range) ranges.push(range);
    }
    highlights.set("digest-focus", new Highlight(...ranges));
  }
  function showFocus(focus) {
    if (disposed) return;
    setTab("source");
    pauseFollow();
    paintFocus();
    const nodes = paragraphNodes.get(focus.start.paragraphIndex);
    if (nodes) centerWithin(sourceScroll, nodes.wrapper);
  }

  // ---------- Notes panel ----------
  const aiPanel = el("section", "ai-panel");
  aiPanel.id = "reader-ai";
  aiPanel.setAttribute("aria-label", l("研读笔记", "Study notes"));
  const notesHead = el("div", "notes-head");
  const notesTitle = el("div", "notes-title");
  notesTitle.append(
    el("p", "notes-kicker", l("研读笔记", "Study notes")),
    el("p", "notes-mode", READING_MODES[item.readingMode]),
  );
  const recordsBox = el("div", "reading-records");
  notesHead.append(notesTitle, recordsBox);
  const aiScroll = el("div", "ai-scroll");
  aiScroll.tabIndex = 0;
  const claimNodes = new Map();
  // Pinned outside the scroll so it is seen wherever the notes are scrolled.
  const banner = el("div", "scope-banner");
  banner.hidden = true;
  aiPanel.append(notesHead, banner, aiScroll);
  split.append(sourcePanel, aiPanel);

  // ---------- Contents drawer ----------
  const scrim = el("div", "reader-scrim");
  scrim.hidden = true;
  const toc = el("aside", "reader-toc");
  toc.hidden = true;
  toc.setAttribute("aria-label", l("目录", "Contents"));
  let tocReturn = null;
  function openToc() {
    renderToc();
    tocReturn = document.activeElement;
    toc.hidden = scrim.hidden = false;
    toc.querySelector(".is-current button, button, input")?.focus();
  }
  function closeToc(restore = true) {
    if (toc.hidden) return;
    toc.hidden = scrim.hidden = true;
    if (restore) tocReturn?.focus({ preventScroll: true });
  }
  tocButton.addEventListener("click", openToc);
  scrim.addEventListener("click", () => closeToc());
  function covered(chapter) {
    return records.some(
      (r) => r.scope && r.scope.start <= chapter.start && r.scope.end >= chapter.end,
    );
  }
  function renderToc() {
    const head = el("div", "reader-toc-head");
    head.append(el("h2", "", l("目录", "Contents")));
    const close = button("", () => closeToc(), "dialog-close");
    close.append(icon("x"));
    close.setAttribute("aria-label", l("关闭目录", "Close contents"));
    head.append(close);
    const list = el("ol", "reader-toc-list");
    const headings = snapshot.paragraphs.filter((p) => p.heading && p.heading <= 3);
    const currentChapter = chapterAt(currentIndex);
    const entry = (label, index, depth, badge) => {
      const b = button(short(label, 60), () => jumpTo(index), "reader-toc-entry depth-" + depth);
      if (badge) b.append(badge);
      return b;
    };
    if (chapters.length) {
      chapters.forEach((chapter, c) => {
        const li = el("li", c === currentChapter ? "is-current" : "");
        const done = covered(chapter);
        li.append(
          entry(
            chapterLabel(c),
            chapter.start,
            0,
            el("span", "badge " + (done ? "is-success" : "is-outline"), done ? l("已研读", "Read") : l("未研读", "Not yet")),
          ),
        );
        const subs = el("ol");
        for (const p of headings)
          if (p.paragraphIndex > chapter.start && p.paragraphIndex <= chapter.end && p.heading >= 2) {
            const sub = el("li");
            sub.append(entry(p.text, p.paragraphIndex, 1));
            subs.append(sub);
          }
        if (subs.children.length) li.append(subs);
        list.append(li);
      });
    } else if (headings.length) {
      for (const p of headings) {
        const li = el("li");
        li.append(entry(p.text, p.paragraphIndex, p.heading - 1));
        list.append(li);
      }
    }
    const jump = el("label", "reader-toc-jump", l("跳到段落", "Go to paragraph"));
    const input = el("input", "core-input");
    input.type = "number";
    input.min = 1;
    input.max = total;
    input.placeholder = "1–" + total;
    input.addEventListener("change", () => {
      const n = Math.round(Number(input.value));
      if (n >= 1 && n <= total) jumpTo(n - 1);
    });
    jump.append(input);
    toc.replaceChildren(head, list.children.length ? list : el("p", "reader-muted", l("这份资料没有可识别的标题结构。", "No headings were detected in this source.")), jump);
  }
  function jumpTo(index) {
    closeToc(false);
    setTab("source");
    const nodes = paragraphNodes.get(index);
    if (!nodes) return;
    nodes.wrapper.tabIndex = -1;
    nodes.wrapper.focus({ preventScroll: true });
    centerWithin(sourceScroll, nodes.wrapper, "start");
  }

  // ---------- Study scope (lives in the notes panel) ----------
  const controls = el("div", "reading-controls");
  const chunkCount = (start, end) =>
    readingChunks(
      snapshot.paragraphs.filter(
        (p) => p.paragraphIndex >= start && p.paragraphIndex <= end,
      ),
    ).length;
  const wholeFits = total > 0 && chunkCount(0, total - 1) <= MAX_CHUNKS;
  const rangeLabel = el("label", "", tr("研读范围"));
  const range = el("select", "core-input");
  for (const [value, text, disabled] of [
    ...(chapters.length > 1 ? [["chapters", l("按章节研读", "By chapter")]] : []),
    [
      "all",
      wholeFits
        ? tr("全文分段研读")
        : l("全文（超出单次上限）", "Whole text (over the limit)"),
      !wholeFits,
    ],
    ["range", tr("选择段落范围")],
  ]) {
    const option = el("option", "", text);
    option.value = value;
    option.disabled = !!disabled;
    range.append(option);
  }
  rangeLabel.append(range);
  const fromChapterLabel = el("label", "", l("起始章节", "From chapter")),
    toChapterLabel = el("label", "", l("结束章节", "To chapter"));
  const fromChapter = el("select", "core-input"),
    toChapter = el("select", "core-input");
  chapters.forEach((_, i) => {
    for (const select of [fromChapter, toChapter]) {
      const option = el("option", "", short(chapterLabel(i)));
      option.value = i;
      select.append(option);
    }
  });
  fromChapterLabel.append(fromChapter);
  toChapterLabel.append(toChapter);
  const fromLabel = el("label", "", tr("起始段落")),
    toLabel = el("label", "", tr("结束段落"));
  const from = el("input", "core-input"),
    to = el("input", "core-input");
  for (const input of [from, to]) {
    input.type = "number";
    input.min = 1;
    input.max = total;
  }
  from.value = 1;
  // Default paragraph range: the longest opening stretch that fits one run.
  let fitEnd = 0;
  while (fitEnd + 1 < total && chunkCount(0, fitEnd + 1) <= MAX_CHUNKS) fitEnd++;
  to.value = wholeFits ? total : fitEnd + 1;
  fromLabel.append(from);
  toLabel.append(to);
  range.value = wholeFits ? "all" : chapters.length > 1 ? "chapters" : "range";
  const languageLabel = el("label", "", tr("反馈语言")),
    language = el("select", "core-input");
  for (const [value, text] of [
    ["zh-CN", tr("简体中文")],
    ["en", "English"],
  ]) {
    const o = el("option", "", text);
    o.value = value;
    language.append(o);
  }
  language.value = getLocale();
  languageLabel.append(language);
  const scopeHint = el("p", "scope-hint");
  scopeHint.setAttribute("role", "status");
  controls.append(
    rangeLabel,
    fromChapterLabel,
    toChapterLabel,
    fromLabel,
    toLabel,
    languageLabel,
    scopeHint,
  );
  // Start the scope at the loaded reading, so "re-read" repeats what is on screen.
  const startScope = saved.result?.scope;
  function setScope(start, end) {
    const a = chapters.findIndex((c) => c.start === start),
      b = chapters.findIndex((c) => c.end === end);
    if (start === 0 && end === total - 1 && wholeFits) range.value = "all";
    else if (a >= 0 && b >= a) {
      range.value = "chapters";
      fromChapter.value = a;
      toChapter.value = b;
    } else {
      range.value = "range";
      from.value = start + 1;
      to.value = end + 1;
    }
  }
  if (startScope && Number.isInteger(startScope.start)) setScope(startScope.start, startScope.end);
  function currentScope() {
    if (range.value === "chapters") {
      const a = Number(fromChapter.value),
        b = Number(toChapter.value);
      if (b < a)
        return { error: l("结束章节不能早于起始章节。", "The last chapter must not come before the first.") };
      return {
        start: chapters[a].start,
        end: chapters[b].end,
        label:
          a === b
            ? chapterLabel(a)
            : l("第 " + (a + 1) + "–" + (b + 1) + " 章", "Chapters " + (a + 1) + "–" + (b + 1)),
      };
    }
    if (range.value === "range") {
      const a = Number(from.value),
        b = Number(to.value);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > total || a > b)
        return { error: tr("请选择有效的段落范围。") };
      return {
        start: a - 1,
        end: b - 1,
        label: l("段落 " + a + "–" + b, "Paragraphs " + a + "–" + b),
      };
    }
    return { start: 0, end: total - 1, label: null };
  }
  function scopeProblem() {
    const scope = currentScope();
    if (scope.error) return scope.error;
    if (chunkCount(scope.start, scope.end) > MAX_CHUNKS)
      return l(
        "这个范围超过单次 12 个分段的上限，请缩小范围" +
          (chapters.length > 1 ? "（例如只选一章）。" : "。"),
        "This range is over the 12-section limit for one run. Choose a smaller range" +
          (chapters.length > 1 ? " (for example, one chapter)." : "."),
      );
    return "";
  }
  function updateScope() {
    fromChapterLabel.hidden = toChapterLabel.hidden = range.value !== "chapters";
    fromLabel.hidden = toLabel.hidden = range.value !== "range";
    const problem = scopeProblem();
    scopeHint.classList.toggle("is-error", !!problem);
    if (problem) scopeHint.textContent = problem;
    else {
      const scope = currentScope();
      scopeHint.textContent =
        (scope.label ? scope.label + " · " : "") +
        tr("预计分段：") +
        chunkCount(scope.start, scope.end) +
        " / " +
        MAX_CHUNKS +
        l(" · 已完成部分可续跑", " · Finished sections resume");
    }
    if (status !== "analyzing")
      for (const action of [analyzeButton, ...aiScroll.querySelectorAll(".start-reading")])
        action.disabled = !snapshot.source || !!problem;
  }
  range.addEventListener("change", updateScope);
  for (const input of [from, to]) input.addEventListener("input", updateScope);
  fromChapter.addEventListener("change", () => {
    if (Number(toChapter.value) < Number(fromChapter.value))
      toChapter.value = fromChapter.value;
    updateScope();
  });
  toChapter.addEventListener("change", updateScope);
  if (partial?.parts?.length) {
    const [, start, end, lang, , at] = JSON.parse(partial.key);
    language.value = lang || getLocale();
    setScope(start, end);
    // An unfinished selection reading resumes with its passage.
    const focus = at && { ...at, text: selectionText(snapshot.paragraphs, at) };
    if (focus && validFocus(focus, snapshot.paragraphs)) retryScope = selectionScope(focus);
  }

  root.append(header, prefsPanel, tabs, split, scrim, toc, selectionBar);
  container.replaceChildren(root);
  applyPrefs();
  setTab("source");
  renderAI();
  updateScope();
  renderRecords().catch(() => {});
  const initialAnchor = saved.anchors.find(
    (a) =>
      a.id === routeParams.get("evidence") && a.validationStatus === "matched",
  );
  const initialClaim =
    saved.result &&
    Object.values(saved.result.sections)
      .flatMap((s) => s.items)
      .find((c) =>
        initialAnchor
          ? c.evidenceIds.includes(initialAnchor.id)
          : c.id === routeParams.get("claim"),
      );
  if (initialAnchor) {
    locate(initialAnchor, initialClaim?.id || null);
    if (!initialClaim && returnPath)
      returnButton.textContent = tr("← 返回反馈");
  } else if (initialClaim) {
    // Opened from search or history: show that note next to its source.
    const anchor = saved.anchors.find(
      (a) => initialClaim.evidenceIds.includes(a.id) && a.validationStatus === "matched",
    );
    if (anchor) locate(anchor, initialClaim.id);
    else
      requestAnimationFrame(() => {
        activeClaim = initialClaim.id;
        setTab("ai");
        claimNodes.get(initialClaim.id)?.classList.add("claim-selected");
        focusCard(initialClaim.id);
      });
  } else if (routeParams.has("result") && saved.result?.scope?.focus && !saved.stale) {
    requestAnimationFrame(() => showFocus(saved.result.scope.focus));
  } else {
    // Switching between readings keeps the reader where it was.
    const key = "digest:reader-pos:" + item.id;
    let kept = 0;
    try {
      kept = Number(sessionStorage.getItem(key));
      sessionStorage.removeItem(key);
    } catch {}
    if (kept > 0)
      requestAnimationFrame(() => {
        const nodes = paragraphNodes.get(kept);
        if (nodes) centerWithin(sourceScroll, nodes.wrapper, "start", true);
      });
  }
  requestAnimationFrame(updatePosition);
  const readingKey = "reading:" + item.id;
  const unwatchReading = watchJob(readingKey, onReadingJob);
  const runningReading = getJob(readingKey);
  if (runningReading && runningReading.status !== "idle") onReadingJob(runningReading);

  function setTab(tab) {
    root.dataset.tab = tab;
    sourceTab.setAttribute("aria-selected", String(tab === "source"));
    aiTab.setAttribute("aria-selected", String(tab === "ai"));
    sourceTab.tabIndex = tab === "source" ? 0 : -1;
    aiTab.tabIndex = tab === "ai" ? 0 : -1;
  }
  function centerWithin(scroll, target, align = "center", instant = false) {
    const a = scroll.getBoundingClientRect(),
      b = target.getBoundingClientRect();
    scroll.scrollTo({
      top:
        scroll.scrollTop +
        b.top -
        a.top -
        (align === "start" ? 24 : (a.height - b.height) / 2),
      behavior:
        instant || matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
    });
  }
  // A second smooth scroll would cancel the source scroll in Chromium, so notes move instantly.
  function revealCard(node) {
    if (!node || root.classList.contains("notes-collapsed")) return;
    const a = aiScroll.getBoundingClientRect(),
      b = node.getBoundingClientRect();
    if (b.top < a.top + 60 || b.bottom > a.bottom - 20)
      aiScroll.scrollTo({ top: aiScroll.scrollTop + b.top - a.top - 120, behavior: "instant" });
  }
  function focusCard(claimId) {
    const target = claimNodes.get(claimId);
    if (!target) return;
    target.focus({ preventScroll: true });
    revealCard(target);
  }
  function locate(anchor, claimId) {
    if (anchor.validationStatus !== "matched") return;
    new TrainingRepository(db)
      .track("evidence_opened", { documentId: item.id, evidenceId: anchor.id })
      .catch(() => {});
    activeClaim = claimId;
    selectedAnchor = anchor.id;
    document.querySelectorAll(".claim-inline").forEach((n) => n.remove());
    for (const [index, nodes] of paragraphNodes) {
      const paragraph = snapshot.paragraphs.find(
        (p) => p.paragraphIndex === index,
      );
      const selected = index === anchor.paragraphIndex;
      nodes.wrapper.classList.toggle("evidence-target", selected);
      highlightQuote(nodes.text, paragraph.text, selected ? anchor : null);
    }
    paintFocus();
    for (const [id, node] of claimNodes)
      node.classList.toggle("claim-selected", id === claimId);
    root
      .querySelectorAll("[data-evidence-id]")
      .forEach((node) =>
        node.setAttribute(
          "aria-pressed",
          String(node.dataset.evidenceId === selectedAnchor),
        ),
      );
    setTab("source");
    returnButton.hidden = false;
    pauseFollow();
    revealCard(claimNodes.get(claimId));
    requestAnimationFrame(() => {
      const target = paragraphNodes.get(anchor.paragraphIndex);
      if (target)
        centerWithin(
          sourceScroll,
          target.text.querySelector("mark") || target.wrapper,
        );
    });
  }

  // ---------- Claims shown in notes and as source markers ----------
  function claimsFrom(result, anchors, partialPart = false) {
    const sections = MODE_SECTIONS[item.readingMode] || {};
    return Object.entries(result.sections).flatMap(([name, section]) =>
      section.items.map((claim) => {
        const evidence = claim.evidenceIds
          .map((id) => anchors.find((a) => a.id === id))
          .filter(Boolean);
        const reliable = evidence.filter((a) => a.validationStatus === "matched");
        return {
          raw: claim,
          id: claim.id,
          text: claim.text,
          kind: claim.kind,
          section: sections[name] || name,
          evidence,
          reliable,
          at: reliable.length ? reliable[0].paragraphIndex : Infinity,
          partial: partialPart,
        };
      }),
    );
  }
  function byPosition(a, b) {
    return a.at - b.at;
  }
  function partialClaims() {
    return (partial?.parts || []).flatMap((part) =>
      claimsFrom(part.result, part.anchors || [], true),
    );
  }
  function resultClaims() {
    return saved.result ? claimsFrom(saved.result, saved.anchors) : [];
  }
  function shownClaims() {
    return (status === "analyzing" || errorMessage || !saved.result) && partial?.parts?.length
      ? partialClaims()
      : resultClaims();
  }
  function renderMarks() {
    const claims = shownClaims();
    for (const [index, nodes] of paragraphNodes) {
      const here = claims.filter((c) => c.reliable.some((a) => a.paragraphIndex === index));
      nodes.mark?.remove();
      nodes.mark = null;
      nodes.wrapper.classList.toggle("has-notes", here.length > 0);
      if (!here.length) continue;
      const mark = button(String(here.length), () => toggleInline(index, mark), "note-mark");
      mark.dataset.kinds = [...new Set(here.map((c) => KIND_TONE[c.kind]))].join(" ");
      mark.setAttribute(
        "aria-label",
        l("本段有 " + here.length + " 条研读判断", here.length + " study notes on this paragraph"),
      );
      mark.setAttribute("aria-expanded", "false");
      nodes.wrapper.prepend(mark);
      nodes.mark = mark;
    }
    paintFocus();
  }
  function toggleInline(index, mark) {
    const nodes = paragraphNodes.get(index);
    const open = nodes.wrapper.nextElementSibling?.classList.contains("claim-inline");
    document.querySelectorAll(".claim-inline").forEach((n) => n.remove());
    document
      .querySelectorAll(".note-mark[aria-expanded=true]")
      .forEach((m) => m.setAttribute("aria-expanded", "false"));
    if (open) return;
    const here = shownClaims().filter((c) => c.reliable.some((a) => a.paragraphIndex === index));
    if (matchMedia("(max-width: 799px)").matches) {
      setTab("ai");
      if (here[0]) requestAnimationFrame(() => focusCard(here[0].id));
      return;
    }
    const box = el("div", "claim-inline");
    for (const claim of here) {
      const row = el("div", "claim-inline-item");
      row.append(kindChip(claim), el("p", "", claim.text));
      const go = button(l("在笔记中查看", "Show in notes"), () => {
        if (!prefs.notes) {
          prefs.notes = true;
          savePrefs(prefs);
          applyPrefs();
        }
        claimNodes.get(claim.id)?.classList.add("claim-selected");
        focusCard(claim.id);
      }, "quiet-link");
      row.append(go);
      box.append(row);
    }
    nodes.wrapper.after(box);
    mark.setAttribute("aria-expanded", "true");
  }
  function kindChip(claim) {
    const chip = el("span", "claim-kind kind-" + claim.kind, CLAIM_KINDS[claim.kind]);
    chip.dataset.tone = KIND_TONE[claim.kind];
    return chip;
  }
  function claimCard(claim, editable) {
    const node = el("article", "reading-claim");
    node.tabIndex = -1;
    node.dataset.claimId = claim.id;
    if (Number.isFinite(claim.at)) node.dataset.at = claim.at;
    node.classList.toggle("claim-selected", claim.id === activeClaim);
    const head = el("div", "claim-head");
    head.append(kindChip(claim), el("span", "claim-section", claim.section));
    node.append(head, el("p", "claim-text", claim.text));
    const actions = el("div", "claim-evidence");
    for (const anchor of claim.reliable) {
      const action = button("", () => locate(anchor, claim.id), "evidence-action");
      action.dataset.evidenceId = anchor.id;
      action.setAttribute("aria-pressed", String(anchor.id === selectedAnchor));
      const where =
        (anchor.pageNumber ? tr("第 ") + anchor.pageNumber + tr(" 页 · ") : "") +
        tr("第 ") +
        (anchor.paragraphIndex + 1) +
        tr(" 段");
      const inFocus = !claim.partial && anchorInFocus(anchor, saved.result?.scope?.focus);
      const label = el(
        "span",
        "evidence-location",
        l("原文 · ", "Source · ") + where + (inFocus ? l(" · 出自选段", " · in your passage") : ""),
      );
      label.prepend(icon("quote"));
      action.append(label, el("q", "evidence-quote", anchor.quote));
      action.title = where;
      actions.append(action);
    }
    if (!claim.reliable.length)
      actions.append(el("span", "evidence-unavailable", tr("暂无可靠原文依据")));
    if (claim.evidence.some((a) => a.validationStatus === "ambiguous"))
      actions.append(el("small", "evidence-note", tr("引文重复，无法唯一定位")));
    else if (claim.evidence.some((a) => a.validationStatus === "invalid"))
      actions.append(el("small", "evidence-note", tr("引用未通过原文核对")));
    node.append(actions);
    if (editable) {
      const label = claim.raw.knowledgeLabel || claim.text.slice(0, 36);
      const exists = units.some(
        (u) => u.readingResultId === saved.result.id && u.claimId === claim.id,
      );
      const save = button(
        exists ? tr("已沉淀") : tr("沉淀为知识点"),
        () =>
          editName(tr("知识点名称"), label, async (name) => {
            const unit = await learning.confirmUnit(snapshot, saved.result, claim.raw, name);
            units.push(unit || { readingResultId: saved.result.id, claimId: claim.id });
            save.disabled = true;
            save.textContent = tr("已沉淀");
            if (feedbackLine) message(feedbackLine, tr("知识点已保存，来源和判断一同保留"));
          }),
        "secondary-action btn-sm",
      );
      save.disabled = exists;
      const row = el("div", "claim-actions");
      row.append(save);
      node.append(row);
    }
    claimNodes.set(claim.id, node);
    return node;
  }

  // ---------- Notes rendering ----------
  function progressCard() {
    const box = el("div", "analysis-state analysis-running");
    box.setAttribute("role", "status");
    box.append(
      el("span", "analysis-progress"),
      el("h3", "", tr("正在研读这份资料")),
      el("p", "", progressText || tr("提炼判断，并逐条核对原文引用。")),
    );
    if (progress?.total) {
      const steps = el("ol", "progress-steps");
      for (let i = 0; i < progress.total; i++) {
        const state = i < progress.done ? "done" : i === progress.done && !progress.synth ? "running" : "todo";
        const li = el("li", "is-" + state, l("分段 " + (i + 1) + "/" + progress.total, "Section " + (i + 1) + "/" + progress.total));
        li.prepend(el("span", "step-dot"));
        steps.append(li);
      }
      if (progress.total > 1) {
        const li = el("li", "is-" + (progress.synth ? "running" : "todo"), l("整合整体概览", "Overview"));
        li.prepend(el("span", "step-dot"));
        steps.append(li);
      }
      box.append(steps);
    }
    box.append(
      el("p", "reader-muted", l("可以继续阅读原文；每完成一个分段，判断会陆续出现在下方，原文旁也会出现标记。", "Keep reading; notes and source markers appear as each section finishes.")),
      button(tr("取消分析"), () => cancelJob(readingKey), "secondary-action btn-sm"),
    );
    return box;
  }
  function errorCard() {
    const box = el("div", "analysis-state analysis-error");
    box.setAttribute("role", "status");
    box.append(
      el(
        "h3",
        "",
        errorCode === "no_configuration"
          ? tr("连接你的 Developer AI Service")
          : tr("本次分析未完成"),
      ),
      el("p", "", errorMessage),
    );
    if (partial?.parts?.length && errorCode !== "no_configuration")
      box.append(
        el("p", "", l("已完成的 " + partial.parts.length + " 个分段已保存，保持相同范围与语言重试会从断点继续。", partial.parts.length + " finished section(s) are saved; retrying with the same range and language continues from there.")),
      );
    if (errorCode === "no_configuration")
      box.append(
        button(tr("配置 Developer AI Service"), () =>
          openAIConfiguration(() => {
            errorMessage = "";
            errorCode = "";
            renderAI();
          }),
          "primary-action btn-sm",
        ),
      );
    else
      box.append(
        button(tr("重试"), () => analyze(retryScope), "primary-action btn-sm"),
        ...(!useProxy()
          ? [button(tr("检查服务配置"), () => openAIConfiguration(), "secondary-action btn-sm")]
          : []),
      );
    if (saved.result) box.append(el("small", "", tr("以下保留上一次成功结果。")));
    return box;
  }
  function startButton(text) {
    const b = button(text, analyze, "primary-action start-reading");
    b.prepend(icon("ai"));
    b.disabled = !snapshot.source || !!scopeProblem();
    return b;
  }
  function emptyCard() {
    const box = el("div", "analysis-state analysis-empty");
    box.append(
      el("p", "page-kicker", tr("FROM SOURCE TO UNDERSTANDING")),
      el("h2", "", tr("让每个判断，有据可查。")),
      el(
        "p",
        "",
        tr(
          "研读会围绕这份资料提炼结构，区分资料陈述与 AI 推论。每条可靠引用都能带你回到原文。",
        ),
      ),
      controls,
      startButton(tr("开始 AI 研读")),
      el("small", "", tr("先读原文也很好。你的资料已保存在本地。")),
    );
    return box;
  }
  function partialSection() {
    const claims = partialClaims().sort(byPosition);
    if (!claims.length) return null;
    const box = el("section", "partial-preview");
    box.append(
      el("p", "partial-title", tr("已保存分段：") + partial.parts.length),
      el(
        "p",
        "reader-muted",
        tr(
          "这是已完成部分的预览，不是全文结论。保持相同范围与语言重试，可继续未完成部分。",
        ),
      ),
    );
    for (const claim of claims) box.append(claimCard(claim, false));
    return box;
  }
  function resultView() {
    const frag = document.createDocumentFragment();
    const result = saved.result;
    const scope = result.scope;
    if (scope?.focus) {
      const f = scope.focus;
      const box = el("section", "focus-passage");
      box.append(
        el(
          "p",
          "page-kicker",
          l("选段研读 · 第 ", "Passage reading · ¶ ") +
            (f.start.paragraphIndex + 1) +
            (f.end.paragraphIndex > f.start.paragraphIndex ? "–" + (f.end.paragraphIndex + 1) : "") +
            l(" 段 · 前后各一段作为上下文", " · one paragraph of context on each side"),
        ),
        el("blockquote", "focus-quote", f.text),
      );
      if (!saved.stale)
        box.append(button(l("在原文中定位", "Show in the text"), () => showFocus(f), "reader-link"));
      frag.append(box);
    } else if (scope)
      frag.append(
        el(
          "p",
          "scope-notice",
          (scope.label || (scope.partial ? tr("范围研读") : tr("全文分段研读"))) +
            " · " +
            (scope.start + 1) +
            "–" +
            (scope.end + 1) +
            " / " +
            scope.totalParagraphs +
            " · " +
            scope.chunks +
            tr(" 个分段。概览基于分段判断整合，跨章节结论仍需核查。"),
        ),
      );
    if (saved.stale)
      frag.append(
        el(
          "p",
          "reader-error-text",
          tr("原文已变化，旧引用已标记为 stale，请重新研读。"),
        ),
      );
    if (result.overview) {
      const overview = el("section", "reading-overview");
      overview.append(
        el("p", "page-kicker", tr("整体概览 · 请结合原文核查")),
        el("h2", "", tr("先抓住这份材料的重点")),
        el("p", "", result.overview.summary),
      );
      for (const point of result.overview.points) {
        const row = el("div", "overview-point");
        row.append(el("p", "", point.text));
        for (const cid of point.claimIds)
          row.append(
            button(
              tr("查看对应判断"),
              () => {
                const n = claimNodes.get(cid);
                if (n) {
                  n.focus({ preventScroll: true });
                  centerWithin(aiScroll, n);
                }
              },
              "reader-link",
            ),
          );
        overview.append(row);
      }
      frag.append(overview);
    }
    const claims = resultClaims().sort(byPosition);
    const covered = claims.filter((c) => c.reliable.length).length;
    const coverage = el("div", "evidence-coverage");
    coverage.append(
      el("strong", "", covered + " / " + claims.length + tr(" 有原文依据")),
      el("p", "", tr("原文依据可定位不代表 AI 推论必然成立，请结合原文核对。")),
    );
    // Say which service wrote this reading; a developer or QA endpoint is never the trial service.
    const source = result.provenance;
    if (source)
      coverage.append(
        el(
          "p",
          "reading-provenance" + (source.service === "trial" ? "" : " is-developer"),
          source.service === "trial"
            ? l("由试用 AI 服务生成（服务器调用真实模型）。", "Written by the trial AI service (a real model, called from the server).")
            : l("由开发者服务生成", "Written by a developer service") +
                ([source.host, source.model].filter(Boolean).length
                  ? "（" + [source.host, source.model].filter(Boolean).join(" · ") + "）"
                  : "") +
                l("，用于本地开发或测试，不是试用服务。", ", for local development or testing — not the trial service."),
        ),
      );
    frag.append(coverage);
    const toolbar = el("div", "notes-toolbar");
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", l("筛选研读判断", "Filter notes"));
    for (const [value, text] of [["all", l("全部", "All")], ...Object.entries(CLAIM_KINDS)]) {
      const count = value === "all" ? claims.length : claims.filter((c) => c.kind === value).length;
      const chip = button(text, () => {
        kindFilter = value;
        renderAI();
      }, "filter-chip" + (kindFilter === value ? " active" : ""));
      chip.append(el("i", "", String(count)));
      chip.setAttribute("aria-pressed", String(kindFilter === value));
      chip.disabled = !count;
      toolbar.append(chip);
    }
    const follow = el("label", "notes-follow");
    const followBox = el("input");
    followBox.type = "checkbox";
    followBox.checked = prefs.follow;
    followBox.addEventListener("change", () => {
      prefs.follow = followBox.checked;
      savePrefs(prefs);
    });
    follow.append(followBox, document.createTextNode(l("跟随原文", "Follow reading")));
    toolbar.append(follow);
    frag.append(toolbar);
    feedbackLine = el("p");
    frag.append(feedbackLine);
    const list = el("section", "reading-section");
    list.setAttribute("aria-label", l("研读判断", "Study notes"));
    const editable = !saved.stale;
    for (const claim of claims.filter((c) => kindFilter === "all" || c.kind === kindFilter))
      list.append(claimCard(claim, editable));
    for (const [name, section] of Object.entries(result.sections))
      if (section.status === "missing")
        list.append(
          el(
            "p",
            "section-missing",
            tr("材料不足 · ") +
              ((MODE_SECTIONS[item.readingMode] || {})[name] || name) +
              l("：", ": ") +
              section.missingReason,
          ),
        );
    frag.append(list);
    if (editable) frag.append(reviewSection(), nextSection());
    else
      frag.append(
        el(
          "p",
          "reader-muted",
          tr("此研读版本的原文已变化，不能加入复习或沉淀知识点。"),
        ),
      );
    frag.append(
      el(
        "p",
        "reading-footnote",
        tr("研读结果保存在本地 · ") +
          new Date(result.createdAt).toLocaleString(getLocale()),
      ),
    );
    const other = el("details", "reading-setup");
    other.append(el("summary", "", l("研读其他范围", "Read another range")), controls, startButton(l("按此范围研读", "Read this range")));
    frag.append(other);
    return frag;
  }
  function reviewSection() {
    const box = el("section", "learning-tools");
    box.append(el("h3", "", tr("值得回忆的问题")));
    if (!saved.result.reviewQuestions.length)
      box.append(el("p", "reader-muted", tr("本次研读没有建议问题。")));
    for (const question of saved.result.reviewQuestions) {
      const row = el("div", "learning-suggestion");
      row.append(el("p", "", question.question));
      const exists = cards.some(
        (c) =>
          c.documentId === snapshot.documentId &&
          c.questionKey === normalizeQuestion(question.question),
      );
      const add = button(
        exists ? tr("已在复习中") : tr("加入复习"),
        async () => {
          add.disabled = true;
          try {
            const card = await learning.addReview(snapshot, saved.result, question);
            cards.push(card || { documentId: snapshot.documentId, questionKey: normalizeQuestion(question.question) });
            add.textContent = tr("已在复习中");
            message(feedbackLine, tr("题目已保存，可开始今日复习"));
          } catch (e) {
            message(feedbackLine, e.message, true);
            add.disabled = false;
          }
        },
        "secondary-action btn-sm",
      );
      add.disabled = exists;
      row.append(add);
      box.append(row);
    }
    box.append(link(tr("前往复习 →"), "/app/review"));
    return box;
  }
  function nextSection() {
    const box = el("section", "reader-next");
    box.append(
      el("p", "notes-kicker", l("下一步", "Next step")),
      el("h3", "", l("读完了，试着用自己的话回答", "Now try answering in your own words")),
    );
    const course = courses.find((c) => c.documentIds?.includes(item.id));
    box.append(
      el(
        "p",
        "reader-muted",
        course
          ? l("在课程里用这份材料出一道练习题，先独立作答，再看反馈。", "Create a practice question from this source in your course, answer it yourself, then check the feedback.")
          : l("先把这份材料加入一个课程，就能围绕它出题、作答和修订。", "Add this source to a course to practise with it: question, answer, revise."),
      ),
    );
    const row = el("div", "reader-next-actions");
    row.append(
      course
        ? link(l("去「" + short(course.title, 18) + "」出题练习", "Practise in “" + short(course.title, 18) + "”"), "/app/courses/" + encodeURIComponent(course.id), "primary-action")
        : link(l("打开课程", "Open courses"), "/app/courses", "primary-action"),
      link(tr("查看知识网络 →"), "/app/graph"),
    );
    box.append(row);
    return box;
  }
  function renderAI() {
    if (disposed) return;
    const keep = aiScroll.scrollTop;
    delete banner.dataset.for;
    root.dataset.analysisState = status;
    analyzeButton.textContent =
      status === "analyzing"
        ? tr("分析中…")
        : saved.result
          ? tr("重新研读")
          : tr("开始研读");
    analyzeButton.disabled =
      status === "analyzing" || !snapshot.source || !!scopeProblem();
    for (const input of controls.querySelectorAll("input,select"))
      input.disabled = status === "analyzing";
    aiScroll.replaceChildren();
    claimNodes.clear();
    if (status === "analyzing") aiScroll.append(progressCard());
    else if (errorMessage) aiScroll.append(errorCard());
    const preview = (status === "analyzing" || errorMessage || !saved.result) && partial?.parts?.length ? partialSection() : null;
    if (!saved.result) {
      if (status !== "analyzing" && !errorMessage) aiScroll.append(emptyCard());
      else if (errorCode !== "no_configuration" && status !== "analyzing") {
        const other = el("details", "reading-setup");
        other.append(el("summary", "", l("调整研读范围", "Adjust the range")), controls);
        aiScroll.append(other);
      }
      if (preview) aiScroll.append(preview);
    } else {
      if (preview) aiScroll.append(preview);
      aiScroll.append(resultView());
    }
    renderMarks();
    aiScroll.scrollTop = keep;
    updatePosition();
  }
  // AI reading runs as an app-level job, so leaving the Reader does not cancel it.
  // `override` is a selection scope; buttons pass their click event, which is ignored.
  function analyze(override) {
    if (disposed || runningJob(readingKey) || !snapshot.source) return;
    const chosen = override?.focus ? override : null;
    setTab("ai");
    const config = readDeveloperConfig();
    if (!useProxy() && (!config.endpoint || !config.model || !config.key)) {
      errorCode = "no_configuration";
      errorMessage = tr(
        "阅读不需要配置 AI。若要分析，请先连接兼容 Chat Completions 的开发者服务。",
      );
      status = "needs_attention";
      renderAI();
      return;
    }
    const problem = chosen
      ? chunkCount(chosen.start, chosen.end) > MAX_CHUNKS
        ? l("选段所在段落过长，请改用章节研读。", "The paragraphs around this passage are too long. Use chapter reading instead.")
        : ""
      : scopeProblem();
    if (problem) {
      errorCode = "";
      errorMessage = problem;
      status = "failed";
      renderAI();
      return;
    }
    const scope = chosen || currentScope();
    retryScope = chosen;
    const lang = language.value;
    const transport = createTransport("digest");
    let host = "";
    try {
      host = new URL(config.endpoint).host;
    } catch {}
    const provenance =
      transport instanceof ProxyTransport
        ? { service: "trial" }
        : { service: "developer", host, model: config.model };
    errorMessage = "";
    errorCode = "";
    progress = null;
    progressText = "";
    new TrainingRepository(db)
      .track("reading_started", { documentId: item.id, ...(chosen ? { selection: true } : {}) })
      .catch(() => {});
    startJob(
      readingKey,
      {
        kind: "reading",
        label:
          l("研读 · ", "Reading · ") +
          short(item.title, 24) +
          (scope.label ? " · " + short(scope.label, 20) : ""),
        href: "/app/reader/" + encodeURIComponent(item.id),
      },
      async (signal, update) => {
        const session = new AnalysisSession(repository);
        signal.addEventListener("abort", () => session.cancel(), { once: true });
        const service = new DigestAIService(transport);
        service.options = {
          start: scope.start,
          end: scope.end,
          label: scope.label,
          focus: scope.focus || null,
          provenance,
          language: lang,
          load: () => getSetting(checkpointKey, db),
          save: async (value, requestId, s) => {
            await repository.saveCheckpoint(snapshot, checkpointKey, value, requestId, s);
            update({ partial: value, firstResult: true });
          },
          progress: (done, totalChunks, synthesizing) =>
            update({ done, total: totalChunks, synth: !!synthesizing }),
        };
        signal.throwIfAborted();
        return { payload: await session.run(snapshot, service) };
      },
    );
    aiScroll.scrollTop = 0;
  }
  function onReadingJob(job) {
    if (disposed) return;
    if (job.status === "running") {
      status = "analyzing";
      const p = job.progress || {};
      if (p.partial) partial = p.partial;
      if (p.total) {
        progress = { done: p.done, total: p.total, synth: p.synth };
        progressText = p.synth
          ? tr("分段已保存，正在整合整体概览…")
          : tr("正在核查分段：") +
            Math.min(p.done + 1, p.total) +
            " / " +
            p.total +
            tr(" · 已完成：") +
            p.done;
      }
      renderAI();
      return;
    }
    if (job.status === "idle") return;
    settleJob(readingKey);
    progress = null;
    if (job.status === "done") {
      const payload = job.result.payload;
      partial = null;
      saved = { ...payload, stale: false };
      status = payload.result.status;
      activeClaim = null;
      selectedAnchor = null;
      kindFilter = "all";
      returnButton.hidden = true;
      for (const paragraph of snapshot.paragraphs) {
        const nodes = paragraphNodes.get(paragraph.paragraphIndex);
        nodes.wrapper.classList.remove("evidence-target");
        nodes.text.textContent = paragraph.text;
      }
      // Keep the new reading on screen after a reload: a passage reading is pinned in
      // the URL (it is not the material's default); any other reading is the default.
      const params = new URLSearchParams(location.search);
      if (payload.result.scope?.focus) params.set("result", payload.result.id);
      else params.delete("result");
      history.replaceState({}, "", location.pathname + (params.size ? "?" + params : ""));
      renderRecords().catch(() => {});
    } else if (job.status === "cancelled") {
      status = saved.result ? saved.result.status : "idle";
      errorMessage = tr("已取消分析。");
    } else {
      status = "failed";
      errorMessage = tr(job.error?.message) || tr("分析失败，请稍后重试。");
      errorCode = job.error?.code || "";
    }
    renderAI();
  }

  // ---------- Reading records ----------
  async function renderRecords() {
    const results = (await getAllRecords("readingResults", db))
      .filter(
        (r) =>
          r.documentId === item.id &&
          r.sourceRevision === snapshot.sourceRevision,
      )
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (disposed) return;
    records = results;
    recordsBox.replaceChildren();
    updatePosition();
    if (results.length < 2) return;
    const label = el("label", "", l("研读记录", "Readings"));
    const select = el("select", "core-input");
    for (const r of results) {
      const o = el(
        "option",
        "",
        short(
          r.scope?.label ||
            (r.scope?.partial
              ? l("段落 " + (r.scope.start + 1) + "–" + (r.scope.end + 1), "Paragraphs " + (r.scope.start + 1) + "–" + (r.scope.end + 1))
              : l("全文", "Whole text")),
          30,
        ) +
          " · " +
          new Date(r.createdAt).toLocaleDateString(getLocale()),
      );
      o.value = r.id;
      select.append(o);
    }
    select.value = saved.result?.id || results[0].id;
    select.addEventListener("change", () => openRecord(select.value));
    label.append(select);
    recordsBox.append(label, el("span", "reader-muted", results.length + l(" 次研读", " readings")));
  }
  function openRecord(id) {
    const params = new URLSearchParams(location.search);
    params.set("result", id);
    params.delete("evidence");
    params.delete("claim");
    try {
      sessionStorage.setItem("digest:reader-pos:" + item.id, String(currentIndex));
    } catch {}
    history.pushState({}, "", location.pathname + "?" + params);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  // ---------- Live position: header, contents, notes follow, scope banner ----------
  function pauseFollow() {
    followPausedUntil = Date.now() + 1200;
  }
  function updatePosition() {
    positionFrame = 0;
    if (!wrappers.length || disposed) return;
    const top = sourceScroll.getBoundingClientRect().top + 12;
    let lo = 0,
      hi = wrappers.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (wrappers[mid].getBoundingClientRect().bottom > top) hi = mid;
      else lo = mid + 1;
    }
    currentIndex = Number(wrappers[lo].dataset.paragraphIndex);
    const c = chapterAt(currentIndex);
    position.textContent =
      (c >= 0 ? short(chapterLabel(c), 28) + " · " : "") +
      l("第 " + (currentIndex + 1) + " / " + total + " 段", "¶ " + (currentIndex + 1) + " / " + total);
    updateBanner(c);
    // Notes follow the paragraph being read: the nearest note at or above it lights up.
    const nodes = [...claimNodes.values()].filter((n) => n.dataset.at !== undefined && n.isConnected);
    // Only follow inside the range the shown notes cover.
    const scope = saved.result?.scope;
    const inside = !scope || !Number.isInteger(scope.start) || (currentIndex >= scope.start && currentIndex <= scope.end);
    let near = null;
    if (inside) for (const node of nodes) if (Number(node.dataset.at) <= currentIndex) near = node;
    nodes.forEach((node) => node.classList.toggle("is-near", node === near));
    if (near && prefs.follow && Date.now() > followPausedUntil && !aiScroll.matches(":hover, :focus-within"))
      revealCard(near);
  }
  function updateBanner(c) {
    const scope = saved.result?.scope;
    const outside = scope && Number.isInteger(scope.start) && (currentIndex < scope.start || currentIndex > scope.end);
    banner.hidden = !outside;
    if (!outside || banner.dataset.for === String(c >= 0 ? c : -1)) return;
    banner.dataset.for = String(c >= 0 ? c : -1);
    banner.replaceChildren(
      el(
        "p",
        "",
        c >= 0
          ? l("你正在读「" + short(chapterLabel(c), 24) + "」，这次研读不包括这一章。", "You are reading “" + short(chapterLabel(c), 24) + "”, which this reading does not cover.")
          : l("你正在读的段落不在这次研读范围内。", "The paragraph you are reading is outside this reading."),
      ),
    );
    if (c >= 0) {
      const record = records.find((r) => r.scope && r.scope.start <= chapters[c].start && r.scope.end >= chapters[c].end);
      if (record && record.id !== saved.result.id)
        banner.append(button(l("打开本章的研读记录", "Open this chapter's reading"), () => openRecord(record.id), "secondary-action btn-sm"));
      const study = button(l("研读这一章", "Read this chapter"), () => {
        setScope(chapters[c].start, chapters[c].end);
        updateScope();
        analyze();
      }, "primary-action btn-sm");
      study.disabled = chunkCount(chapters[c].start, chapters[c].end) > MAX_CHUNKS;
      banner.append(study);
    }
  }
  sourceScroll.addEventListener(
    "scroll",
    () => {
      if (!positionFrame) positionFrame = requestAnimationFrame(updatePosition);
      if (!selectionBar.hidden) onSelection();
    },
    { passive: true },
  );
  aiScroll.addEventListener("wheel", pauseFollow, { passive: true });
  aiScroll.addEventListener("touchstart", pauseFollow, { passive: true });
  const onKey = (event) => {
    if (event.key !== "Escape") return;
    if (!toc.hidden) closeToc();
    else if (!prefsPanel.hidden) {
      prefsPanel.hidden = true;
      prefsButton.setAttribute("aria-expanded", "false");
      prefsButton.focus();
    }
  };
  const onClick = (event) => {
    if (!prefsPanel.hidden && !prefsPanel.contains(event.target) && !prefsButton.contains(event.target)) {
      prefsPanel.hidden = true;
      prefsButton.setAttribute("aria-expanded", "false");
    }
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("click", onClick);
  document.addEventListener("selectionchange", onSelection);
  return () => {
    disposed = true;
    unwatchReading();
    if (positionFrame) cancelAnimationFrame(positionFrame);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("click", onClick);
    document.removeEventListener("selectionchange", onSelection);
    if (selectionFrame) cancelAnimationFrame(selectionFrame);
    globalThis.CSS?.highlights?.delete("digest-focus");
    delete document.documentElement.dataset.readerTheme;
  };
}
