import type { Op } from "../iui/protocol";
import {
  ANSWER_SCHEMA_VERSION,
  MAX_ASSUMPTIONS,
  MAX_ASSUMPTION_LENGTH,
  MAX_ANSWER_ACTIONS,
  findAction,
  isInstant,
  isPlainObject,
  isRiskLevel,
  isUnits,
  isValidCurrency,
  isValidLocaleTag,
  isValidTimeZone,
  validateJsonSchema,
  type AnswerOp,
  type AnswerSlots,
  type HostCapabilityManifest,
  type ProposedAction,
  type ProvenanceRecord,
  type ProvenanceSummary,
  type SlotRef,
  type Verification,
} from "../iui/contracts";
import { BLOCK_TYPES } from "./catalog";
import { safeColor, safeUrl } from "../iui/security";

export interface ValidationIssue {
  path: string;
  message: string;
  /** Optional stable code from the Protocol Spec §17 table. */
  code?: string;
}

export interface ValidateOptions {
  /** known block types; defaults to the host-neutral catalog */
  blocks?: ReadonlySet<string> | Iterable<string>;
  /** accept unknown block types (they render nothing) instead of dropping */
  allowUnknownBlocks?: boolean;
  /** maximum number of ops in one answer */
  maxOps?: number;
  /** maximum serialized size of one answer */
  maxTotalBytes?: number;
  /** maximum serialized size of one component's props */
  maxPropsBytes?: number;
  /** maximum length of a single string prop */
  maxString?: number;
  /** sanitize URLs/CSS/objects (disable only for trusted local fixtures) */
  sanitize?: boolean;
  /** host capability manifest; required when an answer declares actions */
  capabilities?: HostCapabilityManifest | null;
}

export interface ValidatedOp {
  op: Op | null;
  issues: ValidationIssue[];
  bytes: number;
}

export interface ValidateResult {
  ops: Op[];
  issues: ValidationIssue[];
  bytes: number;
}

export interface AnswerValidationResult extends ValidateResult {
  /** The validated envelope, or null when the answer is in legacy mode. */
  envelope: AnswerOp | null;
  /** True when no valid `answer` op was present. */
  legacy: boolean;
}

export const VALIDATION_LIMITS = {
  maxOps: 512,
  maxTotalBytes: 1_500_000,
  maxPropsBytes: 192_000,
  maxString: 40_000,
} as const;

const DEFAULTS = VALIDATION_LIMITS;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const UNTRUSTED_MODEL_KEYS = new Set([
  "operationId",
  "idempotencyKey",
  "authorizedAt",
  "auditId",
  "confirmedBy",
]);
const TABLE_MAX_COLS = 10;
const TABLE_MAX_ROWS = 300;
const URL_KEYS = /^(src|img|photo|poster|thumb|href|url)$/i;
const LINK_KEYS = /^(href|url)$/i;
const SOURCE_KINDS = new Set(["issuer", "host", "user", "model", "derived"]);
const utf8 = new TextEncoder();

function jsonBytes(value: unknown): number {
  return utf8.encode(JSON.stringify(value) ?? "").byteLength;
}

function stateKey(path: string): string {
  const clean = path.replace(/^props\./, "");
  const last = clean.split(".").at(-1) ?? "";
  return last.replace(/\[[^\]]*\]/g, "");
}

function issue(
  list: ValidationIssue[],
  path: string,
  message: string,
  code?: string,
) {
  if (list.length < 100) list.push({ path, message, ...(code ? { code } : {}) });
}

function toSet(input: ValidateOptions["blocks"]): ReadonlySet<string> | null {
  if (!input) return null;
  return input instanceof Set ? input : new Set(input);
}

function sanitizeValue(
  value: unknown,
  opts: Required<Pick<ValidateOptions, "maxString" | "sanitize">> & { maxPropsBytes: number },
  path: string,
  issues: ValidationIssue[],
  key = "",
  depth = 0,
): unknown {
  if (depth > 10) {
    issue(issues, path, "nesting too deep");
    return null;
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      issue(issues, path, "non-finite number");
      return 0;
    }
    return value;
  }
  if (typeof value === "string") {
    let text: string = value;
    if (text.length > opts.maxString) {
      issue(issues, path, `string truncated to ${opts.maxString} chars`);
      text = text.slice(0, opts.maxString);
    }
    if (opts.sanitize) {
      if (URL_KEYS.test(key)) {
        const safe = safeUrl(text, LINK_KEYS.test(key) ? "link" : "image");
        if (!safe) {
          issue(issues, path, `unsafe ${key} URL removed`);
          return null;
        }
        return safe;
      }
      if (key === "bg" || key === "background") return safeColor(text, "");
    }
    return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  }
  if (Array.isArray(value)) {
    if (value.length > 500) {
      issue(issues, path, "array truncated to 500 items");
    }
    const list = value.slice(0, 500) as unknown[];
    return list
      .map((item, i) => sanitizeValue(item, opts, `${path}[${i}]`, issues, key, depth + 1))
      .filter((v) => v !== null && v !== undefined);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(k) || typeof v === "function" || typeof v === "symbol") {
        issue(issues, `${path}.${k}`, "unsafe property removed");
        continue;
      }
      const cleaned = sanitizeValue(v, opts, `${path}.${k}`, issues, k, depth + 1);
      if (cleaned !== null && cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  issue(issues, path, `unsupported value (${typeof value})`);
  return null;
}

