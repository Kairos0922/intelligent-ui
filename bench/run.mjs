#!/usr/bin/env node
/* =========================================================================
   IUI benchmark v0 runner
   -------------------------------------------------------------------------
   Default is a deterministic mock provider so the harness can be checked with
   no keys and no network. Real runs use any OpenAI-compatible endpoint:

     node bench/run.mjs --provider openai --model gpt-4.1 \
       --base-url https://api.openai.com/v1 --mode tool --repeats 3

   API keys come from IUI_BENCH_API_KEY or OPENAI_API_KEY. Never commit them.
   ========================================================================= */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import {
  createIuiExtractor,
  iuiSystemPrompt,
  iuiTool,
} from "../clone/dist-lib/agent.js";
import { BENCH_TASKS, filterTasks } from "./tasks.mjs";
import {
  aggregate,
  mockResponseForTask,
  scoreResponse,
} from "./lib/scoring.mjs";
import { streamOpenAI } from "./providers/openai.mjs";

const TOOL_NAME = "render_iui";

function mockStream(task, mode) {
  const payload = mockResponseForTask(task, mode);
  if (mode === "tool") {
    return (async function* () {
      yield { type: "tool", index: 0, name: TOOL_NAME, args: payload.toolArgs };
    })();
  }
  return (async function* () {
    yield { type: "text", text: payload.answer };
  })();
}

async function runOne({ provider, model, mode, task, system, tool, apiKey, baseUrl, temperature, maxTokens, timeoutMs, toolChoice, saveResponses }) {
  const started = performance.now();
  let firstDelta = null;
  let firstBlock = null;
  let answer = "";
  const toolCalls = new Map();
  const extractor =
    mode === "fence"
      ? createIuiExtractor(
          {
            onOp(op) {
              if (op.t === "comp" && firstBlock === null) firstBlock = performance.now();
            },
          },
          { sanitize: false },
        )
      : null;

  const stream =
    provider === "mock"
      ? mockStream(task, mode)
      : streamOpenAI({
          baseUrl,
          apiKey,
          model,
          system,
          prompt: task.prompt,
          mode,
          tool,
          toolChoice,
          temperature,
          maxTokens,
          timeoutMs,
        });

  try {
    for await (const event of stream) {
      const at = performance.now();
      if (firstDelta === null) firstDelta = at;
      if (event.type === "text") {
        answer += event.text;
        extractor?.push(event.text);
      } else if (event.type === "tool") {
        const index = Number.isInteger(event.index) ? event.index : 0;
        const current = toolCalls.get(index) ?? { name: "", args: "" };
        if (event.name && !current.name) current.name = event.name;
        if (event.args) current.args += event.args;
        toolCalls.set(index, current);
        if (firstBlock === null && /"t"\s*:\s*"comp"/.test(current.args)) {
          firstBlock = at;
        }
      }
    }
    extractor?.end();

    let toolArgs = "";
    for (const call of toolCalls.values()) {
      if (call.name === TOOL_NAME) {
        toolArgs = call.args;
        break;
      }
    }
    if (!toolArgs && toolCalls.size === 1) {
      toolArgs = [...toolCalls.values()][0].args;
    }

    const response = saveResponses
      ? mode === "tool"
        ? toolArgs
        : answer
      : undefined;
    const score = scoreResponse({
      task,
      mode,
      answer,
      toolArgs,
      response,
    });
    const ended = performance.now();
    return {
      ...score,
      model,
      repeat: task.__repeat ?? 0,
      ttftMs: firstDelta === null ? null : Math.round(firstDelta - started),
      ttfbMs: firstBlock === null ? null : Math.round(firstBlock - started),
      durationMs: Math.round(ended - started),
      error: null,
    };
  } catch (error) {
    const ended = performance.now();
    return {
      taskId: task.id,
      category: task.category,
      mode,
      model,
      rawOps: 0,
      renderedOps: 0,
      validOps: 0,
      repairedOps: 0,
      droppedOps: 0,
      components: 0,
      issues: [],
      taskSuccess: false,
      reasons: [`provider error: ${error?.message ?? String(error)}`],
      response: saveResponses ? answer || null : undefined,
      ttftMs: firstDelta === null ? null : Math.round(firstDelta - started),
      ttfbMs: firstBlock === null ? null : Math.round(firstBlock - started),
      durationMs: Math.round(ended - started),
      error: error?.message ?? String(error),
    };
  }
}

/**
 * Run the benchmark and return a report object. Does not write files.
 * Exported for tests and for programmatic use.
 */
