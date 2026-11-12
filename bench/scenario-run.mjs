#!/usr/bin/env node
/* =========================================================================
   IUI scenario runner v1.
   -------------------------------------------------------------------------
   Providers:
     fixture  — deterministic reference answers (contract coverage only)
     opencode — a real model through the local OpenCode CLI (model coverage)
     deepseek — DeepSeek's OpenAI-compatible API (model coverage)

   The report always keeps the three scenarios separate. A scenario below the
   requested threshold fails the command even when the overall number is high.
   ========================================================================= */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatIuiAction, iuiSystemPrompt } from "../clone/dist-lib/agent.js";
import {
  SCENARIOS,
  filterScenarioTasks,
  scenarioById,
} from "./scenarios.mjs";
import {
  buildInteractionEnvelope,
  buildReferenceResponse,
  checkInteractionUpdate,
} from "./lib/scenario-fixtures.mjs";
import {
  aggregateScenarios,
  attachTaskMeta,
  renderScenarioMarkdown,
  scoreScenarioTask,
} from "./lib/scenario-score.mjs";
import { scoreResponse } from "./lib/scoring.mjs";

const TOOL_NAME = "render_iui";
const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const options = {
    provider: "fixture",
    model: process.env.IUI_SCENARIO_MODEL ?? "opencode/deepseek-v4.1-flash-free",
    mode: "fence",
    repeats: 1,
    out: null,
    require: null,
    scenario: [],
    ids: [],
    limit: 0,
    concurrency: 4,
    timeoutMs: 180_000,
    repair: 1,
    saveResponses: true,
    quiet: false,
    standalone: true,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      return value;
    };
    if (arg === "--provider") options.provider = next();
    else if (arg === "--model") options.model = next();
    else if (arg === "--mode") options.mode = next();
    else if (arg === "--repeats") options.repeats = Number(next());
    else if (arg === "--out") options.out = next();
    else if (arg === "--require") options.require = Number(next());
    else if (arg === "--scenario") options.scenario.push(...next().split(",").filter(Boolean));
    else if (arg === "--id") options.ids.push(...next().split(",").filter(Boolean));
    else if (arg === "--limit") options.limit = Number(next());
    else if (arg === "--concurrency") options.concurrency = Number(next());
    else if (arg === "--timeout") options.timeoutMs = Number(next());
    else if (arg === "--repair") options.repair = Number(next());
    else if (arg === "--no-save-responses") options.saveResponses = false;
    else if (arg === "--no-standalone") options.standalone = false;
    else if (arg === "--quiet") options.quiet = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!["fixture", "opencode", "pollinations", "ollama", "deepseek"].includes(options.provider)) {
    throw new Error(`unknown provider: ${options.provider}`);
  }
  if (options.mode !== "fence" && options.mode !== "tool") {
    throw new Error(`unknown mode: ${options.mode}`);
  }
  if (!Number.isInteger(options.repeats) || options.repeats < 1) {
    throw new Error("--repeats must be a positive integer");
  }
  if (options.provider === "pollinations" && options.model.startsWith("opencode/")) {
    options.model = "openai-fast";
  }
  if (
    options.provider === "ollama" &&
    (options.model.startsWith("opencode/") || options.model === "openai-fast")
  ) {
    options.model = process.env.IUI_OLLAMA_MODEL ?? "qwen2.5:7b";
  }
  if (
    options.provider === "deepseek" &&
    (options.model.startsWith("opencode/") || options.model === "openai-fast")
  ) {
    options.model = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";
  }
  return options;
}

export function systemFor(task) {
  return iuiSystemPrompt({
    mode: "fence",
    productName: "the assistant",
    // Expose exactly the blocks this task's output contract requires. The full
    // catalog is intentionally not dumped into every prompt: a 13-block catalog
    // makes small models ignore the required types and spend tokens on irrelevant
    // schemas.
    include: task.required,
    capabilities: task.capabilities,
    answerEnvelope: task.requireAnswer,
  });
}

