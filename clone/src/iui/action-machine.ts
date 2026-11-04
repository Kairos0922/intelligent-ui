import {
  canonicalJson,
  findAction,
  idempotencyKeyFor,
  isP0Risk,
  isPlainObject,
  isTerminalActionState,
  sha256Hex,
  validateJsonSchema,
  type ActionDescriptor,
  type ActionError,
  type ActionErrorCode,
  type ActionEvent,
  type ActionEventType,
  type ActionIntent,
  type ActionState,
  type ActionStatus,
  type AuditEvent,
  type AuthorizationDecision,
  type CompensationRecord,
  type ContractIssue,
  type HostCapabilityManifest,
  type ProposedAction,
  type ReconciliationRecord,
} from "./contracts";

export class ActionRuntimeError extends Error {
  readonly code: ActionErrorCode;

  constructor(code: ActionErrorCode, message: string) {
    super(message);
    this.name = "ActionRuntimeError";
    this.code = code;
  }
}

export interface ActionRuntimeOptions {
  manifest: HostCapabilityManifest;
  userId: string;
  tenantId?: string;
  now?: () => Date;
  hash?: (value: string) => Promise<string>;
  /** Host policy hook. The runtime still enforces manifest and P0 risk limits. */
  authorize?: (
    intent: ActionIntent,
    descriptor: ActionDescriptor,
  ) => AuthorizationDecision | Promise<AuthorizationDecision>;
  auditSink?: (event: AuditEvent) => void;
  /** Defaults: 24h retention, 1h reconciliation window, 1h retry window, 10m intent TTL. */
  idempotencyRetentionMs?: number;
  reconciliationWindowMs?: number;
  retryWindowMs?: number;
  operationTtlMs?: number;
}

export interface ProposalResult {
  operation: ActionState;
  intent: ActionIntent;
  idempotencyKey: string;
  deduped: boolean;
}

export interface AuditVerification {
  ok: boolean;
  index?: number;
  expected?: string;
  actual?: string;
}

interface StoredOperation {
  state: ActionState;
  intent: ActionIntent;
  args: Record<string, unknown>;
  descriptor: ActionDescriptor;
  events: ActionEvent[];
}

const DEFAULT_TTL = 10 * 60 * 1000;
const DEFAULT_RECONCILIATION_WINDOW = 60 * 60 * 1000;
const DEFAULT_RETRY_WINDOW = 60 * 60 * 1000;
const DEFAULT_IDEMPOTENCY_RETENTION = 24 * 60 * 60 * 1000;

