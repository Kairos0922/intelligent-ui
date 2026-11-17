# Stage 1b test issuer

This is a **test issuer**, not a real airline, wallet, or travel platform. It
exists to exercise the Stage 1b pass profile with real Ed25519 signatures while
keeping the private key out of the browser process.

The server generates a fresh Ed25519 key pair on startup and never writes the
private key to disk. The browser fetches only the public key and signed feed.

## Run

```sh
npm run issuer:test
# or
node tools/test-issuer/server.mjs --port 4319 --scenario normal
```

The DSH client reads the optional global below before it creates the pass
controller. Set it in the page bootstrap or in a Playwright `addInitScript`:

```js
window.__IUI_PASS_ISSUER__ = {
  url: "http://127.0.0.1:4319",
  // Exact https origins for URL QR payloads / issuer links. The local test
  // issuer uses opaque QR payloads, so it does not need an entry here.
  allowedOrigins: ["https://issuer.example"],
};
```

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /config` | Issuer identity and Ed25519 SPKI public key (base64) |
| `GET /pass?credentialId=p1` | Signed payload, feed status, observation time, stale-after |
| `GET /scenario?value=...` | Change the runtime scenario |
| `GET /health` | Liveness and current scenario |

Scenarios: `normal`, `gate-change` (D7 → D2), `revoked`, `invalid` (bad
signature), `slow` (delayed response for timeout/reconciliation tests).

## What it proves

- The page can verify an issuer signature without receiving the private key.
- A changed gate or revoked status flows through the host attestation.
- A tampered signature becomes `invalid`. It cannot become `verified`.
- Slow responses exercise the fallback to a sealed snapshot.

## What it does not prove

- Real airline, Google Wallet, Apple Wallet, or issuer integration.
- Boarding-gate scanner compatibility.
- Production key management, rotation, revocation distribution, or issuer
  authentication.