/** Remove host-only fields that a model must never set. */
function stripUntrustedFields(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => stripUntrustedFields(item, `${path}[${index}]`, issues));
  }
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (UNTRUSTED_MODEL_KEYS.has(key)) {
      issue(issues, `${path}.${key}`, `model must not set "${key}"`, "untrusted_field");
      continue;
    }
    out[key] = stripUntrustedFields(child, `${path}.${key}`, issues);
  }
  return out;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  return v.length > max ? v.slice(0, max) : v;
}

function strArray(v: unknown, maxItems: number, maxChars: number): string[] | null {
  if (!Array.isArray(v)) return null;
  return v
    .slice(0, maxItems)
    .map((x) => (typeof x === "number" ? String(x) : str(x, maxChars) ?? ""))
    .filter((x) => x.length > 0);
}

function normalizeSlot(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): SlotRef | null {
  if (!isPlainObject(raw)) {
    issue(issues, path, "slot must be an object", "invalid_slot");
    return null;
  }
  const kind = raw.kind;
  const id = str(raw.id, 100);
  if (kind !== "op" && kind !== "comp" && kind !== "action") {
    issue(issues, `${path}.kind`, "slot kind must be op, comp, or action", "invalid_slot");
    return null;
  }
  if (!id) {
    issue(issues, `${path}.id`, "slot id is required", "invalid_slot");
    return null;
  }
  return { kind, id };
}

function normalizeSlots(
  raw: unknown,
  issues: ValidationIssue[],
): AnswerSlots | null {
  if (!isPlainObject(raw)) {
    issue(issues, "slots", "slots must be an object", "invalid_slot");
    return null;
  }
  const conclusion = normalizeSlot(raw.conclusion, "slots.conclusion", issues);
  if (!conclusion) {
    issue(issues, "slots.conclusion", "conclusion slot is required", "missing_conclusion");
  } else if (conclusion.kind !== "op") {
    issue(issues, "slots.conclusion", "conclusion must reference an op", "invalid_conclusion");
  }
  const primaryArtifact =
    raw.primaryArtifact === undefined
      ? undefined
      : normalizeSlot(raw.primaryArtifact, "slots.primaryArtifact", issues) ?? undefined;
  if (primaryArtifact && primaryArtifact.kind !== "comp") {
    issue(issues, "slots.primaryArtifact", "primaryArtifact must reference a comp", "invalid_primary_artifact");
  }
  const primaryAction =
    raw.primaryAction === undefined
      ? undefined
      : normalizeSlot(raw.primaryAction, "slots.primaryAction", issues) ?? undefined;
  if (primaryAction && primaryAction.kind !== "action") {
    issue(issues, "slots.primaryAction", "primaryAction must reference an action", "unknown_action");
  }
  const list = (key: "explanation" | "provenance"): SlotRef[] | undefined => {
    if (raw[key] === undefined) return undefined;
    if (!Array.isArray(raw[key])) {
      issue(issues, `slots.${key}`, `${key} must be an array`, "invalid_slot");
      return undefined;
    }
    return (raw[key] as unknown[])
      .slice(0, 12)
      .map((item, index) => normalizeSlot(item, `slots.${key}[${index}]`, issues))
      .filter((item): item is SlotRef => item !== null);
  };
  const explanation = list("explanation");
  const provenanceSlots = list("provenance");
  return {
    ...(conclusion ? { conclusion } : {}),
    ...(primaryArtifact ? { primaryArtifact } : {}),
    ...(primaryAction ? { primaryAction } : {}),
    ...(explanation ? { explanation } : {}),
    ...(provenanceSlots ? { provenance: provenanceSlots } : {}),
  } as AnswerSlots;
}

