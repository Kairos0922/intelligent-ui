import { expect, test } from "@playwright/test";
import type { IuiEvent, Op } from "../clone/dist-lib/index.js";

test("Day plan taskList/reminder render and emit host actions", async ({ page }) => {
  await page.goto("/");
  const ops: Op[] = [
    {
      t: "comp",
      id: "task-list",
      type: "taskList",
      props: {
        payload: {
          kind: "day-plan",
          version: "1.0",
          tasks: [
            { id: "task-1", title: "Buy milk", status: "pending", deadlineAt: "2026-11-21T10:00:00Z" },
            { id: "task-2", title: "Write report", status: "done" },
          ],
        },
      },
    },
    {
      t: "comp",
      id: "day-reminder",
      type: "reminder",
      props: {
        reminder: {
          taskId: "task-1",
          title: "Buy milk",
          reminderAt: "2026-11-21T09:00:00Z",
        },
      },
    },
    { t: "done" },
  ];

  await page.evaluate(async (appliedOps) => {
    const mod = await import("/src/sdk/index.ts");
    const events: IuiEvent[] = [];
    const ui = mod.createIntelligentUI({
      container: document.body,
      theme: "light",
      onEvent: (event: IuiEvent) => events.push(event),
    });
    ui.apply(appliedOps);
    window.__dayPlanEvents = events;
  }, ops);

  await expect(page.getByRole("region", { name: "Day plan tasks" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Buy milk" })).toContainText("Buy milk");
  await expect(page.getByRole("group", { name: "Write report" })).toContainText("Write report");
  await expect(page.getByTestId("day-reminder")).toBeVisible();
  await expect(page.getByRole("status", { name: "Buy milk" })).toContainText("Reminder at");

  await page.getByTestId("complete-task-1").click();
  await page.getByTestId("open-task-1").click();
  await page.getByTestId("day-reminder-open-task-1").click();
  await page.getByTestId("day-reminder-calendar-task-1").click();
  await page.getByTestId("day-reminder-set-task-1").click();
  await page.getByTestId("day-reminder-notify-task-1").click();

  const events = await page.evaluate(() => window.__dayPlanEvents);
  const names = events.filter((event) => event.type === "block").map((event) => event.name);
  expect(names).toEqual([
    "complete_task",
    "show_task",
    "show_task",
    "open_calendar",
    "set_reminder",
    "request_notification",
  ]);
});

declare global {
  interface Window {
    __dayPlanEvents?: IuiEvent[];
  }
}
