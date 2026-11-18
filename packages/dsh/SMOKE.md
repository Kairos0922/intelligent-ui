# DSH live and replay smoke test

Date: 2026-10-27 (updated 2026-11-18 for the hosted pass smoke)

Hosts: DeepSeek Harness Web `0.2.1-rc.2`, `0.2.1-rc.3`, and `0.2.1-rc.4`

Runtime: Node `v26.11.1`, Chromium through Playwright

Environment:

- Live runs: DSH `0.2.1-rc.2` and `0.2.1-rc.3` with adapter `0.2.1`, a temporary signed-in web profile, DeepSeek-V4.1-Flash, and Work details set to Verbose.
- Deterministic runs: DSH `0.2.1-rc.2` npm runtime, the installed `0.2.1-rc.3` application, and DSH `0.2.1-rc.4` npm runtime. These runs used the self-contained `@intelligent-ui/dsh@0.2.2` tarball, a local DeepSeek Messages server, and no account.

The repository contains no credential, token, screenshot, or session data.

## 2026-11-16 security update

The adapter now requires DSH `0.2.2-rc.3` and Cordis `4.1.0`. DSH 0.2.1 pins `zod 4.4.3`, which is affected by [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). DSH 0.2.2-rc.3 pins `zod 4.6.6`, and the rc.3 dependency audit was clean when recorded. A later `picomatch` advisory now affects Vite. This tree does not upgrade dependencies.

Build, typecheck, the 78 Node tests, and the three Playwright tests pass. The earlier live and deterministic records used older hosts. The 2026-11-18 pass smoke below used rc.3.

## Why DSH rejected 0.2.0

DSH reads each `@deepseek-ai/dsh` or `@deepseek-ai/dsh-*` peer range. It compares the range with the runtime version and includes prerelease versions. Version 0.2.0 declared `@deepseek-ai/dsh-tools` `0.2.1-rc.2` exactly. That range does not include `0.2.1-rc.3`. DSH stops the profile resolution before it loads the plugin. The exact-version exemption is the only override.

Version 0.2.1 changed the peer to `>=0.2.1-rc.2 <0.3.0`. DSH accepts rc.2, rc.3, and rc.4 without an exemption. The install log has no `incompatible` or `exemption` message.

The current peer range is `>=0.2.2-rc.3 <0.3.0`. The 0.2.1 line is no longer supported because DSH 0.2.1 pins `zod 4.4.3`, which is affected by GHSA-mrhx-c7xc-m3w5. DSH 0.2.2-rc.3 pins `zod 4.6.6`.

## Result

The table shows the deterministic runs with `@intelligent-ui/dsh@0.2.2` on each host.

| Case | rc.2 | rc.3 | rc.4 |
|---|---|---|---|
| The tarball installs without an exact-version exemption | Pass | Pass | Pass |
| A clean profile installs without a registry copy of core or adapter | Pass | Pass | Pass |
| The model returns a `render_iui` call | Pass | Pass | Pass |
| The keyed toolview renders tabs and stats | Pass | Pass | Pass |
| The initial stats value is `Option A` | Pass | Pass | Pass |
| A real tab click sends one `[iui-action]` message | Pass | Pass | Pass |
| The action uses `blockId` `final-tabs` | Pass | Pass | Pass |
| The next call uses the same block IDs | Pass | Pass | Pass |
| The stats value changes to `Option B` | Pass | Pass | Pass |
| Browser console errors | None | None | None |

The tab click sent this message:

```json
{"action":"select","blockId":"final-tabs","blockType":"tabs","answerId":"a1","payload":{"value":"Option B"}}
```

The initial and final calls reported six valid IUI ops in every run. The model used `final-tabs` and `final-stats` in the initial call and the update call.

## Live signed-in runs

The live runs used adapter `0.2.1` and DeepSeek-V4.1-Flash. Each run made one real tab click. The toolview and action rows passed on both hosts.

The rc.3 model made one malformed markdown op. The validator returned one issue and kept the other five ops. The model corrected the op in a second call. The final view was correct. The rc.2 model made no malformed op.

## Deterministic runs

The deterministic runs used adapter `0.2.2` and a local DeepSeek Messages server. The server returned six valid ops with `final-tabs` and `final-stats`. A Playwright click on Option B sent the action message. The next request contained the same block IDs and `Option B` in the stats block. The tool list contained `render_iui`.

A clean `DSH_HOME` installed the tarball without a registry copy of `@intelligent-ui/core` or `@intelligent-ui/adapter`. The server bundle includes the core validator. The client bundle includes the core and the adapter.

Each run made five Messages requests: the initial prompt, the tool result, the action, the next tool result, and the final update. Each run had one action turn and one unique action message. The browser console and the network log had no error.

## Visibility

DSH folds completed work steps in its default Work details mode. An earlier live run rendered the interface, but the tool row had zero height after the turn completed.

The final runs set `transcriptView: verbose` in the profile patch. The keyed tool row stayed visible, and the real tab click worked. The install steps in [README.md](README.md) include this setting.

## Synthetic replay

The synthetic replay test from version 0.2.0 still passes in light and dark themes. It covers:

- Keyed toolview replay.
- The no-meta fallback.
- A tool call without a result.
- The matrix, code, formula, and flashcard blocks.
- Tab and chip actions.
- Theme changes.
- Hot module replacement removal and restore.

## Hosted-provider acceptance (2026-11-13)

This run used DSH Web `0.2.2-rc.1`, `@intelligent-ui/dsh` `0.2.2`, Node
`v26.11.1`, Playwright `1.64.1`, Google Chrome `157.0.8103.51`, and the
DeepSeek OpenAI-compatible API. The model id was `deepseek-flash`. DeepSeek
currently serves that alias with `DeepSeek-V4.1-Flash-1017`.