function normalizeAction(
  raw: unknown,
  index: number,
  issues: ValidationIssue[],
  manifest: HostCapabilityManifest | null | undefined,
): ProposedAction | null {
  const path = `actions[${index}]`;
  if (!isPlainObject(raw)) {
    issue(issues, path, "action must be an object", "invalid_intent");
    return null;
  }
  const id = str(raw.id, 100);
  if (!id) {
    issue(issues, `${path}.id`, "action id is required", "invalid_intent");
    return null;
  }
  const name = str(raw.name, 100);
  if (!name) {
    issue(issues, `${path}.name`, "action name is required", "invalid_intent");
    return null;
  }
  const descriptor = findAction(manifest, name);
  if (!descriptor) {
    issue(issues, `${path}.name`, `action "${name}" is not declared by the host manifest`, "unsupported_action");
    return null;
  }
  if (descriptor.risk === "irreversible") {
    issue(issues, `${path}.name`, `action "${name}" is irreversible and is not open in stage 1a`, "action_not_open");
    return null;
  }
  let args: Record<string, unknown> | undefined;
  if (raw.args !== undefined) {
    if (!isPlainObject(raw.args)) {
      issue(issues, `${path}.args`, "args must be an object", "invalid_args");
    } else {
      const cleanArgs = stripUntrustedFields(raw.args, `${path}.args`, issues);
      if (!isPlainObject(cleanArgs)) {
        issue(issues, `${path}.args`, "args must be an object", "invalid_args");
      } else {
        const argIssues: Array<{ path: string; message: string; code?: string }> = [];
        validateJsonSchema(descriptor.argsSchema, cleanArgs, `${path}.args`, argIssues);
        for (const item of argIssues) {
          issue(issues, item.path, item.message, item.code ?? "invalid_args");
        }
        if (!argIssues.length) args = cleanArgs;
      }
    }
  } else {
    const argIssues: Array<{ path: string; message: string; code?: string }> = [];
    validateJsonSchema(descriptor.argsSchema, {}, `${path}.args`, argIssues);
    for (const item of argIssues) {
      issue(issues, item.path, item.message, item.code ?? "invalid_args");
    }
    if (!argIssues.length) args = undefined;
  }
  const confirmHint = raw.confirmHint === undefined ? undefined : str(raw.confirmHint, 280) ?? undefined;
  if (raw.confirmHint !== undefined && confirmHint === undefined) {
    issue(issues, `${path}.confirmHint`, "confirmHint must be a string", "invalid_intent");
  }
  let riskHint: ProposedAction["riskHint"];
  if (raw.riskHint !== undefined) {
    if (!isRiskLevel(raw.riskHint)) {
      issue(issues, `${path}.riskHint`, "riskHint must be read, reversible, or irreversible", "invalid_intent");
    } else {
      riskHint = raw.riskHint;
    }
  }
  return {
    id,
    name,
    ...(args ? { args } : {}),
    ...(confirmHint ? { confirmHint } : {}),
    ...(riskHint ? { riskHint } : {}),
  };
}

function normalizeVerification(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): Verification | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    issue(issues, path, "verification must be an object", "untrusted_verification");
    return undefined;
  }
  if (raw.sourceIdentity === "verified") {
    issue(issues, `${path}.sourceIdentity`, "model verification cannot claim source identity", "untrusted_verification");
  }
  if (raw.integrity === "verified") {
    issue(issues, `${path}.integrity`, "model verification cannot claim integrity", "untrusted_verification");
  }
  if (raw.crossSource === "consistent") {
    issue(issues, `${path}.crossSource`, "model verification cannot claim cross-source consistency", "untrusted_verification");
  }
  const sourceIdentity = "unverified";
  const integrity =
    raw.integrity === "invalid" || raw.integrity === "revoked"
      ? raw.integrity
      : "unverified";
  const schema = raw.schema === "valid" ? "valid" : "invalid";
  const crossSource = raw.crossSource === "conflict" ? "conflict" : "not_checked";
  return {
    sourceIdentity,
    integrity,
    schema,
    crossSource,
  };
}

