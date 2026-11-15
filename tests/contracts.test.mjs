import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  createActionRuntime,
  createI18n,
  errorFor,
  formatCurrency,
  formatNumber,
  validateAnswerOps,
  validateCapabilityManifest,
  validateJsonSchema,
} from "../clone/dist-lib/agent.js";

const manifest = validateCapabilityManifest({
  schemaVersion: "1.0",
  hostId: "test-host",
  capabilities: {
    canNotify: false,
    canPersist: true,
    canOpenWallet: true,
    canVerifyPass: true,
    canWriteCalendar: false,
    canDeepLink: true,
  },
  actions: [
    {
      name: "open_qr",
      description: "Show the boarding pass QR",
      risk: "read",
      requiresConfirmation: false,
      idempotent: true,
      compensation: "none",
      timeoutMs: 5_000,
      argsSchema: {
        type: "object",
        properties: { passId: { type: "string", minLength: 1 } },
        required: ["passId"],
        additionalProperties: false,
      },
    },
    {
      name: "refresh_pass",
      description: "Refresh the pass",
      risk: "reversible",
      requiresConfirmation: true,
      idempotent: true,
      compensation: "reversible",
      timeoutMs: 5_000,
    },
    {
      name: "delete_pass",
      description: "Delete the pass",
      risk: "irreversible",
      requiresConfirmation: true,
      idempotent: false,
      compensation: "manual",
      timeoutMs: 5_000,
    },
  ],
}).manifest;

const validEnvelope = {
  t: "answer",
  schemaVersion: "1.0",
  locale: "zh-CN",
  timeZone: "Asia/Shanghai",
  currency: "CNY",
  units: "metric",
  slots: {
    conclusion: { kind: "op", id: "conclusion" },
    primaryArtifact: { kind: "comp", id: "c1" },
    primaryAction: { kind: "action", id: "a1" },
    explanation: [{ kind: "op", id: "exp" }],
  },
  actions: [{ id: "a1", name: "open_qr", args: { passId: "p1" } }],
  provenance: {
    authority: "claimed",
    source: { id: "issuer-test", kind: "issuer" },
    retrievedAt: "2026-11-04T00:00:00Z",
    verification: {
      sourceIdentity: "unverified",
      integrity: "unverified",
      schema: "valid",
      crossSource: "not_checked",
    },
  },
  assumptions: ["The gate is unchanged until the pass refreshes"],
};

const validOps = [
  validEnvelope,
  { t: "p", lvl: 2, id: "conclusion" },
  { t: "md", v: "Gate D7" },
  { t: "comp", id: "c1", type: "card", props: { title: "Boarding pass" } },
  { t: "p", id: "exp" },
  { t: "md", v: "The gate is shown on the pass." },
  { t: "done" },
];

function codes(result) {
  return result.issues.map((issue) => issue.code).filter(Boolean);
}

test("valid answer envelope resolves all slots", () => {
  const result = validateAnswerOps(validOps, { capabilities: manifest });
  assert.deepEqual(result.issues, []);
  assert.equal(result.legacy, false);
  assert.equal(result.envelope.slots.conclusion.id, "conclusion");
  assert.equal(result.envelope.actions[0].name, "open_qr");
});

test("legacy answers are marked instead of rejected", () => {
  const result = validateAnswerOps([
    { t: "p" },
    { t: "md", v: "Plain legacy answer" },
    { t: "done" },
  ]);
  assert.equal(result.legacy, true);
  assert.equal(result.envelope, null);
  assert.equal(result.ops.length, 3);
});

test("missing conclusion rejects the envelope and keeps legacy content", () => {
  const ops = structuredClone(validOps);
  delete ops[0].slots.conclusion;
  const result = validateAnswerOps(ops, { capabilities: manifest });
  assert.equal(result.envelope, null);
  assert.equal(result.legacy, true);
  assert.ok(codes(result).includes("missing_conclusion"));
  assert.ok(result.ops.some((op) => op.t === "comp"));
});

test("dangling slots are reported without dropping the answer", () => {
  const ops = structuredClone(validOps);
  ops[0].slots.primaryArtifact = { kind: "comp", id: "missing" };
  const result = validateAnswerOps(ops, { capabilities: manifest });
  assert.ok(result.envelope);
  assert.ok(codes(result).includes("invalid_slot"));
});

