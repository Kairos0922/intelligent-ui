import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCENARIOS,
  SCENARIO_IDS,
  TASKS_PER_SCENARIO,
} from "../bench/scenarios.mjs";
import { buildReferenceResponse } from "../bench/lib/scenario-fixtures.mjs";
import {
  aggregateScenarios,
  scoreScenarioTask,
} from "../bench/lib/scenario-score.mjs";

test("three scenarios register exactly twenty unique tasks each", () => {
  assert.deepEqual(SCENARIO_IDS, ["data-analysis", "daily-travel", "daily-life"]);
  const seen = new Set();
  for (const scenario of SCENARIOS) {
    assert.equal(scenario.tasks.length, TASKS_PER_SCENARIO, `${scenario.id} task count`);
    assert.equal(scenario.id, scenario.tasks[0].scenario);
    for (const task of scenario.tasks) {
      assert.equal(task.scenario, scenario.id);
      assert.ok(task.prompt.trim().length > 20, `${task.id} has a real prompt`);
      assert.ok(task.required.length >= 2, `${task.id} has required blocks`);
      assert.ok(
        task.required.every((type) => task.blocks.includes(type)),
        `${task.id} exposes its required blocks`,
      );
      assert.ok(task.keywords.length > 0, `${task.id} has keywords`);
      assert.equal(seen.has(task.id), false, `${task.id} is unique`);
      seen.add(task.id);
    }
  }
  assert.equal(seen.size, SCENARIO_IDS.length * TASKS_PER_SCENARIO);
  for (const scenario of SCENARIOS) {
    assert.ok(
      scenario.tasks.some((task) => task.requireAnswer),
      `${scenario.id} exercises the Answer Envelope`,
    );
    assert.ok(
      scenario.tasks.some((task) => task.requireAction),
      `${scenario.id} exercises a declared action`,
    );
  }
});

test("reference fixtures complete every task and every interaction", () => {
  for (const scenario of SCENARIOS) {
    for (const task of scenario.tasks) {
      const first = buildReferenceResponse(task, { turn: 1 });
      const second = task.interaction ? buildReferenceResponse(task, { turn: 2 }) : null;
      const result = scoreScenarioTask(task, first, second);

      assert.equal(
        result.complete,
        true,
        `${task.id}: ${(result.interactionReasons?.length
          ? result.interactionReasons
          : result.reasons
        ).join("; ")}`,
      );
      if (task.requireAnswer) assert.equal(result.hasEnvelope, true, `${task.id} envelope`);
      if (task.requireAction) {
        assert.ok(result.actionNames.includes(task.requireAction), `${task.id} action`);
      }
      if (task.interaction) assert.equal(result.interactionOk, true, `${task.id} interaction`);
    }
  }
});

test("a structurally incomplete answer is not counted as complete", () => {
  const task = SCENARIOS[0].tasks[0];
  const incomplete = {
    answer: '```iui\n{"t":"p","lvl":0}\n{"t":"md","v":"Revenue went up."}\n{"t":"done"}\n```\n',
    toolArgs: "",
  };
  const result = scoreScenarioTask(task, incomplete);
  assert.equal(result.complete, false);
  assert.ok(result.reasons.some((reason) => reason.includes("missing usable")));
});

test("aggregation reports each scenario separately instead of one average", () => {
  const runs = [];
  for (const scenario of SCENARIOS) {
    for (const task of scenario.tasks) {
      const first = buildReferenceResponse(task, { turn: 1 });
      const second = task.interaction ? buildReferenceResponse(task, { turn: 2 }) : null;
      const result = scoreScenarioTask(task, first, second);
      runs.push({
        ...result,
        taskId: task.id,
        scenario: task.scenario,
        interactionOk: result.interactionOk,
      });
    }
  }

  const dataFailure = runs.find((run) => run.scenario === "data-analysis");
  dataFailure.complete = false;
  dataFailure.reasons = ["synthetic failure"];
  dataFailure.interactionReasons = ["synthetic failure"];

  const report = aggregateScenarios(runs);
  const byId = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.equal(byId.get("data-analysis").completed, 19);
  assert.equal(byId.get("daily-travel").completed, 20);
  assert.equal(byId.get("daily-life").completed, 20);
  assert.equal(byId.get("data-analysis").coverage, 0.95);
  assert.equal(report.overall.weakestScenario, "data-analysis");
});
