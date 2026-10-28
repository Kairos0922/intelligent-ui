import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCK_CATALOG,
  BLOCK_TYPES,
  IUI_TOOL_NAME,
  formatIuiAction,
  iuiSystemPrompt,
  iuiTool,
  iuiToolDescription,
  opsFromToolCall,
  opsToMarkdown,
  parseIuiAction,
  registerBlockSpec,
  selectPromptBlocks,
  validateNdjson,
  validateOps,
} from "../clone/dist-lib/agent.js";

test("core catalog contains only general-purpose blocks", () => {
  const blocks = selectPromptBlocks();
  assert.equal(blocks.length, 30);
  assert.equal(BLOCK_CATALOG.length, 30);
  assert.equal(blocks.some((block) => block.kind === "demo"), false);
  assert.equal(selectPromptBlocks({ kinds: ["demo"] }).length, 0);
  assert.equal(selectPromptBlocks({ include: ["dayList"] }).length, 1);
  for (const type of ["chart", "stats", "timeline", "calendar", "matrix", "code", "diff", "fileTree", "formula", "flashcards"]) {
    assert.equal(selectPromptBlocks({ include: [type] }).length, 1, `${type} missing`);
  }
  const chart = BLOCK_CATALOG.find((block) => block.type === "chart");
  assert.ok(chart?.state?.some((item) => item.path === "series"));
  const matrix = BLOCK_CATALOG.find((block) => block.type === "matrix");
  assert.ok(matrix?.state?.some((item) => item.path === "rows"));
  assert.match(iuiSystemPrompt(), /state: labels \(replace x-axis labels\)/);
});

test("runtime registration extends prompts and validation", () => {
  const dispose = registerBlockSpec({
    type: "testBlock",
    title: "Test block",
    description: "A runtime-registered test block.",
    kind: "content",
    props: { type: "object", properties: {} },
  });
  assert.equal(selectPromptBlocks().length, 31);
  assert.equal(BLOCK_TYPES.has("testBlock"), true);
  assert.match(iuiTool().function.description, /testBlock/);
  dispose();
  assert.equal(selectPromptBlocks().length, 30);
  assert.equal(BLOCK_TYPES.has("testBlock"), false);
});

test("tool contract is complete and uses render_iui", () => {
  const tool = iuiTool();
  assert.equal(tool.function.name, IUI_TOOL_NAME);
  assert.equal(tool.function.name, "render_iui");
  assert.match(tool.function.description, /dayList/);
  assert.doesNotMatch(tool.function.description, /billSplitter/);
  assert.match(tool.function.description, /Call this tool once/);
  assert.equal(tool.function.parameters.type, "object");
  assert.equal(tool.function.parameters.required[0], "ops");
  assert.ok(tool.function.parameters.properties.ops.items.properties.type.enum.includes("dayList"));
});