function normalizeProvenanceSummary(
  raw: unknown,
  issues: ValidationIssue[],
): ProvenanceSummary | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    issue(issues, "provenance", "provenance must be an object", "missing_provenance");
    return undefined;
  }
  if (raw.authority !== "claimed") {
    issue(issues, "provenance.authority", "model provenance authority must be claimed", "untrusted_verification");
  }
  if (!isPlainObject(raw.source)) {
    issue(issues, "provenance.source", "provenance source is required", "missing_provenance");
    return undefined;
  }
  const sourceId = str(raw.source.id, 160);
  const sourceKind = str(raw.source.kind, 40);
  if (!sourceId || !sourceKind) {
    issue(issues, "provenance.source", "source id and kind are required", "missing_provenance");
    return undefined;
  }
  let kind: ProvenanceSummary["source"]["kind"] = "model";
  if (SOURCE_KINDS.has(sourceKind)) {
    kind = sourceKind as ProvenanceSummary["source"]["kind"];
  } else {
    issue(issues, "provenance.source.kind", "unknown source kind", "invalid_provenance");
  }
  const retrievedAt = isInstant(raw.retrievedAt) ? raw.retrievedAt : null;
  if (!retrievedAt) {
    issue(issues, "provenance.retrievedAt", "retrievedAt must be an RFC 3339 instant", "missing_provenance");
  }
  const verification = normalizeVerification(raw.verification, "provenance.verification", issues);
  if (!verification) {
    issue(issues, "provenance.verification", "verification is required", "missing_provenance");
  }
  return {
    authority: "claimed",
    source: {
      id: sourceId,
      kind,
      ...(typeof raw.source.url === "string" ? { url: raw.source.url } : {}),
    },
    retrievedAt: retrievedAt ?? new Date(0).toISOString(),
    ...(isInstant(raw.observedAt) ? { observedAt: raw.observedAt } : {}),
    ...(isInstant(raw.validFrom) ? { validFrom: raw.validFrom } : {}),
    ...(isInstant(raw.validUntil) ? { validUntil: raw.validUntil } : {}),
    ...(isInstant(raw.staleAfter) ? { staleAfter: raw.staleAfter } : {}),
    verification: verification ?? {
      sourceIdentity: "unverified",
      integrity: "unverified",
      schema: "invalid",
      crossSource: "not_checked",
    },
    ...(Array.isArray(raw.assumptions)
      ? {
          assumptions: raw.assumptions
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim().slice(0, MAX_ASSUMPTION_LENGTH))
            .filter((item) => item.length > 0)
            .slice(0, MAX_ASSUMPTIONS),
        }
      : {}),
  };
}

function normalizeConfidence(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): ProvenanceRecord["confidence"] | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    issue(issues, path, "confidence must be an object", "invalid_provenance");
    return undefined;
  }
  let kind: NonNullable<ProvenanceRecord["confidence"]>["kind"] = "model";
  if (raw.kind === "source" || raw.kind === "calibrated") {
    kind = raw.kind;
  } else if (raw.kind !== undefined && raw.kind !== "model") {
    issue(issues, `${path}.kind`, "confidence kind must be source, model, or calibrated", "invalid_provenance");
  }
  let value: number | undefined;
  if (raw.value !== undefined) {
    if (typeof raw.value === "number" && Number.isFinite(raw.value) && raw.value >= 0 && raw.value <= 1) {
      value = raw.value;
    } else {
      issue(issues, `${path}.value`, "confidence value must be between 0 and 1", "invalid_provenance");
    }
  }
  const method = str(raw.method, 200) ?? undefined;
  const dataset = str(raw.dataset, 200) ?? undefined;
  return {
    kind,
    ...(value !== undefined ? { value } : {}),
    ...(method ? { method } : {}),
    ...(dataset ? { dataset } : {}),
    ...(isInstant(raw.calibratedAt) ? { calibratedAt: raw.calibratedAt } : {}),
  };
}

