/**
 * Host-neutral protocol contracts added in stage 1a.
 *
 * These types are the shared source of truth for the validator, the answer
 * compiler, the agent prompt, and the host-side action runtime. They contain no
 * DOM access so server-side adapters can import them too.
 */

export const ANSWER_SCHEMA_VERSION = "1.0" as const;
export const MAX_ANSWER_ACTIONS = 8;
export const MAX_ASSUMPTIONS = 12;
export const MAX_ASSUMPTION_LENGTH = 280;
export const MAX_ACTIONS_PER_MANIFEST = 64;

export type RiskLevel = "read" | "reversible" | "irreversible";
export type Units = "metric" | "imperial";

export interface ContractIssue {
  path: string;
  message: string;
  code?: string;
}

export type SlotRef =
  | { kind: "op"; id: string }
  | { kind: "comp"; id: string }
  | { kind: "action"; id: string };

export interface AnswerSlots {
  conclusion: SlotRef;
  primaryArtifact?: SlotRef;
  primaryAction?: SlotRef;
  explanation?: SlotRef[];
  provenance?: SlotRef[];
}

export interface ProposedAction {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  confirmHint?: string;
  riskHint?: RiskLevel;
}

export interface Verification {
  sourceIdentity: "verified" | "unverified";
  integrity: "verified" | "unverified" | "invalid" | "revoked";
  schema: "valid" | "invalid";
  crossSource: "consistent" | "conflict" | "not_checked";
  verifiedBy?: "host" | "trusted_verifier";
  keyId?: string;
  checkedAt?: string;
}

export interface ProvenanceSummary {
  authority: "claimed" | "attested" | "authoritative";
  source: {
    id: string;
    kind: "issuer" | "host" | "user" | "model" | "derived";
    url?: string;
  };
  retrievedAt: string;
  observedAt?: string;
  validFrom?: string;
  validUntil?: string;
  staleAfter?: string;
  verification: Verification;
  assumptions?: string[];
}

export interface ProvenanceRecord {
  fieldPath: string;
  producer: "model" | "host" | "trusted_verifier" | "derived";
  authority: "claimed" | "attested" | "authoritative";
  source: {
    id: string;
    kind: string;
    url?: string;
  };
  retrievedAt: string;
  observedAt?: string;
  validFrom?: string;
  validUntil?: string;
  staleAfter?: string;
  verification?: Verification;
  confidence?: {
    kind: "source" | "model" | "calibrated";
    value?: number;
    method?: string;
    dataset?: string;
    calibratedAt?: string;
  };
}

/**
 * The `answer` op. It is not rendered and must be the first op of an answer.
 * `fieldProvenance` is the additive carrier for the field-level records that
 * Protocol Spec §14 defines but did not previously place in the wire format.
 */
export interface AnswerOp {
  t: "answer";
  schemaVersion: string;
  answerId?: string;
  locale: string;
  timeZone: string;
  currency?: string;
  units?: Units;
  slots: AnswerSlots;
  actions?: ProposedAction[];
  provenance?: ProvenanceSummary;
  fieldProvenance?: ProvenanceRecord[];
  assumptions?: string[];
}

export type JsonSchemaType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

/** Small JSON Schema subset used by action argument validation. */
export interface JsonSchema {
  type?: JsonSchemaType | JsonSchemaType[];
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
}

export interface ActionDescriptor {
  name: string;
  description: string;
  risk: RiskLevel;
  requiresConfirmation: boolean;
  idempotent: boolean;
  compensation: "none" | "reversible" | "refund" | "manual";
  timeoutMs: number;
  argsSchema?: JsonSchema;
  resultSchema?: JsonSchema;
}

export interface HostCapabilityManifest {
  schemaVersion: "1.0";
  hostId: string;
  hostVersion?: string;
  locale?: string;
  timeZone?: string;
  capabilities: {
    canNotify: boolean;
    canPersist: boolean;
    canOpenWallet: boolean;
    canVerifyPass: boolean;
    canWriteCalendar: boolean;
    canDeepLink: boolean;
  };
  limits?: {
    maxOps?: number;
    maxAnswerBytes?: number;
    maxPropsBytes?: number;
    maxString?: number;
  };
  actions: ActionDescriptor[];
}

export type ActionStatus =
  | "proposed"
  | "awaiting_confirmation"
  | "authorized"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "unknown"
  | "reconciling"
  | "manual_review";

export type TerminalActionStatus =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "manual_review";

export type ActionErrorCode =
  | "invalid_intent"
  | "invalid_args"
  | "unsupported_action"
  | "permission_denied"
  | "confirmation_required"
  | "confirmation_expired"
  | "operation_expired"
  | "idempotency_conflict"
  | "host_unavailable"
  | "external_unavailable"
  | "timeout"
  | "rate_limited"
  | "precondition_failed"
  | "cancelled_by_user"
  | "reconciliation_failed"
  | "action_not_open"
  | "unknown";

