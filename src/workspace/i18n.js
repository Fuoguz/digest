import { en } from "./messages-en.js";
const hooks = new Set();
export function getLocale() {
  try {
    const saved = localStorage.getItem("digest:locale");
    return ["zh-CN", "en"].includes(saved)
      ? saved
      : navigator.language?.startsWith("zh")
        ? "zh-CN"
        : "en";
  } catch {
    return "zh-CN";
  }
}
export function t(text) {
  if (typeof text !== "string") return text;
  const aliases = {
    General: "通用研读",
    "Academic Paper": "学术论文",
    "Legal Case": "法律案例",
    "Policy Document": "政策文件",
    "READ CLOSELY": "细读原文",
    "FROM SOURCE TO UNDERSTANDING": "从原文出发，理解判断",
    "ACTIVE RECALL": "主动回忆",
    "YOUR LIBRARY": "我的资料库",
    "LEARNING TOOLS": "学习工具",
    "STUDY SETTINGS": "学习设置",
    SEARCH: "搜索",
    REVIEW: "复习",
    "KNOWLEDGE GRAPH": "知识图谱",
    "COURSE LEARNING WORKSPACE": "课程学习训练工作台",
    Search: "搜索",
    Settings: "设置",
    "Active recall": "主动回忆",
    "Knowledge network": "知识网络",
    "SOURCE / 原始资料": "原始资料",
    "READING / AI 研读": "AI 研读",
    "KNOWLEDGE / 知识点": "知识点",
    "INSPECT / 核查": "核查",
    "RELATION / 用户确认": "用户确认",
    "Again · 重来": "重来",
    "Hard · 困难": "困难",
    "Good · 记得": "记得",
    "Easy · 轻松": "轻松",
  };
  if (getLocale() !== "en") return aliases[text] || text;
  if (Object.hasOwn(en, text)) return en[text];
  if (Object.hasOwn(en, text.trim()))
    return text.replace(text.trim(), en[text.trim()]);
  return text;
}
// Only called on static HTML source literals. Never translate document or model content.
export function th(html) {
  return html
    .split(/(<[^>]*>)/g)
    .map((part) => (part.startsWith("<") ? part : t(part)))
    .join("")
    .replace(
      /(placeholder|aria-label|title)="([^"]*)"/g,
      (_, a, s) => a + '="' + t(s) + '"',
    );
}
export function beforeLanguageChange(fn) {
  hooks.add(fn);
  return () => hooks.delete(fn);
}
export function installLanguageControl(target) {
  if (!target) return;
  document.documentElement.lang = getLocale();
  const label = document.createElement("label");
  label.className = "language-control";
  const select = document.createElement("select");
  select.setAttribute("aria-label", t("界面语言"));
  for (const [value, text] of [
    ["zh-CN", "中文"],
    ["en", "English"],
  ]) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    select.append(o);
  }
  select.value = getLocale();
  label.append(select);
  target.prepend(label);
  select.addEventListener("change", async () => {
    select.disabled = true;
    try {
      await Promise.all([...hooks].map((fn) => fn()));
      // Preserve unsaved form fields in this tab during a language-only reload.
      const fields = [
        ...document.querySelectorAll(
          "input:not([type=file]):not([type=password]),textarea,select:not(.language-control select)",
        ),
      ];
      sessionStorage.setItem(
        "digest:language-draft",
        JSON.stringify({
          url: location.href,
          fields: fields.map((e) => ({ value: e.value, checked: e.checked })),
          details: [...document.querySelectorAll("details")].map((d) => d.open),
          scroll: scrollY,
        }),
      );
      localStorage.setItem("digest:locale", select.value);
      location.reload();
    } catch {
      select.disabled = false;
      select.value = getLocale();
    }
  });
}
export function restoreLanguageDraft() {
  const raw = sessionStorage.getItem("digest:language-draft");
  if (!raw) return;
  sessionStorage.removeItem("digest:language-draft");
  try {
    const draft = JSON.parse(raw);
    if (draft.url !== location.href) return;
    const fields = [
      ...document.querySelectorAll(
        "input:not([type=file]):not([type=password]),textarea,select:not(.language-control select)",
      ),
    ];
    fields.forEach((e, i) => {
      const v = draft.fields[i];
      if (v) {
        e.value = v.value;
        e.checked = v.checked;
      }
    });
    document.querySelectorAll("details").forEach((d, i) => {
      if (draft.details?.[i] !== undefined) d.open = draft.details[i];
    });
    window.scrollTo(0, draft.scroll);
  } catch {}
}