function normalizeFieldProvenance(
  raw: unknown,
  issues: ValidationIssue[],
): ProvenanceRecord[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    issue(issues, "fieldProvenance", "fieldProvenance must be an array", "invalid_provenance");
    return undefined;
  }
  const out: ProvenanceRecord[] = [];
  for (const [index, item] of raw.slice(0, 64).entries()) {
    const path = `fieldProvenance[${index}]`;
    if (!isPlainObject(item)) {
      issue(issues, path, "field provenance record must be an object", "invalid_provenance");
      continue;
    }
    const fieldPath = str(item.fieldPath, 200);
    if (fieldPath === null) {
      issue(issues, `${path}.fieldPath`, "fieldPath must be a string", "invalid_provenance");
      continue;
    }
    if (item.producer !== undefined && item.producer !== "model") {
      issue(issues, `${path}.producer`, "model field provenance producer must be model", "untrusted_verification");
    }
    if (item.authority !== undefined && item.authority !== "claimed") {
      issue(issues, `${path}.authority`, "model field provenance authority must be claimed", "untrusted_verification");
    }
    const producer = "model";
    const authority = "claimed";
    if (!isPlainObject(item.source)) {
      issue(issues, `${path}.source`, "source is required", "invalid_provenance");
      continue;
    }
    const sourceId = str(item.source.id, 160);
    const sourceKind = str(item.source.kind, 40);
    if (!sourceId || !sourceKind) {
      issue(issues, `${path}.source`, "source id and kind are required", "invalid_provenance");
      continue;
    }
    if (!isInstant(item.retrievedAt)) {
      issue(issues, `${path}.retrievedAt`, "retrievedAt must be an RFC 3339 instant", "invalid_provenance");
      continue;
    }
    const verification = normalizeVerification(item.verification, `${path}.verification`, issues);
    const confidence = normalizeConfidence(item.confidence, `${path}.confidence`, issues);
    out.push({
      fieldPath,
      producer,
      authority,
      source: {
        id: sourceId,
        kind: sourceKind,
        ...(typeof item.source.url === "string" ? { url: item.source.url } : {}),
      },
      retrievedAt: item.retrievedAt,
      ...(isInstant(item.observedAt) ? { observedAt: item.observedAt } : {}),
      ...(isInstant(item.validFrom) ? { validFrom: item.validFrom } : {}),
      ...(isInstant(item.validUntil) ? { validUntil: item.validUntil } : {}),
      ...(isInstant(item.staleAfter) ? { staleAfter: item.staleAfter } : {}),
      ...(verification ? { verification } : {}),
      ...(confidence ? { confidence } : {}),
    });
  }
  return out;
}

function normalizeAnswer(
  input: Record<string, unknown>,
  issues: ValidationIssue[],
  opts: ValidateOptions,
): AnswerOp | null {
  if (input.schemaVersion !== ANSWER_SCHEMA_VERSION) {
    issue(issues, "schemaVersion", `unsupported answer schemaVersion "${String(input.schemaVersion)}"`, "unsupported_version");
    return null;
  }
  let locale = str(input.locale, 64);
  if (!locale || !isValidLocaleTag(locale)) {
    issue(issues, "locale", "locale must be a valid BCP 47 tag", "invalid_locale");
    locale = "en-US";
  }
  let timeZone = str(input.timeZone, 64);
  if (!timeZone || !isValidTimeZone(timeZone)) {
    issue(issues, "timeZone", "timeZone must be a valid IANA name", "invalid_locale");
    timeZone = "UTC";
  }
  let currency: string | undefined;
  if (input.currency !== undefined) {
    const rawCurrency =
      typeof input.currency === "string" && input.currency.trim().length === 3
        ? input.currency.trim()
        : null;
    if (!rawCurrency || !isValidCurrency(rawCurrency)) {
      issue(issues, "currency", "currency must be a valid ISO 4217 code", "invalid_locale");
    } else {
      currency = rawCurrency.toUpperCase();
    }
  }
  let units: AnswerOp["units"];
  if (input.units !== undefined) {
    if (!isUnits(input.units)) {
      issue(issues, "units", "units must be metric or imperial", "invalid_locale");
    } else {
      units = input.units;
    }
  }
  const slots = normalizeSlots(input.slots, issues);
  if (!slots) return null;
  if (!slots.conclusion) {
    // Protocol §4.5 allows rejection when the conclusion is missing.
    // Drop the envelope so the answer renders in explicit legacy mode.
    return null;
  }
  let actions: ProposedAction[] | undefined;
  if (input.actions !== undefined) {
    if (!Array.isArray(input.actions)) {
      issue(issues, "actions", "actions must be an array", "invalid_intent");
    } else {
      if (input.actions.length > MAX_ANSWER_ACTIONS) {
        issue(issues, "actions", `at most ${MAX_ANSWER_ACTIONS} actions are allowed`, "limit_exceeded");
      }
      const seen = new Set<string>();
      const list = (input.actions as unknown[])
        .slice(0, MAX_ANSWER_ACTIONS)
        .map((raw, index) => normalizeAction(raw, index, issues, opts.capabilities ?? null))
        .filter((item): item is ProposedAction => item !== null)
        .filter((item) => {
          if (seen.has(item.id)) {
            issue(issues, "actions", `duplicate action id "${item.id}"`, "duplicate_id");
            return false;
          }
          seen.add(item.id);
          return true;
        });
      if (list.length) actions = list;
    }
  }
  const provenance = normalizeProvenanceSummary(input.provenance, issues);
  const fieldProvenance = normalizeFieldProvenance(input.fieldProvenance, issues);
  let assumptions: string[] | undefined;
  if (input.assumptions !== undefined) {
    if (!Array.isArray(input.assumptions)) {
      issue(issues, "assumptions", "assumptions must be an array", "invalid_intent");
    } else {
      const list = input.assumptions
        .slice(0, MAX_ASSUMPTIONS)
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().slice(0, MAX_ASSUMPTION_LENGTH));
      if (list.length) assumptions = list;
    }
  }
  const answerId = input.answerId === undefined ? undefined : str(input.answerId, 100) ?? undefined;
  return {
    t: "answer",
    schemaVersion: ANSWER_SCHEMA_VERSION,
    ...(answerId ? { answerId } : {}),
    locale: locale!,
    timeZone: timeZone!,
    ...(currency ? { currency } : {}),
    ...(units ? { units } : {}),
    slots,
    ...(actions ? { actions } : {}),
    ...(provenance ? { provenance } : {}),
    ...(fieldProvenance ? { fieldProvenance } : {}),
    ...(assumptions ? { assumptions } : {}),
  };
}

