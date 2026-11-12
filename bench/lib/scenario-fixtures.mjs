/* =========================================================================
   Reference answers for the scenario suite.
   -------------------------------------------------------------------------
   These fixtures exist for two reasons:

     1. contract coverage — every registered task must be satisfiable by a
        complete answer that passes the same validator and scorer as a model
     2. action replay — every interaction task gets a real `[iui-action]`
        envelope and a second render with stable block ids

   A fixture pass is NOT evidence of model coverage. The report labels it
   separately and only a model run may claim the 90% target.
   ========================================================================= */

import { parseIuiAction, formatIuiAction } from "../../clone/dist-lib/agent.js";

const NOW = "2026-11-06T00:00:00Z";
const IMG = "https://example.com/iui/scenario.jpg";

const SERIES_COLORS = ["#3b82f6", "#f59e0b", "#10b981"];

function titleOf(task) {
  return task.title;
}

function keywordOf(task) {
  return task.keywords?.[0] ?? task.title;
}

function labelsOf(task) {
  return task.data?.labels ?? ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
}

function valuesOf(task) {
  return task.data?.values ?? [42, 48, 45, 53, 58, 61];
}

function provenance(task) {
  return {
    authority: "claimed",
    source: {
      id: `${task.scenario}-reference`,
      kind: "derived",
    },
    retrievedAt: NOW,
    verification: {
      sourceIdentity: "unverified",
      integrity: "unverified",
      schema: "valid",
      crossSource: "not_checked",
    },
    assumptions: ["Reference fixture data for contract coverage."],
  };
}

function actionFor(task) {
  if (!task.requireAction) return null;
  const name = task.requireAction;
  let args = {};
  if (name === "filter_segment") args = { segment: "enterprise" };
  if (name === "check_availability") args = { option: "Hotel Alfonso XIII" };
  if (name === "add_to_calendar") args = { date: "2026-11-14" };
  if (name === "create_reminder") args = { title: task.title, at: "2026-11-09T09:00:00Z" };
  return {
    id: "a1",
    name,
    ...(Object.keys(args).length ? { args } : {}),
    confirmHint: name.replaceAll("_", " "),
    riskHint: name === "export_report" || name === "filter_segment" || name === "check_availability" ? "read" : "reversible",
  };
}

function answerOp(task, compId, extra = {}) {
  if (!task.requireAnswer) return null;
  const action = actionFor(task);
  return {
    t: "answer",
    schemaVersion: "1.0",
    answerId: "scenario-answer",
    locale: "en-US",
    timeZone: "UTC",
    currency: "EUR",
    units: "metric",
    slots: {
      conclusion: { kind: "op", id: "conclusion" },
      ...(compId ? { primaryArtifact: { kind: "comp", id: compId } } : {}),
      ...(action ? { primaryAction: { kind: "action", id: action.id } } : {}),
    },
    ...(action ? { actions: [action] } : {}),
    provenance: provenance(task),
    ...extra,
  };
}

function chartProps(task) {
  const labels = labelsOf(task);
  const values = valuesOf(task).slice(0, labels.length);
  return {
    title: titleOf(task),
    sub: "Reference fixture",
    variant: "line",
    labels,
    series: [
      { name: "Current", values, color: SERIES_COLORS[0] },
      ...(task.data?.compare
        ? [{ name: "Previous", values: task.data.compare.slice(0, labels.length), color: SERIES_COLORS[1] }]
        : []),
    ],
    format: task.data?.format ?? "number",
    height: 220,
  };
}

function statsProps(task) {
  const metrics = task.data?.metrics ?? [
    { label: "Headline", value: "61%", change: "+4.2 pts", trend: "up" },
    { label: "Secondary", value: "1.8×", change: "+0.3×", trend: "up" },
    { label: "Watch", value: "3", change: "flat", trend: "flat" },
  ];
  return { title: titleOf(task), items: metrics };
}

function tableOp(task) {
  const head = task.data?.table?.head ?? ["Segment", "Current", "Previous", "Change"];
  const rows = task.data?.table?.rows ?? [
    ["Enterprise", "62%", "58%", "+4 pts"],
    ["Mid-market", "54%", "51%", "+3 pts"],
    ["Self-serve", "41%", "44%", "-3 pts"],
  ];
  return { t: "table", id: "table1", head, rows };
}

