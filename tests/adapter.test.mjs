import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionFromBlockEvent,
  formatIuiActionMessage,
  shouldSendAction,
} from "../packages/adapter/dist/index.js";

const selectEvent = {
  type: "block",
  answerId: "a1",
  name: "select",
  detail: { blockId: "c1", blockType: "tabs", value: "Option B" },
};

test("agent policy forwards meaningful interactions but not local toggles", () => {
  assert.equal(shouldSendAction(selectEvent), true);
  assert.equal(shouldSendAction({ ...selectEvent, name: "change" }), false);
  assert.equal(shouldSendAction({ ...selectEvent, name: "submit" }), false);
  assert.equal(shouldSendAction({ ...selectEvent, name: "flip" }), false);
  assert.equal(shouldSendAction({ ...selectEvent, name: "change" }, "all"), true);
  assert.equal(shouldSendAction(selectEvent, "prompt"), false);
  assert.equal(shouldSendAction(selectEvent, (event) => event.name === "select"), true);
});

test("block events become a stable action envelope", () => {
  const action = actionFromBlockEvent(selectEvent);
  assert.equal(action.kind, "block");
  assert.deepEqual(action.envelope, {
    action: "select",
    blockId: "c1",
    blockType: "tabs",
    answerId: "a1",
    payload: { value: "Option B" },
  });
  assert.match(formatIuiActionMessage(action), /^\[iui-action\] /);
});

test("prompt actions stay plain text", () => {
  assert.equal(
    formatIuiActionMessage({ kind: "prompt", text: "Make day 2 easier" }),
    "Make day 2 easier",
  );
});