test("duplicate ids across op and component namespaces are rejected", () => {
  const ops = structuredClone(validOps);
  ops[3].id = "conclusion";
  const result = validateAnswerOps(ops, { capabilities: manifest });
  assert.ok(codes(result).includes("duplicate_id"));
  assert.equal(result.ops.filter((op) => op.id === "conclusion").length, 1);
});

test("model authority is forced to claimed", () => {
  const ops = structuredClone(validOps);
  ops[0].provenance.authority = "attested";
  ops[0].provenance.verification.verifiedBy = "host";
  ops[0].provenance.verification.checkedAt = "2026-11-04T00:00:00Z";
  const result = validateAnswerOps(ops, { capabilities: manifest });
  assert.ok(codes(result).includes("untrusted_verification"));
  assert.equal(result.envelope.provenance.authority, "claimed");
  assert.equal(result.envelope.provenance.verification.verifiedBy, undefined);
});

test("model-provided operation fields are stripped", () => {
  const ops = structuredClone(validOps);
  ops[3].props.operationId = "model-controlled";
  ops[3].props.auditId = "model-controlled";
  ops[0].actions[0].operationId = "model-controlled";
  const result = validateAnswerOps(ops, { capabilities: manifest });
  const comp = result.ops.find((op) => op.t === "comp");
  assert.equal(comp.props.operationId, undefined);
  assert.equal(comp.props.auditId, undefined);
  assert.equal(result.ops.find((op) => op.t === "answer").actions[0].operationId, undefined);
  assert.ok(codes(result).includes("untrusted_field"));
});

test("undeclared and irreversible actions are not open", () => {
  const undeclared = structuredClone(validOps);
  undeclared[0].actions[0].name = "wire_money";
  assert.ok(codes(validateAnswerOps(undeclared, { capabilities: manifest })).includes("unsupported_action"));

  const irreversible = structuredClone(validOps);
  irreversible[0].actions[0].name = "delete_pass";
  const result = validateAnswerOps(irreversible, { capabilities: manifest });
  assert.ok(codes(result).includes("action_not_open"));
  assert.equal(result.envelope.actions, undefined);
});

test("invalid locale and time zone are rejected with fallbacks", () => {
  const ops = structuredClone(validOps);
  ops[0].locale = "not a locale!!";
  ops[0].timeZone = "Mars/Olympus";
  const result = validateAnswerOps(ops, { capabilities: manifest });
  assert.equal(result.envelope.locale, "en-US");
  assert.equal(result.envelope.timeZone, "UTC");
  assert.ok(codes(result).filter((code) => code === "invalid_locale").length >= 2);
});

test("answer actions require an artifact and provenance", () => {
  const ops = structuredClone(validOps);
  delete ops[0].slots.primaryArtifact;
  delete ops[0].provenance;
  const result = validateAnswerOps(ops, { capabilities: manifest });
  const found = codes(result);
  assert.ok(found.includes("invalid_primary_artifact"));
  assert.ok(found.includes("missing_provenance"));
});

test("capability manifest validation rejects duplicates and bad risks", () => {
  const result = validateCapabilityManifest({
    schemaVersion: "1.0",
    hostId: "bad",
    capabilities: {
      canNotify: false,
      canPersist: false,
      canOpenWallet: false,
      canVerifyPass: false,
      canWriteCalendar: false,
      canDeepLink: false,
    },
    actions: [
      {
        name: "same",
        description: "One",
        risk: "read",
        requiresConfirmation: false,
        idempotent: true,
        compensation: "none",
        timeoutMs: 1000,
      },
      {
        name: "same",
        description: "Two",
        risk: "read",
        requiresConfirmation: false,
        idempotent: true,
        compensation: "none",
        timeoutMs: 1000,
      },
      {
        name: "bad",
        description: "Bad",
        risk: "danger",
        requiresConfirmation: false,
        idempotent: true,
        compensation: "none",
        timeoutMs: 1000,
      },
    ],
  });
  assert.equal(result.manifest, null);
  assert.ok(result.issues.some((issue) => issue.message.includes("duplicate")));
  assert.ok(result.issues.some((issue) => issue.message.includes("risk")));
});