function matrixProps(task) {
  const columns = task.data?.matrix?.columns ?? [
    { label: "Impact" },
    { label: "Confidence" },
    { label: "Effort" },
  ];
  const rows = task.data?.matrix?.rows ?? [
    { label: `${keywordOf(task)} A`, values: [4, 3, 2] },
    { label: `${keywordOf(task)} B`, values: [2, 5, 4] },
    { label: `${keywordOf(task)} C`, values: [5, 2, 1] },
  ];
  return { title: titleOf(task), columns, rows, best: "high", format: "score" };
}

function timelineProps(task) {
  const items = task.data?.timeline ?? [
    { date: "2026-11-07", title: `${titleOf(task)} starts`, status: "done", tag: "Done" },
    { date: "2026-11-09", title: "Checkpoint", status: "current", tag: "Now" },
    { date: "2026-11-14", title: "Review", status: "upcoming", tag: "Next" },
  ];
  return { title: titleOf(task), items };
}

function cardProps(task) {
  return {
    eyebrow: task.scenario,
    title: titleOf(task),
    body: `A concise reference summary for ${titleOf(task)}.`,
    list: ["Keep the main trade-off visible", "Protect the reversible path", "Review before the next step"],
  };
}

function formulaProps(task) {
  return task.data?.formula ?? {
    title: titleOf(task),
    expression: "current × rate = forecast",
    result: "€2,640",
    vars: [
      { symbol: "c", label: "Current", value: "€220" },
      { symbol: "r", label: "Rate", value: "12" },
    ],
    steps: [{ label: "Multiply", expression: "220 × 12", result: "2,640" }],
  };
}

function tabsProps(task, selected) {
  return {
    title: titleOf(task),
    items: ["Quantitative", "Qualitative"],
    panels: {
      Quantitative: `${titleOf(task)}: the numeric view puts the main change at +12%.`,
      Qualitative: `${titleOf(task)}: the interview view says trust is the limiting factor.`,
    },
    select: selected ?? "Quantitative",
  };
}

function checklistProps(task, checkedFirst = false) {
  const items = task.data?.steps ?? [
    { time: "0:00", title: `${keywordOf(task)} prep`, detail: "Gather the inputs.", done: checkedFirst },
    { time: "0:10", title: `${keywordOf(task)} main`, detail: "Do the important work.", done: false },
    { time: "0:25", title: `${keywordOf(task)} review`, detail: "Check the result.", done: false },
  ];
  return { title: titleOf(task), total: items.length, items };
}

function dayListProps(task) {
  const items = task.data?.days ?? [
    {
      img: IMG,
      day: "Day 1",
      title: `${keywordOf(task)} morning`,
      body: "A gentle start with a short walk and coffee.",
      sleep: "Sleep: central hotel",
    },
    {
      img: IMG,
      day: "Day 2",
      title: `${keywordOf(task)} afternoon`,
      body: "The longer option, with a backup if it rains.",
      sleep: "Home by evening",
    },
  ];
  return { eyebrow: keywordOf(task), variant: "tall", items };
}

function mapProps(task, selected) {
  const groups = [
    { id: "all", label: "All" },
    { id: "scenic", label: "Scenic" },
    { id: "easy", label: "Easy" },
  ];
  const places = task.data?.places ?? [
    {
      id: "p1",
      name: `${keywordOf(task)} old town`,
      sub: "Short walk and coffee",
      group: "easy",
      x: 24,
      y: 38,
      stop: "Stop 1",
    },
    {
      id: "p2",
      name: `${keywordOf(task)} viewpoint`,
      sub: "Best light before noon",
      group: "scenic",
      x: 62,
      y: 31,
      stop: "Stop 2",
    },
    {
      id: "p3",
      name: `${keywordOf(task)} market`,
      sub: "Lunch and a rest",
      group: "easy",
      x: 48,
      y: 68,
      stop: "Stop 3",
    },
  ];
  return {
    height: 320,
    label: `${titleOf(task)} route`,
    groups,
    places,
    select: selected ?? "all",
    destCards: true,
  };
}

