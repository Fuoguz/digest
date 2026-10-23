import { t as tr, th } from "./i18n.js";
import { el, button } from "../reader/dom.js";
import { icon } from "./icons.js";
export { el, button, icon };
export function link(text, href, className = "quiet-link", iconName) {
  const a = el("a", className, text);
  a.href = href;
  a.dataset.route = "";
  if (iconName) a.prepend(icon(iconName));
  return a;
}
export function backLink(text, href) {
  return link(text.replace(/^←\s*/, ""), href, "back-link", "arrowLeft");
}
export function sourceLink(item, text = tr("核对来源原文")) {
  const params = new URLSearchParams();
  if (item.readingResultId) params.set("result", item.readingResultId);
  if (item.evidenceIds?.[0]) params.set("evidence", item.evidenceIds[0]);
  if (item.claimId) params.set("claim", item.claimId);
  params.set("return", location.pathname + location.search);
  return link(
    text,
    "/app/reader/" + encodeURIComponent(item.documentId) + "?" + params,
  );
}
export function page(title, kicker, description) {
  const p = el("section", "page core-page");
  const head = el("header", "page-header");
  head.append(
    el("p", "page-kicker", kicker),
    el("h1", "", title),
    el("p", "page-subtitle", description),
  );
  p.append(head);
  return p;
}
export function message(target, text, error = false, busy = false) {
  target.textContent = tr(text);
  target.className =
    "inline-feedback" + (error ? " is-error" : busy ? " is-busy" : "");
  target.setAttribute("role", error ? "alert" : "status");
}
export function badge(text, tone = "", iconName) {
  const b = el("span", "badge" + (tone ? " is-" + tone : ""), text);
  if (iconName) b.prepend(icon(iconName));
  return b;
}
const voiceIcons = { you: "user", source: "quote", ai: "ai" };
export function voiceLabel(kind, text) {
  const label = el("p", "voice-label is-" + kind, text);
  label.prepend(icon(voiceIcons[kind]));
  return label;
}
export function sectionHead(title, ...actions) {
  const head = el("div", "section-head");
  head.append(el("h2", "", title));
  if (actions.length) {
    const box = el("div", "section-actions");
    box.append(...actions.filter(Boolean));
    head.append(box);
  }
  return head;
}
export function empty(
  target,
  title,
  description,
  href = "/app/library",
  action = tr("打开资料库"),
) {
  const box = el("div", "core-empty");
  const glyph = el("span", "empty-glyph");
  glyph.setAttribute("aria-hidden", "true");
  box.append(glyph, el("h2", "", title), el("p", "", description), link(action, href));
  target.append(box);
}
function modal(dialog) {
  const opener = document.activeElement;
  const close = () => {
    dialog.close();
    dialog.remove();
    if (opener?.isConnected) opener.focus();
  };
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
  return close;
}
export function confirmAction(title, description, action) {
  const dialog = el("dialog", "core-dialog");
  const feedback = el("p");
  const actions = el("div", "dialog-actions");
  let close = () => {};
  const confirm = button(
    tr("确认"),
    async () => {
      confirm.disabled = true;
      try {
        await action();
        close();
      } catch (e) {
        message(feedback, e.message, true);
        confirm.disabled = false;
      }
    },
    "primary-action",
  );
  actions.append(button(tr("取消"), () => close(), "secondary-action"), confirm);
  dialog.append(
    el("h2", "", title),
    el("p", "", description),
    feedback,
    actions,
  );
  close = modal(dialog);
}
export function editName(title, value, save) {
  const dialog = el("dialog", "core-dialog"),
    input = el("input", "core-input"),
    label = el("label", "", title),
    feedback = el("p"),
    actions = el("div", "dialog-actions");
  input.value = value;
  input.maxLength = 100;
  label.append(input);
  let close = () => {};
  const action = button(
    tr("保存"),
    async () => {
      action.disabled = true;
      try {
        await save(input.value);
        close();
      } catch (e) {
        message(feedback, e.message, true);
        action.disabled = false;
      }
    },
    "primary-action",
  );
  actions.append(button(tr("取消"), () => close(), "secondary-action"), action);
  dialog.append(label, feedback, actions);
  close = modal(dialog);
  input.focus();
}
