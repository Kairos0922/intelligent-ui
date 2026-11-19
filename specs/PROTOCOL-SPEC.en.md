# Intelligent UI Protocol Spec

**Status:** 0.3-draft English translation (2026-11-19) of [`PROTOCOL-SPEC.md`](PROTOCOL-SPEC.md). The Chinese working draft remains available for cross-checking.

| Item | Content |
|---|---|
| Status | **Draft 0.3; Phase 1a core contracts implemented (2026-11-04); pass/storage profile not implemented; not a product commitment** |
| Scope | The answer / action / provenance / capability contracts on top of the IUI-1 op stream; the public portion unrelated to the beachhead |
| Basis | `INTELLIGENT-UI-PLAN.md` §6.3, §6.3.1–6.3.4, §6.4, §8.2; B1–B7 from `experiments/pass-spike/` |
| Code baseline | `dcd1cc6` (`v0.2.2-3-gdcd1cc6`) |
| Normative terminology | **MUST** = required; **SHOULD** = required unless there is a documented reason to the contrary; **MAY** = optional |

> This document is a contract draft, not an implementation guide. Phase 1a has implemented: the `answer` op, the capability manifest, the read-only/reversible action state machine, provenance validation, and answer-level i18n. The pass profile, storage profile, snapshot seal, and DSN/DSH travel adaptation remain unimplemented.

---

## 0. Abstract

The current protocol has only 8 ops: `model`, `p`, `md`, `table`, `comp`, `set`, `ask`, `done`. It can express "what to display" but cannot express:

- answer-level locale / timeZone / currency / units;
- slots for the conclusion, primary artifact, primary action, explanation, and provenance;
- action intents proposed by the model and execution results from the host;
- action state, authorization, idempotency, reconciliation, compensation, and audit;
- the host capability manifest;
- separation of trusted verification results from model claims;
- integrity of offline snapshots;
- ownership and conflicts of persistent state.

This draft turns these 12 items into testable contracts. **P0 covers only the subset needed by the selected beachhead**; before a beachhead is selected, the 12 items SHOULD NOT be implemented all at once.

---

## 1. Scope and Non-goals

### 1.1 In scope

- answer-level envelope and slots;
- action intent, authorization, state machine, results, errors, retries, reconciliation, compensation, and audit;
- host capability manifest;
- provenance levels, trust boundaries, and budget;
- credential / pass profile (enabled when travel is selected);
- storage / state ownership profile (enabled when day plan is selected);
- validation rules, compatibility policy, and the conformance test matrix.

### 1.2 Out of scope

- concrete UI layout, visual tokens, and animation;
- real issuer integration, signature algorithm implementation, and Wallet writes;
- opening of irreversible actions such as payment, refund, and message sending;
- host identity authentication, key management, and backend storage implementation;
- real user research, accessibility audit, and penetration testing;
- the 25/25 mock benchmark as proof of product capability.

### 1.3 P0 subset (trimmed after beachhead selection)

> **2026-11-03: The beachhead has been conditionally selected as travel/pass** (plan §7.6.1; starting with a self-built test issuer, with a real issuer as the Phase 2 gate and day plan as fallback). **The Travel column is the P0 trimming result**; the Day plan column is downgraded to fallback reference and is enabled only when abandonment condition ① is triggered.

| Contract | Travel pass | Day plan |
|---|---|---|
| Answer Envelope | **P0 (in effect)** | Fallback reference |
| Capability Manifest | **P0 (in effect)** | Fallback reference |
| Action lifecycle / authorization / idempotency / reconciliation / compensation / audit | **P0 (read-only/reversible)** | Fallback reference |
| Provenance | **P0 (credential/time/gate fields)** | Fallback reference |
| Pass profile | **P0 (in effect; seal initially uses host HMAC, see §20 recommendation 7)** | Not enabled |
| Storage / state profile | **P0 (snapshot/TTL/logout)** | Fallback reference (tasks/conflicts/offline queue) |
| i18n (locale/timeZone/currency/units) | **P0 (in effect)** | Fallback reference |

**Unselected profiles retain only the schema and extension points and are not implemented.** This table is the basis for trimming, not a license for parallel development.

### 1.4 Twelve-item mapping

| # | Contract | This document |
|---|---|---|
| 1 | Intent Schema | §5 |
| 2 | Action State Machine | §8.1–8.2 |
| 3 | Transition Rules | §8.2–8.4 |
| 4 | Authorization Contract | §7 |
| 5 | Idempotency Contract | §9 |
| 6 | Error Model | §10.1–10.2 |
| 7 | Retry Policy | §10.3 |
| 8 | Reconciliation Protocol | §11 |
| 9 | Compensation Protocol | §12 |
| 10 | Audit Event Schema | §13 |
| 11 | Answer Envelope | §4 |
| 12 | Host Capability Manifest | §6 |

Also: provenance §14; credential/pass §15; storage/state §16; validation §17; conformance §18.

---

## 2. Roles, Trust Boundaries, and Basic Principles

### 2.1 Roles

| Role | Can do | Cannot do |
|---|---|---|
| **Model** | Produce prose, block props, action proposals, and provenance **claims** | Cannot authorize, execute, write audit, generate `operationId`/`idempotencyKey`, or declare `authority:"attested"` |
| **Host runtime** | Validate, authorize, execute, persist, audit, and render state | Cannot promote model claims directly into trusted verification |
| **Block** | Render, produce local interaction, and emit action events | Cannot execute side effects on its own, and cannot determine credential validity on its own |
| **Trusted verifier** | Verify signatures/issuer/revocation and produce attestation | Cannot confirm on behalf of the user, and cannot bypass host policy |
| **Issuer** | Issue credentials, revoke, and refresh | Does not directly control the UI |
| **User** | Confirm, cancel, reject, and view provenance | Does not write protocol fields |

### 2.2 Trust levels

```text
claimed (model claim) < attested (host/verifier signature or verification) < authoritative (issuer/host authoritative record)
```

Rules:

1. `verification`, `integrity`, and `sourceIdentity` produced by the model are always treated as **claimed**, and MUST NOT be rendered directly as a Verified badge.
2. `authority:"attested"` can only be written by the host or a trusted verifier.
3. The UI's "verified/presentable" state MUST come from host computation, and MUST NOT come from block props.
4. The model cannot generate `operationId`, `idempotencyKey`, `authorizedAt`, `auditId`, or `confirmedBy`; if present, reject or strip them, and record a validation issue.

### 2.3 Basic principles

| # | Principle | Meaning |
|---|---|---|
| P1 | Model output is untrusted input | All fields MUST be validated; the model cannot decide permissions or validity |
| P2 | The host is the sole executor | The model only proposes; the host authorizes/executes/audits |
| P3 | One answer, one primary artifact, one primary action | Comparative answers MAY have no primary action, but MUST NOT have multiple peer primary actions |
| P4 | Do not claim exactly-once | Commit only to at-least-once + idempotent deduplication + reconciliation |
| P5 | Displayable offline ≠ still valid offline | Snapshots MUST be sealed; freshness and integrity are separate |
| P6 | Additive evolution only | New fields/new ops do not change old semantics; breaking changes require a major |
| P7 | Evidence before claim | Without an evidence package, do not write "verified" |

