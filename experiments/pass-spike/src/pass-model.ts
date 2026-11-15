/**
 * Host-side model for the P0-1 experiment.
 *
 * This file deliberately lives outside the SDK. It models the two things the
 * plan says the protocol lacks: a trust/attestation record and a freshness
 * record. The block only reads them through a host-owned store; it never trusts
 * the same-named fields that arrive in model-generated props.
 */

export type Integrity = "verified" | "unverified" | "invalid" | "revoked";
export type Freshness = "live" | "stale" | "expired" | "unknown";

export interface PassRoute {
  from: { code: string; city: string };
  to: { code: string; city: string };
}

export interface PassData {
  kind: "boarding-pass";
  credentialId: string;
  issuer: { id: string; name: string; keyId: string; algorithm: string };
  holder: { name: string };
  bookingRef: string;
  cabin: string;
  flight: string;
  route: PassRoute;
  departAt: string;
  arriveAt: string;
  boardingAt: string;
  departTimeZone: string;
  arriveTimeZone: string;
  terminal: string;
  gate: string;
  seat: string;
  boardingGroup: string;
  qr: { format: "qr"; payload: string };
  validFrom: string;
  validUntil: string;
}

export interface Attestation {
  credentialId: string;
  integrity: Integrity;
  observedAt: string;
  checkedAt: string;
  validUntil: string;
  staleAfter: string;
  source: { id: string; kind: string; url?: string };
  /** set when this record came from an offline snapshot */
  snapshotAt?: string;
}

export interface Presentability {
  canShowCode: boolean;
  level: "ok" | "warning" | "danger";
  headline: string;
  detail: string;
  reasons: string[];
}

export interface Snapshot {
  schemaVersion: 1;
  savedAt: string;
  pass: PassData;
  attestation: Attestation;
}

export const SNAPSHOT_KEY = "iui.pass-spike.snapshot.v1";
export const LATEST_KNOWN_KEY = "iui.pass-spike.latest-known.v1";

/**
 * Two orthogonal axes, as proposed in the plan's P0-3.
 *
 * The important case is verified integrity + stale freshness: the pass is real,
 * but the gate may have changed. No single flat enum can express it.
 */
export function evaluate(
  integrity: Integrity,
  freshness: Freshness,
  now = Date.now(),
  validUntil?: string,
): Presentability {
  const reasons: string[] = [];
  let level: Presentability["level"] = "ok";
  let headline = "Ready to present";
  let detail = "Signature checked and the latest issuer update is live.";
  let canShowCode = true;

  if (integrity === "revoked") {
    return {
      canShowCode: false,
      level: "danger",
      headline: "Pass revoked",
      detail: "The issuer revoked this credential. Do not present this code.",
      reasons: ["integrity=revoked"],
    };
  }
  if (integrity === "invalid") {
    return {
      canShowCode: false,
      level: "danger",
      headline: "Signature invalid",
      detail: "This pass failed the issuer signature check. Do not present this code.",
      reasons: ["integrity=invalid"],
    };
  }
  if (freshness === "expired") {
    return {
      canShowCode: false,
      level: "danger",
      headline: "Pass expired",
      detail: "The credential is outside its validity window. Get a new pass from the issuer.",
      reasons: ["freshness=expired"],
    };
  }
  if (validUntil && Date.parse(validUntil) <= now) {
    return {
      canShowCode: false,
      level: "danger",
      headline: "Pass expired",
      detail: "The credential is outside its validity window. Get a new pass from the issuer.",
      reasons: ["validUntil passed"],
    };
  }

  if (integrity === "unverified") {
    level = "warning";
    headline = "Issuer not verified";
    detail = "The code can be shown, but the issuer signature has not been checked.";
    reasons.push("integrity=unverified");
  }
  if (freshness === "stale") {
    level = "warning";
    headline = "Shown from a saved copy";
    detail = "This pass is valid but not live. Check the gate before you rely on it.";
    reasons.push("freshness=stale");
  } else if (freshness === "unknown") {
    level = "warning";
    headline = "Live status unknown";
    detail = "The issuer could not be reached. The code is still shown, but the gate may have changed.";
    reasons.push("freshness=unknown");
  }

  return { canShowCode, level, headline, detail, reasons };
}

export function freshnessFor(
  attestation: Attestation | null,
  now = Date.now(),
  online = true,
): Freshness {
  if (!attestation) return "unknown";
  if (Date.parse(attestation.validUntil) <= now) return "expired";
  if (!online) return "stale";
  if (Date.parse(attestation.staleAfter) <= now) return "stale";
  return "live";
}

export function saveSnapshot(pass: PassData, attestation: Attestation, now = new Date()): Snapshot {
  const snapshot: Snapshot = {
    schemaVersion: 1,
    savedAt: now.toISOString(),
    pass,
    attestation,
  };
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function loadSnapshot(): Snapshot | null {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Snapshot;
    if (parsed.schemaVersion !== 1 || !parsed.pass?.credentialId || !parsed.attestation) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSnapshot(): void {
  localStorage.removeItem(SNAPSHOT_KEY);
  localStorage.removeItem(LATEST_KNOWN_KEY);
}

export function rememberLatestKnown(pass: PassData, attestation: Attestation): void {
  localStorage.setItem(
    LATEST_KNOWN_KEY,
    JSON.stringify({
      savedAt: new Date().toISOString(),
      gate: pass.gate,
      integrity: attestation.integrity,
      observedAt: attestation.observedAt,
    }),
  );
}

export function loadLatestKnown(): { gate: string; integrity: Integrity; observedAt: string } | null {
  const raw = localStorage.getItem(LATEST_KNOWN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { gate: string; integrity: Integrity; observedAt: string };
  } catch {
    return null;
  }
}

/** QR payload. A real issuer would sign this; the demo is not a credential. */
export function qrPayload(pass: PassData): string {
  return [
    "IUI1",
    pass.flight.replace(/\s+/g, ""),
    `${pass.route.from.code}-${pass.route.to.code}`,
    pass.departAt,
    pass.seat,
    pass.bookingRef,
    pass.credentialId,
  ].join(":");
}

export function formatInZone(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

export function formatDay(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(iso));
}

export function relativeTime(iso: string, locale: string, now = Date.now()): string {
  const diff = Math.round((Date.parse(iso) - now) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diff) < 60) return rtf.format(diff, "minute");
  const hours = Math.round(diff / 60);
  if (Math.abs(hours) < 36) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}
