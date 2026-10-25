/* =========================================================================
   Benchmark scoring — structural success, not an LLM judge.
   -------------------------------------------------------------------------
   One response is scored on four things:
     1. every raw op is classified as valid / repaired / dropped by core
     2. the rendered answer contains the task's required block types
     3. those blocks have enough real data to be useful (shape checks)
     4. the response names at least one task keyword

   This is deliberately conservative: a beautifully worded answer with a
   missing chart fails, and a structurally valid answer that never mentions
   the subject also fails.
   ========================================================================= */

import {
  BLOCK_TYPES,
  parseAgentText,
  validateOps,
} from "../../clone/dist-lib/agent.js";

const isArray = (value) => Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);

function hasItems(value, min = 1) {
  return isArray(value) && value.length >= min;
}

function everyItem(value, min, check) {
  return hasItems(value, min) && value.every((item) => isObject(item) && check(item));
}

export const BLOCK_SHAPES = {
  chart: (props) =>
    hasItems(props.labels, 3) &&
    hasItems(props.series, 1) &&
    props.series.every(
      (series) =>
        isObject(series) &&
        isNonEmptyString(series.name) &&
        isArray(series.values) &&
        series.values.length >= props.labels.length &&
        series.values.every((value) => typeof value === "number" && Number.isFinite(value)),
    ),
  stats: (props) =>
    everyItem(props.items, 2, (item) => isNonEmptyString(item.label) && item.value !== undefined),
  timeline: (props) =>
    everyItem(props.items, 2, (item) => isNonEmptyString(item.date) && isNonEmptyString(item.title)),
  calendar: (props) =>
    typeof props.month === "string" &&
    /^\d{4}-\d{1,2}$/.test(props.month) &&
    hasItems(props.events, 1) &&
    props.events.every(
      (event) =>
        isObject(event) &&
        /^\d{4}-\d{2}-\d{2}$/.test(event.date ?? "") &&
        isNonEmptyString(event.title),
    ),
  checklist: (props) =>
    typeof props.total === "number" &&
    everyItem(props.items, 2, (item) => isNonEmptyString(item.title)),
  packing: (props) =>
    typeof props.total === "number" &&
    hasItems(props.groups, 1) &&
    props.groups.every(
      (group) => isObject(group) && hasItems(group.items, 2) && isNonEmptyString(group.label),
    ),
  card: (props) => isNonEmptyString(props.title),
  dayList: (props) =>
    everyItem(props.items, 2, (item) => isNonEmptyString(item.title) && isNonEmptyString(item.body)),
  chips: (props) => hasItems(props.items, 1),
  calculator: (props) =>
    isNonEmptyString(props.label) &&
    typeof props.value === "number" &&
    everyItem(props.rows, 2, (row) => isNonEmptyString(row.name)),
  tabs: (props) =>
    hasItems(props.items, 2) &&
    isObject(props.panels) &&
    props.items.every((item) => typeof props.panels[item] === "string"),
  matrix: (props) =>
    everyItem(props.columns, 2, (column) => isNonEmptyString(column.label)) &&
    everyItem(
      props.rows,
      2,
      (row) =>
        isNonEmptyString(row.label) &&
        isArray(row.values) &&
        row.values.length >= props.columns.length,
    ),
  code: (props) => isNonEmptyString(props.code) && props.code.includes("\n"),
  diff: (props) =>
    everyItem(
      props.lines,
      2,
      (line) => ["add", "del", "ctx", "hunk"].includes(line.t) && typeof line.text === "string",
    ),
  fileTree: (props) => everyItem(props.items, 2, (item) => isNonEmptyString(item.path)),
  formula: (props) =>
    isNonEmptyString(props.expression) &&
    (isNonEmptyString(props.result) || hasItems(props.steps, 1)),
  flashcards: (props) =>
    everyItem(props.cards, 2, (card) => isNonEmptyString(card.front) && isNonEmptyString(card.back)),
};

