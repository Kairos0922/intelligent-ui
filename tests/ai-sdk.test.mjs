import { test } from "node:test";
import assert from "node:assert/strict";
import { isIuiToolPart } from "../packages/ai-sdk/dist/index.js";

test("dynamic tool parts match only render_iui", () => {
  assert.equal(isIuiToolPart({ type: "tool-render_iui" }), true);
  assert.equal(isIuiToolPart({ type: "dynamic-tool", toolName: "render_iui" }), true);
  assert.equal(isIuiToolPart({ type: "dynamic-tool", toolName: "other" }), false);
  assert.equal(isIuiToolPart({ type: "dynamic-tool" }), false);
  assert.equal(isIuiToolPart({ type: "tool-other" }), false);
});
