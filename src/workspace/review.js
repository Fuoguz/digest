import { getLocale } from "./i18n.js";
import { t as tr, th } from "./i18n.js";
import { LearningRepository } from "../data/learning-repository.js";
import { TrainingRepository } from "../data/training-repository.js";
import { sourceSignature } from "../domain/evidence.js";
import { RATINGS, schedule } from "../domain/learning.js";
import {
  el,
  button,
  link,
  page,
  empty,
  message,
  sourceLink,
} from "./components.js";

export async function mountReview(container, db, isCurrent) {
  const repo = new LearningRepository(db);
  const analytics = new TrainingRepository(db);
  let cards = await repo.list("reviewCards"),
    documents = await repo.list("documents");
  if (!isCurrent()) return () => {};
  analytics.track("review_started").catch(() => {});
  let manage = new URLSearchParams(location.search).get("manage") === "1",
    revealed = new URLSearchParams(location.search).get("reveal") === "1",
    busy = false,
    disposed = false;
  const root = page(
    tr("把理解，变成记忆"),
    tr("Active recall"),
    tr("先试着回忆，再核对答案。困难程度决定下次相见的时间。"),
  );
  container.replaceChildren(root);
  root.append(link(tr("用课程中的新问题再次检验理解 →"), "/app/courses"));
  const toolbar = el("div", "core-toolbar"),
    body = el("div", "review-body"),
    feedback = el("p");
  root.append(toolbar, feedback, body);
  const stale = (c) =>
    !documents.some(
      (d) => d.id === c.documentId && sourceSignature(d) === c.sourceSignature,
    );
  async function refresh() {
    cards = await repo.list("reviewCards");
    documents = await repo.list("documents");
    if (!disposed) render();
  }
  function render() {
    toolbar.replaceChildren(
      button(
        manage ? tr("返回今日复习") : tr("管理复习题"),
        () => {
          manage = !manage;
          revealed = false;
          render();
        },
        "secondary-action",
      ),
    );
    body.replaceChildren();
    const due = cards
      .filter(
        (c) =>
          c.status === "active" &&
          new Date(c.nextReviewAt) <= new Date() &&
          !stale(c),
      )
      .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
    const staleCount = cards.filter(stale).length;
    if (staleCount)
      body.append(
        el(
          "p",
          "inline-feedback",
          staleCount + tr(" 道题的来源已变化，已从本次队列排除。请在管理中核对。"),
        ),
      );
    if (manage) {
      if (!cards.length) {
        empty(
          body,
          tr("还没有复习题"),
          tr("在 Reader 的研读问题中，选择值得记住的问题。"),
        );
        return;
      }
      for (const card of cards) {
        const row = el("article", "learning-row");
        row.append(
          el("h3", "", card.question),
          el(
            "p",
            "reader-muted",
            (stale(card)
              ? tr("来源已变化 · ")
              : card.status === "paused"
                ? tr("已暂停 · ")
                : "") +
              tr("下次复习 ") +
              new Date(card.nextReviewAt).toLocaleDateString(getLocale()),
          ),
          sourceLink(card),
        );
        row.append(
          button(
            card.status === "active" ? tr("暂停复习") : tr("恢复复习"),
            async () => {
              try {
                await repo.setCardStatus(
                  card.id,
                  card.status === "active" ? "paused" : "active",
                );
                await refresh();
              } catch (e) {
                message(feedback, e.message, true);
              }
            },
            "quiet-link",
          ),
        );
        body.append(row);
      }
      return;
    }
    if (!due.length) {
      empty(
        body,
        cards.length ? tr("今天的复习已完成") : tr("从一个好问题开始"),
        cards.length
          ? tr("下次到期后，题目会自动回到这里。也可以到 Reader 添加新的问题。")
          : tr("在 Reader 中把有价值的问题加入复习。"),
      );
      return;
    }
    const card = due[0],
      focus = el("article", "recall-sheet");
    if (new URLSearchParams(location.search).get("card") !== card.id)
      revealed = false;
    focus.append(
      el("p", "page-kicker", tr("今日剩余 ") + due.length + tr(" 题")),
      el("h2", "recall-question", card.question),
    );
    if (!revealed) {
      const label = el(
          "label",
          "recall-label",
          tr("先用自己的话回答（草稿不保存）"),
        ),
        draft = el("textarea", "recall-draft");
      draft.placeholder = tr("我记得的是…");
      label.append(draft);
      focus.append(
        label,
        button(
          tr("揭示答案"),
          () => {
            revealed = true;
            history.replaceState(
              {},
              "",
              "/app/review?card=" + encodeURIComponent(card.id) + "&reveal=1",
            );
            render();
          },
          "primary-action",
        ),
      );
    } else {
      const answer = el("div", "recall-answer");
      answer.append(
        el("p", "page-kicker", tr("参考答案 · 请结合原文核对")),
        el("p", "", card.answer),
        sourceLink(card),
      );
      if (!card.evidenceIds.length)
        answer.append(
          el("small", "reader-muted", tr("此题暂无直接引用，可打开来源研读核对。")),
        );
      const ratings = el("div", "rating-actions");
      for (const [rating, label] of Object.entries(RATINGS)) {
        const days = schedule(card, rating).intervalDays;
        ratings.append(
          button(
            label + " · " + days + tr("天"),
            async () => {
              if (busy) return;
              busy = true;
              ratings
                .querySelectorAll("button")
                .forEach((b) => (b.disabled = true));
              try {
                await repo.rate(card.id, rating, card.version);
                revealed = false;
                message(feedback, tr("已保存，下次复习 ") + days + tr(" 天后"));
                await refresh();
              } catch (e) {
                message(feedback, e.message, true);
                await refresh();
              } finally {
                busy = false;
              }
            },
            "secondary-action",
          ),
        );
      }
      focus.append(
        answer,
        el("p", "reader-muted", tr("刚才回忆得如何？")),
        ratings,
      );
    }
    body.append(focus);
  }
  render();
  return () => {
    disposed = true;
  };
}
