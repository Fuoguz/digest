import { t as tr, th } from "./i18n.js";
import { getLocale, beforeLanguageChange } from "./i18n.js";
import {
  el,
  button,
  link,
  page,
  message,
  confirmAction,
} from "./components.js";
import { TrainingRepository } from "../data/training-repository.js";
import { makeId } from "../domain/documents.js";
import { documentSnapshot, restoreAnchor } from "../domain/evidence.js";
import {
  prepareFeedbackContext,
  generateFeedback,
} from "../domain/training.js";
import { createTransport } from "../ai/proxy-transport.js";
import { getSetting, putSetting } from "../data/db.js";

function field(form, title, value = "", multiline = false, required = true) {
  const label = el("label", "training-field", title),
    input = el(multiline ? "textarea" : "input", "core-input");
  input.value = value;
  input.required = required;
  input.maxLength = multiline ? 8000 : 200;
  if (multiline) input.rows = 5;
  label.append(input);
  form.append(label);
  return input;
}
function documentChoices(form, docs, selected) {
  const box = el("fieldset", "training-documents");
  box.append(el("legend", "", tr("相关材料")));
  const inputs = docs.map((d) => {
    const label = el("label"),
      input = el("input");
    input.type = "checkbox";
    input.value = d.id;
    input.checked = selected.includes(d.id);
    label.append(input, document.createTextNode(d.title));
    box.append(label);
    return input;
  });
  if (!docs.length) box.append(link(tr("先到资料库导入材料"), "/app/library"));
  form.append(box);
  return () => inputs.filter((i) => i.checked).map((i) => i.value);
}
function formAction(form, label, action) {
  const status = el("p"),
    submit = el("button", "primary-action", label);
  submit.type = "submit";
  form.append(status, submit);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      await action();
    } catch (error) {
      message(status, error.message, true);
    } finally {
      submit.disabled = false;
    }
  });
}
function fold(title) {
  const d = el("details", "training-fold");
  d.append(el("summary", "", title));
  return d;
}
function courseURL(id) {
  return "/app/courses/" + encodeURIComponent(id);
}
function taskURL(id, attempt) {
  return (
    "/app/tasks/" +
    encodeURIComponent(id) +
    (attempt ? "?attempt=" + encodeURIComponent(attempt) : "")
  );
}
function row(parent, title, href, detail) {
  const r = el("article", "learning-row");
  r.append(link(title, href), el("p", "reader-muted", detail));
  parent.append(r);
}
const statusLabel = (a) =>
  a.status === "completed"
    ? tr("已修订 · 尚未再次验证")
    : a.feedbackId
      ? tr("待修订")
      : tr("答案已保存 · 待反馈");

