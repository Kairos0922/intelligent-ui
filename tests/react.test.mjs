import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { IntelligentUI } from "../packages/react/dist/index.js";

test("IntelligentUI exports the forwardRef component", () => {
  assert.strictEqual(typeof IntelligentUI, "object");
});

test("IntelligentUI renders the answer container div (SSR)", () => {
  const html = renderToString(
    h(IntelligentUI, {
      ops: [{ t: "set", id: "a1", path: "title", v: "Hi" }],
      className: "iui-test",
      theme: "inherit",
    }),
  );
  assert.match(html, /^<div class="iui-test"><\/div>$/);
});

test("IntelligentUI renders without ops, wire or source", () => {
  const html = renderToString(h(IntelligentUI, {}));
  assert.match(html, /^<div><\/div>$/);
});