const EVENT_TARGET: Partial<Record<ActionStatus, Partial<Record<ActionEventType, ActionStatus>>>> = {
  proposed: {
    request_confirmation: "awaiting_confirmation",
    authorize: "authorized",
    cancel: "cancelled",
    expire: "expired",
  },
  awaiting_confirmation: {
    confirm: "authorized",
    cancel: "cancelled",
    expire: "expired",
  },
  authorized: {
    start: "running",
    cancel: "cancelled",
    expire: "expired",
  },
  running: {
    succeed: "succeeded",
    fail: "failed",
    timeout: "unknown",
    cancel_requested: "running",
  },
  unknown: {
    reconcile_start: "reconciling",
  },
  reconciling: {
    reconcile_success: "succeeded",
    reconcile_failure: "failed",
    reconcile_cancelled: "cancelled",
    reconcile_manual: "manual_review",
    reconcile_timeout: "manual_review",
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

export class ActionRuntime {
  private options: ActionRuntimeOptions;
  private manifest: HostCapabilityManifest;
  private now: () => Date;
  private hash: (value: string) => Promise<string>;
  private operations = new Map<string, StoredOperation>();
  private keys = new Map<
    string,
    { operationId: string; action: string; argsHash: string; createdAt: string }
  >();
  private audits: AuditEvent[] = [];
  private operationSeq = 0;
  private auditSeq = 0;
  private idempotencyRetentionMs: number;
  private reconciliationWindowMs: number;
  private retryWindowMs: number;
  private operationTtlMs: number;

  constructor(options: ActionRuntimeOptions) {
    this.options = options;
    this.manifest = options.manifest;
    this.now = options.now ?? (() => new Date());
    this.hash = options.hash ?? sha256Hex;
    this.idempotencyRetentionMs =
      options.idempotencyRetentionMs ?? DEFAULT_IDEMPOTENCY_RETENTION;
    this.reconciliationWindowMs =
      options.reconciliationWindowMs ?? DEFAULT_RECONCILIATION_WINDOW;
    this.retryWindowMs = options.retryWindowMs ?? DEFAULT_RETRY_WINDOW;
    this.operationTtlMs = options.operationTtlMs ?? DEFAULT_TTL;
  }

  /** Replace the host manifest after a capability change. */
  setManifest(manifest: HostCapabilityManifest): void {
    this.manifest = manifest;
  }

  getManifest(): HostCapabilityManifest {
    return this.manifest;
  }

  /** The ledger is in memory by default; hosts can persist `get` snapshots. */
  get(operationId: string): ActionState | null {
    const stored = this.operations.get(operationId);
    return stored ? clone(stored.state) : null;
  }

  getIntent(operationId: string): ActionIntent | null {
    const stored = this.operations.get(operationId);
    return stored ? clone(stored.intent) : null;
  }

  list(): ActionState[] {
    return [...this.operations.values()].map((stored) => clone(stored.state));
  }

  events(operationId: string): ActionEvent[] {
    return clone(this.operations.get(operationId)?.events ?? []);
  }

  auditEvents(): AuditEvent[] {
    return clone(this.audits);
  }

  /**
   * Register a model/block intent. This does not authorize or execute it.
   * The same idempotency key returns the existing operation; different args
   * with the same key raise `idempotency_conflict`.
   */
  async propose(input: {
    action: ProposedAction;
    source: "block" | "model" | "host";
    answerId: string;
    blockId?: string;
    createdAt?: string;
    /** Host ledger key. Model output must never set this. */
    idempotencyKey?: string;
  }): Promise<ProposalResult> {
    const descriptor = findAction(this.manifest, input.action.name);
    if (!descriptor) {
      throw new ActionRuntimeError("unsupported_action", `action "${input.action.name}" is not declared`);
    }
    if (!isP0Risk(descriptor.risk)) {
      throw new ActionRuntimeError("action_not_open", `action "${descriptor.name}" is not open in stage 1a`);
    }
    const args = isPlainObject(input.action.args) ? input.action.args : {};
    const argIssues: ContractIssue[] = [];
    validateJsonSchema(descriptor.argsSchema, args, "args", argIssues);
    if (argIssues.length) {
      throw new ActionRuntimeError(
        "invalid_args",
        argIssues.map((item) => `${item.path}: ${item.message}`).join("; "),
      );
    }
    const argsHash = await this.hash(canonicalJson(args));
    const idempotencyKey =
      input.idempotencyKey ??
      (await idempotencyKeyFor({
        tenantId: this.options.tenantId ?? "default",
        userId: this.options.userId,
        action: descriptor.name,
        args,
        hash: this.hash,
      }));
    const existing = this.keys.get(idempotencyKey);
    if (existing) {
      if (existing.action !== descriptor.name || existing.argsHash !== argsHash) {
        throw new ActionRuntimeError(
          "idempotency_conflict",
          `the idempotency key was already used with a different action or different arguments`,
        );
      }
      const stored = this.operations.get(existing.operationId);
      if (!stored) {
        throw new ActionRuntimeError("idempotency_conflict", "idempotency ledger is inconsistent");
      }
      return {
        operation: clone(stored.state),
        intent: clone(stored.intent),
        idempotencyKey,
        deduped: true,
      };
    }

    const operationId = `op_${++this.operationSeq}`;
    const createdAt = input.createdAt ?? nowIso(this.now);
    const expiresAt = new Date(Date.parse(createdAt) + this.operationTtlMs).toISOString();
    const intent: ActionIntent = {
      ...clone(input.action),
      source: input.source,
      answerId: input.answerId,
      ...(input.blockId ? { blockId: input.blockId } : {}),
      createdAt,
      operationId,
    };
    const state: ActionState = {
      operationId,
      idempotencyKey,
      answerId: input.answerId,
      intentId: input.action.id,
      action: input.action.name,
      argsHash,
      state: "proposed",
      stateVersion: 0,
      sequence: 0,
      createdAt,
      updatedAt: createdAt,
      expiresAt,
    };
    this.operations.set(operationId, {
      state,
      intent,
      args: clone(args),
      descriptor,
      events: [],
    });
    this.keys.set(idempotencyKey, {
      operationId,
      action: descriptor.name,
      argsHash,
      createdAt,
    });
    await this.appendAudit({
      actor: { kind: input.source === "model" ? "model" : "host" },
      operationId,
      action: descriptor.name,
      argsHash,
      stateAfter: "proposed",
    });
    return {
      operation: clone(state),
      intent: clone(intent),
      idempotencyKey,
      deduped: false,
    };
  }

  /** Apply the manifest policy: ask for confirmation or auto-authorize read-only work. */
  async decide(operationId: string): Promise<ActionState> {
    const stored = this.require(operationId);
    const descriptor = findAction(this.manifest, stored.descriptor.name);
    if (!descriptor || !isP0Risk(descriptor.risk)) {
      return this.reject(operationId, "permission_denied", "The host no longer allows this action");
    }
    if (descriptor.requiresConfirmation) {
      return this.applyAndReturn(operationId, "request_confirmation", {
        policy: "manifest",
      });
    }
    if (this.options.authorize) {
      const decision = await this.options.authorize(clone(stored.intent), descriptor);
      if (decision.decision === "deny") {
        return this.reject(operationId, decision.code ?? "permission_denied", decision.message ?? "Denied by host policy");
      }
      if (decision.decision === "confirm") {
        return this.applyAndReturn(operationId, "request_confirmation", {
          policy: decision.policyVersion ?? "policy",
          prompt: decision.prompt,
        });
      }
      return this.applyAndReturn(operationId, "authorize", {
        policy: "auto",
        policyVersion: decision.policyVersion,
      });
    }
    if (descriptor.risk !== "read") {
      return this.applyAndReturn(operationId, "request_confirmation", { policy: "manifest" });
    }
    return this.applyAndReturn(operationId, "authorize", { policy: "auto" });
  }

  async requestConfirmation(operationId: string): Promise<ActionState> {
    return this.applyAndReturn(operationId, "request_confirmation", { policy: "host" });
  }

  async authorize(
    operationId: string,
    decision: AuthorizationDecision = { decision: "allow", policyVersion: "host" },
  ): Promise<ActionState> {
    if (decision.decision === "deny") {
      return this.reject(operationId, decision.code ?? "permission_denied", decision.message ?? "Denied by host policy");
    }
    return this.applyAndReturn(operationId, "authorize", {
      policy: "user",
      policyVersion: decision.policyVersion,
    });
  }

  async confirm(operationId: string): Promise<ActionState> {
    return this.applyAndReturn(operationId, "confirm", { policy: "user" });
  }

  async start(operationId: string): Promise<ActionState> {
    const stored = this.require(operationId);
    if (stored.state.state !== "authorized") {
      // Let the state machine report the precise transition error, or record
      // a late terminal event without mutating the terminal state.
      return this.applyAndReturn(operationId, "start", {});
    }
    const descriptor = findAction(this.manifest, stored.descriptor.name);
    if (!descriptor || !isP0Risk(descriptor.risk)) {
      return this.reject(operationId, "permission_denied", "The host revoked this action before execution");
    }
    if (stored.state.expiresAt && Date.parse(stored.state.expiresAt) <= this.now().getTime()) {
      return this.applyAndReturn(operationId, "expire", { reason: "operation_expired" });
    }
    return this.applyAndReturn(operationId, "start", {});
  }

  async succeed(operationId: string, receipt?: ActionState["receipt"]): Promise<ActionState> {
    return this.applyAndReturn(operationId, "succeed", receipt ? { receipt } : {});
  }

  async fail(operationId: string, error: ActionError): Promise<ActionState> {
    return this.applyAndReturn(operationId, "fail", { error });
  }

  async timeout(operationId: string, reason = "timeout"): Promise<ActionState> {
    return this.applyAndReturn(operationId, "timeout", { reason });
  }

  /** Cancel before execution; during execution only records `cancel_requested`. */
  async cancel(operationId: string): Promise<ActionState> {
    const stored = this.require(operationId);
    if (stored.state.state === "running") {
      return this.applyAndReturn(operationId, "cancel_requested", {
        note: "cancellation is not confirmed until the result is known",
      });
    }
    return this.applyAndReturn(operationId, "cancel", { reason: "cancelled_by_user" });
  }

  async expire(operationId: string): Promise<ActionState> {
    return this.applyAndReturn(operationId, "expire", { reason: "operation_expired" });
  }

  async beginReconciliation(operationId: string): Promise<ActionState> {
    const stored = this.require(operationId);
    const startedAt = nowIso(this.now);
    const record: ReconciliationRecord = {
      startedAt,
      windowMs: this.reconciliationWindowMs,
      sources: ["operation_ledger"],
      attempts: 1,
    };
    const state = await this.applyAndReturn(operationId, "reconcile_start", { reconciliation: record });
    stored.state.reconciliation = record;
    return clone(stored.state);
  }

  async reconcile(
    operationId: string,
    outcome: "succeeded" | "failed" | "cancelled" | "manual_review",
    evidence: string[] = [],
  ): Promise<ActionState> {
    const stored = this.require(operationId);
    const event: ActionEventType =
      outcome === "succeeded"
        ? "reconcile_success"
        : outcome === "failed"
          ? "reconcile_failure"
          : outcome === "cancelled"
            ? "reconcile_cancelled"
            : "reconcile_manual";
    const state = await this.applyAndReturn(operationId, event, { evidence });
    if (stored.state.reconciliation) {
      stored.state.reconciliation = {
        ...stored.state.reconciliation,
        finishedAt: nowIso(this.now),
        outcome,
        evidence,
      };
    }
    return clone(stored.state);
  }

  async reconcileTimeout(operationId: string, evidence: string[] = []): Promise<ActionState> {
    const stored = this.require(operationId);
    await this.applyAndReturn(operationId, "reconcile_timeout", { evidence });
    if (stored.state.reconciliation) {
      stored.state.reconciliation = {
        ...stored.state.reconciliation,
        finishedAt: nowIso(this.now),
        outcome: "manual_review",
        evidence,
      };
    }
    return clone(stored.state);
  }

  /**
   * Compensation is an independent record. It does not change the original
   * operation's terminal state.
   */
  async compensate(
    operationId: string,
    kind: CompensationRecord["kind"] = "reversible",
  ): Promise<CompensationRecord> {
    const stored = this.require(operationId);
    if (!isTerminalActionState(stored.state.state)) {
      throw new ActionRuntimeError("precondition_failed", "compensation requires a terminal operation");
    }
    if (stored.state.compensation && stored.state.compensation.state !== "available") {
      return clone(stored.state.compensation);
    }
    const createdAt = nowIso(this.now);
    const compensation: CompensationRecord = {
      kind,
      state: "running",
      operationId,
      createdAt,
      startedAt: createdAt,
      idempotencyKey: await this.hash(`${stored.state.idempotencyKey}:compensate:${kind}`),
    };
    stored.state.compensation = compensation;
    const audit = await this.appendAudit({
      actor: { kind: "host" },
      operationId,
      action: stored.state.action,
      argsHash: stored.state.argsHash,
      stateBefore: stored.state.state,
      stateAfter: stored.state.state,
      result: "unknown",
    });
    compensation.auditId = audit.auditId;
    return clone(compensation);
  }

  async completeCompensation(
    operationId: string,
    outcome: "done" | "failed",
    error?: ActionError,
  ): Promise<CompensationRecord> {
    const stored = this.require(operationId);
    if (!stored.state.compensation) {
      throw new ActionRuntimeError("precondition_failed", "no compensation record exists");
    }
    const compensation = stored.state.compensation;
    compensation.state = outcome === "failed" ? "manual_review" : outcome;
    compensation.finishedAt = nowIso(this.now);
    if (error) compensation.error = error;
    await this.appendAudit({
      actor: { kind: "host" },
      operationId,
      action: stored.state.action,
      argsHash: stored.state.argsHash,
      stateBefore: stored.state.state,
      stateAfter: stored.state.state,
      result: outcome === "done" ? "succeeded" : "failed",
      ...(error ? { errorCode: error.code } : {}),
    });
    return clone(compensation);
  }

  /** Apply a host-produced event. Useful for replay and conformance tests. */
  async applyEvent(event: ActionEvent): Promise<ActionState> {
    const stored = this.require(event.operationId);
    if (event.sequence < stored.state.sequence) {
      throw new ActionRuntimeError("precondition_failed", "stale event sequence");
    }
    if (event.sequence === stored.state.sequence) {
      const last = stored.events.at(-1);
      if (last && last.type === event.type) return clone(stored.state);
      throw new ActionRuntimeError("precondition_failed", "event sequence already used");
    }
    if (event.sequence !== stored.state.sequence + 1) {
      throw new ActionRuntimeError("precondition_failed", "event sequence gap");
    }
    if (event.stateVersion !== stored.state.stateVersion + 1) {
      throw new ActionRuntimeError("precondition_failed", "stateVersion must increase by one");
    }
    if (isTerminalActionState(stored.state.state)) {
      await this.appendAudit({
        actor: { kind: "host" },
        operationId: stored.state.operationId,
        action: stored.state.action,
        argsHash: stored.state.argsHash,
        stateBefore: stored.state.state,
        stateAfter: stored.state.state,
        result: "unknown",
      });
      return clone(stored.state);
    }
    const target = EVENT_TARGET[stored.state.state]?.[event.type];
    if (!target) {
      throw new ActionRuntimeError(
        "precondition_failed",
        `illegal transition ${stored.state.state} --${event.type}-->`,
      );
    }
    if (event.type === "expire") {
      const expiresAt = stored.state.expiresAt;
      if (!expiresAt || Date.parse(expiresAt) > this.now().getTime()) {
        throw new ActionRuntimeError("precondition_failed", "operation has not expired");
      }
    }
    if (event.type === "confirm" && stored.state.expiresAt) {
      if (Date.parse(stored.state.expiresAt) <= this.now().getTime()) {
        throw new ActionRuntimeError("confirmation_expired", "confirmation window has expired");
      }
    }
    const stateBefore = stored.state.state;
    stored.state.state = target;
    stored.state.stateVersion = event.stateVersion;
    stored.state.sequence = event.sequence;
    stored.state.updatedAt = event.at;
    if (target === "authorized" || target === "awaiting_confirmation") {
      const decision = event.payload?.decision as AuthorizationDecision | undefined;
      stored.state.authorization = decision ?? {
        decision: event.type === "authorize" ? "allow" : "confirm",
        policyVersion: typeof event.payload?.policyVersion === "string" ? event.payload.policyVersion : undefined,
      };
    }
    if (target === "authorized") {
      stored.state.authorizedAt = event.at;
      if (event.type === "confirm") stored.state.confirmedAt = event.at;
    }
    if (target === "running") stored.state.startedAt ??= event.at;
    if (target === "succeeded") {
      stored.state.finishedAt = event.at;
      if (isPlainObject(event.payload?.receipt)) {
        stored.state.receipt = event.payload.receipt as ActionState["receipt"];
      }
    }
    if (target === "failed") {
      stored.state.finishedAt = event.at;
      if (isPlainObject(event.payload?.error)) {
        stored.state.error = event.payload.error as unknown as ActionError;
      }
    }
    if (target === "cancelled" || target === "expired" || target === "manual_review") {
      stored.state.finishedAt = event.at;
      if (event.type === "reconcile_timeout") {
        stored.state.error = {
          code: "reconciliation_failed",
          message: "reconciliation window ended without a result",
          retryable: false,
          terminal: true,
          userAction: "contact_support",
        };
      }
    }
    if (target === "unknown") {
      stored.state.error = {
        code: "timeout",
        message: "The outcome is unknown; reconcile before retrying",
        retryable: false,
        terminal: false,
        userAction: "none",
      };
    }
    stored.events.push(clone(event));
    await this.appendAudit({
      actor: { kind: "host" },
      operationId: stored.state.operationId,
      action: stored.state.action,
      argsHash: stored.state.argsHash,
      stateBefore,
      stateAfter: target,
      ...(target === "succeeded"
        ? { result: "succeeded" as const }
        : target === "failed"
          ? { result: "failed" as const }
          : target === "cancelled"
            ? { result: "cancelled" as const }
            : target === "unknown"
              ? { result: "unknown" as const }
              : {}),
      ...(stored.state.error ? { errorCode: stored.state.error.code } : {}),
    });
    return clone(stored.state);
  }

  async verifyAuditChain(): Promise<AuditVerification> {
    let prevHash: string | undefined;
    for (let index = 0; index < this.audits.length; index++) {
      const event = this.audits[index];
      if (index > 0 && event.prevHash !== prevHash) {
        return { ok: false, index, expected: prevHash, actual: event.prevHash };
      }
      const { hash, ...rest } = event;
      const expected = await this.hash(`${prevHash ?? ""}\u001f${canonicalJson(rest)}`);
      if (hash !== expected) {
        return { ok: false, index, expected, actual: hash };
      }
      prevHash = hash;
    }
    return { ok: true };
  }

  private require(operationId: string): StoredOperation {
    const stored = this.operations.get(operationId);
    if (!stored) throw new ActionRuntimeError("invalid_intent", `unknown operation "${operationId}"`);
    return stored;
  }

  private async reject(operationId: string, code: ActionErrorCode, message: string): Promise<ActionState> {
    const stored = this.require(operationId);
    const current = stored.state.state;
    if (isTerminalActionState(current)) return clone(stored.state);
    stored.state.error = {
      code,
      message,
      retryable: false,
      terminal: true,
      userAction: code === "permission_denied" ? "contact_support" : "none",
    };
    if (current === "running") {
      return this.applyAndReturn(operationId, "cancel_requested", { reason: code });
    }
    if (current === "proposed" || current === "awaiting_confirmation" || current === "authorized") {
      return this.applyAndReturn(operationId, "cancel", { reason: code });
    }
    return clone(stored.state);
  }

  private async applyAndReturn(
    operationId: string,
    type: ActionEventType,
    payload: Record<string, unknown>,
  ): Promise<ActionState> {
    const stored = this.require(operationId);
    return this.applyEvent({
      operationId,
      stateVersion: stored.state.stateVersion + 1,
      sequence: stored.state.sequence + 1,
      at: nowIso(this.now),
      type,
      payload,
    });
  }

  private async appendAudit(
    event: Omit<AuditEvent, "auditId" | "at" | "hash" | "prevHash">,
  ): Promise<AuditEvent> {
    const prevHash = this.audits.at(-1)?.hash;
    const base = {
      ...event,
      auditId: `aud_${++this.auditSeq}`,
      at: nowIso(this.now),
      ...(prevHash ? { prevHash } : {}),
    };
    const hash = await this.hash(`${prevHash ?? ""}\u001f${canonicalJson(base)}`);
    const audit: AuditEvent = { ...base, hash };
    this.audits.push(audit);
    try {
      this.options.auditSink?.(clone(audit));
    } catch {
      // The host sink must not break the state machine.
    }
    return audit;
  }
}

export function createActionRuntime(options: ActionRuntimeOptions): ActionRuntime {
  return new ActionRuntime(options);
}

export function errorFor(code: ActionErrorCode, message: string): ActionError {
  const retryable = code === "host_unavailable" || code === "external_unavailable" || code === "rate_limited";
  return {
    code,
    message,
    retryable,
    terminal: !retryable,
    userAction: retryable ? "retry" : "none",
  };
}
