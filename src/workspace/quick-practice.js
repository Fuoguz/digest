// "Practise one question": material + question (+ optional existing answer) → answering.
// Course and task are created with defaults so the student never fills in forms first.
import { el, button, message, icon } from "./components.js";
import { getLocale, t as tr } from "./i18n.js";
import { extractFile, ACCEPTED_FILES } from "../importers/index.js";
import { createDocument, makeId } from "../domain/documents.js";
import { atomic } from "../data/learning-repository.js";
import { getSetting, putSetting } from "../data/db.js";
import { prepareFeedbackContext } from "../domain/training.js";
import { suggestTasks } from "../ai/task-suggestions.js";
import { ocrOffer } from "./ocr-offer.js";
import { createTransport } from "../ai/proxy-transport.js";

const l = (zh, en) => (getLocale() === "en" ? en : zh);
const QUICK_COURSE = "quick-practice-course";
const taskURL = (id, attempt, extra = "") =>
  "/app/tasks/" +
  encodeURIComponent(id) +
  (attempt ? "?attempt=" + encodeURIComponent(attempt) + extra : extra ? "?" + extra.slice(1) : "");

export function quickPractice({ repo, db, docs, compact = false, register = () => {} }) {
  let material = null, // { doc, saved }
    controller = null;
  const box = el("section", "quick-practice" + (compact ? " is-compact" : ""));
  box.setAttribute("aria-labelledby", "quick-title");
  const head = el("div", "quick-head");
  const title = el("h2", "", l("练一道题", "Practise one question"));
  title.id = "quick-title";
  head.append(
    title,
    el(
      "p",
      "",
      l(
        "放入材料和题目，先自己作答，再看哪里没答清楚。不用先建课程或填表。",
        "Add material and a question, answer it yourself, then see what you missed. No setup first.",
      ),
    ),
  );
  box.append(head);

  // 1 · Material
  const step1 = el("div", "quick-step");
  step1.append(el("p", "quick-step-label", l("1 · 材料", "1 · Material")));
  const picker = el("div", "quick-material");
  const fileLabel = el("label", "secondary-action quick-file");
  fileLabel.append(icon("upload"), el("span", "", l("选择文件", "Choose a file")));
  const file = el("input");
  file.type = "file";
  file.accept = ACCEPTED_FILES;
  file.className = "visually-hidden";
  file.setAttribute("aria-label", l("选择材料文件", "Choose a material file"));
  fileLabel.append(file);
  picker.append(fileLabel);
  let library = null;
  if (docs.length) {
    library = el("select", "core-input quick-library");
    library.setAttribute("aria-label", l("从资料库选择材料", "Pick material from your library"));
    const none = el("option", "", l("或从资料库选择…", "Or pick from your library…"));
    none.value = "";
    library.append(none);
    for (const d of docs.slice(0, 80)) {
      const o = el("option", "", d.title.length > 40 ? d.title.slice(0, 40) + "…" : d.title);
      o.value = d.id;
      library.append(o);
    }
    picker.append(library);
  }
  const paste = el("details", "quick-paste");
  paste.append(el("summary", "", l("粘贴文字", "Paste text")));
  const pasteText = el("textarea", "core-input");
  pasteText.rows = 5;
  pasteText.setAttribute("aria-label", l("粘贴材料文字", "Paste material text"));
  pasteText.placeholder = l("粘贴课程资料、讲义或文章…", "Paste course notes, slides text or an article…");
  paste.append(pasteText);
  const chosen = el("p", "quick-chosen");
  chosen.setAttribute("role", "status");
  step1.append(picker, paste, chosen);
  box.append(step1);

  // 2 · Question
  const step2 = el("div", "quick-step");
  step2.append(el("p", "quick-step-label", l("2 · 题目", "2 · Question")));
  const question = el("textarea", "core-input quick-question");
  question.rows = 3;
  question.maxLength = 8000;
  question.setAttribute("aria-label", l("题目", "Question"));
  question.placeholder = l(
    "粘贴作业题、考试题，或你自己想弄清楚的问题",
    "Paste an assignment or exam question, or one you want to work out",
  );
  const suggest = button(l("没有题目？让 AI 根据材料推荐", "No question? Let AI suggest some"), runSuggest, "quiet-link");
  suggest.prepend(icon("ai"));
  const suggestions = el("div", "quick-suggestions");
  const suggestStatus = el("p");
  step2.append(question, suggest, suggestStatus, suggestions);
  box.append(step2);

  // 3 · Optional existing answer
  const step3 = el("details", "quick-answer");
  step3.append(el("summary", "", l("我已经写好了答案（可选）", "I already have an answer (optional)")));
  const answer = el("textarea", "core-input");
  answer.rows = 6;
  answer.maxLength = 16000;
  answer.setAttribute("aria-label", l("我的答案", "My answer"));
  step3.append(answer);
  box.append(step3);

  const status = el("p");
  const start = button("", startPractice, "primary-action quick-start");
  const footer = el("div", "quick-footer");
  footer.append(
    start,
    el(
      "p",
      "reader-muted",
      l(
        "会自动保存在「快速练习」课程里，之后可以改名整理。材料只在你的浏览器里保存。",
        "Saved automatically under “Quick practice”; rename or organise later. Material stays in your browser.",
      ),
    ),
  );
  box.append(status, footer);

  function updateStart() {
    const hasAnswer = answer.value.trim().length > 0;
    start.replaceChildren(
      document.createTextNode(
        hasAnswer ? l("提交答案，获取反馈", "Submit answer & get feedback") : l("开始作答", "Start answering"),
      ),
      icon("arrowRight"),
    );
  }
  answer.addEventListener("input", updateStart);
  updateStart();

  function setMaterial(doc, saved) {
    material = doc ? { doc, saved } : null;
    chosen.replaceChildren();
    chosen.classList.toggle("is-ready", !!doc);
    if (!doc) return;
    chosen.append(
      icon("check"),
      document.createTextNode(
        doc.title +
          " · " +
          doc.paragraphs.length +
          l(" 段", " paragraphs") +
          (doc.metadata?.chapters?.length ? " · " + doc.metadata.chapters.length + l(" 章", " chapters") : ""),
      ),
    );
  }
  file.addEventListener("change", async () => {
    const f = file.files[0];
    if (!f) return;
    box.querySelector(".ocr-offer")?.remove();
    message(status, l("正在读取 ", "Reading ") + f.name + "…", false, true);
    try {
      const result = await extractFile(f);
      setMaterial(createDocument({ ...result, readingMode: "general" }), false);
      if (library) library.value = "";
      status.textContent = "";
      status.className = "";
    } catch (e) {
      setMaterial(null);
      message(status, e.message || l("文件读取失败。", "Could not read the file."), true);
      if (e.code === "no_text") {
        const offer = ocrOffer(f, e.pageCount, {
          register,
          onResult: (result) => {
            setMaterial(createDocument({ ...result, readingMode: "general" }), false);
            status.textContent = "";
            status.className = "";
          },
        });
        chosen.after(offer);
      }
    }
  });
  library?.addEventListener("change", () => {
    const doc = docs.find((d) => d.id === library.value);
    setMaterial(doc || null, true);
  });
  pasteText.addEventListener("change", () => {
    const text = pasteText.value.trim();
    if (!text) return;
    const firstLine = text.split("\n")[0].slice(0, 40);
    setMaterial(
      createDocument({ sourceType: "text", rawContent: text, title: firstLine, metadata: { inputMethod: "paste" } }),
      false,
    );
    if (library) library.value = "";
  });

  async function runSuggest() {
    if (controller) return;
    if (!material) {
      message(suggestStatus, l("先放入材料，AI 才能根据它出题。", "Add material first so suggestions are based on it."), true);
      return;
    }
    controller = new AbortController();
    const local = controller;
    register(() => local.abort());
    suggest.disabled = true;
    const cancel = button(l("取消", "Cancel"), () => local.abort(), "quiet-link");
    suggestions.replaceChildren();
    message(suggestStatus, l("正在根据材料出题…", "Suggesting questions from the material…"), false, true);
    suggestStatus.after(cancel);
    try {
      const doc = material.doc;
      const context = await prepareFeedbackContext(
        { documentIds: [doc.id], prompt: "Explain compare apply critique" },
        { title: doc.title, description: "" },
        [doc],
        "Practice task suggestions",
      );
      context.outputLanguage = getLocale();
      const candidates = await suggestTasks(context, createTransport("digest"), local.signal);
      if (!box.isConnected) return;
      message(
        suggestStatus,
        candidates.length
          ? l("选一道直接开始，或把它改成你想问的。", "Pick one to start, or edit it into your own question.")
          : l("材料不足以出可靠的题目，请直接写下你的问题。", "Not enough material for reliable questions. Write your own."),
      );
      for (const c of candidates) {
        const card = el("article", "suggested-task");
        const go = button(l("练这道", "Practise this"), () => {
          question.value = c.prompt;
          startPractice(c.title);
        }, "primary-action btn-sm");
        const edit = button(l("改一改再练", "Edit first"), () => {
          question.value = c.prompt;
          question.focus();
        }, "secondary-action btn-sm");
        const row = el("div", "suggested-actions");
        row.append(go, edit);
        card.append(el("h3", "", c.title), el("p", "", c.prompt), row);
        suggestions.append(card);
      }
    } catch (e) {
      if (box.isConnected)
        message(
          suggestStatus,
          e.name === "AbortError" ? l("已取消。", "Cancelled.") : e.message,
          e.name !== "AbortError",
        );
    } finally {
      controller = null;
      suggest.disabled = false;
      cancel.remove();
    }
  }

  async function quickCourse(docId) {
    const savedId = (await getSetting(QUICK_COURSE, db))?.id;
    let course = savedId ? await repo.get("courses", savedId) : null;
    if (!course) {
      course = await repo.saveCourse({
        title: l("快速练习", "Quick practice"),
        description: l(
          "从首页直接练习的题目放在这里，可以随时改名或整理到其他课程。",
          "Questions practised from the home page. Rename or reorganise any time.",
        ),
        documentIds: [docId],
      });
      await putSetting(QUICK_COURSE, { id: course.id }, db);
      return course;
    }
    if (!course.documentIds.includes(docId))
      course = await repo.saveCourse({ ...course, documentIds: [...course.documentIds, docId] });
    return course;
  }

  async function startPractice(suggestedTitle) {
    if (start.disabled) return;
    const prompt = question.value.trim();
    if (!material) {
      message(status, l("先放入一份材料：反馈需要对照它来核查。", "Add material first: feedback is checked against it."), true);
      return;
    }
    if (!prompt) {
      message(status, l("写下或选择一道题目。", "Write or pick a question."), true);
      question.focus();
      return;
    }
    start.disabled = true;
    start.setAttribute("aria-busy", "true");
    message(status, l("正在保存…", "Saving…"), false, true);
    try {
      const doc = material.doc;
      if (!material.saved) {
        await atomic(db, ["documents", "activities"], (_, tx) => {
          tx.objectStore("documents").put(doc);
          tx.objectStore("activities").put({
            id: makeId("activity"),
            type: "document_imported",
            documentId: doc.id,
            createdAt: new Date().toISOString(),
          });
        });
        material.saved = true;
      }
      const course = await quickCourse(doc.id);
      const titleText = (typeof suggestedTitle === "string" && suggestedTitle) || prompt.split("\n")[0];
      const task = await repo.saveTask({
        courseId: course.id,
        title: titleText.length > 40 ? titleText.slice(0, 40) + "…" : titleText,
        prompt,
        rubric: "",
        documentIds: [doc.id],
      });
      const written = answer.value.trim();
      if (written) {
        // Check limits first; the first answer is then saved before any AI request.
        await prepareFeedbackContext(task, course, [doc], written);
        const attempt = await repo.submit(task.id, written);
        location.assign(taskURL(task.id, attempt.id, "&run=feedback"));
      } else location.assign(taskURL(task.id, null, "&start=1"));
    } catch (e) {
      message(status, e.message, true);
      start.disabled = false;
      start.removeAttribute("aria-busy");
    }
  }
  return box;
}
