import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCK_CATALOG, BLOCK_TYPES, validateOps } from "../clone/dist-lib/agent.js";

test("Day plan catalog and component-registry types are present", () => {
  const catalogTypes = BLOCK_CATALOG.map((block) => block.type);
  assert.ok(catalogTypes.includes("taskList"));
  assert.ok(catalogTypes.includes("reminder"));
  assert.ok(BLOCK_TYPES.has("taskList"));
  assert.ok(BLOCK_TYPES.has("reminder"));
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