export function userFor(task) {
  const lines = ["## Scenario task", task.prompt, ""];
  lines.push("## Required blocks");
  lines.push(
    `The answer must include usable ${task.required.join(", ")} block${
      task.required.length === 1 ? "" : "s"
    }.`,
  );
  lines.push(
    "This is a hard output contract, not a suggestion. Each required type must appear as a real block with real data; markdown prose cannot substitute for a required block. Before you emit {\"t\":\"done\"}, verify that every required type is present and add any missing one.",
  );
  if (task.required.includes("table")) {
    lines.push(
      'The table requirement uses the native op {"t":"table","head":["Column"],"rows":[["Value"]]}; do not emit a component with type "table".',
    );
    lines.push(
      "A usable table has at least two data rows in the same table. Do not split one dataset into several one-row tables.",
    );
  }
  if (task.required.includes("stats")) {
    lines.push(
      'The stats requirement uses {"t":"comp","id":"c1","type":"stats","props":{"title":"Summary","items":[{"label":"Label","value":"Value"},{"label":"Label 2","value":"Value 2"}]}}; do not use a bare {"t":"stats"} op.',
    );
  }
  if (task.required.includes("calendar")) {
    lines.push(
      'The calendar requirement uses {"t":"comp","id":"c1","type":"calendar","props":{"month":"2026-11","events":[{"date":"2026-11-12","title":"Event"}]}}; month is YYYY-MM and every event date is YYYY-MM-DD.',
    );
  }
  if (task.required.includes("checklist")) {
    lines.push(
      'The checklist requirement uses {"t":"comp","id":"c1","type":"checklist","props":{"total":3,"items":[{"title":"Task"},{"title":"Task 2"}]}}.',
    );
  }
  if (task.required.includes("packing")) {
    lines.push(
      'The packing requirement uses {"t":"comp","id":"c1","type":"packing","props":{"total":4,"groups":[{"label":"Clothes","items":["Shirt","Socks"]}]}}.',
    );
  }
  if (task.required.includes("calculator")) {
    lines.push(
      'The calculator requirement uses {"t":"comp","id":"c1","type":"calculator","props":{"label":"Total","unit":"items","value":12,"rows":[{"name":"Item","per":1,"unit":"item"}]}}.',
    );
  }
  if (task.required.includes("steps")) {
    lines.push(
      'The steps requirement uses {"t":"comp","id":"c1","type":"steps","props":{"steps":[{"title":"Step","body":"Do it","check":{"title":"Done"}},{"title":"Step 2","body":"Do it","check":{"title":"Done"}}]}}.',
    );
  }
  if (task.requireAnswer) {
    const action = task.capabilities?.actions.find((item) => item.name === task.requireAction);
    lines.push("");
    lines.push("## Answer envelope");
    lines.push(
      [
        "The first op MUST be an answer envelope. Use this shape and replace the example values:",
        JSON.stringify({
          t: "answer",
          schemaVersion: "1.0",
          locale: "en-US",
          timeZone: "UTC",
          slots: {
            conclusion: { kind: "op", id: "conclusion" },
            primaryArtifact: { kind: "comp", id: "c1" },
            ...(action ? { primaryAction: { kind: "action", id: "a1" } } : {}),
          },
          ...(action
            ? {
                actions: [
                  {
                    id: "a1",
                    name: action.name,
                    args: action.name === "add_to_calendar" ? { date: "2026-11-14" } : {},
                    confirmHint: action.name.replaceAll("_", " "),
                    riskHint: action.risk,
                  },
                ],
              }
            : {}),
          provenance: {
            authority: "claimed",
            source: { id: "task-input", kind: "derived" },
            retrievedAt: "2026-11-06T00:00:00Z",
            verification: {
              sourceIdentity: "unverified",
              integrity: "unverified",
              schema: "valid",
              crossSource: "not_checked",
            },
          },
        }),
        'The conclusion op must have id "conclusion". The first component must have id "c1".',
      ].join("\n"),
    );
    if (action) {
      lines.push(
        `The envelope must propose the declared action \`${action.name}\` (${action.risk}) with id "a1".`,
      );
    }
  } else {
    lines.push("");
    lines.push("Do not emit an `answer` op for this task.");
  }
  if (task.interaction) {
    lines.push("");
    lines.push("## Interaction");
    lines.push(
      `Include a usable ${task.interaction.blockType} block with id "interaction". A real user will trigger a \`${task.interaction.action}\` action on it, and the next turn must keep that id and visibly apply the selected value in the updated block or prose.`,
    );
  }
  lines.push("");
  lines.push("## Output");
  lines.push(
    "Return only one ```iui fenced block with the complete NDJSON op list. Do not use tools. Do not read or write files. Do not add prose outside the fence.",
  );
  lines.push(
    "NDJSON means exactly one complete JSON object per line. Escape every newline inside a string value as \\\\n; never put a literal line break inside a JSON string.",
  );
  return lines.join("\n");
}

