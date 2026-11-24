import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLOCK_CATALOG,
  BLOCK_TYPES,
  validateOps,
  validateDayListPayload,
  validateDayReminderPayload,
  redactDayPlanPii,
  clearExpiredDayPlanPii,
  reconcileDayPlanTask,
  reconcileDayPlanTasks,
  filterDayPlanTasks,
} from "../clone/dist-lib/agent.js";

test("Day plan catalog and component-registry types are present", () => {
  const catalogTypes = BLOCK_CATALOG.map((block) => block.type);
  assert.ok(catalogTypes.includes("taskList"));
  assert.ok(catalogTypes.includes("reminder"));
  assert.ok(BLOCK_TYPES.has("taskList"));
  assert.ok(BLOCK_TYPES.has("reminder"));
});

test("Day plan payload validator accepts valid tasks and reminders", () => {
  const valid = validateDayListPayload({
    kind: "day-plan",
    version: "1.0",
    hostTimeZone: "Europe/Amsterdam",
    tasks: [
      {
        id: "task-1",
        title: "Buy milk",
        status: "pending",
        priority: 2,
        deadlineAt: "2026-11-20T10:00:00Z",
        reminderAt: "2026-11-20T09:00:00Z",
        recurrence: "daily",
        userFacts: ["email proof of purchase", "receipt number", "too long to keep"],
        pii: { holderName: "A. B.", userId: "user-1", expiresAt: "2026-12-20T10:00:00Z" },
      },
    ],
  });
  assert.deepEqual(valid.issues, []);
  assert.equal(valid.payload?.tasks[0].title, "Buy milk");
  assert.equal(valid.payload?.tasks[0].userFacts?.length, 3);

  const invalid = validateDayListPayload({
    kind: "day-plan",
    version: "1.0",
    tasks: [{ id: "task-2", title: "Bad task", status: "wip", deadlineAt: "not-a-date", priority: 9 }],
  });
  assert.ok(invalid.issues.length >= 3);
  assert.equal(invalid.issues.some((issue) => issue.code === "invalid_day_plan"), true);

  const reminder = validateDayReminderPayload({ taskId: "task-1", title: "Buy milk", reminderAt: "2026-11-20T09:00:00Z" });
  assert.deepEqual(reminder.issues, []);
  const invalidReminder = validateDayReminderPayload({ taskId: "task-1" });
  assert.ok(invalidReminder.issues.length > 0);
});

test("Day plan reconcile helpers mark overdue and sort tasks", () => {
  const past = "2026-01-01T00:00:00Z";
  const future = "2027-01-01T00:00:00Z";
  const done = reconcileDayPlanTask({ id: "done", title: "Done", status: "done", deadlineAt: past });
  assert.equal(done.status, "done");

  const overdue = reconcileDayPlanTask({ id: "overdue", title: "Overdue", deadlineAt: past });
  assert.equal(overdue.status, "overdue");

  const live = reconcileDayPlanTask({ id: "live", title: "Live", deadlineAt: future });
  assert.equal(live.status, "pending");

  const sorted = reconcileDayPlanTasks([
    { id: "no-deadline", title: "No deadline", deadlineAt: undefined },
    { id: "overdue", title: "Overdue", deadlineAt: past },
    { id: "later", title: "Later", deadlineAt: future },
  ], 0).map((task) => task.id);
  assert.deepEqual(sorted, ["overdue", "later", "no-deadline"]);
});

test("filterDayPlanTasks filters status/priority/search and limits large lists", () => {
  const many = Array.from({ length: 1200 }, (_, index) => ({
    id: `task-${index}`,
    title: index % 2 === 0 ? "Even task" : "Odd task",
    status: index % 2 === 0 ? "pending" : "done",
  }));
  const pending = filterDayPlanTasks(many, { status: "pending" }, 600);
  assert.equal(pending.length, 500);
  const highPriority = filterDayPlanTasks(
    many.map((task, index) => ({ ...task, priority: index % 4 })),
    { priority: 3 },
    500,
  );
  assert.equal(highPriority.length, 300);
  assert.ok(highPriority.every((task) => task.priority === 3));
  const searched = filterDayPlanTasks(many, { search: "Even" }, 500);
  assert.ok(searched.length > 0);
  assert.ok(searched.every((task) => task.title.includes("Even")));
  assert.equal(filterDayPlanTasks(many, {}, 2).length, 2);
  assert.ok(filterDayPlanTasks(many).length <= 20);
});

test("Day plan PII helpers redact and expire PII", () => {
  const task = {
    id: "task-1",
    title: "Buy milk",
    status: "pending",
    pii: { holderName: "A. B.", userId: "user-1", expiresAt: "2026-11-01T00:00:00Z" },
  };
  const redacted = redactDayPlanPii(task);
  assert.equal(redacted.pii?.holderName, "[redacted]");
  assert.equal(redacted.pii?.userId, "[redacted]");
  assert.deepEqual(clearExpiredDayPlanPii([redacted], Date.now()).map((item) => item.pii), [undefined]);
});

test("Day plan component props pass core op validation", () => {
  const taskResult = validateOps([
    {
      t: "comp",
      id: "task-list",
      type: "taskList",
      props: {
        payload: {
          kind: "day-plan",
          version: "1.0",
          hostTimeZone: "Europe/Amsterdam",
          tasks: [{ id: "task-1", title: "Buy milk", status: "pending" }],
        },
      },
    },
  ]);
  assert.deepEqual(taskResult.issues, []);

  const reminderResult = validateOps([
    {
      t: "comp",
      id: "day-reminder",
      type: "reminder",
      props: {
        reminder: {
          taskId: "task-1",
          title: "Buy milk",
          reminderAt: "2026-11-20T08:00:00Z",
        },
      },
    },
  ]);
  assert.deepEqual(reminderResult.issues, []);
});
