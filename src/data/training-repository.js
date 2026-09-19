import { atomic } from "./learning-repository.js";
import { getAllRecords, getRecord } from "./db.js";
import { makeId } from "../domain/documents.js";
import { sourceSignature } from "../domain/evidence.js";
const now = () => new Date().toISOString();
const required = (v, limit = 8000) => {
  if (typeof v !== "string" || !v.trim() || v.length > limit)
    throw new Error("请填写有效内容，或缩短过长输入。");
  return v.trim();
};
export function event(tx, type, metadata = {}) {
  tx.objectStore("activities").put({
    id: makeId("activity"),
    type,
    ...metadata,
    createdAt: now(),
  });
}
export class TrainingRepository {
  constructor(db) {
    this.db = db;
  }
  list(name) {
    return getAllRecords(name, this.db);
  }
  get(name, id) {
    return getRecord(name, id, this.db);
  }
  track(type, metadata = {}) {
    return atomic(this.db, ["activities"], (_, tx) =>
      event(tx, type, metadata),
    );
  }
  saveCourse(input) {
    return atomic(
      this.db,
      ["courses", "documents", "tasks", "activities"],
      (data, tx) => {
        const old = data.courses.find((c) => c.id === input.id);
        const ids = [...new Set(input.documentIds || [])];
        if (ids.some((id) => !data.documents.some((d) => d.id === id)))
          throw new Error("所选资料已不存在。");
        if (
          old &&
          data.tasks.some(
            (t) =>
              t.courseId === old.id &&
              t.documentIds.some((id) => !ids.includes(id)),
          )
        )
          throw new Error(
            "被任务使用的资料不能直接移出课程，请先调整对应任务材料。",
          );
        const record = {
          id: old?.id || makeId("course"),
          title: required(input.title, 200),
          description: String(input.description || "").slice(0, 4000),
          documentIds: ids,
          taskIds: old?.taskIds || [],
          createdAt: old?.createdAt || now(),
          updatedAt: now(),
        };
        tx.objectStore("courses").put(record);
        if (!old) event(tx, "course_created", { courseId: record.id });
        return record;
      },
    );
  }
  saveTask(input) {
    return atomic(this.db, ["courses", "tasks", "attempts"], (data, tx) => {
      const course = data.courses.find((c) => c.id === input.courseId),
        old = data.tasks.find((t) => t.id === input.id);
      if (!course || (old && old.courseId !== course.id))
        throw new Error("课程不存在或已变化。");
      const ids = [...new Set(input.documentIds || [])];
      if (!ids.length || ids.some((id) => !course.documentIds.includes(id)))
        throw new Error("请至少选择一份课程材料。");
      const task = {
        id: old?.id || makeId("task"),
        courseId: course.id,
        title: required(input.title, 200),
        prompt: required(input.prompt),
        rubric: String(input.rubric || "").slice(0, 8000),
        description: String(input.description || "").slice(0, 4000),
        documentIds: ids,
        createdAt: old?.createdAt || now(),
        updatedAt: now(),
        version: (old?.version || 0) + 1,
        draftAnswer: old?.draftAnswer || "",
      };
      tx.objectStore("tasks").put(task);
      tx.objectStore("courses").put({
        ...course,
        taskIds: [...new Set([...course.taskIds, task.id])],
        updatedAt: now(),
      });
      return task;
    });
  }
  removeCourse(id) {
    return atomic(
      this.db,
      ["courses", "tasks", "attempts", "feedback"],
      (data, tx) => {
        const attempts = data.attempts.filter((a) => a.courseId === id);
        for (const a of attempts) tx.objectStore("attempts").delete(a.id);
        for (const f of data.feedback)
          if (attempts.some((a) => a.id === f.attemptId))
            tx.objectStore("feedback").delete(f.id);
        for (const t of data.tasks)
          if (t.courseId === id) tx.objectStore("tasks").delete(t.id);
        tx.objectStore("courses").delete(id);
        // Documents, reading, graph and their anchors are deliberately untouched.
      },
    );
  }
  removeTask(id) {
    return atomic(
      this.db,
      ["courses", "tasks", "attempts", "feedback"],
      (data, tx) => {
        const task = data.tasks.find((t) => t.id === id);
        if (!task) return;
        const course = data.courses.find((c) => c.id === task.courseId);
        if (course)
          tx.objectStore("courses").put({
            ...course,
            taskIds: course.taskIds.filter((v) => v !== id),
            updatedAt: now(),
          });
        const attempts = data.attempts.filter((a) => a.taskId === id);
        for (const a of attempts) tx.objectStore("attempts").delete(a.id);
        for (const f of data.feedback)
          if (attempts.some((a) => a.id === f.attemptId))
            tx.objectStore("feedback").delete(f.id);
        tx.objectStore("tasks").delete(id);
      },
    );
  }
  saveDraft(taskId, answer) {
    return atomic(this.db, ["tasks", "activities"], (data, tx) => {
      const task = data.tasks.find((t) => t.id === taskId);
      if (!task) throw new Error("任务已不存在。");
      if (answer.length > 16000) throw new Error("答案最多 16,000 字符。");
      if (!task.draftAnswer && answer) event(tx, "attempt_started", { taskId });
      tx.objectStore("tasks").put({ ...task, draftAnswer: answer });
    });
  }
  submit(taskId, answer) {
    return atomic(this.db, ["tasks", "attempts", "activities"], (data, tx) => {
      const task = data.tasks.find((t) => t.id === taskId);
      if (!task) throw new Error("任务已不存在。");
      const attempt = {
        id: makeId("attempt"),
        taskId,
        courseId: task.courseId,
        userAnswer: required(answer, 16000),
        submittedAt: now(),
        status: "submitted",
        taskSnapshot: structuredClone(task),
        revision: [],
        feedbackId: null,
        activeRequestId: null,
      };
      delete attempt.taskSnapshot.draftAnswer;
      tx.objectStore("attempts").put(attempt);
      tx.objectStore("tasks").put({ ...task, draftAnswer: "" });
      event(tx, "attempt_submitted", {
        taskId,
        attemptId: attempt.id,
        courseId: task.courseId,
      });
      return attempt;
    });
  }
  begin(attemptId, requestId) {
    return atomic(this.db, ["attempts"], (data, tx) => {
      const a = data.attempts.find((a) => a.id === attemptId);
      if (!a) throw new Error("作答记录不存在。");
      tx.objectStore("attempts").put({ ...a, activeRequestId: requestId });
    });
  }
  cancel(attemptId, requestId) {
    return atomic(this.db, ["attempts"], (data, tx) => {
      const a = data.attempts.find((a) => a.id === attemptId);
      if (a?.activeRequestId === requestId)
        tx.objectStore("attempts").put({ ...a, activeRequestId: null });
    });
  }
  commit(attemptId, requestId, context, payload, signal) {
    return atomic(
      this.db,
      [
        "attempts",
        "tasks",
        "documents",
        "feedback",
        "evidenceAnchors",
        "activities",
      ],
      (data, tx) => {
        signal?.throwIfAborted();
        const a = data.attempts.find((a) => a.id === attemptId),
          task = data.tasks.find((t) => t.id === a?.taskId);
        if (
          !a ||
          a.activeRequestId !== requestId ||
          !task ||
          task.version !== context.task.version
        )
          throw new Error("任务或请求已变化，本次反馈未覆盖已有结果。");
        for (const s of context.snapshots) {
          const d = data.documents.find((d) => d.id === s.documentId);
          if (!d || sourceSignature(d) !== s.signature)
            throw new Error("课程材料版本已变化，请重新获取反馈。");
        }
        tx.objectStore("feedback").put({ ...payload.feedback, attemptId });
        for (const anchor of payload.anchors)
          tx.objectStore("evidenceAnchors").put(anchor);
        tx.objectStore("attempts").put({
          ...a,
          feedbackId: payload.feedback.id,
          activeRequestId: null,
          status: a.revision.length ? "completed" : "reviewed",
        });
        event(tx, "feedback_generated", { attemptId, taskId: a.taskId });
      },
      signal,
    );
  }
  revise(id, answer, reflection) {
    return atomic(
      this.db,
      ["attempts", "feedback", "activities"],
      (data, tx) => {
        const a = data.attempts.find((a) => a.id === id);
        if (!a?.feedbackId || !data.feedback.some((f) => f.id === a.feedbackId))
          throw new Error("请先获取反馈。");
        const revised = required(answer, 16000),
          previous = a.revision.at(-1)?.userAnswer || a.userAnswer;
        if (revised === previous)
          throw new Error("答案尚未修改，请先根据反馈修订。");
        const revision = {
          id: makeId("revision"),
          userAnswer: revised,
          reflection: required(reflection, 4000),
          createdAt: now(),
          feedbackId: a.feedbackId,
          verification: "unverified",
        };
        tx.objectStore("attempts").put({
          ...a,
          status: "completed",
          revision: [...a.revision, revision],
        });
        event(tx, "revision_saved", { attemptId: id, taskId: a.taskId });
        if (!a.revision.length)
          event(tx, "task_completed", {
            attemptId: id,
            taskId: a.taskId,
            activationCandidate: true,
          });
        return revision;
      },
    );
  }
}