test("action runtime is idempotent and rejects conflicting args", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1", tenantId: "t1" });
  const first = await runtime.propose({
    action: { id: "a1", name: "open_qr", args: { passId: "p1" } },
    source: "model",
    answerId: "ans1",
  });
  assert.equal(first.deduped, false);
  assert.equal(first.operation.state, "proposed");

  const repeated = await runtime.propose({
    action: { id: "a2", name: "open_qr", args: { passId: "p1" } },
    source: "block",
    answerId: "ans1",
  });
  assert.equal(repeated.deduped, true);
  assert.equal(repeated.operation.operationId, first.operation.operationId);

  await assert.rejects(
    () =>
      runtime.propose({
        action: { id: "a3", name: "open_qr", args: { passId: "p2" } },
        source: "host",
        answerId: "ans1",
        idempotencyKey: first.idempotencyKey,
      }),
    (error) => error.code === "idempotency_conflict",
  );
});

test("action runtime supports confirmation, start, and terminal states", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1" });
  const { operation } = await runtime.propose({
    action: { id: "a1", name: "refresh_pass" },
    source: "model",
    answerId: "ans1",
  });
  const waiting = await runtime.decide(operation.operationId);
  assert.equal(waiting.state, "awaiting_confirmation");
  const authorized = await runtime.confirm(operation.operationId);
  assert.equal(authorized.state, "authorized");
  const running = await runtime.start(operation.operationId);
  assert.equal(running.state, "running");
  const succeeded = await runtime.succeed(operation.operationId, { payload: { ok: true } });
  assert.equal(succeeded.state, "succeeded");
  assert.deepEqual(succeeded.receipt, { payload: { ok: true } });
  const beforeAudit = runtime.auditEvents().length;
  const late = await runtime.start(operation.operationId);
  assert.equal(late.state, "succeeded");
  assert.equal(runtime.auditEvents().length, beforeAudit + 1);
});

test("unknown outcome reconciles before retry", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1" });
  const { operation } = await runtime.propose({
    action: { id: "a1", name: "open_qr", args: { passId: "p1" } },
    source: "block",
    answerId: "ans1",
  });
  await runtime.decide(operation.operationId);
  await runtime.start(operation.operationId);
  const unknown = await runtime.timeout(operation.operationId);
  assert.equal(unknown.state, "unknown");
  const reconciling = await runtime.beginReconciliation(operation.operationId);
  assert.equal(reconciling.state, "reconciling");
  const result = await runtime.reconcile(operation.operationId, "succeeded", ["ledger:1"]);
  assert.equal(result.state, "succeeded");
  assert.equal(result.reconciliation.outcome, "succeeded");
});

test("cancellation during execution is recorded but not assumed", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1" });
  const { operation } = await runtime.propose({
    action: { id: "a1", name: "open_qr", args: { passId: "p1" } },
    source: "model",
    answerId: "ans1",
  });
  await runtime.decide(operation.operationId);
  await runtime.start(operation.operationId);
  const cancelled = await runtime.cancel(operation.operationId);
  assert.equal(cancelled.state, "running");
  assert.equal(runtime.events(operation.operationId).at(-1).type, "cancel_requested");
  const succeeded = await runtime.succeed(operation.operationId);
  assert.equal(succeeded.state, "succeeded");
});

test("event replay rejects gaps and ignores terminal late events", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1" });
  const { operation } = await runtime.propose({
    action: { id: "a1", name: "open_qr", args: { passId: "p1" } },
    source: "model",
    answerId: "ans1",
  });
  await assert.rejects(
    () =>
      runtime.applyEvent({
        operationId: operation.operationId,
        stateVersion: 2,
        sequence: 2,
        at: new Date().toISOString(),
        type: "authorize",
      }),
    (error) => error.code === "precondition_failed",
  );
  await runtime.decide(operation.operationId);
  await runtime.start(operation.operationId);
  await runtime.succeed(operation.operationId);
  const before = runtime.auditEvents().length;
  const late = await runtime.applyEvent({
    operationId: operation.operationId,
    stateVersion: 4,
    sequence: 4,
    at: new Date().toISOString(),
    type: "fail",
    payload: { error: errorFor("timeout", "late") },
  });
  assert.equal(late.state, "succeeded");
  assert.equal(runtime.auditEvents().length, before + 1);
});

