import { createDocument, makeId } from '../domain/documents.js';
import { openDatabase, listDocuments, saveDocument, addActivity, getDocument } from '../data/db.js';
import { LEGACY_BACKUP_KEY, runLegacyMigration } from '../data/legacy-migration.js';
import { extractTextFile, fileExtension } from '../importers/text.js';
import { extractPdfFile } from '../importers/pdf.js';
import { shellHTML, renderDashboard, renderLibrary, renderComingSoon } from './views.js';
import { mountReader } from '../reader/reader.js';

const root = document.querySelector('#app');
const state = {
  documents: [],
  migration: null,
  filters: { query: '', sourceType: 'all', readingMode: 'all', tag: 'all', favorite: false },
  importData: null,
  importing: false
};

let db;
let toastTimer;
let disposeReader;
let routeVersion = 0;

function normalizedPath() {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '/app' ? '/app/' : path;
}

function currentTitle(path) {
  if (path === '/app/') return 'Dashboard';
  if (path.startsWith('/app/library')) return '资料库';
  if (path.startsWith('/app/reader')) return 'Reader';
  if (path.startsWith('/app/review')) return '复习';
  if (path.startsWith('/app/graph')) return '知识图谱';
  if (path.startsWith('/app/search')) return '搜索';
  return '设置';
}

function updateNavigation(path) {
  document.querySelectorAll('[data-route]').forEach((link) => {
    const href = link.getAttribute('href');
    link.classList.toggle('active', href === '/app/' ? path === href : path.startsWith(href));
  });
  const crumb = document.querySelector('#page-crumb');
  if (crumb) crumb.innerHTML = '工作台 / <strong>' + currentTitle(path) + '</strong>';
  document.title = currentTitle(path) + ' · Digest';
}

async function renderCurrent() {
  const version = ++routeVersion;
  disposeReader?.(); disposeReader = null;
  const path = normalizedPath();
  document.body.classList.toggle('reader-open', path.startsWith('/app/reader/'));
  updateNavigation(path);
  const page = document.querySelector('#page-root');
  if (path === '/app/') page.innerHTML = renderDashboard(state);
  else if (path === '/app/library') {
    page.innerHTML = renderLibrary(state);
    const source = page.querySelector('[data-source-filter]');
    if (source) source.value = state.filters.sourceType;
    const mode = page.querySelector('[data-mode-filter]');
    if (mode) mode.value = state.filters.readingMode;
  } else if (path.startsWith('/app/reader/')) {
    page.textContent = '正在打开资料…';
    try {
      const item = await getDocument(decodeURIComponent(path.slice('/app/reader/'.length)), db);
      if (version !== routeVersion) return;
      if (!item) { page.textContent = '未找到这份资料，请返回资料库。'; return; }
      const dispose = await mountReader(page, item, db, () => version === routeVersion);
      if (version === routeVersion) disposeReader = dispose;
      else dispose();
    } catch {
      if (version === routeVersion) page.textContent = '资料加载失败，请刷新或返回资料库重试。';
    }
  } else {
    const id = path.startsWith('/app/reader/') ? decodeURIComponent(path.split('/').pop()) : null;
    page.innerHTML = renderComingSoon(path, id ? await getDocument(id, db) : null);
  }
}

function navigate(path) {
  if (window.location.pathname !== path) history.pushState({}, '', path);
  renderCurrent();
}

function showToast(message, type = '') {
  const target = document.querySelector('#toast-root');
  target.innerHTML = '<div class="toast ' + type + '">' + String(message).replace(/[<>]/g, '') + '</div>';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { target.innerHTML = ''; }, 3600);
}

function openImportDialog() {
  state.importData = null;
  const form = document.querySelector('#import-form');
  form.reset();
  setFileStatus('');
  document.querySelector('#import-dialog').showModal();
  setTimeout(() => document.querySelector('#file-input').focus(), 50);
}

function closeImportDialog() {
  if (state.importing) return;
  document.querySelector('#import-dialog').close();
}

function setFileStatus(message, type = '') {
  const status = document.querySelector('#file-status');
  status.className = 'file-status ' + type;
  status.textContent = message;
}

async function processFile(file) {
  if (!file) return;
  state.importData = null;
  setFileStatus('正在解析 ' + file.name + '…');
  try {
    const extension = fileExtension(file.name);
    const result = extension === 'pdf' || file.type === 'application/pdf' ? await extractPdfFile(file) : await extractTextFile(file);
    state.importData = result;
    document.querySelector('#import-title').value = result.title;
    document.querySelector('#import-content').value = result.rawContent;
    setFileStatus(file.name + ' · ' + result.rawContent.length.toLocaleString('zh-CN') + ' 字符 · ' + result.paragraphs.length + ' 个段落', 'ready');
  } catch (error) {
    setFileStatus(error.message || '文件解析失败，请重试。', 'error');
  }
}

