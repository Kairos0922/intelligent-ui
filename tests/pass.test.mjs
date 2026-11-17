import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  createSnapshotMetadataSeal,
  evaluatePass,
  freshnessForPass,
  validateAnswerOps,
  validatePassPayload,
  validatePassSnapshot,
  verifyPassSignature,
  verifySnapshotCredential,
  verifySnapshotMetadata,
} from "../clone/dist-lib/agent.js";
import { generateKeyPairSync, sign } from "node:crypto";
import { spawn } from "node:child_process";
import { createDshPassHost, createPassActionRunner } from "../packages/dsh/lib/index.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function fixture(overrides = {}) {
  return {
    kind: "boarding-pass",
    credentialId: "p1",
    issuer: {
      id: "test-issuer",
      name: "Test Air",
      keyId: "test-key-1",
      algorithm: "Ed25519",
    },
    holder: { name: "Kairos" },
    bookingRef: "X7K2Q9",
    cabin: "Economy",
    flight: "MR 284",
    route: {
      from: { code: "AMS", city: "Amsterdam" },
      to: { code: "LIS", city: "Lisbon" },
    },
    departAt: "2027-06-01T09:30:00+02:00",
    arriveAt: "2027-06-01T11:45:00+01:00",
    boardingAt: "2027-06-01T08:50:00+02:00",
    departTimeZone: "Europe/Amsterdam",
    arriveTimeZone: "Europe/Lisbon",
    terminal: "1",
    gate: "D7",
    seat: "14A",
    boardingGroup: "3",
    qr: { format: "iui-pass-v1", payload: "IUI1:p1:test:D7" },
    validFrom: "2027-06-01T06:00:00+02:00",
    validUntil: "2027-06-01T17:00:00+01:00",
    ...overrides,
  };
}

function answer(pass) {
  return [
    {
      t: "answer",
      schemaVersion: "1.0",
      locale: "en-US",
      timeZone: "Europe/Amsterdam",
      slots: {
        conclusion: { kind: "op", id: "conclusion" },
        primaryArtifact: { kind: "comp", id: "c1" },
      },
      provenance: {
        authority: "claimed",
        source: { id: "test-issuer", kind: "issuer" },
        retrievedAt: "2026-11-13T00:00:00Z",
        verification: {
          sourceIdentity: "unverified",
          integrity: "unverified",
          schema: "valid",
          crossSource: "not_checked",
        },
      },
    },
    { t: "p", id: "conclusion" },
    { t: "md", v: "Your boarding pass." },
    { t: "comp", id: "c1", type: "pass", props: { pass } },
    { t: "done" },
  ];
}

test("pass payload validation keeps a well-formed signed shape", () => {
  const result = validatePassPayload(fixture());
  assert.deepEqual(result.issues, []);
  assert.equal(result.payload.seat, "14A");
  assert.equal(result.payload.gate, "D7");
});

test("pass validation rejects malformed flight, seat, route and QR URLs", () => {
  const result = validatePassPayload(
    fixture({
      flight: "not a flight",
      seat: "14",
      route: { from: { code: "AMS", city: "Amsterdam" }, to: { code: "LI", city: "Lisbon" } },
      qr: { format: "qr", payload: "javascript:alert(1)" },
    }),
  );
  assert.equal(result.payload, null);
  const codes = result.issues.map((issue) => issue.code);
  assert.ok(codes.includes("invalid_pass"));
  assert.ok(result.issues.some((issue) => issue.path.includes("flight")));
  assert.ok(result.issues.some((issue) => issue.path.includes("seat")));
  assert.ok(result.issues.some((issue) => issue.path.includes("route.to.code")));
  assert.ok(result.issues.some((issue) => issue.path.includes("qr.payload")));

  const unsafeScheme = validatePassPayload(
    fixture({ qr: { format: "qr", payload: "ftp://example.com/pass" } }),
  );
  assert.equal(unsafeScheme.payload, null);
  assert.ok(unsafeScheme.issues.some((issue) => issue.path.includes("qr.payload")));
});

