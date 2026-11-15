import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

let issuer: ChildProcess | null = null;
const port = 43221;
const base = `http://127.0.0.1:${port}`;

test.beforeAll(async () => {
  issuer = spawn(process.execPath, [join(process.cwd(), "tools/test-issuer/server.mjs"), "--port", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`test issuer did not start: ${output}`)), 8_000);
    issuer?.stdout?.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("IUI test issuer:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    issuer?.once("error", reject);
    issuer?.once("exit", (code) => {
      if (code !== null && code !== 0) reject(new Error(`test issuer exited ${code}`));
    });
  });
});

test.afterAll(() => {
  issuer?.kill("SIGTERM");
});

test("DSH pass host verifies, seals, restores, and revokes in a browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/pass-host-selftest.html");
  await page.waitForFunction(() => !!(window as any).__passTest);

  const feed = await (await fetch(`${base}/pass?credentialId=p1`)).json();
  const started = await page.evaluate(
    async ({ url, payload }) => (window as any).__passTest.start(url, payload),
    { url: base, payload: feed.payload },
  );
  expect(started.attestation.integrity).toBe("verified");
  expect(started.gate).toBe("D7");
  expect(started.freshness).toBe("live");
  expect(started.attestation.snapshotAt).toBeUndefined();

  const restored = await page.evaluate(
    async ({ url, payload }) => (window as any).__passTest.offline(url, payload),
    { url: base, payload: feed.payload },
  );
  expect(restored.attestation.integrity).toBe("verified");
  expect(restored.attestation.snapshotAt).toBeTruthy();
  expect(restored.freshness).toBe("stale");
  expect(restored.gate).toBe("D7");

  // A slow issuer must time out and fall back to the sealed snapshot. This
  // exercises the refresh path without waiting for the issuer's 12s delay.
  await fetch(`${base}/scenario?value=slow`);
  const timedOut = await page.evaluate(async () => (window as any).__passTest.refresh());
  expect(timedOut.attestation.integrity).toBe("verified");
  expect(timedOut.attestation.snapshotAt).toBeTruthy();
  expect(timedOut.freshness).toBe("stale");
  expect(timedOut.gate).toBe("D7");

  await fetch(`${base}/scenario?value=gate-change`);
  const changed = await page.evaluate(async () => (window as any).__passTest.refresh());
  expect(changed.attestation.integrity).toBe("verified");
  expect(changed.gate).toBe("D2");

  await fetch(`${base}/scenario?value=revoked`);
  const revoked = await page.evaluate(async () => (window as any).__passTest.refresh());
  expect(revoked.attestation.integrity).toBe("revoked");

  const revokedOffline = await page.evaluate(
    async ({ url, payload }) => (window as any).__passTest.offline(url, payload),
    { url: base, payload: feed.payload },
  );
  expect(revokedOffline.attestation.integrity).toBe("revoked");
  expect(revokedOffline.freshness).toBe("stale");

  await fetch(`${base}/scenario?value=invalid`);
  const invalid = await page.evaluate(async () => (window as any).__passTest.refresh());
  expect(invalid.attestation.integrity).toBe("invalid");

  await page.evaluate(async () => (window as any).__passTest.clear());
  expect(errors).toEqual([]);
});
