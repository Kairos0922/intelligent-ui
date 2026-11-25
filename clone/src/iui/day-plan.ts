import { h } from "./dom";
import { defineBlock, type Ctx } from "./registry";
import { safeText } from "./security";
import { isInstant, isValidTimeZone, type ContractIssue, isPlainObject } from "./contracts";

export const DAY_PLAN_TASK_STATUSES = ["pending", "done", "overdue", "cancelled"] as const;
export type DayPlanTaskStatus = (typeof DAY_PLAN_TASK_STATUSES)[number];
export const DAY_PLAN_RECURRENCES = ["once", "daily", "weekdays"] as const;
export type DayPlanRecurrence = (typeof DAY_PLAN_RECURRENCES)[number];

function isDayPlanTaskStatus(value: unknown): value is DayPlanTaskStatus {
  return typeof value === "string" && (DAY_PLAN_TASK_STATUSES as readonly string[]).includes(value);
}

function isDayPlanRecurrence(value: unknown): value is DayPlanRecurrence {
  return typeof value === "string" && (DAY_PLAN_RECURRENCES as readonly string[]).includes(value);
}

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
  pii?: DayPlanPii;
  userFacts?: string[];
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

export interface DayPlanPii {
  holderName?: string;
  userId?: string;
  expiresAt?: string;
}

/** Host-side Day plan integration contract. User/host state wins on conflicts. */
export interface DayPlanHost {
  getTasks(): DayPlanTask[];
  setTasks(tasks: DayPlanTask[]): void;
  openTask(id: string): void;
  completeTask(id: string): void;
  openCalendar(range?: { start?: string; end?: string; reminderAt?: string }): void;
  setReminder(taskId: string, reminderAt?: string): void;
  requestNotification(taskId: string): void;
  reportConflict(taskId: string, reason?: string): void;
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

function dayIssue(list: ContractIssue[], path: string, message: string, code: string): void {
  if (list.length < 60) list.push({ path, message, code });
}

function requiredDayText(value: unknown, path: string, list: ContractIssue[], max = 120): string | null {
  const s = typeof value === "string" ? safeText(value, max).trim() : "";
  if (!s) {
    dayIssue(list, path, `${path} must be a non-empty string`, "invalid_day_plan");
    return null;
  }
  return s;
}

function optionalDayText(value: unknown, path: string, list: ContractIssue[], max = 120): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredDayText(value, path, list, max) ?? undefined;
}

function dayInstant(value: unknown, path: string, list: ContractIssue[]): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isInstant(value)) {
    dayIssue(list, path, `${path} must be an RFC 3339 instant`, "invalid_day_plan");
    return undefined;
  }
  return value;
}

function dayZone(value: unknown, path: string, list: ContractIssue[]): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isValidTimeZone(value)) {
    dayIssue(list, path, `${path} must be an IANA time zone`, "invalid_day_plan");
    return undefined;
  }
  return value;
}

function dayStatus(value: unknown, path: string, list: ContractIssue[]): DayPlanTaskStatus | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isDayPlanTaskStatus(value)) {
    dayIssue(list, path, `${path} must be pending, done, overdue, or cancelled`, "invalid_day_plan");
    return "pending";
  }
  return value;
}

function dayRecurrence(value: unknown, path: string, list: ContractIssue[]): DayPlanRecurrence | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isDayPlanRecurrence(value)) {
    dayIssue(list, path, `${path} must be once, daily, or weekdays`, "invalid_day_plan");
    return "once";
  }
  return value;
}

export interface DayPlanTaskFilter {
  status?: DayPlanTaskStatus;
  priority?: 0 | 1 | 2 | 3;
  search?: string;
  limit?: number;
}

