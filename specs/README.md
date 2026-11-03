# Spec drafts

**Status: draft 0.1 for review — not approved, not implemented.**

This directory contains the two beachhead-independent specifications called for by
`INTELLIGENT-UI-PLAN.md` §8.5 and §9:

| File | Scope | Depends on |
|---|---|---|
| [`PROTOCOL-SPEC.md`](PROTOCOL-SPEC.md) | Answer Envelope, action lifecycle, authorization, idempotency, reconciliation, compensation, audit, provenance, capability manifest, pass/storage profiles | `INTELLIGENT-UI-PLAN.md` §6.3; `experiments/pass-spike/` |
| [`EVALUATION-SPEC.md`](EVALUATION-SPEC.md) | L1–L4 + security metrics, gates, fixtures, evidence package, reporting | Plan §6.6–§6.7; Protocol Spec |

The plan remains the decision source of truth. These files are subordinate drafts:
if they conflict with the plan, the plan wins until both are revised.

## What these drafts do not do

- They do not select a beachhead.
- They do not add product code or change the core protocol.
- They do not claim that any implementation passes.
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