test("compensation is independent, idempotent, and audited", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1" });
  const { operation } = await runtime.propose({
    action: { id: "a1", name: "refresh_pass" },
    source: "model",
    answerId: "ans1",
  });
  await runtime.decide(operation.operationId);
  await runtime.confirm(operation.operationId);
  await runtime.start(operation.operationId);
  await runtime.fail(operation.operationId, errorFor("external_unavailable", "offline"));

  const first = await runtime.compensate(operation.operationId, "reversible");
  assert.equal(first.state, "running");
  const second = await runtime.compensate(operation.operationId, "reversible");
  assert.equal(second.state, "running");
  const done = await runtime.completeCompensation(operation.operationId, "done");
  assert.equal(done.state, "done");
  assert.equal(runtime.get(operation.operationId).state, "failed");
});

test("audit hash chain verifies", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1" });
  const { operation } = await runtime.propose({
    action: { id: "a1", name: "open_qr", args: { passId: "p1" } },
    source: "model",
    answerId: "ans1",
  });
  await runtime.decide(operation.operationId);
  assert.equal((await runtime.verifyAuditChain()).ok, true);
  const audit = runtime.auditEvents();
  assert.ok(audit.length >= 2);
  assert.ok(audit[0].hash);
});

test("canonical JSON is deterministic and idempotency keys are stable", async () => {
  assert.equal(
    canonicalJson({ b: 2, a: { y: true, x: [1, 2] } }),
    '{"a":{"x":[1,2],"y":true},"b":2}',
  );
  const i18n = createI18n({ locale: "de-DE", timeZone: "Europe/Berlin", currency: "EUR" });
  assert.equal(formatNumber(1234.5, i18n, { maximumFractionDigits: 1 }), "1.234,5");
  assert.match(formatCurrency(12.5, i18n), /12,50/);
  assert.equal(i18n.t("confirm"), "Confirm");
});

test("manifest revocation before execution fails with permission_denied", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1" });
  const { operation } = await runtime.propose({
    action: { id: "a1", name: "refresh_pass" },
    source: "model",
    answerId: "ans1",
  });
  await runtime.decide(operation.operationId);
  await runtime.confirm(operation.operationId);
  runtime.setManifest({ ...manifest, actions: [] });
  const state = await runtime.start(operation.operationId);
  assert.equal(state.state, "cancelled");
  assert.equal(state.error.code, "permission_denied");
});

test("model verification claims are downgraded without a host attestation", () => {
  const ops = structuredClone(validOps);
  ops[0].provenance.verification.sourceIdentity = "verified";
  ops[0].provenance.verification.integrity = "verified";
  ops[0].provenance.verification.crossSource = "consistent";
  const result = validateAnswerOps(ops, { capabilities: manifest });
  assert.ok(codes(result).filter((code) => code === "untrusted_verification").length >= 3);
  assert.equal(result.envelope.provenance.verification.sourceIdentity, "unverified");
  assert.equal(result.envelope.provenance.verification.integrity, "unverified");
  assert.equal(result.envelope.provenance.verification.crossSource, "not_checked");
});

test("field provenance is model-claimed and keeps confidence shape", () => {
  const ops = structuredClone(validOps);
  ops[0].fieldProvenance = [
    {
      fieldPath: "c1.props.gate",
      producer: "host",
      authority: "attested",
      source: { id: "issuer-test", kind: "issuer" },
      retrievedAt: "2026-11-04T00:00:00Z",
      verification: {
        sourceIdentity: "verified",
        integrity: "verified",
        schema: "valid",
        crossSource: "consistent",
      },
      confidence: { kind: "calibrated", value: 0.9, method: "issuer-calibration" },
    },
  ];
  const result = validateAnswerOps(ops, { capabilities: manifest });
  const record = result.envelope.fieldProvenance[0];
  assert.equal(record.producer, "model");
  assert.equal(record.authority, "claimed");
  assert.equal(record.verification.integrity, "unverified");
  assert.equal(record.confidence.value, 0.9);
  assert.ok(codes(result).filter((code) => code === "untrusted_verification").length >= 3);
});