/** Large-data helper: filter and limit a task list for rendering. */
export function filterDayPlanTasks(tasks: DayPlanTask[], filter: DayPlanTaskFilter = {}, defaultLimit = 20): DayPlanTask[] {
  const needle = typeof filter.search === "string" ? filter.search.toLowerCase().trim() : "";
  const limit = Math.max(0, Math.min(filter.limit ?? defaultLimit, 500));
  const out: DayPlanTask[] = [];
  for (const task of tasks) {
    if (filter.status !== undefined && task.status !== filter.status) continue;
    if (typeof filter.priority !== "number" && filter.priority !== undefined) continue;
    if (filter.priority !== undefined && task.priority !== filter.priority) continue;
    if (needle) {
      const title = text(task.title, "").toLowerCase();
      const description = (task.description ?? "").toLowerCase();
      if (!title.includes(needle) && !description.includes(needle)) continue;
    }
    out.push(task);
    if (out.length >= limit) break;
  }
  return out;
}

export function validateDayListPayload(input: unknown, path = "dayPlan"): {
  payload: TaskListPayload | null;
  issues: ContractIssue[];
} {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    dayIssue(issues, path, `${path} must be an object`, "invalid_day_plan");
    return { payload: null, issues };
  }
  if (input.kind !== "day-plan") dayIssue(issues, `${path}.kind`, "kind must be day-plan", "invalid_day_plan");
  if (input.version !== "1.0") dayIssue(issues, `${path}.version`, "version must be 1.0", "invalid_day_plan");
  const hostTimeZone = dayZone(input.hostTimeZone, `${path}.hostTimeZone`, issues);
  const rawTasks = input.tasks;
  if (!Array.isArray(rawTasks)) {
    dayIssue(issues, `${path}.tasks`, "tasks must be an array", "invalid_day_plan");
    return { payload: null, issues };
  }
  const tasks: DayPlanTask[] = [];
  rawTasks.slice(0, 20).forEach((raw, index) => {
    const base = `${path}.tasks[${index}]`;
    if (!isPlainObject(raw)) {
      dayIssue(issues, base, "task must be an object", "invalid_day_plan");
      return;
    }
    const id = requiredDayText(raw.id, `${base}.id`, issues, 120);
    const title = requiredDayText(raw.title, `${base}.title`, issues, 120);
    if (!id || !title) return;
    const status = dayStatus(raw.status, `${base}.status`, issues);
    const deadlineAt = dayInstant(raw.deadlineAt, `${base}.deadlineAt`, issues);
    const reminderAt = dayInstant(raw.reminderAt, `${base}.reminderAt`, issues);
    const completedAt = dayInstant(raw.completedAt, `${base}.completedAt`, issues);
    const recurrence = dayRecurrence(raw.recurrence, `${base}.recurrence`, issues);
    const description = optionalDayText(raw.description, `${base}.description`, issues, 500);
    const priority =
      typeof raw.priority === "number" && [0, 1, 2, 3].includes(raw.priority)
        ? raw.priority as 0 | 1 | 2 | 3
        : undefined;
    if (raw.priority !== undefined && priority === undefined) {
      dayIssue(issues, `${base}.priority`, "priority must be 0, 1, 2, or 3", "invalid_day_plan");
    }
    tasks.push({
      id,
      title,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(deadlineAt ? { deadlineAt } : {}),
      ...(reminderAt ? { reminderAt } : {}),
      ...(recurrence ? { recurrence } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(description ? { description } : {}),
      ...(Array.isArray(raw.userFacts)
        ? {
            userFacts: raw.userFacts
              .slice(0, 5)
              .map((fact) => safeText(fact, 200).trim())
              .filter(Boolean),
          }
        : {}),
      ...(isPlainObject(raw.pii) ? { pii: { ...(raw.pii as DayPlanPii) } } : {}),
    });
  });
  const payload: TaskListPayload | null =
    issues.length && tasks.length === 0
      ? null
      : { kind: "day-plan", version: "1.0", tasks, ...(hostTimeZone ? { hostTimeZone } : {}) };
  return { payload, issues };
}

export function validateDayReminderPayload(
  input: unknown,
  path = "reminder",
): { payload: DayReminder | null; issues: ContractIssue[] } {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    dayIssue(issues, path, `${path} must be an object`, "invalid_day_plan");
    return { payload: null, issues };
  }
  const taskId = requiredDayText(input.taskId, `${path}.taskId`, issues, 160);
  const title = requiredDayText(input.title, `${path}.title`, issues, 120);
  const reminderAt = dayInstant(input.reminderAt, `${path}.reminderAt`, issues);
  const note = optionalDayText(input.note, `${path}.note`, issues, 300);
  const payload =
    taskId && title && reminderAt
      ? { taskId, title, reminderAt, ...(note ? { note } : {}) }
      : null;
  return { payload, issues };
}