export interface ActionError {
  code: ActionErrorCode;
  message: string;
  retryable: boolean;
  terminal: boolean;
  userAction?: "retry" | "reconfirm" | "contact_support" | "none";
  details?: Record<string, unknown>;
  cause?: string;
}

export interface AuthorizationDecision {
  decision: "allow" | "confirm" | "deny";
  policyVersion?: string;
  prompt?: string;
  expiresAt?: string;
  code?: ActionErrorCode;
  message?: string;
}

export interface ActionIntent extends ProposedAction {
  source: "block" | "model" | "host";
  answerId: string;
  blockId?: string;
  createdAt: string;
  operationId?: string;
}

export type ActionEventType =
  | "request_confirmation"
  | "confirm"
  | "authorize"
  | "start"
  | "succeed"
  | "fail"
  | "timeout"
  | "cancel"
  | "expire"
  | "reconcile_start"
  | "reconcile_success"
  | "reconcile_failure"
  | "reconcile_cancelled"
  | "reconcile_manual"
  | "reconcile_timeout"
  | "cancel_requested";

export interface ActionEvent {
  operationId: string;
  stateVersion: number;
  sequence: number;
  at: string;
  type: ActionEventType;
  payload?: Record<string, unknown>;
}

export interface ReconciliationRecord {
  startedAt: string;
  finishedAt?: string;
  windowMs: number;
  sources: string[];
  outcome?: "succeeded" | "failed" | "cancelled" | "manual_review";
  evidence?: string[];
  attempts: number;
}

export interface CompensationRecord {
  kind: "none" | "reversible" | "refund" | "manual";
  state: "available" | "running" | "done" | "failed" | "manual_review";
  operationId: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  idempotencyKey: string;
  auditId?: string;
  error?: ActionError;
}

export interface ActionState {
  operationId: string;
  idempotencyKey: string;
  answerId?: string;
  intentId: string;
  action: string;
  argsHash: string;
  state: ActionStatus;
  stateVersion: number;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  authorizedAt?: string;
  confirmedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  expiresAt?: string;
  authorization?: AuthorizationDecision;
  error?: ActionError;
  receipt?: { url?: string; payload?: Record<string, unknown> };
  compensation?: CompensationRecord;
  reconciliation?: ReconciliationRecord;
}

export interface AuditEvent {
  auditId: string;
  at: string;
  actor: { kind: "user" | "host" | "model" | "system" | "verifier"; id?: string };
  operationId?: string;
  action?: string;
  argsHash?: string;
  policyVersion?: string;
  decision?: "allow" | "confirm" | "deny";
  stateBefore?: string;
  stateAfter?: string;
  result?: "succeeded" | "failed" | "cancelled" | "unknown";
  errorCode?: string;
  prevHash?: string;
  hash?: string;
}

export const TERMINAL_ACTION_STATES: ReadonlySet<ActionStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "manual_review",
]);

export function isTerminalActionState(state: ActionStatus): boolean {
  return TERMINAL_ACTION_STATES.has(state);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Deterministic JSON used by idempotency keys and audit hashes.
 * Object keys are sorted, undefined object fields are omitted, and
 * non-finite numbers are rejected.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (isFiniteNumber(value)) return JSON.stringify(value);
  if (typeof value === "number") throw new Error("canonicalJson rejects non-finite numbers");
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => (item === undefined ? "null" : canonicalJson(item)))
      .join(",")}]`;
  }
  if (isPlainObject(value)) {
    const parts: string[] = [];
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined || typeof child === "function" || typeof child === "symbol") continue;
      parts.push(`${JSON.stringify(key)}:${canonicalJson(child)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new Error(`canonicalJson rejects ${typeof value}`);
}

const utf8 = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", utf8.encode(input));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The Protocol Spec §9 key shape, with an injected hash for testability. */
export async function idempotencyKeyFor(input: {
  tenantId: string;
  userId: string;
  action: string;
  args?: Record<string, unknown>;
  hash?: (value: string) => Promise<string>;
}): Promise<string> {
  const material = [
    input.tenantId,
    input.userId,
    input.action,
    canonicalJson(input.args ?? {}),
  ].join("\u001f");
  return (input.hash ?? sha256Hex)(material);
}

const LOCALE_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;

export function isValidLocaleTag(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || !LOCALE_RE.test(value)) return false;
  try {
    Intl.getCanonicalLocales(value);
    return true;
  } catch {
    return false;
  }
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isValidCurrency(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z]{3}$/.test(value)) return false;
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: value.toUpperCase() });
    return true;
  } catch {
    return false;
  }
}

