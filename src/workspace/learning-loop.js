import {
  el,
  button,
  link,
  backLink,
  page,
  message,
  badge,
  voiceLabel,
  icon,
} from "./components.js";
import { getLocale, beforeLanguageChange } from "./i18n.js";
import { LoopRepository } from "../data/loop-repository.js";
import { documentSnapshot, restoreAnchor } from "../domain/evidence.js";
import { prepareFeedbackContext } from "../domain/training.js";
import { needsRecheck, revisionDiff } from "../domain/gaps.js";
import { generateChallenge, generateRetest } from "../ai/learning-loop.js";
import { rescueRetrieval } from "../ai/retrieval-rescue.js";
import { createTransport } from "../ai/proxy-transport.js";
import {
  startJob,
  getJob,
  runningJob,
  cancelJob,
  settleJob,
  watchJob,
} from "./jobs.js";
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
const GAP_TONES = {
  observed: ["warning", "flag"],
  retesting: ["accent", "repeat"],
  resolved_once: ["success", "check"],
  still_present: ["danger", "alert"],
  inconclusive: ["", "circle"],
};
export function gapBadge(status) {
  const [tone, glyph] = GAP_TONES[status] || ["", "circle"];
  return badge(gapLabel(status), tone, glyph);
}
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
  const head = el("header", "drawer-head"),
    titleBox = el("div"),
    body = el("div", "drawer-body");
  titleBox.append(
    voiceLabel("source", l("课程原文依据", "Course evidence")),
    el("h2", "", doc.title),
  );
  const closeButton = button(
    l("关闭依据", "Close evidence"),
    close,
    "secondary-action btn-sm",
  );
  head.append(titleBox, closeButton);
  dialog.append(head, body);
  if (a.validationStatus !== "matched")
    body.append(
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
    body.append(
      el(
        "p",
        "drawer-location",
        l("来自课程材料 · 第 ", "From course material · Paragraph ") +
          (a.paragraphIndex + 1),
      ),
      el(
        "p",
        "scope-notice",
        l(
          "引用存在不代表它支持 AI 判断，请检查上下文。",
          "A located quote does not prove the AI judgment. Check its context.",
        ),
      ),
    );
    const excerpt = el("div", "drawer-source");
    for (const p of snapshot.paragraphs.filter(
      (p) => Math.abs(p.paragraphIndex - a.paragraphIndex) <= 1,
    )) {
      const node = el("p", "training-prose");
      node.dataset.paragraph = p.paragraphIndex + 1;
      if (p.paragraphIndex === a.paragraphIndex) {
        node.classList.add("is-target");
        node.append(
          document.createTextNode(p.text.slice(0, a.paragraphStartOffset)),
          el("mark", "", a.quote),
          document.createTextNode(p.text.slice(a.paragraphEndOffset)),
        );
      } else node.textContent = p.text;
      excerpt.append(node);
    }
    body.append(excerpt);
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
    full.append(icon("external"));
    const foot = el("div", "drawer-foot");
    foot.append(full);
    body.append(foot);
  }
  document.body.append(dialog);
  dialog.showModal();
  closeButton.focus();
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
  const head = el("div", "section-head");
  head.append(
    el(
      "h2",
      "",
      onlyNeeds
        ? l("待再次检验", "Needs recheck")
        : l("这次值得再检验的问题", "Understanding to recheck"),
    ),
    badge(String(gaps.length), "warning"),
  );
  section.append(
    head,
    el(
      "p",
      "reader-muted loop-intro",
      onlyNeeds
        ? l(
            "修订之后，换一个情境独立作答，检验同一个问题是否还会出现。",
            "After revising, answer a different scenario on your own to see whether the same issue recurs.",
          )
        : l(
            "AI 从这次作答中记录的理解问题。修订后可以换题检验，也可以忽略不准确的观察。",
            "Understanding issues the AI observed in this answer. Recheck them after revising, or dismiss inaccurate ones.",
          ),
    ),
  );
  for (const g of gaps.slice(0, 8)) {
    const a = await repo.get("attempts", g.attemptId),
      card = el("article", "gap-card");
    card.dataset.status = g.status;
    const state = el("p", "gap-state");
    state.append(gapBadge(g.status));
    card.append(
      state,
      link(g.title, "/app/gaps/" + encodeURIComponent(g.id), "gap-title"),
    );
    const why = el("details", "gap-provenance");
    why.append(
      el("summary", "", l("为什么记录这个问题", "Why this was observed")),
      el("p", "", g.description),
    );
    if (g.userAnswerExcerpt)
      why.append(
        voiceLabel("you", l("你的答案", "Your answer")),
        el("blockquote", "answer-quote", g.userAnswerExcerpt),
      );
    card.append(why);
    card.append(
      el(
        "small",
        "reader-muted gap-note",
        l(
          "这是 AI 基于本次作答的观察，你可以核查或忽略。",
          "An AI observation from this answer. You can check or dismiss it.",
        ),
      ),
    );
    const status = el("p");
    const actions = el("div", "gap-actions");
    card.append(status, actions);
    if (a?.revision.length) {
      // Preparing a challenge is an app-level job; leaving the page does not cancel it.
      const key = "challenge:" + g.id;
      let cancel = null;
      const next = button(
        l("立即换题检验", "Try a different challenge"),
        () => {
          if (runningJob(key)) return;
          startJob(
            key,
            {
              kind: "challenge",
              label: l("换题检验 · ", "Challenge · ") + g.title,
              href: "/app/gaps/" + encodeURIComponent(g.id),
            },
            async (signal) => {
              const tasks = await repo.list("tasks"),
                attempts = await repo.list("attempts");
              const existing = tasks.find(
                (t) =>
                  t.targetGapId === g.id &&
                  !attempts.some((a) => a.taskId === t.id && a.retestId),
              );
              if (existing) return { href: taskUrl(existing.id) };
              const rid = makeId("challenge");
              try {
                await repo.beginGap(g.id, rid);
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
                return { href: taskUrl(task.id) };
              } finally {
                await repo.cancelGap(g.id, rid).catch(() => {});
              }
            },
          );
        },
        "primary-action",
      );
      let watchedRunning = false;
      const show = (job) => {
        if (job.status === "running") {
          watchedRunning = true;
          next.disabled = true;
          if (!cancel?.isConnected) {
            cancel = button(
              l("取消准备", "Cancel preparation"),
              () => cancelJob(key),
              "secondary-action",
            );
            actions.append(cancel);
          }
          message(
            status,
            l(
              "正在准备新的检验任务…可以先去别处，准备好后会提醒你。",
              "Preparing a new challenge… You can leave; you'll be told when it's ready.",
            ),
            false,
            true,
          );
          return;
        }
        if (job.status === "idle") return;
        settleJob(key);
        next.disabled = false;
        cancel?.remove();
        cancel = null;
        if (job.status === "done") {
          // Jump only if the user watched it finish here; otherwise offer the link.
          if (watchedRunning) location.assign(job.result.href);
          else {
            message(status, l("新的检验任务已准备好。", "The new challenge is ready."));
            status.append(link(l("开始作答", "Start answering"), job.result.href));
          }
          return;
        }
        message(
          status,
          job.status === "cancelled"
            ? l("已取消，学习记录保留。", "Cancelled. Learning history is safe.")
            : job.error?.message,
          job.status !== "cancelled",
        );
      };
      register(watchJob(key, show));
      queueMicrotask(() => {
        const job = getJob(key);
        if (job && job.status !== "idle") show(job);
      });
      actions.append(
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
    } else if (!a?.revision.length) {
      const revise = link(
        l("先完成修订", "Revise first"),
        attemptId ? "#revision-editor" : taskUrl(g.taskId, g.attemptId),
        "secondary-action",
        "pen",
      );
      if (attemptId) revise.removeAttribute("data-route");
      actions.append(revise);
    }
    actions.append(
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
function timelineStep(list, kind, title, headingTag = "h2") {
  const item = el("li", "timeline-step is-" + kind);
  const marker = el("span", "timeline-marker");
  marker.setAttribute("aria-hidden", "true");
  marker.append(
    icon(
      {
        answer: "user",
        observed: "flag",
        revision: "pen",
        challenge: "repeat",
        outcome: "check",
      }[kind] || "circle",
    ),
  );
  const body = el("div", "timeline-body");
  body.append(el(headingTag, "", title));
  item.append(marker, body);
  list.append(item);
  return body;
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
  root.dataset.view = "history";
  container.replaceChildren(root);
  if (!g) {
    root.append(
      el("p", "", l("未找到学习记录。", "Learning history not found.")),
    );
    return () => {};
  }
  const header = root.querySelector(".page-header");
  root.querySelector("h1").textContent = g.title;
  const subtitle = root.querySelector(".page-subtitle");
  subtitle.textContent = "";
  subtitle.append(
    g.dismissedAt
      ? badge(l("已忽略 · 历史保留", "Dismissed · History retained"), "outline")
      : gapBadge(g.status),
  );
  header.prepend(
    backLink(l("返回课程", "Back to course"), "/app/courses/" + g.courseId),
  );
  const a = await repo.get("attempts", g.attemptId);
  const timeline = el("ol", "timeline");
  root.append(timeline);
  const first = timelineStep(timeline, "answer", l("第一次回答", "First answer"));
  first.append(
    voiceLabel("you", l("你的答案", "Your answer")),
    el("p", "training-prose", a.userAnswer),
    link(
      l("打开原任务与反馈", "Open original task and feedback"),
      taskUrl(g.taskId, a.id),
      "quiet-link",
      "arrowRight",
    ),
  );
  const why = timelineStep(
    timeline,
    "observed",
    l("为什么记录这个问题", "Why this was observed"),
  );
  const description = el("div", "ai-block");
  description.append(el("p", "", g.description));
  why.append(voiceLabel("ai", l("AI 的观察", "AI observation")), description);
  if (g.userAnswerExcerpt)
    why.append(
      voiceLabel("you", l("你的答案", "Your answer")),
      el("blockquote", "answer-quote", g.userAnswerExcerpt),
    );
  const evidence = el("div", "evidence-actions");
  for (const eid of g.evidenceRefs) evidence.append(previewButton(repo, eid));
  if (g.evidenceRefs.length) why.append(evidence);
  else
    why.append(
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
  why.append(
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
    const step = timelineStep(timeline, "revision", l("我的修订", "My revision"));
    step.append(
      el("p", "timeline-date", new Date(r.createdAt).toLocaleString(getLocale())),
      el("p", "training-prose", r.userAnswer),
      el("p", "reader-muted", r.reflection),
      diffView(repo, a, r),
    );
  }
  for (const t of (await repo.list("tasks")).filter(
    (t) => t.targetGapId === g.id,
  )) {
    const step = timelineStep(
      timeline,
      "challenge",
      l("换情境检验", "Transfer challenge"),
    );
    step.append(
      link(t.title, taskUrl(t.id), "quiet-link", "arrowRight"),
      el("p", "training-prose challenge-prompt", t.prompt),
    );
    for (const r of (await repo.list("retests")).filter(
      (r) => r.taskId === t.id,
    )) {
      const second = await repo.get("attempts", r.attemptId);
      const outcome = el("div", "outcome-record");
      const heading = el("h3", "outcome-heading", gapLabel(r.outcome));
      heading.dataset.outcome = r.outcome;
      outcome.append(
        heading,
        voiceLabel("you", l("这次的独立回答", "Your new answer")),
        el("p", "training-prose", second.userAnswer),
        voiceLabel("ai", l("AI 对本次回答的判断", "AI judgment of this answer")),
        el("p", "", r.reason),
      );
      const refs = el("div", "evidence-actions");
      for (const eid of r.evidenceRefs) refs.append(previewButton(repo, eid));
      if (r.evidenceRefs.length) outcome.append(refs);
      step.append(outcome);
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
  let queue = Promise.resolve(),
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
  root.dataset.view = "challenge";
  const header = el("header", "page-header");
  header.append(
    backLink(l("返回课程", "Back to course"), "/app/courses/" + course.id),
    el(
      "p",
      "page-kicker",
      l("换一个情境，检验同一种能力", "A new context, the same capability"),
    ),
    el("h1", "", task.title),
  );
  if (g) {
    const origin = el("p", "challenge-origin");
    origin.append(
      icon("repeat"),
      document.createTextNode(l("检验的问题：", "Checks: ")),
      link(g.title, "/app/gaps/" + encodeURIComponent(g.id)),
    );
    header.append(origin);
  }
  const stages = el("ol", "task-stages");
  stages.setAttribute("aria-label", l("学习进度", "Progress"));
  const stageItems = [
    l("阅读新情境", "Read the scenario"),
    l("独立作答", "Answer on your own"),
    l("再测结果", "Recheck result"),
  ].map((text, index) => {
    const li = el("li");
    const mark = el("span", "step-mark tabular", String(index + 1));
    mark.setAttribute("aria-hidden", "true");
    li.append(mark, el("span", "step-label", text));
    stages.append(li);
    return li;
  });
  const setStage = (current, complete = false) => {
    stages.classList.toggle("is-complete", complete);
    stageItems.forEach((li, index) => {
      const done = complete ? true : index < current - 1;
      li.classList.toggle("is-done", done);
      li.classList.toggle("is-current", !complete && index === current - 1);
      if (!complete && index === current - 1)
        li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
      li.querySelector(".step-mark").replaceChildren(
        done ? icon("check") : String(index + 1),
      );
    });
  };
  header.append(stages);
  const scenario = el("section", "scenario");
  scenario.append(
    el("p", "question-label", l("新情境 · 练习用假设", "New scenario · Hypothetical")),
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
  root.replaceChildren(header, scenario);
  if (!g || g.dismissedAt) {
    root.append(
      el(
        "p",
        "notice",
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
  const area = el("section", "challenge-area"),
    status = el("p"),
    statusRow = el("div", "status-row");
  statusRow.append(status);
  root.append(languageLabel, statusRow, area);
  async function render() {
    area.replaceChildren();
    if (attempt) {
      const record = el("section", "answer-record");
      record.append(
        voiceLabel("you", l("你的答案", "Your answer")),
        el("h2", "", l("这次的独立回答", "Your new answer")),
        el("p", "training-prose", attempt.userAnswer),
      );
      area.append(record);
      if (attempt.retestId) {
        setStage(3, true);
        const r = await repo.get("retests", attempt.retestId);
        const outcome = el("section", "outcome-card");
        outcome.dataset.outcome = r.outcome;
        const heading = el("h2", "retest-outcome", gapLabel(r.outcome));
        heading.prepend(icon(GAP_TONES[r.outcome]?.[1] || "circle"));
        const judgment = el("div", "ai-block");
        judgment.append(
          el(
            "p",
            "",
            l("AI 对本次回答的判断：", "AI judgment of this answer: ") +
              r.reason,
          ),
        );
        outcome.append(
          el("p", "question-label", l("再测结果 · 只记录这一次", "Recheck · This attempt only")),
          heading,
          judgment,
        );
        if (r.verificationLimited)
          outcome.append(
            el(
              "p",
              "evidence-unavailable",
              l(
                "依据或作答信息不足，系统未采纳明确结论。",
                "Evidence or answer information is insufficient; a definitive outcome was not accepted.",
              ),
            ),
          );
        const refs = el("div", "evidence-actions");
        for (const eid of r.evidenceRefs) refs.append(previewButton(repo, eid));
        if (r.evidenceRefs.length) outcome.append(refs);
        const nextStep = el("p", "item-advice", r.nextStep);
        nextStep.prepend(icon("arrowRight"));
        outcome.append(
          nextStep,
          link(
            l("回看完整学习轨迹", "View the learning history"),
            "/app/gaps/" + g.id,
            "secondary-action",
          ),
        );
        area.append(outcome);
        await mountGapPanel(area, repo, {
          attemptId: g.attemptId,
          onlyNeeds: true,
          register: (fn) => childCleanups.push(fn),
        });
        return;
      }
      setStage(3);
      const pending = el("div", "pending-feedback");
      pending.append(
        el(
          "p",
          "reader-muted",
          l(
            "你的回答已保存。再测失败或取消时可以随时重试。",
            "Your answer is saved. Retry the recheck any time if it fails or is cancelled.",
          ),
        ),
        button(
          l("获取再测结果 / 重试", "Evaluate recheck / Retry"),
          run,
          "primary-action",
        ),
      );
      area.append(pending);
      return;
    }
    setStage(2);
    const form = el("form", "training-form answer-sheet"),
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
    const saved = el("span", "save-indicator");
    saved.setAttribute("role", "status");
    const meta = el("div", "field-meta");
    meta.append(saved);
    form.append(label, meta);
    input.addEventListener("input", () => {
      const value = input.value;
      saved.textContent = l("正在保存…", "Saving…");
      saved.className = "save-indicator";
      queue = queue.catch(() => {}).then(() => repo.saveDraft(task.id, value));
      queue.then(
        () => {
          if (!disposed) {
            saved.textContent = l("草稿已保存", "Draft saved");
            saved.className = "save-indicator is-saved";
          }
        },
        (e) => message(status, e.message, true),
      );
    });
    const submit = el(
      "button",
      "primary-action",
      l("保存回答并检验", "Save answer & recheck"),
    );
    submit.type = "submit";
    const footer = el("div", "form-footer");
    footer.append(submit);
    form.append(footer);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      try {
        await queue;
        attempt = await repo.submit(task.id, input.value);
        history.replaceState({}, "", taskUrl(task.id, attempt.id));
        await render();
        run();
      } catch (e) {
        message(status, e.message, true);
        submit.disabled = false;
      }
    });
    area.append(form);
  }
  // The recheck is an app-level job; leaving the page does not cancel it.
  const retestKey = () => "retest:" + attempt.id;
  let cancelRetest = null,
    unwatchRetest = null;
  function run() {
    const current = attempt;
    if (runningJob(retestKey())) return;
    const lang = language.value;
    watchRetest();
    startJob(
      retestKey(),
      {
        kind: "retest",
        label: l("再测 · ", "Recheck · ") + task.title,
        href: taskUrl(task.id, current.id),
      },
      async (signal) => {
        const rid = makeId("retest");
        try {
          await repo.beginRetest(current.id, rid);
          let context = await prepareFeedbackContext(
            current.taskSnapshot,
            course,
            await repo.list("documents"),
            current.userAnswer,
          );
          context.outputLanguage = lang;
          const transport = createTransport("digest");
          context = await rescueRetrieval(context, transport, signal);
          const result = await generateRetest(
            context,
            g,
            task.challenge,
            transport,
            rid,
            signal,
          );
          await repo.commitRetest(current.id, rid, context, result, signal);
          return { attemptId: current.id };
        } finally {
          await repo.cancel(current.id, rid).catch(() => {});
          await repo.cancelGap(g.id, rid).catch(() => {});
        }
      },
    );
  }
  function watchRetest() {
    if (!attempt) return;
    unwatchRetest?.();
    unwatchRetest = watchJob(retestKey(), showRetest);
    const job = getJob(retestKey());
    if (job && job.status !== "idle") showRetest(job);
  }
  async function showRetest(job) {
    if (disposed || !isCurrent()) return;
    const retry = area.querySelector(".pending-feedback .primary-action");
    if (job.status === "running") {
      if (retry) retry.hidden = true;
      if (!cancelRetest?.isConnected) {
        cancelRetest = button(
          l("取消再测", "Cancel recheck"),
          () => cancelJob(job.key),
          "secondary-action btn-sm",
        );
        statusRow.append(cancelRetest);
      }
      message(
        status,
        l(
          "正在核对新答案是否仍有同一个问题…可以先去别处，完成后会提醒你。",
          "Checking whether the same issue recurs… You can leave; you'll be told when it's ready.",
        ),
        false,
        true,
      );
      return;
    }
    if (job.status === "idle") return;
    settleJob(job.key);
    cancelRetest?.remove();
    cancelRetest = null;
    if (job.status === "done") {
      attempt = await repo.get("attempts", attempt.id);
      if (disposed || !isCurrent()) return;
      message(
        status,
        l(
          "再测结果已保存。一次表现不代表长期掌握。",
          "Recheck saved. One performance does not establish mastery.",
        ),
      );
      await render();
      return;
    }
    if (retry?.isConnected) retry.hidden = false;
    message(
      status,
      job.status === "cancelled"
        ? l("已取消，回答已保存。", "Cancelled. Your answer is saved.")
        : job.error?.message,
      job.status !== "cancelled",
    );
  }
  await render();
  if (attempt && !attempt.retestId) watchRetest();
  restoreLoopScroll();
  return () => {
    disposed = true;
    unwatchRetest?.();
    childCleanups.forEach((f) => f());
    unbind();
  };
}