---

## 3. Wire Format and Versioning

### 3.1 Existing IUI-1 ops (baseline, unchanged)

| op | Purpose | Notes |
|---|---|---|
| `{"t":"model","v":"…"}` | Model identity/metadata | Does not carry answer-level contracts |
| `{"t":"p","lvl":0\|2\|3\|4}` | Paragraph/heading | MAY add an optional `id` for slot references |
| `{"t":"md","v":"…"}` | Markdown content | MAY add an optional `id` |
| `{"t":"table","head":[…],"rows":[[…]]}` | Table | MAY add an optional `id` |
| `{"t":"comp","id":"c1","type":"…","props":{…}}` | Mount a block | `id` already exists |
| `{"t":"set","id":"c1","path":"…","v":…}` | Update block state | Existing semantics unchanged |
| `{"t":"ask","v":[…]}` | Suggested replies | 1–6 items |
| `{"t":"done"}` | End | No further content ops are produced afterwards |

**Compatibility rule:** Adding the `id` field is additive; old hosts MAY ignore it, but new hosts MUST preserve it for slot resolution.

### 3.2 New `answer` op (normative carrier of the answer envelope)

The `answer` op **MUST** be the first item in the op list, **MUST** appear at most once, and is not rendered directly. It carries answer-level locale, slots, provenance summary, and action proposals. Old hosts that do not support this op MUST ignore it and enter legacy mode; they MUST NOT render the JSON as text.

```json
{"t":"answer","schemaVersion":"1.0","locale":"zh-CN","timeZone":"Europe/Amsterdam","currency":"EUR","units":"metric","slots":{"conclusion":{"kind":"op","id":"conclusion"},"primaryArtifact":{"kind":"comp","id":"c1"},"primaryAction":{"kind":"action","id":"a1"},"explanation":[{"kind":"op","id":"why"}],"provenance":[{"kind":"op","id":"src"}]},"actions":[{"id":"a1","name":"open_qr","args":{},"confirmHint":"Show QR code","riskHint":"read"}],"provenance":{"authority":"claimed","source":{"id":"issuer:MR","kind":"issuer"},"retrievedAt":"2026-11-03T17:40:00Z","verification":{"sourceIdentity":"unverified","integrity":"unverified","schema":"valid","crossSource":"not_checked"}},"assumptions":["Gate subject to last online verification"]}
```

### 3.3 Slot references

```ts
type SlotRef =
  | { kind: "op"; id: string }       // p / md / table
  | { kind: "comp"; id: string }     // comp
  | { kind: "action"; id: string };  // answer.actions[] or block action

type AnswerSlots = {
  conclusion: SlotRef;               // required
  primaryArtifact?: SlotRef;         // required for artifact-type answers, and only one
  primaryAction?: SlotRef;           // required when an action exists
  explanation?: SlotRef[];
  provenance?: SlotRef[];
};
```

Rules:

- All `SlotRef` values MUST resolve to an actual op/comp/action; a dangling reference is a validation error. Streaming rendering MAY leave references temporarily unresolved, but any still unresolved after `done` MUST fail; unresolved slots MUST NOT be treated as real.
- `id` MUST be unique within an answer (`p`/`md`/`table`/`comp`/`action` share one namespace); duplicate ids are a validation error.
- `conclusion` MUST point to prose or a table, and MUST NOT point to an image/media block.
- `primaryArtifact` MUST point to a `comp`; at most one per answer.
- `primaryAction` MUST point to a declared action; if an executable primary action exists (`actions` is non-empty, or the primary artifact exposes a block action), a missing slot is invalid.
- Actions produced by a block MUST have a stable `name`; if the same block can emit multiple actions with the same name, it MUST provide a stable `id` for slot references.
- `explanation` and `provenance` are visible content; they MUST NOT be hidden away and left unreachable outside a collapsed area.

### 3.4 Versioning and compatibility

- `answer.schemaVersion` uses `major.minor`; this draft is `1.0`.
- **minor**: new optional fields/enum values; old hosts MUST ignore unknown fields and MUST NOT crash.
- **major**: changes field meaning, removes fields, or changes state machine semantics; it MUST use a new op or new version, and MUST NOT upgrade silently.
- Old answers without an `answer` op enter **legacy mode**: the host MAY infer slots heuristically, but MUST mark `legacy:true`, and cannot claim to satisfy the Answer Envelope in this document.
- The capability manifest and `answer` versions are negotiated independently; on mismatch the host MUST reject new fields rather than guess.

---

## 4. Answer Envelope

### 4.1 Fields

| Field | REQUIRED | Type | Rules |
|---|---|---|---|
| `t` | Yes | `"answer"` | Fixed |
| `schemaVersion` | Yes | string | `1.0` |
| `answerId` | No | string | The host MAY override; the model value is untrusted |
| `locale` | Yes | BCP 47 | e.g. `zh-CN`, `en-US`; MUST NOT be an empty string |
| `timeZone` | Yes | IANA | e.g. `Europe/Amsterdam`; MUST NOT be only `CET` |
| `currency` | Conditional | ISO 4217 | REQUIRED when an amount appears |
| `units` | No | `metric`/`imperial` | The default is determined by the host; values MUST NOT be mixed silently |
| `slots` | Yes | `AnswerSlots` | See §3.3 |
| `actions` | No | `ProposedAction[]` | At most 8; proposed by the model, the host MAY reject |
| `provenance` | Conditional | `ProvenanceSummary` | REQUIRED for all answers containing data/`comp`/action; pure prose MAY omit; a model value can only be a claim |
| `fieldProvenance` | No | `ProvenanceRecord[]` | Additive carrier for field-level records in §14.2; a model producer can only be a claim; the required mapping for high-risk fields is determined by profile/1b |
| `assumptions` | No | string[] | At most 12 items, each ≤ 280 characters |

### 4.2 locale / timeZone / currency / units

- `locale` applies to the **entire answer**: prose, block chrome, ARIA labels, action envelope, and error copy.
- `timeZone` applies to all absolute times and the boundaries of "today/tomorrow"; blocks MUST NOT each guess it on their own.
- `currency` only affects amount display and parsing, and does not change the actual charge currency; the charge currency is given by the host action result.
- `units` only affects display; raw values MUST be retained in SI/ISO units to avoid converting after rounding.
- Date/time MUST use strong types: `instant` (UTC ISO 8601), `localDate`, `localTime`, `zonedDateTime`, `recurrence`. Storing local time as UTC is forbidden.
- If the host does not provide locale/timeZone, the host MUST explicitly fill in defaults and mark `assumed:true`; it MUST NOT silently use `en-US`/UTC.

### 4.3 Slots and layout assertions

The Answer Envelope makes the following assertions testable:

1. `conclusion` exists and is visible in the first screen (first-screen height is declared by the host; 600–800 px is only a default estimate).
2. For artifact-type answers, `primaryArtifact` is visible in the first screen, and there is only one.
3. When there is an action, `primaryAction` is reachable in the first screen; it MUST NOT be replaced by a hover-only interaction.
4. `explanation` and `provenance` are reachable from the first screen or via one explicit expansion.
5. Collapse order in narrow containers: explanation first, then secondary fields, **never the primary action first**.

