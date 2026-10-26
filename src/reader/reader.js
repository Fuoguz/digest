import { t as tr, th } from "../workspace/i18n.js";
import { createTransport, useProxy } from "../ai/proxy-transport.js";
import { el, button, highlightQuote } from "./dom.js";
import { documentSnapshot, restoreAnchor } from "../domain/evidence.js";
import { getLocale, installLanguageControl } from "../workspace/i18n.js";
import { readingChunks } from "../domain/context.js";
import { getSetting, putSetting, getRecord, getAllRecords } from "../data/db.js";
import { TrainingRepository } from "../data/training-repository.js";
import {
  READING_MODES,
  SOURCE_TYPES,
  documentChapters,
} from "../domain/documents.js";

const MAX_CHUNKS = 12;
const l = (zh, en) => (getLocale() === "en" ? en : zh);
import { MODE_SECTIONS, CLAIM_KINDS } from "../ai/schema.js";
import { DigestAIService } from "../ai/service.js";
import {
  DeveloperTransport,
  readDeveloperConfig,
} from "../ai/developer-transport.js";
import { ReadingRepository } from "../data/reading-repository.js";
import { AnalysisSession } from "../ai/analysis-session.js";
import { openAIConfiguration } from "./config-dialog.js";
import { appendLearningTools } from "./learning-tools.js";

