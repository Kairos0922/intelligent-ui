/* =========================================================================
   Scenario scoring and per-scenario aggregation.
   -------------------------------------------------------------------------
   A task is complete only when:
     - the first answer passes the structural + Answer Envelope checks
     - the interaction task produces a real `[iui-action]` envelope
     - the second answer keeps the target block id and applies the selection

   Scenario coverage is always tasks completed / tasks registered. The
   aggregate never hides a weak scenario behind a global average.
   ========================================================================= */

import {
  formatIuiAction,
  parseIuiAction,
} from "../../clone/dist-lib/agent.js";
import {
  buildInteractionEnvelope,
  checkInteractionUpdate,
} from "./scenario-fixtures.mjs";
import { scoreResponse } from "./scoring.mjs";
import { SCENARIOS } from "../scenarios.mjs";

function rawText(response) {
  return [response.answer ?? "", response.toolArgs ?? ""].join("\n");
}

function scoreActionEnvelope(task, firstOps) {
  const reasons = [];
  if (task.interaction.kind === "prompt") {
    const text = task.interaction.payload?.text ?? task.interaction.nextValue ?? "";
    const formatted = formatIuiAction({ action: "prompt", payload: { text } });
    const parsed = parseIuiAction(formatted);
    if (!parsed || parsed.action !== "prompt" || parsed.payload?.text !== text) {
      reasons.push("prompt action envelope did not round-trip");
    }
    return { ok: reasons.length === 0, reasons, text: formatted };
  }

  const envelope = buildInteractionEnvelope(task, firstOps);
  if (!envelope) {
    return {
      ok: false,
      reasons: [`no ${task.interaction.blockType} block to receive the interaction`],
      text: null,
    };
  }
  const formatted = formatIuiAction(envelope);
  const parsed = parseIuiAction(formatted);
  if (!parsed) return { ok: false, reasons: ["action envelope did not parse"], text: formatted };
  if (parsed.action !== task.interaction.action) {
    reasons.push(`action is ${parsed.action}, expected ${task.interaction.action}`);
  }
  if (parsed.blockId !== envelope.blockId) reasons.push("action lost the block id");
  if (parsed.blockType !== task.interaction.blockType) reasons.push("action lost the block type");
  return { ok: reasons.length === 0, reasons, text: formatted };
}

export function scoreScenarioTask(task, firstResponse, secondResponse = null) {
  const first = scoreResponse({
    task,
    mode: firstResponse.mode ?? "fence",
    answer: firstResponse.answer ?? "",
    toolArgs: firstResponse.toolArgs ?? "",
    response: rawText(firstResponse),
  });

  if (!task.interaction) {
    return {
      ...first,
      complete: first.taskSuccess,
      interactionOk: true,
      interactionReasons: [],
      actionText: null,
      second: null,
    };
  }

  const action = scoreActionEnvelope(task, first.ops);
  const reasons = [...action.reasons];
  let second = null;
  let update = { ok: false, reasons: ["second turn was not run"] };

  if (secondResponse) {
    second = scoreResponse({
      task,
      mode: secondResponse.mode ?? "fence",
      answer: secondResponse.answer ?? "",
      toolArgs: secondResponse.toolArgs ?? "",
      response: rawText(secondResponse),
    });
    update = checkInteractionUpdate(task, first.ops, second.ops, rawText(secondResponse));
    reasons.push(...update.reasons);
    if (!second.taskSuccess) reasons.push(...second.reasons.map((reason) => `turn 2: ${reason}`));
  }

  const interactionOk = action.ok && update.ok && Boolean(second?.taskSuccess);
  return {
    ...first,
    complete: first.taskSuccess && interactionOk,
    interactionOk,
    interactionReasons: reasons,
    actionText: action.text,
    second: second ? { ...second, ops: undefined } : null,
  };
}

