import { t as tr, th, getLocale } from "./i18n.js";
import { iconHTML } from "./icons.js";
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

const studyNav = [
  ["/app/", "home", "继续学习"],
  ["/app/courses", "course", "课程"],
  ["/app/review", "review", "复习"],
];
const sourceNav = [
  ["/app/library", "library", "资料库"],
  ["/app/search", "search", "搜索"],
  ["/app/graph", "graph", "知识图谱"],
];
const mobileNav = [studyNav[0], studyNav[1], sourceNav[0], studyNav[2]];

function navItems(items, path, className = "nav-item") {
  return items
    .map(([href, icon, label]) => {
      const active = href === "/app/" ? path === href : path.startsWith(href);
      return (
        '<a class="' +
        className +
        (active ? " active" : "") +
        '" data-route href="' +
        href +
        '">' +
        iconHTML(icon) +
        "<span>" +
        tr(label) +
        "</span></a>"
      );
    })
    .join("");
}

export function shellHTML(path) {
  return (
    th(
      '<a class="skip-link" href="#page-root">跳到主要内容</a><div class="app-shell"><aside class="sidebar"><div class="sidebar-head"><a class="brand" href="/" aria-label="Digest 首页"><span class="brand-mark">D</span><span>Digest</span></a></div><nav class="nav-group" aria-label="学习"><p class="workspace-label">学习</p><div class="nav-list">',
    ) +
    navItems(studyNav, path) +
    th(
      '</div></nav><nav class="nav-group" aria-label="资料与工具"><p class="workspace-label">资料与工具</p><div class="nav-list">',
    ) +
    navItems(sourceNav, path) +
    th(
      '</div></nav><div class="sidebar-foot"><a class="nav-item" data-route href="/app/settings">',
    ) +
    iconHTML("settings") +
    th(
      '<span>设置与备份</span></a><p class="local-note">本地保存 · 无云同步</p></div></aside><section class="workspace"><header class="topbar"><a class="brand mobile-head" href="/" aria-label="Digest 首页"><span class="brand-mark">D</span><span>Digest</span></a><div class="crumb" id="page-crumb">工作台 / <strong>继续学习</strong></div><div class="topbar-actions"><button class="icon-button" type="button" aria-label="搜索" title="搜索" data-route-button="/app/search">',
    ) +
    iconHTML("search") +
    '</button><button class="primary-action import-action" type="button" data-open-import>' +
    iconHTML("plus") +
    th(
      '<span class="import-label">导入资料</span></button></div></header><main id="page-root" tabindex="-1"></main></section><nav class="tabbar" aria-label="主导航">',
    ) +
    navItems(mobileNav, path, "tab-item") +
    "</nav></div>" +
    importDialogHTML() +
    '<div id="toast-root" aria-live="polite"></div>'
  );
}

const SHORT_TYPES = { text: "TXT", markdown: "MD", pdf: "PDF", epub: "EPUB", legacy: "OLD" };

function modeLabel(mode) {
  return READING_MODES[mode] || READING_MODES.general;
}

function sourceLabel(type) {
  return SOURCE_TYPES[type] || tr("资料");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return tr("刚刚");
  return new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric",
  }).format(date);
}

function emptyState(title, description, action = "导入第一份资料") {
  return (
    '<div class="core-empty"><span class="empty-glyph" aria-hidden="true"></span><h2>' +
    title +
    "</h2><p>" +
    description +
    '</p><button class="primary-action" type="button" data-open-import>' +
    iconHTML("plus") +
    "<span>" +
    tr(action) +
    "</span></button></div>"
  );
}

