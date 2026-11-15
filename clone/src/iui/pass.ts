/**
 * Travel pass profile (stage 1b).
 *
 * This module is host-neutral: it defines the payload, trust/freshness axes,
 * snapshot seal and validation rules. It never reads model-provided trust
 * fields. The host supplies an attestation after verifying the issuer
 * signature and revocation state.
 */

import {
  canonicalJson,
  isInstant,
  isPlainObject,
  isValidTimeZone,
  type ContractIssue,
} from "./contracts";

export type PassIntegrity = "verified" | "unverified" | "invalid" | "revoked";
export type PassFreshness = "live" | "stale" | "expired" | "unknown";
export type PassKind = "boarding-pass";
export const PASS_SIGNATURE_ALGORITHM = "Ed25519" as const;

/** Detached issuer signature over the canonical payload JSON. */
export interface PassSignature {
  alg: typeof PASS_SIGNATURE_ALGORITHM;
  keyId: string;
  /** base64 (standard, padded is accepted) */
  value: string;
}

export interface PassIssuer {
  id: string;
  name: string;
  keyId: string;
  algorithm: string;
}

export interface PassRouteEndpoint {
  code: string;
  city: string;
}

export interface PassPayload {
  kind: PassKind;
  credentialId: string;
  issuer: PassIssuer;
  holder: { name: string };
  bookingRef: string;
  cabin: string;
  flight: string;
  route: { from: PassRouteEndpoint; to: PassRouteEndpoint };
  departAt: string;
  arriveAt: string;
  boardingAt: string;
  departTimeZone: string;
  arriveTimeZone: string;
  terminal?: string;
  gate?: string;
  seat: string;
  boardingGroup?: string;
  qr: {
    format: "qr" | "iui-pass-v1" | "pdf417" | "aztec";
    payload: string;
  };
  validFrom: string;
  validUntil: string;
}

/** Host-owned trust record. Model props must never be the source of this. */
export interface PassAttestation {
  credentialId: string;
  integrity: PassIntegrity;
  observedAt: string;
  checkedAt: string;
  validUntil: string;
  staleAfter: string;
  source: { id: string; kind: string; url?: string };
  /** Set when this record came from an offline snapshot. */
  snapshotAt?: string;
}

/** Latest live value the host saw, used to explain a stale snapshot. */
export interface PassLatestKnown {
  gate?: string;
  observedAt: string;
}

export interface PassSnapshot {
  schemaVersion: "1.0";
  credentialId: string;
  payload: PassPayload;
  snapshotAt: string;
  lastCheckedAt?: string;
  validUntil: string;
  staleAfter: string;
  /** Sealed status at snapshot time; absent means verified payload. */
  integrity?: PassIntegrity;
  seal: {
    credential: {
      alg: "issuer-signature";
      keyId: string;
      value: string;
    };
    metadata?: {
      alg: "host-hmac-sha256";
      keyId: string;
      value: string;
    };
  };
}

export interface PassPresentability {
  canShowCode: boolean;
  level: "ok" | "warning" | "danger";
  reasons: string[];
}

export interface PassHost {
  /** Start loading/verifying a pass. Safe to call on every render. */
  ensurePass?(payload: PassPayload): void;
  /** Host-verified payload; when present it takes precedence over model fields. */
  getPayload?(credentialId: string): PassPayload | null;
  getAttestation(credentialId: string): PassAttestation | null;
  getLatestKnown?(credentialId: string): PassLatestKnown | null;
  isOnline?(): boolean;
  now?(): number;
  subscribe?(listener: () => void): () => void;
}

const IATA_RE = /^[A-Z]{3}$/;
const FLIGHT_RE = /^[A-Z0-9]{2} ?[0-9]{1,4}$/;
const SEAT_RE = /^[0-9]{1,3}[A-Z]$/;
const MAX_TEXT = 240;
const MAX_QR_PAYLOAD = 2048;

function issue(
  list: ContractIssue[],
  path: string,
  message: string,
  code = "invalid_pass",
): void {
  if (list.length < 80) list.push({ path, message, code });
}