const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isInstant(value: unknown): value is string {
  return typeof value === "string" && INSTANT_RE.test(value) && Number.isFinite(Date.parse(value));
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "read" || value === "reversible" || value === "irreversible";
}

export function isUnits(value: unknown): value is Units {
  return value === "metric" || value === "imperial";
}

/** True when the value is one of the P0 risks that may execute in stage 1a. */
export function isP0Risk(value: RiskLevel): boolean {
  return value === "read" || value === "reversible";
}

const UNTRUSTED_MODEL_FIELDS = new Set([
  "operationId",
  "idempotencyKey",
  "authorizedAt",
  "auditId",
  "confirmedBy",
]);

export function findUntrustedModelFields(
  value: unknown,
  path = "",
  out: Array<{ path: string; field: string }> = [],
): Array<{ path: string; field: string }> {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findUntrustedModelFields(item, `${path}[${index}]`, out));
    return out;
  }
  if (!isPlainObject(value)) return out;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (UNTRUSTED_MODEL_FIELDS.has(key)) {
      out.push({ path: childPath, field: key });
    }
    findUntrustedModelFields(child, childPath, out);
  }
  return out;
}

function schemaTypeMatches(schema: JsonSchema, value: unknown): boolean {
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (!types.length) return true;
  return types.some((type) => {
    switch (type) {
      case "object":
        return isPlainObject(value);
      case "array":
        return Array.isArray(value);
      case "string":
        return typeof value === "string";
      case "number":
        return isFiniteNumber(value);
      case "integer":
        return Number.isInteger(value);
      case "boolean":
        return typeof value === "boolean";
      case "null":
        return value === null;
      default:
        return false;
    }
  });
}

/** Validate an action argument object against the supported JSON Schema subset. */
export function validateJsonSchema(
  schema: JsonSchema | undefined,
  value: unknown,
  path: string,
  issues: ContractIssue[],
): void {
  if (!schema) return;
  if (!schemaTypeMatches(schema, value)) {
    issues.push({ path, message: `expected ${String(schema.type)}`, code: "invalid_args" });
    return;
  }
  if (schema.enum && !schema.enum.some((item) => canonicalJson(item) === canonicalJson(value))) {
    issues.push({ path, message: "value is not in the allowed enum", code: "invalid_args" });
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path, message: `string is shorter than ${schema.minLength}`, code: "invalid_args" });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push({ path, message: `string is longer than ${schema.maxLength}`, code: "invalid_args" });
    }
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          issues.push({ path, message: "string does not match the pattern", code: "invalid_args" });
        }
      } catch {
        issues.push({ path, message: "schema pattern is invalid", code: "invalid_args" });
      }
    }
  }
  if (isFiniteNumber(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({ path, message: `number is below ${schema.minimum}`, code: "invalid_args" });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({ path, message: `number is above ${schema.maximum}`, code: "invalid_args" });
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path, message: `array has fewer than ${schema.minItems} items`, code: "invalid_args" });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push({ path, message: `array has more than ${schema.maxItems} items`, code: "invalid_args" });
    }
    if (schema.items) {
      value.forEach((item, index) => validateJsonSchema(schema.items, item, `${path}[${index}]`, issues));
    }
  }
  if (isPlainObject(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        issues.push({ path: `${path}.${key}`, message: "required field is missing", code: "invalid_args" });
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      const childSchema = properties[key];
      if (childSchema) {
        validateJsonSchema(childSchema, child, `${path}.${key}`, issues);
      } else if (schema.additionalProperties === false) {
        issues.push({ path: `${path}.${key}`, message: "unknown field", code: "invalid_args" });
      } else if (isPlainObject(schema.additionalProperties)) {
        validateJsonSchema(schema.additionalProperties, child, `${path}.${key}`, issues);
      }
    }
  }
}

export interface ManifestValidation {
  manifest: HostCapabilityManifest | null;
  issues: ContractIssue[];
}

