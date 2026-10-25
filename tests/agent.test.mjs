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