function text(
  value: unknown,
  path: string,
  list: ContractIssue[],
  max = MAX_TEXT,
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    issue(list, path, "required non-empty string");
    return null;
  }
  const clean = value.trim();
  if (clean.length > max) {
    issue(list, path, `string is longer than ${max} characters`);
    return clean.slice(0, max);
  }
  return clean;
}

function optionalText(
  value: unknown,
  path: string,
  list: ContractIssue[],
  max = MAX_TEXT,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, path, list, max) ?? undefined;
}

function endpoint(
  raw: unknown,
  path: string,
  list: ContractIssue[],
): PassRouteEndpoint | null {
  if (!isPlainObject(raw)) {
    issue(list, path, "route endpoint must be an object");
    return null;
  }
  const code = text(raw.code, `${path}.code`, list, 3);
  const city = text(raw.city, `${path}.city`, list);
  if (code && !IATA_RE.test(code)) issue(list, `${path}.code`, "airport code must be three uppercase letters");
  if (!code || !city) return null;
  return { code, city };
}

function instant(
  value: unknown,
  path: string,
  list: ContractIssue[],
): string | null {
  if (!isInstant(value)) {
    issue(list, path, "must be an RFC 3339 instant");
    return null;
  }
  return value;
}

function timeZone(
  value: unknown,
  path: string,
  list: ContractIssue[],
): string | null {
  if (!isValidTimeZone(value)) {
    issue(list, path, "must be an IANA time zone");
    return null;
  }
  return value;
}

