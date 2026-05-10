export const DIGEST_STORAGE_KEY = "digest_nodes";
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30];

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

import store from "../app/store.js";

function safeReadStorage(key) {
  try {
    // 原实现（备份）:
    // return localStorage.getItem(key);

    // 现改用 store 读取节点片段，保持与旧接口返回 string/null 的兼容性
    const nodes = (store && typeof store.getState === "function") ? store.getState().nodes || [] : [];
    return JSON.stringify(nodes);
  } catch (error) {
    console.error("读取本地存储失败:", error);
    return null;
  }
}

function safeWriteStorage(key, value) {
  try {
    // 备份旧写法：
    // localStorage.setItem(key, value);

    // 通过 store 进行写入（dispatch），保持外部 API 不变
    if (store && typeof store.dispatch === "function") {
      let parsed = [];
      try {
        parsed = value ? JSON.parse(value) : [];
      } catch (e) {
        // 如果传入已经是数组或对象的字符串化形式失败，尝试保持原样
        parsed = [];
      }
      store.dispatch({ type: "MERGE_STATE", payload: { nodes: parsed } });
    }
    return true;
  } catch (error) {
    console.error("写入本地存储失败:", error);
    return false;
  }
}

export function normalizeDigestNode(node) {
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

export function initDigestStorage() {
  try {
    const raw = safeReadStorage(DIGEST_STORAGE_KEY);
    if (!raw) {
      safeWriteStorage(DIGEST_STORAGE_KEY, JSON.stringify([]));
      return;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      safeWriteStorage(DIGEST_STORAGE_KEY, JSON.stringify([]));
      return;
    }

    const normalized = parsed
      .filter((node) => !(typeof node?.id === "string" && node.id.startsWith("seed-")))
      .map((node) => normalizeDigestNode(node));

    safeWriteStorage(DIGEST_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.error("初始化本地知识库失败:", error);
    safeWriteStorage(DIGEST_STORAGE_KEY, JSON.stringify([]));
  }
}

export function getDigestNodes() {
  try {
    const raw = safeReadStorage(DIGEST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((node) => !(typeof node?.id === "string" && node.id.startsWith("seed-")))
      .map((node) => normalizeDigestNode(node));
  } catch (error) {
    console.error("读取本地知识库失败:", error);
    return [];
  }
}

export function saveDigestNodes(nodes) {
  return safeWriteStorage(DIGEST_STORAGE_KEY, JSON.stringify(nodes));
}

export function extractDigestTags(userInput, parsedResult) {
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

export function appendDigestNode(userInput, parsedResult) {
  const currentNodes = getDigestNodes();
  const safeInput = (userInput || "").trim().replace(/\s+/g, " ");
  const inputSnippet = safeInput.slice(0, 15) || "用户输入";
  const mainPoint = (parsedResult?.mainPoint || "未返回核心论").trim();
  const createdAt = new Date().toISOString();
  const tags = extractDigestTags(safeInput, parsedResult);

  const node = {
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
  };

  currentNodes.push(node);
  saveDigestNodes(currentNodes);
  return node;
}

export function formatDigestTimestamp(createdAt) {
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

export function formatReviewTime(value) {
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

export function getReviewSchedule(count) {
  const safeCount = Number.isFinite(count) && count >= 0 ? count : 0;
  return REVIEW_INTERVAL_DAYS[Math.min(safeCount, REVIEW_INTERVAL_DAYS.length - 1)];
}

export function getReviewStatus(node) {
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

export function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function matchesDigestQuery(node, query) {
  if (!query) {
    return true;
  }

  const searchableText = [node.label, node.title, node.insight, node.group, node.createdAt, node.review?.lastReviewedAt, node.review?.nextReviewAt, ...(node.tags || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes(query);
}

export function matchesDigestTag(node, tag) {
  if (!tag || tag === "all") {
    return true;
  }

  return Array.isArray(node.tags) && node.tags.includes(tag);
}

export function scheduleNextReview(node, reviewedAt = new Date()) {
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

export function updateDigestReview(nodeId) {
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
    return { changed: false, nodes: currentNodes };
  }

  saveDigestNodes(nextNodes);
  return { changed: true, nodes: nextNodes };
}

export function extractDigestTokens(text) {
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

export function evaluateDigestQuality(userInput, parsed) {
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

export function searchLocalKnowledgeTool(args, userInput) {
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
