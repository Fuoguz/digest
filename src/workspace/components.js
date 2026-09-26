import { t as tr, th } from "./i18n.js";
import { el, button } from "../reader/dom.js";
export { el, button };
export function link(text, href, className = "quiet-link") {
  const a = el("a", className, text);
  a.href = href;
  a.dataset.route = "";
  return a;
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
  p.append(
    el("p", "page-kicker", kicker),
    el("h1", "", title),
    el("p", "page-subtitle", description),
  );
  return p;
}
export function message(target, text, error = false) {
  target.textContent = tr(text);
  target.className = "inline-feedback" + (error ? " is-error" : "");
  target.setAttribute("role", error ? "alert" : "status");
}
export function empty(
  target,
  title,
  description,
  href = "/app/library",
  action = tr("打开资料库"),
) {
  const box = el("div", "core-empty");
  box.append(el("h2", "", title), el("p", "", description), link(action, href));
  target.append(box);
}
export function confirmAction(title, description, action) {
  const dialog = el("dialog", "core-dialog");
  const feedback = el("p");
  const actions = el("div", "dialog-actions");
  const close = () => {
    dialog.close();
    dialog.remove();
  };
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
  actions.append(button(tr("取消"), close, "secondary-action"), confirm);
  dialog.append(
    el("h2", "", title),
    el("p", "", description),
    feedback,
    actions,
  );
  dialog.addEventListener("cancel", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
export function editName(title, value, save) {
  const dialog = el("dialog", "core-dialog"),
    input = el("input", "core-input"),
    label = el("label", "", title),
    feedback = el("p");
  input.value = value;
  input.maxLength = 100;
  label.append(input);
  const close = () => {
    dialog.close();
    dialog.remove();
  };
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
  dialog.append(
    label,
    feedback,
    button(tr("取消"), close, "secondary-action"),
    action,
  );
  document.body.append(dialog);
  dialog.addEventListener("cancel", () => dialog.remove());
  dialog.showModal();
  input.focus();
}
