import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionFromAnswerEvent,
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


test("manifest-declared actions are forwarded under the agent policy", () => {
  const manifest = {
    schemaVersion: "1.0",
    hostId: "test",
    capabilities: {
      canNotify: false,
      canPersist: false,
      canOpenWallet: true,
      canVerifyPass: true,
      canWriteCalendar: false,
      canDeepLink: true,
    },
    actions: [
      {
        name: "refresh",
        description: "Refresh",
        risk: "reversible",
        requiresConfirmation: true,
        idempotent: true,
        compensation: "reversible",
        timeoutMs: 5000,
      },
    ],
  };
  const event = { ...selectEvent, name: "refresh" };
  assert.equal(shouldSendAction(event), false);
  assert.equal(shouldSendAction(event, "agent", manifest), true);
});

test("answer actions become a host action", () => {
  const action = actionFromAnswerEvent({
    type: "action",
    answerId: "a1",
    actionId: "act1",
    name: "open_qr",
    args: { passId: "p1" },
    riskHint: "read",
  });
  assert.equal(action.kind, "action");
  assert.equal(action.actionId, "act1");
  assert.match(formatIuiActionMessage(action), /^\[iui-action\] /);
  assert.match(formatIuiActionMessage(action), /open_qr/);
});