test("a malformed pass op or pass set is dropped with a validation issue", () => {
  const ops = answer(fixture({ seat: "14" }));
  const result = validateAnswerOps(ops);
  assert.ok(result.issues.some((issue) => issue.code === "invalid_pass"));
  assert.equal(result.ops.some((op) => op.t === "comp" && op.type === "pass"), false);

  const patched = answer(fixture());
  patched.splice(patched.length - 1, 0, {
    t: "set",
    id: "c1",
    path: "pass",
    v: fixture({ seat: "14" }),
  });
  const badSet = validateAnswerOps(patched);
  assert.ok(badSet.issues.some((issue) => issue.code === "invalid_pass"));
  assert.equal(badSet.ops.some((op) => op.t === "set"), false);

  const goodPatch = answer(fixture());
  goodPatch.splice(goodPatch.length - 1, 0, {
    t: "set",
    id: "c1",
    path: "pass",
    v: fixture({ gate: "D2" }),
  });
  const goodSet = validateAnswerOps(goodPatch);
  assert.equal(goodSet.issues.some((issue) => issue.code === "invalid_pass"), false);
  assert.equal(goodSet.ops.find((op) => op.t === "set")?.v?.gate, "D2");
});

test("two axes decide presentation, not the model's status", () => {
  assert.equal(evaluatePass("verified", "live", "2027-06-01T00:00:00Z").canShowCode, true);
  assert.equal(evaluatePass("verified", "stale", "2027-06-01T00:00:00Z").level, "warning");
  assert.equal(evaluatePass("verified", "expired", "2027-06-01T00:00:00Z").canShowCode, false);
  assert.equal(evaluatePass("revoked", "live", "2027-06-01T00:00:00Z").canShowCode, false);
  assert.equal(evaluatePass("invalid", "live", "2027-06-01T00:00:00Z").canShowCode, false);
  assert.equal(evaluatePass("unverified", "live", "2027-06-01T00:00:00Z").level, "warning");
});

test("snapshot staleness and the 24h TTL are host-derived", () => {
  const attestation = {
    credentialId: "p1",
    integrity: "verified",
    observedAt: "2026-11-13T00:00:00Z",
    checkedAt: "2026-11-13T00:00:00Z",
    validUntil: "2027-06-01T00:00:00Z",
    staleAfter: "2026-11-13T01:00:00Z",
    source: { id: "test-issuer", kind: "issuer" },
  };
  assert.equal(freshnessForPass(attestation, { now: Date.parse("2026-11-13T00:30:00Z") }), "live");
  assert.equal(
    freshnessForPass(attestation, { now: Date.parse("2026-11-13T00:30:00Z"), online: false }),
    "unknown",
    "offline without a snapshot is unknown, not a saved snapshot",
  );
  assert.equal(
    freshnessForPass({ ...attestation, snapshotAt: "2026-11-13T00:00:00Z" }, { now: Date.parse("2026-11-13T00:30:00Z") }),
    "stale",
  );
  assert.equal(
    freshnessForPass({ ...attestation, snapshotAt: "2026-11-13T00:00:00Z" }, { now: Date.parse("2026-11-14T01:00:00Z") }),
    "unknown",
  );
});

