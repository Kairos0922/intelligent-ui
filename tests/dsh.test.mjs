import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../packages/dsh/lib/index.js";
import {
  DSH_ALLOWED_RISKS,
  DSH_MANIFEST,
} from "../packages/dsh/lib/index.js";

function register() {
  let tool;
  let prompt = "";
  const ctx = {
    systemPrompt: {
      getSectionOrder() {
        return 0;
      },
      section(section) {
        prompt = section.text;
      },
    },
    tools: {
      register(value) {
        tool = value;
      },
    },
  };
  apply(ctx);
  assert.ok(tool, "render_iui is registered");
  return { tool, prompt };
}

function answerOps(overrides = {}) {
  return [
    {
      t: "answer",
      schemaVersion: "1.0",
      locale: "en-US",
      timeZone: "UTC",
      slots: {
        conclusion: { kind: "op", id: "conclusion" },
        primaryArtifact: { kind: "comp", id: "c1" },
        ...(overrides.actions?.length
          ? { primaryAction: { kind: "action", id: overrides.actions[0].id } }
          : {}),
      },
      ...(overrides.actions ? { actions: overrides.actions } : {}),
      provenance: {
        authority: "claimed",
        source: { id: "dsh-session", kind: "host" },
        retrievedAt: "2026-11-10T00:00:00Z",
        verification: {
          sourceIdentity: "unverified",
          integrity: "unverified",
          schema: "valid",
          crossSource: "not_checked",
        },
      },
    },
    { t: "p", lvl: 0, id: "conclusion" },
    { t: "md", v: "The comparison is ready." },
    {
      t: "comp",
      id: "c1",
      type: "tabs",
      props: {
        items: ["Cost", "Speed"],
        panels: { Cost: "Low", Speed: "High" },
      },
    },
    { t: "done" },
  ];
}

test("DSH declares only read or reversible actions and confirms reversible ones", () => {
  assert.ok(DSH_MANIFEST.actions.length > 0);
  for (const action of DSH_MANIFEST.actions) {
    assert.ok(DSH_ALLOWED_RISKS.has(action.risk), `${action.name} risk is allowed`);
    assert.notEqual(action.risk, "irreversible");
    if (action.risk === "reversible") {
      assert.equal(action.requiresConfirmation, true, `${action.name} asks for confirmation`);
    }
  }
  assert.equal(DSH_MANIFEST.capabilities.canWriteCalendar, false);
  assert.equal(DSH_MANIFEST.capabilities.canOpenWallet, false);
  assert.equal(DSH_MANIFEST.capabilities.canVerifyPass, false);
  assert.equal(
    DSH_MANIFEST.actions.some((action) => action.name === "add_to_calendar"),
    false,
  );
  assert.equal(
    DSH_MANIFEST.actions.some((action) => action.name === "save_note"),
    true,
  );
});

test("DSH registers render_iui with the shared manifest and envelope rules", () => {
  const { tool, prompt } = register();
  assert.equal(tool.name, "render_iui");
  assert.match(tool.description, /Answer Envelope|answer envelope/);
  assert.match(prompt, /DSH host rules/);
  assert.match(prompt, /\[iui-action\]/);
  assert.match(prompt, /save_note/);
  assert.match(prompt, /answer envelope/i);
  assert.match(prompt, /complete replacement/i);
  assert.match(prompt, /never send patch or delta/i);
});

test("DSH execute validates the Answer Envelope and declared actions", async () => {
  const { tool } = register();
  const value = await tool.execute({
    ops: answerOps({
      actions: [
        {
          id: "a1",
          name: "save_note",
          args: { title: "Comparison", body: "Cost is low and speed is high." },
        },
      ],
    }),
  });

  assert.equal(value.legacy, false);
  assert.equal(value.issues.length, 0);
  assert.equal(value.envelope.actions[0].name, "save_note");
  assert.equal(value.ops.length, 5);
  assert.equal(value.ops[3].type, "tabs");
  assert.deepEqual(tool.output.presentationMeta({}, value).envelope, value.envelope);
  assert.match(tool.output.render({}, value)[0].text, /answer envelope/);
});

test("DSH execute rejects undeclared and irreversible actions", async () => {
  const { tool } = register();
  const value = await tool.execute({
    ops: answerOps({
      actions: [
        {
          id: "a1",
          name: "delete_everything",
          args: {},
        },
      ],
    }),
  });

  assert.ok(value.issues.length > 0, "the undeclared action is reported");
  assert.equal(
    value.envelope?.actions?.some((action) => action.name === "delete_everything") ?? false,
    false,
    "the undeclared action is not kept",
  );
});

test("DSH execute keeps legacy answers renderable and marks them legacy", async () => {
  const { tool } = register();
  const value = await tool.execute({
    ops: [
      { t: "p", lvl: 0 },
      { t: "md", v: "A plain legacy answer." },
      { t: "done" },
    ],
  });

  assert.equal(value.legacy, true);
  assert.equal(value.envelope, null);
  assert.equal(value.ops.length, 3);
  assert.match(tool.output.render({}, value)[0].text, /legacy mode/);
});

test("DSH tells the model to resend a complete interface after an empty or invalid update", () => {
  const { tool } = register();
  const text = tool.output.render(
    {},
    {
      ops: [],
      issues: [{ path: "$", message: "invalid delta op" }],
      envelope: null,
      legacy: false,
    },
  )[0].text;
  assert.match(text, /No interface was rendered/);
  assert.match(text, /Resend the complete interface/);
  assert.match(text, /do not send patch or delta ops/);
});
