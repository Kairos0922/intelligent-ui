import { h } from "./dom";
import { defineBlock, type Ctx } from "./registry";
import { safeText } from "./security";

export type DayPlanTaskStatus = "pending" | "done" | "overdue" | "cancelled";
export type DayPlanRecurrence = "once" | "daily" | "weekdays";

export interface DayPlanTask {
  id: string;
  title: string;
  description?: string;
  status?: DayPlanTaskStatus;
  priority?: 0 | 1 | 2 | 3;
  deadlineAt?: string;
  reminderAt?: string;
  recurrence?: DayPlanRecurrence;
  completedAt?: string;
}

export interface TaskListPayload {
  kind: "day-plan";
  version: "1.0";
  hostTimeZone?: string;
  tasks: DayPlanTask[];
}

export interface DayReminder {
  taskId: string;
  title: string;
  reminderAt: string;
  note?: string;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? safeText(value, 120).trim() : fallback;
}

function formatWhen(value: unknown, ctx: Ctx): string {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(ctx.locale ?? "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: false,
      timeZone: ctx.timeZone,
    }).format(date);
  } catch {
    return raw;
  }
}

function statusText(status: DayPlanTaskStatus): string {
  if (status === "done") return "Done";
  if (status === "overdue") return "Overdue";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

defineBlock("taskList", (el, props: { payload?: TaskListPayload }, ctx: Ctx) => {
  const payload = props.payload;
  if (!payload || payload.kind !== "day-plan" || !Array.isArray(payload.tasks)) {
    el.append(h("div", { class: "iui-muted", text: "Day plan data is unavailable." }));
    return;
  }

  const root = h("article", { class: "iui-card iui-day-plan", "data-testid": "task-list" });
  root.append(h("h2", { class: "iui-card-title", text: "Today" }));

  const tasks = payload.tasks.slice(0, 20);
  if (!tasks.length) {
    root.append(h("div", { class: "iui-muted", text: "No tasks yet." }));
  }

  for (const task of tasks) {
    const id = text(task.id) || text(task.title, "task") || "task";
    const title = text(task.title, id);
    const status = task.status ?? "pending";
    const statusBadge = h("div", {
      class: `iui-day-plan-status iui-day-plan-status--${status === "done" ? "ok" : status === "overdue" ? "warning" : status === "cancelled" ? "muted" : "ok"}`,
      text: statusText(status),
    });
    const row = h("div", { class: "iui-day-plan-task", "data-testid": `task-${id}` });
    row.append(h("div", { class: "iui-day-plan-task__title", text: title }), statusBadge);
    const meta = h("div", { class: "iui-day-plan-task__meta" });
    const deadline = formatWhen(task.deadlineAt, ctx);
    const reminder = formatWhen(task.reminderAt, ctx);
    if (deadline) meta.append(h("span", { text: `Due ${deadline}` }));
    if (reminder) meta.append(h("span", { text: `Reminder ${reminder}` }));
    if (task.description) meta.append(h("span", { text: task.description }));
    row.append(meta);
    root.append(row);

    const buttons = h("div", { class: "iui-day-plan-actions" });
    if (status === "pending" || status === "overdue") {
      buttons.append(
        h("button", {
          type: "button",
          class: "iui-pass-button iui-pass-button--secondary",
          "aria-label": `Complete ${title}`,
          "data-testid": `complete-${id}`,
          onclick: () => ctx.emit?.("complete_task", { taskId: id }),
        }, "Complete"),
        h("button", {
          type: "button",
          class: "iui-pass-button iui-pass-button--secondary",
          "aria-label": `Open ${title}`,
          "data-testid": `open-${id}`,
          onclick: () => ctx.emit?.("show_task", { taskId: id }),
        }, "Open"),
      );
    }
    row.append(buttons);
  }

  el.append(root);
});

defineBlock("reminder", (el, props: { reminder?: DayReminder }, ctx: Ctx) => {
  const reminder = props.reminder;
  const taskId = text(reminder?.taskId) || text(reminder?.title, "task") || "task";
  const title = text(reminder?.title, taskId);
  const when = formatWhen(reminder?.reminderAt, ctx);
  const root = h("article", { class: "iui-card iui-day-plan-reminder", "data-testid": "day-reminder" });
  root.append(h("h2", { class: "iui-card-title", text: "Day reminder" }));
  root.append(h("div", { class: "iui-day-plan-reminder__title", text: title }));
  if (when) root.append(h("div", { class: "iui-day-plan-reminder__time", text: `Reminder at ${when}` }));
  if (reminder?.note) root.append(h("div", { class: "iui-muted", text: reminder.note }));
  const actions = h("div", { class: "iui-day-plan-reminder__actions" });
  const push = (label: string, testId: string, name: "show_task" | "open_calendar" | "set_reminder" | "request_notification", args: Record<string, unknown>) =>
    actions.append(h("button", {
      type: "button",
      class: "iui-pass-button iui-pass-button--secondary",
      "aria-label": label,
      "data-testid": testId,
      onclick: () => ctx.emit?.(name, args),
    }, label));
  push("Open task", `day-reminder-open-${taskId}`, "show_task", { taskId });
  push("Open calendar", `day-reminder-calendar-${taskId}`, "open_calendar", { reminderAt: reminder?.reminderAt });
  push("Set reminder", `day-reminder-set-${taskId}`, "set_reminder", { taskId, reminderAt: reminder?.reminderAt });
  push("Notify", `day-reminder-notify-${taskId}`, "request_notification", { taskId });
  root.append(actions);
  el.append(root);
});
