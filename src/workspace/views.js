import {
  matchesDocument,
  READING_MODES,
  SOURCE_TYPES,
} from "../domain/documents.js";

export function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}

const icons = {
  dashboard:
    '<svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
  library:
    '<svg viewBox="0 0 24 24"><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M7 20V6a2 2 0 0 0-2-2"/></svg>',
  review:
    '<svg viewBox="0 0 24 24"><path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h3"/></svg>',
  graph:
    '<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="15" cy="18" r="2.5"/><path d="m8.5 7 7-1M7.5 9l6 7M17.5 8.5 16 15.5"/></svg>',
  search:
    '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1A8 8 0 0 0 15 6l-.4-2.7h-4L10 6a7 7 0 0 0-1.5.9L6 6 4 9.4 6.1 11a7 7 0 0 0 0 2L4 14.6 6 18l2.5-1a7 7 0 0 0 1.5.9l.5 2.7h4L15 18a7 7 0 0 0 1.5-.9l2.5 1 2-3.4-2.1-1.6a7 7 0 0 0 .1-1z"/></svg>',
};

const nav = [
  ["/app/", "dashboard", "Dashboard"],
  ["/app/library", "library", "资料库"],
  ["/app/review", "review", "复习"],
  ["/app/graph", "graph", "知识图谱"],
];

export function shellHTML(path) {
  const navHTML = nav
    .map(([href, icon, label]) => {
      const active = href === "/app/" ? path === href : path.startsWith(href);
      return (
        '<a class="nav-item ' +
        (active ? "active" : "") +
        '" data-route href="' +
        href +
        '"><span class="nav-icon">' +
        icons[icon] +
        "</span><span>" +
        label +
        "</span></a>"
      );
    })
    .join("");
  return (
    '<a class="skip-link" href="#page-root">跳到主要内容</a><div class="app-shell"><aside class="sidebar"><div class="sidebar-head"><a class="brand" href="/" aria-label="Digest 首页"><span class="brand-mark">D</span><span>Digest</span></a></div><p class="workspace-label">学习工作台</p><nav class="nav-list">' +
    navHTML +
    '</nav><div class="nav-spacer"></div><p class="workspace-label">工具</p><nav class="nav-list"><a class="nav-item" data-route href="/app/search"><span class="nav-icon">' +
    icons.search +
    '</span><span>搜索</span></a></nav><div class="sidebar-foot"><a class="nav-item" data-route href="/app/settings"><span class="nav-icon">' +
    icons.settings +
    '</span><span>设置</span></a></div></aside><section class="workspace"><header class="topbar"><span class="mobile-head">Digest</span><div class="crumb" id="page-crumb">工作台 / <strong>Dashboard</strong></div><div class="topbar-actions"><button class="icon-button" type="button" aria-label="搜索" data-route-button="/app/search">⌕</button><button class="primary-action" type="button" data-open-import><span>＋</span> 导入资料</button></div></header><main id="page-root"></main></section></div>' +
    importDialogHTML() +
    '<div id="toast-root" aria-live="polite"></div>'
  );
}

function modeLabel(mode) {
  return READING_MODES[mode] || READING_MODES.general;
}

function sourceLabel(type) {
  return SOURCE_TYPES[type] || "资料";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" })
    .format(date)
    .replace("/", ".");
}

function documentItem(document) {
  const tags = (document.tags || [])
    .slice(0, 2)
    .map((tag) => '<span class="tag">' + escapeHTML(tag) + "</span>")
    .join("");
  return (
    '<article class="recent-item" data-open-document="' +
    escapeHTML(document.id) +
    '" tabindex="0"><div class="file-badge">' +
    escapeHTML(sourceLabel(document.sourceType).slice(0, 3).toUpperCase()) +
    '</div><div class="recent-copy"><strong>' +
    escapeHTML(document.title) +
    "</strong><span>" +
    escapeHTML(modeLabel(document.readingMode)) +
    " · " +
    document.paragraphs.length +
    " 个段落</span><div>" +
    tags +
    '</div></div><span class="recent-meta">' +
    formatDate(document.updatedAt) +
    "</span></article>"
  );
}

