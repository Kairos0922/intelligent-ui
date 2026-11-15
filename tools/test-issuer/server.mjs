#!/usr/bin/env node
/**
 * Stage 1b test issuer.
 *
 * This is an independent process: the Ed25519 private key is generated here
 * and never sent to the browser. The page only receives the public key, a
 * signed payload, and the feed status. It is a test issuer, not a real airline
 * or wallet issuer.
 *
 * Usage:
 *   node tools/test-issuer/server.mjs
 *   node tools/test-issuer/server.mjs --port 4319 --scenario gate-change
 *
 * Scenario can be changed at runtime:
 *   curl 'http://127.0.0.1:4319/scenario?value=revoked'
 * Supported values: normal, gate-change, revoked, invalid, slow.
 */
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createServer } from "node:http";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const port = Number(arg("port", process.env.IUI_TEST_ISSUER_PORT ?? "4319"));
const host = arg("host", process.env.IUI_TEST_ISSUER_HOST ?? "127.0.0.1");
let scenario = arg("scenario", process.env.IUI_TEST_ISSUER_SCENARIO ?? "normal");
const configuredDelay = Number(arg("delay", process.env.IUI_TEST_ISSUER_DELAY ?? "0"));

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeySpki = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const keyId = `test-${createHash("sha256").update(publicKeySpki).digest("hex").slice(0, 16)}`;
const issuer = {
  id: "test-issuer",
  name: "Test Air",
  keyId,
  algorithm: "Ed25519",
};

/** Must match core canonicalJson: sorted keys, no undefined, JSON scalars. */
function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`unsupported value: ${typeof value}`);
}

function iso(date) {
  return date.toISOString();
}

function makePayload(credentialId, variant) {
  const now = Date.now();
  const depart = new Date(now + 22 * 60 * 60 * 1000);
  depart.setUTCMinutes(30, 0, 0);
  const arrive = new Date(depart.getTime() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000);
  const boarding = new Date(depart.getTime() - 40 * 60 * 1000);
  const validFrom = new Date(now - 60 * 60 * 1000);
  const validUntil = new Date(depart.getTime() + 6 * 60 * 60 * 1000);
  const gate = variant === "gate-change" ? "D2" : "D7";
  return {
    kind: "boarding-pass",
    credentialId,
    issuer,
    holder: { name: "Kairos" },
    bookingRef: "X7K2Q9",
    cabin: "Economy",
    flight: "MR 284",
    route: {
      from: { code: "AMS", city: "Amsterdam" },
      to: { code: "LIS", city: "Lisbon" },
    },
    departAt: iso(depart),
    arriveAt: iso(arrive),
    boardingAt: iso(boarding),
    departTimeZone: "Europe/Amsterdam",
    arriveTimeZone: "Europe/Lisbon",
    terminal: "1",
    gate,
    seat: "14A",
    boardingGroup: "3",
    qr: {
      format: "iui-pass-v1",
      payload: `IUI1:${credentialId}:${keyId.slice(0, 8)}:${gate}`,
    },
    validFrom: iso(validFrom),
    validUntil: iso(validUntil),
  };
}

function signedFeed(credentialId, variant) {
  const payload = makePayload(credentialId, variant);
  const signature = sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64");
  const badSignature =
    variant === "invalid"
      ? Buffer.from(signature, "base64").map((byte, index) => (index === 0 ? byte ^ 0xff : byte))
      : null;
  return {
    payload,
    signature: {
      alg: "Ed25519",
      keyId,
      value: badSignature ? Buffer.from(badSignature).toString("base64") : signature,
    },
    status: variant === "revoked" ? "revoked" : "live",
    observedAt: new Date().toISOString(),
    staleAfter: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    source: {
      id: issuer.id,
      url: `http://${host}:${port}/issuer`,
    },
  };
}

function sendJson(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-length": Buffer.byteLength(text),
  });
  response.end(text);
}

const server = createServer((request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    response.end();
    return;
  }
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
  if (url.pathname === "/health") {
    sendJson(response, 200, { ok: true, issuer, scenario });
    return;
  }
  if (url.pathname === "/config") {
    sendJson(response, 200, {
      issuer,
      publicKey: publicKeySpki,
      scenarios: ["normal", "gate-change", "revoked", "invalid", "slow"],
    });
    return;
  }
  if (url.pathname === "/scenario") {
    const value = url.searchParams.get("value");
    if (value) {
      if (!["normal", "gate-change", "revoked", "invalid", "slow"].includes(value)) {
        sendJson(response, 400, { error: "unsupported_scenario" });
        return;
      }
      scenario = value;
    }
    sendJson(response, 200, { scenario });
    return;
  }
  if (url.pathname === "/issuer") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "access-control-allow-origin": "*",
    });
    response.end("<!doctype html><title>Test issuer</title><p>Stage 1b test issuer.</p>");
    return;
  }
  if (url.pathname !== "/pass") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  const credentialId = url.searchParams.get("credentialId") ?? "p1";
  if (credentialId.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(credentialId)) {
    sendJson(response, 400, { error: "invalid_credential_id" });
    return;
  }
  const variant = url.searchParams.get("scenario") ?? scenario;
  if (!["normal", "gate-change", "revoked", "invalid", "slow"].includes(variant)) {
    sendJson(response, 400, { error: "unsupported_scenario" });
    return;
  }
  const delay = variant === "slow"
    ? Number(url.searchParams.get("delay") ?? Math.max(configuredDelay, 12_000))
    : Number(url.searchParams.get("delay") ?? configuredDelay);
  const reply = () => {
    sendJson(response, 200, signedFeed(credentialId, variant));
  };
  if (delay > 0) setTimeout(reply, Math.min(delay, 60_000));
  else reply();
});

server.listen(port, host, () => {
  const base = `http://${host}:${port}`;
  process.stdout.write(
    [
      `IUI test issuer: ${base}`,
      `keyId: ${keyId}`,
      `scenario: ${scenario}`,
      `Set window.__IUI_PASS_ISSUER__ = { url: "${base}" } before the DSH client loads.`,
      "",
    ].join("\n"),
  );
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