const TABLE_SHAPE = (op) => hasItems(op.head, 1) && hasItems(op.rows, 2);

function wantedShape(type, op) {
  if (type === "table") return op.t === "table" && TABLE_SHAPE(op);
  if (op.t !== "comp" || op.type !== type) return false;
  const check = BLOCK_SHAPES[type];
  return check ? check(op.props ?? {}) : true;
}

function extractRaw({ mode, answer = "", toolArgs = "" }) {
  const issues = [];
  let raw = [];

  if (mode === "tool") {
    if (!toolArgs.trim()) {
      return { raw, issues: [{ path: "$", message: "no render_iui tool call" }] };
    }
    try {
      const parsed = JSON.parse(toolArgs);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.ops)) {
        raw = parsed.ops;
      } else {
        issues.push({ path: "$", message: "tool arguments are missing an ops array" });
      }
    } catch {
      issues.push({ path: "$", message: "tool arguments are not valid JSON" });
    }
    return { raw, issues };
  }

  const parsed = parseAgentText(answer, { sanitize: false });
  return { raw: parsed.ops, issues: parsed.issues };
}

function countOps(raw) {
  let valid = 0;
  let repaired = 0;
  let dropped = 0;
  const issues = [];
  for (const op of raw) {
    const result = validateOps([op], { blocks: BLOCK_TYPES, sanitize: true });
    for (const issue of result.issues) issues.push(issue);
    if (!result.ops.length) dropped += 1;
    else if (result.issues.length) repaired += 1;
    else valid += 1;
  }
  return { valid, repaired, dropped, issues };
}

function keywordHit(task, content) {
  if (!Array.isArray(task.keywords) || !task.keywords.length) return true;
  const haystack = content.toLowerCase();
  return task.keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
}

/**
 * Score one model response.
 *
 * @param {object} input
 * @param {object} input.task benchmark task
 * @param {"fence"|"tool"} input.mode response transport
 * @param {string} [input.answer] full text answer (fence mode)
 * @param {string} [input.toolArgs] accumulated tool arguments (tool mode)
 * @param {string} [input.response] optional raw response kept in reports
 */
export function scoreResponse({ task, mode, answer = "", toolArgs = "", response }) {
  const extracted = extractRaw({ mode, answer, toolArgs });
  const raw = extracted.raw;
  const opStats = countOps(raw);
  const validated = validateOps(raw, { blocks: BLOCK_TYPES, sanitize: true });
  const rendered = validated.ops;
  const comps = rendered.filter((op) => op.t === "comp");
  const reasons = [];

  if (!raw.length) reasons.push("no ops");
  if (extracted.issues.length) reasons.push(...extracted.issues.map((issue) => issue.message));
  if (!rendered.length) reasons.push("no renderable ops");

  for (const type of task.required ?? []) {
    if (!rendered.some((op) => wantedShape(type, op))) reasons.push(`missing usable ${type}`);
  }

  const ids = comps.map((op) => op.id);
  if (new Set(ids).size !== ids.length) reasons.push("duplicate component ids");
  if (comps.length > 6) reasons.push(`too many components (${comps.length} > 6)`);

  const searchable = [
    answer,
    toolArgs,
    JSON.stringify(rendered),
  ].join("\n");
  if (!keywordHit(task, searchable)) {
    reasons.push(`missing task keyword (${(task.keywords ?? []).join(" / ")})`);
  }

  return {
    taskId: task.id,
    category: task.category,
    mode,
    rawOps: raw.length,
    renderedOps: rendered.length,
    validOps: opStats.valid,
    repairedOps: opStats.repaired,
    droppedOps: opStats.dropped,
    components: comps.length,
    issues: [...extracted.issues, ...validated.issues],
    taskSuccess: reasons.length === 0,
    reasons,
    response: typeof response === "string" ? response.slice(0, 24_000) : undefined,
    ops: rendered,
  };
}

/* ---------------------------------------------------------------- fixtures */

