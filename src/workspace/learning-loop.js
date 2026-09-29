import { el, button, link, page, message } from "./components.js";
import { getLocale, beforeLanguageChange } from "./i18n.js";
import { LoopRepository } from "../data/loop-repository.js";
import { documentSnapshot, restoreAnchor } from "../domain/evidence.js";
import { prepareFeedbackContext } from "../domain/training.js";
import { needsRecheck, revisionDiff } from "../domain/gaps.js";
import { generateChallenge, generateRetest } from "../ai/learning-loop.js";
import { rescueRetrieval } from "../ai/retrieval-rescue.js";
import { createTransport } from "../ai/proxy-transport.js";
import { makeId } from "../domain/documents.js";
export const l = (zh, en) => (getLocale() === "en" ? en : zh);
export const gapLabel = (status) =>
  ({
    observed: l("已观察到 · 待检验", "Observed · Needs recheck"),
    retesting: l("新题待作答", "Challenge ready"),
    resolved_once: l(
      "本次已解决 · 不代表长期掌握",
      "Resolved once · Not mastery",
    ),
    still_present: l("同一问题仍出现", "Still present"),
    inconclusive: l("尚无法判断 · 待再检验", "Inconclusive · Needs recheck"),
  })[status] || status;
const taskUrl = (id, attempt) =>
  "/app/tasks/" +
  encodeURIComponent(id) +
  (attempt ? "?attempt=" + encodeURIComponent(attempt) : "");
