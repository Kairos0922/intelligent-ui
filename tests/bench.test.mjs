import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregate,
  mockResponseForTask,
  scoreResponse,
} from "../bench/lib/scoring.mjs";
import { runBenchmark } from "../bench/run.mjs";
import { BENCH_TASKS, taskById } from "../bench/tasks.mjs";

test("benchmark v0 harness is deterministic and structural", async () => {
  assert.equal(BENCH_TASKS.length, 25);
  assert.equal(new Set(BENCH_TASKS.map((task) => task.id)).size, 25);
  assert.ok(BENCH_TASKS.every((task) => task.prompt.length > 40));
  assert.ok(BENCH_TASKS.every((task) => task.required.length >= 1));

  const fence = await runBenchmark({
    provider: "mock",
    mode: "fence",
    tasks: BENCH_TASKS.slice(0, 4),
  });
  assert.equal(fence.taskCount, 4);
  assert.equal(fence.groups.length, 1);
  assert.equal(fence.groups[0].summary.taskSuccessRate, 1);
  assert.equal(fence.groups[0].summary.validOpsRate, 1);
  assert.equal(fence.groups[0].summary.repairedOps, 0);
  assert.equal(fence.groups[0].summary.droppedOps, 0);

  const tool = await runBenchmark({
    provider: "mock",
    mode: "tool",
    tasks: BENCH_TASKS.slice(0, 4),
  });
  assert.equal(tool.groups[0].summary.taskSuccessRate, 1);

  const task = taskById("money-budget");
  assert.ok(task);

  const plain = scoreResponse({
    task,
    mode: "fence",
    answer: "Here is a plain text answer with no UI.",
  });
  assert.equal(plain.taskSuccess, false);
  assert.ok(plain.reasons.includes("no ops"));

  const fixture = mockResponseForTask(task, "fence");
  const good = scoreResponse({ task, mode: "fence", answer: fixture.answer });
  assert.equal(good.taskSuccess, true);
  assert.equal(good.validOps, good.rawOps);
  assert.ok(good.components >= 1);
  assert.ok(good.ops.some((op) => op.t === "comp" && op.type === "formula"));

  const missingChart = scoreResponse({
    task,
    mode: "fence",
    answer: [
      "```iui",
      JSON.stringify({
        t: "comp",
        id: "c1",
        type: "stats",
        props: { items: [{ label: "Rent", value: "$2,000" }, { label: "Food", value: "$800" }] },
      }),
      JSON.stringify({ t: "table", head: ["Item", "Cost"], rows: [["Rent", "$2,000"], ["Food", "$800"]] }),
      JSON.stringify({ t: "done" }),
      "```",
    ].join("\n"),
  });
  assert.equal(missingChart.taskSuccess, false);
  assert.ok(missingChart.reasons.includes("missing usable chart"));

  const repaired = scoreResponse({
    task,
    mode: "fence",
    answer: [
      "```iui",
      JSON.stringify({
        t: "comp",
        type: "chart",
        props: { labels: ["A", "B", "C"], series: [{ name: "Budget", values: [1, 2, 3] }] },
      }),
      JSON.stringify({
        t: "comp",
        type: "formula",
        props: {
          expression: "income − expenses = surplus",
          result: "$400",
          vars: [{ symbol: "i", value: "$6,400" }, { symbol: "e", value: "$6,000" }],
        },
      }),
      JSON.stringify({ t: "ask", v: ["Budget", "Cut costs"] }),
      JSON.stringify({ t: "done" }),
      "```",
    ].join("\n"),
  });
  assert.ok(repaired.repairedOps >= 1);
  assert.equal(repaired.droppedOps, 0);
  assert.equal(repaired.taskSuccess, true);

  const summary = aggregate([good, plain]);
  assert.equal(summary.runs, 2);
  assert.equal(summary.taskSuccessRate, 0.5);
  assert.equal(summary.validOpsRate, 1);
});