> These are inputs to the layout contract, not visual specifications. Specific pixels/breakpoints are validated by the layout matrix in the Evaluation Spec.

### 4.4 Provenance summary

Answer-level provenance is a **REQUIRED summary for every answer containing data, `comp`, or action**, not a complete copy of each field; pure prose answers MAY omit it.

```ts
type ProvenanceSummary = {
  authority: "claimed" | "attested" | "authoritative";
  source: { id: string; kind: "issuer" | "host" | "user" | "model" | "derived"; url?: string };
  retrievedAt: string;              // ISO instant
  observedAt?: string;
  validFrom?: string;
  validUntil?: string;
  staleAfter?: string;
  verification: Verification;
  assumptions?: string[];
};

type Verification = {
  sourceIdentity: "verified" | "unverified";
  integrity: "verified" | "unverified" | "invalid" | "revoked";
  schema: "valid" | "invalid";
  crossSource: "consistent" | "conflict" | "not_checked";
  verifiedBy?: "host" | "trusted_verifier";
  keyId?: string;
  checkedAt?: string;
};
```

Rules:

- The model can only write `provenance.authority:"claimed"`; writing `attested`/`authoritative` is a protocol violation.
- The host MUST override `provenance.authority` and `verification` with its own attestation, and retain the model claim as debugging information (not displayed as trusted).
- `retrievedAt` is the data acquisition time; `observedAt` is the event time described by the data; the two MUST NOT be conflated.
- `validUntil` is the data/credential validity period; `staleAfter` is the freshness threshold; the two MUST NOT substitute for each other.
- High-risk fields (amounts, prices, credentials, medical, time/gate, external links) MUST have field-level provenance; the rest inherit the answer level.

### 4.5 Acceptance cases (corresponding to B4/B7)

| Case | Assertion |
|---|---|
| After offline reload, the conclusion still states the old gate | The conclusion MUST be consistent with the artifact's freshness; it MUST NOT show both "live D7" and "last online D2" |
| zh-CN / en-US switching | Switch the answer-level locale once; prose, chrome, ARIA, and the action envelope stay in sync |
| Missing `conclusion` | Reject the answer, or downgrade to legacy and mark it as not satisfying the contract |
| Two `primaryArtifact` | Reject; require the model to choose one primary artifact |
| `primaryAction` points to an undeclared action | Reject; MUST NOT render a clickable fake button |

---

## 5. Action Intent

### 5.1 Two sources

| Source | How it is produced | Trust |
|---|---|---|
| **block** | The user clicks a button inside the block; the block emits a `{name,args}` event | The host wraps it as an intent; args are untrusted |
| **model** | A proposal in `answer.actions[]` | Just a proposal; it MUST match the manifest, and the host MAY reject it |

The model **MUST NOT** execute actions directly, and **MUST NOT** generate `operationId`/`idempotencyKey`.

### 5.2 Shape

```ts
type ProposedAction = {
  id: string;                       // unique within the answer, e.g. "a1"
  name: string;                     // MUST appear in the host manifest
  args?: Record<string, unknown>;
  confirmHint?: string;             // UI copy only, not authorization
  riskHint?: "read" | "reversible" | "irreversible"; // hint only
};

type ActionIntent = ProposedAction & {
  source: "block" | "model";
  answerId: string;
  blockId?: string;
  createdAt: string;
  operationId?: string;             // generated by the host upon acceptance; the model cannot write it
};
```

### 5.3 Rules

1. `name` MUST match `actions[].name` in the host manifest; otherwise reject it at generation/validation time.
2. `args` MUST pass the action's `argsSchema`; unknown fields are rejected by default (not ignored).
3. `riskHint` does not participate in authorization; the host uses the manifest's `risk` and its own policy.
4. `confirmHint` MUST NOT masquerade as a system confirmation; user confirmation is performed by the host UI.
5. `operationId` is generated when the intent is accepted by the host; retries of the same intent reuse the `operationId`, but `idempotencyKey` is computed per §9.
6. After an intent expires it MUST NOT be executed; `expiresAt` is the validity period of the operation request, not the credential validity period.
7. If a model-proposed action is rejected, the host MUST return a visible rejection reason and MUST NOT silently ignore it.

### 5.4 Differences between action, operation, and idempotency

| Name | Generated by | Purpose |
|---|---|---|
| `action.id` | Model/block | Locates the button within the answer |
| `operationId` | Host | Identifies one operation instance, used for state/audit/reconciliation |
| `idempotencyKey` | Host | Deduplicates across retries; same key and same args execute only once |
| `auditId` | Host | Audit event ID; not equal to an operation |

---

## 6. Host Capability Manifest

### 6.1 Shape

```ts
type HostCapabilityManifest = {
  schemaVersion: "1.0";
  hostId: string;
  hostVersion?: string;
  locale?: string;
  timeZone?: string;
  capabilities: {
    canNotify: boolean;
    canPersist: boolean;
    canOpenWallet: boolean;
    canVerifyPass: boolean;
    canWriteCalendar: boolean;
    canDeepLink: boolean;
  };
  limits?: {
    maxOps?: number;                // default 512
    maxAnswerBytes?: number;        // default 1_500_000
    maxPropsBytes?: number;         // default 192_000
    maxString?: number;             // default 40_000
  };
  actions: ActionDescriptor[];
};

type ActionDescriptor = {
  name: string;
  description: string;
  risk: "read" | "reversible" | "irreversible";
  requiresConfirmation: boolean;
  idempotent: boolean;
  compensation: "none" | "reversible" | "refund" | "manual";
  timeoutMs: number;
  argsSchema?: JsonSchema;
  resultSchema?: JsonSchema;
};
```

### 6.2 Same-source rule

The host MUST drive three places with the same manifest:

1. **prompt/tool schema**: expose only declared actions;
2. **validator**: reject undeclared actions at generation time;
3. **UI**: do not show buttons for actions without capability, or show them as unavailable with an explanation.

Hardcoding capabilities in any single place (for example, writing `HOST_CAPABILITIES` inside a block) is an implementation that does not conform to this spec.

### 6.3 Negotiation

- The host provides the manifest at session start; the model/adapter MUST read it before generation.
- When the manifest changes (permissions revoked, Wallet unavailable), the host MUST renegotiate or emit a `capabilities_changed` event.
- If the capability for an already-rendered action is revoked, it MUST become unavailable with an explanation; it MUST NOT wait until click time to fail.
- If the manifest version is incompatible, the host MUST reject new actions rather than degrade and guess.

### 6.4 Example action names (non-normative)

`open_qr`, `refresh_pass`, `open_wallet`, `open_task`, `complete_task`, `snooze_reminder`. Names are defined by the host; this spec only requires declaration and matching.

---

## 7. Authorization

### 7.1 Risk levels

| Risk | Example | Default policy |
|---|---|---|
| `read` | Open QR code, view details, refresh read-only data | MAY be authorized automatically; still requires manifest declaration |
| `reversible` | Mark complete, change reminder time, save draft | Requires user confirmation or an explicit host policy |
| `irreversible` | Payment, send, delete, write to Wallet | **Denied by default**; a separate open gate is required |

