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
      "重新找到，一个想法",
      "Search",
      "搜索资料正文、知识点解释和复习问题。",
    ),
    input = el("input", "core-input search-main"),
    results = el("div");
  input.type = "search";
  input.placeholder = "标题、概念、问题或原文片段";
  input.setAttribute("aria-label", "全库搜索");
  root.append(input, results);
  container.replaceChildren(root);
  function search() {
    results.replaceChildren();
    const q = input.value.trim().toLowerCase();
    let count = 0;
    for (const [name, items] of [
      ["资料", docs],
      ["知识点", units],
      ["复习题", cards],
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
            name === "资料"
              ? "/app/reader/" + encodeURIComponent(item.id)
              : name === "知识点"
                ? "/app/graph?unit=" + encodeURIComponent(item.id)
                : "/app/review?manage=1&card=" + encodeURIComponent(item.id),
          ),
          el(
            "p",
            "",
            name === "复习题"
              ? "打开管理查看状态"
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
        q ? "没有找到相关内容" : "资料库还很安静",
        q ? "换一个关键词，或回到资料库检查标签。" : "先导入一份要研读的资料。",
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
      "你的学习空间",
      "Settings",
      "数据保存在当前浏览器。定期备份，避免清理浏览器时丢失。",
    ),
    feedback = el("p");
  container.replaceChildren(root);
  const data = el("section", "settings-section");
  data.append(
    el("h2", "", "本地数据"),
    el("p", "", docs.length + " 份资料 · IndexedDB"),
    button(
      "导出完整 JSON 备份",
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
          message(feedback, "备份已生成，不包含 API Key。");
        } catch (e) {
          message(feedback, "备份失败：" + e.message, true);
        }
      },
      "secondary-action",
    ),
    el(
      "p",
      "reader-muted",
      "备份包含正文、研读、依据、复习历史、知识点和关系。请保存到自己可信的位置。",
    ),
  );
  const restore = el("input");
  restore.type = "file";
  restore.accept = ".json,application/json";
  restore.setAttribute("aria-label", "选择 Digest JSON 备份");
  const restoreLabel = el("label", "field", "从 JSON 备份恢复（仅限空资料库）");
  restoreLabel.append(restore);
  data.append(restoreLabel);
  restore.addEventListener("change", async () => {
    const file = restore.files[0];
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("备份超过 50 MB");
      const count = await restoreBackup(db, JSON.parse(await file.text()));
      message(feedback, "已恢复 " + count + " 份资料，请打开资料库。");
    } catch (e) {
      message(feedback, e.message, true);
    }
  });
  const ai = el("section", "settings-section");
  ai.append(
    el("h2", "", "Developer AI Service"),
    el("p", "", "当前为浏览器直连模式。仅点击分析或关系建议时发送所选资料。"),
    button("管理开发者服务", () => openAIConfiguration(), "secondary-action"),
    button(
      "移除本地 API Key",
      () =>
        confirmAction(
          "移除 API Key？",
          "资料与研读结果保留。下次分析时需要重新配置。",
          async () => {
            localStorage.removeItem("digest_api_key");
            message(feedback, "本地 API Key 已移除。");
          },
        ),
      "quiet-link",
    ),
  );
  root.append(
    feedback,
    data,
    ai,
    el("p", "reader-muted", "Digest v0.2 Core · 不提供云同步、账号或 OCR。"),
    link("了解 Digest", "/"),
  );
  return () => {};
}