function block(type, title, keyword, index) {
  const id = `c${index + 1}`;
  const image = `https://example.com/iui/${index + 1}.jpg`;
  const props = {
    chart: {
      title,
      labels: ["Mon", "Tue", "Wed", "Thu"],
      series: [
        { name: "This week", values: [42, 58, 51, 67] },
        { name: "Last week", values: [38, 49, 47, 55] },
      ],
      format: "number",
    },
    stats: {
      title,
      items: [
        { label: "Primary", value: "82%", change: "+6 pts", trend: "up" },
        { label: "Secondary", value: "41", change: "-3", trend: "down" },
        { label: "Watch", value: "4", change: "flat", trend: "flat" },
      ],
    },
    timeline: {
      title,
      items: [
        { date: "2026-09-18", title: `${keyword} starts`, status: "done", tag: "Done" },
        { date: "2026-10-25", title: `${keyword} check`, status: "current", tag: "Now" },
        { date: "2026-11-12", title: `${keyword} next`, status: "upcoming", tag: "Next" },
      ],
    },
    calendar: {
      title,
      month: "2026-10",
      weekStart: 1,
      events: [
        { date: "2026-10-14", title: `${keyword} review`, time: "09:30" },
        { date: "2026-10-20", title: `${keyword} checkpoint`, time: "16:00", tone: "success" },
      ],
    },
    checklist: {
      title,
      total: 3,
      items: [
        { time: "0:00", title: `${keyword} prep`, detail: "Gather the inputs." },
        { time: "0:20", title: `${keyword} main`, detail: "Do the important work." },
        { time: "0:50", title: `${keyword} review`, detail: "Check the result." },
      ],
    },
    packing: {
      title,
      total: 4,
      groups: [
        {
          label: `${keyword} essentials`,
          items: [{ text: "Item one", done: true }, { text: "Item two" }],
        },
        { label: "Extras", items: [{ text: "Item three" }, { text: "Item four" }] },
      ],
    },
    card: {
      eyebrow: taskCategory(index),
      title,
      body: `A short ${keyword} summary with the key trade-off stated plainly.`,
      list: ["Keep the simple option", "Protect the important block", "Review at the end"],
    },
    dayList: {
      eyebrow: keyword,
      variant: "tall",
      items: [
        {
          img: image,
          day: "Day 1",
          title: `${keyword} first stop`,
          body: "A gentle start with a short walk and coffee.",
          sleep: "Sleep nearby",
        },
        {
          img: image,
          day: "Day 2",
          title: `${keyword} second stop`,
          body: "The longer option, with a backup if it rains.",
          sleep: "Home by evening",
        },
      ],
    },
    chips: { items: [`${keyword} option`, "Keep it simple", "Show the details"] },
    calculator: {
      label: keyword,
      title,
      unit: "servings",
      value: 4,
      min: 2,
      max: 12,
      rows: [
        { name: "Main ingredient", per: 0.5, unit: "lb" },
        { name: "Side", per: 0.25, unit: "lb" },
      ],
    },
    tabs: {
      title,
      items: ["Option A", "Option B"],
      panels: {
        "Option A": `${keyword} option A has lower effort and narrower reach.`,
        "Option B": `${keyword} option B has higher effort and a stronger payoff.`,
      },
    },
    matrix: {
      title,
      columns: [{ label: "Reach" }, { label: "Effort" }, { label: "Risk" }],
      rows: [
        { label: `${keyword} option A`, values: [4, 2, 3] },
        { label: `${keyword} option B`, values: [7, 5, 4] },
      ],
      best: "high",
    },
    code: {
      title,
      path: `src/${keyword}.ts`,
      lang: "ts",
      code: `export function ${String(keyword).replace(/[^a-z0-9]/gi, "") || "run"}() {\n  return "ready";\n}`,
    },
    diff: {
      title,
      path: `src/${keyword}.ts`,
      lines: [
        { t: "ctx", text: "export function run() {" },
        { t: "del", text: "  return oldValue;" },
        { t: "add", text: "  return newValue;" },
        { t: "ctx", text: "}" },
      ],
    },
    fileTree: {
      title,
      root: "intelligent-ui/",
      items: [
        { path: "src/", type: "dir" },
        { path: "src/sdk/", type: "dir" },
        { path: `src/sdk/${keyword}.ts`, status: "modified", note: "candidate" },
      ],
    },
    formula: {
      title,
      expression: "monthly × 12 = annual",
      result: "$2,640",
      vars: [
        { symbol: "m", label: "Monthly", value: "$220" },
        { symbol: "n", label: "Months", value: "12" },
      ],
      steps: [{ label: "Multiply", expression: "220 × 12", result: "2,640" }],
    },
    flashcards: {
      title,
      cards: [
        { front: `${keyword} prompt one`, back: "A short answer.", tag: "recall" },
        { front: `${keyword} prompt two`, back: "Another short answer." },
      ],
    },
  };
  return { t: "comp", id, type, props: props[type] ?? { title } };
}