test("tool-mode prompt teaches tool calls, not only fences", () => {
  const prompt = iuiSystemPrompt({ mode: "tool" });
  assert.match(prompt, /Call the `render_iui` tool exactly once/);
  assert.doesNotMatch(prompt, /```iui/);
  assert.match(prompt, /## Block catalog \(30 types\)/);
  assert.match(prompt, /\[iui-action\]/);
});

test("fence-mode prompt remains the default and has no demo blocks", () => {
  const prompt = iuiSystemPrompt();
  assert.match(prompt, /fenced code block tagged `iui`/);
  assert.match(prompt, /## Block catalog \(30 types\)/);
  assert.doesNotMatch(prompt, /billSplitter —/);
});

test("tool description can be used without a system prompt channel", () => {
  const description = iuiToolDescription();
  assert.match(description, /Protocol:/);
  assert.match(description, /Block catalog \(30 types\)/);
  assert.match(description, /dayList/);
});

test("tool-call extraction validates and drops unknown blocks", () => {
  const result = opsFromToolCall({
    ops: [
      { t: "p", lvl: 0 },
      { t: "md", v: "hello" },
      { t: "comp", id: "c1", type: "not-a-block", props: {} },
      { t: "done" },
    ],
  });
  assert.equal(result.ops.some((op) => op.t === "comp"), false);
  assert.ok(result.issues.length > 0);
});

test("action envelope round-trips", () => {
  const wire = formatIuiAction({
    action: "select",
    blockId: "c1",
    blockType: "tabs",
    answerId: "a1",
    payload: { value: "Option B" },
  });
  const parsed = parseIuiAction(wire);
  assert.deepEqual(parsed, {
    action: "select",
    blockId: "c1",
    blockType: "tabs",
    answerId: "a1",
    payload: { value: "Option B" },
  });
  assert.equal(parseIuiAction("ordinary message"), null);
});

test("server-side validation accepts catalog blocks without a DOM registry", () => {
  const result = validateOps([
    { t: "comp", id: "card1", type: "card", props: { title: "Server safe" } },
    { t: "done" },
  ]);
  assert.equal(result.ops.length, 2);
  assert.equal(result.ops[0].t, "comp");
  assert.equal(result.ops[0].type, "card");
  assert.deepEqual(result.issues, []);
});

test("validation limits and set URL sanitization", () => {
  const limited = validateOps(
    [
      { t: "p" },
      { t: "p" },
      { t: "done" },
    ],
    { maxOps: 1 },
  );
  assert.equal(limited.ops.length, 1);
  assert.ok(limited.issues.some((issue) => issue.message.includes("op limit")));

  const bytes = validateOps(
    [{ t: "comp", id: "c1", type: "card", props: { title: "x" } }],
    { maxTotalBytes: 5 },
  );
  assert.equal(bytes.ops.length, 0);
  assert.ok(bytes.issues.some((issue) => issue.message.includes("answer exceeds")));

  const unsafe = validateOps([{ t: "set", id: "c1", path: "img", v: "javascript:alert(1)" }]);
  assert.equal(unsafe.ops.length, 0);
  assert.ok(unsafe.issues.some((issue) => issue.message.includes("unsafe img URL")));

  const safe = validateOps([{ t: "set", id: "c1", path: "img", v: "https://example.com/a.png" }]);
  assert.equal(safe.ops.length, 1);

  const large = validateOps(
    [{ t: "set", id: "c1", path: "title", v: "x".repeat(100) }],
    { maxPropsBytes: 20 },
  );
  assert.equal(large.ops.length, 0);
  assert.ok(large.issues.some((issue) => issue.message.includes("set value exceeds")));
});

test("duplicate component ids are dropped in a batch", () => {
  const result = validateOps([
    { t: "comp", id: "same", type: "card", props: { title: "One" } },
    { t: "comp", id: "same", type: "card", props: { title: "Two" } },
    { t: "done" },
  ]);
  assert.equal(result.ops.filter((op) => op.t === "comp").length, 1);
  assert.ok(result.issues.some((issue) => issue.message.includes("duplicate component id")));
});

test("NDJSON validation uses the catalog default", () => {
  const result = validateNdjson(
    '{"t":"comp","id":"c1","type":"card","props":{"title":"NDJSON"}}\n{"t":"done"}\n',
  );
  assert.equal(result.ops.length, 2);
  assert.equal(result.ops[0].t, "comp");
});

test("markdown fallback preserves prose and tables", () => {
  const markdown = opsToMarkdown([
    { t: "p", lvl: 2 },
    { t: "md", v: "Plan" },
    { t: "p", lvl: 0 },
    { t: "md", v: "Body" },
    { t: "table", head: ["A", "B"], rows: [["1", "2"]] },
    { t: "comp", id: "c1", type: "dayList", props: {} },
    { t: "ask", v: ["Next"] },
  ]);
  assert.match(markdown, /^## Plan/m);
  assert.match(markdown, /Body/);
  assert.match(markdown, /\| A \| B \|/);
  assert.match(markdown, /\[Interactive dayList\]/);
  assert.match(markdown, /Suggested replies/);
});
