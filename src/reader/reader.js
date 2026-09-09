import { el, button, highlightQuote } from "./dom.js";
import { documentSnapshot } from "../domain/evidence.js";
import { READING_MODES, SOURCE_TYPES } from "../domain/documents.js";
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
  if (!isCurrent()) return () => {};
  const session = new AnalysisSession(repository);
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
  const back = el("a", "reader-back", "← 资料库");
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
  const analyzeButton = button("开始研读", analyze, "primary-action");
  const more = el("details", "reader-more");
  more.append(el("summary", "", "更多 ···"));
  const menu = el("div", "reader-more-menu");
  menu.append(
    button("Developer AI Service", () => {
      more.open = false;
      openAIConfiguration(() => {
        errorMessage = "";
        renderAI();
      });
    }),
    button("导出原文 TXT", () => {
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
  header.append(back, heading, headerActions);
  const returnPath = routeParams.get("return");
  if (returnPath && /^\/app\/(review|graph|search)(\?|$)/.test(returnPath)) {
    const returnLink = el("a", "reader-back", "← 返回学习任务");
    returnLink.href = returnPath;
    returnLink.dataset.route = "";
    headerActions.append(returnLink);
  }
  const tabs = el("div", "reader-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "阅读区域");
  const sourceTab = button("原文", () => setTab("source"), "reader-tab");
  const aiTab = button("AI 研读", () => setTab("ai"), "reader-tab");
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
  sourcePanel.setAttribute("aria-label", "原文");
  const sourceTop = el("div", "reader-panel-label");
  sourceTop.append(
    el("span", "", "SOURCE / 原始资料"),
    el(
      "span",
      "",
      snapshot.paragraphs.length +
        " 段 · " +
        snapshot.source.length.toLocaleString("zh-CN") +
        " 字符",
    ),
  );
  const sourceScroll = el("div", "source-scroll");
  sourceScroll.tabIndex = 0;
  sourceScroll.setAttribute("aria-label", "原文滚动区域");
  const article = el("article", "source-article");
  article.append(
    el("p", "source-eyebrow", "READ CLOSELY"),
    el("h2", "source-title", item.title),
  );
  if (item.metadata?.originalFileName)
    article.append(el("p", "source-filename", item.metadata.originalFileName));
  const paragraphNodes = new Map();
  for (const paragraph of snapshot.paragraphs) {
    const wrapper = el("div", "source-paragraph");
    wrapper.dataset.paragraphIndex = paragraph.paragraphIndex;
    const marker = el(
      "span",
      "paragraph-number",
      String(paragraph.paragraphIndex + 1).padStart(2, "0"),
    );
    marker.setAttribute("aria-hidden", "true");
    const text = el("p", "paragraph-text", paragraph.text);
    wrapper.append(marker, text);
    article.append(wrapper);
    paragraphNodes.set(paragraph.paragraphIndex, { wrapper, text });
  }
  if (!snapshot.source)
    article.append(
      el(
        "p",
        "reader-muted",
        "这份旧版条目没有保存原文。请重新导入资料后再分析。",
      ),
    );
  sourceScroll.append(article);
  const returnButton = button(
    "← 返回 AI 判断",
    () => {
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
  aiPanel.setAttribute("aria-label", "AI 研读");
  const aiTop = el("div", "reader-panel-label");
  aiTop.append(
    el("span", "", "READING / AI 研读"),
    el("span", "", READING_MODES[item.readingMode]),
  );
  const aiScroll = el("div", "ai-scroll");
  aiScroll.tabIndex = 0;
  const claimNodes = new Map();
  aiPanel.append(aiTop, aiScroll);
  split.append(sourcePanel, aiPanel);
  root.append(header, tabs, split);
  container.replaceChildren(root);
  setTab("source");
  renderAI();
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
  if (initialAnchor && initialClaim) locate(initialAnchor, initialClaim.id);

  function setTab(tab) {
    root.dataset.tab = tab;
    sourceTab.setAttribute("aria-selected", String(tab === "source"));
    aiTab.setAttribute("aria-selected", String(tab === "ai"));
    sourceTab.tabIndex = tab === "source" ? 0 : -1;
    aiTab.tabIndex = tab === "ai" ? 0 : -1;
  }
  function centerWithin(scroll, target) {
    const a = scroll.getBoundingClientRect(),
      b = target.getBoundingClientRect();
    scroll.scrollTo({
      top: scroll.scrollTop + b.top - a.top - (a.height - b.height) / 2,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  function locate(anchor, claimId) {
    if (anchor.validationStatus !== "matched") return;
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
        ? "分析中…"
        : saved.result
          ? "重新研读"
          : "开始研读";
    analyzeButton.disabled = status === "analyzing" || !snapshot.source;
    aiScroll.replaceChildren();
    aiScroll.scrollTop = 0;
    claimNodes.clear();
    const stateBox = el("div", "analysis-state");
    stateBox.setAttribute("role", "status");
    if (status === "analyzing") {
      stateBox.append(
        el("span", "analysis-progress"),
        el("h3", "", "正在研读这份资料"),
        el("p", "", "提炼判断，并逐条核对原文引用。"),
        button("取消分析", () => {
          runNumber++;
          session.cancel();
          status = saved.result ? saved.result.status : "idle";
          errorMessage = "已取消分析。";
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
            ? "连接你的 Developer AI Service"
            : "本次分析未完成",
        ),
        el("p", "", errorMessage),
      );
      if (errorCode === "no_configuration")
        stateBox.append(
          button("配置 Developer AI Service", () =>
            openAIConfiguration(() => {
              errorMessage = "";
              errorCode = "";
              renderAI();
            }),
          ),
        );
      else
        stateBox.append(
          button("重试", analyze),
          button("检查服务配置", () => openAIConfiguration()),
        );
      if (saved.result)
        stateBox.append(el("small", "", "以下保留上一次成功结果。"));
    } else if (!saved.result) {
      stateBox.classList.add("analysis-empty");
      stateBox.append(
        el("span", "analysis-monogram", "D"),
        el("p", "page-kicker", "FROM SOURCE TO UNDERSTANDING"),
        el("h2", "", "让每个判断，有据可查。"),
        el(
          "p",
          "",
          "研读会围绕这份资料提炼结构，区分资料陈述与 AI 推论。每条可靠引用都能带你回到原文。",
        ),
        button("开始 AI 研读", analyze, "primary-action"),
        el("small", "", "先读原文也很好。你的资料已保存在本地。"),
      );
    }
    if (stateBox.childNodes.length) aiScroll.append(stateBox);
    if (!saved.result) return;
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
      el("strong", "", covered + " / " + claims.length + " 有原文依据"),
      el("p", "", "原文依据可定位不代表 AI 推论必然成立，请结合原文核对。"),
    );
    if (saved.stale)
      coverage.append(
        el(
          "p",
          "reader-error-text",
          "原文已变化，旧引用已标记为 stale，请重新研读。",
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
          el("p", "section-missing", "材料不足 · " + section.missingReason),
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
            (reliable.length === 1 ? "查看依据 " : "依据 ") +
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
            (anchor.pageNumber ? "第 " + anchor.pageNumber + " 页 · " : "") +
            "第 " +
            (anchor.paragraphIndex + 1) +
            " 段";
          actions.append(action);
          actions.append(el("small", "evidence-location", action.title));
        });
        if (!reliable.length)
          actions.append(
            el("span", "evidence-unavailable", "暂无可靠原文依据"),
          );
        if (anchors.some((a) => a.validationStatus === "ambiguous"))
          actions.append(
            el("small", "evidence-note", "引文重复，无法唯一定位"),
          );
        else if (anchors.some((a) => a.validationStatus === "invalid"))
          actions.append(el("small", "evidence-note", "引用未通过原文核对"));
        node.append(actions);
        block.append(node);
        claimNodes.set(claim.id, node);
      }
      aiScroll.append(block);
    }
    const foot = el(
      "p",
      "reading-footnote",
      "研读结果保存在本地 · " +
        new Date(saved.result.createdAt).toLocaleString("zh-CN"),
    );
    aiScroll.append(foot);
    appendLearningTools(aiScroll, db, snapshot, saved);
  }
  async function analyze() {
    if (disposed || status === "analyzing" || !snapshot.source) return;
    setTab("ai");
    const config = readDeveloperConfig();
    if (!config.endpoint || !config.model || !config.key) {
      errorCode = "no_configuration";
      errorMessage =
        "阅读不需要配置 AI。若要分析，请先连接兼容 Chat Completions 的开发者服务。";
      status = "needs_attention";
      renderAI();
      return;
    }
    const run = ++runNumber;
    errorMessage = "";
    errorCode = "";
    status = "analyzing";
    renderAI();
    try {
      const payload = await session.run(
        snapshot,
        new DigestAIService(new DeveloperTransport(config)),
      );
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
    } catch (error) {
      if (disposed || run !== runNumber) return;
      if (error.name === "AbortError") {
        status = saved.result?.status || "idle";
      } else {
        status = "failed";
        errorMessage = error.message || "分析失败，请稍后重试。";
        errorCode = error.code;
      }
    }
    renderAI();
  }
  return () => {
    disposed = true;
    runNumber++;
    session.cancel();
  };
}