function calendarProps(task, selected) {
  const events = task.data?.events ?? [
    { date: "2026-11-10", title: `${keywordOf(task)} kickoff`, time: "09:00", tone: "neutral" },
    { date: "2026-11-12", title: `${keywordOf(task)} focus block`, time: "14:00", tone: "success" },
    { date: "2026-11-14", title: `${keywordOf(task)} review`, time: "16:00", tone: "warning" },
  ];
  return {
    title: titleOf(task),
    month: "2026-11",
    weekStart: 1,
    locale: "en-US",
    today: "2026-11-06",
    select: selected ?? "2026-11-12",
    events,
  };
}

function packingProps(task) {
  const groups = task.data?.groups ?? [
    {
      label: `${keywordOf(task)} essentials`,
      items: [{ text: "Item one", done: true }, { text: "Item two" }],
    },
    { label: "Extras", items: [{ text: "Item three" }, { text: "Item four" }] },
  ];
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return { title: titleOf(task), total, groups };
}

function stepsProps(task, start = 0) {
  const steps = task.data?.guideSteps ?? [
    {
      title: `${keywordOf(task)} setup`,
      find: "the starting position",
      body: "Set up the space and remove distractions.",
      check: { title: "Setup complete", detail: "Everything is within reach." },
    },
    {
      title: `${keywordOf(task)} main`,
      find: "the main movement",
      body: "Do the main block at an easy pace.",
      check: { title: "Main block done", detail: "Breathing is still controlled." },
    },
    {
      title: `${keywordOf(task)} finish`,
      find: "the cool-down",
      body: "Slow down and note how it felt.",
      check: { title: "Finish logged", detail: "One line in the log." },
    },
  ];
  return {
    title: titleOf(task),
    sub: "Reference walkthrough",
    caption: "Three steps, one check each.",
    start,
    steps,
  };
}

function calculatorProps(task) {
  return {
    title: titleOf(task),
    label: keywordOf(task),
    unit: "servings",
    value: 2,
    min: 1,
    max: 8,
    rows: task.data?.calculatorRows ?? [
      { name: "Main ingredient", per: 0.5, unit: "lb" },
      { name: "Side", per: 0.25, unit: "lb" },
    ],
    note: "Reference quantities.",
  };
}

function menuProps(task) {
  const items = task.data?.menu ?? [
    { img: IMG, title: `${keywordOf(task)} plate one`, body: "Seasonal and light." },
    { img: IMG, title: `${keywordOf(task)} plate two`, body: "The local favourite." },
  ];
  return { items };
}

function chipsProps(task) {
  return { items: [`${keywordOf(task)} option`, "Keep it simple", "Show the details"] };
}

function compFor(task, type, selected) {
  switch (type) {
    case "chart":
      return { t: "comp", id: "c1", type, props: chartProps(task) };
    case "stats":
      return { t: "comp", id: "c1", type, props: statsProps(task) };
    case "matrix":
      return { t: "comp", id: "c1", type, props: matrixProps(task) };
    case "timeline":
      return { t: "comp", id: "c1", type, props: timelineProps(task) };
    case "card":
      return { t: "comp", id: "c1", type, props: cardProps(task) };
    case "formula":
      return { t: "comp", id: "c1", type, props: formulaProps(task) };
    case "tabs":
      return { t: "comp", id: "c1", type, props: tabsProps(task, selected) };
    case "checklist":
      return { t: "comp", id: "c1", type, props: checklistProps(task) };
    case "dayList":
      return { t: "comp", id: "c1", type, props: dayListProps(task) };
    case "map":
      return { t: "comp", id: "c1", type, props: mapProps(task, selected) };
    case "calendar":
      return { t: "comp", id: "c1", type, props: calendarProps(task, selected) };
    case "packing":
      return { t: "comp", id: "c1", type, props: packingProps(task) };
    case "steps":
      return { t: "comp", id: "c1", type, props: stepsProps(task, typeof selected === "number" ? selected : 0) };
    case "calculator":
      return { t: "comp", id: "c1", type, props: calculatorProps(task) };
    case "menu":
      return { t: "comp", id: "c1", type, props: menuProps(task) };
    case "chips":
      return { t: "comp", id: "c1", type, props: chipsProps(task) };
    default:
      return { t: "comp", id: "c1", type, props: { title: titleOf(task) } };
  }
}

function selectedForTurn(task, turn) {
  if (turn < 2 || !task.interaction) return undefined;
  return task.interaction.nextValue;
}