export function validateOp(input: unknown, options: ValidateOptions = {}): ValidatedOp {
  const issues: ValidationIssue[] = [];
  const opts = {
    maxString: options.maxString ?? DEFAULTS.maxString,
    maxPropsBytes: options.maxPropsBytes ?? DEFAULTS.maxPropsBytes,
    sanitize: options.sanitize !== false,
  };
  const blockSet = toSet(options.blocks);

  if (!isPlainObject(input)) {
    return { op: null, issues: [{ path: "$", message: "op must be a JSON object" }], bytes: 0 };
  }

  const t = input.t;
  let op: Op | null = null;

  switch (t) {
    case "model": {
      const v = str(input.v, 160);
      if (v === null) issue(issues, "v", "model label must be a string");
      op = v !== null ? { t: "model", v } : null;
      break;
    }
    case "p": {
      let lvl = input.lvl;
      if (lvl !== undefined && ![0, 2, 3, 4].includes(lvl as number)) {
        issue(issues, "lvl", "paragraph level must be 0, 2, 3 or 4");
        lvl = 0;
      }
      const id = input.id === undefined ? undefined : str(input.id, 100);
      if (input.id !== undefined && id === null) issue(issues, "id", "id must be a string");
      op = {
        t: "p",
        ...(lvl !== undefined ? { lvl: lvl as 0 | 2 | 3 | 4 } : {}),
        ...(id ? { id } : {}),
      };
      break;
    }
    case "md": {
      const v = str(input.v, 200_000);
      if (v === null) issue(issues, "v", "markdown payload must be a string");
      const id = input.id === undefined ? undefined : str(input.id, 100);
      if (input.id !== undefined && id === null) issue(issues, "id", "id must be a string");
      op = v !== null ? { t: "md", v, ...(id ? { id } : {}) } : null;
      break;
    }
    case "table": {
      const head = strArray(input.head, TABLE_MAX_COLS, 200);
      const rowsIn = Array.isArray(input.rows) ? input.rows.slice(0, TABLE_MAX_ROWS) : null;
      if (!head || head.length === 0) {
        issue(issues, "head", "table head must be a non-empty string array");
        break;
      }
      if (!rowsIn) {
        issue(issues, "rows", "table rows must be an array");
        break;
      }
      const rows = rowsIn.map((row, i) => {
        const cells = Array.isArray(row) ? row : [];
        if (cells.length !== head.length) {
          issue(issues, `rows[${i}]`, `expected ${head.length} cells, got ${cells.length}`);
        }
        return Array.from({ length: head.length }, (_, j) =>
          typeof cells[j] === "number" ? String(cells[j]) : str(cells[j], 4000) ?? "",
        );
      });
      const id = input.id === undefined ? undefined : str(input.id, 100);
      if (input.id !== undefined && id === null) issue(issues, "id", "id must be a string");
      op = { t: "table", head, rows, ...(id ? { id } : {}) };
      break;
    }
    case "comp": {
      const type = str(input.type, 64);
      if (!type) {
        issue(issues, "type", "component type is required");
        break;
      }
      const known = blockSet ? blockSet.has(type) : BLOCK_TYPES.has(type);
      if (!known && !options.allowUnknownBlocks) {
        issue(issues, "type", `unknown block type "${type}"`);
        break;
      }
      let id = str(input.id, 100);
      if (!id) {
        id = `c_${Math.random().toString(36).slice(2, 8)}`;
        issue(issues, "id", `missing component id; assigned "${id}"`);
      }
      if (!isPlainObject(input.props)) {
        if (input.props !== undefined) issue(issues, "props", "props must be an object");
        op = { t: "comp", id, type, props: {} };
        break;
      }
      let props = sanitizeValue(input.props, opts, "props", issues) as Record<string, unknown>;
      props = stripUntrustedFields(props, "props", issues) as Record<string, unknown>;
      const size = jsonBytes(props);
      if (size > opts.maxPropsBytes) {
        issue(issues, "props", `props exceed ${opts.maxPropsBytes} bytes`);
        break;
      }
      op = { t: "comp", id, type, props };
      break;
    }
    case "set": {
      const id = str(input.id, 100);
      const path = str(input.path, 200);
      if (!id || !path) {
        issue(issues, "$", "set requires id and path");
        break;
      }
      if (!/^[A-Za-z0-9_$.[\]-]+$/.test(path)) {
        issue(issues, "path", "set path contains unsupported characters");
        break;
      }
      const key = stateKey(path);
      const v = sanitizeValue(input.v, opts, "v", issues, key);
      if (v === null && input.v !== null && URL_KEYS.test(key)) {
        break;
      }
      if (jsonBytes(v) > opts.maxPropsBytes) {
        issue(issues, "v", `set value exceeds ${opts.maxPropsBytes} bytes`);
        break;
      }
      op = { t: "set", id, path, v };
      break;
    }
    case "ask": {
      const v = strArray(input.v, 6, 120);
      if (!v || v.length === 0) {
        issue(issues, "v", "ask requires 1–6 suggestions");
        break;
      }
      op = { t: "ask", v };
      break;
    }
    case "answer": {
      op = normalizeAnswer(input, issues, options);
      break;
    }
    case "done":
      op = { t: "done" };
      break;
    default:
      issue(issues, "t", `unknown op type "${String(t)}"`);
  }

  const bytes = op ? jsonBytes(op) : 0;
  return { op, issues, bytes };
}