test("Ed25519 issuer signature and host HMAC snapshot seal detect tampering", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const payload = validatePassPayload(fixture()).payload;
  const signature = sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64");
  const signed = { alg: "Ed25519", keyId: payload.issuer.keyId, value: signature };

  assert.equal(await verifyPassSignature(payload, signed, spki), true);
  assert.equal(
    await verifyPassSignature(
      { ...payload, gate: "D2" },
      signed,
      spki,
    ),
    false,
  );

  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const snapshot = {
    schemaVersion: "1.0",
    credentialId: payload.credentialId,
    payload,
    snapshotAt: "2026-11-13T00:00:00Z",
    lastCheckedAt: "2026-11-13T00:00:00Z",
    validUntil: payload.validUntil,
    staleAfter: "2026-11-13T01:00:00Z",
    integrity: "verified",
    seal: {
      credential: { alg: "issuer-signature", keyId: payload.issuer.keyId, value: signature },
    },
  };
  const metadata = await createSnapshotMetadataSeal(snapshot, key, "host-key-1");
  snapshot.seal.metadata = { alg: "host-hmac-sha256", keyId: "host-key-1", value: metadata };

  assert.equal(validatePassSnapshot(snapshot).snapshot?.credentialId, "p1");
  assert.equal(await verifySnapshotMetadata(snapshot, key, "host-key-1"), true);
  assert.equal(await verifySnapshotCredential(snapshot, spki), true);
  assert.equal(
    await verifySnapshotMetadata(
      { ...snapshot, staleAfter: "2026-11-13T02:00:00Z" },
      key,
      "host-key-1",
    ),
    false,
  );
  assert.equal(
    await verifySnapshotCredential(
      { ...snapshot, payload: { ...payload, gate: "D2" } },
      spki,
    ),
    false,
  );
});

test("test issuer serves a verifiable feed and keeps its private key in-process", async (t) => {
  const port = 43219;
  const server = spawn(process.execPath, [join(root, "tools/test-issuer/server.mjs"), "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => server.kill("SIGTERM"));
  const ready = new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`test issuer did not start: ${output}`)), 5_000);
    server.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("IUI test issuer:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once("error", reject);
    server.once("exit", (code) => {
      if (code !== null && code !== 0) reject(new Error(`test issuer exited ${code}`));
    });
  });
  await ready;

  const config = await (await fetch(`http://127.0.0.1:${port}/config`)).json();
  assert.equal(config.issuer.algorithm, "Ed25519");
  const feed = await (await fetch(`http://127.0.0.1:${port}/pass?credentialId=p1`)).json();
  assert.equal(feed.status, "live");
  assert.equal(
    await verifyPassSignature(feed.payload, feed.signature, config.publicKey),
    true,
  );

  await fetch(`http://127.0.0.1:${port}/scenario?value=revoked`);
  const revoked = await (await fetch(`http://127.0.0.1:${port}/pass?credentialId=p1`)).json();
  assert.equal(revoked.status, "revoked");
  assert.equal(await verifyPassSignature(revoked.payload, revoked.signature, config.publicKey), true);

  await fetch(`http://127.0.0.1:${port}/scenario?value=invalid`);
  const invalid = await (await fetch(`http://127.0.0.1:${port}/pass?credentialId=p1`)).json();
  assert.equal(await verifyPassSignature(invalid.payload, invalid.signature, config.publicKey), false);
});