function safeQrPayload(payload: string): boolean {
  if (payload.length > MAX_QR_PAYLOAD) return false;
  if (/^(?:javascript|data|vbscript):/i.test(payload)) return false;
  if (/^https?:\/\//i.test(payload)) {
    try {
      return new URL(payload).protocol === "https:";
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Validate and normalize a pass payload. Unknown fields are dropped.
 * The payload is signed by the issuer; this function does not establish trust.
 */
export function validatePassPayload(input: unknown, path = "pass"): {
  payload: PassPayload | null;
  issues: ContractIssue[];
} {
  const issues: ContractIssue[] = [];
  if (!isPlainObject(input)) {
    issue(issues, path, "pass payload must be an object");
    return { payload: null, issues };
  }

  const kind = input.kind === "boarding-pass" ? "boarding-pass" : null;
  if (!kind) issue(issues, `${path}.kind`, "kind must be boarding-pass for the P0 profile");

  const credentialId = text(input.credentialId, `${path}.credentialId`, issues, 160);
  const issuerRaw = input.issuer;
  let issuer: PassIssuer | null = null;
  if (!isPlainObject(issuerRaw)) {
    issue(issues, `${path}.issuer`, "issuer must be an object");
  } else {
    const id = text(issuerRaw.id, `${path}.issuer.id`, issues, 120);
    const name = text(issuerRaw.name, `${path}.issuer.name`, issues, 120);
    const keyId = text(issuerRaw.keyId, `${path}.issuer.keyId`, issues, 120);
    const algorithm = text(issuerRaw.algorithm, `${path}.issuer.algorithm`, issues, 40);
    if (algorithm && algorithm !== PASS_SIGNATURE_ALGORITHM) {
      issue(issues, `${path}.issuer.algorithm`, `issuer algorithm must be ${PASS_SIGNATURE_ALGORITHM}`);
    }
    if (id && name && keyId && algorithm === PASS_SIGNATURE_ALGORITHM) {
      issuer = { id, name, keyId, algorithm };
    }
  }

  const holderRaw = input.holder;
  let holder: { name: string } | null = null;
  if (!isPlainObject(holderRaw)) {
    issue(issues, `${path}.holder`, "holder must be an object");
  } else {
    const name = text(holderRaw.name, `${path}.holder.name`, issues, 160);
    if (name) holder = { name };
  }

  const bookingRef = text(input.bookingRef, `${path}.bookingRef`, issues, 80);
  const cabin = text(input.cabin, `${path}.cabin`, issues, 80);
  const flight = text(input.flight, `${path}.flight`, issues, 20);
  if (flight && !FLIGHT_RE.test(flight)) {
    issue(issues, `${path}.flight`, "flight must match carrier and number, e.g. MR 284");
  }

  const routeRaw = input.route;
  let route: PassPayload["route"] | null = null;
  if (!isPlainObject(routeRaw)) {
    issue(issues, `${path}.route`, "route must be an object");
  } else {
    const from = endpoint(routeRaw.from, `${path}.route.from`, issues);
    const to = endpoint(routeRaw.to, `${path}.route.to`, issues);
    if (from && to) route = { from, to };
  }

  const departAt = instant(input.departAt, `${path}.departAt`, issues);
  const arriveAt = instant(input.arriveAt, `${path}.arriveAt`, issues);
  const boardingAt = instant(input.boardingAt, `${path}.boardingAt`, issues);
  if (departAt && arriveAt && boardingAt) {
    const depart = Date.parse(departAt);
    const arrive = Date.parse(arriveAt);
    const boarding = Date.parse(boardingAt);
    if (!(boarding <= depart && depart < arrive)) {
      issue(issues, `${path}.boardingAt`, "times must satisfy boardingAt <= departAt < arriveAt");
    }
  }

  const departTimeZone = timeZone(input.departTimeZone, `${path}.departTimeZone`, issues);
  const arriveTimeZone = timeZone(input.arriveTimeZone, `${path}.arriveTimeZone`, issues);
  const seat = text(input.seat, `${path}.seat`, issues, 10);
  if (seat && !SEAT_RE.test(seat)) issue(issues, `${path}.seat`, "seat must match a row and letter, e.g. 14A");

  const qrRaw = input.qr;
  let qr: PassPayload["qr"] | null = null;
  if (!isPlainObject(qrRaw)) {
    issue(issues, `${path}.qr`, "qr must be an object");
  } else {
    const format = qrRaw.format;
    const payload = text(qrRaw.payload, `${path}.qr.payload`, issues, MAX_QR_PAYLOAD);
    if (format !== "qr" && format !== "iui-pass-v1" && format !== "pdf417" && format !== "aztec") {
      issue(issues, `${path}.qr.format`, "unsupported QR format");
    }
    if (payload && !safeQrPayload(payload)) {
      issue(issues, `${path}.qr.payload`, "QR payload contains an unsafe or non-https URL");
    }
    if (payload && (format === "qr" || format === "iui-pass-v1" || format === "pdf417" || format === "aztec")) {
      qr = { format, payload };
    }
  }

  const validFrom = instant(input.validFrom, `${path}.validFrom`, issues);
  const validUntil = instant(input.validUntil, `${path}.validUntil`, issues);
  if (validFrom && validUntil && Date.parse(validFrom) >= Date.parse(validUntil)) {
    issue(issues, `${path}.validUntil`, "validFrom must be earlier than validUntil");
  }

  const terminal = optionalText(input.terminal, `${path}.terminal`, issues, 20);
  const gate = optionalText(input.gate, `${path}.gate`, issues, 20);
  const boardingGroup = optionalText(input.boardingGroup, `${path}.boardingGroup`, issues, 20);

  if (
    issues.length ||
    !kind ||
    !credentialId ||
    !issuer ||
    !holder ||
    !bookingRef ||
    !cabin ||
    !flight ||
    !route ||
    !departAt ||
    !arriveAt ||
    !boardingAt ||
    !departTimeZone ||
    !arriveTimeZone ||
    !seat ||
    !qr ||
    !validFrom ||
    !validUntil
  ) {
    return { payload: null, issues };
  }

  return {
    payload: {
      kind,
      credentialId,
      issuer,
      holder,
      bookingRef,
      cabin,
      flight,
      route,
      departAt,
      arriveAt,
      boardingAt,
      departTimeZone,
      arriveTimeZone,
      ...(terminal ? { terminal } : {}),
      ...(gate ? { gate } : {}),
      seat,
      ...(boardingGroup ? { boardingGroup } : {}),
      qr,
      validFrom,
      validUntil,
    },
    issues,
  };
}

/**
 * Two orthogonal axes. A valid signature does not make a stale gate current.
 */
export function evaluatePass(
  integrity: PassIntegrity,
  freshness: PassFreshness,
  validUntil: string | undefined,
  now = Date.now(),
): PassPresentability {
  if (integrity === "revoked") {
    return {
      canShowCode: false,
      level: "danger",
      reasons: ["integrity=revoked"],
    };
  }
  if (integrity === "invalid") {
    return {
      canShowCode: false,
      level: "danger",
      reasons: ["integrity=invalid"],
    };
  }
  if (freshness === "expired" || (validUntil && Date.parse(validUntil) <= now)) {
    return {
      canShowCode: false,
      level: "danger",
      reasons: [freshness === "expired" ? "freshness=expired" : "validUntil passed"],
    };
  }

  const reasons: string[] = [];
  let level: PassPresentability["level"] = "ok";
  if (integrity === "unverified") {
    level = "warning";
    reasons.push("integrity=unverified");
  }
  if (freshness === "stale") {
    level = "warning";
    reasons.push("freshness=stale");
  } else if (freshness === "unknown") {
    level = "warning";
    reasons.push("freshness=unknown");
  }
  return { canShowCode: true, level, reasons };
}

export function freshnessForPass(
  attestation: PassAttestation | null,
  options: { now?: number; online?: boolean } = {},
): PassFreshness {
  if (!attestation) return "unknown";
  const now = options.now ?? Date.now();
  if (Date.parse(attestation.validUntil) <= now) return "expired";
  if (attestation.snapshotAt) {
    const snapshotAge = now - Date.parse(attestation.snapshotAt);
    if (Number.isFinite(snapshotAge) && snapshotAge > 24 * 60 * 60 * 1000) return "unknown";
    return "stale";
  }
  if (options.online === false) return "stale";
  if (Date.parse(attestation.staleAfter) <= now) return "stale";
  return "live";
}

export function passPayloadHash(payload: PassPayload): string {
  return canonicalJson(payload);
}

export function isPassSnapshot(value: unknown): value is PassSnapshot {
  if (!isPlainObject(value)) return false;
  if (value.schemaVersion !== "1.0") return false;
  if (typeof value.credentialId !== "string" || !value.credentialId) return false;
  if (!isPlainObject(value.payload) || !isPlainObject(value.seal)) return false;
  if (!isInstant(value.snapshotAt) || !isInstant(value.validUntil) || !isInstant(value.staleAfter)) {
    return false;
  }
  if (!isPlainObject(value.seal.credential)) return false;
  return true;
}

function base64Bytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

async function passSubtle(): Promise<SubtleCrypto> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto is unavailable");
  return subtle;
}

/**
 * Verify an issuer signature over the canonical payload JSON. This establishes
 * payload integrity, not freshness or revocation; the host must still consult
 * a live issuer response or a sealed snapshot.
 */
export async function verifyPassSignature(
  payload: PassPayload,
  signature: PassSignature,
  publicKeySpkiBase64: string,
): Promise<boolean> {
  if (signature.alg !== PASS_SIGNATURE_ALGORITHM) return false;
  if (signature.keyId !== payload.issuer.keyId) return false;
  try {
    const subtle = await passSubtle();
    const key = await subtle.importKey(
      "spki",
      base64Bytes(publicKeySpkiBase64),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await subtle.verify(
      { name: "Ed25519" },
      key,
      base64Bytes(signature.value),
      new TextEncoder().encode(canonicalJson(payload)),
    );
  } catch {
    return false;
  }
}

function metadataMaterial(snapshot: PassSnapshot, keyId: string): Uint8Array {
  return new TextEncoder().encode(
    canonicalJson({
      schemaVersion: snapshot.schemaVersion,
      credentialId: snapshot.credentialId,
      payload: snapshot.payload,
      snapshotAt: snapshot.snapshotAt,
      lastCheckedAt: snapshot.lastCheckedAt ?? null,
      validUntil: snapshot.validUntil,
      staleAfter: snapshot.staleAfter,
      integrity: snapshot.integrity ?? "verified",
      keyId,
    }),
  );
}

async function hmacKey(key: CryptoKey): Promise<CryptoKey> {
  if (key.type === "secret" && key.algorithm.name === "HMAC") return key;
  throw new Error("snapshot metadata key must be an HMAC CryptoKey");
}

/** Seal snapshot metadata with the host's non-extractable HMAC key. */
export async function createSnapshotMetadataSeal(
  snapshot: PassSnapshot,
  key: CryptoKey,
  keyId: string,
): Promise<string> {
  const subtle = await passSubtle();
  const material = metadataMaterial(snapshot, keyId) as unknown as BufferSource;
  const signature = await subtle.sign("HMAC", await hmacKey(key), material);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/** Verify snapshot metadata before trusting any snapshot field. */
export async function verifySnapshotMetadata(
  snapshot: PassSnapshot,
  key: CryptoKey,
  keyId: string,
): Promise<boolean> {
  if (!snapshot.seal.metadata || snapshot.seal.metadata.keyId !== keyId) return false;
  try {
    const subtle = await passSubtle();
    return await subtle.verify(
      "HMAC",
      await hmacKey(key),
      base64Bytes(snapshot.seal.metadata.value),
      metadataMaterial(snapshot, keyId) as unknown as BufferSource,
    );
  } catch {
    return false;
  }
}

/** Verify the credential seal (issuer signature retained inside a snapshot). */
export async function verifySnapshotCredential(
  snapshot: PassSnapshot,
  publicKeySpkiBase64: string,
): Promise<boolean> {
  if (snapshot.seal.credential.keyId !== snapshot.payload.issuer.keyId) return false;
  return verifyPassSignature(
    snapshot.payload,
    {
      alg: PASS_SIGNATURE_ALGORITHM,
      keyId: snapshot.seal.credential.keyId,
      value: snapshot.seal.credential.value,
    },
    publicKeySpkiBase64,
  );
}

/** Validate a snapshot before any trust fields are read. */
export function validatePassSnapshot(input: unknown): {
  snapshot: PassSnapshot | null;
  issues: ContractIssue[];
} {
  const issues: ContractIssue[] = [];
  if (!isPassSnapshot(input)) {
    issue(issues, "snapshot", "snapshot has an invalid shape", "invalid_snapshot");
    return { snapshot: null, issues };
  }
  if (
    input.integrity !== undefined &&
    input.integrity !== "verified" &&
    input.integrity !== "unverified" &&
    input.integrity !== "invalid" &&
    input.integrity !== "revoked"
  ) {
    issue(issues, "snapshot.integrity", "snapshot integrity is invalid", "invalid_snapshot");
  }
  if (input.lastCheckedAt !== undefined && !isInstant(input.lastCheckedAt)) {
    issue(issues, "snapshot.lastCheckedAt", "lastCheckedAt must be an RFC 3339 instant", "invalid_snapshot");
  }
  if (
    input.seal.credential.alg !== "issuer-signature" ||
    typeof input.seal.credential.value !== "string" ||
    !input.seal.credential.value
  ) {
    issue(issues, "snapshot.seal.credential", "credential seal is incomplete", "invalid_snapshot");
  }
  const checked = validatePassPayload(input.payload, "snapshot.payload");
  for (const item of checked.issues) issues.push(item);
  if (input.credentialId !== checked.payload?.credentialId) {
    issue(issues, "snapshot.credentialId", "credentialId must match payload.credentialId", "invalid_snapshot");
  }
  if (input.seal.credential.keyId !== checked.payload?.issuer.keyId) {
    issue(issues, "snapshot.seal.credential.keyId", "seal keyId must match payload issuer keyId", "invalid_snapshot");
  }
  if (input.seal.metadata && input.seal.metadata.alg !== "host-hmac-sha256") {
    issue(issues, "snapshot.seal.metadata.alg", "metadata seal must use host-hmac-sha256", "invalid_snapshot");
  }
  if (!checked.payload || issues.length) return { snapshot: null, issues };
  return {
    snapshot: {
      schemaVersion: "1.0",
      credentialId: input.credentialId,
      payload: checked.payload,
      snapshotAt: input.snapshotAt,
      ...(input.lastCheckedAt ? { lastCheckedAt: input.lastCheckedAt } : {}),
      validUntil: input.validUntil,
      staleAfter: input.staleAfter,
      ...(input.integrity ? { integrity: input.integrity } : {}),
      seal: input.seal,
    },
    issues,
  };
}