test("untrusted keys in action args are removed before schema validation", () => {
  const ops = structuredClone(validOps);
  ops[0].actions[0].args = { passId: "p1", idempotencyKey: "model-controlled" };
  const result = validateAnswerOps(ops, { capabilities: manifest });
  assert.deepEqual(result.envelope.actions[0].args, { passId: "p1" });
  assert.ok(codes(result).includes("untrusted_field"));
});

test("idempotency keys cannot be reused across actions", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1" });
  const first = await runtime.propose({
    action: { id: "a1", name: "open_qr", args: { passId: "p1" } },
    source: "model",
    answerId: "ans1",
  });
  await assert.rejects(
    () =>
      runtime.propose({
        action: { id: "a2", name: "refresh_pass" },
        source: "host",
        answerId: "ans1",
        idempotencyKey: first.idempotencyKey,
      }),
    (error) => error.code === "idempotency_conflict",
  );
});

test("reconciliation timeout reaches manual review with a finished record", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1" });
  const { operation } = await runtime.propose({
    action: { id: "a1", name: "open_qr", args: { passId: "p1" } },
    source: "model",
    answerId: "ans1",
  });
  await runtime.decide(operation.operationId);
  await runtime.start(operation.operationId);
  await runtime.timeout(operation.operationId);
  await runtime.beginReconciliation(operation.operationId);
  const state = await runtime.reconcileTimeout(operation.operationId, ["ledger:timeout"]);
  assert.equal(state.state, "manual_review");
  assert.equal(state.reconciliation.outcome, "manual_review");
  assert.ok(state.reconciliation.finishedAt);
});

test("a revoked manifest cannot mutate a terminal operation", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1" });
  const { operation } = await runtime.propose({
    action: { id: "a1", name: "open_qr", args: { passId: "p1" } },
    source: "model",
    answerId: "ans1",
  });
  await runtime.decide(operation.operationId);
  await runtime.start(operation.operationId);
  await runtime.succeed(operation.operationId);
  runtime.setManifest({ ...manifest, actions: [] });
  const state = await runtime.start(operation.operationId);
  assert.equal(state.state, "succeeded");
  assert.equal(state.error, undefined);
});

test("compensation failure requires manual review and does not retry", async () => {
  const runtime = createActionRuntime({ manifest, userId: "u1" });
  const { operation } = await runtime.propose({
    action: { id: "a1", name: "refresh_pass" },
    source: "model",
    answerId: "ans1",
  });
  await runtime.decide(operation.operationId);
  await runtime.confirm(operation.operationId);
  await runtime.start(operation.operationId);
  await runtime.fail(operation.operationId, errorFor("external_unavailable", "offline"));
  await runtime.compensate(operation.operationId, "reversible");
  const failed = await runtime.completeCompensation(
    operation.operationId,
    "failed",
    errorFor("external_unavailable", "compensation failed"),
  );
  assert.equal(failed.state, "manual_review");
  const repeated = await runtime.compensate(operation.operationId, "reversible");
  assert.equal(repeated.state, "manual_review");
  assert.equal(repeated.finishedAt, failed.finishedAt);
});

test("JSON Schema subset enforces required fields without a properties map", () => {
  const issues = [];
  validateJsonSchema(
    { type: "object", required: ["passId"], additionalProperties: false },
    {},
    "$",
    issues,
  );
  assert.ok(issues.some((issue) => issue.message.includes("required")));
  const unknown = [];
  validateJsonSchema(
    { type: "object", required: ["passId"], additionalProperties: false },
    { passId: "p1", extra: true },
    "$",
    unknown,
  );
  assert.ok(unknown.some((issue) => issue.message.includes("unknown field")));
});

test("an array primaryArtifact is rejected as a slot value", () => {
  const ops = structuredClone(validOps);
  ops[0].slots.primaryArtifact = [
    { kind: "comp", id: "c1" },
    { kind: "comp", id: "c2" },
  ];
  const result = validateAnswerOps(ops, { capabilities: manifest });
  assert.ok(codes(result).includes("invalid_slot"));
});