test("DSH pass host verifies live, gate-change, revoked, and invalid feeds", async (t) => {
  const port = 43220;
  const server = spawn(process.execPath, [join(root, "tools/test-issuer/server.mjs"), "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => server.kill("SIGTERM"));
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`test issuer did not start: ${output}`)), 5_000);
    server.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("IUI test issuer:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once("error", reject);
  });

  const feed = await (await fetch(`http://127.0.0.1:${port}/pass?credentialId=p1`)).json();
  const host = createDshPassHost({
    issuerUrl: `http://127.0.0.1:${port}`,
    now: () => Date.parse("2026-11-13T10:00:00Z"),
    online: () => true,
    timeoutMs: 150,
  });
  t.after(() => host.dispose());
  host.ensurePass(feed.payload);

  const waitFor = async (predicate, message) => {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const value = predicate();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(message);
  };

  const verified = await waitFor(
    () => (host.getAttestation("p1")?.integrity === "verified" ? host.getAttestation("p1") : null),
    "pass host did not verify the feed",
  );
  assert.equal(verified.credentialId, "p1");
  assert.equal(host.getPayload("p1")?.gate, "D7");
  assert.ok(
    Date.parse(verified.staleAfter) <= Date.parse("2026-11-14T10:00:00Z"),
    "issuer staleAfter must not extend the 24h snapshot TTL",
  );

  await fetch(`http://127.0.0.1:${port}/scenario?value=gate-change`);
  assert.equal((await host.refresh("p1")).status, "succeeded");
  assert.equal(host.getAttestation("p1")?.integrity, "verified");
  assert.equal(host.getPayload("p1")?.gate, "D2");
  assert.equal(host.getLatestKnown("p1")?.gate, "D2");

  await fetch(`http://127.0.0.1:${port}/scenario?value=revoked`);
  assert.equal((await host.refresh("p1")).status, "succeeded");
  assert.equal(host.getAttestation("p1")?.integrity, "revoked");

  await fetch(`http://127.0.0.1:${port}/scenario?value=invalid`);
  assert.equal((await host.refresh("p1")).status, "succeeded");
  assert.equal(host.getAttestation("p1")?.integrity, "invalid");

  await fetch(`http://127.0.0.1:${port}/scenario?value=slow`);
  assert.equal((await host.refresh("p1")).status, "timeout");
});

test("pass host enforces an exact https origin allowlist for QR and issuer links", () => {
  const host = createDshPassHost({
    issuerUrl: "https://issuer.example/api",
    allowedOrigins: ["https://issuer.example", "https://partner.example/path"],
  });
  assert.equal(host.isQrPayloadAllowed("IUI1:p1:test:D7"), true);
  assert.equal(host.isQrPayloadAllowed("opaque-token"), true);
  assert.equal(host.isQrPayloadAllowed("   "), false);
  assert.equal(host.isQrPayloadAllowed("https://issuer.example/pass/p1"), true);
  assert.equal(host.isQrPayloadAllowed("https://partner.example/pass/p1"), true);
  assert.equal(host.isQrPayloadAllowed("https://issuer.example.evil/pass/p1"), false);
  assert.equal(host.isQrPayloadAllowed("https://other.example/pass/p1"), false);
  assert.equal(host.isQrPayloadAllowed("http://issuer.example/pass/p1"), false);
  assert.equal(host.isQrPayloadAllowed("//issuer.example/pass/p1"), false);
  assert.equal(host.isQrPayloadAllowed("javascript:alert(1)"), false);
  assert.equal(host.isIssuerLinkAllowed("https://issuer.example/help"), true);
  assert.equal(host.isIssuerLinkAllowed("https://other.example/help"), false);
  host.dispose();

  const bare = createDshPassHost({ online: () => false });
  assert.equal(bare.isQrPayloadAllowed("https://issuer.example/pass"), false);
  assert.equal(bare.isQrPayloadAllowed("IUI1:p1:test:D7"), true);
  assert.equal(bare.isIssuerLinkAllowed("https://issuer.example/help"), false);
  bare.dispose();
});

test("clear suppresses an in-flight refresh result", async (t) => {
  const port = 43222;
  const server = spawn(process.execPath, [join(root, "tools/test-issuer/server.mjs"), "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => server.kill("SIGTERM"));
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`test issuer did not start: ${output}`)), 5_000);
    server.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("IUI test issuer:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once("error", reject);
  });

  const feed = await (await fetch(`http://127.0.0.1:${port}/pass?credentialId=p1`)).json();
  await fetch(`http://127.0.0.1:${port}/scenario?value=slow`);
  const host = createDshPassHost({
    issuerUrl: `http://127.0.0.1:${port}`,
    now: () => Date.parse("2026-11-13T10:00:00Z"),
    online: () => true,
    timeoutMs: 120,
  });
  t.after(() => host.dispose());
  let staleNotification = false;
  host.subscribe(() => {
    if (host.getAttestation("p1")) staleNotification = true;
  });
  host.ensurePass(feed.payload);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const refresh = host.refresh("p1");
  await new Promise((resolve) => setTimeout(resolve, 20));
  await host.clear();
  const result = await refresh;
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "cleared");
  assert.equal(staleNotification, false, "cleared refresh wrote an attestation back");
  assert.equal(host.getAttestation("p1"), null);
  assert.equal(host.getPayload("p1"), null);
});

