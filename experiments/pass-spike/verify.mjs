/**
 * Reproducible verification for the P0-1 pass spike.
 *
 * It drives the built app through the same public paths a user would use,
 * including a real QR decode (jsQR), an offline reload, snapshot tampering,
 * revocation and a model-claimed "verified" artifact.
 *
 * Run: node verify.mjs
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const dist = join(root, "dist");
const evidenceDir = join(root, "evidence");
const PORT = 4180;
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

const startedAt = new Date().toISOString();
const checks = [];
const findings = [];
const consoleErrors = [];

setTimeout(() => {
  console.error("watchdog: verification exceeded 120s");
  process.exit(2);
}, 120_000).unref();

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", BASE);
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const body = await readFile(join(dist, file));
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((resolveReady) => server.listen(PORT, "127.0.0.1", resolveReady));

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome" });
  } catch {
    browser = await chromium.launch();
  }
  const context = await browser.newContext({
    viewport: { width: 456, height: 920 },
    deviceScaleFactor: 2,
    locale: "en-US",
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  const state = () => page.evaluate(() => window.__passSpike.state());
  const text = async (selector) => (await page.locator(selector).first().textContent())?.trim() ?? "";
  const waitForText = (selector, expected) =>
    page.waitForFunction(
      ([sel, want]) => (document.querySelector(sel)?.textContent ?? "").includes(want),
      [selector, expected],
    );
  const waitForGate = (gate) => waitForText('[data-testid="pass-gate"] dd', gate);

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="pass-status"]');
  await waitForGate("D7");

  // 1. Open: conclusion + artifact + one primary action -----------------------
  check("initial gate is D7", (await text('[data-testid="pass-gate"] dd')) === "D7");
  check("initial integrity is verified", (await text('[data-testid="pass-integrity"]')) === "Verified");
  check("initial freshness is live", (await text('[data-testid="pass-freshness"]')) === "Live");
  check(
    "primary action is enabled",
    await page.locator('[data-testid="pass-show-code"]').isEnabled(),
  );
  check(
    "conclusion names the gate",
    (await text("#answer .iui-prose")).includes("Gate D7"),
  );
  const initial = await state();
  check("host attestation exists", initial.attestation?.integrity === "verified");
  check("capabilities are host-supplied", initial.capabilities?.canOpenWallet === true);
  await page.screenshot({ path: join(evidenceDir, "01-online.png"), fullPage: true });

  // 2. Present: the QR must actually decode --------------------------------
  await page.locator('[data-testid="pass-show-code"]').click();
  await page.waitForSelector("dialog[open]");
  const qr = await page.evaluate(() => window.__passSpike.verifyQr());
  const expectedPayload = await page.evaluate(() => window.__passSpike.qrPayload());
  check("QR decodes to the pass payload", qr.text === expectedPayload, `${qr.text ?? "null"}`);
  check("QR has a real module grid", qr.modules >= 21, `${qr.modules} modules`);
  check("QR dialog is modal", await page.locator("dialog[open]").evaluate((d) => d.matches(":modal")));
  check(
    "QR dialog has a visible close control",
    await page.locator('dialog[open] [aria-label="Close code"]').isVisible(),
  );
  await page.screenshot({ path: join(evidenceDir, "02-qr.png"), fullPage: true });
  await page.locator("dialog[open] .pass-spike-button--primary").click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));

  // 3. Save a snapshot at D7, learn about D2 online, then go offline --------
  await page.locator("#save").click();
  const saved = await state();
  check("snapshot stores gate D7", saved.snapshot?.pass.gate === "D7");

  await page.locator("#scenario").selectOption("gate-change");
  await waitForGate("D2");
  await page.waitForFunction(
    () => document.querySelector('[data-testid="pass-freshness"]')?.textContent === "Live",
  );
  const afterChange = await state();
  check("online pass follows the gate change", afterChange.pass?.gate === "D2");
  check("snapshot is still the old D7", afterChange.snapshot?.pass.gate === "D7");
  check("latest known gate is D2", afterChange.latestKnown?.gate === "D2");
  await page.screenshot({ path: join(evidenceDir, "03-gate-change-online.png"), fullPage: true });

  await page.locator("#offline").check();
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.locator("#reload").click(),
  ]);
  await page.waitForSelector('[data-testid="pass-status"]');
  await waitForGate("D7");

  const offline = await state();
  check("offline boot restores the snapshot", offline.snapshotMode === true);
  check("offline mode is visible", (await text('[data-testid="pass-offline"]')) === "Offline");
  check("cached integrity is still verified", (await text('[data-testid="pass-integrity"]')) === "Verified");
  check("cached freshness is saved copy", (await text('[data-testid="pass-freshness"]')) === "Saved copy");
  check(
    "offline shows the gate conflict",
    (await text('[data-testid="pass-gate-conflict"]')).includes("D2"),
  );
  check(
    "offline code is still available with a warning",
    await page.locator('[data-testid="pass-show-code"]').isEnabled(),
  );
  check(
    "verdict warns that the gate may have changed",
    (await text('[data-testid="pass-verdict"]')).includes("gate may have changed"),
  );
  const offlineProse = await text("#answer .iui-prose");
  findings.push({
    id: "F1",
    title: "Conclusion text and cached artifact can disagree",
    detail: `Offline answer prose still says D7 while the answer also shows "D2" as the last known gate. Prose is a separate op with no structured slot or freshness binding.`,
    evidence: offlineProse.replace(/\s+/g, " ").slice(0, 180),
  });
  check(
    "offline conclusion still says D7 (finding F1)",
    offlineProse.includes("Gate D7"),
  );
  await page.screenshot({ path: join(evidenceDir, "04-offline-stale.png"), fullPage: true });

  const offlineQr = await (async () => {
    await page.locator('[data-testid="pass-show-code"]').click();
    await page.waitForSelector("dialog[open]");
    const warning = await page.locator("dialog[open] .pass-spike-dialog-warning").count();
    const result = await page.evaluate(() => window.__passSpike.verifyQr());
    await page.screenshot({ path: join(evidenceDir, "05-offline-qr.png"), fullPage: true });
    await page.locator("dialog[open] .pass-spike-button--primary").click();
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    return { ...result, warning };
  })();
  check("offline QR still decodes", offlineQr.text === expectedPayload);
  check("offline QR shows a warning", offlineQr.warning === 1);

  // 4. Tamper with the snapshot: localStorage has no integrity check --------
  await page.evaluate(() => window.__passSpike.tamper());
  await waitForGate("D9");
  const tampered = await state();
  check("tampered snapshot changes the gate", tampered.pass?.gate === "D9");
  const tamperIntegrity = await text('[data-testid="pass-integrity"]');
  const tamperFreshness = await text('[data-testid="pass-freshness"]');
  check("tamper is not detected", tamperIntegrity === "Verified" && tamperFreshness === "Saved copy");
  findings.push({
    id: "F2",
    title: "Local snapshot tampering is undetectable",
    detail:
      "Changing the gate in localStorage leaves integrity=Verified and freshness=Saved copy. Offline snapshot integrity needs a signature or host-sealed digest; the SDK has neither.",
  });
  await page.screenshot({ path: join(evidenceDir, "06-tampered.png"), fullPage: true });

  // 5. Back online, revoke: the code must become unavailable ----------------
  await page.locator("#offline").uncheck();
  await page.locator("#scenario").selectOption("revoked");
  await page.waitForFunction(
    () => document.querySelector('[data-testid="pass-integrity"]')?.textContent === "Revoked",
  );
  check("revoked integrity is visible", (await text('[data-testid="pass-integrity"]')) === "Revoked");
  check(
    "revoked pass disables the code",
    await page.locator('[data-testid="pass-show-code"]').isDisabled(),
  );
  check(
    "revoked verdict is a hard stop",
    (await text('[data-testid="pass-verdict"]')).includes("Do not present"),
  );
  await page.screenshot({ path: join(evidenceDir, "07-revoked.png"), fullPage: true });

  // 6. Model-claimed verified pass: no host attestation ---------------------
  await page.locator("#forge").click();
  await page.waitForSelector('[data-testid="pass-model-claim"]');
  check(
    "model claim is not promoted to a trust badge",
    (await text('[data-testid="pass-integrity"]')) === "Issuer not verified",
  );
  check(
    "model claim is labelled as untrusted",
    (await text('[data-testid="pass-model-claim"]')).includes("Model-supplied status"),
  );
  check(
    "host reports no attestation for the forged credential",
    (await page.locator('[data-testid="pass-no-attestation"]').count()) === 1,
  );
  findings.push({
    id: "F3",
    title: "Props cannot be bound to a trusted verifier",
    detail:
      "A model can write integrity=verified, producer=issuer and any signature string. Only the host-side attestation store prevented a false badge, and it needed an explicit credentialId match to avoid lending a previous pass its status. The store is not part of the protocol; a different host would rebuild it.",
  });
  await page.screenshot({ path: join(evidenceDir, "08-model-claimed.png"), fullPage: true });

  // 7. Locale switch: the block owns every string --------------------------
  await page.locator("#scenario").selectOption("normal");
  await page.waitForFunction(
    () => document.querySelector('[data-testid="pass-integrity"]')?.textContent === "Verified",
  ).catch(() => {});
  await page.locator("#locale").selectOption("zh-CN");
  await page.waitForFunction(
    () => document.body.textContent?.includes("登机牌") && document.body.textContent?.includes("出示二维码"),
  );
  check("zh-CN locale renders block chrome", (await text("#answer")).includes("登机牌"));
  check("zh-CN primary action is localized", (await text('[data-testid="pass-show-code"]')) === "出示二维码");
  check("zh-CN conclusion is localized", (await text("#answer .iui-prose")).includes("值机"));
  findings.push({
    id: "F4",
    title: "Answer-level locale has no protocol carrier",
    detail:
      "The host passes locale in block props and writes a second localized conclusion op. Built-in SDK chrome and the action envelope remain English.",
  });
  await page.screenshot({ path: join(evidenceDir, "09-zh-cn.png"), fullPage: true });

  // 8. Narrow container: no horizontal overflow ----------------------------
  await page.setViewportSize({ width: 320, height: 900 });
  await page.waitForTimeout(200);
  const narrow = await page.evaluate(() => {
    const card = document.querySelector(".pass-spike-card");
    const primary = document.querySelector('[data-testid="pass-show-code"]');
    return {
      page: document.documentElement.scrollWidth,
      cardClient: card?.clientWidth ?? 0,
      cardScroll: card?.scrollWidth ?? 0,
      primaryHeight: primary?.getBoundingClientRect().height ?? 0,
    };
  });
  check("no page overflow at 320px", narrow.page <= 320, `scrollWidth=${narrow.page}`);
  check(
    "no card overflow at 320px",
    narrow.cardScroll <= narrow.cardClient,
    `${narrow.cardScroll}/${narrow.cardClient}`,
  );
  check("primary action is at least 44px tall", narrow.primaryHeight >= 44, `${narrow.primaryHeight}px`);
  await page.screenshot({ path: join(evidenceDir, "10-320px.png"), fullPage: true });

  await page.setViewportSize({ width: 720, height: 900 });
  await page.waitForTimeout(200);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  check("no page overflow at 720px", wide <= 720, `scrollWidth=${wide}`);

  check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 300));

  await writeFile(
    join(evidenceDir, "verify.json"),
    JSON.stringify(
      {
        experiment: "P0-1 pass spike",
        startedAt,
        finishedAt: new Date().toISOString(),
        baseUrl: BASE,
        viewport: "456x920, then 320/720",
        checks,
        findings,
        consoleErrors,
        finalState: await state(),
      },
      null,
      2,
    ),
  );

  await browser.close();
  await new Promise((resolveDone) => server.close(resolveDone));

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) {
    for (const item of failed) console.log(`FAILED: ${item.name} — ${item.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