export async function mountTraining(container, db, isCurrent = () => true) {
  const repo = new TrainingRepository(db);
  const [courses, tasks, attempts, docs] = await Promise.all(
    ["courses", "tasks", "attempts", "documents"].map((n) => repo.list(n)),
  );
  if (!isCurrent()) return () => {};
  let disposed = false,
    controller,
    requestId,
    activeAttempt,
    draftQueue = Promise.resolve();
  const current = () => !disposed && isCurrent();
  const unbindLanguage = beforeLanguageChange(() => draftQueue);
  const path = location.pathname.replace(/\/$/, ""),
    id = decodeURIComponent(path.split("/").at(-1));
  const refresh = () => {
    if (current()) window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const root = page(
    tr("继续学习"),
    tr("学习，从自己的答案开始"),
    tr("用课程材料检验自己的理解：先作答，核查反馈，再修订。"),
  );
  container.replaceChildren(root);
  root.dataset.view =
    path === "/app"
      ? "desk"
      : path === "/app/courses"
        ? "courses"
        : path.includes("/tasks/")
          ? "task"
          : "course";
  if (path === "/app" || path === "/app/courses") {
    root.append(
      link(tr("资料库"), "/app/library"),
      document.createTextNode(" · "),
      link(tr("主动回忆复习"), "/app/review"),
    );
    if (path === "/app/courses") {
      root.querySelector("h1").textContent = tr("我的课程");
      root.querySelector(".page-subtitle").textContent =
        tr("把材料与练习放在同一个学习上下文中。");
    }
    const welcome = el("section", "study-guide");
    welcome.append(
      el("span", "page-kicker", tr("从一个真实问题开始")),
      el("h2", "", tr("读过了，试着解释清楚。")),
      el("p", "", tr("添加课程材料，写下自己的答案，再用原文检查理解。")),
    );
    const steps = el("ol", "study-steps");
    for (const text of [tr("添加材料"), tr("独立作答"), tr("核查与修订")])
      steps.append(el("li", "", text));
    welcome.append(steps);
    if (!courses.length) root.append(welcome);
    const form = el("form", "training-form"),
      title = field(form, tr("课程名称")),
      description = field(form, tr("课程说明（可选）"), "", true, false);
    formAction(form, tr("创建课程"), async () => {
      const c = await repo.saveCourse({
        title: title.value,
        description: description.value,
      });
      location.assign(courseURL(c.id));
    });
    const create = fold(tr("创建一个课程"));
    create.open = !courses.length;
    create.append(form);
    root.append(create);
    create.classList.add("course-create");
    root.append(el("h2", "", tr("继续你的任务")));
    const recentAttempts = [...attempts].sort((a, b) =>
      b.submittedAt.localeCompare(a.submittedAt),
    );
    const unfinished = tasks.filter(
      (t) =>
        t.draftAnswer ||
        recentAttempts.find((a) => a.taskId === t.id)?.status !== "completed",
    );
    for (const t of unfinished.slice(0, 6))
      row(
        root,
        t.title,
        taskURL(t.id),
        courses.find((c) => c.id === t.courseId)?.title || tr("课程任务"),
      );
    if (!unfinished.length)
      root.append(
        el(
          "p",
          "reader-muted",
          tr(
            "没有未完成任务。创建课程并关联自己的材料，写下一个真正需要回答的问题。",
          ),
        ),
      );
    root.append(el("h2", "", tr("最近课程")));
    for (const c of [...courses]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8))
      row(
        root,
        c.title,
        courseURL(c.id),
        c.description || tr("打开课程，继续学习"),
      );
    root.append(el("h2", "", tr("最近作答与再次练习")));
    for (const a of recentAttempts.slice(0, 5))
      row(
        root,
        tasks.find((t) => t.id === a.taskId)?.title || a.taskSnapshot.title,
        taskURL(a.taskId, a.id),
        statusLabel(a),
      );
    root.append(el("h2", "", tr("最近材料")));
    for (const d of docs.slice(0, 4))
      row(
        root,
        d.title,
        "/app/reader/" + encodeURIComponent(d.id),
        tr("继续阅读原文"),
      );
  } else if (path.startsWith("/app/courses/")) {
    const course = courses.find((c) => c.id === id);
    if (!course) {
      root.append(
        el("p", "", tr("课程不存在。")),
        link(tr("返回课程"), "/app/courses"),
      );
      return () => {};
    }
    root.querySelector("h1").textContent = course.title;
    root.querySelector(".page-subtitle").textContent =
      course.description || tr("选择必要材料，围绕一个真实问题练习。");
    const courseDocs = docs.filter((d) => course.documentIds.includes(d.id));
    root.append(
      link(tr("← 所有课程"), "/app/courses"),
      el("h2", "", tr("课程材料")),
    );
    const addMaterial = button(
      tr("添加课程材料"),
      () =>
        document.dispatchEvent(
          new CustomEvent("digest-import", { detail: { courseId: id } }),
        ),
      "secondary-action",
    );
    root.append(addMaterial);
    for (const d of courseDocs)
      row(
        root,
        d.title,
        "/app/reader/" +
          encodeURIComponent(d.id) +
          "?return=" +
          encodeURIComponent(courseURL(id)),
        tr("阅读与核查原文"),
      );
    const edit = fold(tr("编辑课程与关联材料")),
      form = el("form", "training-form"),
      title = field(form, tr("课程名称"), course.title),
      description = field(
        form,
        tr("课程说明（可选）"),
        course.description,
        true,
        false,
      );
    const selected = documentChoices(form, docs, course.documentIds);
    formAction(form, tr("保存课程"), async () => {
      await repo.saveCourse({
        ...course,
        title: title.value,
        description: description.value,
        documentIds: selected(),
      });
      refresh();
    });
    edit.open = !courseDocs.length;
    edit.append(form);
    root.append(edit, el("h2", "", tr("学习任务")));
    for (const t of tasks.filter((t) => t.courseId === id))
      row(root, t.title, taskURL(t.id), t.prompt);
    const taskForm = el("form", "training-form"),
      taskTitle = field(taskForm, tr("任务名称")),
      prompt = field(taskForm, tr("需要回答的问题"), "", true),
      rubric = field(taskForm, tr("评价标准（可选）"), "", true, false);
    const taskDocs = documentChoices(taskForm, courseDocs, course.documentIds);
    formAction(taskForm, tr("创建任务"), async () => {
      const task = await repo.saveTask({
        courseId: id,
        title: taskTitle.value,
        prompt: prompt.value,
        rubric: rubric.value,
        documentIds: taskDocs(),
      });
      location.assign(taskURL(task.id));
    });
    const create = fold(tr("创建学习任务"));
    create.open = !tasks.some((t) => t.courseId === id) && !!courseDocs.length;
    create.append(taskForm);
    root.append(create, el("h2", "", tr("最近作答")));
    for (const a of attempts
      .filter((a) => a.courseId === id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 8))
      row(root, a.taskSnapshot.title, taskURL(a.taskId, a.id), statusLabel(a));
    root.append(
      button(
        tr("删除课程…"),
        () =>
          confirmAction(
            tr("删除课程？"),
            tr(
              "将删除此课程的任务、作答和反馈。资料库、原文、研读与图谱保留。请先导出备份。",
            ),
            async () => {
              await repo.removeCourse(id);
              location.assign("/app/courses");
            },
          ),
        "quiet-link",
      ),
    );
  } else {
    const task = tasks.find((t) => t.id === id),
      course = courses.find((c) => c.id === task?.courseId);
    if (!task || !course) {
      root.append(
        el("p", "", tr("任务不存在。")),
        link(tr("返回课程"), "/app/courses"),
      );
      return () => {};
    }
    await repo.track("task_opened", { taskId: id, courseId: course.id });
    if (!current()) return () => {};
    root.querySelector("h1").textContent = task.title;
    root.querySelector(".page-subtitle").textContent = task.prompt;
    root.append(link("← " + course.title, courseURL(course.id)));
    if (task.rubric)
      root.append(
        el("h2", "", tr("评价标准")),
        el("p", "training-prose", task.rubric),
      );
    else
      root.append(
        el(
          "p",
          "reader-muted",
          tr(
            "未提供正式评分标准：反馈只检查解释、推理与材料依据，不代表教师评分。",
          ),
        ),
      );
    root.append(el("h2", "", tr("必要材料")));
    for (const documentId of task.documentIds) {
      const d = docs.find((d) => d.id === documentId);
      if (d)
        root.append(
          link(
            d.title,
            "/app/reader/" +
              encodeURIComponent(d.id) +
              "?return=" +
              encodeURIComponent(location.pathname + location.search),
          ),
        );
      else
        root.append(
          el(
            "p",
            "inline-feedback is-error",
            tr("一份关联材料已丢失，请编辑任务。"),
          ),
        );
    }
    const list = attempts
      .filter((a) => a.taskId === id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    const selectedId = new URLSearchParams(location.search).get("attempt");
    activeAttempt =
      selectedId === "new"
        ? null
        : list.find((a) => a.id === selectedId) || list[0];
    const brief = fold(tr("任务材料与评价标准"));
    brief.classList.add("task-brief");
    brief.open = !activeAttempt;
    const rubricStart = [...root.children].findIndex((n) => n.tagName === "H2");
    if (rubricStart >= 0) {
      const nodes = [...root.children].slice(rubricStart);
      root.append(brief);
      nodes.forEach((n) => brief.append(n));
    }
    const stages = el("ol", "task-stages");
    for (const text of [
      tr("理解任务"),
      tr("独立作答"),
      tr("核查反馈"),
      tr("保存修订"),
    ])
      stages.append(el("li", "", text));
    root.querySelector(".page-subtitle").after(stages);
    const outputLabel = el("label", "output-language", tr("反馈语言")),
      outputLanguage = el("select", "core-input");
    for (const [value, text] of [
      ["zh-CN", tr("简体中文")],
      ["en", "English"],
    ]) {
      const o = el("option", "", text);
      o.value = value;
      outputLanguage.append(o);
    }
    outputLanguage.value = getLocale();
    outputLabel.append(outputLanguage);
    root.append(outputLabel);
    const feedbackArea = el("section", "training-feedback"),
      status = el("p");
    status.setAttribute("aria-live", "polite");
    root.append(status);
    let answer;
    if (!activeAttempt) {
      const form = el("form", "training-form");
      answer = field(
        form,
        tr("先写下你自己的答案"),
        task.draftAnswer || "",
        true,
      );
      answer.rows = 12;
      answer.maxLength = 16000;
      answer.addEventListener("input", () => {
        const value = answer.value;
        draftQueue = draftQueue
          .catch(() => {})
          .then(() => repo.saveDraft(id, value));
        draftQueue.then(
          () => {
            if (current()) message(status, tr("草稿已保存到此浏览器。"));
          },
          (e) => {
            if (current())
              message(status, tr("草稿保存失败：") + e.message, true);
          },
        );
      });
      form.append(
        el(
          "p",
          "reader-muted",
          tr(
            "提交后，答案、任务与所选课程材料会发送到 AI 服务。首次答案会先保存，反馈不会替你写标准答案。",
          ),
        ),
      );
      formAction(form, tr("保存答案并获取反馈"), async () => {
        await draftQueue;
        // Validate limits before submission; configuration/network failures still retain the Attempt.
        await prepareFeedbackContext(task, course, docs, answer.value);
        activeAttempt = await repo.submit(id, answer.value);
        history.replaceState({}, "", taskURL(id, activeAttempt.id));
        form.remove();
        await displayAttempt();
        await runFeedback();
      });
      root.append(form);
    }
    root.append(feedbackArea);
    async function runFeedback() {
      if (controller) return;
      const ctrl = new AbortController();
      controller = ctrl;
      requestId = makeId("feedback");
      const runId = requestId,
        attemptId = activeAttempt.id;
      const cancel = button(
        tr("取消反馈"),
        () => {
          ctrl.abort();
          repo
            .cancel(attemptId, runId)
            .catch((e) => message(status, e.message, true));
        },
        "secondary-action",
      );
      status.after(cancel);
      message(
        status,
        tr("答案已保存。正在核查材料与答案，最多约 3 分钟；可以取消。"),
      );
      try {
        const freshDocs = await repo.list("documents");
        const context = await prepareFeedbackContext(
          activeAttempt.taskSnapshot,
          course,
          freshDocs,
          activeAttempt.userAnswer,
        );
        context.outputLanguage = outputLanguage.value;
        await repo.begin(attemptId, runId);
        const payload = await generateFeedback(
          context,
          createTransport("digest"),
          runId,
          ctrl.signal,
        );
        ctrl.signal.throwIfAborted();
        await repo.commit(attemptId, runId, context, payload, ctrl.signal);
        if (!current()) return;
        activeAttempt = await repo.get("attempts", attemptId);
        message(status, tr("反馈已保存。请核查依据后，用自己的话修订。"));
        await displayAttempt();
      } catch (e) {
        await repo.cancel(attemptId, runId).catch(() => {});
        if (current())
          message(
            status,
            e.name === "AbortError"
              ? tr("已取消，首次答案与已有反馈保留。")
              : e.message,
            e.name !== "AbortError",
          );
      } finally {
        cancel.remove();
        if (controller === ctrl) controller = null;
      }
    }
    async function displayAttempt() {
      const a = activeAttempt,
        f = a.feedbackId ? await repo.get("feedback", a.feedbackId) : null;
      const freshDocs = await repo.list("documents");
      const snapshots = await Promise.all(
        freshDocs
          .filter((d) => a.taskSnapshot.documentIds.includes(d.id))
          .map(documentSnapshot),
      );
      if (!current()) return;
      stages.dataset.stage = a.status === "completed" ? "4" : f ? "3" : "2";
      feedbackArea.replaceChildren(
        el("h2", "", tr("你的首次答案")),
        el("p", "training-prose", a.userAnswer),
        el(
          "p",
          "reader-muted",
          new Date(a.submittedAt).toLocaleString(getLocale()),
        ),
      );
      if (f) {
        const original = fold(tr("查看首次答案（始终保留）"));
        original.classList.add("original-answer");
        const nodes = [...feedbackArea.children];
        feedbackArea.replaceChildren(original);
        nodes.forEach((n) => original.append(n));
      }
      if (a.taskSnapshot.version !== task.version)
        feedbackArea.prepend(
          el(
            "p",
            "inline-feedback",
            tr("任务已修改。此历史作答对应的问题：") +
              a.taskSnapshot.prompt +
              tr("\n请从历史作答与重新练习入口，为当前问题重新作答。"),
          ),
        );
      if (!f)
        feedbackArea.append(
          button(tr("获取反馈 / 重试"), runFeedback, "primary-action"),
        );
      else {
        feedbackArea.append(
          el("h2", "", tr("反馈")),
          el("p", "training-prose", f.overall),
          el(
            "p",
            "reader-muted",
            tr(
              "AI 反馈可能有误。引用通过核对只表示原文存在，是否支持判断仍需你检查。",
            ),
          ),
        );
        if (f.retrievalScope?.partial)
          feedbackArea.append(
            el(
              "p",
              "scope-notice",
              tr(
                "本次反馈使用按相关性检索的材料片段，未检索到不代表全文没有依据。",
              ),
            ),
          );
        const reviseLink = el("a", "primary-action", tr("前往修订答案 ↓"));
        reviseLink.href = "#revision-editor";
        feedbackArea.append(reviseLink);
        const opinion = el("div", "feedback-opinion");
        opinion.append(el("span", "", tr("这次反馈如何？")));
        for (const [value, text] of [
          ["helpful", tr("有帮助")],
          ["inaccurate", tr("不准确")],
          ["irrelevant", tr("依据不相关")],
        ])
          opinion.append(
            button(
              text,
              async () => {
                await repo.track("feedback_rated", {
                  feedbackId: f.id,
                  rating: value,
                });
                message(status, tr("评价已保存在此浏览器，可随备份导出。"));
              },
              "secondary-action",
            ),
          );
        feedbackArea.append(opinion);
        const stale = f.sourceRevisions.some(
          (r) =>
            !snapshots.some(
              (s) =>
                s.documentId === r.documentId &&
                s.sourceRevision === r.sourceRevision,
            ),
        );
        if (stale)
          feedbackArea.append(
            el(
              "p",
              "inline-feedback is-error",
              tr("材料版本已变化；以下为历史反馈，旧依据不可定位。"),
            ),
          );
        for (const [label, items] of [
          [tr("具体缺口"), f.gaps],
          [tr("做对了什么"), f.strengths],
        ]) {
          feedbackArea.append(el("h3", "", label));
          if (!items.length)
            feedbackArea.append(
              el("p", "reader-muted", tr("本次未识别出可说明的条目。")),
            );
          for (const [index, item] of items.entries()) {
            const card = el(
              index < 3 ? "article" : "details",
              "learning-row feedback-item",
            );
            if (index >= 3) card.append(el("summary", "", item.type));
            card.id = (label === tr("具体缺口") ? "gap-" : "strength-") + index;
            card.append(el("strong", "", item.type));
            if (item.userAnswerQuote)
              card.append(
                el("blockquote", "answer-quote", item.userAnswerQuote),
              );
            card.append(
              el("p", "training-prose", item.explanation),
              el("p", "", tr("修改建议：") + item.suggestedAction),
            );
            card.append(
              el(
                "small",
                "reader-muted",
                tr("模型对语义支持的判断：") +
                  ({
                    supported: tr("有支持"),
                    partially_supported: tr("部分支持"),
                    uncertain: tr("不确定"),
                    no_evidence: tr("缺少依据"),
                  }[item.support] || tr("不确定")),
              ),
            );
            let matched = 0;
            for (const eid of item.evidenceIds) {
              const stored = await repo.get("evidenceAnchors", eid),
                snapshot = snapshots.find(
                  (s) => s.documentId === stored?.documentId,
                );
              const anchor =
                stored && snapshot ? restoreAnchor(stored, snapshot) : null;
              if (anchor?.validationStatus !== "matched") continue;
              matched++;
              const params = new URLSearchParams({
                evidence: eid,
                return: taskURL(id, a.id),
              });
              const evidence = link(
                tr("查看课程依据 · 第 ") +
                  (anchor.paragraphIndex + 1) +
                  tr(" 段"),
                "/app/reader/" +
                  encodeURIComponent(anchor.documentId) +
                  "?" +
                  params,
                "evidence-action",
              );
              evidence.addEventListener("click", () => {
                sessionStorage.setItem(
                  "digest:feedback-return:" + a.id,
                  JSON.stringify({ card: card.id, scroll: window.scrollY }),
                );
                sessionStorage.setItem(
                  "digest:feedback-scroll",
                  JSON.stringify({
                    url: location.pathname + location.search,
                    y: scrollY,
                  }),
                );
                repo
                  .track("feedback_evidence_opened", {
                    attemptId: a.id,
                    evidenceId: eid,
                  })
                  .catch(() => {});
              });
              card.append(
                el("blockquote", "training-evidence", anchor.quote),
                evidence,
              );
            }
            if (!matched)
              card.append(
                el(
                  "p",
                  "evidence-unavailable",
                  tr("未找到足够可靠的课程材料依据。"),
                ),
              );
            feedbackArea.append(card);
          }
        }
        feedbackArea.append(
          el("p", "training-prose", tr("下一步：") + f.suggestedNextStep),
        );
        const revision = el("form", "training-form revision-editor"),
          draftKey = "revision-draft:" + a.id;
        revision.id = "revision-editor";
        const savedDraft = await getSetting(draftKey, db);
        const revised = field(
          revision,
          tr("根据反馈修订答案"),
          savedDraft?.answer ?? a.revision.at(-1)?.userAnswer ?? a.userAnswer,
          true,
        );
        revised.rows = 12;
        revised.maxLength = 16000;
        const reflection = field(
          revision,
          tr("你本次主要修正了什么？"),
          savedDraft?.reflection || "",
          true,
        );
        reflection.maxLength = 4000;
        for (const input of [revised, reflection])
          input.addEventListener("input", () => {
            const value = {
              answer: revised.value,
              reflection: reflection.value,
            };
            draftQueue = draftQueue
              .catch(() => {})
              .then(() => putSetting(draftKey, value, db));
            draftQueue.catch((e) => {
              if (current())
                message(status, tr("修订草稿保存失败：") + e.message, true);
            });
          });
        formAction(revision, tr("保存修订并完成本次练习"), async () => {
          await draftQueue;
          await repo.revise(a.id, revised.value, reflection.value);
          await putSetting(draftKey, null, db);
          activeAttempt = await repo.get("attempts", a.id);
          await displayAttempt();
          message(status, tr("修订已保存，首次答案保持不变。"));
        });
        feedbackArea.append(revision);
        if (a.revision.length) {
          const completion = el("section", "training-completion");
          completion.append(
            el("h2", "", tr("本次修订已完成")),
            el("p", "", tr("主要修正：") + a.revision.at(-1).reflection),
            el(
              "p",
              "",
              tr(
                "仍未验证：修订后的理解尚未通过新的问题检验。几天后可在同一课程创建不同案例的问题再作答。",
              ),
            ),
            link(tr("创建新的问题再检验"), courseURL(course.id)),
          );
          for (const [i, r] of a.revision.entries()) {
            const history = fold(
              tr("修订 ") +
                (i + 1) +
                " · " +
                new Date(r.createdAt).toLocaleString(getLocale()),
            );
            history.append(
              el("p", "training-prose", r.userAnswer),
              el("p", "", r.reflection),
            );
            completion.append(history);
          }
          feedbackArea.append(completion);
        }
      }
      const returned = sessionStorage.getItem("digest:feedback-return:" + a.id);
      if (returned) {
        sessionStorage.removeItem("digest:feedback-return:" + a.id);
        try {
          const view = JSON.parse(returned);
          requestAnimationFrame(() => {
            if (current()) {
              const target = document.getElementById(view.card);
              target?.scrollIntoView({ block: "center" });
              if (target) {
                target.tabIndex = -1;
                target.focus({ preventScroll: true });
              }
            }
          });
        } catch {}
      }
    }
    if (activeAttempt) await displayAttempt();
    if (list.length) {
      const history = fold(tr("历史作答与重新练习"));
      history.append(
        link(tr("独立重答这道题（不展示旧答案）"), taskURL(id, "new")),
      );
      for (const a of list)
        row(
          history,
          new Date(a.submittedAt).toLocaleString(getLocale()),
          taskURL(id, a.id),
          statusLabel(a),
        );
      root.append(history);
    }
    const edit = fold(tr("编辑任务")),
      form = el("form", "training-form"),
      title = field(form, tr("任务名称"), task.title),
      prompt = field(form, tr("需要回答的问题"), task.prompt, true),
      rubric = field(form, tr("评价标准（可选）"), task.rubric, true, false);
    const selected = documentChoices(
      form,
      docs.filter((d) => course.documentIds.includes(d.id)),
      task.documentIds,
    );
    formAction(form, tr("保存任务"), async () => {
      await repo.saveTask({
        ...task,
        title: title.value,
        prompt: prompt.value,
        rubric: rubric.value,
        documentIds: selected(),
      });
      refresh();
    });
    edit.append(
      el(
        "p",
        "reader-muted",
        tr("修改任务后，历史作答与当时题目保留。新题目请重新作答。"),
      ),
      form,
      button(
        tr("删除任务…"),
        () =>
          confirmAction(
            tr("删除任务？"),
            tr("此任务的作答和反馈也将删除，课程材料保留。"),
            async () => {
              await repo.removeTask(id);
              location.assign(courseURL(course.id));
            },
          ),
        "quiet-link",
      ),
    );
    root.append(edit);
  }
  try {
    const saved = JSON.parse(
      sessionStorage.getItem("digest:feedback-scroll") || "null",
    );
    if (saved?.url === location.pathname + location.search) {
      sessionStorage.removeItem("digest:feedback-scroll");
      requestAnimationFrame(() => window.scrollTo(0, saved.y));
    }
  } catch {}
  // Editorial sections: clear boundaries between the next action and the archive.
  if (path === "/app" || path === "/app/courses") {
    for (const n of [...root.childNodes]) if (n.nodeType === 3) n.remove();
    const children = [...root.children];
    let group = null,
      index = 0;
    for (const child of children) {
      if (child.tagName === "H2") {
        group = el("section", "desk-section");
        group.dataset.section = index++;
        child.before(group);
        group.append(child);
      } else if (group) group.append(child);
    }
    if (path === "/app/courses")
      for (const section of root.querySelectorAll(".desk-section"))
        if (section.dataset.section !== "1") section.remove();
    if (courses.length) root.append(root.querySelector(".course-create"));
  }
  return () => {
    unbindLanguage();
    disposed = true;
    controller?.abort();
    if (activeAttempt && requestId)
      repo.cancel(activeAttempt.id, requestId).catch(() => {});
  };
}