function promptFor(task) {
  return `${systemFor(task)}\n\n${userFor(task)}`;
}

function followUpUser(task, previousText, actionText) {
  return [
    "You rendered an Intelligent UI answer for this task:",
    task.prompt,
    "",
    "Previous answer:",
    previousText.slice(0, 16_000),
    "",
    "The user interacted with the interface:",
    actionText,
    "",
    "Return the complete updated interface as one ```iui fenced block. Keep every existing block id stable, including the interactive block id \"interaction\". Repeat every block from the previous answer, including unchanged blocks; never emit a patch or delta op. Apply the selected value. Repeat the answer envelope when the previous answer had one. Do not use tools and do not add prose outside the fence.",
  ].join("\n");
}

function followUpPrompt(task, previousText, actionText) {
  return `${systemFor(task)}\n\n${followUpUser(task, previousText, actionText)}`;
}

function needsRepair(score) {
  if (score.taskSuccess) return false;
  return score.reasons.some((reason) => !reason.startsWith("missing task keyword"));
}

function repairUserFor(task, previousText, score) {
  return [
    userFor(task),
    "",
    "## Validation feedback",
    "Your previous answer failed the IUI validator with these issues:",
    ...score.reasons.map((reason) => `- ${reason}`),
    "",
    "Previous answer:",
    "```",
    previousText.slice(0, 16_000),
    "```",
    "",
    "Rewrite the complete answer. Keep the same task and requirements. Return only one ```iui fenced block with one complete JSON object per line; do not use tools and do not add prose outside the fence.",
  ].join("\n");
}

function repairFollowUpUser(task, previousText, actionText, failedText, reasons) {
  return [
    followUpUser(task, previousText, actionText),
    "",
    "## Validation feedback",
    "Your previous update failed the IUI validator with these issues:",
    ...reasons.map((reason) => `- ${reason}`),
    "",
    "Previous update:",
    "```",
    failedText.slice(0, 12_000),
    "```",
    "",
    "Return only one complete ```iui fenced block with every block repeated and the same block ids. Do not send a delta or patch.",
  ].join("\n");
}

