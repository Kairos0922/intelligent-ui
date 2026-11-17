import {
  createActionRuntime,
  errorFor,
  type ActionEvent,
  type ActionRuntime,
  type ActionState,
} from "@intelligent-ui/core/agent";
import { DSH_MANIFEST } from "./manifest.js";
import type { DshPassHost, PassRefreshResult } from "./pass.js";

export interface PassActionRunnerOptions {
  host: Pick<DshPassHost, "refresh">;
  /**
   * Host-local identity scope for the operation ledger. DSH runs in one
   * browser profile; callers that add accounts must pass the real user id.
   */
  userId: string;
  tenantId?: string;
  now?: () => Date;
  hash?: (value: string) => Promise<string>;
  /** Host-generated nonce source. Model output must never provide this key. */
  idempotencyKey?: () => string;
}

export interface PassActionRunInput {
  credentialId: string;
  answerId: string;
  blockId?: string;
  action?: "refresh" | "request_verification";
  source?: "block" | "model" | "host";
}

export interface PassActionRunResult {
  operationId: string;
  state: ActionState;
  events: ActionEvent[];
}

export interface PassActionRunner {
  refresh(input: PassActionRunInput): Promise<PassActionRunResult>;
  get(operationId: string): ActionState | null;
  events(operationId: string): ActionEvent[];
  auditEvents(): ReturnType<ActionRuntime["auditEvents"]>;
}

let nonce = 0;

function hostNonce(action: string, credentialId: string): string {
  nonce += 1;
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${nonce}`;
  return `dsh:${action}:${credentialId}:${random}`;
}

/**
 * Route a pass refresh through Protocol Spec §5–§13.
 *
 * A timed-out refresh is not treated as success. It moves the operation to
 * `unknown`, enters reconciliation, and records a failed reconciliation with
 * the retained snapshot as evidence. It never retries automatically.
 */
export function createPassActionRunner(options: PassActionRunnerOptions): PassActionRunner {
  const runtime = createActionRuntime({
    manifest: DSH_MANIFEST,
    userId: options.userId,
    ...(options.tenantId ? { tenantId: options.tenantId } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.hash ? { hash: options.hash } : {}),
  });
  let operationSeq = 0;

  const result = (operationId: string, state: ActionState): PassActionRunResult => ({
    operationId,
    state,
    events: runtime.events(operationId),
  });

  return {
    async refresh(input) {
      const action = input.action ?? "refresh";
      const operation = await runtime.propose({
        action: {
          id: `pass_${action}_${++operationSeq}`,
          name: action,
          args: { credentialId: input.credentialId },
        },
        source: input.source ?? "host",
        answerId: input.answerId,
        ...(input.blockId ? { blockId: input.blockId } : {}),
        // A new user activation is a new operation. The host, not the model,
        // makes this key; retries of the same operation reuse its operationId.
        idempotencyKey: options.idempotencyKey?.() ??
          hostNonce(action, input.credentialId),
      });
      const operationId = operation.operation.operationId;
      let state = await runtime.decide(operationId);
      if (state.state !== "authorized") {
        // Read-only pass actions are auto-authorized. If policy changes, let
        // the caller decide instead of confirming on the user's behalf.
        return result(operationId, state);
      }
      state = await runtime.start(operationId);
      if (state.state !== "running") {
        return result(operationId, state);
      }

      let outcome: PassRefreshResult;
      try {
        outcome = await options.host.refresh(input.credentialId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state = await runtime.fail(operationId, errorFor("host_unavailable", message));
        return result(operationId, state);
      }

      if (outcome.status === "succeeded") {
        state = await runtime.succeed(operationId, {
          payload: {
            status: outcome.status,
            ...(outcome.reason ? { reason: outcome.reason } : {}),
            ...(outcome.attestation?.snapshotAt
              ? { snapshotAt: outcome.attestation.snapshotAt }
              : {}),
          },
        });
        return result(operationId, state);
      }

      if (outcome.status === "timeout") {
        await runtime.timeout(operationId, "issuer refresh timed out");
        await runtime.beginReconciliation(operationId);
        const evidence = ["issuer refresh timed out"];
        if (outcome.attestation?.snapshotAt) evidence.push("sealed snapshot retained");
        state = await runtime.reconcile(operationId, "failed", evidence);
        return result(operationId, state);
      }

      state = await runtime.fail(
        operationId,
        errorFor(
          "external_unavailable",
          outcome.reason ? `issuer refresh unavailable: ${outcome.reason}` : "issuer refresh unavailable",
        ),
      );
      return result(operationId, state);
    },
    get(operationId) {
      return runtime.get(operationId);
    },
    events(operationId) {
      return runtime.events(operationId);
    },
    auditEvents() {
      return runtime.auditEvents();
    },
  };
}
