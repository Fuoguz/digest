import { backupReminder, snoozeBackupReminder } from "../data/storage-guard.js";
import {
  mountGapPanel,
  mountChallenge,
  diffView,
  previewButton,
  l,
} from "./learning-loop.js";
import { LoopRepository } from "../data/loop-repository.js";
import { quickPractice } from "./quick-practice.js";
import { rescueRetrieval } from "../ai/retrieval-rescue.js";
import { suggestTasks } from "../ai/task-suggestions.js";
import { t as tr } from "./i18n.js";
import { getLocale, beforeLanguageChange } from "./i18n.js";
import {
  el,
  button,
  link,
  backLink,
  page,
  message,
  badge,
  voiceLabel,
  sectionHead,
  icon,
  confirmAction,
} from "./components.js";
import { makeId } from "../domain/documents.js";
import { documentSnapshot, restoreAnchor } from "../domain/evidence.js";
import { needsRecheck } from "../domain/gaps.js";
import {
  prepareFeedbackContext,
  generateFeedback,
} from "../domain/training.js";
import { createTransport } from "../ai/proxy-transport.js";
import {
  startJob,
  getJob,
  runningJob,
  cancelJob,
  settleJob,
  watchJob,
} from "./jobs.js";
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
  const footer = el("div", "form-footer");
  footer.append(submit);
  form.append(status, footer);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    try {
      await action();
    } catch (error) {
      message(status, error.message, true);
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
    }
  });
  return footer;
}
// Autosave indicator next to a field; never covers the request status line.
function saveIndicator() {
  const node = el("span", "save-indicator");
  node.setAttribute("role", "status");
  return node;
}
function showSaved(node, text, error = false) {
  node.textContent = text;
  node.className = "save-indicator " + (error ? "is-error" : "is-saved");
}
function charCount(input, max) {
  const node = el("span", "char-count tabular");
  const update = () =>
    (node.textContent =
      input.value.length.toLocaleString(getLocale()) +
      " / " +
      max.toLocaleString(getLocale()));
  input.addEventListener("input", update);
  update();
  return node;
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
function row(parent, title, href, detail, status) {
  const r = el("article", "learning-row");
  const body = el("div", "row-body");
  body.append(link(title, href, "row-title"));
  if (detail) body.append(el("p", "reader-muted", detail));
  r.append(body);
  if (status) r.append(status);
  r.append(icon("chevronRight", "icon row-chevron"));
  parent.append(r);
  return r;
}
const statusLabel = (a) =>
  a.completedWithoutRevision
    ? l("已检查 · 本次未发现缺口", "Reviewed · No gap observed")
    : a.retestId
      ? l("再测结果已记录", "Recheck recorded")
      : a.status === "completed"
        ? tr("已修订 · 尚未再次验证")
        : a.feedbackId
          ? tr("待修订")
          : tr("答案已保存 · 待反馈");
function statusBadge(a) {
  if (!a) return null;
  const tone = a.completedWithoutRevision
    ? "success"
    : a.retestId
      ? "accent"
      : a.status === "completed"
        ? "success"
        : a.feedbackId
          ? "warning"
          : "";
  const glyph =
    tone === "success" ? "check" : tone === "warning" ? "pen" : "clock";
  return badge(statusLabel(a), tone, glyph);
}
function stepper(labels) {
  const list = el("ol", "task-stages");
  list.setAttribute("aria-label", l("学习进度", "Progress"));
  const items = labels.map((text, index) => {
    const li = el("li");
    const mark = el("span", "step-mark tabular", String(index + 1));
    mark.setAttribute("aria-hidden", "true");
    li.append(mark, el("span", "step-label", text));
    list.append(li);
    return li;
  });
  list.set = (current, complete = false) => {
    list.dataset.stage = String(current);
    list.classList.toggle("is-complete", complete);
    items.forEach((li, index) => {
      const done = complete ? index <= current - 1 : index < current - 1;
      li.classList.toggle("is-done", done);
      li.classList.toggle("is-current", !complete && index === current - 1);
      if (!complete && index === current - 1)
        li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
      const mark = li.querySelector(".step-mark");
      mark.replaceChildren(done ? icon("check") : String(index + 1));
    });
  };
  return list;
}
const SUPPORT = {
  supported: ["有支持", "success"],
  partially_supported: ["部分支持", "warning"],
  uncertain: ["不确定", ""],
  no_evidence: ["缺少依据", "danger"],
};

export async function mountTraining(container, db, isCurrent = () => true) {
  const repo = new LoopRepository(db);
  const loopCleanups = [];
  const [courses, tasks, attempts, docs] = await Promise.all(
    ["courses", "tasks", "attempts", "documents"].map((n) => repo.list(n)),
  );
  if (!isCurrent()) return () => {};
  let disposed = false,
    controller,
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
  const header = root.querySelector(".page-header");
  const recentAttempts = [...attempts].sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt),
  );
  const latestFor = (taskId) => recentAttempts.find((a) => a.taskId === taskId);
  if (path === "/app" || path === "/app/courses") {
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
    create.classList.add("course-create");
    create.open = !courses.length;
    create.append(form);
    if (path === "/app/courses") {
      root.querySelector("h1").textContent = tr("我的课程");
      root.querySelector(".page-subtitle").textContent =
        tr("把材料与练习放在同一个学习上下文中。");
      const list = el("div", "course-grid");
      for (const c of [...courses].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      )) {
        const card = el("article", "course-card");
        const taskCount = tasks.filter((t) => t.courseId === c.id).length;
        card.append(
          link(c.title, courseURL(c.id), "row-title"),
          el("p", "reader-muted", c.description || tr("打开课程，继续学习")),
          el(
            "p",
            "course-meta tabular",
            l(
              c.documentIds.length + " 份材料 · " + taskCount + " 个任务",
              c.documentIds.length +
                " sources · " +
                taskCount +
                (taskCount === 1 ? " task" : " tasks"),
            ),
          ),
        );
        list.append(card);
      }
      const section = el("section", "desk-section");
      section.append(sectionHead(tr("最近课程")));
      if (courses.length) section.append(list);
      else
        section.append(
          el(
            "p",
            "reader-muted",
            l(
              "还没有课程。创建一个课程，把材料和问题放在一起。",
              "No courses yet. Create one to keep sources and questions together.",
            ),
          ),
        );
      root.append(section, create);
    } else {
      const unfinished = tasks.filter(
        (t) =>
          t.draftAnswer ||
          (latestFor(t.id)?.status !== "completed" &&
            !latestFor(t.id)?.retestId),
      );
      const gaps = (await repo.list("learningGaps")).filter(
        (g) => !g.dismissedAt && needsRecheck(g),
      );
      if (!current()) return () => {};
      // One clear next action: unfinished work first, then rechecks, then setup.
      const next = el("section", "next-step");
      next.setAttribute("aria-labelledby", "next-step-title");
      const nextTitle = (text) => {
        const h = el("h2", "", text);
        h.id = "next-step-title";
        return h;
      };
      const focusTask = [...unfinished].sort((a, b) =>
        (latestFor(b.id)?.submittedAt || b.updatedAt).localeCompare(
          latestFor(a.id)?.submittedAt || a.updatedAt,
        ),
      )[0];
      if (focusTask) {
        const a = latestFor(focusTask.id);
        next.append(
          el("p", "next-step-label", l("下一步", "Next step")),
          nextTitle(focusTask.title),
          el(
            "p",
            "next-step-detail",
            (courses.find((c) => c.id === focusTask.courseId)?.title ||
              tr("课程任务")) +
              " · " +
              (a
                ? statusLabel(a)
                : l("草稿未提交", "Draft not submitted yet")),
          ),
          link(
            a?.feedbackId
              ? l("继续修订", "Continue revising")
              : l("继续作答", "Continue answering"),
            taskURL(focusTask.id),
            "primary-action",
          ),
        );
      } else if (gaps.length) {
        next.append(
          el("p", "next-step-label", l("下一步", "Next step")),
          nextTitle(
            l(
              gaps.length + " 个理解问题待再次检验",
              gaps.length +
                (gaps.length === 1
                  ? " observation needs a recheck"
                  : " observations need a recheck"),
            ),
          ),
          el(
            "p",
            "next-step-detail",
            l(
              "换一个情境独立作答，看看同样的问题是否还会出现。",
              "Answer a new scenario on your own to see whether the issue recurs.",
            ),
          ),
          link(l("查看待检验问题", "See what needs a recheck"), "#needs-recheck", "primary-action"),
        );
        next.querySelector("a").removeAttribute("data-route");
      }
      // The fastest way in is one question; it replaces onboarding and "nothing pending".
      const quick = quickPractice({
        repo,
        db,
        docs,
        compact: !!next.childNodes.length,
        register: (fn) => loopCleanups.push(fn),
        // Arriving from the Reader with ?practice=<material>.
        material: new URLSearchParams(location.search).get("practice"),
      });
      if (next.childNodes.length) {
        header.after(next);
        next.after(quick);
      } else header.after(quick);
      // Learning lives only in this browser: nudge a backup when none covers recent work.
      const reminder = await backupReminder(db, await repo.list("activities")).catch(() => null);
      if (reminder?.due && current()) {
        const nudge = el("section", "backup-nudge");
        nudge.setAttribute("role", "note");
        nudge.append(
          el(
            "p",
            "",
            l(
              "你的学习记录只保存在这个浏览器里" +
                (reminder.lastBackup
                  ? "，上次备份是 " + new Date(reminder.lastBackup).toLocaleDateString("zh-CN") + "。"
                  : "，还没有备份过。") +
                "清理浏览器数据或换电脑都会丢失，建议现在导出一份。",
              "Your learning is stored only in this browser" +
                (reminder.lastBackup
                  ? "; last backup " + new Date(reminder.lastBackup).toLocaleDateString("en") + ". "
                  : " and has never been backed up. ") +
                "Clearing browser data or switching computers loses it. Export a backup now.",
            ),
          ),
          link(l("去导出备份", "Export a backup"), "/app/settings", "secondary-action btn-sm"),
          button(l("7 天后再提醒", "Remind me in 7 days"), async () => {
            await snoozeBackupReminder(db).catch(() => {});
            nudge.remove();
          }, "quiet-link"),
        );
        header.after(nudge);
      }
      const main = el("div", "desk-main"),
        side = el("div", "desk-side"),
        layout = el("div", "desk-layout");
      layout.append(main, side);
      root.append(layout);
      const tasksSection = el("section", "desk-section");
      tasksSection.append(sectionHead(tr("继续你的任务")));
      for (const t of unfinished.slice(0, 6))
        row(
          tasksSection,
          t.title,
          taskURL(t.id),
          courses.find((c) => c.id === t.courseId)?.title || tr("课程任务"),
          latestFor(t.id)
            ? statusBadge(latestFor(t.id))
            : badge(l("草稿", "Draft"), "", "pen"),
        );
      if (!unfinished.length)
        tasksSection.append(
          el(
            "p",
            "reader-muted",
            tr(
              "没有未完成任务。创建课程并关联自己的材料，写下一个真正需要回答的问题。",
            ),
          ),
        );
      main.append(tasksSection);
      const gapSlot = el("div", "gap-slot");
      gapSlot.id = "needs-recheck";
      main.append(gapSlot);
      const attemptsSection = el("section", "desk-section");
      attemptsSection.append(sectionHead(tr("最近作答与再次练习")));
      for (const a of recentAttempts.slice(0, 5))
        row(
          attemptsSection,
          tasks.find((t) => t.id === a.taskId)?.title || a.taskSnapshot.title,
          taskURL(a.taskId, a.id),
          new Date(a.submittedAt).toLocaleDateString(getLocale()),
          statusBadge(a),
        );
      if (!recentAttempts.length)
        attemptsSection.append(
          el("p", "reader-muted", l("还没有作答记录。", "No answers yet.")),
        );
      main.append(attemptsSection);
      const coursesSection = el("section", "desk-section");
      coursesSection.append(
        sectionHead(
          tr("最近课程"),
          courses.length ? link(l("全部课程", "All courses"), "/app/courses") : null,
        ),
      );
      for (const c of [...courses]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6))
        row(
          coursesSection,
          c.title,
          courseURL(c.id),
          c.description || tr("打开课程，继续学习"),
        );
      coursesSection.append(create);
      const docsSection = el("section", "desk-section");
      docsSection.append(
        sectionHead(
          tr("最近材料"),
          docs.length ? link(tr("资料库"), "/app/library") : null,
        ),
      );
      for (const d of docs.slice(0, 4))
        row(
          docsSection,
          d.title,
          "/app/reader/" + encodeURIComponent(d.id),
          tr("继续阅读原文"),
        );
      if (!docs.length)
        docsSection.append(
          el("p", "reader-muted", l("还没有导入材料。", "No sources imported yet.")),
        );
      side.append(coursesSection, docsSection);
      if (!courses.length) {
        // First visit: the setup form sits right under the onboarding card;
        // empty archive sections would only add noise.
        quick.after(create);
        coursesSection.remove();
        if (!recentAttempts.length) attemptsSection.remove();
        if (!unfinished.length) tasksSection.remove();
        if (!docs.length) docsSection.remove();
      }
    }
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
    root.querySelector(".page-kicker").textContent = l("课程", "Course");
    root.querySelector(".page-subtitle").textContent =
      course.description || tr("选择必要材料，围绕一个真实问题练习。");
    header.prepend(backLink(tr("← 所有课程"), "/app/courses"));
    const courseDocs = docs.filter((d) => course.documentIds.includes(d.id));
    const courseTasks = tasks.filter((t) => t.courseId === id);
    header.append(
      el(
        "p",
        "course-meta tabular",
        l(
          courseDocs.length + " 份材料 · " + courseTasks.length + " 个任务",
          courseDocs.length +
            " sources · " +
            courseTasks.length +
            (courseTasks.length === 1 ? " task" : " tasks"),
        ),
      ),
    );
    const main = el("div", "desk-main"),
      side = el("div", "desk-side"),
      layout = el("div", "desk-layout");
    layout.append(main, side);
    root.append(layout);
    const materials = el("section", "desk-section");
    const addMaterial = button(
      tr("添加课程材料"),
      () =>
        document.dispatchEvent(
          new CustomEvent("digest-import", { detail: { courseId: id } }),
        ),
      "secondary-action btn-sm",
    );
    addMaterial.prepend(icon("plus"));
    materials.append(sectionHead(tr("课程材料"), addMaterial));
    for (const d of courseDocs)
      row(
        materials,
        d.title,
        "/app/reader/" +
          encodeURIComponent(d.id) +
          "?return=" +
          encodeURIComponent(courseURL(id)),
        tr("阅读与核查原文"),
      );
    if (!courseDocs.length)
      materials.append(
        el(
          "p",
          "reader-muted",
          l(
            "还没有关联材料。添加材料，或在下方选择资料库中的已有材料。",
            "No linked sources yet. Add one, or pick existing sources below.",
          ),
        ),
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
    materials.append(edit);
    side.append(materials);
    const taskSection = el("section", "desk-section");
    taskSection.append(sectionHead(tr("学习任务")));
    for (const t of courseTasks) {
      const r = row(
        taskSection,
        t.title,
        taskURL(t.id),
        t.prompt,
        statusBadge(latestFor(t.id)) ||
          (t.draftAnswer ? badge(l("草稿", "Draft"), "", "pen") : null),
      );
      if (t.targetGapId)
        r.querySelector(".row-body").prepend(
          badge(l("换情境检验", "Transfer challenge"), "accent", "repeat"),
        );
    }
    if (!courseTasks.length)
      taskSection.append(
        el(
          "p",
          "reader-muted",
          l(
            "还没有任务。写下一个真正需要回答的问题。",
            "No tasks yet. Write down a question you genuinely need to answer.",
          ),
        ),
      );
    const taskForm = el("form", "training-form"),
      taskTitle = field(taskForm, tr("任务名称")),
      prompt = field(taskForm, tr("需要回答的问题"), "", true),
      rubric = field(taskForm, tr("评价标准（可选）"), "", true, false);
    const taskDocs = documentChoices(taskForm, courseDocs, course.documentIds);
    const suggestions = el("section", "task-suggestions"),
      suggestStatus = el("p");
    const suggest = button(
      l("帮我生成几个练习任务", "Suggest a few practice tasks"),
      async () => {
        if (controller) return;
        const ids = taskDocs();
        if (!ids.length) {
          message(
            suggestStatus,
            l("先选择课程材料。", "Select course material first."),
            true,
          );
          return;
        }
        controller = new AbortController();
        const local = controller;
        suggest.disabled = true;
        const cancel = button(
          l("取消准备", "Cancel preparation"),
          () => local.abort(),
          "secondary-action btn-sm",
        );
        suggestions.append(cancel);
        message(
          suggestStatus,
          l(
            "正在根据所选材料准备练习建议…",
            "Preparing suggestions from selected materials…",
          ),
          false,
          true,
        );
        try {
          const context = await prepareFeedbackContext(
            { documentIds: ids, prompt: "Explain compare apply critique" },
            course,
            courseDocs,
            "Practice task suggestions",
          );
          context.outputLanguage = getLocale();
          const candidates = await suggestTasks(
            context,
            createTransport("digest"),
            local.signal,
          );
          if (!current()) return;
          suggestions
            .querySelectorAll(".suggested-task")
            .forEach((e) => e.remove());
          message(
            suggestStatus,
            candidates.length
              ? l(
                  "选择一题后可继续编辑；尚未创建任务。",
                  "Choose one to edit. Nothing has been created yet.",
                )
              : l(
                  "材料不足以生成可靠任务，请直接输入自己的问题。",
                  "Insufficient material. Enter your own question.",
                ),
          );
          for (const candidate of candidates) {
            const card = el("article", "suggested-task");
            const practise = button(
              l("直接练这道", "Practise this now"),
              async () => {
                practise.disabled = true;
                try {
                  const created = await repo.saveTask({
                    courseId: id,
                    title: candidate.title,
                    prompt: candidate.prompt,
                    rubric: "",
                    documentIds: candidate.documentIds,
                  });
                  location.assign(taskURL(created.id) + "?start=1");
                } catch (e) {
                  message(suggestStatus, e.message, true);
                  practise.disabled = false;
                }
              },
              "primary-action btn-sm",
            );
            card.append(
              el("h3", "", candidate.title),
              el("p", "", candidate.prompt),
              practise,
              button(
                l("使用这道题", "Use this question"),
                () => {
                  taskTitle.value = candidate.title;
                  prompt.value = candidate.prompt;
                  for (const input of taskForm.querySelectorAll(
                    'input[type="checkbox"]',
                  ))
                    input.checked = candidate.documentIds.includes(input.value);
                  prompt.focus();
                },
                "secondary-action btn-sm",
              ),
            );
            suggestions.append(card);
          }
        } catch (e) {
          if (current())
            message(
              suggestStatus,
              e.name === "AbortError"
                ? l(
                    "已取消，输入内容保留。",
                    "Cancelled. Your input is retained.",
                  )
                : e.message,
              e.name !== "AbortError",
            );
        } finally {
          controller = null;
          suggest.disabled = false;
          cancel.remove();
        }
      },
      "secondary-action",
    );
    suggest.prepend(icon("ai"));
    suggestions.append(suggest, suggestStatus);
    taskForm.prepend(suggestions);
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
    create.classList.add("is-emphasis");
    create.open = !courseTasks.length && !!courseDocs.length;
    create.append(taskForm);
    taskSection.append(create);
    main.append(taskSection);
    const gapSlot = el("div", "gap-slot");
    main.append(gapSlot);
    const recent = el("section", "desk-section");
    recent.append(sectionHead(tr("最近作答")));
    const courseAttempts = recentAttempts
      .filter((a) => a.courseId === id)
      .slice(0, 8);
    for (const a of courseAttempts)
      row(
        recent,
        a.taskSnapshot.title,
        taskURL(a.taskId, a.id),
        new Date(a.submittedAt).toLocaleDateString(getLocale()),
        statusBadge(a),
      );
    if (!courseAttempts.length)
      recent.append(
        el("p", "reader-muted", l("还没有作答记录。", "No answers yet.")),
      );
    main.append(recent);
    side.append(
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
        "quiet-link is-danger danger-zone",
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
    if (task.targetGapId) {
      unbindLanguage();
      return mountChallenge(root, db, task, course, isCurrent);
    }
    await repo.track("task_opened", { taskId: id, courseId: course.id });
    if (!current()) return () => {};
    root.querySelector("h1").textContent = task.title;
    root.querySelector(".page-kicker").textContent = tr("学习任务");
    const promptBlock = root.querySelector(".page-subtitle");
    promptBlock.textContent = task.prompt;
    promptBlock.before(el("p", "question-label", l("题目", "Question")));
    header.prepend(backLink("← " + course.title, courseURL(course.id)));
    const stages = stepper([
      tr("理解任务"),
      tr("独立作答"),
      tr("核查反馈"),
      tr("保存修订"),
    ]);
    stages.set(2);
    header.append(stages);
    const main = el("div", "task-main"),
      aside = el("aside", "task-aside"),
      layout = el("div", "task-layout");
    aside.setAttribute("aria-label", l("任务信息", "Task details"));
    layout.append(main, aside);
    root.append(layout);
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
    brief.open = !activeAttempt || matchMedia("(min-width: 1100px)").matches;
    brief.append(el("h2", "", tr("必要材料")));
    for (const documentId of task.documentIds) {
      const d = docs.find((d) => d.id === documentId);
      if (d)
        brief.append(
          link(
            d.title,
            "/app/reader/" +
              encodeURIComponent(d.id) +
              "?return=" +
              encodeURIComponent(location.pathname + location.search),
            "material-link",
            "quote",
          ),
        );
      else
        brief.append(
          el(
            "p",
            "inline-feedback is-error",
            tr("一份关联材料已丢失，请编辑任务。"),
          ),
        );
    }
    if (task.rubric)
      brief.append(
        el("h2", "", tr("评价标准")),
        el("p", "training-prose", task.rubric),
      );
    else
      brief.append(
        el(
          "p",
          "reader-muted",
          tr(
            "未提供正式评分标准：反馈只检查解释、推理与材料依据，不代表教师评分。",
          ),
        ),
      );
    main.append(brief);
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
    aside.append(outputLabel);
    const feedbackArea = el("section", "training-feedback"),
      status = el("p"),
      statusRow = el("div", "status-row");
    status.setAttribute("aria-live", "polite");
    statusRow.append(status);
    main.append(statusRow);
    let answer, retryButton;
    if (!activeAttempt) {
      const form = el("form", "training-form answer-sheet");
      answer = field(
        form,
        tr("先写下你自己的答案"),
        task.draftAnswer || "",
        true,
      );
      answer.rows = 12;
      answer.maxLength = 16000;
      const saved = saveIndicator();
      const meta = el("div", "field-meta");
      meta.append(saved, charCount(answer, 16000));
      form.append(meta);
      answer.addEventListener("input", () => {
        const value = answer.value;
        saved.textContent = l("正在保存…", "Saving…");
        saved.className = "save-indicator";
        draftQueue = draftQueue
          .catch(() => {})
          .then(() => repo.saveDraft(id, value));
        draftQueue.then(
          () => {
            if (current()) showSaved(saved, tr("草稿已保存到此浏览器。"));
          },
          (e) => {
            if (current())
              showSaved(saved, tr("草稿保存失败：") + e.message, true);
          },
        );
      });
      form.append(
        el(
          "p",
          "reader-muted form-note",
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
        runFeedback();
      });
      main.append(form);
    }
    main.append(feedbackArea);
    // Feedback runs as an app-level job: leaving this page does not cancel it.
    const feedbackKey = (attemptId) => "feedback:" + attemptId;
    let cancelFeedback = null,
      unwatchFeedback = null;
    function runFeedback() {
      const attempt = activeAttempt;
      if (runningJob(feedbackKey(attempt.id))) return;
      const language = outputLanguage.value;
      watchFeedback(attempt.id);
      startJob(
        feedbackKey(attempt.id),
        {
          kind: "feedback",
          label: l("反馈 · ", "Feedback · ") + task.title,
          href: taskURL(id, attempt.id),
        },
        async (signal, update) => {
          const runId = makeId("feedback");
          update({ phase: "material" });
          try {
            const freshDocs = await repo.list("documents");
            let context = await prepareFeedbackContext(
              attempt.taskSnapshot,
              course,
              freshDocs,
              attempt.userAnswer,
            );
            context.outputLanguage = language;
            await repo.begin(attempt.id, runId);
            context = await rescueRetrieval(
              context,
              createTransport("digest"),
              signal,
            );
            update({ phase: "model" });
            const payload = await generateFeedback(
              context,
              createTransport("digest"),
              runId,
              signal,
            );
            signal.throwIfAborted();
            await repo.commit(attempt.id, runId, context, payload, signal);
            return { attemptId: attempt.id };
          } catch (e) {
            await repo.cancel(attempt.id, runId).catch(() => {});
            throw e;
          }
        },
      );
    }
    function watchFeedback(attemptId) {
      unwatchFeedback?.();
      unwatchFeedback = watchJob(feedbackKey(attemptId), (job) =>
        showFeedbackJob(job, attemptId),
      );
      loopCleanups.push(() => unwatchFeedback?.());
      const job = getJob(feedbackKey(attemptId));
      if (job && job.status !== "idle") showFeedbackJob(job, attemptId);
    }
    async function showFeedbackJob(job, attemptId) {
      if (!current() || activeAttempt?.id !== attemptId) return;
      if (job.status === "running") {
        if (retryButton) retryButton.hidden = true;
        if (!cancelFeedback?.isConnected) {
          cancelFeedback = button(
            tr("取消反馈"),
            () => cancelJob(feedbackKey(attemptId)),
            "secondary-action btn-sm",
          );
          statusRow.append(cancelFeedback);
        }
        message(
          status,
          job.progress?.phase === "model"
            ? l(
                "正在分析你的回答，整理最重要的问题…可以先去别处，完成后会提醒你。",
                "Analyzing your answer and prioritizing the important issues… You can leave; you'll be told when it's ready.",
              )
            : l(
                "答案已保存。正在核对相关材料，可以取消。",
                "Answer saved. Checking relevant material; you can cancel.",
              ),
          false,
          true,
        );
        return;
      }
      if (job.status === "idle") return;
      settleJob(job.key);
      cancelFeedback?.remove();
      cancelFeedback = null;
      if (job.status === "done") {
        activeAttempt = await repo.get("attempts", attemptId);
        if (!current()) return;
        message(status, tr("反馈已保存。请核查依据后，用自己的话修订。"));
        await displayAttempt();
        return;
      }
      if (retryButton?.isConnected) retryButton.hidden = false;
      message(
        status,
        job.status === "cancelled"
          ? tr("已取消，首次答案与已有反馈保留。")
          : job.error?.message || tr("反馈未完成，请重试。"),
        job.status !== "cancelled",
      );
    }
    function feedbackCard(item, index, kind, a, snapshots) {
      const card = el(
        index < 3 ? "article" : "details",
        "learning-row feedback-item is-" + kind,
      );
      card.id = (kind === "gap" ? "gap-" : "strength-") + index;
      const head = el(index < 3 ? "header" : "summary", "feedback-item-head");
      const number = el("span", "item-index tabular", String(index + 1).padStart(2, "0"));
      number.setAttribute("aria-hidden", "true");
      const titleBox = el("div", "item-title");
      titleBox.append(
        el(
          "small",
          "voice-label is-ai",
          l("AI 对你回答的判断： ", "AI judgment of your answer: "),
        ),
        el("strong", "", item.type),
      );
      head.append(number, titleBox);
      card.append(head);
      const body = el("div", "feedback-item-body");
      if (item.userAnswerQuote)
        body.append(
          voiceLabel("you", l("你的答案", "Your answer")),
          el("blockquote", "answer-quote", item.userAnswerQuote),
        );
      body.append(el("p", "training-prose item-explanation", item.explanation));
      const advice = el("p", "item-advice", tr("修改建议：") + item.suggestedAction);
      advice.prepend(icon("pen"));
      body.append(advice);
      const [supportText, tone] = SUPPORT[item.support] || SUPPORT.uncertain;
      const support = el("p", "support-line", tr("模型对语义支持的判断："));
      support.append(badge(tr(supportText), tone));
      body.append(support);
      card.append(body);
      return { card, body };
    }
    async function appendEvidence(card, body, item, a, snapshots) {
      let matched = 0;
      for (const eid of item.evidenceIds) {
        const stored = await repo.get("evidenceAnchors", eid),
          snapshot = snapshots.find((s) => s.documentId === stored?.documentId);
        const anchor =
          stored && snapshot ? restoreAnchor(stored, snapshot) : null;
        if (anchor?.validationStatus !== "matched") continue;
        matched++;
        const params = new URLSearchParams({
          evidence: eid,
          return: taskURL(id, a.id),
        });
        const evidence = link(
          tr("查看课程依据 · 第 ") + (anchor.paragraphIndex + 1) + tr(" 段"),
          "/app/reader/" + encodeURIComponent(anchor.documentId) + "?" + params,
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
        const actions = el("div", "evidence-actions");
        const preview = previewButton(repo, eid);
        preview.classList.add("btn-sm");
        actions.append(preview, evidence);
        body.append(
          voiceLabel("source", l("来自课程材料", "From course material")),
          el("blockquote", "training-evidence", anchor.quote),
          actions,
        );
      }
      if (!matched)
        body.append(
          el(
            "p",
            "evidence-unavailable",
            tr("未找到足够可靠的课程材料依据。"),
          ),
        );
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
      if (a.status === "completed") stages.set(4, true);
      else stages.set(f ? 3 : 2);
      const original = el("section", "answer-record");
      original.append(
        voiceLabel("you", l("你的答案", "Your answer")),
        el("h2", "", tr("你的首次答案")),
        el("p", "training-prose", a.userAnswer),
      );
      const stamp = el(
        "p",
        "reader-muted answer-stamp",
        new Date(a.submittedAt).toLocaleString(getLocale()),
      );
      stamp.prepend(icon("check"));
      original.append(stamp);
      feedbackArea.replaceChildren(original);
      if (f) {
        const originalFold = fold(tr("查看首次答案（始终保留）"));
        originalFold.classList.add("original-answer");
        original.querySelector("h2").remove();
        originalFold.append(original);
        feedbackArea.replaceChildren(originalFold);
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
      if (!f) {
        const pending = el("div", "pending-feedback");
        pending.append(
          el(
            "p",
            "reader-muted",
            l(
              "你的答案已保存在此浏览器。获取反馈失败或取消时，可以随时重试，不会覆盖首次答案。",
              "Your answer is saved in this browser. If feedback fails or is cancelled, retry any time; your first answer stays as written.",
            ),
          ),
        );
        retryButton = button(tr("获取反馈 / 重试"), runFeedback, "primary-action");
        if (runningJob(feedbackKey(a.id))) retryButton.hidden = true;
        pending.append(retryButton);
        feedbackArea.append(pending);
      } else {
        const overview = el("section", "feedback-overview");
        const overviewHead = el("div", "section-head");
        overviewHead.append(el("h2", "", tr("反馈")), badge("AI", "ai", "ai"));
        const summary = el("div", "ai-block");
        summary.append(el("p", "training-prose", f.overall));
        overview.append(
          overviewHead,
          summary,
          el(
            "p",
            "reader-muted ai-caveat",
            tr(
              "AI 反馈可能有误。引用通过核对只表示原文存在，是否支持判断仍需你检查。",
            ),
          ),
        );
        if (f.retrievalScope?.partial)
          overview.append(
            el(
              "p",
              "scope-notice",
              tr(
                "本次反馈使用按相关性检索的材料片段，未检索到不代表全文没有依据。",
              ),
            ),
          );
        const stale = f.sourceRevisions.some(
          (r) =>
            !snapshots.some(
              (s) =>
                s.documentId === r.documentId &&
                s.sourceRevision === r.sourceRevision,
            ),
        );
        if (stale)
          overview.append(
            el(
              "p",
              "inline-feedback is-error",
              tr("材料版本已变化；以下为历史反馈，旧依据不可定位。"),
            ),
          );
        feedbackArea.append(overview);
        for (const [label, items, kind] of [
          [tr("具体缺口"), f.gaps, "gap"],
          [tr("做对了什么"), f.strengths, "strength"],
        ]) {
          const group = el("section", "feedback-group is-" + kind);
          const groupHead = el("div", "section-head");
          groupHead.append(el("h3", "", label));
          groupHead.append(
            badge(
              String(items.length),
              kind === "gap" ? (items.length ? "warning" : "success") : "success",
            ),
          );
          group.append(groupHead);
          if (!items.length)
            group.append(
              el("p", "reader-muted", tr("本次未识别出可说明的条目。")),
            );
          // Lead with the one issue that matters most; the rest stay one click away.
          let rest = group;
          const collapse =
            kind === "gap" ? items.length > 1 : f.gaps.length > 0 && items.length > 0;
          for (const [index, item] of items.entries()) {
            const { card, body } = feedbackCard(item, index, kind, a, snapshots);
            await appendEvidence(card, body, item, a, snapshots);
            if (kind === "gap" && index === 0) {
              card.classList.add("is-key");
              card.prepend(
                el("p", "key-label", l("AI 认为最需要先改的一处", "What the AI would fix first")),
              );
            }
            if (collapse && rest === group && (kind !== "gap" || index === 1)) {
              rest = el("details", "more-items");
              rest.append(
                el(
                  "summary",
                  "",
                  kind === "gap"
                    ? l("还有 " + (items.length - 1) + " 个问题", (items.length - 1) + " more issue(s)")
                    : l("展开 " + items.length + " 条", "Show " + items.length),
                ),
              );
              group.append(rest);
            }
            rest.append(card);
          }
          feedbackArea.append(group);
        }
        const nextStep = el("div", "ai-block next-hint");
        nextStep.append(
          el("p", "training-prose", tr("下一步：") + f.suggestedNextStep),
        );
        feedbackArea.append(nextStep);
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
                opinion
                  .querySelectorAll("button")
                  .forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === text)));
                message(status, tr("评价已保存在此浏览器，可随备份导出。"));
              },
              "secondary-action btn-sm",
            ),
          );
        feedbackArea.append(opinion);
        if (!f.gaps.length && !a.revision.length && !stale) {
          const checked = el("section", "training-completion is-calm");
          checked.append(
            el(
              "p",
              "",
              l(
                "本次未发现需要修订的实质问题。不必为了完成而改写答案；这也不代表长期掌握。",
                "No substantive issue was identified. You need not rewrite a sound answer to finish; this does not establish mastery.",
              ),
            ),
          );
          if (a.completedWithoutRevision)
            checked.append(
              el(
                "p",
                "completion-mark",
                l(
                  "本次检查已完成，原答案保留。",
                  "Review complete. Your original answer is retained.",
                ),
              ),
              link(l("返回课程", "Back to course"), courseURL(course.id)),
            );
          else
            checked.append(
              button(
                l("保留原答案，完成本次检查", "Keep my answer & finish review"),
                async () => {
                  try {
                    activeAttempt = await repo.completeUnchanged(a.id);
                    await displayAttempt();
                  } catch (e) {
                    message(status, e.message, true);
                  }
                },
                "primary-action",
              ),
            );
          feedbackArea.append(checked);
        }
        const revision = el("form", "training-form revision-editor"),
          draftKey = "revision-draft:" + a.id;
        revision.id = "revision-editor";
        revision.append(
          voiceLabel("you", l("你的修订稿", "Your revision")),
          el(
            "p",
            "reader-muted",
            l(
              "修订会追加保存，首次答案始终保留。",
              "Revisions are added alongside; your first answer is always kept.",
            ),
          ),
        );
        const savedDraft = await getSetting(draftKey, db);
        const revised = field(
          revision,
          tr("根据反馈修订答案"),
          savedDraft?.answer ?? a.revision.at(-1)?.userAnswer ?? a.userAnswer,
          true,
        );
        revised.rows = 12;
        revised.maxLength = 16000;
        const revisionSaved = saveIndicator();
        const revisionMeta = el("div", "field-meta");
        revisionMeta.append(revisionSaved, charCount(revised, 16000));
        revision.append(revisionMeta);
        const reflection = field(
          revision,
          tr("你本次主要修正了什么？"),
          savedDraft?.reflection || "",
          true,
        );
        reflection.maxLength = 4000;
        reflection.rows = 3;
        for (const input of [revised, reflection])
          input.addEventListener("input", () => {
            const value = {
              answer: revised.value,
              reflection: reflection.value,
            };
            revisionSaved.textContent = l("正在保存…", "Saving…");
            revisionSaved.className = "save-indicator";
            draftQueue = draftQueue
              .catch(() => {})
              .then(() => putSetting(draftKey, value, db));
            draftQueue.then(
              () => {
                if (current())
                  showSaved(
                    revisionSaved,
                    l("修订草稿已保存", "Revision draft saved"),
                  );
              },
              (e) => {
                if (current())
                  showSaved(
                    revisionSaved,
                    tr("修订草稿保存失败：") + e.message,
                    true,
                  );
              },
            );
          });
        formAction(revision, tr("保存修订并完成本次练习"), async () => {
          await draftQueue;
          await repo.revise(a.id, revised.value, reflection.value);
          await putSetting(draftKey, null, db);
          activeAttempt = await repo.get("attempts", a.id);
          await displayAttempt();
          message(status, tr("修订已保存，首次答案保持不变。"));
          feedbackArea
            .querySelector(".training-completion h2")
            ?.scrollIntoView({ block: "start", behavior: "smooth" });
        });
        if (a.revision.length) {
          const completion = el("section", "training-completion");
          const title = el("h2", "", tr("本次修订已完成"));
          const mark = el("span", "completion-icon");
          mark.append(icon("check"));
          completion.append(
            mark,
            title,
            el("p", "", tr("主要修正：") + a.revision.at(-1).reflection),
            el(
              "p",
              "reader-muted",
              tr(
                "仍未验证：修订后的理解尚未通过新的问题检验。几天后可在同一课程创建不同案例的问题再作答。",
              ),
            ),
            link(tr("创建新的问题再检验"), courseURL(course.id)),
          );
          completion.append(diffView(repo, a, a.revision.at(-1)));
          for (const [i, r] of a.revision.entries()) {
            const history = fold(
              tr("修订 ") +
                (i + 1) +
                " · " +
                new Date(r.createdAt).toLocaleString(getLocale()),
            );
            history.append(
              el("p", "training-prose", r.userAnswer),
              el("p", "reader-muted", r.reflection),
            );
            completion.append(history);
          }
          feedbackArea.append(completion);
          await mountGapPanel(feedbackArea, repo, {
            attemptId: a.id,
            register: (fn) => loopCleanups.push(fn),
          });
          const again = fold(l("再次修订", "Revise again"));
          again.classList.add("revision-again");
          again.append(revision);
          feedbackArea.append(again);
        } else {
          if (!f.gaps.length) {
            const optional = fold(
              l(
                "可选：补充或修订答案",
                "Optional: extend or revise your answer",
              ),
            );
            optional.append(revision);
            feedbackArea.append(optional);
          } else {
            const jump = el("a", "primary-action revise-jump", tr("前往修订答案 ↓"));
            jump.href = "#revision-editor";
            overviewJump(jump);
            feedbackArea.append(revision);
          }
          await mountGapPanel(feedbackArea, repo, {
            attemptId: a.id,
            register: (fn) => loopCleanups.push(fn),
          });
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
    function overviewJump(jump) {
      feedbackArea.querySelector(".feedback-overview")?.append(jump);
    }
    if (activeAttempt) {
      await displayAttempt();
      watchFeedback(activeAttempt.id);
    }
    // Hand-off from quick practice: start feedback for a brought-in answer, or focus the answer box.
    const handoff = new URLSearchParams(location.search);
    if (
      handoff.get("run") === "feedback" &&
      activeAttempt &&
      !activeAttempt.feedbackId &&
      !runningJob(feedbackKey(activeAttempt.id))
    )
      runFeedback();
    if (handoff.get("start") === "1") answer?.focus();
    if (handoff.has("run") || handoff.has("start")) {
      handoff.delete("run");
      handoff.delete("start");
      history.replaceState({}, "", location.pathname + (handoff.size ? "?" + handoff : ""));
    }
    if (list.length) {
      const history = fold(tr("历史作答与重新练习"));
      history.append(
        link(tr("独立重答这道题（不展示旧答案）"), taskURL(id, "new"), "quiet-link", "repeat"),
      );
      for (const a of list)
        row(
          history,
          new Date(a.submittedAt).toLocaleString(getLocale()),
          taskURL(id, a.id),
          null,
          statusBadge(a),
        ).classList.toggle("is-current", a.id === activeAttempt?.id);
      aside.append(history);
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
        "quiet-link is-danger",
      ),
    );
    aside.append(edit);
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
  if (path === "/app" || path.startsWith("/app/courses/")) {
    const slot = root.querySelector(".gap-slot");
    await mountGapPanel(slot, repo, {
      courseId: path.startsWith("/app/courses/") ? id : undefined,
      onlyNeeds: true,
      register: (fn) => loopCleanups.push(fn),
    });
  }
  return () => {
    loopCleanups.forEach((fn) => fn());
    unbindLanguage();
    disposed = true;
    // Course task suggestions are page-bound; feedback jobs keep running.
    controller?.abort();
  };
}