export function redactDayPlanPii(task: DayPlanTask, redactedValue = "[redacted]"): DayPlanTask {
  if (!task.pii) return task;
  const pii: DayPlanPii = {};
  if (task.pii.holderName !== undefined) pii.holderName = redactedValue;
  if (task.pii.userId !== undefined) pii.userId = redactedValue;
  if (task.pii.expiresAt !== undefined) pii.expiresAt = task.pii.expiresAt;
  return { ...task, pii };
}

export function clearExpiredDayPlanPii(tasks: DayPlanTask[], now = Date.now()): DayPlanTask[] {
  return tasks.map((task) => {
    if (!task.pii?.expiresAt) return task;
    return new Date(task.pii.expiresAt).getTime() <= now ? { ...task, pii: undefined } : task;
  });
}

function parseDayPlanIso(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

export function reconcileDayPlanTask(task: DayPlanTask, now = Date.now()): DayPlanTask {
  if (task.status === "done" || task.status === "cancelled") return task;
  const deadline = parseDayPlanIso(task.deadlineAt);
  const status = deadline !== undefined && now >= deadline ? "overdue" : (task.status ?? "pending");
  return status === task.status ? task : { ...task, status };
}

export function reconcileDayPlanTasks(tasks: DayPlanTask[], now = Date.now()): DayPlanTask[] {
  return tasks
    .map((task) => reconcileDayPlanTask(task, now))
    .sort((a, b) => {
      const rank = (task: DayPlanTask) => {
        if (task.status === "overdue") return 0;
        const deadline = parseDayPlanIso(task.deadlineAt);
        if (deadline === undefined) return 3;
        if (deadline - now <= 0) return 1;
        return 2;
      };
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const deadlineA = parseDayPlanIso(a.deadlineAt) ?? Number.MAX_SAFE_INTEGER;
      const deadlineB = parseDayPlanIso(b.deadlineAt) ?? Number.MAX_SAFE_INTEGER;
      if (deadlineA !== deadlineB) return deadlineA - deadlineB;
      return a.id.localeCompare(b.id);
    });
}

defineBlock("taskList", (el, props: { payload?: TaskListPayload }, ctx: Ctx) => {
  const payload = props.payload;
  if (!payload || payload.kind !== "day-plan" || !Array.isArray(payload.tasks)) {
    el.append(h("div", { class: "iui-muted", text: "Day plan data is unavailable." }));
    return;
  }

  const root = h("article", {
    class: "iui-card iui-day-plan",
    role: "region",
    "aria-label": "Day plan tasks",
    "data-testid": "task-list",
  });
  root.append(h("h2", { class: "iui-card-title", text: "Today" }));

  const tasks = filterDayPlanTasks(payload.tasks);
  if (!tasks.length) {
    root.append(h("div", { class: "iui-muted", text: "No tasks yet." }));
  }

  for (const task of tasks) {
    const id = text(task.id) || text(task.title, "task") || "task";
    const title = text(task.title, id);
    const status = task.status ?? "pending";
    const statusBadge = h("div", {
      class: `iui-day-plan-status iui-day-plan-status--${status === "done" ? "ok" : status === "overdue" ? "warning" : status === "cancelled" ? "muted" : "ok"}`,
      role: "status",
      text: statusText(status),
    });
    const row = h("div", {
      class: "iui-day-plan-task",
      role: "group",
      "aria-label": title,
      "aria-roledescription": "Day plan task",
      tabindex: 0,
      "data-testid": id,
    });
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
  const root = h("article", {
    class: "iui-card iui-day-plan-reminder",
    role: "status",
    "aria-live": "polite",
    "aria-label": text(reminder?.title, "Day reminder"),
    tabindex: 0,
    "data-testid": "day-reminder",
  });
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