function migrationNotice(migration) {
  if (!migration?.backupCreated) return "";
  return (
    th('<div class="notice"><span>已将旧版数据迁移为 ') +
    migration.migrated +
    th(
      ' 条资料，并保留原 localStorage 数据。</span><button type="button" data-download-backup>下载 JSON 备份</button></div>',
    )
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
  const chip = (active, attrs, label) =>
    '<button class="filter-chip' +
    (active ? " active" : "") +
    '" ' +
    attrs +
    ' type="button" aria-pressed="' +
    active +
    '">' +
    label +
    "</button>";
  const tagButtons = ["all", ...tags]
    .map((tag) =>
      chip(
        state.filters.tag === tag,
        'data-tag="' + escapeHTML(tag) + '"',
        tag === "all" ? tr("全部") : escapeHTML(tag),
      ),
    )
    .join("");
  const rows = filtered
    .map(
      (document) =>
        '<article class="document-row"><span class="doc-type-mark" aria-hidden="true">' +
        escapeHTML(SHORT_TYPES[document.sourceType] || "DOC") +
        '</span><div class="doc-title" data-open-document="' +
        escapeHTML(document.id) +
        '" tabindex="0" role="link"><strong>' +
        escapeHTML(document.title) +
        "</strong><small>" +
        escapeHTML(
          (
            document.rawContent ||
            document.metadata?.legacyInsight ||
            tr("旧版资料缺少原文")
          ).slice(0, 90),
        ) +
        "</small>" +
        ((document.tags || []).length
          ? '<span class="doc-tags">' +
            document.tags
              .slice(0, 3)
              .map((tag) => '<span class="tag">' + escapeHTML(tag) + "</span>")
              .join("") +
            "</span>"
          : "") +
        '</div><div class="doc-cell doc-type">' +
        escapeHTML(sourceLabel(document.sourceType)) +
        '</div><div class="doc-cell doc-mode">' +
        escapeHTML(modeLabel(document.readingMode)) +
        '</div><div class="doc-cell doc-date">' +
        formatDate(document.updatedAt) +
        '</div><button class="favorite' +
        (document.favorite ? " on" : "") +
        '" data-favorite="' +
        escapeHTML(document.id) +
        '" aria-pressed="' +
        Boolean(document.favorite) +
        th('" aria-label="收藏" title="收藏">') +
        (document.favorite ? "★" : "☆") +
        "</button></article>",
    )
    .join("");
  return (
    th(
      '<section class="page core-page" data-view="library"><header class="page-header"><p class="page-kicker">资料与工具</p><h1>资料库</h1><p class="page-subtitle">',
    ) +
    state.documents.length +
    th(" 份资料 · 本地保存</p></header>") +
    migrationNotice(state.migration) +
    '<div class="library-tools"><label class="search-field">' +
    iconHTML("search") +
    '<input type="search" data-library-search value="' +
    escapeHTML(state.filters.query) +
    th(
      '" placeholder="搜索标题、正文或标签" aria-label="搜索资料"></label><select class="filter-select" data-source-filter aria-label="资料类型"><option value="all">全部类型</option><option value="pdf">PDF</option><option value="epub">EPUB</option><option value="text">TXT</option><option value="markdown">Markdown</option><option value="legacy">旧版条目</option></select><select class="filter-select" data-mode-filter aria-label="研读模式"><option value="all">全部模式</option><option value="general">General</option><option value="academic_paper">Academic Paper</option><option value="legal_case">Legal Case</option><option value="policy_document">Policy Document</option></select></div><div class="filter-chips" role="group" aria-label="筛选">',
    ) +
    tagButtons +
    chip(state.filters.favorite, "data-favorites", th("★ 收藏")) +
    chip(state.filters.due, "data-due-filter", tr("待复习")) +
    "</div>" +
    (filtered.length
      ? '<p class="list-count">' +
        filtered.length +
        " / " +
        state.documents.length +
        '</p><div class="document-table">' +
        rows +
        "</div>"
      : state.documents.length
        ? emptyState(
            tr("没有匹配的资料"),
            tr("调整关键词或筛选条件，查看资料库中的其他内容。"),
            "导入新资料",
          )
        : emptyState(
            tr("资料库还没有内容"),
            tr("支持带文本层的 PDF、无加密 EPUB、TXT、Markdown，也可以直接粘贴正文。"),
          )) +
    "</section>"
  );
}

export function renderComingSoon() {
  return th(
    '<section class="page core-page"><div class="core-empty"><span class="empty-glyph" aria-hidden="true"></span><h1>没有找到这个页面</h1><p><a class="quiet-link" data-route href="/app/library">返回资料库</a></p></div></section>',
  );
}

function importDialogHTML() {
  return th(
    '<dialog id="import-dialog" aria-labelledby="import-heading"><div class="dialog-head"><div><h2 id="import-heading">导入资料</h2><p>文件只在当前浏览器中解析和保存。</p></div><button class="dialog-close" type="button" data-close-import aria-label="关闭">×</button></div><form class="import-form" id="import-form"><label class="drop-zone" id="drop-zone" tabindex="0" role="button" aria-label="选择 PDF、EPUB、TXT 或 Markdown 文件">' +
      iconHTML("upload") +
      '<strong>拖入 PDF、EPUB、TXT 或 Markdown</strong><span>PDF 需含文本层，最大 20 MB · EPUB 需无 DRM 加密，最大 50 MB</span><input id="file-input" type="file" accept=".pdf,.epub,.txt,.md,.markdown,text/plain,text/markdown,application/pdf,application/epub+zip"></label><div class="file-status" id="file-status" role="status"></div><div class="import-structure" id="import-structure" hidden></div><div class="or-divider">或者粘贴正文</div><div class="field"><label for="import-content">正文</label><textarea id="import-content" placeholder="粘贴课程资料、文章或其他文本…"></textarea></div><div class="field"><label for="import-title">标题</label><input id="import-title" maxlength="180" placeholder="资料标题"></div><div class="field-row"><div class="field"><label for="import-mode">研读模式</label><select id="import-mode"><option value="general">General</option><option value="academic_paper">Academic Paper</option><option value="legal_case">Legal Case</option><option value="policy_document">Policy Document</option></select></div><div class="field"><label for="import-tags">标签</label><input id="import-tags" placeholder="课程，主题"></div></div><div class="dialog-actions"><button class="secondary-action" type="button" data-close-import>取消</button><button class="primary-action" id="import-submit" type="submit">保存到资料库</button></div></form></dialog>',
  );
}