**P0 boundary:** Only `read` and `reversible` are allowed. `irreversible` requires all 12 items of the Protocol Spec + security review + reconciliation/compensation drills + audit + user confirmation; none may be missing.

### 7.2 Decision

The host produces, for each intent:

```ts
type AuthorizationDecision =
  | { decision: "allow"; policyVersion: string; expiresAt?: string }
  | { decision: "confirm"; prompt: string; expiresAt: string }
  | { decision: "deny"; code: string; message: string };
```

Rules:

- Deny by default; authorize only when declared in the manifest and permitted by policy.
- Actions with `requiresConfirmation:true` MUST NOT be authorized automatically.
- User confirmation MUST record `confirmedBy`, `confirmationMethod`, `confirmedAt`, `scope`, and `expiresAt`.
- The model cannot generate confirmation; `confirmHint` is copy only.
- If permission is revoked after authorization but before execution → re-authorize or fail; execution MUST NOT continue.
- Authorization has a validity period; after expiry it MUST be confirmed again.

### 7.3 Open gate for irreversible actions

All of the following MUST be satisfied before opening:

1. The 12 items of the Protocol Spec pass review;
2. The action is declared in the manifest and has args/result schemas;
3. The user confirmation UI and the permission-denied fallback pass tests;
4. Idempotency keys, operationId, audit, reconciliation, and compensation are all verifiable;
5. Security review (injection, privilege escalation, replay, cross-user) passes;
6. Sandbox validation with a real host/issuer;
7. A runbook exists for failure/unknown/manual review.

---

## 8. Action State Machine

### 8.1 States

```text
proposed
  ├─ request_confirmation -> awaiting_confirmation
  │    ├─ confirm -> authorized
  │    ├─ cancel -> cancelled
  │    └─ expire -> expired
  ├─ authorize (auto) -> authorized
  │    ├─ start -> running
  │    ├─ cancel -> cancelled
  │    └─ expire -> expired
  └─ expire -> expired

running
  ├─ succeed -> succeeded
  ├─ fail -> failed
  └─ timeout -> unknown -> reconciling
       ├─ reconcile_success -> succeeded
       ├─ reconcile_failure -> failed
       ├─ reconcile_cancelled -> cancelled
       ├─ reconcile_timeout -> manual_review
       └─ reconcile_manual -> manual_review
```

| State | Terminal | Meaning |
|---|---|---|
| `proposed` | No | The intent has been produced; confirmation/authorization has not yet been requested |
| `awaiting_confirmation` | No | Waiting for user confirmation |
| `authorized` | No | Authorized by the host; execution has not yet started |
| `running` | No | Execution has started |
| `succeeded` | Yes | Has a definite success result |
| `failed` | Yes | Has a definite failure result |
| `cancelled` | Yes | Cancelled by the user/host before start, or reconciliation confirmed it was not executed |
| `expired` | Yes | Exceeded `expiresAt`; not executed |
| `unknown` | No | Result uncertain; reconciliation is required |
| `reconciling` | No | Querying the real result |
| `manual_review` | Yes | Automatic reconciliation could not resolve it; escalated to manual review |

### 8.2 Legal transitions

| From | Event | To | Guard |
|---|---|---|---|
| `proposed` | `request_confirmation` | `awaiting_confirmation` | manifest requires confirmation |
| `proposed` | `authorize` | `authorized` | read-only and policy permits automatic authorization |
| `proposed` | `expire` | `expired` | `now >= expiresAt` |
| `awaiting_confirmation` | `confirm` | `authorized` | confirmation not expired, scope matches |
| `awaiting_confirmation` | `cancel` | `cancelled` | user cancels |
| `awaiting_confirmation` | `expire` | `expired` | `now >= expiresAt` |
| `authorized` | `start` | `running` | not expired, permission still valid |
| `authorized` | `cancel` | `cancelled` | not yet started |
| `authorized` | `expire` | `expired` | not started and expired |
| `running` | `succeed` | `succeeded` | has a trusted result/receipt |
| `running` | `fail` | `failed` | has a definite failure result |
| `running` | `timeout` | `unknown` | timeout/connection interruption/result undecidable |
| `unknown` | `reconcile_start` | `reconciling` | enter reconciliation |
| `reconciling` | `reconcile_success` | `succeeded` | reconciliation confirms success |
| `reconciling` | `reconcile_failure` | `failed` | reconciliation confirms failure |
| `reconciling` | `reconcile_cancelled` | `cancelled` | reconciliation confirms it was not executed |
| `reconciling` | `reconcile_manual` | `manual_review` | cannot determine automatically |
| `reconciling` | `reconcile_timeout` | `manual_review` | reconciliation window expired without resolution |

Rules:

