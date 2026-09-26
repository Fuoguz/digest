import { t as tr, th } from "../workspace/i18n.js";
import { LearningRepository } from "../data/learning-repository.js";
import { normalizeQuestion } from "../domain/learning.js";
import {
  el,
  button,
  message,
  editName,
  link,
} from "../workspace/components.js";
export async function appendLearningTools(target, db, snapshot, saved) {
  const repo = new LearningRepository(db);
  const box = el("section", "reading-section learning-tools");
  target.append(box);
  const feedback = el("p");
  box.append(el("h2", "", tr("留给未来的自己")), feedback);
  if (saved.stale) {
    box.append(
      el(
        "p",
        "reader-muted",
        tr("此研读版本的原文已变化，不能加入复习或沉淀知识点。"),
      ),
    );
    return;
  }
  try {
    const [cards, units] = await Promise.all([
      repo.list("reviewCards"),
      repo.list("knowledgeUnits"),
    ]);
    if (!box.isConnected) return;
    box.append(el("h3", "", tr("值得回忆的问题")));
    if (!saved.result.reviewQuestions.length)
      box.append(el("p", "reader-muted", tr("本次研读没有建议问题。")));
    for (const question of saved.result.reviewQuestions) {
      const row = el("div", "learning-suggestion");
      row.append(el("p", "", question.question));
      const exists = cards.some(
        (c) =>
          c.documentId === snapshot.documentId &&
          c.questionKey === normalizeQuestion(question.question),
      );
      const add = button(
        exists ? tr("已在复习中") : tr("加入复习"),
        async () => {
          add.disabled = true;
          try {
            await repo.addReview(snapshot, saved.result, question);
            add.textContent = tr("已在复习中");
            message(feedback, tr("题目已保存，可开始今日复习"));
          } catch (e) {
            message(feedback, e.message, true);
            add.disabled = false;
          }
        },
        "secondary-action",
      );
      add.disabled = exists;
      row.append(add);
      box.append(row);
    }
    box.append(
      link(tr("前往复习 →"), "/app/review"),
      el("h3", "", tr("值得沉淀的知识")),
    );
    const claims = Object.values(saved.result.sections)
      .flatMap((s) => s.items)
      .sort(
        (a, b) =>
          (b.kind === "reusable_insight") - (a.kind === "reusable_insight"),
      )
      .slice(0, 8);
    for (const claim of claims) {
      const row = el("div", "learning-suggestion");
      const label = claim.knowledgeLabel || claim.text.slice(0, 36);
      row.append(el("p", "", label));
      const exists = units.some(
        (u) => u.readingResultId === saved.result.id && u.claimId === claim.id,
      );
      const add = button(
        exists ? tr("已沉淀") : tr("沉淀为知识点"),
        () =>
          editName(tr("知识点名称"), label, async (name) => {
            await repo.confirmUnit(snapshot, saved.result, claim, name);
            add.disabled = true;
            add.textContent = tr("已沉淀");
            message(feedback, tr("知识点已保存，来源和判断一同保留"));
          }),
        "secondary-action",
      );
      add.disabled = exists;
      row.append(add);
      box.append(row);
    }
    box.append(link(tr("查看知识网络 →"), "/app/graph"));
  } catch (e) {
    message(feedback, tr("无法读取学习记录：") + e.message, true);
  }
}
