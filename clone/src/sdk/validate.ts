import type { Op } from "../iui/protocol";
import { BLOCK_TYPES } from "./catalog";
import { safeColor, safeUrl } from "../iui/security";

export interface ValidationIssue {
  path: string;
  message: string;
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

export const VALIDATION_LIMITS = {
  maxOps: 512,
  maxTotalBytes: 1_500_000,
  maxPropsBytes: 192_000,
  maxString: 40_000,
} as const;

const DEFAULTS = VALIDATION_LIMITS;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const TABLE_MAX_COLS = 10;
const TABLE_MAX_ROWS = 300;
const URL_KEYS = /^(src|img|photo|poster|thumb|href|url)$/i;
const LINK_KEYS = /^(href|url)$/i;
const utf8 = new TextEncoder();

function jsonBytes(value: unknown): number {
  return utf8.encode(JSON.stringify(value) ?? "").byteLength;
}

function stateKey(path: string): string {
  const clean = path.replace(/^props\./, "");
  const last = clean.split(".").at(-1) ?? "";
  return last.replace(/\[[^\]]*\]/g, "");
}

function issue(list: ValidationIssue[], path: string, message: string) {
  if (list.length < 100) list.push({ path, message });
}

function toSet(input: ValidateOptions["blocks"]): ReadonlySet<string> | null {
  if (!input) return null;
  return input instanceof Set ? input : new Set(input);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
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
      op = { t: "p", ...(lvl !== undefined ? { lvl: lvl as 0 | 2 | 3 | 4 } : {}) };
      break;
    }
    case "md": {
      const v = str(input.v, 200_000);
      if (v === null) issue(issues, "v", "markdown payload must be a string");
      op = v !== null ? { t: "md", v } : null;
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
      op = { t: "table", head, rows };
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
      const props = sanitizeValue(input.props, opts, "props", issues) as Record<string, unknown>;
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
    case "done":
      op = { t: "done" };
      break;
    default:
      issue(issues, "t", `unknown op type "${String(t)}"`);
  }

  const bytes = op ? jsonBytes(op) : 0;
  return { op, issues, bytes };
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
  const ids = new Set<string>();
  let bytes = 0;
  for (let i = 0; i < input.length; i++) {
    if (ops.length >= maxOps) {
      issue(issues, `$[${i}]`, `op limit (${maxOps}) reached`);
      break;
    }
    const result = validateOp(input[i], { ...options, blocks: blockSet ?? undefined });
    for (const it of result.issues) issue(issues, `$[${i}].${it.path}`, it.message);
    if (!result.op) continue;
    if (result.op.t === "comp") {
      if (ids.has(result.op.id)) {
        issue(issues, `$[${i}].id`, `duplicate component id "${result.op.id}"`);
        continue;
      }
      ids.add(result.op.id);
    }
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
