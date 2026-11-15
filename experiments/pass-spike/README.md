# Pass spike — P0-1 counter-experiment

**Status:** experiment only. It is not a product, not a published package, and not
part of the default `npm run build` / `npm test` pipeline.

This directory answers one question from `INTELLIGENT-UI-PLAN.md` §8.2 P0-1:

> Is the host really missing *copyable examples + data access*, or is it missing
> *protocol contracts*?

It builds a boarding pass with the public `registerBlock` API, without changing
the core SDK. It then attempts the three required paths:

1. **Open** — conclusion, pass artifact, one primary action.
2. **Present** — a real QR code, decoded by a standard decoder.
3. **Reopen offline** — page reload with no network, restored from a host
   snapshot, with integrity and freshness shown separately.

The verdict, blocker log and limitations are in **[BLOCKERS.md](BLOCKERS.md)**.
The verdict is layered: **contract layer B**, **host/commercial layer C** (the
host is a minimal local page, not a production host).
The pre-registered decision rule is in **[DECISION-RULE.md](DECISION-RULE.md)**.
Raw results are in **[evidence/verify.json](evidence/verify.json)**.

## Quick start

```bash
# repository root
npm ci
npm run build:core

cd experiments/pass-spike
npm install
npm run dev          # http://127.0.0.1:5180
```

The app consumes `@intelligent-ui/core` from `../../clone` via `file:`, so
`clone/dist-lib` must exist. The experiment does not import the adapter package;
it uses the core event bridge directly to make the missing action lifecycle
visible.

## Verify

```bash
cd experiments/pass-spike
npm run build
node verify.mjs
```

The script starts a local static server, launches Chrome (falling back to
Playwright Chromium), and runs 41 checks:

- initial online pass, status axes, primary action;
- QR decode (jsQR) against the exact payload;
- save snapshot at D7 → learn D2 online → offline reload → cached D7 with conflict;
- tamper the snapshot (undetected — finding F2);
- revoke the credential (code disabled);
- inject a model-claimed `verified` pass (not promoted to trust);
- zh-CN locale;
- 320 px and 720 px horizontal overflow; 44 px primary action;
- console errors.

Screenshots and JSON land in `evidence/`.

## What is deliberate

- **Host-owned trust.** The block never trusts `integrity` from model props. It
  reads a host attestation store keyed by `credentialId`. This is the workaround
  that proves the protocol gap, not a recommended SDK design.
- **Host-owned snapshot.** `localStorage` is used because the SDK has no storage
  adapter. The snapshot schema and its `snapshotAt` marker are local inventions.
- **Host-owned action results.** Wallet/Refresh update a module-level state and
  dispatch a DOM event. The SDK has no `action result` op.
- **No model call.** The host writes the conclusion and pass ops directly. The
  experiment is about the artifact and contracts, not prompt quality.
- **Real QR.** `qrcode-generator` produces the matrix; jsQR verifies the rendered
  SVG in the browser. A real product would also need issuer signature, revocation
  and refresh, which this fixture only simulates.

## Files

| Path | Purpose |
|---|---|
| `src/pass-block.ts` | The custom `pass` block: render, states, QR dialog, custom `set` |
| `src/pass-model.ts` | Dual-axis status, presentability function, snapshot format, formatting |
| `src/trust.ts` | Host attestation store, wallet state, capability flags |
| `src/issuer.ts` | Semi-real issuer fixture (gate change, revoke, invalid) |
| `src/main.ts` | Minimal host: ops, offline boot, adversarial controls, test hooks |
| `src/qr.ts` | Real QR SVG from `qrcode-generator` |
| `verify.mjs` | Reproducible Playwright + jsQR verification |
| `evidence/` | Screenshots and `verify.json` |
| `DECISION-RULE.md` | Pre-registered judgment rule |
| `BLOCKERS.md` | Blocker log and verdict |

## Non-goals

- Not a WCAG, security or penetration-test audit.
- Not proof that an airport scanner accepts the code.
- Not a real issuer integration; the signature is a placeholder.
- Not evidence about users, adoption, or the commercial beachhead.
- Not a precedent for adding `pass` to the core catalog before the Protocol Spec
  is approved.