function restoreLoopScroll() {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem("digest:feedback-scroll") || "null",
    );
    if (saved?.url === location.pathname + location.search) {
      sessionStorage.removeItem("digest:feedback-scroll");
      requestAnimationFrame(() => window.scrollTo(0, saved.y));
    }
  } catch {}
}
export async function evidencePreview(repo, eid, trigger) {
  const stored = await repo.get("evidenceAnchors", eid),
    doc = stored && (await repo.get("documents", stored.documentId));
  if (!doc) return;
  const snapshot = await documentSnapshot(doc),
    a = restoreAnchor(stored, snapshot),
    dialog = el("dialog", "evidence-drawer");
  dialog.setAttribute("aria-label", l("课程原文依据", "Course evidence"));
  const cleanup = () => {
    if (dialog.isConnected) close();
  };
  const close = () => {
    window.removeEventListener("popstate", cleanup);
    dialog.close();
    dialog.remove();
    if (trigger?.isConnected) trigger.focus();
  };
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dialog.append(
    button(l("关闭依据", "Close evidence"), close, "secondary-action"),
    el("h2", "", doc.title),
  );
  if (a.validationStatus !== "matched")
    dialog.append(
      el(
        "p",
        "evidence-unavailable",
        l(
          "原文版本已变化或引用不可定位。",
          "Source changed or quote cannot be located.",
        ),
      ),
    );
  else {
    dialog.append(
      el(
        "p",
        "reader-muted",
        l("来自课程材料 · 第 ", "From course material · Paragraph ") +
          (a.paragraphIndex + 1),
      ),
      el(
        "p",
        "reader-muted",
        l(
          "引用存在不代表它支持 AI 判断，请检查上下文。",
          "A located quote does not prove the AI judgment. Check its context.",
        ),
      ),
    );
    for (const p of snapshot.paragraphs.filter(
      (p) => Math.abs(p.paragraphIndex - a.paragraphIndex) <= 1,
    )) {
      const node = el("p", "training-prose");
      if (p.paragraphIndex === a.paragraphIndex)
        node.append(
          document.createTextNode(p.text.slice(0, a.paragraphStartOffset)),
          el("mark", "", a.quote),
          document.createTextNode(p.text.slice(a.paragraphEndOffset)),
        );
      else node.textContent = p.text;
      dialog.append(node);
    }
    const full = link(
      l("查看完整原文", "Open full source"),
      "/app/reader/" +
        encodeURIComponent(doc.id) +
        "?" +
        new URLSearchParams({
          evidence: eid,
          return: location.pathname + location.search,
        }),
    );
    full.addEventListener("click", () => {
      sessionStorage.setItem(
        "digest:feedback-scroll",
        JSON.stringify({
          url: location.pathname + location.search,
          y: scrollY,
        }),
      );
      close();
    });
    dialog.append(full);
  }
  document.body.append(dialog);
  dialog.showModal();
  window.addEventListener("popstate", cleanup, { once: true });
  const feedback = (await repo.list("feedback")).find((f) =>
    f.evidenceRefs.includes(eid),
  );
  if (feedback)
    await repo.track("feedback_evidence_opened", {
      attemptId: feedback.attemptId,
      evidenceId: eid,
    });
}
export function previewButton(repo, eid) {
  const b = button(
    l("预览依据", "Preview evidence"),
    () =>
      evidencePreview(repo, eid, b).catch((e) => {
        b.title = e.message;
      }),
    "secondary-action",
  );
  return b;
}
export function diffView(repo, attempt, revision) {
  const details = el("details", "training-fold revision-diff");
  details.append(el("summary", "", l("查看我改了什么", "See what I changed")));
  details.append(
    el(
      "p",
      "reader-muted",
      l(
        "划线为首次答案中移除的部分，下划线为修订新增部分；不代表 AI 已验证修改。",
        "Strikethrough shows removed original text; underlining shows additions. This does not verify the revision.",
      ),
    ),
  );
  const body = el("p", "training-prose");
  for (const part of revisionDiff(attempt.userAnswer, revision.userAnswer))
    body.append(
      el(
        part.type === "removed"
          ? "del"
          : part.type === "added"
            ? "ins"
            : "span",
        "",
        part.text,
      ),
    );
  details.append(body);
  details.addEventListener("toggle", () => {
    if (details.open)
      repo
        .track("revision_diff_viewed", {
          attemptId: attempt.id,
          revisionId: revision.id,
        })
        .catch(() => {});
  });
  return details;
}
export async function mountGapPanel(
  parent,
  repo,
  { attemptId, courseId, onlyNeeds = false, register = () => {} } = {},
) {
  const gaps = (await repo.list("learningGaps"))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter(
      (g) =>
        !g.dismissedAt &&
        (!attemptId || g.attemptId === attemptId) &&
        (!courseId || g.courseId === courseId) &&
        (!onlyNeeds || needsRecheck(g)),
    );
  if (!gaps.length) return;
  const section = el("section", "loop-panel");
  section.append(
    el(
      "h2",
      "",
      onlyNeeds
        ? l("待再次检验", "Needs recheck")
        : l("这次值得再检验的问题", "Understanding to recheck"),
    ),
  );
  for (const g of gaps.slice(0, 8)) {
    const a = await repo.get("attempts", g.attemptId),
      card = el("article", "gap-card");
    card.append(
      link(g.title, "/app/gaps/" + encodeURIComponent(g.id)),
      el("p", "gap-state", gapLabel(g.status)),
    );
    const why = el("details", "gap-provenance");
    why.append(
      el("summary", "", l("为什么记录这个问题", "Why this was observed")),
      el("p", "", g.description),
    );
    if (g.userAnswerExcerpt)
      why.append(el("blockquote", "answer-quote", g.userAnswerExcerpt));
    card.append(why);
    card.append(
      el(
        "small",
        "reader-muted",
        l(
          "这是 AI 基于本次作答的观察，你可以核查或忽略。",
          "An AI observation from this answer. You can check or dismiss it.",
        ),
      ),
    );
    const status = el("p");
    card.append(status);
    if (a?.revision.length) {
      let ctrl;
      register(() => ctrl?.abort());
      const next = button(
        l("立即换题检验", "Try a different challenge"),
        async () => {
          if (ctrl) return;
          ctrl = new AbortController();
          const signal = ctrl.signal,
            rid = makeId("challenge");
          next.disabled = true;
          const cancel = button(
            l("取消准备", "Cancel preparation"),
            () => ctrl?.abort(),
            "secondary-action",
          );
          card.append(cancel);
          try {
            const tasks = await repo.list("tasks"),
              attempts = await repo.list("attempts");
            const existing = tasks.find(
              (t) =>
                t.targetGapId === g.id &&
                !attempts.some((a) => a.taskId === t.id && a.retestId),
            );
            if (existing) {
              location.assign(taskUrl(existing.id));
              return;
            }
            await repo.beginGap(g.id, rid);
            message(
              status,
              l("正在准备新的检验任务…", "Preparing a new challenge…"),
            );
            const course = await repo.get("courses", g.courseId),
              feedback = await repo.get("feedback", g.feedbackId);
            let context = await prepareFeedbackContext(
              a.taskSnapshot,
              course,
              await repo.list("documents"),
              a.userAnswer,
            );
            context.outputLanguage = feedback.outputLanguage || getLocale();
            const transport = createTransport("digest");
            context = await rescueRetrieval(context, transport, signal);
            const candidate = await generateChallenge(
              context,
              g,
              a,
              feedback,
              transport,
              signal,
            );
            signal.throwIfAborted();
            const task = await repo.commitChallenge(
              g.id,
              rid,
              context,
              candidate,
              signal,
            );
            location.assign(taskUrl(task.id));
          } catch (e) {
            message(
              status,
              e.name === "AbortError"
                ? l(
                    "已取消，学习记录保留。",
                    "Cancelled. Learning history is safe.",
                  )
                : e.message,
              e.name !== "AbortError",
            );
          } finally {
            await repo.cancelGap(g.id, rid).catch(() => {});
            ctrl = null;
            next.disabled = false;
            cancel.remove();
          }
        },
        "primary-action",
      );
      card.append(
        next,
        button(
          l("稍后再测", "Recheck later"),
          async () => {
            await repo.deferGap(g.id);
            message(
              status,
              l(
                "已放入首页和课程的待再次检验。",
                "Saved to Needs recheck in your course and home.",
              ),
            );
          },
          "secondary-action",
        ),
      );
    } else if (!a?.revision.length)
      card.append(
        link(l("先完成修订", "Revise first"), taskUrl(g.taskId, g.attemptId)),
      );
    card.append(
      button(
        l("忽略这个问题", "Dismiss this observation"),
        async () => {
          await repo.dismissGap(g.id);
          card.remove();
        },
        "quiet-link",
      ),
    );
    section.append(card);
  }
  parent.append(section);
  return section;
}
export async function mountGapHistory(container, db, isCurrent = () => true) {
  const repo = new LoopRepository(db),
    id = decodeURIComponent(location.pathname.split("/").at(-1)),
    g = await repo.get("learningGaps", id),
    cleanups = [];
  if (!isCurrent()) return () => {};
  const root = page(
    l("学习轨迹", "Learning history"),
    l("从一次回答到再次检验", "From an answer to a recheck"),
    "",
  );
  container.replaceChildren(root);
  if (!g) {
    root.append(
      el("p", "", l("未找到学习记录。", "Learning history not found.")),
    );
    return () => {};
  }
  root.querySelector("h1").textContent = g.title;
  root.querySelector(".page-subtitle").textContent = g.dismissedAt
    ? l("已忽略 · 历史保留", "Dismissed · History retained")
    : gapLabel(g.status);
  const a = await repo.get("attempts", g.attemptId),
    f = await repo.get("feedback", g.feedbackId);
  root.append(
    link(l("返回课程", "Back to course"), "/app/courses/" + g.courseId),
    el("h2", "", l("第一次回答", "First answer")),
    el("p", "training-prose", a.userAnswer),
    link(
      l("打开原任务与反馈", "Open original task and feedback"),
      taskUrl(g.taskId, a.id),
    ),
    el("h2", "", l("为什么记录这个问题", "Why this was observed")),
    el("p", "", g.description),
  );
  if (g.userAnswerExcerpt)
    root.append(el("blockquote", "answer-quote", g.userAnswerExcerpt));
  for (const eid of g.evidenceRefs) root.append(previewButton(repo, eid));
  if (!g.evidenceRefs.length)
    root.append(
      el(
        "p",
        "evidence-unavailable",
        l(
          "当前材料不足以支持这一判断。",
          "Current materials do not sufficiently support this judgment.",
        ),
      ),
    );
  const activity = await repo.list("activities");
  root.append(
    el(
      "p",
      "reader-muted",
      l("已打开过的依据：", "Evidence opened: ") +
        new Set(
          activity
            .filter(
              (e) =>
                e.attemptId === a.id && e.type === "feedback_evidence_opened",
            )
            .map((e) => e.evidenceId),
        ).size,
    ),
  );
  for (const r of a.revision) {
    root.append(
      el("h2", "", l("我的修订", "My revision")),
      el("p", "training-prose", r.userAnswer),
      el("p", "", r.reflection),
      diffView(repo, a, r),
    );
  }
  for (const t of (await repo.list("tasks")).filter(
    (t) => t.targetGapId === g.id,
  )) {
    root.append(
      el("h2", "", l("换情境检验", "Transfer challenge")),
      link(t.title, taskUrl(t.id)),
      el("p", "training-prose", t.prompt),
    );
    for (const r of (await repo.list("retests")).filter(
      (r) => r.taskId === t.id,
    )) {
      const second = await repo.get("attempts", r.attemptId);
      root.append(
        el("h3", "", gapLabel(r.outcome)),
        el("p", "training-prose", second.userAnswer),
        el("p", "", r.reason),
      );
      for (const eid of r.evidenceRefs) root.append(previewButton(repo, eid));
    }
  }
  await mountGapPanel(root, repo, {
    attemptId: a.id,
    register: (f) => cleanups.push(f),
  });
  restoreLoopScroll();
  return () => cleanups.forEach((f) => f());
}
export async function mountChallenge(
  root,
  db,
  task,
  course,
  isCurrent = () => true,
) {
  const repo = new LoopRepository(db),
    g = await repo.get("learningGaps", task.targetGapId);
  let ctrl,
    queue = Promise.resolve(),
    disposed = false;
  const childCleanups = [];
  const unbind = beforeLanguageChange(() => queue);
  const attempts = (await repo.list("attempts"))
    .filter((a) => a.taskId === task.id)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const selected = new URLSearchParams(location.search).get("attempt");
  let attempt =
    selected === "new"
      ? null
      : attempts.find((a) => a.id === selected) || attempts[0];
  root.replaceChildren(
    el(
      "p",
      "page-kicker",
      l("换一个情境，检验同一种能力", "A new context, the same capability"),
    ),
    el("h1", "", task.title),
    el(
      "p",
      "reader-muted",
      l(
        "以下为练习用假设情境。先独立判断，提交后再看针对性反馈。",
        "This is a hypothetical practice scenario. Answer independently before seeing targeted feedback.",
      ),
    ),
    el("p", "training-prose challenge-prompt", task.prompt),
  );
  root.append(
    link(l("返回课程", "Back to course"), "/app/courses/" + course.id),
  );
  if (!g || g.dismissedAt) {
    root.append(
      el(
        "p",
        "",
        l(
          "这个观察已被忽略，历史答案仍保留。",
          "This observation was dismissed. Historical answers are retained.",
        ),
      ),
    );
    return unbind;
  }
  repo
    .track("challenge_started", { gapId: g.id, taskId: task.id })
    .catch(() => {});
  const languageLabel = el(
      "label",
      "output-language",
      l("反馈语言", "Feedback language"),
    ),
    language = el("select", "core-input");
  for (const [v, title] of [
    ["zh-CN", "简体中文"],
    ["en", "English"],
  ]) {
    const o = el("option", "", title);
    o.value = v;
    language.append(o);
  }
  language.value = getLocale();
  languageLabel.append(language);
  root.append(languageLabel);
  const area = el("section"),
    status = el("p");
  root.append(status, area);
  async function render() {
    area.replaceChildren();
    if (attempt) {
      area.append(
        el("h2", "", l("这次的独立回答", "Your new answer")),
        el("p", "training-prose", attempt.userAnswer),
      );
      if (attempt.retestId) {
        const r = await repo.get("retests", attempt.retestId);
        area.append(
          el("h2", "retest-outcome", gapLabel(r.outcome)),
          el(
            "p",
            "",
            l("AI 对本次回答的判断：", "AI judgment of this answer: ") +
              r.reason,
          ),
        );
        if (r.verificationLimited)
          area.append(
            el(
              "p",
              "evidence-unavailable",
              l(
                "依据或作答信息不足，系统未采纳明确结论。",
                "Evidence or answer information is insufficient; a definitive outcome was not accepted.",
              ),
            ),
          );
        for (const eid of r.evidenceRefs) area.append(previewButton(repo, eid));
        area.append(
          el("p", "", r.nextStep),
          link(
            l("回看完整学习轨迹", "View the learning history"),
            "/app/gaps/" + g.id,
          ),
        );
        await mountGapPanel(area, repo, {
          attemptId: g.attemptId,
          onlyNeeds: true,
          register: (fn) => childCleanups.push(fn),
        });
        return;
      }
      area.append(
        button(
          l("获取再测结果 / 重试", "Evaluate recheck / Retry"),
          run,
          "primary-action",
        ),
      );
      return;
    }
    const form = el("form", "training-form"),
      label = el(
        "label",
        "training-field",
        l("独立回答新问题", "Answer the new question"),
      ),
      input = el("textarea", "core-input");
    input.rows = 10;
    input.maxLength = 16000;
    input.required = true;
    input.value = task.draftAnswer || "";
    label.append(input);
    form.append(label);
    input.addEventListener("input", () => {
      const value = input.value;
      queue = queue.catch(() => {}).then(() => repo.saveDraft(task.id, value));
      queue.catch((e) => message(status, e.message, true));
    });
    const submit = el(
      "button",
      "primary-action",
      l("保存回答并检验", "Save answer & recheck"),
    );
    submit.type = "submit";
    form.append(submit);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      try {
        await queue;
        attempt = await repo.submit(task.id, input.value);
        history.replaceState({}, "", taskUrl(task.id, attempt.id));
        await render();
        await run();
      } catch (e) {
        message(status, e.message, true);
        submit.disabled = false;
      }
    });
    area.append(form);
  }
  async function run() {
    if (ctrl) return;
    ctrl = new AbortController();
    const local = ctrl,
      rid = makeId("retest");
    message(
      status,
      l(
        "正在核对新答案是否仍有同一个问题…",
        "Checking whether the same issue recurs…",
      ),
    );
    const cancel = button(
      l("取消再测", "Cancel recheck"),
      () => local.abort(),
      "secondary-action",
    );
    status.after(cancel);
    try {
      await repo.beginRetest(attempt.id, rid);
      let context = await prepareFeedbackContext(
        attempt.taskSnapshot,
        course,
        await repo.list("documents"),
        attempt.userAnswer,
      );
      context.outputLanguage = language.value;
      const transport = createTransport("digest");
      context = await rescueRetrieval(context, transport, local.signal);
      const result = await generateRetest(
        context,
        g,
        task.challenge,
        transport,
        rid,
        local.signal,
      );
      await repo.commitRetest(attempt.id, rid, context, result, local.signal);
      attempt = await repo.get("attempts", attempt.id);
      if (!disposed && isCurrent()) {
        message(
          status,
          l(
            "再测结果已保存。一次表现不代表长期掌握。",
            "Recheck saved. One performance does not establish mastery.",
          ),
        );
        await render();
      }
    } catch (e) {
      if (!disposed)
        message(
          status,
          e.name === "AbortError"
            ? l("已取消，回答已保存。", "Cancelled. Your answer is saved.")
            : e.message,
          e.name !== "AbortError",
        );
    } finally {
      await repo.cancel(attempt.id, rid).catch(() => {});
      await repo.cancelGap(g.id, rid).catch(() => {});
      cancel.remove();
      ctrl = null;
    }
  }
  await render();
  restoreLoopScroll();
  return () => {
    disposed = true;
    ctrl?.abort();
    childCleanups.forEach((f) => f());
    unbind();
  };
}