The Playwright smoke drove the real web UI:

- The first `render_iui` call rendered the table and tabs toolview.
- The `save_note` action opened the host confirmation dialog.
- Cancel closed the dialog, did not write `localStorage`, and did not add a tool row.
- Confirm wrote exactly one note and sent an `[iui-action]` message to the session.
- The model's automatic `[iui-action]` turn answered in prose, not with a tool call.
  The pre-registered smoke protocol then sent the exact complete replacement ops
  as a user message. The model called `render_iui`, and the replacement rendered
  with `copy_text`.
- The deliberately invalid op was refused by the model before it called
  `render_iui`. No invalid tool row was created. The previous valid interface
  stayed available, so the host was not stuck.
- The final UI still had one usable `copy_text` action. The browser console had
  no errors.

This passes the host interaction path with an explicit complete-ops recovery.
It does not show autonomous second-turn model compliance, and it does not
exercise the validator with an actual malformed tool call from this model. The
DSH protocol tests cover the validator path without a model.

## Pass host path (2026-11-13)

Stage 1b adds a travel-pass host path. It is separate from the hosted-provider
smoke above.

- A standalone test issuer (`tools/test-issuer/server.mjs`) signs payloads with
  an in-process Ed25519 key. The private key never enters the browser.
- The DSH pass controller fetches `/config` and `/pass`, verifies the signature,
  stores a sealed snapshot in IndexedDB, and exposes a host attestation.
- A Playwright test opened a real browser page, verified the live feed, reopened
  the pass through a new offline host, checked the sealed stale snapshot, forced
  a slow-issuer timeout back to that snapshot, refreshed to a changed gate, and
  then checked revoked and invalid feeds.
- The SDK self-test renders the pass block, opens the QR dialog, emits a
  `refresh` block action, repaints to revoked, and shows a stale notice.
- URL QR payloads and `open_issuer_link` require an exact `https` origin from
  the host allowlist. The block disables the code when the policy rejects it.
- Refresh and verification actions use the action runtime. A timeout enters
  reconciliation without an automatic retry.
- Account sign-out, session disposal, and plugin unload clear sealed snapshots,
  the HMAC key, in-memory pass data, and the action ledger. A hosted account
  sign-out event path was added after the first live sign-out exposed a
  session-only gap.
- Node tests cover Ed25519 verification, HMAC tamper detection, validator
  rejection, allowlist behavior, clear-during-refresh, the DSH controller, and
  the account sign-out/session-disposal cleanup wiring.

## Hosted DSH pass smoke (2026-11-18)

This run used DSH Web `0.2.2-rc.3`, the `0.2.2` adapter with the cleanup
follow-up, Google Chrome through Playwright, and the local test issuer. The
hosted model was DeepSeek-V4.1-Flash under DeepSeek Account. The model called
`render_iui` with the exact pre-registered pass ops.

- The pass rendered `verified` / `live`. Show code opened the QR dialog.
- A stale copied feed (signature preserved, `staleAfter` moved to the past)
  produced `Snapshot`, a stale notice, and the conclusion freshness warning.
- `revoked` disabled the QR and showed the danger notice. `invalid` showed the
  invalid notice.
- A slow issuer produced the refresh timeout path with exactly one `/pass`
  request and no automatic retry. The host kept the sealed snapshot.
- Restoring the normal feed refreshed the latest pass to `verified` / `live` and
  removed the conclusion warning.
- The first live account sign-out showed that the earlier `session/disposed`
  binding did not run. The fix listens to the documented `account-ui/change`
  signed-out state. The post-fix hosted check cleared 8 mounted pass blocks and
  changed IndexedDB from 1 snapshot / 2 metadata records to 0 / 0.
- Browser console errors: 0.

The temporary account was already signed out by the first smoke, so a second
live provider sign-out was not run. The post-fix check emitted the same
`account-ui/change` signed-out state through a temporary client test plugin in
the hosted DSH client. A hosted `session/disposed` was not produced by this
profile.

This is **hosted pass-path and cleanup-event evidence only**. There is no real
airline, Google Wallet, Apple Wallet, or airport scanner. The issuer-gate
override and the remaining conformance gaps are recorded in
[`specs/STAGE-1B-IMPLEMENTATION-PLAN.md`](../../specs/STAGE-1B-IMPLEMENTATION-PLAN.md).

The sanitized evidence is in
[specs/evidence/pass-host.json](../../specs/evidence/pass-host.json).
Screenshots and session records stayed in a local temporary directory, which is
not committed. The repository contains no credential or route token.

## Limits

- The deterministic runs used a local server, not a signed-in model. They check the DSH protocol, tool registration, toolview, and action path. They do not measure model compliance.
- The live runs used one model and one click for each host version. They do not cover every block or model.
- The rc.3 live model made one malformed op and corrected it. Another model can make a different error.
- The tests check the DSH web profile only. They do not check the DSH desktop profile.
- DSH `0.2.1-rc.2`, `0.2.1-rc.3`, and `0.2.1-rc.4` are release candidates. DSH `0.2.2-rc.3` is also a release candidate. A hosted pass web smoke was recorded on rc.3 on 2026-11-18. The older signed-in table/tabs runs used the 0.2.1 line. Run the tests after each DSH upgrade.
- The tests kept screenshots and session records in a local temporary directory. The repository contains no screenshot or session data.

## Test files

- The DSH package is in `packages/dsh/`.
- The install steps are in [README.md](README.md).
- The core test record is in [SDK.md](https://github.com/Kairos0922/intelligent-ui/blob/main/SDK.md).