export function buildReferenceOps(task, { turn = 1 } = {}) {
  const selected = selectedForTurn(task, turn);
  const required = task.required ?? [];
  const compTypes = required.filter((type) => type !== "table");
  const firstCompId = compTypes.length ? "c1" : "table1";
  const answer = answerOp(task, firstCompId);
  const ops = [];
  if (answer) ops.push(answer);
  ops.push(
    { t: "p", lvl: 0, id: "conclusion" },
    {
      t: "md",
      v:
        turn > 1
          ? `Updated ${titleOf(task)} for ${String(selected)}. The other blocks are unchanged.`
          : `${titleOf(task)}: ${task.keywords.join(" · ")}. ${task.prompt.split(/(?<=\.)\s/)[0] ?? ""}`,
    },
  );

  let compIndex = 0;
  for (const type of required) {
    if (type === "table") {
      ops.push(tableOp(task));
      continue;
    }
    const id = `c${compIndex + 1}`;
    const op = compFor(task, type, selected);
    op.id = id;
    // Keep the interaction block's id stable across turns.
    if (task.interaction?.blockType === type) op.id = "interaction";
    ops.push(op);
    compIndex += 1;
  }

  // The answer's primaryArtifact must point at a real component id.
  if (answer?.slots?.primaryArtifact) {
    const firstComp = ops.find((op) => op.t === "comp");
    if (firstComp) answer.slots.primaryArtifact = { kind: "comp", id: firstComp.id };
  }

  ops.push({ t: "ask", v: ["Go deeper", "Make it shorter"] }, { t: "done" });
  return ops;
}

export function buildReferenceResponse(task, { turn = 1, mode = "fence" } = {}) {
  const ops = buildReferenceOps(task, { turn });
  if (mode === "tool") return { toolArgs: JSON.stringify({ ops }), answer: "" };
  const lines = ops.map((op) => JSON.stringify(op)).join("\n");
  return {
    answer: `Here is the structured answer.\n\n\`\`\`iui\n${lines}\n\`\`\`\n`,
    toolArgs: "",
  };
}

/**
 * A real block action for the task's interaction target.
 * The envelope has the same shape the adapter sends to a host.
 */
export function buildInteractionEnvelope(task, ops) {
  if (!task.interaction) return null;
  const target = ops.find(
    (op) => op.t === "comp" && op.type === task.interaction.blockType,
  );
  if (!target) return null;
  const answer = ops.find((op) => op.t === "answer");
  return {
    action: task.interaction.action,
    blockId: target.id,
    blockType: target.type,
    ...(answer?.answerId ? { answerId: answer.answerId } : {}),
    payload: task.interaction.payload ?? {},
  };
}

export function formatInteraction(task, ops) {
  const envelope = buildInteractionEnvelope(task, ops);
  return envelope ? formatIuiAction(envelope) : null;
}

export function parseInteraction(text) {
  return parseIuiAction(text);
}

/** Validate that a second-turn answer keeps the target id and applies the value. */
export function checkInteractionUpdate(task, firstOps, secondOps, secondText = "") {
  const reasons = [];
  const target = firstOps.find(
    (op) => op.t === "comp" && op.type === task.interaction?.blockType,
  );
  if (!target) {
    reasons.push(`interaction target ${task.interaction?.blockType} is missing in turn 1`);
    return { ok: false, reasons };
  }
  const updated = secondOps.find(
    (op) => op.t === "comp" && op.id === target.id && op.type === target.type,
  );
  if (!updated) reasons.push(`turn 2 did not keep block id "${target.id}"`);
  const expected = task.interaction.nextValue;
  const haystack = JSON.stringify(secondOps) + "\n" + secondText;
  if (expected !== undefined && !haystack.includes(JSON.stringify(expected))) {
    reasons.push(`turn 2 does not contain the selected value ${JSON.stringify(expected)}`);
  }
  const comps = secondOps.filter((op) => op.t === "comp");
  const ids = comps.map((op) => op.id);
  if (new Set(ids).size !== ids.length) reasons.push("turn 2 has duplicate component ids");
  return { ok: reasons.length === 0, reasons };
}

export function referenceInteractionUpdate(task) {
  return {
    ops: buildReferenceOps(task, { turn: 2 }),
    response: buildReferenceResponse(task, { turn: 2 }),
  };
}