- Terminal states MUST NOT transition again; late events can only be written to audit and do not change the state.
- A synchronous host MAY complete `authorized -> running -> succeeded` atomically, but MUST record the complete state history; `startedAt`/`finishedAt` MAY be equal.
- User cancels during execution: record a `cancel_requested` event, and the state remains `running`; when the result is determined as `succeeded`/`failed`, it MUST NOT pretend to be `cancelled`.
- `expiresAt` only blocks new authorization/execution; an operation already `running` MUST NOT be killed directly by expiry.
- Automatic authorization and user-confirmed authorization use the **same `authorize` event**; the difference is recorded in the audit's `policy` (`"auto"` | `"user"`) field, without introducing a second event name (2026-11-04 adversarial review F4 correction; the former `auto-authorize` is deprecated).
- When the reconciliation window expires without resolution, emit `reconcile_timeout` and transition to `manual_review` (2026-11-04 adversarial review F4 correction; §11's "unresolved within the window" is thereby implemented by this event and is testable).

### 8.3 Events and ordering

```ts
type ActionEvent = {
  operationId: string;
  stateVersion: number;      // monotonically increasing
  sequence: number;          // monotonically increasing within the same operation
  at: string;                // ISO instant, host clock
  type: "request_confirmation" | "confirm" | "authorize" | "start"
      | "succeed" | "fail" | "timeout" | "cancel" | "expire"
      | "reconcile_start" | "reconcile_success" | "reconcile_failure"
      | "reconcile_cancelled" | "reconcile_manual" | "reconcile_timeout"
      | "cancel_requested";
  payload?: Record<string, unknown>;
};
```

- Duplicate events are idempotently discarded by `(operationId, sequence)`.
- `stateVersion` regression or `sequence` gaps → reject and record an audit; MUST NOT silently overwrite.
- Events for the same operation MUST be applied serially; different operations MAY be parallel.
- State history MUST be reconstructable; storing only the last state is not allowed.
- `confirm`/`authorize` events MUST carry the authorization record; `succeed` MUST carry result/receipt; `fail` MUST carry `ActionError`; `timeout` MUST carry elapsed/reason.

### 8.4 Time fields

- `createdAt` is REQUIRED.
- `startedAt` is filled only after execution actually starts.
- `finishedAt` is filled only in a terminal state.
- `authorizedAt`/`confirmedAt` are filled only after the corresponding event.
- `expiresAt` is the operation request validity period; credential validity is `validUntil`; the two MUST NOT be conflated.

---

## 9. Idempotency

### 9.1 Key

```text
idempotencyKey = H(tenantId || userId || actionName || canonicalJson(args))
```

- `H` is chosen by the host (HMAC/hash are both acceptable); it MUST NOT be provided by the model.
- `canonicalJson`: sorted keys, no whitespace, normalized numbers, reject NaN/Infinity.
- The scope MUST include at least user + tenant; the same args across users MUST NOT be reused.
- The retention period is configured by the host, but MUST satisfy §9.3.

### 9.2 Same-key rules

| Case | Behavior |
|---|---|
| Same key + same args | Return the existing operation/result; do not execute again |
| Same key + different args | Reject with error `idempotency_conflict`; MUST NOT silently reuse |
| Same key + expired | Duplicate execution MUST still be prevented; MAY return `expired`; MUST NOT simply rerun |
| Cross-user/tenant | Treated as different keys |

### 9.3 Hard constraints

Starting from `createdAt`:

```text
idempotencyRetention >= reconciliationWindow >= max(expiresAt - createdAt, retryWindow)
```

The three MUST NOT each be set arbitrarily. The retention period is configured by the host and written into the manifest/audit. If `expiresAt` is not set, use `retryWindow` as the lower bound.

### 9.4 Concurrency and retries

- Concurrent requests with the same key MUST be single-flight or deduplicated by a unique constraint.
- Retries MUST reuse the same `idempotencyKey` and `operationId`.
- Do not claim exactly-once; commit only to at-least-once + deduplication + reconciliation.
- Irreversible actions in the `unknown` state MUST NOT be retried directly; reconcile first.

---

## 10. Errors, Retries, and User-facing Copy

### 10.1 Error shape

```ts
type ActionError = {
  code: ActionErrorCode;
  message: string;          // user-facing, localized
  retryable: boolean;
  terminal: boolean;
  userAction?: "retry" | "reconfirm" | "contact_support" | "none";
  details?: Record<string, unknown>; // untrusted/sanitized
  cause?: string;
};
```

### 10.2 Error codes

| code | Meaning | Retryable | Typical state |
|---|---|---|---|
| `invalid_intent` | Intent structure is invalid | No | `failed` |
| `invalid_args` | args do not match the schema | No | `failed` |
| `unsupported_action` | Not declared in the manifest | No | `failed` |
| `permission_denied` | Rejected by host/user | No | `failed`/`cancelled` |
| `confirmation_required` | Confirmation required | Yes (reconfirm) | `awaiting_confirmation` |
| `confirmation_expired` | Confirmation expired | Yes (reconfirm) | `failed` |
| `operation_expired` | Operation request expired | No | `expired` |
| `idempotency_conflict` | Same key, different args | No | `failed` |
| `host_unavailable` | Host temporarily unavailable | Yes | `unknown`/`failed` |
| `external_unavailable` | issuer/external service unavailable | Yes | `unknown`/`failed` |
| `timeout` | Execution timed out | Conditional | `unknown` |
| `rate_limited` | Rate limited | Yes (backoff) | `unknown`/`failed` |
| `precondition_failed` | Precondition not satisfied | No | `failed` |
| `cancelled_by_user` | Cancelled by user | No | `cancelled` |
| `reconciliation_failed` | Reconciliation failed | No | `manual_review` |
| `unknown` | Unclassified | No | `unknown` |

### 10.3 Retry policy

- Retry only actions with `retryable:true` that have no side effects or can be safely retried.
- Exponential backoff + jitter; the cap is determined by the manifest `timeoutMs` and the host budget.
- Retries MUST reuse `idempotencyKey`/`operationId`.
- `unknown` is reconciled first, then decide whether to retry.
- Automatic retries of irreversible actions are prohibited by default.

### 10.4 User-facing copy

- Error copy uses the answer-level locale.
- Do not say "cancelled" unless it is confirmed not executed; for cancellation during execution, only say "cancellation request received, result pending confirmation".
- Do not treat `unknown` as failure; show "result pending confirmation" and a reconciliation entry point.

---

## 11. Reconciliation

### 11.1 Triggers

- `timeout`, connection interruption, host restart, or an external service returning an indeterminate result;
- duplicate/late events received that cannot be adjudicated;
- audit and result are inconsistent.

### 11.2 Sources and order

1. Host operation ledger;
2. issuer/provider receipt;
3. User-visible action history;
4. Manual review.

### 11.3 Result

```ts
type ReconciliationRecord = {
  startedAt: string;
  finishedAt?: string;
  windowMs: number;
  sources: string[];
  outcome?: "succeeded" | "failed" | "cancelled" | "manual_review";
  evidence?: string[];
  attempts: number;
};
```

Rules:

- `unknown` is not a terminal state; it MUST enter `reconciling` or `manual_review`.
- The reconciliation window MUST be no less than `max(expiresAt - createdAt, retryWindow)` and no greater than `idempotencyRetention`; unresolved within the window → `manual_review`.
- The reconciliation result is written to audit; the history of the original operation MUST NOT be modified, only conclusions may be appended.
- A reconciliation failure MUST NOT make the user click repeatedly; the UI MUST provide a "pending confirmation" state and a manual entry point.

---

## 12. Compensation

Compensation is an **independent record**, not a state machine state.

```ts
type CompensationRecord = {
  kind: "none" | "reversible" | "refund" | "manual";
  state: "available" | "running" | "done" | "failed" | "manual_review";
  operationId: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  idempotencyKey: string;
  auditId?: string;
  error?: ActionError;
};
```

Rules:

- Compensation MUST be idempotent; repeated requests return the existing result.
- Compensation does not change the original operation's terminal state; it only appends records.
- Compensation failure → `state:"manual_review"`; irreversible compensation MUST NOT be retried silently. The failure record still retains `error` to facilitate manual handling.
- The UI MUST distinguish "original operation failed" from "compensation completed/failed".
- `undo` is not a state; it is merely one user entry point for compensation.

---

## 13. Audit

### 13.1 Events

```ts
type AuditEvent = {
  auditId: string;
  at: string;
  actor: { kind: "user" | "host" | "model" | "system" | "verifier"; id?: string };
  operationId?: string;
  action?: string;
  argsHash?: string;             // do not store raw PII
  policyVersion?: string;
  decision?: "allow" | "confirm" | "deny";
  stateBefore?: string;
  stateAfter?: string;
  result?: "succeeded" | "failed" | "cancelled" | "unknown";
  errorCode?: string;
  prevHash?: string;
  hash?: string;
};
```

### 13.2 Rules

- Audit is append-only; models/blocks cannot write to it.
- A hash chain is recommended: `hash = H(prevHash || canonicalJson(event))`; at minimum it MUST be able to detect tampering.
- `argsHash` instead of raw args; PII minimization.
- Retention is determined by host policy; logout/deletion requests MUST be able to delete or anonymize.
- Audit visualization is not a debug log; users can see "who did what, when, and under what authority".

---

## 14. Provenance

### 14.1 Three levels

| Level | Requirement | Content |
|---|---|---|
| answer | REQUIRED for all answers containing data, `comp`, or action; pure prose MAY omit | source, retrievedAt, verification, assumptions |
| block | OPTIONAL | block-level source/time; MUST NOT mask field conflicts |
| field | REQUIRED for high-risk fields | fieldPath, observedAt, validFrom/Until, staleAfter, confidence |

High-risk fields: amounts, prices, credentials, medical, time/gate, external links.

### 14.2 Records

The carrier for field-level records in the wire format is `answer.fieldProvenance` (§4.1). This is an additive supplement in 0.3: §14 previously defined the type but did not define the carrier; Phase 1a validates its shape and the separation of authority, and 1b then maps pass high-risk fields to `fieldPath`.

```ts
type ProvenanceRecord = {
  fieldPath: string;             // "" means answer level
  producer: "model" | "host" | "trusted_verifier" | "derived";
  authority: "claimed" | "attested" | "authoritative";
  source: { id: string; kind: string; url?: string };
  retrievedAt: string;
  observedAt?: string;
  validFrom?: string;
  validUntil?: string;
  staleAfter?: string;
  verification?: Verification;
  confidence?: {
    kind: "source" | "model" | "calibrated";
    value?: number;
    method?: string;
    dataset?: string;
    calibratedAt?: string;
  };
};
```

### 14.3 Trust separation

- `producer:"model"` MUST be `authority:"claimed"`.
- `authority:"attested"` can only be written by host/trusted_verifier.
- A model-provided `integrity:"verified"` MUST be overridden by host attestation before it appears in the UI; without attestation → `unverified`.
- Attestations for different credentials MUST match by credentialId; the state of a previous credential MUST NOT be lent to a new credential.

### 14.4 Budget

- The answer level is REQUIRED; the field level is REQUIRED only for high-risk fields; the rest inherit.
- Provenance MUST NOT block the first `comp`; if it MUST precede it, measure TTFT/first-block latency separately.
- Evaluation treats provenance token count and latency as independent metrics (see Evaluation Spec).
- "1.5 MB was not exceeded" MUST NOT be used in place of the token/latency budget.

### 14.5 Freshness

```text
freshness =
  expired   if now >= validUntil
  stale     if staleAfter && now >= staleAfter
  unknown   if lastCheckedAt missing or verification unavailable
  live      otherwise
```

`freshness` is not equal to `integrity`; the two are orthogonal axes (see §15).

---

## 15. Credential / Pass Profile (enabled when travel is selected)

### 15.1 payload

```ts
type PassPayload = {
  credentialId: string;
  issuer: { id: string; name: string; keyId?: string };
  holder?: { name?: string; seat?: string; group?: string };
  document: {
    type: "boarding_pass" | "train_ticket" | "event_ticket";
    carrier: string;
    flight?: string;
    origin: string;
    destination: string;
    localDeparture: string;        // local time + zone
    localBoarding?: string;
    gate?: string;
    terminal?: string;
    seat?: string;
    bookingRef?: string;
  };
  qr: { format: "iui-pass-v1" | "pdf417" | "aztec"; payload: string };
  validFrom: string;
  validUntil: string;
  revocation: { status: "not_revoked" | "revoked" | "unknown"; checkedAt?: string; ref?: string };
  signature: { alg: string; keyId: string; value: string };
};
```

### 15.2 Dual-axis state

| Axis | Values | Decided by |
|---|---|---|
| `integrity` | `verified` / `unverified` / `invalid` / `revoked` | Host or trusted verifier |
| `freshness` | `live` / `stale` / `expired` / `unknown` | Host clock + last successful verification + network |

Presentability determination:

```ts
type Presentability = {
  canShowCode: boolean;
  level: "ok" | "warning" | "danger";
  reasons: string[];
};

presentability(integrity, freshness, validUntil, now):
  if integrity in {invalid, revoked} -> danger, canShowCode=false
  if freshness == expired or now >= validUntil -> danger, canShowCode=false
  if integrity == unverified -> warning, canShowCode=true
  if freshness in {stale, unknown} -> warning, canShowCode=true
  else -> ok
```

| Combination | Presentable | UI |
|---|---|---|
| `verified` + `live` | Yes | Normal primary action |
| `verified` + `stale` | Yes | Show "saved copy", last verification time, gate conflict |
| `verified` + `unknown` | Yes | Show "cannot verify in real time"; MUST NOT write "verified" |
| `unverified` + `live`/`stale`/`unknown` | Yes | Show "issuer not verified"; MUST NOT display the Verified badge |
| `invalid`/`revoked` + any | No | Primary action disabled; explain the reason |
| Any + `expired`/`validUntil` passed | No | Primary action disabled; prompt to re-fetch |

Supplementary rules:

- `revocation.status=revoked` MUST map to `integrity=revoked`; `unknown` MUST NOT be treated as `verified`.
- `signature` MUST be verified by the host or a trusted verifier; signatures/status provided by the model are only claims.
- `integrity=verified` MUST have verifiable evidence for issuer/keyId/credentialId at the same time; none may be missing.

### 15.3 Snapshot

```ts
type PassSnapshot = {
  schemaVersion: "1.0";
  credentialId: string;
  payload: PassPayload;
  snapshotAt: string;
  lastCheckedAt?: string;
  validUntil: string;
  staleAfter: string;
  /** Host determination at snapshot time; when omitted, treat as verified. A revoked snapshot MUST retain revoked. */
  integrity?: "verified" | "unverified" | "invalid" | "revoked";
  seal: {
    /** Authority layer: the issuer's signature over the payload. The public key MAY be embedded publicly; same-origin scripts do not have the issuer private key and cannot forge a re-signature. */
    credential: { alg: "issuer-signature"; keyId: string; value: string };
    /** Best-effort layer: the host's MAC over metadata (snapshotAt/lastCheckedAt/validUntil/staleAfter/integrity). Optional. */
    metadata?: { alg: "host-hmac-sha256"; keyId: string; value: string };
  };
};
```

Rules:

- **Two-layer seal (2026-11-04 adversarial review F3 correction):** The integrity of the credential body is determined by `credential` (issuer signature); the integrity of host metadata is protected on a best-effort basis by `metadata` (HMAC). A snapshot with a missing or failing `credential` MUST NOT enter `verified`.
- **The issuer private key MUST NOT enter the frontend**: the test issuer MUST also run as a separate process/endpoint (the experiment's fixture is in this form); otherwise the `credential` layer degenerates into decoration.
- **The HMAC key MUST NOT be extractable from same-origin JS**: WebCrypto non-extractable `CryptoKey` (stored in IndexedDB) or host backend sealing; plaintext constants/extractable keys are not allowed.
- **Known boundary (written into the threat model, MUST NOT be glossed over):** Same-origin script execution privilege = the host is already compromised. The client cannot defend against same-origin code that is able to call the sealing API to re-sign **metadata**; the **credential body** remains protected by the issuer signature. Mitigation: host CSP, dependency audit, optional server-side sealing.
- On read, the seal MUST be verified first; tampering → `integrity=invalid` or `unknown`, and `verified` MUST NOT continue to be displayed.
- `snapshotAt`, `lastCheckedAt`, `validUntil`, `staleAfter` are REQUIRED.
- A revocation response MUST write `integrity=revoked` into the snapshot and have it covered by the host HMAC; after offline recovery the QR remains disabled.
- Logout MUST delete the snapshot and QR cache; TTL expiry MUST delete the snapshot, or downgrade it to `unknown` and show a warning; it MUST NOT continue to be presented as `live`. Whether to disable the primary action is determined by the host risk policy; when disabled, the reason MUST be stated.
- Displayable offline ≠ still valid offline; primary action copy MUST reflect `freshness`.

### 15.4 QR and security

- The QR payload MUST be the minimum necessary information; it MUST NOT contain the full name/booking reference unless the issuer spec requires it.
- Enlarging the QR code MUST have a visible button and MUST NOT be hover-only.
- A QR code only proves "readable by standard decoders", not that a gate can scan it; real-device testing is a release gate.
- External links MUST have domain allowlists/signatures; QR contents MUST NOT be treated as instructions.
- Malicious QR codes/phishing links enter the injection test set.

---

## 16. Storage / State Profile (enabled when day plan is selected)

### 16.1 Adapter

```ts
type StorageAdapter = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, opts?: { ttlMs?: number }): Promise<void>;
  remove(key: string): Promise<void>;
  list?(prefix: string): Promise<string[]>;
};
```

### 16.2 State ownership

| Ownership | Example | Conflict rules |
|---|---|---|
| `user` | Checkbox completion, change reminder time | Takes precedence; a model `set` MUST NOT override it unless the user confirms |
| `model` | Recommendation order, suggested copy | MAY be overridden by user/derived |
| `derived` | "Today" computed from the date | Recompute; do not persist as user intent |

Rules:

- Every persisted field MUST be marked with ownership.
- User state takes precedence; on conflict show a visible indication, and MUST NOT silently overwrite.
- `set` MUST NOT remount a block without a custom setter; when a partial update is needed, the block MUST provide a setter.
- Version numbers/`updatedAt` are used to detect stale writes; cross-device conflicts MUST be visible.

### 16.3 PII lifecycle

- TTL: Every persisted key MUST have a TTL or an explicit "until the user deletes it".
- Logout: Clear user data and snapshots; they MUST NOT remain on shared devices.
- Deletion: The user MAY delete individual/all items; deletion MUST propagate to caches/snapshots.
- Encryption: At least host-side encryption or secure storage; credentials MUST NOT be placed in plaintext in `localStorage`.
- Redaction: Logs/audit do not write raw credentials/amounts/names.

### 16.4 Offline queue

- Offline changes enter the queue; queue items have `idempotencyKey` and `createdAt`.
- After reconnect, merge in order; conflicts follow user > model > derived; failures are visible.
- Queue items MUST NOT be executed after expiry/revocation.

---

## 17. Validation Rules (normative)

| # | Rule | Error code |
|---|---|---|
| V1 | `answer` appears at most once and is the first item | `invalid_answer` |
| V2 | `schemaVersion` is supported | `unsupported_version` |
| V3 | `conclusion` exists and resolves | `missing_conclusion` |
| V4 | `primaryArtifact` is at most one and points to a comp | `invalid_primary_artifact` |
| V5 | `primaryAction` points to a declared action | `unknown_action` |
| V6 | action name is in the manifest | `unsupported_action` |
| V7 | args pass the schema; unknown fields are rejected | `invalid_args` |
| V8 | the model MUST NOT write `operationId`/`idempotencyKey`/`authorizedAt`/`auditId` | `untrusted_field` |
| V9 | the model's `provenance.authority` can only be `claimed` | `untrusted_verification` |
| V10 | locale/timeZone/currency are valid | `invalid_locale` |
| V11 | high-risk fields have field-level provenance | `missing_provenance` |
| V12 | existing op/byte/string limits | `limit_exceeded` |
| V13 | pass profile required fields are complete | `invalid_pass` |
| V14 | snapshot seal verification passes | `invalid_snapshot` |
| V15 | reject irreversible actions when they are not open | `action_not_open` |
| V16 | ids are unique within the answer | `duplicate_id` |
| V17 | `actions` ≤ 8; `assumptions` ≤ 12 | `limit_exceeded` |

On validation failure:

- Content that can be safely degraded continues to render; blocks that cannot be rendered safely are dropped entirely.
- A visible issue MUST be produced (at least in development mode/host logs); `console.warn` alone is not sufficient.
- Validation issues MUST NOT be treated as user errors; what the user sees is "this content cannot be displayed/needs retry".

---

## 18. Conformance Test Matrix

| # | Case | Expectation | Coverage |
|---|---|---|---|
| C1 | Valid answer: conclusion + one artifact + one action | Pass; slots resolvable | Answer Envelope |
| C2 | Missing `conclusion` | Reject/legacy marking | B4 |
| C3 | Two `primaryArtifact` | Reject | Answer Envelope |
| C4 | Model writes `provenance.authority:"attested"` | Strip/reject; MUST NOT display Verified | B1 |
| C5 | Reuse attestation across credentials | credentialId mismatch → unverified | B1 |
| C6 | Model writes `operationId`/`idempotencyKey` | Reject | Action |
| C7 | Undeclared action | Reject at generation/validation | B5 |
| C8 | Action requiring confirmation | Enter `awaiting_confirmation`; not executed until confirmed | Authorization |
| C9 | Repeated clicks/repeated requests | Execute only once; return the existing result | Idempotency |
| C10 | Same key, different args | `idempotency_conflict`; not executed | Idempotency |
| C11 | Execution timeout | `unknown` → `reconciling`; no blind retry | Reconciliation |
| C12 | Cancel during execution | Record `cancel_requested`; do not pretend cancelled | State machine |
| C13 | Permission revoked after authorization | Re-authorize or fail | Authorization |
| C14 | Out-of-order/duplicate events | Reject/idempotently discard; state regression blocked | State machine |
| C15 | Compensation failure | `manual_review`; no silent retry | Compensation |
| C16 | Tampered snapshot | `integrity=invalid`/`unknown`; do not display verified | B3 |
| C17 | Offline reload D7, online is now D2 | `verified`+`stale`; show conflict; QR presentable with warning | B2 |
| C18 | Revoked credential | Primary action disabled; explain the reason | Pass |
| C19 | Offline prose still states D7 | Conclusion consistent with artifact freshness | B4 |
| C20 | zh-CN / en-US switching | chrome/ARIA/action envelope in sync | B7 |
| C21 | 320/720 px | No page/card horizontal overflow; primary action ≥44 px | Layout |
| C22 | Malicious URL/QR/injection | Blocked; no instruction execution | S |
| C23 | Same args across users | Do not share operation/idempotency result | S |
| C24 | Audit chain tampering | Detectable; audit append-only | Audit |
| C25 | Same-origin script re-signs snapshot metadata (HMAC layer fails) | Issuer signature verification of the credential body is unaffected; when the issuer signature is invalid, `verified` MUST NOT be displayed | F3 / §15.3 |

**Exit criteria:** C1–C24 all pass; state machine/exception cases are automated; side-effect actions are not opened before they pass.

---

## 19. Versions and Migration

- `schemaVersion` and the capability manifest version are independent.
- Minor upgrades are additive; old fields are not removed and their semantics are not changed.
- Major upgrades require new ops/new field names, and migration notes.
- The host MUST record the manifest/schema version at session start; on failure, reject new actions.
- A legacy answer MUST NOT be silently upgraded to conformant; it MUST be marked.
- Within 0.2.x only additive envelopes are allowed; otherwise the beachhead cannot be delivered on the existing version line.

---

## 20. Open Questions (with 2026-11-03 recommended answers, pending user confirmation)

| # | Question | Recommended answer | Rationale |
|---|---|---|---|
| 1 | Should the `answer` op be the sole carrier, or does the tool-call top-level envelope also need the same structure? | **Both are isomorphic**: the tool-call top-level envelope reuses the same schema, and the validator shares both entry points | The bench already has fence/tool dual modes; two structures would split validation and testing |
| 2 | Do the `id`s of `p`/`md`/`table` enter the public IUI-1 wire format? | **Yes**, as an additive optional field | Slot references in the answer envelope need stable ids; old streams without ids do not participate in slot assertions, preserving backward compatibility |
| 3 | Should the confirmation UI be provided by the host, or should the SDK provide a minimal implementation? | **The SDK provides a minimal implementation** (no style dependencies; the host can override it) | Corresponds to experiment checkpoint B5 — otherwise every host redoes the confirmation interaction |
| 4 | Does the capability manifest need signing/attestation? | **No signing in the first phase** | The manifest is injected locally by the host, is not a model product, and does not cross a trust boundary; introduce attestation once remote distribution appears |
| 5 | What are the priority/conflict rules between model-proposed actions and block-produced actions? | **Block side takes precedence** (direct user operation is a stronger intent); same-`operationId` idempotent deduplication; concurrent conflicts are recorded in audit and the block-side result prevails. **Intent merging (aligning model actions and block actions to the same operationId) is the host's responsibility**; the protocol only requires the audit to record the merge decision | Consistent with the user-priority state policy; merging is host semantics, and the protocol cannot decide for the host whether "these two clicks are the same thing" |
| 6 | What are the concrete default values for the reconciliation window, idempotency retention period, and retry budget? | `expiresAt` ≤ 10 minutes (refresh/verify type); **reconciliation window 1 hour; idempotency retention 24 hours; retry budget 2 attempts, `retryWindow` = 1 hour** (initiated within 1 hour after `failed(retryable=true)`), only after reconciliation confirms no side effects | Satisfies the §9 time inequality: idempotency retention (24h) ≥ reconciliation window (1h) + retryWindow (1h) ≥ operation validity (≤10min) |
| 7 | Should the pass snapshot seal use host HMAC or issuer signature + local MAC? | **Two layers: issuer signature (authoritative, protects the credential body) + host HMAC (best-effort, protects metadata; key non-extractable or server-side sealed)**; the test issuer private key does not enter the frontend | 2026-11-04 adversarial review F3 correction: pure HMAC cannot defend against same-origin script re-signing; the issuer signature can (forgery is impossible without the private key). See §15.3 |
| 8 | Are the day plan's storage backend and cross-device sync in scope for the first phase? | **No** | The day plan is not selected; even if enabled as a fallback, the first phase only does single-device storage |

---

## Appendix A: Type Definitions (normative sketch)

```ts
type JsonObject = Record<string, unknown>;

type AnswerOp = {
  t: "answer";
  schemaVersion: "1.0";
  answerId?: string;
  locale: string;
  timeZone: string;
  currency?: string;
  units?: "metric" | "imperial";
  slots: AnswerSlots;
  actions?: ProposedAction[];
  provenance?: ProvenanceSummary;
  assumptions?: string[];
};

type ProposedAction = {
  id: string;
  name: string;
  args?: JsonObject;
  confirmHint?: string;
  riskHint?: "read" | "reversible" | "irreversible";
};

type ActionState = {
  operationId: string;
  idempotencyKey: string;
  answerId?: string;
  intentId: string;          // ActionIntent.id
  action: string;
  argsHash: string;
  state:
    | "proposed" | "awaiting_confirmation" | "authorized" | "running"
    | "succeeded" | "failed" | "cancelled" | "expired"
    | "unknown" | "reconciling" | "manual_review";
  stateVersion: number;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  authorizedAt?: string;
  confirmedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  expiresAt?: string;
  authorization?: AuthorizationDecision;
  error?: ActionError;
  receipt?: { url?: string; payload?: JsonObject };
  compensation?: CompensationRecord;
  reconciliation?: ReconciliationRecord;
};
```

## Appendix B: Minimal answer example

```json
{"t":"answer","schemaVersion":"1.0","locale":"zh-CN","timeZone":"Europe/Amsterdam","currency":"EUR","units":"metric","slots":{"conclusion":{"kind":"op","id":"conclusion"},"primaryArtifact":{"kind":"comp","id":"c1"},"primaryAction":{"kind":"action","id":"a1"},"explanation":[{"kind":"op","id":"why"}],"provenance":[{"kind":"op","id":"src"}]},"actions":[{"id":"a1","name":"open_qr","args":{},"confirmHint":"Show QR code","riskHint":"read"}],"provenance":{"authority":"claimed","source":{"id":"issuer:MR","kind":"issuer"},"retrievedAt":"2026-11-03T17:40:00Z","verification":{"sourceIdentity":"unverified","integrity":"unverified","schema":"valid","crossSource":"not_checked"}},"assumptions":["Gate subject to last online verification"]}
{"t":"p","lvl":0,"id":"conclusion"}
{"t":"md","v":"MR 284 departs AMS at 19:35 from gate D2."}
{"t":"comp","id":"c1","type":"pass","props":{…}}
{"t":"p","lvl":0,"id":"why"}
{"t":"md","v":"The walk to the gate is about 10 minutes; arriving before 18:50 is recommended."}
{"t":"p","lvl":0,"id":"src"}
{"t":"md","v":"Source: issuer fixture; last online verification 18:05."}
{"t":"ask","v":["Show QR code","Refresh status"]}
{"t":"done"}
```

## Appendix C: Change Log

| Date | Version | Change |
|---|---|---|
| 2026-11-03 | 0.1-draft | First draft; 12 protocol contracts, pass/storage profiles, conformance matrix |
| 2026-11-04 | 0.2-draft | Adversarial review disposition (signed by the user-authorized decision maker): F4—unify the `authorize` event (deprecate `auto-authorize`), add the `reconcile_timeout` event and transition; F3—snapshot seal changed to two layers (issuer signature authoritative + host HMAC best-effort, non-extractable keys, same-origin compromise boundary entered into the threat model); §20-5 adds host intent-merging responsibility, §20-6 adds `retryWindow=1h`; add C25; P0 subset Travel column activated |
| 2026-11-04 | 0.3-draft | Phase 1a implementation write-back: `answer` op and slots, capability manifest, read-only/reversible action runtime, answer-level i18n, `answer.fieldProvenance` carrier, compensation failure `manual_review`; implementation details and tests in `specs/STAGE-1A-IMPLEMENTATION-PLAN.md`. pass/storage profile still not implemented |

## Appendix D: Correspondence with the Plan/Experiments

- Plan §6.3: Protocol Spec 12 items → this document §4–§16.
- Plan §6.3.1: state machine → this document §8.
- Plan §6.3.2: provenance two-level budget → this document §14.
- Plan §6.3.3: protocol tests → this document §18.
- Plan §6.3.4: dual axis → this document §15.
- Experiments B1–B7 → C4–C20 in §18 of this document.
