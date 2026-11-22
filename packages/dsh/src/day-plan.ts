import type { DayPlanHost, DayPlanTask } from "@intelligent-ui/core";

export type DayPlanPatchKind = "user" | "model" | "derived";

function notify(name: string, detail: Record<string, unknown>): void {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

/**
 * Apply a Day plan task patch. User patches win; model/derived patches do not
 * resurrect a user-completed task and do not override explicit user fields.
 */
export function applyDayPlanPatch(
  current: DayPlanTask,
  patch: DayPlanTask,
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

/** Minimal DSH web host integration. The host owns persistence and execution. */
export function createDshDayPlanHost(): DayPlanHost {
  let tasks: DayPlanTask[] = [];
  return {
    getTasks(): DayPlanTask[] {
      return tasks;
    },
    setTasks(nextTasks: DayPlanTask[]): void {
      tasks = nextTasks;
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
