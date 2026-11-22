import type { DayPlanHost, DayPlanTask } from "@intelligent-ui/core";

export type DayPlanPatchKind = "user" | "model" | "derived";

export interface DayPlanStorage {
  getTasks(): DayPlanTask[];
  setTasks(tasks: DayPlanTask[]): void;
}

export type DayPlanTaskPatch = { id: string } & Partial<Omit<DayPlanTask, "id">>;
export type DayPlanOfflinePatch = DayPlanTaskPatch & { sequence?: number };

function notify(name: string, detail: Record<string, unknown>): void {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function parseTasks(raw: string | null): DayPlanTask[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (task): task is DayPlanTask =>
        Boolean(task) &&
        typeof task === "object" &&
        typeof (task as DayPlanTask).id === "string" &&
        typeof (task as DayPlanTask).title === "string" &&
        (task as DayPlanTask).status !== undefined,
    );
  } catch {
    return [];
  }
}

export function createLocalStorageDayPlanStorage(
  key = "iui-dsh-day-plan",
): DayPlanStorage {
  let fallback: DayPlanTask[] = [];
  const browserStorage = (): Storage | null =>
    typeof window === "undefined" || !window.localStorage ? null : window.localStorage;
  return {
    getTasks(): DayPlanTask[] {
      const storage = browserStorage();
      if (!storage) return fallback;
      const tasks = parseTasks(storage.getItem(key));
      fallback = tasks;
      return tasks;
    },
    setTasks(tasks: DayPlanTask[]): void {
      fallback = tasks;
      const storage = browserStorage();
      if (storage) storage.setItem(key, JSON.stringify(tasks));
    },
  };
}

export function createMemoryDayPlanStorage(initial: DayPlanTask[] = []): DayPlanStorage {
  let tasks = initial;
  return {
    getTasks: () => tasks,
    setTasks: (next) => {
      tasks = next;
    },
  };
}

/**
 * Apply a Day plan task patch. User patches win; model/derived patches do not
 * resurrect a user-completed task and do not override explicit user fields.
 */
export function applyDayPlanPatch(
  current: DayPlanTask,
  patch: DayPlanTaskPatch,
  kind: DayPlanPatchKind,
): DayPlanTask {
  const merged: DayPlanTask = { ...current, ...patch };
  if (current.status === "done" && (kind === "model" || kind === "derived")) {
    merged.status = "done";
  }
  if (kind === "user") {
    merged.status = patch.status ?? current.status ?? "pending";
    if (merged.status === "done" && !merged.completedAt) {
      merged.completedAt = patch.completedAt ?? new Date().toISOString();
    }
  }
  return merged;
}

/** Apply queued user patches to a task list; new tasks are appended. */
export function applyOfflineQueue(
  current: DayPlanTask[],
  queued: DayPlanOfflinePatch[],
  kind: DayPlanPatchKind = "model",
): DayPlanTask[] {
  const tasks = [...current];
  const ordered = [...queued].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  for (const patch of ordered) {
    const base = tasks.find((task) => task.id === patch.id);
    if (!base) {
      tasks.push({
        id: patch.id,
        title: patch.title ?? "Task",
        status: patch.status ?? "pending",
        ...(patch.description ? { description: patch.description } : {}),
        ...(patch.deadlineAt ? { deadlineAt: patch.deadlineAt } : {}),
        ...(patch.reminderAt ? { reminderAt: patch.reminderAt } : {}),
        ...(patch.recurrence ? { recurrence: patch.recurrence } : {}),
      });
      continue;
    }
    const index = tasks.findIndex((task) => task.id === patch.id);
    if (index >= 0) tasks[index] = applyDayPlanPatch(base, patch, kind);
  }
  return tasks;
}

/** Minimal DSH web host integration. The host owns persistence and execution. */
export function createDshDayPlanHost(options: { storage?: DayPlanStorage } = {}): DayPlanHost {
  const storage = options.storage ?? createLocalStorageDayPlanStorage();
  let tasks = storage.getTasks();
  const commit = () => storage.setTasks(tasks);
  return {
    getTasks(): DayPlanTask[] {
      return tasks;
    },
    setTasks(nextTasks: DayPlanTask[]): void {
      tasks = nextTasks;
      commit();
    },
    openTask(id: string): void {
      notify("iui-day-plan-task-open", { taskId: id });
    },
    completeTask(id: string): void {
      tasks = tasks.map((task) =>
        task.id === id
          ? { ...task, status: "done", completedAt: task.completedAt ?? new Date().toISOString() }
          : task,
      );
      commit();
    },
    openCalendar(range?: { start?: string; end?: string }): void {
      notify("iui-day-plan-calendar-open", { range });
    },
    setReminder(taskId: string, reminderAt?: string): void {
      notify("iui-day-plan-reminder-set", { taskId, reminderAt });
    },
    requestNotification(taskId: string): void {
      notify("iui-day-plan-notification-request", { taskId });
    },
    reportConflict(taskId: string, reason?: string): void {
      notify("iui-day-plan-conflict", { taskId, reason });
    },
  };
}
