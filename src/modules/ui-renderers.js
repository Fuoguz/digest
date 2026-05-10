import {
  evaluateDigestQuality,
  formatDigestTimestamp,
  formatReviewTime,
  getReviewStatus,
  matchesDigestQuery,
  matchesDigestTag,
  normalizeDigestNode,
  normalizeSearchText
} from "./storage.js";

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function syncCardReferences(refs) {
  refs.mainPointText = document.getElementById("mainPointText");
  refs.argumentsList = document.getElementById("argumentsList");
  refs.frameworkText = document.getElementById("frameworkText");
  refs.questionText = document.getElementById("questionText");
}

export function renderQualityBoard(refs, userInput, parsed) {
  if (!refs.qualityBoard || !refs.qualitySubtitle || !refs.qualityScorePill || !refs.qualityCompletenessValue || !refs.qualityConfidenceValue || !refs.qualityTopicValue || !refs.qualityCompletenessBar || !refs.qualityConfidenceBar || !refs.qualityTopicBar || !refs.qualityChecklist) {
    return;
  }

  const quality = evaluateDigestQuality(userInput, parsed);
  const formatPercent = (value) => `${Math.max(0, Math.min(100, Math.round(value)))}%`;

  refs.qualitySubtitle.textContent = quality.warnings.length === 0 ? "本次结果结构完整，适合直接进入积淀与复习流程" : `本次结果有 ${quality.warnings.length} 项提示，建议先确认后再继续沉淀。`;
  refs.qualityScorePill.textContent = quality.isStable ? "稳定" : `${quality.confidence}%`;
  refs.qualityCompletenessValue.textContent = formatPercent(quality.completeness);
  refs.qualityConfidenceValue.textContent = formatPercent(quality.confidence);
  refs.qualityTopicValue.textContent = quality.offTopic ? "偏题风险" : quality.topicRisk >= 25 ? "轻微风险" : "风险";
  refs.qualityCompletenessBar.style.width = formatPercent(quality.completeness);
  refs.qualityConfidenceBar.style.width = formatPercent(quality.confidence);
  refs.qualityTopicBar.style.width = formatPercent(quality.topicRisk);

  const checklistItems = [
    { ok: quality.missingFields.length === 0, text: quality.missingFields.length === 0 ? "四个结构齐全" : `缺少 ${quality.missingFields.join("")}` },
    { ok: quality.confidence >= 70, text: quality.confidence >= 70 ? "表达稳定，适合直接沉淀" : "置信度偏低，建议再核对一次输入" },
    { ok: !quality.offTopic, text: quality.offTopic ? "可能偏题，建议重新检查原文关键词" : "主题相关性正常" }
  ];

  const warnings = quality.warnings.map((warning) => ({ ok: false, text: warning }));
  refs.qualityChecklist.innerHTML = [...checklistItems, ...warnings]
    .map((item) => `<li class="quality-item ${item.ok ? "" : "is-warning"}"><span class="quality-item-badge">${item.ok ? "" : "!"}</span><span class="quality-item-text">${escapeHTML(item.text)}</span></li>`)
    .join("") || '<li class="quality-empty">暂时没有可展示的质量提示</li>';
}

export function renderResultCards(refs, parsed, userInput = "") {
  refs.resultSection.classList.add("is-visible");
  refs.resultSection.classList.remove("is-updating");

  const argumentsMarkup = Array.isArray(parsed.arguments) && parsed.arguments.length > 0 ? parsed.arguments.map((item) => `<li>${escapeHTML(item)}</li>`).join("") : "<li>未返回核心论据</li>";
  const cardDelays = [0, 0.1, 0.2, 0.3];

  refs.cardsContainer.innerHTML = `
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
      <ul id="argumentsList" class="card-content">${argumentsMarkup}</ul>
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

  syncCardReferences(refs);
  renderQualityBoard(refs, userInput, parsed);
}

export function renderReviewBoard(refs, state) {
  if (!refs.digestReviewBoard) {
    return;
  }

  const nodes = Array.isArray(state.nodes) ? state.nodes : [];
  const reviewFilter = state.reviewFilter || "due";
  const digestQuery = state.digestQuery || "";
  const digestTagFilter = state.digestTagFilter || "all";

  const normalizedNodes = nodes.map((node) => ({ node: normalizeDigestNode(node), status: getReviewStatus(node) }));
  const query = normalizeSearchText(digestQuery);
  const filteredNodes = normalizedNodes.filter(({ node }) => matchesDigestQuery(node, query) && matchesDigestTag(node, digestTagFilter));

  const dueNodes = filteredNodes
    .filter(({ status }) => status.due)
    .sort((left, right) => new Date(left.status.nextReviewAt || 0).getTime() - new Date(right.status.nextReviewAt || 0).getTime());

  const completedNodes = filteredNodes.filter(({ status }) => !status.due && status.count > 0);
  const allNodes = filteredNodes.slice().sort((left, right) => new Date(left.node.createdAt || 0).getTime() - new Date(right.node.createdAt || 0).getTime());
  const visibleNodes = reviewFilter === "all" ? allNodes : reviewFilter === "done" ? completedNodes : dueNodes;

  const nextDue = filteredNodes
    .filter(({ status }) => !status.due)
    .sort((left, right) => new Date(left.status.nextReviewAt || 0).getTime() - new Date(right.status.nextReviewAt || 0).getTime())[0];

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

  const tagOptions = Array.from(tagCounts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"));

  refs.digestReviewBoard.innerHTML = `
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
          ${tagOptions.map(([tag, count]) => `<button class="tag-filter-btn ${digestTagFilter === tag ? "is-active" : ""}" type="button" data-tag-filter="${escapeHTML(tag)}">${escapeHTML(tag)} · ${count}</button>`).join("")}
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

export function renderDigestArchive(refs, state) {
  if (!refs.digestArchive) {
    return;
  }

  const nodes = (Array.isArray(state.nodes) ? state.nodes : []).slice().reverse();
  const query = normalizeSearchText(state.digestQuery || "");
  const digestTagFilter = state.digestTagFilter || "all";
  const filteredNodes = nodes.filter((node) => matchesDigestQuery(node, query) && matchesDigestTag(node, digestTagFilter));

  if (nodes.length === 0) {
    refs.digestArchive.innerHTML = `<div class="archive-empty">这里会沉淀你的内化记录。完成一次成功拆解后，知识节点会以可折叠卡片的形式出现，和上方图谱保持同步。</div>`;
    return;
  }

  if (filteredNodes.length === 0) {
    refs.digestArchive.innerHTML = `<div class="archive-empty">没有找到匹配的积淀，试试更换搜索词，或者清空上方搜索框。</div>`;
    return;
  }

  refs.digestArchive.innerHTML = filteredNodes
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
      const tagMarkup = Array.isArray(node.tags) && node.tags.length > 0 ? node.tags.map((tag) => `<span class="archive-tag">${escapeHTML(tag)}</span>`).join("") : '<span class="archive-tag">通用</span>';

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
