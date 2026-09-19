import { createAgentClient, runAgentDigest } from "../modules/api.js";
import {
  appendDigestNode,
  getDigestNodes,
  initDigestStorage,
  normalizeDigestNode,
  searchLocalKnowledgeTool,
  updateDigestReview
} from "../modules/storage.js";
import { buildGraphDataFromNodes, createGraphController, playTimeMachine, renderGraph } from "../modules/graph.js";
import {
  buildMarkdownFromCards,
  clearSourceFields,
  createUIRefs,
  extractSelectionText,
  getCardContentText,
  htmlToPlainText,
  markdownToDigestText,
  renderDigestArchive,
  renderQualityBoard,
  renderResultCards,
  renderReviewBoard,
  resetAgentTrace,
  resetQualityBoard,
  setInputLockState,
  setSourceMode,
  setSourceStatus,
  triggerHeroEnter,
  writeSourceToMainInput,
  pushAgentTrace
} from "../modules/ui.js";
import { createSourceActions } from "./usecases/source-actions.js";
import { createExportActions } from "./usecases/export-actions.js";
import { createDigestActions } from "./usecases/digest-actions.js";
import { createReviewActions } from "./usecases/review-actions.js";
import { createIntroActions } from "./usecases/intro-actions.js";

const quickTryPresets = {
  "short-video":
    "短视频把信息切成一口一口的即时奖励，让大脑习惯高频刺激和快速反馈。用户并不是单纯变懒了，而是在被平台训练成更难忍受等待、更难进入深度阅读的状态。注意力被不断外包给算法后，思考的连续性被打断，情绪更容易被标题和节奏牵引。真正的问题不是刷了多久，而是我们是否还保有主动选择信息和切换注意力的能力",
  "fragmented-reading":
    "碎片化阅读看似提高了效率，实际上常常只是在放大信息摄入量，却没有同步提升理解能力。很多人一天读了很多标题、摘要和金句，却很少完整读完一篇文章，更谈不上形成自己的判断。面对这种环境，关键不是彻底拒绝新媒体，而是重新建立阅读节奏：先完整、后速读；先结构、后细节；先思考问题，再接收答案。只有把注意力从被喂养切换回主动建构，知识才会真正沉淀下来"
};