/** Validate a host capability manifest before it can drive prompt, validation, or UI. */
export function validateCapabilityManifest(input: unknown): ManifestValidation {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    return { manifest: null, issues: [{ path: "$", message: "manifest must be an object", code: "invalid_manifest" }] };
  }
  if (input.schemaVersion !== "1.0") {
    issues.push({ path: "schemaVersion", message: "manifest schemaVersion must be 1.0", code: "unsupported_version" });
  }
  if (typeof input.hostId !== "string" || !input.hostId.trim()) {
    issues.push({ path: "hostId", message: "hostId is required", code: "invalid_manifest" });
  }
  const capabilities = input.capabilities;
  if (!isPlainObject(capabilities)) {
    issues.push({ path: "capabilities", message: "capabilities must be an object", code: "invalid_manifest" });
  } else {
    for (const key of ["canNotify", "canPersist", "canOpenWallet", "canVerifyPass", "canWriteCalendar", "canDeepLink"]) {
      if (typeof capabilities[key] !== "boolean") {
        issues.push({ path: `capabilities.${key}`, message: `${key} must be a boolean`, code: "invalid_manifest" });
      }
    }
  }
  const actions = Array.isArray(input.actions) ? input.actions : null;
  if (!actions) {
    issues.push({ path: "actions", message: "actions must be an array", code: "invalid_manifest" });
  }
  const names = new Set<string>();
  const normalized: ActionDescriptor[] = [];
  for (const [index, raw] of (actions ?? []).slice(0, MAX_ACTIONS_PER_MANIFEST).entries()) {
    const path = `actions[${index}]`;
    if (!isPlainObject(raw)) {
      issues.push({ path, message: "action descriptor must be an object", code: "invalid_manifest" });
      continue;
    }
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) {
      issues.push({ path: `${path}.name`, message: "action name is required", code: "invalid_manifest" });
      continue;
    }
    if (names.has(name)) {
      issues.push({ path: `${path}.name`, message: `duplicate action name "${name}"`, code: "invalid_manifest" });
      continue;
    }
    names.add(name);
    if (!isRiskLevel(raw.risk)) {
      issues.push({ path: `${path}.risk`, message: "risk must be read, reversible, or irreversible", code: "invalid_manifest" });
      continue;
    }
    if (typeof raw.description !== "string" || !raw.description.trim()) {
      issues.push({ path: `${path}.description`, message: "description is required", code: "invalid_manifest" });
      continue;
    }
    if (typeof raw.requiresConfirmation !== "boolean") {
      issues.push({ path: `${path}.requiresConfirmation`, message: "requiresConfirmation must be a boolean", code: "invalid_manifest" });
      continue;
    }
    if (typeof raw.idempotent !== "boolean") {
      issues.push({ path: `${path}.idempotent`, message: "idempotent must be a boolean", code: "invalid_manifest" });
      continue;
    }
    if (!["none", "reversible", "refund", "manual"].includes(String(raw.compensation))) {
      issues.push({ path: `${path}.compensation`, message: "invalid compensation kind", code: "invalid_manifest" });
      continue;
    }
    if (typeof raw.timeoutMs !== "number" || !Number.isFinite(raw.timeoutMs) || raw.timeoutMs <= 0) {
      issues.push({ path: `${path}.timeoutMs`, message: "timeoutMs must be a positive number", code: "invalid_manifest" });
      continue;
    }
    normalized.push({
      name,
      description: raw.description.trim(),
      risk: raw.risk,
      requiresConfirmation: raw.requiresConfirmation,
      idempotent: raw.idempotent,
      compensation: raw.compensation as ActionDescriptor["compensation"],
      timeoutMs: raw.timeoutMs,
      argsSchema: isPlainObject(raw.argsSchema) ? (raw.argsSchema as JsonSchema) : undefined,
      resultSchema: isPlainObject(raw.resultSchema) ? (raw.resultSchema as JsonSchema) : undefined,
    });
  }
  if (issues.length) return { manifest: null, issues };
  const manifest: HostCapabilityManifest = {
    schemaVersion: "1.0",
    hostId: String(input.hostId),
    hostVersion: typeof input.hostVersion === "string" ? input.hostVersion : undefined,
    locale: typeof input.locale === "string" ? input.locale : undefined,
    timeZone: typeof input.timeZone === "string" ? input.timeZone : undefined,
    capabilities: {
      canNotify: Boolean((capabilities as Record<string, unknown>)?.canNotify),
      canPersist: Boolean((capabilities as Record<string, unknown>)?.canPersist),
      canOpenWallet: Boolean((capabilities as Record<string, unknown>)?.canOpenWallet),
      canVerifyPass: Boolean((capabilities as Record<string, unknown>)?.canVerifyPass),
      canWriteCalendar: Boolean((capabilities as Record<string, unknown>)?.canWriteCalendar),
      canDeepLink: Boolean((capabilities as Record<string, unknown>)?.canDeepLink),
    },
    limits: isPlainObject(input.limits) ? (input.limits as HostCapabilityManifest["limits"]) : undefined,
    actions: normalized,
  };
  return { manifest, issues: [] };
}

/** Find one descriptor by name. */
export function findAction(
  manifest: HostCapabilityManifest | null | undefined,
  name: string,
): ActionDescriptor | null {
  return manifest?.actions.find((action) => action.name === name) ?? null;
}