function taskCategory(index) {
  return ["Plan", "Compare", "Track", "Review"][index % 4];
}

export function mockOpsForTask(task) {
  const ops = [
    { t: "p", lvl: 0 },
    { t: "md", v: `${task.title}: ${(task.keywords ?? []).join(" · ")}. Here is the structured view.` },
  ];
  const types = task.required ?? [];
  types.forEach((type, index) => {
    if (type === "table") {
      ops.push({
        t: "table",
        head: ["Option", "Value", "Trade-off"],
        rows: [
          [`${task.keywords?.[0] ?? task.title} A`, "Low", "Simpler"],
          [`${task.keywords?.[1] ?? task.title} B`, "High", "More reach"],
        ],
      });
      return;
    }
    ops.push(block(type, task.title, task.keywords?.[0] ?? task.title, index));
  });
  ops.push({ t: "ask", v: ["Go deeper", "Make it shorter"] });
  ops.push({ t: "done" });
  return ops;
}

export function mockResponseForTask(task, mode) {
  const ops = mockOpsForTask(task);
  if (mode === "tool") return { toolArgs: JSON.stringify({ ops }), answer: "" };
  const lines = ops.map((op) => JSON.stringify(op)).join("\n");
  return {
    answer: `Here is the structured answer.\n\n\`\`\`iui\n${lines}\n\`\`\`\n`,
    toolArgs: "",
  };
}

/* --------------------------------------------------------------- aggregate */

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function aggregate(runs) {
  const rawOps = runs.reduce((sum, run) => sum + run.rawOps, 0);
  const validOps = runs.reduce((sum, run) => sum + run.validOps, 0);
  const repairedOps = runs.reduce((sum, run) => sum + run.repairedOps, 0);
  const droppedOps = runs.reduce((sum, run) => sum + run.droppedOps, 0);
  const successes = runs.filter((run) => run.taskSuccess).length;
  const tasksWithRepair = runs.filter((run) => run.repairedOps > 0).length;
  const ttfts = runs.map((run) => run.ttftMs).filter((value) => typeof value === "number");
  const ttfs = runs.map((run) => run.ttfbMs).filter((value) => typeof value === "number");

  return {
    runs: runs.length,
    tasks: new Set(runs.map((run) => run.taskId)).size,
    rawOps,
    validOps,
    repairedOps,
    droppedOps,
    validOpsRate: rawOps ? validOps / rawOps : 0,
    repairedOpRate: rawOps ? repairedOps / rawOps : 0,
    droppedOpRate: rawOps ? droppedOps / rawOps : 0,
    tasksWithRepairRate: runs.length ? tasksWithRepair / runs.length : 0,
    taskSuccessRate: runs.length ? successes / runs.length : 0,
    successes,
    ttftP50Ms: percentile(ttfts, 50),
    ttftP95Ms: percentile(ttfts, 95),
    firstBlockP50Ms: percentile(ttfs, 50),
    firstBlockP95Ms: percentile(ttfs, 95),
  };
}