async function saveImport(event) {
  event.preventDefault();
  if (state.importing) return;
  const content = document.querySelector('#import-content').value.trim();
  if (!content) { setFileStatus('请先选择文件或粘贴正文。', 'error'); return; }
  state.importing = true;
  const submit = document.querySelector('#import-submit');
  submit.disabled = true;
  submit.innerHTML = '<span class="button-spinner"></span> 正在保存';
  try {
    const base = state.importData || { sourceType: 'text', metadata: { inputMethod: 'paste' } };
    const item = createDocument({
      ...base,
      rawContent: content,
      title: document.querySelector('#import-title').value || base.title || '未命名资料',
      readingMode: document.querySelector('#import-mode').value,
      tags: document.querySelector('#import-tags').value
    });
    await saveDocument(item, db);
    await addActivity({ id: makeId('activity'), type: 'document_imported', documentId: item.id, createdAt: new Date().toISOString() }, db);
    state.documents = await listDocuments(db);
    document.querySelector('#import-dialog').close();
    showToast('“' + item.title + '”已保存到资料库');
    navigate('/app/library');
  } catch (error) {
    setFileStatus(error.message || '导入失败。', 'error');
  } finally {
    state.importing = false;
    submit.disabled = false;
    submit.textContent = '保存到资料库';
  }
}

function downloadLegacyBackup() {
  const data = localStorage.getItem(LEGACY_BACKUP_KEY);
  if (!data) { showToast('没有找到旧数据备份。', 'error'); return; }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  link.download = 'digest-v01-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

async function toggleFavorite(id) {
  const item = state.documents.find((document) => document.id === id);
  if (!item) return;
  const updated = { ...item, favorite: !item.favorite, updatedAt: new Date().toISOString() };
  await saveDocument(updated, db);
  state.documents = await listDocuments(db);
  renderCurrent();
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const route = event.target.closest('[data-route]');
    if (route) { event.preventDefault(); navigate(route.getAttribute('href')); return; }
    const routeButton = event.target.closest('[data-route-button]');
    if (routeButton) { navigate(routeButton.dataset.routeButton); return; }
    if (event.target.closest('[data-open-import]')) { openImportDialog(); return; }
    if (event.target.closest('[data-close-import]')) { closeImportDialog(); return; }
    const open = event.target.closest('[data-open-document]');
    if (open) { navigate('/app/reader/' + encodeURIComponent(open.dataset.openDocument)); return; }
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) { toggleFavorite(favorite.dataset.favorite); return; }
    const tag = event.target.closest('[data-tag]');
    if (tag) { state.filters.tag = tag.dataset.tag; renderCurrent(); return; }
    if (event.target.closest('[data-favorites]')) { state.filters.favorite = !state.filters.favorite; renderCurrent(); return; }
    if (event.target.closest('[data-download-backup]')) downloadLegacyBackup();
  });
  document.addEventListener('keydown', (event) => {
    const open = event.target.closest?.('[data-open-document]');
    if (open && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); navigate('/app/reader/' + encodeURIComponent(open.dataset.openDocument)); }
  });
  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-library-search]')) { state.filters.query = event.target.value; renderCurrent(); document.querySelector('[data-library-search]')?.focus(); }
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-source-filter]')) { state.filters.sourceType = event.target.value; renderCurrent(); }
    if (event.target.matches('[data-mode-filter]')) { state.filters.readingMode = event.target.value; renderCurrent(); }
    if (event.target.matches('#file-input')) processFile(event.target.files[0]);
  });
  document.querySelector('#import-form').addEventListener('submit', saveImport);
  const dropZone = document.querySelector('#drop-zone');
  ['dragenter', 'dragover'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
  dropZone.addEventListener('drop', (event) => processFile(event.dataTransfer.files[0]));
  window.addEventListener('popstate', renderCurrent);
}

async function init() {
  try {
    root.innerHTML = shellHTML(normalizedPath());
    bindEvents();
    db = await openDatabase();
    state.migration = await runLegacyMigration({ db });
    state.documents = await listDocuments(db);
    await renderCurrent();
    if (state.migration.status === 'failed') showToast('旧数据迁移未完成，下次启动会自动重试。旧数据仍保留。', 'error');
  } catch (error) {
    root.innerHTML = '<div class="boot-screen"><span class="brand-mark">D</span><p>无法打开本地资料库：' + String(error.message).replace(/[<>]/g, '') + '</p></div>';
  }
}

init();