function runOpencode({ prompt, model, timeoutMs, cwd, standalone = true }) {
  return new Promise((resolvePromise, reject) => {
    const args = ["run", "--format", "json", ...(standalone ? ["--standalone"] : []), "-m", model, prompt];
    const child = spawn("opencode", args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`opencode timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join(" | ");
        reject(new Error(`opencode exited ${code}: ${detail.slice(0, 2000)}`));
        return;
      }
      const texts = [];
      const errors = [];
      for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          if (event?.type === "text" && event.part?.type === "text" && typeof event.part.text === "string") {
            texts.push(event.part.text);
          }
          if (event?.type === "error") errors.push(JSON.stringify(event).slice(0, 1000));
        } catch {
          // A non-JSON line is a CLI log line. Keep scanning.
        }
      }
      if (!texts.length && errors.length) {
        reject(new Error(`opencode returned an error: ${errors[0]}`));
        return;
      }
      resolvePromise({ answer: texts.join("\n"), stderr });
    });
  });
}

async function runFixture(task, options) {
  const first = buildReferenceResponse(task, { mode: options.mode });
  let second = null;
  if (task.interaction) {
    const firstScore = scoreResponse({ task, mode: options.mode, ...first });
    const envelope = buildInteractionEnvelope(task, firstScore.ops);
    if (envelope) {
      // The reference update is a complete second answer, not a delta.
      second = buildReferenceResponse(task, { mode: options.mode, turn: 2 });
    }
  }
  return { first, second, actionText: null };
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

let pollinationsNextAt = 0;
async function pollinationsGate() {
  const now = Date.now();
  const wait = Math.max(0, pollinationsNextAt - now);
  pollinationsNextAt = Math.max(now, pollinationsNextAt) + 46_000;
  if (wait) await sleep(wait);
}

async function runPollinations({ system, user, model, timeoutMs }) {
  const url = process.env.IUI_POLLINATIONS_URL ?? "https://text.pollinations.ai/openai";
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await pollinationsGate();
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.2,
          max_tokens: 8192,
          // The anonymous GPT-OSS tier budgets reasoning and content together.
          // Low effort leaves enough completion tokens for the UI payload.
          reasoning_effort: "low",
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        lastError = new Error(`pollinations HTTP ${response.status}: ${text.slice(0, 800)}`);
        // The anonymous tier allows one reply every 45 seconds per IP.
        if (response.status === 402 || response.status === 429 || response.status >= 500) {
          await sleep(response.status === 402 ? 46_000 : 2000 * attempt);
          continue;
        }
        throw lastError;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`pollinations returned non-JSON: ${text.slice(0, 800)}`);
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error(`pollinations returned an empty answer: ${text.slice(0, 500)}`);
      }
      return {
        answer: content,
        raw: text,
        meta: {
          finishReason: data?.choices?.[0]?.finish_reason ?? null,
          usage: data?.usage ?? null,
          reasoningLength: data?.choices?.[0]?.message?.reasoning?.length ?? 0,
        },
      };
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(2000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("pollinations failed");
}

/**
 * A few local models emit bare NDJSON instead of the requested ```iui fence.
 * The ops are still unambiguous (one complete JSON object per line), so wrap
 * them before scoring. Prose or any other malformed line is left untouched.
 */
function wrapOps(ops) {
  return `\`\`\`iui\n${ops.map((op) => JSON.stringify(op)).join("\n")}\n\`\`\``;
}

function splitJsonObjects(text) {
  const objects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function normalizeBareOps(text) {
  if (/```iui\b/.test(text)) return text;
  const trimmed = text.trim();
  const candidates = [trimmed];
  const first = trimmed.indexOf("{");
  const firstArray = trimmed.indexOf("[");
  const start = [first, firstArray].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  const last = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (start !== undefined && last > start) candidates.push(trimmed.slice(start, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed) && parsed.length && parsed.every((op) => op && typeof op === "object")) {
        return wrapOps(parsed);
      }
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.ops)) {
        return wrapOps(parsed.ops);
      }
      if (parsed && typeof parsed === "object" && typeof parsed.t === "string") {
        return wrapOps([parsed]);
      }
    } catch {
      // Not a single JSON document. Try the balanced-object scan.
    }
  }
  const objects = splitJsonObjects(trimmed);
  if (objects.length) {
    try {
      const parsed = objects.map((object) => JSON.parse(object));
      if (parsed.length === 1 && parsed[0] && Array.isArray(parsed[0].ops)) {
        return wrapOps(parsed[0].ops);
      }
      if (parsed.every((op) => op && typeof op === "object" && typeof op.t === "string")) {
        return wrapOps(parsed);
      }
    } catch {
      // One of the objects is invalid. Leave the raw text for the validator.
    }
  }
  const lines = trimmed.split(/\r?\n/);
  const body = lines.map((line) => line.trim()).filter((line) => line.startsWith("{") && line.endsWith("}"));
  if (body.length) {
    try {
      return wrapOps(body.map((line) => JSON.parse(line)));
    } catch {
      return text;
    }
  }
  return text;
}

async function runOllama({ system, user, model, timeoutMs }) {
  const url = process.env.IUI_OLLAMA_URL ?? "http://127.0.0.1:11434/api/chat";
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          stream: false,
          options: {
            temperature: 0.2,
            num_ctx: 8192,
            num_predict: 4096,
          },
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        lastError = new Error(`ollama HTTP ${response.status}: ${text.slice(0, 800)}`);
        if (response.status >= 500) {
          await sleep(2000 * attempt);
          continue;
        }
        throw lastError;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`ollama returned non-JSON: ${text.slice(0, 800)}`);
      }
      const content = data?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error(`ollama returned an empty answer: ${text.slice(0, 500)}`);
      }
      return {
        answer: normalizeBareOps(content),
        raw: text,
        meta: {
          doneReason: data.done_reason ?? null,
          evalCount: data.eval_count ?? null,
          promptEvalCount: data.prompt_eval_count ?? null,
        },
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(2000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("ollama failed");
}

async function runDeepSeek({ system, user, model, timeoutMs }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const url = `${baseUrl}/chat/completions`;
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          stream: false,
          temperature: 0.2,
          max_tokens: 8192,
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        lastError = new Error(`deepseek HTTP ${response.status}: ${text.slice(0, 800)}`);
        if (response.status === 429 || response.status >= 500) {
          await sleep(2000 * attempt);
          continue;
        }
        throw lastError;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`deepseek returned non-JSON: ${text.slice(0, 800)}`);
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error(`deepseek returned an empty answer: ${text.slice(0, 500)}`);
      }
      return {
        answer: normalizeBareOps(content),
        raw: text,
        meta: {
          finishReason: data?.choices?.[0]?.finish_reason ?? null,
          usage: data?.usage ?? null,
          model: data?.model ?? model,
        },
      };
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(2000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("deepseek failed");
}

async function runRemoteTask(task, options, generate) {
  let first = await generate({
    system: systemFor(task),
    user: userFor(task),
  });
  let repairs = 0;
  let firstScore = scoreResponse({
    task,
    mode: options.mode,
    answer: first.answer,
    toolArgs: first.toolArgs ?? "",
    response: first.answer,
  });
  if (options.repair > 0) {
    for (let attempt = 0; attempt < options.repair && needsRepair(firstScore); attempt++) {
      const repaired = await generate({
        system: systemFor(task),
        user: repairUserFor(task, first.answer, firstScore),
      });
      const repairedScore = scoreResponse({
        task,
        mode: options.mode,
        answer: repaired.answer,
        toolArgs: repaired.toolArgs ?? "",
        response: repaired.answer,
      });
      if (repairedScore.reasons.length <= firstScore.reasons.length) {
        first = repaired;
        firstScore = repairedScore;
      }
      repairs += 1;
    }
  }
  let second = null;
  let actionText = null;
  if (task.interaction) {
    const envelope = buildInteractionEnvelope(task, firstScore.ops);
    if (envelope) {
      actionText = formatIuiAction(envelope);
      second = await generate({
        system: systemFor(task),
        user: followUpUser(task, first.answer, actionText),
      });
      if (options.repair > 0) {
        for (let attempt = 0; attempt < options.repair; attempt++) {
          const secondScore = scoreResponse({
            task,
            mode: options.mode,
            answer: second.answer,
            toolArgs: second.toolArgs ?? "",
            response: second.answer,
          });
          const update = checkInteractionUpdate(task, firstScore.ops, secondScore.ops, second.answer);
          if (!needsRepair(secondScore) && update.ok) break;
          const repaired = await generate({
            system: systemFor(task),
            user: repairFollowUpUser(
              task,
              first.answer,
              actionText,
              second.answer,
              [...secondScore.reasons, ...update.reasons],
            ),
          });
          const repairedScore = scoreResponse({
            task,
            mode: options.mode,
            answer: repaired.answer,
            toolArgs: repaired.toolArgs ?? "",
            response: repaired.answer,
          });
          const repairedUpdate = checkInteractionUpdate(
            task,
            firstScore.ops,
            repairedScore.ops,
            repaired.answer,
          );
          if (repairedScore.reasons.length <= secondScore.reasons.length || repairedUpdate.ok) {
            second = repaired;
          }
          repairs += 1;
          if (repairedScore.taskSuccess && repairedUpdate.ok) break;
        }
      }
    }
  }
  return { first, second, actionText, repairs };
}

async function runOpencodeTask(task, options) {
  const cwd = resolve(HERE, "..");
  return runRemoteTask(task, options, ({ system, user }) =>
    runOpencode({
      prompt: `${system}\n\n${user}`,
      model: options.model,
      timeoutMs: options.timeoutMs,
      cwd,
      standalone: options.standalone,
    }),
  );
}

async function runPollinationsTask(task, options) {
  return runRemoteTask(task, options, ({ system, user }) =>
    runPollinations({
      system,
      user,
      model: options.model,
      timeoutMs: options.timeoutMs,
    }),
  );
}

async function runOllamaTask(task, options) {
  return runRemoteTask(task, options, ({ system, user }) =>
    runOllama({
      system,
      user,
      model: options.model,
      timeoutMs: options.timeoutMs,
    }),
  );
}

async function runDeepSeekTask(task, options) {
  return runRemoteTask(task, options, ({ system, user }) =>
    runDeepSeek({
      system,
      user,
      model: options.model,
      timeoutMs: options.timeoutMs,
    }),
  );
}

async function runTask(task, options) {
  const started = Date.now();
  let result;
  try {
    const output =
      options.provider === "fixture"
        ? await runFixture(task, options)
        : options.provider === "pollinations"
          ? await runPollinationsTask(task, options)
          : options.provider === "ollama"
            ? await runOllamaTask(task, options)
            : options.provider === "deepseek"
              ? await runDeepSeekTask(task, options)
              : await runOpencodeTask(task, options);
    const scored = scoreScenarioTask(task, output.first, output.second);
    result = {
      ...scored,
      ops: undefined,
      scenario: task.scenario,
      model: options.provider === "fixture" ? "fixture" : options.model,
      durationMs: Date.now() - started,
      repairs: output.repairs ?? 0,
      error: null,
      actionText: output.actionText ?? scored.actionText,
      firstResponse: options.saveResponses ? output.first.answer : undefined,
      secondResponse: options.saveResponses ? output.second?.answer : undefined,
      firstMeta: output.first.meta ?? null,
      secondMeta: output.second?.meta ?? null,
    };
  } catch (error) {
    result = {
      taskId: task.id,
      scenario: task.scenario,
      model: options.provider === "fixture" ? "fixture" : options.model,
      mode: options.mode,
      rawOps: 0,
      renderedOps: 0,
      validOps: 0,
      repairedOps: 0,
      droppedOps: 0,
      components: 0,
      complete: false,
      taskSuccess: false,
      interactionOk: false,
      reasons: [`provider error: ${error?.message ?? String(error)}`],
      interactionReasons: [`provider error: ${error?.message ?? String(error)}`],
      requireAnswer: Boolean(task.requireAnswer),
      requireAction: task.requireAction ?? null,
      interaction: Boolean(task.interaction),
      durationMs: Date.now() - started,
      repairs: 0,
      error: error?.message ?? String(error),
    };
  }
  if (!options.quiet) {
    const mark = result.complete ? "pass" : "FAIL";
    const detail = result.complete ? "" : ` — ${(result.interactionReasons?.length ? result.interactionReasons : result.reasons).join("; ")}`;
    console.log(`[${mark}] ${result.scenario}/${task.id} (${result.durationMs} ms)${detail}`);
  }
  return result;
}

async function runPool(tasks, options, onResult) {
  const queue = [...tasks];
  let active = 0;
  let index = 0;
  return new Promise((resolvePromise) => {
    const launch = () => {
      while (active < options.concurrency && queue.length) {
        const task = queue.shift();
        active += 1;
        runTask(task, options)
          .then((result) => {
            onResult(result, index++);
          })
          .finally(() => {
            active -= 1;
            if (!queue.length && active === 0) resolvePromise();
            else launch();
          });
      }
    };
    if (!queue.length) resolvePromise();
    else launch();
  });
}

function help() {
  console.log(`Usage: node bench/scenario-run.mjs [options]

  --provider fixture|opencode|pollinations|ollama|deepseek   default: fixture
  --model <name>                default: ${process.env.IUI_SCENARIO_MODEL ?? "opencode/deepseek-v4.1-flash-free"}
                                pollinations defaults to openai-fast
                                ollama defaults to ${process.env.IUI_OLLAMA_MODEL ?? "qwen2.5:7b"}
                                deepseek defaults to ${process.env.DEEPSEEK_MODEL ?? "deepseek-flash"}
  --mode fence|tool             default: fence
  --repeats <n>                 default: 1
  --scenario <id[,id]>          data-analysis, daily-travel, daily-life
  --id <task[,task]>            run specific task ids
  --limit <n>                   first n tasks after filters
  --concurrency <n>             default: 4
  --timeout <ms>                per model call, default: 180000
  --repair <0..n>               validation-feedback repair calls, default: 1
  --require <0..1>              fail when any scenario is below this
  --out <path>                  report path
  --no-save-responses           omit raw model text from the report
  --quiet                       print only the report
`);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    help();
    process.exit(2);
  }
  if (options.help) {
    help();
    return;
  }

  const scenarios = options.scenario.length
    ? options.scenario.map((id) => {
        const scenario = scenarioById(id);
        if (!scenario) throw new Error(`unknown scenario: ${id}`);
        return scenario;
      })
    : SCENARIOS;
  const tasks = filterScenarioTasks({
    ids: options.ids,
    limit: options.limit,
  }).filter((task) => scenarios.some((scenario) => scenario.id === task.scenario));
  if (!tasks.length) {
    console.error("no scenario tasks matched");
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  const runs = [];
  const expanded = [];
  for (let repeat = 0; repeat < options.repeats; repeat++) {
    for (const task of tasks) expanded.push({ ...task, __repeat: repeat });
  }

  await runPool(expanded, options, (result) => {
    runs.push(result);
  });

  const withMeta = attachTaskMeta(runs, tasks);
  const selected = new Set(tasks.map((task) => task.id));
  const registered = scenarios.map((scenario) => ({
    ...scenario,
    tasks: scenario.tasks.filter((task) => selected.has(task.id)),
  }));
  const aggregate = aggregateScenarios(withMeta, registered);
  const report = {
    schema: "iui-scenarios-v1",
    generatedAt: startedAt,
    provider: options.provider,
    model: options.provider === "fixture" ? "reference-fixture" : options.model,
    mode: options.mode,
    repeats: options.repeats,
    taskCount: tasks.length,
    ...aggregate,
    runs: withMeta.map(({ ops, ...rest }) => rest),
  };

  const defaultOut = resolve(
    HERE,
    "results/scenarios",
    options.provider === "fixture"
      ? "fixture.json"
      : `${options.provider}-${String(options.model).replace(/[^a-z0-9.-]+/gi, "-")}-${Date.now()}.json`,
  );
  const outPath = resolve(options.out ?? defaultOut);
  const markdownPath = outPath.replace(/\.json$/i, "") + ".md";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  const markdown = renderScenarioMarkdown(report);
  writeFileSync(markdownPath, markdown + "\n");

  if (!options.quiet) console.log("");
  console.log(markdown);
  console.log(`Report: ${outPath}`);
  console.log(`Markdown: ${markdownPath}`);

  const threshold = options.require ?? (options.provider === "fixture" ? 1 : null);
  if (threshold !== null) {
    const failed = aggregate.scenarios.filter((scenario) => scenario.coverage < threshold);
    if (failed.length) {
      console.error(
        `\nScenario coverage below ${(threshold * 100).toFixed(0)}%: ${failed
          .map((scenario) => `${scenario.id} ${(scenario.coverage * 100).toFixed(1)}%`)
          .join(", ")}`,
      );
      process.exit(1);
    }
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error?.stack ?? String(error));
    process.exit(1);
  });
}