function collectIds(
  op: Op,
  ids: Map<string, "op" | "comp" | "action">,
  issues: ValidationIssue[],
  path: string,
): boolean {
  let id: string | undefined;
  let kind: "op" | "comp" | "action" | null = null;
  if (op.t === "p" || op.t === "md" || op.t === "table") {
    id = op.id;
    kind = "op";
  } else if (op.t === "comp") {
    id = op.id;
    kind = "comp";
  } else if (op.t === "answer") {
    for (const action of op.actions ?? []) {
      const existing = ids.get(action.id);
      if (existing) {
        issue(issues, `${path}.actions`, `duplicate action id "${action.id}"`, "duplicate_id");
      } else {
        ids.set(action.id, "action");
      }
    }
    return true;
  }
  if (!id || !kind) return true;
  const existing = ids.get(id);
  if (existing) {
    issue(
      issues,
      `${path}.id`,
      kind === "comp"
        ? `duplicate component id "${id}" (already used by ${existing})`
        : `duplicate id "${id}" (already used by ${existing})`,
      "duplicate_id",
    );
    return false;
  }
  ids.set(id, kind);
  return true;
}

export function validateOps(input: unknown, options: ValidateOptions = {}): ValidateResult {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(input)) {
    return { ops: [], issues: [{ path: "$", message: "expected an array of ops" }], bytes: 0 };
  }
  const maxOps = options.maxOps ?? DEFAULTS.maxOps;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULTS.maxTotalBytes;
  const blockSet = toSet(options.blocks);

  const ops: Op[] = [];
  const ids = new Map<string, "op" | "comp" | "action">();
  let bytes = 0;
  for (let i = 0; i < input.length; i++) {
    if (ops.length >= maxOps) {
      issue(issues, `$[${i}]`, `op limit (${maxOps}) reached`);
      break;
    }
    const result = validateOp(input[i], {
      ...options,
      blocks: blockSet ?? undefined,
      capabilities: options.capabilities ?? null,
    });
    for (const it of result.issues) issue(issues, `$[${i}].${it.path}`, it.message, it.code);
    if (!result.op) continue;
    if (result.op.t === "answer" && ops.some((op) => op.t === "answer")) {
      issue(issues, `$[${i}]`, "answer op may appear at most once", "invalid_answer");
      continue;
    }
    if (result.op.t === "answer" && i !== 0) {
      issue(issues, `$[${i}]`, "answer op must be the first op", "invalid_answer");
      continue;
    }
    if (!collectIds(result.op, ids, issues, `$[${i}]`)) continue;
    if (bytes + result.bytes > maxTotalBytes) {
      issue(issues, `$[${i}]`, `answer exceeds ${maxTotalBytes} bytes`);
      break;
    }
    bytes += result.bytes;
    ops.push(result.op);
    if (result.op.t === "done") break;
  }
  return { ops, issues, bytes };
}

