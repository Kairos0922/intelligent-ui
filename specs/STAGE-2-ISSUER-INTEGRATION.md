# Stage 2 issuer integration readiness

**Status:** readiness/outreach record. Beachhead switched to Day plan on 2026-11-20 because no real external issuer satisfied Stage 2 criteria. On 2026-11-25, Day plan implementation is complete; this record still tracks Stage 2 real-issuer readiness.

This document records what is still needed to move the selected travel/pass
beachhead from the local Stage 1b test issuer path to a real issuer.

## Real-task validation ledger

The current Stage 2 readiness record tracks the following real-task outcomes:

| Item | Status | Notes |
|---|---|---|
| Real airline issuer | Not connected | No external issuer/credential path found. |
| Wallet | Not verified | No wallet integration or handoff exists. |
| Airport scanner compatibility | Not verified | No real-device scanner testing done. |
| Production `verified` | Not verified | Only Day plan production hardening is validated. |
| npm publishing | Paused | No packages published. |
| Travel/pass product | Mock/fallback | Day plan is the active Beachhead. |

## Current state

- Travel pass mock development and DSH adapter path are complete.
- Mock issuer behavior covered: `normal`, `gate-change`, `revoked`, `invalid`, and `slow`.
- A real airline, wallet, airport scanner, production `verified` status, real
  credential validity, and real-world issuer integration are not claimed.

## What a real issuer must provide

A candidate issuer should answer, with public, machine-readable evidence:

| Area | Required evidence / guarantee |
|---|---|
| Issuer endpoint | Stable HTTPS issuer origin/endpoint. DSH uses `window.__IUI_PASS_ISSUER__.url` and exact-origin allowlists for issuer links. |
| Feed shape | JSON feed compatible with the Stage 1b mock issuer/adapter surface: `payload`, Ed25519 `signature`, `status`, timing fields, and revocation status. Do not invent a second protocol unless the whole adapter is extended first. |
| Credential schema | Travel/boarding-pass fields: `kind`, `issuer.id/name/keyId`, `credentialId`, `holder`, booking/flight data, route, gate/terminal, seat, timing, `validFrom/validUntil`, QR payload. Must validate against `specs/DOMAIN-ARTIFACT-SPEC.md` and the pass profile in `specs/PROTOCOL-SPEC.md`. |
| Trust chain | Public Ed25519 key served through the feed and verifiable by the browser/host. No private key exposure. DNS/TLS and certificate validation must be standard HTTPS. |
| Revocation | Timely issuer-side revocation distribution. `status=revoked` must disable the primary action and be reflected in host verification/snapshot state. Provider-side revocation semantics were intentionally not exercised. |
| Freshness/time | Accurate `staleAfter`, `validFrom`, `validUntil`, and observed timestamps. |
| Device auth/rotation | A path to fresh device authorization and key rotation, if available. This was not tested. |
| Attacker model | Issuer cannot sign changed gate/route data without a private key compromise; key rotation/revocation behavior must be testable. |

## DSH adapter acceptance for real issuer

Already implemented against the mock path and required for any real issuer:

- Ed25519 signature verification through the host/trusted verifier.
- Two-layer snapshot seal: issuer signature plus best-effort host HMAC.
- Dual-axis state: `integrity` and `freshness`.
- Host attestation authority, not model claim.
- Read-only actions only. Wallet writes and irreversible actions are rejected.
- Session/account sign-out cleanup clears snapshots and pass state.
- Airport scanner compatibility is still a separate release gate.

## Outreach ask / candidate criteria

Use these criteria to evaluate issuer candidates:

1. Offer a public, self-contained pass feed compatible with the DSH surface above.
2. Revocation latency is short and observable.
3. Fresh device authorization and key rotation path exists or can be added.
4. DNSSEC/HTTPS/certificate handling meets normal aviation or enterprise TLS standards.
5. A documented issuer-side threat model and incident/revocation process.

Do not confuse:

- **Mock path:** proves the DSH/adapter contract and protocol.
- **Real issuer path:** proves a real issuer can issue, verify, revoke, and maintain credentials the adapter can trust.

## Decision and fallback

If no real issuer satisfies the candidate criteria, the plan allows the explicit fallback to Day plan. Travel-specific acceptance remains blocked until either:

- A real issuer path is found and passes real-world acceptance, or
- The fallback is explicitly accepted and scoped down to the Day plan.

## Evidence

- Mock issuer verified on 2026-11-20: `/health` ok; issuer `test-issuer`; keyId `test-678a9a0896b08daf`; algorithm `Ed25519`; `/pass?credentialId=p1` gate `D7`, status `live`.
- Mock scenarios: `normal`, `gate-change`, `revoked`, `invalid`, `slow`.
- No real issuer evidence is claimed.
