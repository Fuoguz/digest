export {
  renderDigestArchive,
  renderQualityBoard,
  renderResultCards,
  renderReviewBoard
} from "./ui-renderers.js";

export function createUIRefs(root = document) {
  const refs = {
    analyzeBtn: root.getElementById("analyzeBtn"),
    inputText: root.getElementById("inputText"),
    inputLockTip: root.getElementById("inputLockTip"),
    loading: root.getElementById("loading"),
    loadingLabel: root.getElementById("loading")?.querySelector(".loading-label") || null,
    loadingSubtitleText: root.getElementById("loading")?.querySelector(".loading-subtitle") || null,
    agentTrace: root.getElementById("agentTrace"),
    resultSection: root.getElementById("resultSection"),
    futureGraphSection: root.getElementById("futureGraphSection"),
    graphContainer: root.getElementById("graph-container"),
    digestReviewBoard: root.getElementById("digestReviewBoard"),
    digestArchive: root.getElementById("digestArchive"),
    downloadBtn: root.getElementById("downloadBtn"),
    exportMdBtn: root.getElementById("exportMdBtn"),
    posterArea: root.getElementById("poster-area"),
    qualityBoard: root.getElementById("qualityBoard"),
    qualitySubtitle: root.getElementById("qualitySubtitle"),
    qualityScorePill: root.getElementById("qualityScorePill"),
    qualityCompletenessValue: root.getElementById("qualityCompletenessValue"),
    qualityConfidenceValue: root.getElementById("qualityConfidenceValue"),
    qualityTopicValue: root.getElementById("qualityTopicValue"),
    qualityCompletenessBar: root.getElementById("qualityCompletenessBar"),
    qualityConfidenceBar: root.getElementById("qualityConfidenceBar"),
    qualityTopicBar: root.getElementById("qualityTopicBar"),
    qualityChecklist: root.getElementById("qualityChecklist"),
    sourceSwitchButtons: root.querySelectorAll(".source-switch-btn"),
    sourcePanels: root.querySelectorAll("[data-source-panel]"),
    sourceUrlInput: root.getElementById("sourceUrlInput"),
    importUrlBtn: root.getElementById("importUrlBtn"),
    pasteFromUrlBtn: root.getElementById("pasteFromUrlBtn"),
    sourceUrlStatus: root.getElementById("sourceUrlStatus"),
    markdownInput: root.getElementById("markdownInput"),
    convertMarkdownBtn: root.getElementById("convertMarkdownBtn"),
    pasteMarkdownBtn: root.getElementById("pasteMarkdownBtn"),
    importSelectionBtn: root.getElementById("importSelectionBtn"),
    selectionToInputBtn: root.getElementById("selectionToInputBtn"),
    selectionStatus: root.getElementById("selectionStatus"),
    cardsContainer: root.querySelector(".cards"),
    quickTryButtons: root.querySelectorAll(".quick-try-btn"),
    timeMachineBtn: root.getElementById("timeMachineBtn"),
    heroCover: root.getElementById("heroCover"),
    heroContent: root.getElementById("heroContent"),
    heroGhostBtn: root.getElementById("heroGhostBtn"),
    appRoot: root.getElementById("appRoot")
  };

  refs.mainPointText = root.getElementById("mainPointText");
  refs.argumentsList = root.getElementById("argumentsList");
  refs.frameworkText = root.getElementById("frameworkText");
  refs.questionText = root.getElementById("questionText");

  return refs;
}

export function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getCardContentText(card) {
  const contentNode = card.querySelector(".card-content");
  if (!contentNode) {
    return "";
  }

  if (contentNode.tagName === "UL") {
    const items = Array.from(contentNode.querySelectorAll("li"));
    return items.map((li) => li.textContent.trim()).filter(Boolean).join("\n");
  }

  return contentNode.textContent.trim();
}

export function setSourceMode(refs, mode) {
  const sourceMode = mode || "paste";

  refs.sourceSwitchButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sourceMode === sourceMode);
  });

  refs.sourcePanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.sourcePanel === sourceMode);
  });

  return sourceMode;
}

export function writeSourceToMainInput(refs, value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  refs.inputText.value = normalized;
  refs.inputText.dispatchEvent(new Event("input", { bubbles: true }));
  refs.inputText.focus();
  return true;
}

export function stripMarkdownToText(markdown) {
  return String(markdown || "")
    .replace(/^\uFEFF/, "")
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "- ")
    .replace(/^\s*\d+[.)]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function markdownToDigestText(markdown) {
  return stripMarkdownToText(markdown) || "";
}