export function createApp(runtimeConfig = {}) {
  const refs = createUIRefs(document);
  const graphController = createGraphController(refs.graphContainer);

  const state = {
    isDemoMode: false,
    hasDigestResult: false,
    lastDigestInput: "",
    sourceMode: "paste",
    reviewFilter: "due",
    digestQuery: "",
    digestTagFilter: "all",
    heroEnterTriggered: false,
    wheelTriggerArmed: true
  };

  const agentClient = createAgentClient(runtimeConfig);

  const { importUrlSource, importSelectionSource } = createSourceActions({
    refs,
    htmlToPlainText,
    writeSourceToMainInput,
    setSourceStatus,
    extractSelectionText
  });

  const { downloadPoster, exportMarkdown } = createExportActions({
    refs,
    buildMarkdownFromCards
  });

  const { handleAnalyze } = createDigestActions({
    refs,
    state,
    agentClient,
    runAgentDigest,
    searchLocalKnowledgeTool,
    pushAgentTrace,
    setInputLockState,
    resetAgentTrace,
    renderResultCards,
    appendDigestNode,
    renderKnowledgeViews,
    resetQualityBoard,
    renderQualityBoard
  });

  const { handleReviewAction } = createReviewActions({
    refs,
    state,
    updateDigestReview,
    renderKnowledgeViews
  });

  const { bindIntroHandlers } = createIntroActions({
    refs,
    state,
    triggerHeroEnter
  });

  function getRenderState() {
    return {
      nodes: getDigestNodes(),
      reviewFilter: state.reviewFilter,
      digestQuery: state.digestQuery,
      digestTagFilter: state.digestTagFilter
    };
  }

  function renderKnowledgeViews() {
    const renderState = getRenderState();
    renderReviewBoard(refs, renderState);
    renderDigestArchive(refs, renderState);

    if (refs.futureGraphSection && renderState.nodes.length > 0) {
      refs.futureGraphSection.style.display = "block";
    }

    const graphData = buildGraphDataFromNodes(renderState.nodes);
    renderGraph(graphController, graphData);
  }


  

  function bindEvents() {
    refs.inputText.addEventListener("keydown", (event) => {
      const isSubmitShortcut = (event.ctrlKey || event.metaKey) && event.key === "Enter";
      if (isSubmitShortcut) {
        event.preventDefault();
        refs.analyzeBtn.click();
      }
    });

    refs.inputText.addEventListener("input", () => {
      state.isDemoMode = false;
    });

    refs.inputText.addEventListener("click", () => {
      if (!refs.inputText.readOnly) {
        return;
      }

      const confirmed = confirm("确定要解锁并修改待内化的原文吗？");
      if (!confirmed) {
        return;
      }

      setInputLockState(refs, false);
      refs.inputText.focus();
    });

    refs.cardsContainer.addEventListener("click", async (event) => {
      const button = event.target.closest(".copy-btn");
      if (!button || !refs.cardsContainer.contains(button)) {
        return;
      }

      const card = button.closest(".card");
      if (!card) {
        return;
      }

      const contentText = getCardContentText(card);
      if (!contentText) {
        alert("暂无可复制内容");
        return;
      }

      const originalText = button.textContent;
      try {
        await navigator.clipboard.writeText(contentText);
        button.textContent = "已复制！";
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      } catch (error) {
        console.error("复制失败:", error);
        alert("复制失败，请检查浏览器权限设置");
      }
    });

    refs.sourceSwitchButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.sourceMode = setSourceMode(refs, button.dataset.sourceMode || "paste");
      });
    });

    refs.importUrlBtn?.addEventListener("click", importUrlSource);
    refs.pasteFromUrlBtn?.addEventListener("click", () => {
      if (writeSourceToMainInput(refs, refs.sourceUrlInput?.value || "")) {
        setSourceStatus(refs, "网页 URL 已写入内化区，请点击导入网页正文获取内容", false);
      }
    });

    refs.convertMarkdownBtn?.addEventListener("click", () => {
      const markdown = refs.markdownInput?.value || "";
      const text = markdownToDigestText(markdown);
      if (!text) {
        alert("请输入 Markdown 内容");
        return;
      }

      if (writeSourceToMainInput(refs, text)) {
        setSourceStatus(refs, "Markdown 已转换并写入内化区", false);
      }
    });

    refs.pasteMarkdownBtn?.addEventListener("click", () => {
      if (writeSourceToMainInput(refs, markdownToDigestText(refs.markdownInput?.value || ""))) {
        setSourceStatus(refs, "Markdown 已写入内化区", false);
      }
    });

    refs.importSelectionBtn?.addEventListener("click", importSelectionSource);
    refs.selectionToInputBtn?.addEventListener("click", importSelectionSource);

    refs.digestArchive?.addEventListener("click", handleReviewAction);
    refs.digestReviewBoard?.addEventListener("click", handleReviewAction);
    refs.digestReviewBoard?.addEventListener("input", (event) => {
      if (event.target && event.target.id === "digestSearchInput") {
        state.digestQuery = event.target.value || "";
        renderReviewBoard(refs, getRenderState());
        renderDigestArchive(refs, getRenderState());
      }
    });

    refs.digestReviewBoard?.addEventListener("click", (event) => {
      const tagButton = event.target.closest("[data-tag-filter]");
      if (!tagButton) {
        return;
      }

      state.digestTagFilter = tagButton.getAttribute("data-tag-filter") || "all";
      renderReviewBoard(refs, getRenderState());
      renderDigestArchive(refs, getRenderState());
    });

    refs.quickTryButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.isDemoMode = true;
        const presetKey = button.dataset.quickTry;
        const presetText = quickTryPresets[presetKey];
        if (!presetText) {
          return;
        }

        refs.inputText.value = presetText;
        refs.analyzeBtn.click();
      });
    });

    refs.analyzeBtn.addEventListener("click", handleAnalyze);

    refs.downloadBtn.addEventListener("click", downloadPoster);
    refs.exportMdBtn.addEventListener("click", exportMarkdown);

    refs.timeMachineBtn?.addEventListener("click", () => {
      const graphData = buildGraphDataFromNodes(getDigestNodes());
      playTimeMachine(graphController, graphData);
    });
    // intro-actions handles hero button and wheel-trigger bindings
    bindIntroHandlers();
  }

  function start() {
    setInputLockState(refs, false);
    initDigestStorage();
    resetQualityBoard(refs);
    resetAgentTrace(refs);
    state.sourceMode = setSourceMode(refs, "paste");
    clearSourceFields(refs);

    const normalizedNodes = getDigestNodes().map((node) => normalizeDigestNode(node));
    if (normalizedNodes.length > 0) {
      refs.futureGraphSection.style.display = "block";
    }

    if (!agentClient.apiKey) {
      pushAgentTrace(refs, "未检测到 API Key，请先在页面注入 DIGEST_API_KEY");
      setSourceStatus(refs, "请先配置 API Key（window.DIGEST_API_KEY 或 meta digest-api-key）", true);
    }

    renderKnowledgeViews();
    bindEvents();
  }

  return {
    start
  };
}
