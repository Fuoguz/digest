      const analyzeBtn = document.getElementById("analyzeBtn");
      const inputText = document.getElementById("inputText");
      const inputLockTip = document.getElementById("inputLockTip");
      const loading = document.getElementById("loading");
      const resultSection = document.getElementById("resultSection");
      const futureGraphSection = document.getElementById("futureGraphSection");
      const graphContainer = document.getElementById("graph-container");
      const digestReviewBoard = document.getElementById("digestReviewBoard");
      const digestArchive = document.getElementById("digestArchive");
      const downloadBtn = document.getElementById("downloadBtn");
      const exportMdBtn = document.getElementById("exportMdBtn");
      const posterArea = document.getElementById("poster-area");
      const qualityBoard = document.getElementById("qualityBoard");
      const qualitySubtitle = document.getElementById("qualitySubtitle");
      const qualityScorePill = document.getElementById("qualityScorePill");
      const qualityCompletenessValue = document.getElementById("qualityCompletenessValue");
      const qualityConfidenceValue = document.getElementById("qualityConfidenceValue");
      const qualityTopicValue = document.getElementById("qualityTopicValue");
      const qualityCompletenessBar = document.getElementById("qualityCompletenessBar");
      const qualityConfidenceBar = document.getElementById("qualityConfidenceBar");
      const qualityTopicBar = document.getElementById("qualityTopicBar");
      const qualityChecklist = document.getElementById("qualityChecklist");
      const sourceSwitchButtons = document.querySelectorAll(".source-switch-btn");
      const sourcePanels = document.querySelectorAll("[data-source-panel]");
      const sourceUrlInput = document.getElementById("sourceUrlInput");
      const importUrlBtn = document.getElementById("importUrlBtn");
      const pasteFromUrlBtn = document.getElementById("pasteFromUrlBtn");
      const sourceUrlStatus = document.getElementById("sourceUrlStatus");
      const markdownInput = document.getElementById("markdownInput");
      const convertMarkdownBtn = document.getElementById("convertMarkdownBtn");
      const pasteMarkdownBtn = document.getElementById("pasteMarkdownBtn");
      const importSelectionBtn = document.getElementById("importSelectionBtn");
      const selectionToInputBtn = document.getElementById("selectionToInputBtn");
      const selectionStatus = document.getElementById("selectionStatus");
      const cardsContainer = document.querySelector(".cards");
      const quickTryButtons = document.querySelectorAll(".quick-try-btn");
      const loadingLabel = loading ? loading.querySelector(".loading-label") : null;
      const loadingSubtitleText = loading ? loading.querySelector(".loading-subtitle") : null;
      const agentTrace = document.getElementById("agentTrace");

      let mainPointText = document.getElementById("mainPointText");
      let argumentsList = document.getElementById("argumentsList");
      let frameworkText = document.getElementById("frameworkText");
      let questionText = document.getElementById("questionText");
      let isDemoMode = false;
      let hasDigestResult = false;
      let lastDigestInput = "";
      let sourceMode = "paste";

      const DIGEST_STORAGE_KEY = "digest_nodes";
      const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30];
      let reviewFilter = "due";
      let digestQuery = "";
      let digestTagFilter = "all";

      const DIGEST_TAG_RULES = [
        { label: "短视频", pattern: /短视频|视频|抖音|快手|推荐流/i },
        { label: "注意力", pattern: /注意力|专注|分心|沉浸|碎片化/i },
        { label: "阅读", pattern: /阅读|文章|文本|摘要|笔记/i },
        { label: "认知", pattern: /认知|思考|判断|理解|脑/i },
        { label: "结构", pattern: /结构|框架|模型|逻辑|拆解/i },
        { label: "复习", pattern: /复习|回顾|回看|记忆|巩固/i },
        { label: "学习", pattern: /学习|内化|沉淀|知识|习惯/i },
        { label: "情绪", pattern: /情绪|焦虑|快感|奖励|刺激/i },
        { label: "算法", pattern: /算法|平台|推荐|分发/i }
      ];

      const quickTryPresets = {
        "short-video":
          "短视频把信息切成一口一口的即时奖励，让大脑习惯高频刺激和快速反馈。用户并不是单纯变懒了，而是在被平台训练成更难忍受等待、更难进入深度阅读的状态。注意力被不断外包给算法后，思考的连续性被打断，情绪更容易被标题和节奏牵引。真正的问题不是刷了多久，而是我们是否还保有主动选择信息和切换注意力的能力",
        "fragmented-reading":
          "碎片化阅读看似提高了效率，实际上常常只是在放大信息摄入量，却没有同步提升理解能力。很多人一天读了很多标题、摘要和金句，却很少完整读完一篇文章，更谈不上形成自己的判断。面对这种环境，关键不是彻底拒绝新媒体，而是重新建立阅读节奏：先完整、后速读；先结构、后细节；先思考问题，再接收答案。只有把注意力从被喂养切换回主动建构，知识才会真正沉淀下来"
      };

      const AGENT_MODEL = "GLM-4.7";
      const AGENT_MAX_TURNS = 6;
      const AGENT_SYSTEM_PROMPT = [
        "你是一个专业的知识内化 Agent。",
        "你必须使用工具调用完成任务：可以先调用 search_local_knowledge 检索历史标题，最后必须调用 format_output 固化结构化输出。",
        "禁止直接输出最终 JSON 文本，最终答案只能通过 format_output 的参数给出。",
        "format_output 参数必须包含字段：mainPoint, arguments, framework, question。"
      ].join("\\n");

      const AGENT_TOOLS = [
        {
          type: "function",
          function: {
            name: "search_local_knowledge",
            description: "检索本地知识卡片历史标题，返回可用于关联的新旧知识上下文",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "检索关键词"
                },
                maxResults: {
                  type: "integer",
                  description: "最多返回条目数，建议 3-8",
                  minimum: 1,
                  maximum: 12
                }
              },
              required: ["query"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "format_output",
            description: "将最终结果格式化为 UI 需要的结构化字段",
            parameters: {
              type: "object",
              properties: {
                mainPoint: {
                  type: "string",
                  description: "一句话核心论点"
                },
                arguments: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "核心论据列表，建议 2-5 条"
                },
                framework: {
                  type: "string",
                  description: "一句话逻辑框架"
                },
                question: {
                  type: "string",
                  description: "一个复习问题"
                }
              },
              required: ["mainPoint", "arguments", "framework", "question"]
            }
          }
        }
      ];

      function initDigestStorage() {
        try {
          const raw = localStorage.getItem(DIGEST_STORAGE_KEY);
          if (!raw) {
            localStorage.setItem(DIGEST_STORAGE_KEY, JSON.stringify([]));
            return;
          }

          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) {
            localStorage.setItem(DIGEST_STORAGE_KEY, JSON.stringify([]));
            return;
          }

          const normalized = parsed
            .filter((node) => {
              return !(typeof node?.id === "string" && node.id.startsWith("seed-"));
            })
            .map((node) => normalizeDigestNode(node));

          localStorage.setItem(DIGEST_STORAGE_KEY, JSON.stringify(normalized));
        } catch (error) {
          console.error("初始化本地知识库失败:", error);
          localStorage.setItem(DIGEST_STORAGE_KEY, JSON.stringify([]));
        }
      }

      function normalizeDigestNode(node) {
        const safeNode = node && typeof node === "object" ? { ...node } : {};
        const createdAt = typeof safeNode.createdAt === "string" && safeNode.createdAt ? safeNode.createdAt : new Date().toISOString();
        const review = safeNode.review && typeof safeNode.review === "object" ? { ...safeNode.review } : {};
        const history = Array.isArray(review.history) ? review.history.filter(Boolean) : [];
        const reviewCount = Number.isFinite(review.count) && review.count >= 0 ? review.count : 0;
        const lastReviewedAt = typeof review.lastReviewedAt === "string" && review.lastReviewedAt ? review.lastReviewedAt : null;
        const nextReviewAt = typeof review.nextReviewAt === "string" && review.nextReviewAt ? review.nextReviewAt : createdAt;
        const tags = Array.isArray(safeNode.tags)
          ? Array.from(new Set(safeNode.tags.map((tag) => String(tag || "").trim()).filter(Boolean))).slice(0, 6)
          : [];

        return {
          ...safeNode,
          createdAt,
          tags,
          review: {
            count: reviewCount,
            lastReviewedAt,
            nextReviewAt,
            history
          }
        };
      }

      function getDigestNodes() {
        try {
          const raw = localStorage.getItem(DIGEST_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(parsed)) {
            return [];
          }

          return parsed
            .filter((node) => {
              return !(typeof node?.id === "string" && node.id.startsWith("seed-"));
            })
            .map((node) => normalizeDigestNode(node));
        } catch (error) {
          console.error("读取本地知识库失败:", error);
          return [];
        }
      }

      function saveDigestNodes(nodes) {
        localStorage.setItem(DIGEST_STORAGE_KEY, JSON.stringify(nodes));
      }

      function appendDigestNode(userInput, parsedResult) {
        const currentNodes = getDigestNodes();
        const safeInput = (userInput || "").trim().replace(/\s+/g, " ");
        const inputSnippet = safeInput.slice(0, 15) || "用户输入";
        const mainPoint = (parsedResult?.mainPoint || "未返回核心论").trim();
        const createdAt = new Date().toISOString();
        const tags = extractDigestTags(safeInput, parsedResult);

        currentNodes.push({
          id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label: `${inputSnippet}${safeInput.length > 15 ? "..." : ""}`,
          group: "用户沉淀",
          title: inputSnippet,
          insight: mainPoint,
          tags,
          createdAt,
          review: {
            count: 0,
            lastReviewedAt: null,
            nextReviewAt: createdAt,
            history: []
          }
        });

        saveDigestNodes(currentNodes);
        renderDigestArchive();
        renderReviewBoard();
      }

      function extractDigestTags(userInput, parsedResult) {
        const sourceText = [userInput, parsedResult?.mainPoint, parsedResult?.framework, parsedResult?.question, ...(parsedResult?.arguments || [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const tags = DIGEST_TAG_RULES.filter((rule) => rule.pattern.test(sourceText)).map((rule) => rule.label);
        if (tags.length === 0) {
          tags.push("通用");
        }

        return tags.slice(0, 4);
      }

      function formatDigestTimestamp(createdAt) {
        if (!createdAt) {
          return "刚刚";
        }

        const parsedTime = new Date(createdAt);
        if (Number.isNaN(parsedTime.getTime())) {
          return "刚刚";
        }

        return new Intl.DateTimeFormat("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        })
          .format(parsedTime)
          .replace(/\//g, ".");
      }

      function formatReviewTime(value) {
        if (!value) {
          return "立即可复";
        }

        const parsedTime = new Date(value);
        if (Number.isNaN(parsedTime.getTime())) {
          return "立即可复";
        }

        const now = new Date();
        const diffMs = parsedTime.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0);
        if (diffMs <= 0) {
          return "今日待复";
        }

        const diffDays = Math.round(diffMs / 86400000);
        if (diffDays === 1) {
          return "明天复习";
        }

        return `${diffDays} 天后复习`;
      }

      function getReviewSchedule(count) {
        const safeCount = Number.isFinite(count) && count >= 0 ? count : 0;
        return REVIEW_INTERVAL_DAYS[Math.min(safeCount, REVIEW_INTERVAL_DAYS.length - 1)];
      }

      function getReviewStatus(node) {
        const normalized = node && node.createdAt && node.review && Array.isArray(node.review.history) ? node : normalizeDigestNode(node);
        const nextReviewAt = new Date(normalized.review.nextReviewAt || normalized.createdAt);
        const due = Number.isNaN(nextReviewAt.getTime()) ? true : nextReviewAt.getTime() <= Date.now();
        const nextLabel = formatReviewTime(normalized.review.nextReviewAt || normalized.createdAt);

        return {
          due,
          nextLabel,
          count: normalized.review.count,
          lastReviewedAt: normalized.review.lastReviewedAt,
          nextReviewAt: normalized.review.nextReviewAt
        };
      }

      function normalizeSearchText(value) {
        return String(value || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
      }

      function matchesDigestQuery(node, query) {
        if (!query) {
          return true;
        }

        const searchableText = [node.label, node.title, node.insight, node.group, node.createdAt, node.review?.lastReviewedAt, node.review?.nextReviewAt, ...(node.tags || [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      }

      function matchesDigestTag(node, tag) {
        if (!tag || tag === "all") {
          return true;
        }

        return Array.isArray(node.tags) && node.tags.includes(tag);
      }

      function setSourceMode(mode) {
        sourceMode = mode || "paste";

        sourceSwitchButtons.forEach((button) => {
          button.classList.toggle("is-active", button.dataset.sourceMode === sourceMode);
        });

        sourcePanels.forEach((panel) => {
          panel.classList.toggle("is-active", panel.dataset.sourcePanel === sourceMode);
        });
      }

      function writeSourceToMainInput(value) {
        const normalized = String(value || "").trim();
        if (!normalized) {
          return false;
        }

        inputText.value = normalized;
        inputText.dispatchEvent(new Event("input", { bubbles: true }));
        inputText.focus();
        return true;
      }

      function stripMarkdownToText(markdown) {
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

      function extractSelectionText() {
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

      async function fetchTextFromUrl(rawUrl) {
        const normalizedUrl = String(rawUrl || "").trim();
        if (!normalizedUrl) {
          throw new Error("请输入有效的网页 URL");
        }

        let url;
        try {
          url = new URL(normalizedUrl);
        } catch (error) {
          throw new Error("URL 格式不正确，请补全 http:// 或 https://");
        }

        const directResponse = await fetch(url.toString(), { method: "GET" });
        if (directResponse.ok) {
          const contentType = directResponse.headers.get("content-type") || "";
          const directText = await directResponse.text();

          if (/text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType) || directText.length > 0) {
            return directText;
          }
        }

        const jinaUrl = `https://r.jina.ai/http://${url.toString().replace(/^https?:\/\//i, "")}`;
        const jinaResponse = await fetch(jinaUrl, { method: "GET" });
        if (!jinaResponse.ok) {
          throw new Error(`网页抓取失败: ${jinaResponse.status}`);
        }

        return jinaResponse.text();
      }

      function setSourceStatus(message, isError = false) {
        if (!sourceUrlStatus && !selectionStatus) {
          return;
        }

        if (sourceUrlStatus) {
          sourceUrlStatus.textContent = message;
          sourceUrlStatus.style.color = isError ? "oklch(0.46 0.12 28)" : "oklch(0.48 0.012 246)";
        }

        if (selectionStatus) {
          selectionStatus.textContent = message;
          selectionStatus.style.color = isError ? "oklch(0.46 0.12 28)" : "oklch(0.48 0.012 246)";
        }
      }

      function markdownToDigestText(markdown) {
        const plainText = stripMarkdownToText(markdown);
        return plainText || "";
      }

      function htmlToPlainText(html) {
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

      function extractDigestTokens(text) {
        return Array.from(
          new Set(
            String(text || "")
              .toLowerCase()
              .match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{2,}/gi) || []
          )
        ).slice(0, 10);
      }

      function completeScore(completeness, richness, overlapRatio) {
        return completeness * 0.44 + richness * 0.18 + overlapRatio * 100 * 0.38;
      }

      function evaluateDigestQuality(userInput, parsed) {
        const mainPoint = String(parsed?.mainPoint || "").trim();
        const framework = String(parsed?.framework || "").trim();
        const question = String(parsed?.question || "").trim();
        const argumentsList = Array.isArray(parsed?.arguments) ? parsed.arguments.map((item) => String(item || "").trim()).filter(Boolean) : [];

        const missingFields = [
          !mainPoint && "核心论点",
          argumentsList.length === 0 && "核心论据",
          !framework && "认知框架",
          !question && "复习问题"
        ].filter(Boolean);

        const completeness = Math.round(((4 - missingFields.length) / 4) * 100);
        const richness = Math.min(100, Math.round((mainPoint.length + framework.length + question.length + argumentsList.join(" ").length) / 2));

        const inputTokens = extractDigestTokens(userInput);
        const resultText = [mainPoint, framework, question, ...argumentsList].join(" ").toLowerCase();
        const overlapCount = inputTokens.filter((token) => resultText.includes(token)).length;
        const overlapRatio = inputTokens.length > 0 ? overlapCount / inputTokens.length : 0;

        const confidence = Math.max(35, Math.min(98, Math.round(completeScore(completeness, richness, overlapRatio))));
        const topicRisk = Math.max(0, Math.min(100, Math.round((1 - overlapRatio) * 100 + (missingFields.length > 0 ? 12 : 0))));
        const offTopic = topicRisk >= 45;

        const warnings = [];
        if (missingFields.length > 0) {
          warnings.push(`缺少 ${missingFields.join("、")}`);
        }
        if (offTopic) {
          warnings.push("结果和原文关键词重合较少，建议核对是否偏题");
        }
        if (argumentsList.length > 0 && argumentsList.some((item) => item.length < 6)) {
          warnings.push("部分论据过短，建议补足细节");
        }

        return {
          completeness,
          confidence,
          topicRisk,
          offTopic,
          missingFields,
          warnings,
          isStable: missingFields.length === 0 && !offTopic && confidence >= 70
        };
      }

      function renderQualityBoard(userInput, parsed) {
        if (!qualityBoard || !qualitySubtitle || !qualityScorePill || !qualityCompletenessValue || !qualityConfidenceValue || !qualityTopicValue || !qualityCompletenessBar || !qualityConfidenceBar || !qualityTopicBar || !qualityChecklist) {
          return;
        }

        const quality = evaluateDigestQuality(userInput, parsed);
        const formatPercent = (value) => `${Math.max(0, Math.min(100, Math.round(value)))}%`;

        qualitySubtitle.textContent = quality.warnings.length === 0
          ? "本次结果结构完整，适合直接进入积淀与复习流程"
          : `本次结果有 ${quality.warnings.length} 项提示，建议先确认后再继续沉淀。`;

        qualityScorePill.textContent = quality.isStable ? "稳定" : `${quality.confidence}%`;
        qualityCompletenessValue.textContent = formatPercent(quality.completeness);
        qualityConfidenceValue.textContent = formatPercent(quality.confidence);
        qualityTopicValue.textContent = quality.offTopic ? "偏题风险" : quality.topicRisk >= 25 ? "轻微风险" : "风险";
        qualityCompletenessBar.style.width = formatPercent(quality.completeness);
        qualityConfidenceBar.style.width = formatPercent(quality.confidence);
        qualityTopicBar.style.width = formatPercent(quality.topicRisk);

        const checklistItems = [
          { ok: quality.missingFields.length === 0, text: quality.missingFields.length === 0 ? "四个结构齐全" : `缺少 ${quality.missingFields.join("")}` },
          { ok: quality.confidence >= 70, text: quality.confidence >= 70 ? "表达稳定，适合直接沉淀" : "置信度偏低，建议再核对一次输入" },
          { ok: !quality.offTopic, text: quality.offTopic ? "可能偏题，建议重新检查原文关键词" : "主题相关性正常" }
        ];

        const warnings = quality.warnings.map((warning) => ({ ok: false, text: warning }));
        qualityChecklist.innerHTML = [...checklistItems, ...warnings]
          .map((item) => `<li class="quality-item ${item.ok ? "" : "is-warning"}"><span class="quality-item-badge">${item.ok ? "" : "!"}</span><span class="quality-item-text">${escapeHTML(item.text)}</span></li>`)
          .join("") || '<li class="quality-empty">暂时没有可展示的质量提示</li>';
      }

      async function importUrlSource() {
        const rawUrl = sourceUrlInput?.value || "";
        const normalizedUrl = String(rawUrl || "").trim();

        if (!normalizedUrl) {
          setSourceStatus("请输入网页 URL 后再导入。", true);
          return;
        }

        setSourceStatus("正在抓取网页正文...");
        if (importUrlBtn) {
          importUrlBtn.disabled = true;
        }

        try {
          const text = await fetchTextFromUrl(normalizedUrl);
          const cleanedText = htmlToPlainText(text);

          if (!cleanedText) {
            throw new Error("网页未提取到可用文本");
          }

          if (writeSourceToMainInput(cleanedText)) {
            setSourceStatus("网页正文已导入内化区", false);
          }
        } catch (error) {
          console.error("网页导入失败:", error);
          setSourceStatus(error.message || "网页导入失败，请检查链接或网络", true);
        } finally {
          if (importUrlBtn) {
            importUrlBtn.disabled = false;
          }
        }
      }

      function importMarkdownSource() {
        const markdown = markdownInput?.value || "";
        const text = markdownToDigestText(markdown);

        if (!text) {
          alert("请输入 Markdown 内容");
          return;
        }

        if (writeSourceToMainInput(text)) {
          setSourceStatus("Markdown 已转换并写入内化区", false);
        }
      }

      function importSelectionSource() {
        const selectionText = extractSelectionText();
        if (!selectionText) {
          setSourceStatus("没有检测到选区，请先在当前页面选中一段文本", true);
          return;
        }

        if (writeSourceToMainInput(selectionText)) {
          setSourceStatus("当前选区已写入内化区", false);
        }
      }

      function clearSourceFields() {
        if (sourceUrlInput) {
          sourceUrlInput.value = "";
        }
        if (markdownInput) {
          markdownInput.value = "";
        }
        setSourceStatus("选区内容会直接作为内化原文进入主输入框", false);
      }

      function resetQualityBoard() {
        if (!qualityBoard || !qualitySubtitle || !qualityScorePill || !qualityCompletenessValue || !qualityConfidenceValue || !qualityTopicValue || !qualityCompletenessBar || !qualityConfidenceBar || !qualityTopicBar || !qualityChecklist) {
          return;
        }

        qualitySubtitle.textContent = "生成后会自动检查结构是否完整、信息是否稳定，以及是否可能偏题";
        qualityScorePill.textContent = "--";
        qualityCompletenessValue.textContent = "--";
        qualityConfidenceValue.textContent = "--";
        qualityTopicValue.textContent = "--";
        qualityCompletenessBar.style.width = "0%";
        qualityConfidenceBar.style.width = "0%";
        qualityTopicBar.style.width = "0%";
        qualityChecklist.innerHTML = '<li class="quality-empty">等待一次内化结果后自动开始质量检查</li>';
      }

      function scheduleNextReview(node, reviewedAt = new Date()) {
        const normalized = normalizeDigestNode(node);
        const nextCount = normalized.review.count + 1;
        const intervalDays = getReviewSchedule(nextCount - 1);
        const nextReviewAt = new Date(reviewedAt.getTime() + intervalDays * 86400000).toISOString();

        return {
          ...normalized,
          review: {
            count: nextCount,
            lastReviewedAt: reviewedAt.toISOString(),
            nextReviewAt,
            history: [
              ...normalized.review.history,
              {
                at: reviewedAt.toISOString(),
                intervalDays
              }
            ]
          }
        };
      }

      function updateDigestReview(nodeId) {
        const currentNodes = getDigestNodes();
        let changed = false;

        const nextNodes = currentNodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }

          changed = true;
          return scheduleNextReview(node);
        });

        if (!changed) {
          return;
        }

        saveDigestNodes(nextNodes);
        renderReviewBoard();
        renderDigestArchive();
        renderGraph();
      }

      function renderReviewBoard() {
        if (!digestReviewBoard) {
          return;
        }

        const nodes = getDigestNodes();
        const normalizedNodes = nodes.map((node) => ({ node: normalizeDigestNode(node), status: getReviewStatus(node) }));
        const query = normalizeSearchText(digestQuery);
        const filteredNodes = normalizedNodes.filter(({ node }) => matchesDigestQuery(node, query) && matchesDigestTag(node, digestTagFilter));
        const dueNodes = filteredNodes
          .filter(({ status }) => status.due)
          .sort((left, right) => {
            return new Date(left.status.nextReviewAt || 0).getTime() - new Date(right.status.nextReviewAt || 0).getTime();
          });

        const completedNodes = filteredNodes.filter(({ status }) => !status.due && status.count > 0);
        const allNodes = filteredNodes.slice().sort((left, right) => {
          return new Date(left.node.createdAt || 0).getTime() - new Date(right.node.createdAt || 0).getTime();
        });

        const visibleNodes = reviewFilter === "all" ? allNodes : reviewFilter === "done" ? completedNodes : dueNodes;

        const nextDue = filteredNodes
          .filter(({ status }) => !status.due)
          .sort((left, right) => {
            return new Date(left.status.nextReviewAt || 0).getTime() - new Date(right.status.nextReviewAt || 0).getTime();
          })[0];

        const reviewedCount = nodes.filter((node) => (node.review?.count || 0) > 0).length;
        const dueCount = dueNodes.length;
        const allCount = filteredNodes.length;
        const completedCount = completedNodes.length;
        const queryLabel = query ? `“${digestQuery.trim()}”` : "";
        const tagCounts = nodes.reduce((accumulator, node) => {
          const normalized = normalizeDigestNode(node);
          (normalized.tags || []).forEach((tag) => {
            accumulator.set(tag, (accumulator.get(tag) || 0) + 1);
          });
          return accumulator;
        }, new Map());
        const tagOptions = Array.from(tagCounts.entries())
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"));

        digestReviewBoard.innerHTML = `
          <div class="review-board-header">
            <div>
              <h3 class="review-board-title">复习队列</h3>
              <p class="review-board-subtitle">把已内化的内容按时间重新唤醒，避免只沉淀不回看。${queryLabel ? `当前搜索 ${queryLabel}` : ""}</p>
              <div class="review-board-controls" role="tablist" aria-label="复习筛选">
                <input id="digestSearchInput" class="review-search" type="search" value="${escapeHTML(digestQuery)}" placeholder="搜索积淀标题、论点、标签..." aria-label="搜索积淀记录" />
                <button class="review-filter-btn ${reviewFilter === "due" ? "is-active" : ""}" type="button" data-review-filter="due">今日待复习</button>
                <button class="review-filter-btn ${reviewFilter === "all" ? "is-active" : ""}" type="button" data-review-filter="all">全部</button>
                <button class="review-filter-btn ${reviewFilter === "done" ? "is-active" : ""}" type="button" data-review-filter="done">已完成</button>
              </div>
              <div class="tag-filter-row" aria-label="主题标签筛选">
                <button class="tag-filter-btn ${digestTagFilter === "all" ? "is-active" : ""}" type="button" data-tag-filter="all">全部标签</button>
                ${tagOptions
                  .map(([tag, count]) => {
                    return `<button class="tag-filter-btn ${digestTagFilter === tag ? "is-active" : ""}" type="button" data-tag-filter="${escapeHTML(tag)}">${escapeHTML(tag)} · ${count}</button>`;
                  })
                  .join("")}
              </div>
            </div>
            <div class="review-board-stats">
              <span class="review-stat">待复 ${dueCount}</span>
              <span class="review-stat">已复 ${reviewedCount}</span>
              <span class="review-stat">${nextDue ? `下次到期 ${formatReviewTime(nextDue.status.nextReviewAt)}` : "暂无下一次到期"}</span>
            </div>
          </div>
          <div class="review-queue">
            <p class="review-queue-title">今日需要回看的内容</p>
            <div class="review-list">
              ${
                visibleNodes.length === 0
                  ? reviewFilter === "due"
                    ? query
                      ? '<div class="review-empty">没有找到匹配的积淀，试试换个关键词或清空搜索</div>'
                      : '<div class="review-empty">当前没有待复习的积淀，新的内化结果会自动进入复习队列</div>'
                    : reviewFilter === "done"
                      ? query
                        ? '<div class="review-empty">没有找到已完成复习的积淀，试试换个关键词或清空搜索</div>'
                        : '<div class="review-empty">目前还没有完成过复习的积淀，先完成一次复习后这里才会出现记录</div>'
                      : query
                        ? '<div class="review-empty">没有找到匹配的积淀，试试换个关键词或清空搜索</div>'
                        : '<div class="review-empty">当前没有积淀记录，完成一次内化后就会在这里出现</div>'
                  : visibleNodes
                      .slice(0, 4)
                      .map(({ node, status }, index) => {
                        const safeTitle = escapeHTML(node.label || node.title || `知识节点 ${index + 1}`);
                        const safeInsight = escapeHTML(node.insight || "等待补充洞见");
                        const safeMeta = escapeHTML(status.lastReviewedAt ? `上次复习 ${formatDigestTimestamp(status.lastReviewedAt)}` : "尚未复习");
                        return `
                          <div class="review-item">
                            <div class="review-item-main">
                              <p class="review-item-title">${safeTitle}</p>
                              <p class="review-item-meta">${safeInsight}</p>
                              <p class="review-item-meta">${safeMeta}</p>
                            </div>
                            <button class="review-item-action" type="button" data-review-id="${escapeHTML(node.id)}">完成复习</button>
                          </div>
                        `;
                      })
                      .join("")
              }
            </div>
            <div class="archive-review-row">
              <span class="archive-review-status">全部 ${allCount}</span>
              <span class="archive-review-status">已完成 ${completedCount}</span>
            </div>
          </div>
        `;
      }

      function renderDigestArchive() {
        if (!digestArchive) {
          return;
        }

        const nodes = getDigestNodes().slice().reverse();
        const query = normalizeSearchText(digestQuery);
        const filteredNodes = nodes.filter((node) => matchesDigestQuery(node, query) && matchesDigestTag(node, digestTagFilter));

        if (nodes.length === 0) {
          digestArchive.innerHTML = `
            <div class="archive-empty">
              这里会沉淀你的内化记录。完成一次成功拆解后，知识节点会以可折叠卡片的形式出现，和上方图谱保持同步。
            </div>
          `;
          return;
        }

        if (filteredNodes.length === 0) {
          digestArchive.innerHTML = `
            <div class="archive-empty">
              没有找到匹配的积淀，试试更换搜索词，或者清空上方搜索框。
            </div>
          `;
          return;
        }

        digestArchive.innerHTML = filteredNodes
          .map((node, index) => {
            const status = getReviewStatus(node);
            const safeLabel = escapeHTML(node.label || node.title || `知识节点 ${index + 1}`);
            const safeSubtitle = escapeHTML(node.title || node.label || "未命名输入");
            const safeInsight = escapeHTML(node.insight || "等待补充洞见");
            const safeGroup = escapeHTML(node.group || "用户沉淀");
            const safeTimestamp = escapeHTML(formatDigestTimestamp(node.createdAt));
            const openAttribute = index === 0 ? " open" : "";
            const reviewStatusText = escapeHTML(status.due ? "今日待复" : status.nextLabel);
            const reviewButtonText = status.due ? "完成复习" : "提前复习";
            const tagMarkup = Array.isArray(node.tags) && node.tags.length > 0
              ? node.tags
                  .map((tag) => `<span class="archive-tag">${escapeHTML(tag)}</span>`)
                  .join("")
              : '<span class="archive-tag">通用</span>';

            return `
              <details class="archive-card"${openAttribute}>
                <summary>
                  <div class="archive-title-wrap">
                    <h3 class="archive-title">${safeLabel}</h3>
                    <p class="archive-subtitle">${safeSubtitle}</p>
                  </div>
                  <div class="archive-meta">
                    <span class="archive-pill">${safeGroup}</span>
                    <span class="archive-pill">${safeTimestamp}</span>
                  </div>
                </summary>
                <div class="archive-body">
                  <p class="archive-preview">${safeInsight}</p>
                  <div class="archive-tags">${tagMarkup}</div>
                  <div class="archive-review-row">
                    <span class="archive-review-status">${reviewStatusText}</span>
                    <button class="archive-review-btn" type="button" data-review-id="${escapeHTML(node.id)}">${reviewButtonText}</button>
                  </div>
                  <div class="archive-list-meta">
                    <span class="archive-chip">第 ${filteredNodes.length - index} 条积淀</span>
                    <span class="archive-chip">复习 ${status.count} 次</span>
                    <span class="archive-chip">可折叠回看</span>
                    <span class="archive-chip">与图谱同步</span>
                  </div>
                </div>
              </details>
            `;
          })
          .join("");
      }

      function getCardContentText(card) {
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

      function escapeHTML(value) {
        return String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function resetAgentTrace() {
        if (loadingLabel) {
          loadingLabel.textContent = "正在显影内化结构";
        }

        if (loadingSubtitleText) {
          loadingSubtitleText.textContent = "GLM-4.7 正在拆分论点、抽取证据并重组为可沉淀的框架";
        }

        if (agentTrace) {
          agentTrace.innerHTML = "";
        }
      }

      function pushAgentTrace(step) {
        const text = String(step || "").trim();
        if (!text) {
          return;
        }

        if (loadingSubtitleText) {
          loadingSubtitleText.textContent = text;
        }

        if (!agentTrace) {
          return;
        }

        const li = document.createElement("li");
        li.className = "agent-trace-item";
        li.textContent = text;
        agentTrace.appendChild(li);

        while (agentTrace.children.length > 5) {
          agentTrace.removeChild(agentTrace.firstElementChild);
        }
      }

      function safeParseJSON(raw, fallback = null) {
        if (typeof raw !== "string") {
          return fallback;
        }

        try {
          return JSON.parse(raw);
        } catch (error) {
          return fallback;
        }
      }

      function normalizeDigestOutput(payload) {
        const safePayload = payload && typeof payload === "object" ? payload : {};
        const normalizedArguments = Array.isArray(safePayload.arguments)
          ? safePayload.arguments.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
          : [];

        return {
          mainPoint: String(safePayload.mainPoint || "").trim() || "未返回核心论点",
          arguments: normalizedArguments.length > 0 ? normalizedArguments : ["未返回核心论据"],
          framework: String(safePayload.framework || "").trim() || "未返回认知框架",
          question: String(safePayload.question || "").trim() || "未返回复习问题"
        };
      }

      function searchLocalKnowledgeTool(args, userInput) {
        const safeArgs = args && typeof args === "object" ? args : {};
        const query = normalizeSearchText(safeArgs.query || userInput || "");
        const maxResults = Math.max(1, Math.min(12, Number(safeArgs.maxResults) || 5));
        const nodes = getDigestNodes().map((node) => normalizeDigestNode(node));

        if (!query || nodes.length === 0) {
          return {
            query,
            total: nodes.length,
            matched: 0,
            titles: []
          };
        }

        const tokens = query.split(/\s+/).filter(Boolean);
        const scored = nodes
          .map((node) => {
            const title = String(node.label || node.title || "").trim();
            const haystack = [title, node.insight, ...(node.tags || [])].join(" ").toLowerCase();

            let score = 0;
            if (title.toLowerCase().includes(query)) {
              score += 6;
            }

            tokens.forEach((token) => {
              if (haystack.includes(token)) {
                score += 2;
              }
            });

            if (matchesDigestQuery(node, query)) {
              score += 2;
            }

            return {
              node,
              title,
              score
            };
          })
          .filter((item) => item.score > 0)
          .sort((left, right) => {
            if (right.score !== left.score) {
              return right.score - left.score;
            }

            return new Date(right.node.createdAt || 0).getTime() - new Date(left.node.createdAt || 0).getTime();
          })
          .slice(0, maxResults);

        return {
          query,
          total: nodes.length,
          matched: scored.length,
          titles: scored.map((item) => item.title)
        };
      }

      function toToolCalls(message) {
        if (!message || typeof message !== "object") {
          return [];
        }

        if (Array.isArray(message.tool_calls)) {
          return message.tool_calls;
        }

        if (message.function_call && typeof message.function_call === "object") {
          return [
            {
              id: `legacy-fn-${Date.now()}`,
              type: "function",
              function: {
                name: message.function_call.name,
                arguments: message.function_call.arguments || "{}"
              }
            }
          ];
        }

        return [];
      }

      async function runAgentDigest(userInput) {
        const messages = [
          { role: "system", content: AGENT_SYSTEM_PROMPT },
          { role: "user", content: userInput }
        ];

        for (let round = 1; round <= AGENT_MAX_TURNS; round += 1) {
          pushAgentTrace(`Agent 第 ${round} 轮推理中...`);

          const response = await fetch("https://api.edgefn.net/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${window.DIGEST_API_KEY || ""}`
            },
            body: JSON.stringify({
              model: AGENT_MODEL,
              messages,
              tools: AGENT_TOOLS,
              tool_choice: "auto"
            })
          });

          if (!response.ok) {
            throw new Error(`请求失败: ${response.status}`);
          }

          const data = await response.json();
          const assistantMessage = data?.choices?.[0]?.message;
          if (!assistantMessage) {
            throw new Error("Agent 返回内容为空");
          }

          const toolCalls = toToolCalls(assistantMessage);
          const assistantRecord = {
            role: "assistant",
            content: assistantMessage.content || ""
          };

          if (toolCalls.length > 0) {
            assistantRecord.tool_calls = toolCalls;
          }
          messages.push(assistantRecord);

          if (toolCalls.length === 0) {
            pushAgentTrace("模型未调用工具，正在重试并要求按工具协议输出...");
            messages.push({
              role: "user",
              content: "请严格遵循工具调用流程：如有需要先调用 search_local_knowledge，最后必须调用 format_output。"
            });
            continue;
          }

          for (const call of toolCalls) {
            const toolName = call?.function?.name;
            const toolArgs = safeParseJSON(call?.function?.arguments || "{}", {});

            if (toolName === "search_local_knowledge") {
              pushAgentTrace("正在检索历史节点...");
              const toolResult = searchLocalKnowledgeTool(toolArgs, userInput);

              messages.push({
                role: "tool",
                tool_call_id: call.id,
                name: "search_local_knowledge",
                content: JSON.stringify(toolResult)
              });
              continue;
            }

            if (toolName === "format_output") {
              pushAgentTrace("正在固化最终结构...");
              return normalizeDigestOutput(toolArgs);
            }

            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: toolName || "unknown_tool",
              content: JSON.stringify({ error: "Unsupported tool" })
            });
          }
        }

        throw new Error("Agent 未在限定轮次内完成 format_output");
      }

      function renderResultCards(parsed, userInput = "") {
        resultSection.classList.add("is-visible");
        resultSection.classList.remove("is-updating");
        const argumentsMarkup = Array.isArray(parsed.arguments) && parsed.arguments.length > 0
          ? parsed.arguments.map((item) => `<li>${escapeHTML(item)}</li>`).join("")
          : "<li>未返回核心论据</li>";

        const cardDelays = [0, 0.1, 0.2, 0.3];

        cardsContainer.innerHTML = `
          <article class="card reveal-card" style="animation-delay: ${cardDelays[0]}s;">
            <div class="card-head">
              <h3>核心论点</h3>
              <button class="copy-btn" type="button" aria-label="复制核心论点">复制</button>
            </div>
            <p id="mainPointText" class="card-content">${escapeHTML(parsed.mainPoint || "未返回核心论")}</p>
          </article>
          <article class="card reveal-card" style="animation-delay: ${cardDelays[1]}s;">
            <div class="card-head">
              <h3>核心论据</h3>
              <button class="copy-btn" type="button" aria-label="复制核心论据">复制</button>
            </div>
            <ul id="argumentsList" class="card-content">
              ${argumentsMarkup}
            </ul>
          </article>
          <article class="card reveal-card" style="animation-delay: ${cardDelays[2]}s;">
            <div class="card-head">
              <h3>认知框架</h3>
              <button class="copy-btn" type="button" aria-label="复制认知框架">复制</button>
            </div>
            <p id="frameworkText" class="card-content">${escapeHTML(parsed.framework || "未返回认知框")}</p>
          </article>
          <article class="card reveal-card" style="animation-delay: ${cardDelays[3]}s;">
            <div class="card-head">
              <h3>复习与反思</h3>
              <button class="copy-btn" type="button" aria-label="复制复习与反思">复制</button>
            </div>
            <p id="questionText" class="card-content">${escapeHTML(parsed.question || "未返回复习问题")}</p>
          </article>
        `;

        syncCardReferences();
        hasDigestResult = true;
        lastDigestInput = userInput;
        renderQualityBoard(userInput, parsed);
      }

      function syncCardReferences() {
        mainPointText = document.getElementById("mainPointText");
        argumentsList = document.getElementById("argumentsList");
        frameworkText = document.getElementById("frameworkText");
        questionText = document.getElementById("questionText");
      }

      function setInputLockState(locked) {
        inputText.readOnly = locked;
        inputText.classList.toggle("input-locked", locked);
        inputText.setAttribute("aria-readonly", String(locked));

        if (inputLockTip) {
          inputLockTip.classList.toggle("visible", locked);
          inputLockTip.setAttribute("aria-hidden", String(!locked));

          if (locked) {
            inputLockTip.classList.remove("flash");
            void inputLockTip.offsetWidth;
            inputLockTip.classList.add("flash");
          }
        }
      }

      async function downloadPoster() {
        if (typeof html2canvas === "undefined") {
          alert("海报导出功能暂不可用，请稍后重试");
          return;
        }

        const clone = posterArea.cloneNode(true);
        clone.style.position = "absolute";
        clone.style.left = "-9999px";
        clone.style.top = "0";
        clone.style.width = "600px";
        clone.style.maxWidth = "600px";
        clone.style.minWidth = "600px";
        clone.style.padding = "18px";
        clone.style.background = "#FAFAFA";
        clone.style.borderRadius = "18px";
        clone.style.boxShadow = "none";
        clone.style.border = "1px solid #E6E6E6";

        clone.style.setProperty("background", "#FAFAFA", "important");
        clone.style.setProperty("color", "#1A1A1A", "important");
        clone.style.setProperty("box-shadow", "none", "important");
        clone.style.setProperty("border-color", "#E6E6E6", "important");

        clone.querySelectorAll("h2").forEach((title) => {
          title.style.setProperty("color", "#1A1A1A", "important");
        });

        const signature = document.createElement("div");
        signature.textContent = "由 Digest · AI 知识内化工具生成";
        signature.style.marginTop = "14px";
        signature.style.textAlign = "center";
        signature.style.color = "#666666";
        signature.style.fontSize = "12px";
        signature.style.lineHeight = "1.4";
        clone.appendChild(signature);

        const cloneElements = clone.querySelectorAll("*");
        cloneElements.forEach((el) => {
          el.style.setProperty("opacity", "1", "important");
          el.style.setProperty("filter", "none", "important");
          el.style.setProperty("animation", "none", "important");
          el.style.setProperty("transition", "none", "important");
          el.style.setProperty("transform", "none", "important");
          el.style.setProperty("text-shadow", "none", "important");
          el.style.setProperty("background-image", "none", "important");
        });

        clone.querySelectorAll(".card").forEach((card) => {
          card.style.setProperty("background", "#FFFFFF", "important");
          card.style.setProperty("box-shadow", "none", "important");
          card.style.setProperty("border", "1px solid #E8E8E8", "important");
        });

        clone.querySelectorAll(".card h3").forEach((title) => {
          title.style.setProperty("color", "#1A1A1A", "important");
        });

        clone.querySelectorAll(".card p, .card li").forEach((text) => {
          text.style.setProperty("color", "#666666", "important");
        });

        clone.querySelectorAll(".card .copy-btn").forEach((button) => {
          button.style.setProperty("color", "#666666", "important");
          button.style.setProperty("border-color", "transparent", "important");
          button.style.setProperty("background", "transparent", "important");
        });

        document.body.appendChild(clone);

        try {
          const canvas = await html2canvas(clone, {
            scale: 2,
            backgroundColor: "#FAFAFA",
            useCORS: true,
            logging: false
          });
          const link = document.createElement("a");
          link.href = canvas.toDataURL("image/png");
          link.download = "digest-poster.png";
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch (error) {
          console.error("海报生成失败:", error);
          alert("海报生成失败，请稍后重试");
        } finally {
          clone.remove();
        }
      }

      function buildMarkdownFromCards() {
        const cards = Array.from(cardsContainer.querySelectorAll(".card")).filter((card) => {
          return !card.classList.contains("skeleton-card");
        });

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

      async function exportMarkdown() {
        const markdown = buildMarkdownFromCards();
        if (!markdown) {
          alert("暂无可导出的内容，请先完成一次内化拆解");
          return;
        }

        const originalText = exportMdBtn.textContent;
        try {
          await navigator.clipboard.writeText(markdown);
          exportMdBtn.textContent = "✅ 已复制到剪贴板！";
          setTimeout(() => {
            exportMdBtn.textContent = originalText;
          }, 2000);
        } catch (error) {
          console.error("Markdown 复制失败:", error);
          alert("复制失败，请检查浏览器剪贴板权限");
        }
      }

      function buildGraphDataFromStorage() {
        const nodes = getDigestNodes().map((node, index) => {
          const fallbackLabel = `知识节点 ${index + 1}`;
          const safeLabel = (node.label || node.title || fallbackLabel).trim();
          return {
            id: node.id || `node-${Date.now()}-${index}`,
            label: safeLabel,
            group: node.group || "用户沉淀",
            title: (node.title || safeLabel).trim(),
            insight: (node.insight || "等待补充洞见").trim()
          };
        });

        const links = [];
        const seenLinks = new Set();
        const appendLink = (source, target) => {
          const key = `${source}->${target}`;
          if (source === target || seenLinks.has(key)) {
            return;
          }
          seenLinks.add(key);
          links.push({ source, target, key });
        };

        for (let i = 1; i < nodes.length; i += 1) {
          appendLink(nodes[i - 1].id, nodes[i].id);
        }

        const groupRoots = {};
        nodes.forEach((node) => {
          if (!groupRoots[node.group]) {
            groupRoots[node.group] = node.id;
            return;
          }
          appendLink(groupRoots[node.group], node.id);
        });

        return { nodes, links };
      }

      let timeMachineSimulation = null;
      let timeMachineActive = false;
      let timeMachineInterval = null;

      function clearGraphArtifacts() {
        if (timeMachineInterval) {
          clearInterval(timeMachineInterval);
          timeMachineInterval = null;
        }

        timeMachineActive = false;

        if (timeMachineSimulation) {
          timeMachineSimulation.stop();
          timeMachineSimulation = null;
        }

        const previousTooltip = document.querySelector(".digest-graph-tooltip");
        if (previousTooltip) {
          previousTooltip.remove();
        }

        graphContainer.innerHTML = "";
      }

      function renderEmptyGraphState(message = "知识宇宙等待点亮...") {
        clearGraphArtifacts();

        const hint = document.createElement("div");
        hint.setAttribute("aria-live", "polite");
        hint.style.position = "absolute";
        hint.style.left = "50%";
        hint.style.top = "50%";
        hint.style.transform = "translate(-50%, -50%)";
        hint.style.fontFamily = '"Plus Jakarta Sans", "Space Grotesk", "PingFang SC", sans-serif';
        hint.style.fontSize = "12px";
        hint.style.fontWeight = "500";
        hint.style.letterSpacing = "0.06em";
        hint.style.textTransform = "none";
        hint.style.color = "oklch(0.56 0.01 245 / 0.9)";
        hint.style.padding = "8px 12px";
        hint.style.borderRadius = "999px";
        hint.style.background = "oklch(0.985 0.004 95 / 0.7)";
        hint.style.border = "1px solid oklch(0.91 0.008 95 / 0.9)";
        hint.style.backdropFilter = "blur(6px)";
        hint.style.webkitBackdropFilter = "blur(6px)";
        hint.textContent = message;

        graphContainer.appendChild(hint);
      }

      function createGraphTooltip() {
        const tooltip = document.createElement("div");
        tooltip.style.position = "absolute";
        tooltip.style.opacity = "0";
        tooltip.style.background = "oklch(0.995 0.002 95 / 0.96)";
        tooltip.style.borderRadius = "10px";
        tooltip.style.padding = "10px 11px";
        tooltip.style.boxShadow = "0 14px 34px -20px rgba(15, 23, 42, 0.28), 0 2px 8px rgba(15, 23, 42, 0.08)";
        tooltip.style.border = "1px solid oklch(0.9 0.01 95 / 0.85)";
        tooltip.style.zIndex = "99999";
        tooltip.style.pointerEvents = "none";
        tooltip.style.maxWidth = "260px";
        tooltip.style.fontFamily = '"Plus Jakarta Sans", "PingFang SC", sans-serif';
        tooltip.className = "digest-graph-tooltip";
        document.body.appendChild(tooltip);
        return tooltip;
      }

      function createGraphCore(width, height, tooltip) {
        const svg = d3
          .select("#graph-container")
          .append("svg")
          .attr("width", width)
          .attr("height", height)
          .attr("viewBox", `0 0 ${width} ${height}`);

        const defs = svg.append("defs");
        const shadowFilter = defs
          .append("filter")
          .attr("id", "digest-node-shadow")
          .attr("x", "-60%")
          .attr("y", "-60%")
          .attr("width", "220%")
          .attr("height", "220%")
          .attr("color-interpolation-filters", "sRGB");

        shadowFilter.append("feDropShadow").attr("dx", 0).attr("dy", 3).attr("stdDeviation", 3.4).attr("flood-color", "#6b7a90").attr("flood-opacity", 0.22);
        shadowFilter.append("feDropShadow").attr("dx", 0).attr("dy", 10).attr("stdDeviation", 12).attr("flood-color", "#6b7a90").attr("flood-opacity", 0.12);

        const hoverFilter = defs
          .append("filter")
          .attr("id", "digest-node-shadow-hover")
          .attr("x", "-70%")
          .attr("y", "-70%")
          .attr("width", "240%")
          .attr("height", "240%")
          .attr("color-interpolation-filters", "sRGB");

        hoverFilter.append("feDropShadow").attr("dx", 0).attr("dy", 4).attr("stdDeviation", 4.8).attr("flood-color", "#5e7895").attr("flood-opacity", 0.3);
        hoverFilter.append("feDropShadow").attr("dx", 0).attr("dy", 16).attr("stdDeviation", 14).attr("flood-color", "#5e7895").attr("flood-opacity", 0.2);

        const linkLayer = svg.append("g").attr("class", "graph-links");
        const nodeLayer = svg.append("g").attr("class", "graph-nodes");

        const simulation = d3
          .forceSimulation([])
          .force(
            "link",
            d3
              .forceLink([])
              .id((d) => d.id)
              .distance(72)
              .strength(0.34)
          )
          .force("charge", d3.forceManyBody().strength(-168))
          .force("center", d3.forceCenter(width / 2, height / 2))
          .force("collision", d3.forceCollide().radius(28).strength(0.9));

        const state = {
          svg,
          width,
          height,
          tooltip,
          linkLayer,
          nodeLayer,
          simulation,
          linkSelection: null,
          nodeSelection: null,
          links: []
        };

        simulation.on("tick", () => {
          if (state.linkSelection) {
            state.linkSelection
              .attr("x1", (d) => d.source.x)
              .attr("y1", (d) => d.source.y)
              .attr("x2", (d) => d.target.x)
              .attr("y2", (d) => d.target.y);
          }

          if (state.nodeSelection) {
            state.nodeSelection.attr("transform", (d) => {
              const x = Number.isFinite(d.x) ? d.x : width / 2;
              const y = Number.isFinite(d.y) ? d.y : height / 2;
              d.__scale = d.__scale || 1;
              d.__targetScale = d.__targetScale || 1;
              d.__scale += (d.__targetScale - d.__scale) * 0.25;
              return `translate(${x}, ${y}) scale(${d.__scale})`;
            });
          }
        });

        return state;
      }

      function createNodeDrag(simulation) {
        function dragstarted(event, d) {
          if (!event.active) {
            simulation.alphaTarget(0.3).restart();
          }
          d.fx = d.x;
          d.fy = d.y;
        }

        function dragged(event, d) {
          d.fx = event.x;
          d.fy = event.y;
        }

        function dragended(event, d) {
          if (!event.active) {
            simulation.alphaTarget(0);
          }
          d.fx = null;
          d.fy = null;
        }

        return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
      }

      function buildConnectedSet(centerNodeId, links) {
        const connectedNodeIds = new Set([centerNodeId]);
        const connectedLinkKeys = new Set();

        links.forEach((link) => {
          const sourceId = typeof link.source === "object" ? link.source.id : link.source;
          const targetId = typeof link.target === "object" ? link.target.id : link.target;
          const linkKey = `${sourceId}->${targetId}`;

          if (sourceId === centerNodeId || targetId === centerNodeId) {
            connectedNodeIds.add(sourceId);
            connectedNodeIds.add(targetId);
            connectedLinkKeys.add(linkKey);
          }
        });

        return { connectedNodeIds, connectedLinkKeys };
      }

      function applyLabelCapsule(nodeSelection) {
        nodeSelection.each(function (d) {
          const currentNode = d3.select(this);
          const textNode = currentNode.select("text").node();
          const textWidth = textNode ? textNode.getComputedTextLength() : 48;
          const capsuleWidth = Math.min(Math.max(textWidth + 12, 44), 170);
          currentNode
            .select("rect")
            .attr("x", -capsuleWidth / 2)
            .attr("y", 13)
            .attr("width", capsuleWidth)
            .attr("height", 17)
            .attr("rx", 8.5)
            .attr("ry", 8.5);
        });
      }

      function mountGraphData(state, nodes, links, options = {}) {
        const { animateEnter = false, intervalMs = 360 } = options;

        state.links = links;

        const linkSelection = state.linkLayer
          .selectAll("line.graph-link")
          .data(links, (d) => d.key || `${d.source.id || d.source}->${d.target.id || d.target}`)
          .join(
            (enter) => {
              const entering = enter
                .append("line")
                .attr("class", "graph-link")
                .attr("stroke", "oklch(0.84 0.01 245)")
                .attr("stroke-opacity", animateEnter ? 0 : 0.4)
                .attr("stroke-width", 1)
                .attr("stroke-linecap", "round");

              if (animateEnter) {
                entering
                  .transition()
                  .duration(intervalMs)
                  .ease(d3.easeCubicOut)
                  .attr("stroke-opacity", 0.4);
              }
              return entering;
            },
            (update) => update,
            (exit) =>
              exit
                .transition()
                .duration(180)
                .ease(d3.easeCubicOut)
                .attr("stroke-opacity", 0)
                .remove()
          );

        const nodeSelection = state.nodeLayer
          .selectAll("g.graph-node")
          .data(nodes, (d) => d.id)
          .join(
            (enter) => {
              const entering = enter.append("g").attr("class", "graph-node").attr("opacity", animateEnter ? 0 : 1);
              entering.each((d) => {
                d.__scale = 1;
                d.__targetScale = 1;
              });

              entering
                .append("circle")
                .attr("r", 8.6)
                .attr("fill", "#ffffff")
                .attr("stroke", "oklch(0.56 0.09 235)")
                .attr("stroke-width", 1.5)
                .attr("filter", "url(#digest-node-shadow)");

              entering
                .append("rect")
                .attr("fill", "oklch(0.995 0.002 95 / 0.8)")
                .attr("stroke", "oklch(0.9 0.008 95 / 0.95)")
                .attr("stroke-width", 0.6);

              entering
                .append("text")
                .attr("x", 0)
                .attr("y", 25)
                .attr("text-anchor", "middle")
                .attr("font-family", "'Plus Jakarta Sans', 'Space Grotesk', 'PingFang SC', sans-serif")
                .attr("font-size", "11.5px")
                .attr("font-weight", 500)
                .attr("fill", "oklch(0.42 0.012 250)")
                .text((d) => d.label);

              applyLabelCapsule(entering);

              if (animateEnter) {
                entering
                  .transition()
                  .duration(intervalMs)
                  .ease(d3.easeCubicOut)
                  .attr("opacity", 1);
              }

              return entering;
            },
            (update) => {
              update.select("text").text((d) => d.label);
              applyLabelCapsule(update);
              return update;
            },
            (exit) =>
              exit
                .transition()
                .duration(200)
                .ease(d3.easeCubicOut)
                .attr("opacity", 0)
                .remove()
          );

        const dragBehavior = createNodeDrag(state.simulation);
        nodeSelection.call(dragBehavior);

        nodeSelection
          .on("mouseover", (event, d) => {
            const { connectedNodeIds, connectedLinkKeys } = buildConnectedSet(d.id, state.links);

            state.tooltip.innerHTML = `
              <div style="font-weight:600;color:oklch(0.36 0.04 235);margin-bottom:4px;">${escapeHTML(d.title)}</div>
              <div style="font-size:12px;line-height:1.5;color:oklch(0.42 0.012 250);">${escapeHTML(d.insight)}</div>
            `;
            state.tooltip.style.opacity = "1";

            nodeSelection.each((nodeDatum) => {
              nodeDatum.__targetScale = nodeDatum.id === d.id ? 1.15 : 1;
            });

            nodeSelection
              .interrupt()
              .transition()
              .duration(120)
              .ease(d3.easeCubicOut)
              .style("opacity", (nodeDatum) => (connectedNodeIds.has(nodeDatum.id) ? 1 : 0.1));

            nodeSelection
              .select("circle")
              .interrupt()
              .transition()
              .duration(120)
              .ease(d3.easeCubicOut)
              .attr("filter", (nodeDatum) => (nodeDatum.id === d.id ? "url(#digest-node-shadow-hover)" : "url(#digest-node-shadow)"))
              .attr("stroke-width", (nodeDatum) => (nodeDatum.id === d.id ? 1.9 : 1.5));

            linkSelection
              .interrupt()
              .transition()
              .duration(120)
              .ease(d3.easeCubicOut)
              .attr("stroke", (linkDatum) => {
                const sourceId = typeof linkDatum.source === "object" ? linkDatum.source.id : linkDatum.source;
                const targetId = typeof linkDatum.target === "object" ? linkDatum.target.id : linkDatum.target;
                return connectedLinkKeys.has(`${sourceId}->${targetId}`) ? "oklch(0.62 0.03 238)" : "oklch(0.84 0.01 245)";
              })
              .attr("stroke-opacity", (linkDatum) => {
                const sourceId = typeof linkDatum.source === "object" ? linkDatum.source.id : linkDatum.source;
                const targetId = typeof linkDatum.target === "object" ? linkDatum.target.id : linkDatum.target;
                return connectedLinkKeys.has(`${sourceId}->${targetId}`) ? 0.88 : 0.1;
              })
              .attr("stroke-width", (linkDatum) => {
                const sourceId = typeof linkDatum.source === "object" ? linkDatum.source.id : linkDatum.source;
                const targetId = typeof linkDatum.target === "object" ? linkDatum.target.id : linkDatum.target;
                return connectedLinkKeys.has(`${sourceId}->${targetId}`) ? 1.8 : 1;
              });
          })
          .on("mousemove", (event) => {
            state.tooltip.style.left = `${event.pageX + 14}px`;
            state.tooltip.style.top = `${event.pageY + 14}px`;
          })
          .on("mouseout", () => {
            state.tooltip.style.opacity = "0";

            nodeSelection.each((nodeDatum) => {
              nodeDatum.__targetScale = 1;
            });

            nodeSelection
              .interrupt()
              .transition()
              .duration(180)
              .ease(d3.easeCubicOut)
              .style("opacity", 1);

            nodeSelection
              .select("circle")
              .interrupt()
              .transition()
              .duration(180)
              .ease(d3.easeCubicOut)
              .attr("filter", "url(#digest-node-shadow)")
              .attr("stroke-width", 1.5);

            linkSelection
              .interrupt()
              .transition()
              .duration(180)
              .ease(d3.easeCubicOut)
              .attr("stroke", "oklch(0.84 0.01 245)")
              .attr("stroke-opacity", 0.4)
              .attr("stroke-width", 1);
          });

        state.linkSelection = linkSelection;
        state.nodeSelection = nodeSelection;

        state.simulation.nodes(nodes);
        state.simulation.force("link").links(links);
        state.simulation.alpha(0.4).restart();
      }

      function playTimeMachine() {
        if (timeMachineActive || typeof d3 === "undefined") return;
        timeMachineActive = true;

        const graphData = buildGraphDataFromStorage();
        const allNodes = graphData.nodes;
        if (allNodes.length === 0) {
          renderEmptyGraphState();
          timeMachineActive = false;
          return;
        }

        clearGraphArtifacts();
        const tooltip = createGraphTooltip();
        const width = graphContainer.clientWidth;
        const height = graphContainer.clientHeight;
        const graphCore = createGraphCore(width, height, tooltip);
        timeMachineSimulation = graphCore.simulation;

        const displayedNodes = [];
        let nodeIndex = 0;

        timeMachineInterval = setInterval(() => {
          if (nodeIndex >= allNodes.length) {
            clearInterval(timeMachineInterval);
            timeMachineInterval = null;
            timeMachineActive = false;
            return;
          }

          displayedNodes.push({ ...allNodes[nodeIndex] });

          const partialLinks = [];
          const partialSeen = new Set();
          const appendPartialLink = (source, target) => {
            const key = `${source}->${target}`;
            if (source === target || partialSeen.has(key)) {
              return;
            }
            partialSeen.add(key);
            partialLinks.push({ source, target, key });
          };

          for (let i = 1; i < displayedNodes.length; i += 1) {
            appendPartialLink(displayedNodes[i - 1].id, displayedNodes[i].id);
          }

          const groupRoots = {};
          displayedNodes.forEach((node) => {
            if (!groupRoots[node.group]) {
              groupRoots[node.group] = node.id;
              return;
            }
            appendPartialLink(groupRoots[node.group], node.id);
          });

          mountGraphData(graphCore, displayedNodes, partialLinks, {
            animateEnter: true,
            intervalMs: 420
          });

          nodeIndex += 1;
        }, 600);
      }

      function renderGraph() {
        if (typeof d3 === "undefined") {
          renderReviewBoard();
          return;
        }

        clearGraphArtifacts();

        const width = graphContainer.clientWidth;
        const height = graphContainer.clientHeight;
        const { nodes, links } = buildGraphDataFromStorage();

        if (nodes.length === 0) {
          renderEmptyGraphState();
          renderReviewBoard();
          renderDigestArchive();
          return;
        }

        const tooltip = createGraphTooltip();
        const graphCore = createGraphCore(width, height, tooltip);
        timeMachineSimulation = graphCore.simulation;
        mountGraphData(graphCore, nodes, links, { animateEnter: false });
        renderReviewBoard();
        renderDigestArchive();
      }

      inputText.addEventListener("keydown", (event) => {
        const isSubmitShortcut = (event.ctrlKey || event.metaKey) && event.key === "Enter";
        if (isSubmitShortcut) {
          event.preventDefault();
          analyzeBtn.click();
        }
      });

      inputText.addEventListener("input", () => {
        isDemoMode = false;
      });

      inputText.addEventListener("click", () => {
        if (!inputText.readOnly) {
          return;
        }

        const confirmed = confirm("确定要解锁并修改待内化的原文吗？");
        if (!confirmed) {
          return;
        }

        setInputLockState(false);
        inputText.focus();
      });

      cardsContainer.addEventListener("click", async (event) => {
        const button = event.target.closest(".copy-btn");
        if (!button || !cardsContainer.contains(button)) {
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

      sourceSwitchButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setSourceMode(button.dataset.sourceMode || "paste");
        });
      });

      importUrlBtn?.addEventListener("click", importUrlSource);
      pasteFromUrlBtn?.addEventListener("click", () => {
        if (writeSourceToMainInput(sourceUrlInput?.value || "")) {
          setSourceStatus("网页 URL 已写入内化区，请点击导入网页正文获取内容", false);
        }
      });

      convertMarkdownBtn?.addEventListener("click", () => {
        const markdown = markdownInput?.value || "";
        const text = markdownToDigestText(markdown);
        if (!text) {
          alert("请输入 Markdown 内容");
          return;
        }

        if (writeSourceToMainInput(text)) {
          setSourceStatus("Markdown 已转换并写入内化区", false);
        }
      });

      pasteMarkdownBtn?.addEventListener("click", () => {
        if (writeSourceToMainInput(markdownToDigestText(markdownInput?.value || ""))) {
          setSourceStatus("Markdown 已写入内化区", false);
        }
      });

      importSelectionBtn?.addEventListener("click", importSelectionSource);
      selectionToInputBtn?.addEventListener("click", importSelectionSource);

      function handleReviewAction(event) {
        const button = event.target.closest("[data-review-id]");
        if (!button) {
          const filterButton = event.target.closest("[data-review-filter]");
          if (!filterButton) {
            return;
          }

          reviewFilter = filterButton.getAttribute("data-review-filter") || "due";
          renderReviewBoard();
          return;
        }

        const nodeId = button.getAttribute("data-review-id");
        if (!nodeId) {
          return;
        }

        updateDigestReview(nodeId);
      }

      function handleDigestSearch(event) {
        digestQuery = event.target.value || "";
        renderReviewBoard();
        renderDigestArchive();
      }

      function handleTagFilter(tag) {
        digestTagFilter = tag || "all";
        renderReviewBoard();
        renderDigestArchive();
      }

      digestArchive?.addEventListener("click", handleReviewAction);
      digestReviewBoard?.addEventListener("click", handleReviewAction);
      digestReviewBoard?.addEventListener("input", (event) => {
        if (event.target && event.target.id === "digestSearchInput") {
          handleDigestSearch(event);
        }
      });
      digestReviewBoard?.addEventListener("click", (event) => {
        const tagButton = event.target.closest("[data-tag-filter]");
        if (!tagButton) {
          return;
        }

        handleTagFilter(tagButton.getAttribute("data-tag-filter") || "all");
      });

      quickTryButtons.forEach((button) => {
        button.addEventListener("click", () => {
          isDemoMode = true;
          const presetKey = button.dataset.quickTry;
          const presetText = quickTryPresets[presetKey];

          if (!presetText) {
            return;
          }

          inputText.value = presetText;
          analyzeBtn.click();
        });
      });

      analyzeBtn.addEventListener("click", async () => {
        const userInput = inputText.value.trim();

        if (!userInput) {
          alert("请输入需要内化的文章内容");
          return;
        }

        if (!hasDigestResult) {
          resultSection.classList.remove("is-visible");
        } else {
          resultSection.classList.add("is-visible");
          resultSection.classList.add("is-updating");
        }

        loading.style.display = "block";
        analyzeBtn.disabled = true;
        setInputLockState(true);
        resetAgentTrace();
        pushAgentTrace("正在初始化 Agent...");

        try {
          const parsed = await runAgentDigest(userInput);
          pushAgentTrace("输出完成，正在渲染结果...");

          renderResultCards(parsed, userInput);
          if (!isDemoMode) {
            appendDigestNode(userInput, parsed);
            futureGraphSection.style.display = "block";
            renderGraph();
          }
        } catch (error) {
          console.error("内化拆解失败:", error);
          pushAgentTrace("Agent 调用失败，请检查网络或模型返回格式");
          alert("内化拆解失败，请检查 API 地址、密钥或返回格式。");
          if (!hasDigestResult) {
            resultSection.classList.remove("is-visible");
            resetQualityBoard();
          } else {
            resultSection.classList.add("is-visible");
            resultSection.classList.remove("is-updating");
            renderQualityBoard(lastDigestInput, {
              mainPoint: mainPointText?.textContent || "",
              arguments: Array.from(argumentsList?.querySelectorAll("li") || []).map((li) => li.textContent || ""),
              framework: frameworkText?.textContent || "",
              question: questionText?.textContent || ""
            });
          }
        } finally {
          loading.style.display = "none";
          analyzeBtn.disabled = false;
        }
      });

      downloadBtn.addEventListener("click", downloadPoster);
      exportMdBtn.addEventListener("click", exportMarkdown);

      const timeMachineBtn = document.getElementById("timeMachineBtn");
      if (timeMachineBtn) {
        timeMachineBtn.addEventListener("click", playTimeMachine);
      }

      const heroCover = document.getElementById("heroCover");
      const heroContent = document.getElementById("heroContent");
      const heroGhostBtn = document.getElementById("heroGhostBtn");
      const appRoot = document.getElementById("appRoot");
      let heroEnterTriggered = false;

      function triggerHeroEnter() {
        if (!heroGhostBtn || !heroCover || !heroContent || !appRoot || heroEnterTriggered) {
          return;
        }

        heroEnterTriggered = true;
        heroContent.classList.add("is-launching");
        heroCover.classList.add("is-darkening");

        window.setTimeout(() => {
          heroCover.classList.add("is-leaving");
          appRoot.classList.remove("app--hidden");
          appRoot.classList.add("app--revealing");
        }, 620);

        window.setTimeout(() => {
          appRoot.classList.remove("app--revealing");
        }, 1700);
      }

      if (heroGhostBtn && heroCover && heroContent && appRoot) {
        heroGhostBtn.addEventListener("click", triggerHeroEnter);
      }

      let wheelTriggerArmed = true;
      window.addEventListener(
        "wheel",
        (event) => {
          if (!heroCover || heroCover.classList.contains("is-leaving") || heroEnterTriggered) {
            return;
          }

          if (window.scrollY > 0 || !wheelTriggerArmed) {
            return;
          }

          if (event.deltaY > 18) {
            event.preventDefault();
            wheelTriggerArmed = false;
            triggerHeroEnter();

            window.setTimeout(() => {
              wheelTriggerArmed = true;
            }, 900);
          }
        },
        { passive: false }
      );

      setInputLockState(false);
      initDigestStorage();
      resetQualityBoard();
      resetAgentTrace();
      setSourceMode("paste");
      clearSourceFields();
      renderReviewBoard();
      renderDigestArchive();
    



