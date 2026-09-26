import { t as tr, th } from "./i18n.js";
import { accessDialog, useProxy } from "../ai/proxy-transport.js";
import { getAllRecords } from "../data/db.js";
import { openAIConfiguration } from "../reader/config-dialog.js";
import { exportBackup, restoreBackup } from "../data/backup.js";
import {
  el,
  button,
  page,
  empty,
  link,
  message,
  confirmAction,
} from "./components.js";
export async function mountSearch(container, db, isCurrent) {
  const [docs, units, cards] = await Promise.all(
    ["documents", "knowledgeUnits", "reviewCards"].map((s) =>
      getAllRecords(s, db),
    ),
  );
  if (!isCurrent()) return () => {};
  const root = page(
      tr("重新找到，一个想法"),
      tr("Search"),
      tr("搜索资料正文、知识点解释和复习问题。"),
    ),
    input = el("input", "core-input search-main"),
    results = el("div");
  input.type = "search";
  input.placeholder = tr("标题、概念、问题或原文片段");
  input.setAttribute("aria-label", tr("全库搜索"));
  root.append(input, results);
  container.replaceChildren(root);
  function search() {
    results.replaceChildren();
    const q = input.value.trim().toLowerCase();
    let count = 0;
    for (const [name, items] of [
      [tr("资料"), docs],
      [tr("知识点"), units],
      [tr("复习题"), cards],
    ])
      for (const item of items) {
        const title = item.title || item.label || item.question;
        const text = item.rawContent || item.summary || item.answer || "";
        if (
          q &&
          ![title, text, ...(item.tags || [])]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
          continue;
        const row = el("article", "learning-row");
        row.append(
          el("small", "reader-muted", name),
          link(
            title,
            name === tr("资料")
              ? "/app/reader/" + encodeURIComponent(item.id)
              : name === tr("知识点")
                ? "/app/graph?unit=" + encodeURIComponent(item.id)
                : "/app/review?manage=1&card=" + encodeURIComponent(item.id),
          ),
          el(
            "p",
            "",
            name === tr("复习题")
              ? tr("打开管理查看状态")
              : text.slice(
                  Math.max(0, text.toLowerCase().indexOf(q) - 30),
                  Math.max(0, text.toLowerCase().indexOf(q) - 30) + 150,
                ),
          ),
        );
        results.append(row);
        count++;
      }
    if (!count)
      empty(
        results,
        q ? tr("没有找到相关内容") : tr("资料库还很安静"),
        q
          ? tr("换一个关键词，或回到资料库检查标签。")
          : tr("先导入一份要研读的资料。"),
      );
  }
  input.addEventListener("input", search);
  input.addEventListener("compositionend", search);
  search();
  return () => {};
}
export async function mountSettings(container, db, isCurrent) {
  const docs = await getAllRecords("documents", db);
  if (!isCurrent()) return () => {};
  const root = page(
      tr("你的学习空间"),
      tr("Settings"),
      tr("数据保存在当前浏览器。定期备份，避免清理浏览器时丢失。"),
    ),
    feedback = el("p");
  container.replaceChildren(root);
  const data = el("section", "settings-section");
  data.append(
    el("h2", "", tr("本地数据")),
    el("p", "", docs.length + tr(" 份资料 · IndexedDB")),
    button(
      tr("导出完整 JSON 备份"),
      async () => {
        try {
          const blob = new Blob(
            [JSON.stringify(await exportBackup(db), null, 2)],
            { type: "application/json" },
          );
          const a = el("a");
          a.href = URL.createObjectURL(blob);
          a.download =
            "digest-v02-" + new Date().toISOString().slice(0, 10) + ".json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          message(feedback, tr("备份已生成，不包含 API Key。"));
        } catch (e) {
          message(feedback, tr("备份失败：") + e.message, true);
        }
      },
      "secondary-action",
    ),
    el(
      "p",
      "reader-muted",
      tr(
        "备份包含正文、研读、依据、复习历史、知识点、关系、课程、任务、首次答案、反馈和已保存修订。未提交的修订草稿不在备份中。请保存到可信位置。",
      ),
    ),
  );
  const restore = el("input");
  restore.type = "file";
  restore.accept = ".json,application/json";
  restore.setAttribute("aria-label", tr("选择 Digest JSON 备份"));
  const restoreLabel = el(
    "label",
    "field",
    tr("从 JSON 备份恢复（仅限空资料库）"),
  );
  restoreLabel.append(restore);
  data.append(restoreLabel);
  restore.addEventListener("change", async () => {
    const file = restore.files[0];
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error(tr("备份超过 50 MB"));
      const count = await restoreBackup(db, JSON.parse(await file.text()));
      message(feedback, tr("已恢复 ") + count + tr(" 份资料，请打开资料库。"));
    } catch (e) {
      message(feedback, e.message, true);
    }
  });
  const ai = el("section", "settings-section");
  ai.append(
    el("h2", "", "Developer AI Service"),
    el(
      "p",
      "",
      tr(
        "公网默认使用试用服务，无需 API Key；Developer 模式仅供开发者自行配置。仅分析或建议关系时发送所选资料。",
      ),
    ),
    button(
      tr("管理开发者服务"),
      () => openAIConfiguration(),
      "secondary-action",
    ),
    button(
      tr("移除本地 API Key"),
      () =>
        confirmAction(
          tr("移除 API Key？"),
          tr("资料与研读结果保留。下次分析时需要重新配置。"),
          async () => {
            localStorage.removeItem("digest_api_key");
            message(feedback, tr("本地 API Key 已移除。"));
          },
        ),
      "quiet-link",
    ),
  );
  const mode = el("select", "core-input");
  mode.setAttribute("aria-label", tr("AI 连接模式"));
  for (const [value, text] of [
    ["proxy", tr("Pilot 同源服务（默认）")],
    ["developer", tr("Developer 自行配置")],
  ]) {
    const option = el("option", "", text);
    option.value = value;
    mode.append(option);
  }
  mode.value = localStorage.getItem("digest:ai-mode") || "proxy";
  mode.addEventListener("change", () => {
    localStorage.setItem("digest:ai-mode", mode.value);
    message(
      feedback,
      tr("连接模式已保存，本地开发地址始终使用 Developer 服务。"),
    );
  });
  ai.prepend(mode);
  const pilot = el("section", "settings-section");
  pilot.append(
    el("h2", "", tr("试用 AI 服务")),
    el(
      "p",
      "",
      tr("阅读与保存不需要 AI。使用研读或反馈前，可在这里验证试用码。"),
    ),
    button(
      tr("验证试用码"),
      () =>
        accessDialog()
          .then(() =>
            message(feedback, tr("试用码已验证，可以使用 AI 研读与反馈。")),
          )
          .catch((e) => {
            if (e.name !== "AbortError") message(feedback, e.message, true);
          }),
      "primary-action",
    ),
  );
  const advanced = el("details", "training-fold");
  advanced.append(el("summary", "", tr("开发者选项")), ai);
  root.append(
    feedback,
    ...(useProxy() ? [pilot] : []),
    data,
    advanced,
    el(
      "p",
      "reader-muted",
      tr("Digest 0.2.1 Pilot candidate · 不提供云同步、账号或 OCR。"),
    ),
    link(tr("了解 Digest"), "/"),
  );
  return () => {};
}