test("clear during issuer verification reports cleared, not success", async (t) => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const payload = validatePassPayload(fixture()).payload;
  assert.ok(payload);
  const signature = sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64");
  const feed = {
    status: "live",
    observedAt: "2026-11-13T10:00:00Z",
    payload,
    signature: { alg: "Ed25519", keyId: payload.issuer.keyId, value: signature },
  };

  let releaseConfig;
  const configGate = new Promise((resolve) => {
    releaseConfig = resolve;
  });
  let markConfigRequested;
  const configRequested = new Promise((resolve) => {
    markConfigRequested = resolve;
  });
  const jsonResponse = (value) => ({
    ok: true,
    status: 200,
    async json() {
      return value;
    },
  });
  const host = createDshPassHost({
    issuerUrl: "https://issuer.example",
    online: () => true,
    timeoutMs: 1_000,
    fetcher: async (input) => {
      const url = String(input);
      if (url.includes("/pass?")) return jsonResponse(feed);
      if (url.endsWith("/config")) {
        markConfigRequested();
        return jsonResponse(await configGate);
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  });
  t.after(() => host.dispose());

  host.ensurePass(payload);
  const resultPromise = host.refresh("p1");
  await configRequested;
  const clearing = host.clear();
  releaseConfig({ issuer: payload.issuer, publicKey: spki });
  const result = await resultPromise;
  await clearing;

  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "cleared");
  assert.equal(host.getPayload("p1"), null);
  assert.equal(host.getAttestation("p1"), null);
});

test("refresh timeout goes unknown -> reconciliation without automatic retry", async () => {
  let refreshes = 0;
  const runner = createPassActionRunner({
    host: {
      async refresh() {
        refreshes += 1;
        return { status: "timeout", reason: "timeout" };
      },
    },
    userId: "u1",
    tenantId: "t1",
    now: () => new Date("2026-11-13T10:00:00Z"),
  });
  const run = await runner.refresh({
    credentialId: "p1",
    answerId: "a1",
    action: "refresh",
  });
  assert.equal(refreshes, 1, "timed-out refresh was retried automatically");
  assert.equal(run.state.state, "failed");
  assert.deepEqual(
    run.events.map((event) => event.type),
    ["authorize", "start", "timeout", "reconcile_start", "reconcile_failure"],
  );
  assert.equal(run.state.reconciliation?.outcome, "failed");
  assert.ok(run.state.reconciliation?.evidence?.includes("issuer refresh timed out"));
});

test("successful refresh records a receipt and no reconciliation", async () => {
  const runner = createPassActionRunner({
    host: {
      async refresh() {
        return {
          status: "succeeded",
          attestation: {
            credentialId: "p1",
            integrity: "verified",
            observedAt: "2026-11-13T10:00:00Z",
            checkedAt: "2026-11-13T10:00:00Z",
            validUntil: "2027-06-01T00:00:00Z",
            staleAfter: "2026-11-13T11:00:00Z",
            source: { id: "test-issuer", kind: "issuer" },
            snapshotAt: "2026-11-13T10:00:00Z",
          },
        };
      },
    },
    userId: "u1",
    tenantId: "t1",
    now: () => new Date("2026-11-13T10:00:00Z"),
  });
  const run = await runner.refresh({
    credentialId: "p1",
    answerId: "a1",
    action: "request_verification",
  });
  assert.equal(run.state.state, "succeeded");
  assert.equal(run.state.receipt?.payload?.status, "succeeded");
  assert.equal(run.state.reconciliation, undefined);
});