export async function runBenchmark(options = {}) {
  const provider = options.provider ?? "mock";
  const mode = options.mode ?? "fence";
  const repeats = Math.max(1, Number(options.repeats ?? 1));
  const tasks = options.tasks ?? BENCH_TASKS;
  const models =
    options.models?.length > 0
      ? options.models
      : provider === "mock"
        ? ["mock-valid"]
        : [];
  if (!models.length) throw new Error("at least one --model is required");
  if (!tasks.length) throw new Error("no benchmark tasks matched");
  if (mode !== "fence" && mode !== "tool") throw new Error(`unknown mode: ${mode}`);
  if (provider !== "mock" && provider !== "openai") throw new Error(`unknown provider: ${provider}`);

  const system = iuiSystemPrompt({
    mode,
    productName: "the benchmark assistant",
  });
  const tool = iuiTool({ name: TOOL_NAME });
  const startedAt = new Date().toISOString();
  const groups = [];

  for (const model of models) {
    const runs = [];
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const [index, baseTask] of tasks.entries()) {
        const task = { ...baseTask, __repeat: repeat };
        const run = await runOne({
          provider,
          model,
          mode,
          task,
          system,
          tool,
          apiKey: options.apiKey ?? process.env.IUI_BENCH_API_KEY ?? process.env.OPENAI_API_KEY,
          baseUrl: options.baseUrl ?? process.env.IUI_BENCH_BASE_URL ?? "https://api.openai.com/v1",
          temperature: options.temperature ?? 0.2,
          maxTokens: options.maxTokens ?? 2400,
          timeoutMs: options.timeoutMs ?? 120_000,
          toolChoice: options.toolChoice ?? "auto",
          saveResponses: !!options.saveResponses,
        });
        runs.push(run);
        options.onProgress?.({ model, task: baseTask, index, total: tasks.length, repeat, repeats, run });
      }
    }
    groups.push({
      model,
      mode,
      summary: aggregate(runs),
      runs: runs.map(({ ops, ...rest }) => rest),
    });
  }

  return {
    schema: "iui-benchmark-v0",
    generatedAt: startedAt,
    provider,
    mode,
    repeats,
    taskCount: tasks.length,
    models,
    groups,
  };
}

/* ----------------------------------------------------------------- report */

function pct(value) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
}

function ms(value) {
  return typeof value === "number" ? `${value} ms` : "—";
}

export function renderMarkdown(report) {
  const lines = [];
  lines.push("# Intelligent UI benchmark v0");
  lines.push("");
  lines.push(`> ${report.provider === "mock" ? "**Harness self-check (mock provider) — not a model result.**" : "Model run."}`);
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Provider: \`${report.provider}\``);
  lines.push(`- Mode: \`${report.mode}\``);
  lines.push(`- Tasks: ${report.taskCount}; repeats: ${report.repeats}`);
  lines.push(`- Models: ${report.models.map((model) => `\`${model}\``).join(", ")}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Model | Runs | Valid ops | Repaired | Dropped | Task success | Tasks w/ repair | TTFT p50 | First block p50 | p95 |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const group of report.groups) {
    const s = group.summary;
    lines.push(
      `| \`${group.model}\` | ${s.runs} | ${pct(s.validOpsRate)} | ${pct(s.repairedOpRate)} | ${pct(s.droppedOpRate)} | ${pct(s.taskSuccessRate)} | ${pct(s.tasksWithRepairRate)} | ${ms(s.ttftP50Ms)} | ${ms(s.firstBlockP50Ms)} | ${ms(s.firstBlockP95Ms)} |`,
    );
  }
  lines.push("");
  lines.push("Definitions: valid/repaired/dropped are per raw op after core validation; task success requires all required blocks with usable shapes, no duplicate ids, ≤ 6 components, and one task keyword. TTFT is the first stream delta; first block is the first `comp` op seen.");
  lines.push("");

  const failures = [];
  for (const group of report.groups) {
    for (const run of group.runs) {
      if (!run.taskSuccess) failures.push({ model: group.model, ...run });
    }
  }
  if (failures.length) {
    lines.push("## Failures");
    lines.push("");
    lines.push("| Model | Task | Raw ops | Reasons |");
    lines.push("|---|---|---:|---|");
    for (const failure of failures.slice(0, 80)) {
      const reason = failure.reasons.join("; ").replace(/\|/g, "\\|");
      lines.push(`| \`${failure.model}\` | \`${failure.taskId}\` | ${failure.rawOps} | ${reason} |`);
    }
    if (failures.length > 80) lines.push(`| … | ${failures.length - 80} more | | |`);
    lines.push("");
  }

  lines.push("## Reproduce");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run build:core");
  lines.push("npm run bench:selfcheck");
  lines.push("# real run (keys from IUI_BENCH_API_KEY or OPENAI_API_KEY)");
  lines.push("node bench/run.mjs --provider openai --mode tool \\");
  lines.push("  --model <model> --base-url https://api.openai.com/v1 --repeats 3");
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