function emptyState(title, description) {
  return (
    '<div class="empty-state"><div class="empty-state-inner"><div class="empty-glyph"></div><h2>' +
    title +
    "</h2><p>" +
    description +
    '</p><button class="primary-action" type="button" data-open-import>＋ 导入第一份资料</button></div></div>'
  );
}

function migrationNotice(migration) {
  if (!migration?.backupCreated) return "";
  return (
    '<div class="notice"><span>已将旧版数据迁移为 ' +
    migration.migrated +
    ' 条资料，并保留原 localStorage 数据。</span><button type="button" data-download-backup>下载 JSON 备份</button></div>'
  );
}

export function renderDashboard(state) {
  const recent = [...state.documents]
    .sort((a, b) =>
      String(b.lastReadAt || b.createdAt).localeCompare(
        String(a.lastReadAt || a.createdAt),
      ),
    )
    .slice(0, 5);
  const stats = state.stats || { due: 0, completed: 0, streak: 0 };
  const now = new Date();
  const date = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(
    now,
  );
  return (
    '<section class="page"><div class="page-head"><div><p class="page-kicker">Your study desk</p><h1>继续积累，持续记住</h1><p class="page-subtitle">资料、研读结果和复习进度都保存在当前浏览器。</p></div><div class="date-card"><strong>' +
    date +
    "</strong><span>" +
    weekday +
    "</span></div></div>" +
    migrationNotice(state.migration) +
    '<div class="metrics"><div class="metric"><span>今日待复习</span><strong>' +
    stats.due +
    '</strong><small><a data-route href="/app/review">开始今日复习 →</a></small></div><div class="metric"><span>今日已完成</span><strong>' +
    stats.completed +
    '</strong><small>逐题完成，逐次巩固</small></div><div class="metric"><span>连续学习</span><strong>' +
    stats.streak +
    ' <small>天</small></strong><small>研读与复习的连续日期</small></div><div class="metric"><span>资料库</span><strong>' +
    state.documents.length +
    " <small>份</small></strong><small>" +
    state.documents.reduce((sum, item) => sum + item.paragraphs.length, 0) +
    ' 个段落</small></div></div><div class="section-row"><h2>最近研读与导入</h2><button class="quiet-link" type="button" data-route-button="/app/library">查看全部 →</button></div>' +
    (recent.length
      ? '<div class="recent-list">' +
        recent.map(documentItem).join("") +
        "</div>"
      : emptyState(
          "从一份真正要读的资料开始",
          "导入 PDF、TXT、Markdown，或直接粘贴正文。Digest 会保留来源信息和段落结构。",
        )) +
    "</section>"
  );
}