function resolveSlot(
  slot: SlotRef | undefined,
  ids: Map<string, "op" | "comp" | "action">,
  expected: "op" | "comp" | "action",
  slotPath: string,
  issues: ValidationIssue[],
): boolean {
  if (!slot) return true;
  const actual = ids.get(slot.id);
  if (!actual) {
    issue(issues, slotPath, `slot references unknown ${slot.kind} "${slot.id}"`, "invalid_slot");
    return false;
  }
  if (actual !== expected) {
    issue(issues, slotPath, `slot "${slot.id}" resolves to ${actual}, expected ${expected}`, "invalid_slot");
    return false;
  }
  return true;
}

/**
 * Validate a complete answer, including the Answer Envelope's cross-op slots.
 * Use this for a finished answer. Streaming callers can keep using `validateOp`.
 */
export function validateAnswerOps(
  input: unknown,
  options: ValidateOptions = {},
): AnswerValidationResult {
  const base = validateOps(input, options);
  const issues = [...base.issues];
  const envelope = (base.ops.find((op) => op.t === "answer") as AnswerOp | undefined) ?? null;
  if (!envelope) {
    return { ...base, envelope: null, legacy: base.ops.length > 0 };
  }

  const ids = new Map<string, "op" | "comp" | "action">();
  for (const [index, op] of base.ops.entries()) {
    if (op.t === "answer") {
      for (const action of op.actions ?? []) ids.set(action.id, "action");
      continue;
    }
    if (op.t === "p" || op.t === "md" || op.t === "table") {
      if (op.id) ids.set(op.id, "op");
    } else if (op.t === "comp") {
      ids.set(op.id, "comp");
    }
    void index;
  }

  const slots = envelope.slots;
  const conclusionOk = resolveSlot(slots.conclusion, ids, "op", "slots.conclusion", issues);
  if (conclusionOk && slots.conclusion) {
    const target = base.ops.find(
      (op) => (op.t === "p" || op.t === "md" || op.t === "table") && op.id === slots.conclusion.id,
    );
    if (!target || target.t === "model") {
      issue(issues, "slots.conclusion", "conclusion must reference prose or a table", "invalid_conclusion");
    }
  }
  resolveSlot(slots.primaryArtifact, ids, "comp", "slots.primaryArtifact", issues);
  const primaryActionOk = resolveSlot(
    slots.primaryAction,
    ids,
    "action",
    "slots.primaryAction",
    issues,
  );
  for (const [index, slot] of (slots.explanation ?? []).entries()) {
    resolveSlot(slot, ids, "op", `slots.explanation[${index}]`, issues);
  }
  for (const [index, slot] of (slots.provenance ?? []).entries()) {
    resolveSlot(slot, ids, "op", `slots.provenance[${index}]`, issues);
  }

  const hasAction = (envelope.actions?.length ?? 0) > 0;
  if (hasAction && !slots.primaryAction) {
    issue(issues, "slots.primaryAction", "primaryAction is required when actions are declared", "unknown_action");
  }
  if (slots.primaryAction && !primaryActionOk) {
    issue(issues, "slots.primaryAction", "primaryAction must reference a declared action", "unknown_action");
  }
  if (hasAction && !slots.primaryArtifact) {
    issue(issues, "slots.primaryArtifact", "primaryArtifact is required when an action is declared", "invalid_primary_artifact");
  }
  const hasData =
    base.ops.some((op) => op.t === "comp" || op.t === "table") || hasAction;
  if (hasData && !envelope.provenance) {
    issue(issues, "provenance", "answer provenance is required for answers with data or actions", "missing_provenance");
  }
  if (envelope.provenance && !isInstant(envelope.provenance.retrievedAt)) {
    issue(issues, "provenance.retrievedAt", "retrievedAt must be an RFC 3339 instant", "missing_provenance");
  }

  return {
    ...base,
    issues,
    envelope,
    legacy: false,
  };
}

/** Convenience for agent adapters: parse + validate NDJSON text. */
export function validateNdjson(text: string, options: ValidateOptions = {}): ValidateResult {
  const raw: unknown[] = [];
  const issues: ValidationIssue[] = [];
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    const t = line.trim();
    if (!t) continue;
    try {
      raw.push(JSON.parse(t));
    } catch {
      issue(issues, `$line[${i + 1}]`, "invalid JSON");
    }
  }
  const result = validateOps(raw, options);
  return { ...result, issues: [...issues, ...result.issues] };
}