export function htmlToPlainText(html) {
  if (!html) {
    return "";
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html), "text/html");
  doc.querySelectorAll("script, style, noscript, svg, canvas, iframe").forEach((element) => element.remove());

  return String(doc.body?.textContent || "")
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export function extractSelectionText() {
  const selection = window.getSelection ? window.getSelection() : null;
  const selectedText = selection ? selection.toString().trim() : "";
  if (selectedText) {
    return selectedText;
  }

  const activeElement = document.activeElement;
  if (activeElement && (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT")) {
    const value = activeElement.value || "";
    const start = typeof activeElement.selectionStart === "number" ? activeElement.selectionStart : 0;
    const end = typeof activeElement.selectionEnd === "number" ? activeElement.selectionEnd : 0;
    if (end > start) {
      return value.slice(start, end).trim();
    }
  }

  return "";
}

export function setSourceStatus(refs, message, isError = false) {
  if (!refs.sourceUrlStatus && !refs.selectionStatus) {
    return;
  }

  if (refs.sourceUrlStatus) {
    refs.sourceUrlStatus.textContent = message;
    refs.sourceUrlStatus.style.color = isError ? "oklch(0.46 0.12 28)" : "oklch(0.48 0.012 246)";
  }

  if (refs.selectionStatus) {
    refs.selectionStatus.textContent = message;
    refs.selectionStatus.style.color = isError ? "oklch(0.46 0.12 28)" : "oklch(0.48 0.012 246)";
  }
}

export function clearSourceFields(refs) {
  if (refs.sourceUrlInput) {
    refs.sourceUrlInput.value = "";
  }
  if (refs.markdownInput) {
    refs.markdownInput.value = "";
  }
  setSourceStatus(refs, "选区内容会直接作为内化原文进入主输入框", false);
}

export function resetAgentTrace(refs) {
  if (refs.loadingLabel) {
    refs.loadingLabel.textContent = "正在显影内化结构";
  }

  if (refs.loadingSubtitleText) {
    refs.loadingSubtitleText.textContent = "GLM-4.7 正在拆分论点、抽取证据并重组为可沉淀的框架";
  }

  if (refs.agentTrace) {
    refs.agentTrace.innerHTML = "";
  }
}

export function pushAgentTrace(refs, step) {
  const text = String(step || "").trim();
  if (!text) {
    return;
  }

  if (refs.loadingSubtitleText) {
    refs.loadingSubtitleText.textContent = text;
  }

  if (!refs.agentTrace) {
    return;
  }

  const li = document.createElement("li");
  li.className = "agent-trace-item";
  li.textContent = text;
  refs.agentTrace.appendChild(li);

  while (refs.agentTrace.children.length > 5) {
    refs.agentTrace.removeChild(refs.agentTrace.firstElementChild);
  }
}

export function setInputLockState(refs, locked) {
  refs.inputText.readOnly = locked;
  refs.inputText.classList.toggle("input-locked", locked);
  refs.inputText.setAttribute("aria-readonly", String(locked));

  if (refs.inputLockTip) {
    refs.inputLockTip.classList.toggle("visible", locked);
    refs.inputLockTip.setAttribute("aria-hidden", String(!locked));

    if (locked) {
      refs.inputLockTip.classList.remove("flash");
      void refs.inputLockTip.offsetWidth;
      refs.inputLockTip.classList.add("flash");
    }
  }
}

export function resetQualityBoard(refs) {
  if (!refs.qualityBoard || !refs.qualitySubtitle || !refs.qualityScorePill || !refs.qualityCompletenessValue || !refs.qualityConfidenceValue || !refs.qualityTopicValue || !refs.qualityCompletenessBar || !refs.qualityConfidenceBar || !refs.qualityTopicBar || !refs.qualityChecklist) {
    return;
  }

  refs.qualitySubtitle.textContent = "生成后会自动检查结构是否完整、信息是否稳定，以及是否可能偏题";
  refs.qualityScorePill.textContent = "--";
  refs.qualityCompletenessValue.textContent = "--";
  refs.qualityConfidenceValue.textContent = "--";
  refs.qualityTopicValue.textContent = "--";
  refs.qualityCompletenessBar.style.width = "0%";
  refs.qualityConfidenceBar.style.width = "0%";
  refs.qualityTopicBar.style.width = "0%";
  refs.qualityChecklist.innerHTML = '<li class="quality-empty">等待一次内化结果后自动开始质量检查</li>';
}


export function buildMarkdownFromCards(refs) {
  const cards = Array.from(refs.cardsContainer.querySelectorAll(".card")).filter((card) => !card.classList.contains("skeleton-card"));

  const sections = cards
    .map((card) => {
      const title = card.querySelector("h3")?.textContent?.trim();
      const content = card.querySelector(".card-content");
      if (!title || !content) {
        return "";
      }

      let body = "";
      if (content.tagName === "UL") {
        const items = Array.from(content.querySelectorAll("li"))
          .map((li) => li.textContent.trim())
          .filter(Boolean);
        body = items.map((item) => `- ${item}`).join("\n");
      } else {
        body = content.textContent.trim();
      }

      if (!body) {
        return "";
      }

      return `## ${title}\n${body}`;
    })
    .filter(Boolean);

  return sections.join("\n\n");
}

export function triggerHeroEnter(refs, state) {
  if (!refs.heroGhostBtn || !refs.heroCover || !refs.heroContent || !refs.appRoot || state.heroEnterTriggered) {
    return;
  }

  state.heroEnterTriggered = true;
  refs.heroContent.classList.add("is-launching");
  refs.heroCover.classList.add("is-darkening");

  window.setTimeout(() => {
    refs.heroCover.classList.add("is-leaving");
    refs.appRoot.classList.remove("app--hidden");
    refs.appRoot.classList.add("app--revealing");
  }, 620);

  window.setTimeout(() => {
    refs.appRoot.classList.remove("app--revealing");
  }, 1700);
}