export function renderLibrary(state) {
  const filtered = state.documents.filter(
    (document) =>
      matchesDocument(document, state.filters) &&
      (!state.filters.due || state.dueDocumentIds?.has(document.id)),
  );
  const tags = [
    ...new Set(state.documents.flatMap((document) => document.tags || [])),
  ].slice(0, 12);
  const tagButtons = ["all", ...tags]
    .map(
      (tag) =>
        '<button class="filter-chip ' +
        (state.filters.tag === tag ? "active" : "") +
        '" data-tag="' +
        escapeHTML(tag) +
        '" type="button">' +
        (tag === "all" ? "全部" : escapeHTML(tag)) +
        "</button>",
    )
    .join("");
  const rows = filtered
    .map(
      (document) =>
        '<article class="document-row"><div class="doc-title" data-open-document="' +
        escapeHTML(document.id) +
        '" tabindex="0"><strong>' +
        escapeHTML(document.title) +
        "</strong><small>" +
        escapeHTML(
          (
            document.rawContent ||
            document.metadata?.legacyInsight ||
            "旧版资料缺少原文"
          ).slice(0, 62),
        ) +
        '</small></div><div class="doc-cell doc-type">' +
        escapeHTML(sourceLabel(document.sourceType)) +
        '</div><div class="doc-cell doc-mode">' +
        escapeHTML(modeLabel(document.readingMode)) +
        '</div><div class="doc-cell">' +
        formatDate(document.updatedAt) +
        '</div><button class="favorite ' +
        (document.favorite ? "on" : "") +
        '" data-favorite="' +
        escapeHTML(document.id) +
        '" aria-label="收藏">★</button></article>',
    )
    .join("");
  return (
    '<section class="page"><div class="page-head"><div><p class="page-kicker">Library</p><h1>资料库</h1><p class="page-subtitle">' +
    state.documents.length +
    " 份资料 · 本地保存</p></div></div>" +
    migrationNotice(state.migration) +
    '<div class="library-tools"><label class="search-field"><input type="search" data-library-search value="' +
    escapeHTML(state.filters.query) +
    '" placeholder="搜索标题、正文或标签" aria-label="搜索资料"></label><select class="filter-select" data-source-filter aria-label="资料类型"><option value="all">全部类型</option><option value="pdf">PDF</option><option value="text">TXT</option><option value="markdown">Markdown</option><option value="legacy">旧版条目</option></select><select class="filter-select" data-mode-filter aria-label="研读模式"><option value="all">全部模式</option><option value="general">General</option><option value="academic_paper">Academic Paper</option><option value="legal_case">Legal Case</option><option value="policy_document">Policy Document</option></select></div><div class="filter-chips">' +
    tagButtons +
    '<button class="filter-chip ' +
    (state.filters.favorite ? "active" : "") +
    '" data-favorites type="button">★ 收藏</button><button class="filter-chip ' +
    (state.filters.due ? "active" : "") +
    '" data-due-filter type="button">待复习</button></div>' +
    (filtered.length
      ? '<div class="document-table">' + rows + "</div>"
      : state.documents.length
        ? emptyState(
            "没有匹配的资料",
            "调整关键词或筛选条件，查看资料库中的其他内容。",
          ).replace("导入第一份资料", "导入新资料")
        : emptyState(
            "资料库还没有内容",
            "支持带文本层的 PDF、TXT、Markdown，也可以直接粘贴正文。",
          )) +
    "</section>"
  );
}

export function renderComingSoon() {
  return '<section class="page"><h1>没有找到这个页面</h1><p><a data-route href="/app/library">返回资料库</a></p></section>';
}

function importDialogHTML() {
  return '<dialog id="import-dialog"><div class="dialog-head"><div><h2>导入资料</h2><p>文件只在当前浏览器中解析和保存。</p></div><button class="dialog-close" type="button" data-close-import aria-label="关闭">×</button></div><form class="import-form" id="import-form"><label class="drop-zone" id="drop-zone" tabindex="0" role="button" aria-label="选择 PDF、TXT 或 Markdown 文件"><strong>拖入 PDF、TXT 或 Markdown</strong><span>PDF 需包含文本层 · 最大 20 MB</span><input id="file-input" type="file" accept=".pdf,.txt,.md,.markdown,text/plain,text/markdown,application/pdf"></label><div class="file-status" id="file-status"></div><div class="or-divider">或者粘贴正文</div><div class="field"><label for="import-content">正文</label><textarea id="import-content" placeholder="粘贴课程资料、文章或其他文本…"></textarea></div><div class="field"><label for="import-title">标题</label><input id="import-title" maxlength="180" placeholder="资料标题"></div><div class="field-row"><div class="field"><label for="import-mode">研读模式</label><select id="import-mode"><option value="general">General</option><option value="academic_paper">Academic Paper</option><option value="legal_case">Legal Case</option><option value="policy_document">Policy Document</option></select></div><div class="field"><label for="import-tags">标签</label><input id="import-tags" placeholder="课程，主题"></div></div><div class="dialog-actions"><button class="secondary-action" type="button" data-close-import>取消</button><button class="primary-action" id="import-submit" type="submit">保存到资料库</button></div></form></dialog>';
}
