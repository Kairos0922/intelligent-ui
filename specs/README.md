# Spec drafts

**Status: Protocol 0.3-draft, Evaluation 0.2-draft, Domain 0.2-implemented-slice.**
**Decision basis approved 2026-11-04** (user-delegated authority; adversarial
review passed with all four findings dispositioned — see Plan §7.6.1).
Stage 1a core contracts are implemented in `clone/src` (2026-11-04).
The Stage 1b pass vertical slice is implemented against a self-built test issuer
(2026-11-13) under an explicit issuer-gate override. A follow-up implements
C26, C29, C30, and C32 for this test-issuer slice. The hosted DSH pass smoke
passed on 2026-11-18. On 2026-11-19 an isolated hosted DSH profile performed a
real account UI sign-out: the pass block entered the cleared state and
IndexedDB snapshots/meta went from 1/2 to 0/0; a credential-restored re-login
produced only a fresh verified/live snapshot. Remote provider revocation and a
fresh device authorization were not exercised, and hosted `session/disposed`
remains unproven. A real external issuer is still not connected and remains a
Stage 2 gate. The plan remains the decision source of truth. A Stage 2
real-issuer integration readiness/outreach record is in
`STAGE-2-ISSUER-INTEGRATION.md`. No real external issuer is connected;
travel/pass remains mock-verified.

The three P0 verticals have a real-model coverage report in
[`SCENARIO-COVERAGE.md`](SCENARIO-COVERAGE.md). It reports the hosted DeepSeek
V4.1 Flash run as the main result and the local Qwen 2.5 14B run as comparison,
with data analysis, daily travel planning, and daily life on their own 20-task
registries. It does not change the Stage 1b issuer gate.

This directory contains the two beachhead-independent specifications called for by
`INTELLIGENT-UI-PLAN.md` §8.5 and §9:

| File | Scope | Depends on |
|---|---|---|
| [`PROTOCOL-SPEC.md`](PROTOCOL-SPEC.md) | Chinese working draft: Answer Envelope, action lifecycle, authorization, idempotency, reconciliation, compensation, audit, provenance, capability manifest, pass/storage profiles | `INTELLIGENT-UI-PLAN.md` §6.3; `experiments/pass-spike/` |
| [`PROTOCOL-SPEC.en.md`](PROTOCOL-SPEC.en.md) | English translation of the Protocol Spec (0.3-draft) | `PROTOCOL-SPEC.md`; `INTELLIGENT-UI-PLAN.md` §6.3 |
| [`STAGE-2-ISSUER-INTEGRATION.md`](STAGE-2-ISSUER-INTEGRATION.md) | Stage 2 real-issuer readiness and outreaching criteria | Plan §6.7/§7.6.1; `ADAPTERS.md` §7.2 |
| [`EVALUATION-SPEC.md`](EVALUATION-SPEC.md) | L1–L4 + security metrics, gates, fixtures, evidence package, reporting | Plan §6.6–§6.7; Protocol Spec |
| [`DOMAIN-ARTIFACT-SPEC.md`](DOMAIN-ARTIFACT-SPEC.md) | Travel/pass: fields, validation, two-axis states, actions, degradation, privacy, test-issuer spec, C26–C32 | Plan §6.4/§7.6.1; Protocol Spec §15; experiment pass-model |
| [`STAGE-1A-IMPLEMENTATION-PLAN.md`](STAGE-1A-IMPLEMENTATION-PLAN.md) | Stage 1a contracts, tests, limits, and hosted scenario results | Plan §6.3/§6.5; Protocol Spec |
| [`STAGE-1B-IMPLEMENTATION-PLAN.md`](STAGE-1B-IMPLEMENTATION-PLAN.md) | Stage 1b pass slice, issuer-gate override, test issuer, C26–C32 conformance | Plan §6.4/§6.7; Domain Artifact Spec; Protocol Spec §15 |

The plan remains the decision source of truth. These files are subordinate drafts:
if they conflict with the plan, the plan wins until both are revised.

## What these drafts do not do

- They do not select a beachhead.
- They do not claim the real issuer gate passed. Stage 1b uses a self-built test issuer only.
- They do not claim that the beachhead passes. Only contract, host, and test-issuer checks are implemented.
- They do not replace user research, a real-host experiment, or a security audit.

## Language and repo guardrail

These are Chinese working drafts. `npm run check:docs` enforces English prose and
will flag CJK characters. A documented exception exists as of 2026-11-03:
`scripts/check-docs.mjs` skips `specs/`, `experiments/`, and the root
`INTELLIGENT-UI-PLAN.md` (see the exempt list in that script). Translate these
files before promoting them to product documentation; the exception is a
working-draft allowance, not a permanent status.

## Review checklist

1. Does the Protocol Spec keep model output untrusted and host authority explicit?
2. Are the 12 protocol items covered without adding a 13th hidden contract?
3. Is every state transition testable, including timeout, cancel, revoke, and replay?
4. Are idempotency, reconciliation, and compensation independent and non-contradictory?
5. Is the Answer Envelope sufficient to test conclusion / primary artifact / primary action?
6. Does the capability manifest drive prompt, validator, and UI from one source?
7. Are provenance requirements limited to answer level + high-risk fields?
8. Is the pass profile's `integrity × freshness` function unambiguous?
9. Does the Evaluation Spec include all eight required evaluation elements?
10. Are hard blockers absolute, with no averaging escape hatch?
11. Can every claimed result be reproduced from the evidence manifest?
12. Are L4 metrics explicitly out of the beachhead gate?

## Open decisions (must be answered by the Beachhead Decision Record)

Status 2026-11-03 (user decisions 1-9, recorded in Plan §7.6.1 and §9):

- Which beachhead: **Travel pass — conditionally selected** (test issuer first; real-issuer gate at stage 2; fallback to Day plan).
- Which host type and action interface: **DSH (existing path)**; action channels per Domain Artifact Spec.
- Which real data/issuer source is available: **none today** — self-built test issuer starts; real issuer is a stage-2 abandon-condition gate.
- Which subset of the 12 protocol items is P0 for that beachhead: **Travel column of PROTOCOL-SPEC §1.3 (now active)**.
- What are the TaskCompletion / TimeOnTask / IntegrationCost thresholds: **drafted in EVALUATION-SPEC §7.4.1, awaiting user confirmation**.
- Who is the independent reviewer for §7.8's "反方检查": **AI adversarial reviewer** (independent AI instance + checklist; identity disclosed as non-human in the decision record).

## Change control

- Drafts are versioned `0.x-draft`; breaking changes bump the minor draft version
  and are listed in each file's change log.
- A draft becomes `1.0` only after the plan is approved and the beachhead-specific
  subset is reviewed by architecture, security, and a host representative.
- Evaluation thresholds are copied into the Beachhead Decision Record; they are
  not silently changed in this directory.