export function writeReport(report, outPath) {
  const jsonPath = resolve(outPath);
  const markdownPath = jsonPath.replace(/\.json$/i, "") + ".md";
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(markdownPath, renderMarkdown(report) + "\n");
  return { jsonPath, markdownPath };
}

/* -------------------------------------------------------------------- cli */

function parseArgs(argv) {
  const options = { models: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      return value;
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--list") options.list = true;
    else if (arg === "--provider") options.provider = next();
    else if (arg === "--mode") options.mode = next();
    else if (arg === "--model") options.models.push(next());
    else if (arg === "--models") options.models.push(...next().split(",").map((value) => value.trim()).filter(Boolean));
    else if (arg === "--repeats") options.repeats = Number(next());
    else if (arg === "--base-url") options.baseUrl = next();
    else if (arg === "--api-key") options.apiKey = next();
    else if (arg === "--temperature") options.temperature = Number(next());
    else if (arg === "--max-tokens") options.maxTokens = Number(next());
    else if (arg === "--timeout-ms") options.timeoutMs = Number(next());
    else if (arg === "--tool-choice") options.toolChoice = next();
    else if (arg === "--filter") options.filter = next();
    else if (arg === "--out") options.out = next();
    else if (arg === "--save-responses") options.saveResponses = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function help() {
  console.log(`IUI benchmark v0

Usage:
  node bench/run.mjs [options]

Default: mock provider, fence mode, one run — a harness self-check.

Options:
  --provider mock|openai       default: mock
  --mode fence|tool            default: fence
  --model <id>                 repeatable; required for openai
  --models <a,b>               comma-separated alternative
  --repeats <n>                default: 1
  --base-url <url>             OpenAI-compatible base URL
  --api-key <key>              prefer IUI_BENCH_API_KEY / OPENAI_API_KEY
  --temperature <n>            default: 0.2
  --max-tokens <n>             default: 2400
  --timeout-ms <n>             default: 120000
  --tool-choice auto|required|none  default: auto (tool mode)
  --filter <text>              id/category/prompt substring
  --save-responses             include truncated responses in JSON
  --out <file.json>            default: bench/results/<timestamp>.json
  --list                       print the 25 task ids and exit
`);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[bench] ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    help();
    return;
  }
  if (options.list) {
    for (const task of BENCH_TASKS) {
      console.log(`${task.id.padEnd(24)} ${task.category.padEnd(10)} ${task.title}`);
    }
    return;
  }

  const tasks = filterTasks(options.filter);
  if (!tasks.length) {
    console.error(`[bench] no tasks matched filter: ${options.filter}`);
    process.exitCode = 1;
    return;
  }

  const modelLabel = options.models.length ? options.models.join(", ") : "mock-valid";
  console.log(`[bench] ${options.provider ?? "mock"} · ${options.mode ?? "fence"} · ${tasks.length} tasks × ${options.repeats ?? 1} · ${modelLabel}`);
  if ((options.provider ?? "mock") !== "mock" && !options.models.length) {
    console.error("[bench] --provider openai requires at least one --model");
    process.exitCode = 1;
    return;
  }

  const report = await runBenchmark({
    ...options,
    tasks,
    onProgress({ model, task, index, total, repeat, repeats, run }) {
      const status = run.taskSuccess ? "ok" : "FAIL";
      const progress = `${index + 1}/${total}${repeats > 1 ? ` r${repeat + 1}` : ""}`;
      process.stdout.write(`\r[bench] ${model} ${progress} ${task.id} ${status}   `);
    },
  });
  process.stdout.write("\n");

  for (const group of report.groups) {
    const s = group.summary;
    console.log(
      `[bench] ${group.model}: success ${pct(s.taskSuccessRate)} · valid ops ${pct(s.validOpsRate)} · repaired ${pct(s.repairedOpRate)} · dropped ${pct(s.droppedOpRate)} · first block p50 ${ms(s.firstBlockP50Ms)}`,
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = options.out ?? resolve("bench/results", `bench-${stamp}.json`);
  const paths = writeReport(report, out);
  console.log(`[bench] JSON: ${paths.jsonPath}`);
  console.log(`[bench] MD:   ${paths.markdownPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[bench] ${error.stack ?? error.message ?? error}`);
    process.exitCode = 1;
  });
}