export async function mountReader(container, item, db, isCurrent = () => true) {
  const snapshot = await documentSnapshot(item);
  const repository = new ReadingRepository(db);
  const routeParams = new URLSearchParams(location.search);
  let saved = await repository.load(snapshot, routeParams.get("result"));
  const externalAnchor = routeParams.get("evidence")
    ? await getRecord("evidenceAnchors", routeParams.get("evidence"), db)
    : null;
  if (externalAnchor && !saved.anchors.some((a) => a.id === externalAnchor.id))
    saved.anchors.push(restoreAnchor(externalAnchor, snapshot));
  if (!isCurrent()) return () => {};
  const session = new AnalysisSession(repository);
  let progressText = "";
  const checkpointKey = "reading-progress:" + item.id;
  let partial = await getSetting(checkpointKey, db);
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
  let disposed = false,
    status = saved.result
      ? saved.stale
        ? "needs_attention"
        : saved.result.status
      : "idle";
  let errorMessage = "",
    errorCode = "",
    activeClaim = null,
    selectedAnchor = null,
    runNumber = 0;
  const root = el("section", "reader");
  root.dataset.tab = "source";
  const header = el("header", "reader-header");
  const back = el("a", "reader-back", tr("← 资料库"));
  back.href = "/app/library";
  back.dataset.route = "";
  const heading = el("div", "reader-heading");
  const title = el("h1", "", item.title);
  const metadata = el("div", "reader-metadata");
  metadata.append(
    el("span", "reader-source-type", SOURCE_TYPES[item.sourceType] || "Text"),
    el("span", "", READING_MODES[item.readingMode]),
    ...item.tags.map((tag) => el("span", "reader-tag", tag)),
  );
  heading.append(title, metadata);
  const analyzeButton = button(tr("开始研读"), analyze, "primary-action");
  const more = el("details", "reader-more");
  more.append(el("summary", "", tr("更多 ···")));
  const menu = el("div", "reader-more-menu");
  menu.append(
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
      const link = el("a");
      link.href = URL.createObjectURL(
        new Blob([snapshot.source], { type: "text/plain;charset=utf-8" }),
      );
      link.download = item.title.replace(/[\\/:*?"<>|]/g, "_") + ".txt";
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }),
  );
  more.append(menu);
  const headerActions = el("div", "reader-header-actions");
  headerActions.append(analyzeButton, more);
  installLanguageControl(headerActions);
  header.append(back, heading, headerActions);
  const returnPath = routeParams.get("return");
  if (
    returnPath &&
    /^(?:\/app\/(?:review|graph|search)(?:\?|$)|\/app\/(?:tasks|courses)\/[a-zA-Z0-9_-]+(?:\?|$))/.test(
      returnPath,
    )
  ) {
    const returnLink = el("a", "reader-back", tr("← 返回学习任务"));
    returnLink.href = returnPath;
    returnLink.dataset.route = "";
    headerActions.append(returnLink);
  }
  const tabs = el("div", "reader-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", tr("阅读区域"));
  const sourceTab = button(tr("原文"), () => setTab("source"), "reader-tab");
  const aiTab = button(tr("AI 研读"), () => setTab("ai"), "reader-tab");
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
  const split = el("div", "reader-split");
  const sourcePanel = el("section", "source-panel");
  sourcePanel.id = "reader-source";
  sourcePanel.setAttribute("aria-label", tr("原文"));
  const sourceTop = el("div", "reader-panel-label");
  const position = el("span", "reading-position tabular");
  position.setAttribute("aria-live", "off");
  sourceTop.append(
    el("span", "", tr("SOURCE / 原始资料")),
    position,
    el(
      "span",
      "source-size",
      snapshot.paragraphs.length +
        tr(" 段 · ") +
        snapshot.source.length.toLocaleString(getLocale()) +
        tr(" 字符"),
    ),
  );
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
  const chapters = documentChapters(item, snapshot.paragraphs.length);
  const chapterAt = (index) =>
    chapters.findIndex((c) => index >= c.start && index <= c.end);
  // Most books already number their chapters in the title; only number the rest.
  const numbered =
    /^\s*(第\s*[\d一二三四五六七八九十百千零〇两]+\s*[章节篇部卷回讲课]|(chapter|part|section|lecture|unit)\s+[\divxlc]+\b|\d+(\.\d+)*[\s.、:：])/i;
  const chapterLabel = (i) =>
    numbered.test(chapters[i].title)
      ? chapters[i].title
      : l("第 " + (i + 1) + " 章 · ", "Ch. " + (i + 1) + " · ") + chapters[i].title;
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
    const marker = el(
      "span",
      "paragraph-number",
      String(paragraph.paragraphIndex + 1).padStart(2, "0"),
    );
    marker.setAttribute("aria-hidden", "true");
    const text = el("p", "paragraph-text", paragraph.text);
    if (paragraph.heading) {
      wrapper.classList.add("is-heading", "heading-" + paragraph.heading);
      text.setAttribute("role", "heading");
      text.setAttribute("aria-level", String(Math.min(paragraph.heading + 2, 6)));
    }
    wrapper.append(marker, text);
    article.append(wrapper);
    wrappers.push(wrapper);
    paragraphNodes.set(paragraph.paragraphIndex, { wrapper, text });
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
        const target = headerActions.querySelector("a[data-route]");
        if (target) {
          target.click();
          return;
        }
      }
      setTab("ai");
      const target = claimNodes.get(activeClaim);
      if (target) {
        target.focus({ preventScroll: true });
        centerWithin(aiScroll, target);
      }
    },
    "return-to-claim",
  );
  returnButton.hidden = true;
  sourcePanel.append(sourceTop, sourceScroll, returnButton);
  const aiPanel = el("section", "ai-panel");
  aiPanel.id = "reader-ai";
  aiPanel.setAttribute("aria-label", tr("AI 研读"));
  const aiTop = el("div", "reader-panel-label");
  aiTop.append(
    el("span", "", tr("READING / AI 研读")),
    el("span", "", READING_MODES[item.readingMode]),
  );
  const aiScroll = el("div", "ai-scroll");
  aiScroll.tabIndex = 0;
  const claimNodes = new Map();
  aiPanel.append(aiTop, aiScroll);
  split.append(sourcePanel, aiPanel);
  const controls = el("div", "reading-controls");
  const total = snapshot.paragraphs.length;
  const chunkCount = (start, end) =>
    readingChunks(
      snapshot.paragraphs.filter(
        (p) => p.paragraphIndex >= start && p.paragraphIndex <= end,
      ),
    ).length;
  const wholeFits = total > 0 && chunkCount(0, total - 1) <= MAX_CHUNKS;
  const short = (text, n = 36) => (text.length > n ? text.slice(0, n) + "…" : text);
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
      for (const action of [analyzeButton, ...aiScroll.querySelectorAll(".analysis-empty .primary-action")])
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
    const [, start, end, lang] = JSON.parse(partial.key);
    language.value = lang || getLocale();
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
  // Navigation: a table of contents when the source has structure, otherwise paragraphs.
  const toc = [];
  for (const p of snapshot.paragraphs) {
    const c = chapters.findIndex((ch) => ch.start === p.paragraphIndex);
    if (c >= 0) toc.push({ index: p.paragraphIndex, label: chapterLabel(c), depth: 0 });
    else if (p.heading && p.heading <= 3)
      toc.push({ index: p.paragraphIndex, label: p.text, depth: chapters.length ? p.heading : p.heading - 1 });
  }
  let outline;
  const jumpTo = (index) => {
    setTab("source");
    const nodes = paragraphNodes.get(index);
    if (nodes) {
      nodes.wrapper.tabIndex = -1;
      nodes.wrapper.focus({ preventScroll: true });
      centerWithin(sourceScroll, nodes.wrapper, "start");
    }
  };
  let outlineLabel;
  if (toc.length) {
    outlineLabel = el("label", "", l("目录", "Contents"));
    outline = el("select", "core-input");
    for (const entry of toc.slice(0, 600)) {
      const o = el("option", "", "　".repeat(Math.min(entry.depth, 3)) + short(entry.label, 48));
      o.value = entry.index;
      outline.append(o);
    }
    outline.addEventListener("change", () => jumpTo(Number(outline.value)));
  } else if (total <= 150) {
    outlineLabel = el("label", "", tr("段落导航"));
    outline = el("select", "core-input");
    for (const p of snapshot.paragraphs) {
      const o = el("option", "", p.paragraphIndex + 1 + " · " + p.text.slice(0, 52));
      o.value = p.paragraphIndex;
      outline.append(o);
    }
    outline.addEventListener("change", () => jumpTo(Number(outline.value)));
  } else {
    outlineLabel = el("label", "", l("跳到段落", "Go to paragraph"));
    outline = el("input", "core-input");
    outline.type = "number";
    outline.min = 1;
    outline.max = total;
    outline.placeholder = "1–" + total;
    outline.addEventListener("change", () => {
      const n = Math.round(Number(outline.value));
      if (n >= 1 && n <= total) jumpTo(n - 1);
    });
  }
  outlineLabel.classList.add("outline-control");
  outlineLabel.append(outline);
  controls.append(
    rangeLabel,
    fromChapterLabel,
    toChapterLabel,
    fromLabel,
    toLabel,
    languageLabel,
    outlineLabel,
    scopeHint,
  );
  // Live reading position in the source panel; also keeps the contents menu in step.
  let positionFrame = 0;
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
    const index = Number(wrappers[lo].dataset.paragraphIndex);
    const c = chapterAt(index);
    position.textContent =
      (c >= 0 ? short(chapterLabel(c), 28) + " · " : "") +
      l("第 " + (index + 1) + " / " + total + " 段", "¶ " + (index + 1) + " / " + total);
    if (outline.tagName === "SELECT" && document.activeElement !== outline) {
      let value = null;
      for (const option of outline.options)
        if (Number(option.value) <= index) value = option.value;
        else break;
      if (value !== null) outline.value = value;
    }
  }
  sourceScroll.addEventListener(
    "scroll",
    () => {
      if (!positionFrame) positionFrame = requestAnimationFrame(updatePosition);
    },
    { passive: true },
  );
  // Earlier readings (e.g. other chapters) stay available for this exact source version.
  const records = el("div", "reading-records");
  aiPanel.insertBefore(records, aiScroll);
  async function renderRecords() {
    const results = (await getAllRecords("readingResults", db))
      .filter(
        (r) =>
          r.documentId === item.id &&
          r.sourceRevision === snapshot.sourceRevision,
      )
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (disposed) return;
    records.replaceChildren();
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
    select.addEventListener("change", () => {
      const params = new URLSearchParams(location.search);
      params.set("result", select.value);
      params.delete("evidence");
      params.delete("claim");
      history.pushState({}, "", location.pathname + "?" + params);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    label.append(select);
    records.append(label, el("span", "reader-muted", results.length + l(" 次研读", " readings")));
  }
  root.append(header, controls, tabs, split);
  container.replaceChildren(root);
  setTab("source");
  renderAI();
  updateScope();
  renderRecords().catch(() => {});
  requestAnimationFrame(updatePosition);
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
  }

  function setTab(tab) {
    root.dataset.tab = tab;
    sourceTab.setAttribute("aria-selected", String(tab === "source"));
    aiTab.setAttribute("aria-selected", String(tab === "ai"));
    sourceTab.tabIndex = tab === "source" ? 0 : -1;
    aiTab.tabIndex = tab === "ai" ? 0 : -1;
  }
  function centerWithin(scroll, target, align = "center") {
    const a = scroll.getBoundingClientRect(),
      b = target.getBoundingClientRect();
    scroll.scrollTo({
      top:
        scroll.scrollTop +
        b.top -
        a.top -
        (align === "start" ? 24 : (a.height - b.height) / 2),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  function locate(anchor, claimId) {
    if (anchor.validationStatus !== "matched") return;
    new TrainingRepository(db)
      .track("evidence_opened", { documentId: item.id, evidenceId: anchor.id })
      .catch(() => {});
    activeClaim = claimId;
    selectedAnchor = anchor.id;
    for (const [index, nodes] of paragraphNodes) {
      const paragraph = snapshot.paragraphs.find(
        (p) => p.paragraphIndex === index,
      );
      const selected = index === anchor.paragraphIndex;
      nodes.wrapper.classList.toggle("evidence-target", selected);
      highlightQuote(nodes.text, paragraph.text, selected ? anchor : null);
    }
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
    requestAnimationFrame(() => {
      const target = paragraphNodes.get(anchor.paragraphIndex);
      if (target)
        centerWithin(
          sourceScroll,
          target.text.querySelector("mark") || target.wrapper,
        );
    });
  }
  function renderAI() {
    if (disposed) return;
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
      if (input !== outline) input.disabled = status === "analyzing";
    aiScroll.replaceChildren();
    aiScroll.scrollTop = 0;
    claimNodes.clear();
    const stateBox = el("div", "analysis-state");
    stateBox.setAttribute("role", "status");
    if (status === "analyzing") {
      stateBox.append(
        el("span", "analysis-progress"),
        el("h3", "", tr("正在研读这份资料")),
        el("p", "", progressText || tr("提炼判断，并逐条核对原文引用。")),
        button(tr("取消分析"), () => {
          runNumber++;
          session.cancel();
          status = saved.result ? saved.result.status : "idle";
          errorMessage = tr("已取消分析。");
          renderAI();
        }),
      );
    } else if (errorMessage) {
      stateBox.classList.add("analysis-error");
      stateBox.append(
        el(
          "h3",
          "",
          errorCode === "no_configuration"
            ? tr("连接你的 Developer AI Service")
            : tr("本次分析未完成"),
        ),
        el("p", "", errorMessage),
      );
      if (errorCode === "no_configuration")
        stateBox.append(
          button(tr("配置 Developer AI Service"), () =>
            openAIConfiguration(() => {
              errorMessage = "";
              errorCode = "";
              renderAI();
            }),
          ),
        );
      else
        stateBox.append(
          button(tr("重试"), analyze),
          ...(!useProxy()
            ? [button(tr("检查服务配置"), () => openAIConfiguration())]
            : []),
        );
      if (saved.result)
        stateBox.append(el("small", "", tr("以下保留上一次成功结果。")));
    } else if (!saved.result) {
      stateBox.classList.add("analysis-empty");
      stateBox.append(
        el("span", "analysis-monogram", "D"),
        el("p", "page-kicker", tr("FROM SOURCE TO UNDERSTANDING")),
        el("h2", "", tr("让每个判断，有据可查。")),
        el(
          "p",
          "",
          tr(
            "研读会围绕这份资料提炼结构，区分资料陈述与 AI 推论。每条可靠引用都能带你回到原文。",
          ),
        ),
        Object.assign(button(tr("开始 AI 研读"), analyze, "primary-action"), {
          disabled: !snapshot.source || !!scopeProblem(),
        }),
        el("small", "", tr("先读原文也很好。你的资料已保存在本地。")),
      );
    }
    if (stateBox.childNodes.length) aiScroll.append(stateBox);
    if (partial?.parts?.length) {
      const preview = el("aside", "partial-preview");
      preview.append(
        el("strong", "", tr("已保存分段：") + partial.parts.length),
        el(
          "p",
          "reader-muted",
          tr(
            "这是已完成部分的预览，不是全文结论。保持相同范围与语言重试，可继续未完成部分。",
          ),
        ),
      );
      const last = partial.parts.at(-1).result;
      const first = Object.values(last.sections).flatMap((s) => s.items)[0];
      if (first) preview.append(el("p", "", first.text));
      aiScroll.append(preview);
    }
    if (!saved.result) return;
    const scope = saved.result.scope;
    if (scope)
      aiScroll.append(
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
    if (saved.result.overview) {
      const overview = el("section", "reading-overview");
      overview.append(
        el("p", "page-kicker", tr("整体概览 · 请结合原文核查")),
        el("h2", "", tr("先抓住这份材料的重点")),
        el("p", "", saved.result.overview.summary),
      );
      for (const point of saved.result.overview.points) {
        const row = el("div", "overview-point");
        row.append(el("p", "", point.text));
        for (const cid of point.claimIds)
          row.append(
            button(
              tr("查看对应判断"),
              () => {
                const n = claimNodes.get(cid);
                if (n) {
                  n.focus();
                  centerWithin(aiScroll, n);
                }
              },
              "reader-link",
            ),
          );
        overview.append(row);
      }
      aiScroll.append(overview);
    }
    const coverage = el("div", "evidence-coverage");
    const claims = Object.values(saved.result.sections).flatMap(
      (section) => section.items,
    );
    const matched = new Set(
      saved.anchors
        .filter((anchor) => anchor.validationStatus === "matched")
        .map((anchor) => anchor.id),
    );
    const covered = claims.filter((claim) =>
      claim.evidenceIds.some((id) => matched.has(id)),
    ).length;
    coverage.append(
      el("strong", "", covered + " / " + claims.length + tr(" 有原文依据")),
      el("p", "", tr("原文依据可定位不代表 AI 推论必然成立，请结合原文核对。")),
    );
    if (saved.stale)
      coverage.append(
        el(
          "p",
          "reader-error-text",
          tr("原文已变化，旧引用已标记为 stale，请重新研读。"),
        ),
      );
    aiScroll.append(coverage);
    for (const [name, section] of Object.entries(saved.result.sections)) {
      const block = el("section", "reading-section");
      block.append(
        el("h2", "", MODE_SECTIONS[item.readingMode]?.[name] || name),
      );
      if (section.status === "missing")
        block.append(
          el("p", "section-missing", tr("材料不足 · ") + section.missingReason),
        );
      for (const claim of section.items) {
        const node = el("article", "reading-claim");
        node.tabIndex = -1;
        node.dataset.claimId = claim.id;
        node.classList.toggle("claim-selected", claim.id === activeClaim);
        node.append(
          el("span", "claim-kind kind-" + claim.kind, CLAIM_KINDS[claim.kind]),
          el("p", "claim-text", claim.text),
        );
        const actions = el("div", "claim-evidence");
        const anchors = claim.evidenceIds
          .map((id) => saved.anchors.find((anchor) => anchor.id === id))
          .filter(Boolean);
        const reliable = anchors.filter(
          (anchor) => anchor.validationStatus === "matched",
        );
        reliable.forEach((anchor, index) => {
          const action = button(
            (reliable.length === 1 ? tr("查看依据 ") : tr("依据 ")) +
              String.fromCodePoint(0x2460 + index),
            () => locate(anchor, claim.id),
            "evidence-action",
          );
          action.dataset.evidenceId = anchor.id;
          action.setAttribute(
            "aria-pressed",
            String(anchor.id === selectedAnchor),
          );
          action.title =
            (anchor.pageNumber
              ? tr("第 ") + anchor.pageNumber + tr(" 页 · ")
              : "") +
            tr("第 ") +
            (anchor.paragraphIndex + 1) +
            tr(" 段");
          actions.append(action);
          actions.append(el("small", "evidence-location", action.title));
        });
        if (!reliable.length)
          actions.append(
            el("span", "evidence-unavailable", tr("暂无可靠原文依据")),
          );
        if (anchors.some((a) => a.validationStatus === "ambiguous"))
          actions.append(
            el("small", "evidence-note", tr("引文重复，无法唯一定位")),
          );
        else if (anchors.some((a) => a.validationStatus === "invalid"))
          actions.append(
            el("small", "evidence-note", tr("引用未通过原文核对")),
          );
        node.append(actions);
        block.append(node);
        claimNodes.set(claim.id, node);
      }
      aiScroll.append(block);
    }
    const foot = el(
      "p",
      "reading-footnote",
      tr("研读结果保存在本地 · ") +
        new Date(saved.result.createdAt).toLocaleString(getLocale()),
    );
    aiScroll.append(foot);
    appendLearningTools(aiScroll, db, snapshot, saved);
  }
  async function analyze() {
    if (disposed || status === "analyzing" || !snapshot.source) return;
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
    const run = ++runNumber;
    errorMessage = "";
    errorCode = "";
    status = "analyzing";
    new TrainingRepository(db)
      .track("reading_started", { documentId: item.id })
      .catch(() => {});
    renderAI();
    try {
      const problem = scopeProblem();
      if (problem) throw new Error(problem);
      const scope = currentScope();
      const service = new DigestAIService(createTransport("digest"));
      service.options = {
        start: scope.start,
        end: scope.end,
        label: scope.label,
        language: language.value,
        load: () => getSetting(checkpointKey, db),
        save: async (value, requestId, signal) => {
          await repository.saveCheckpoint(
            snapshot,
            checkpointKey,
            value,
            requestId,
            signal,
          );
          partial = value;
          renderAI();
        },
        progress: (done, total, synthesizing) => {
          progressText = synthesizing
            ? tr("分段已保存，正在整合整体概览…")
            : tr("正在核查分段：") +
              Math.min(done + 1, total) +
              " / " +
              total +
              tr(" · 已完成：") +
              done;
          renderAI();
        },
      };
      const payload = await session.run(snapshot, service);
      partial = null;
      if (disposed || run !== runNumber) return;
      saved = { ...payload, stale: false };
      status = payload.result.status;
      activeClaim = null;
      selectedAnchor = null;
      returnButton.hidden = true;
      for (const paragraph of snapshot.paragraphs) {
        const nodes = paragraphNodes.get(paragraph.paragraphIndex);
        nodes.wrapper.classList.remove("evidence-target");
        nodes.text.textContent = paragraph.text;
      }
      // The new reading is now current; drop a pinned earlier reading from the URL.
      const params = new URLSearchParams(location.search);
      if (params.has("result")) {
        params.delete("result");
        history.replaceState({}, "", location.pathname + (params.size ? "?" + params : ""));
      }
      renderRecords().catch(() => {});
    } catch (error) {
      if (disposed || run !== runNumber) return;
      if (error.name === "AbortError") {
        status = saved.result?.status || "idle";
      } else {
        status = "failed";
        errorMessage = tr(error.message) || tr("分析失败，请稍后重试。");
        errorCode = error.code;
      }
    }
    renderAI();
  }
  return () => {
    disposed = true;
    runNumber++;
    session.cancel();
    if (positionFrame) cancelAnimationFrame(positionFrame);
  };
}