export function aggregateScenarios(runs, registered = SCENARIOS) {
  const byScenario = new Map();
  for (const scenario of registered) {
    byScenario.set(scenario.id, {
      id: scenario.id,
      title: scenario.title,
      registered: scenario.tasks.length,
      completed: 0,
      interactionTasks: scenario.tasks.filter((task) => task.interaction).length,
      interactionCompleted: 0,
      answerTasks: scenario.tasks.filter((task) => task.requireAnswer).length,
      answerCompleted: 0,
      actionTasks: scenario.tasks.filter((task) => task.requireAction).length,
      actionCompleted: 0,
      repairs: 0,
      failures: [],
    });
  }

  const runsByTask = new Map();
  for (const run of runs) {
    const list = runsByTask.get(run.taskId) ?? [];
    list.push(run);
    runsByTask.set(run.taskId, list);
  }

  for (const scenario of registered) {
    const entry = byScenario.get(scenario.id);
    if (!entry) continue;
    for (const task of scenario.tasks) {
      const attempts = runsByTask.get(task.id) ?? [];
      if (!attempts.length) continue;
      // A task is complete when at least one repeat completes. Attempts are
      // still reported so a flaky model cannot hide behind one lucky run.
      const complete = attempts.some((run) => run.complete);
      entry.repairs += attempts.reduce((sum, run) => sum + (run.repairs ?? 0), 0);
      if (complete) entry.completed += 1;
      else {
        const last = attempts.at(-1);
        entry.failures.push({
          taskId: task.id,
          attempts: attempts.length,
          reasons: last.interactionReasons?.length ? last.interactionReasons : last.reasons,
        });
      }
      if (task.requireAnswer) {
        if (attempts.some((run) => run.hasEnvelope && run.complete)) entry.answerCompleted += 1;
      }
      if (task.requireAction) {
        if (attempts.some((run) => run.actionNames?.includes(task.requireAction) && run.complete)) {
          entry.actionCompleted += 1;
        }
      }
      if (task.interaction) {
        if (attempts.some((run) => run.interactionOk)) entry.interactionCompleted += 1;
      }
    }
  }

  const scenarios = [...byScenario.values()].map((entry) => ({
    ...entry,
    coverage: entry.registered ? entry.completed / entry.registered : 0,
    interactionCoverage: entry.interactionTasks ? entry.interactionCompleted / entry.interactionTasks : 1,
    answerCoverage: entry.answerTasks ? entry.answerCompleted / entry.answerTasks : 1,
    actionCoverage: entry.actionTasks ? entry.actionCompleted / entry.actionTasks : 1,
  }));

  const registeredCount = scenarios.reduce((sum, item) => sum + item.registered, 0);
  const completed = scenarios.reduce((sum, item) => sum + item.completed, 0);
  return {
    scenarios,
    overall: {
      registered: registeredCount,
      completed,
      repairs: scenarios.reduce((sum, item) => sum + item.repairs, 0),
      coverage: registeredCount ? completed / registeredCount : 0,
      weakestScenario: scenarios.reduce(
        (weakest, item) => (item.coverage < weakest.coverage ? item : weakest),
        scenarios[0],
      )?.id ?? null,
    },
  };
}

export function attachTaskMeta(runs, tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return runs.map((run) => {
    const task = byId.get(run.taskId);
    return {
      ...run,
      scenario: task?.scenario ?? run.scenario,
      requireAnswer: Boolean(task?.requireAnswer),
      requireAction: task?.requireAction ?? null,
      interaction: Boolean(task?.interaction),
    };
  });
}

export function pct(value) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
}

export function renderScenarioMarkdown(report) {
  const lines = [];
  lines.push("# IUI scenario coverage v1");
  lines.push("");
  lines.push(
    `> ${
      report.provider === "fixture"
        ? "**Reference-fixture contract coverage — not a model result.**"
        : `Model run via \`${report.provider}\`${report.model ? ` (\`${report.model}\`)` : ""}.`
    }`,
  );
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Mode: \`${report.mode}\``);
  lines.push(`- Repeats: ${report.repeats}`);
  lines.push(`- Tasks registered: ${report.overall.registered}`);
  lines.push(`- Tasks completed: ${report.overall.completed}`);
  if (report.overall.repairs) {
    lines.push(`- Validation repair calls: ${report.overall.repairs}`);
  }
  lines.push("");
  lines.push("## Per-scenario coverage");
  lines.push("");
  lines.push("| Scenario | Registered | Completed | Coverage | Answer envelope | Actions | Interaction |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const item of report.scenarios) {
    lines.push(
      `| ${item.title} (\`${item.id}\`) | ${item.registered} | ${item.completed} | ${pct(item.coverage)} | ${item.answerCompleted}/${item.answerTasks} | ${item.actionCompleted}/${item.actionTasks} | ${item.interactionCompleted}/${item.interactionTasks} |`,
    );
  }
  lines.push("");
  lines.push(
    "Coverage is completed / registered per scenario. The overall row is informational only; the weakest scenario is the release gate.",
  );
  lines.push("");
  lines.push(`- Overall: ${pct(report.overall.coverage)} (${report.overall.completed}/${report.overall.registered})`);
  lines.push(`- Weakest scenario: \`${report.overall.weakestScenario}\``);

  const failures = report.scenarios.flatMap((scenario) =>
    scenario.failures.map((failure) => ({ scenario: scenario.id, ...failure })),
  );
  if (failures.length) {
    lines.push("");
    lines.push("## Failures");
    lines.push("");
    lines.push("| Scenario | Task | Reasons |");
    lines.push("|---|---|---|");
    for (const failure of failures.slice(0, 120)) {
      const reasons = failure.reasons.join("; ").replaceAll("|", "\\|");
      lines.push(`| \`${failure.scenario}\` | \`${failure.taskId}\` | ${reasons} |`);
    }
    if (failures.length > 120) lines.push(`| … | ${failures.length - 120} more | |`);
  }
  lines.push("");
  lines.push("## Reproduce");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run build:core");
  lines.push("node bench/scenario-run.mjs --provider fixture");
  lines.push("# real model run");
  if (report.provider === "fixture") {
    lines.push("node bench/scenario-run.mjs --provider ollama \\");
    lines.push("  --model qwen2.5:14b --repeats 1 --require 0.9");
  } else {
    lines.push(`node bench/scenario-run.mjs --provider ${report.provider} \\`);
    lines.push(
      `  --model ${report.model} --repeats ${report.repeats} --require 0.9`,
    );
  }
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}
