import { freshnessForPass, type PassAttestation, type PassFreshness, type PassPayload } from "@intelligent-ui/core/agent";
import { createDshPassHost, type DshPassHost } from "../../packages/dsh/src/pass";

interface PassState {
  attestation: PassAttestation;
  gate: string | null;
  freshness: PassFreshness;
}

interface PassHostTestApi {
  start(url: string, payload: PassPayload): Promise<PassState>;
  refresh(): Promise<PassState>;
  offline(url: string, payload: PassPayload): Promise<PassState>;
  clear(): Promise<void>;
}

declare global {
  interface Window {
    __passTest: PassHostTestApi;
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function stateOf(host: DshPassHost, credentialId: string): PassState {
  const attestation = host.getAttestation(credentialId);
  if (!attestation) throw new Error("pass attestation is missing");
  return {
    attestation,
    gate: host.getPayload(credentialId)?.gate ?? null,
    freshness: freshnessForPass(attestation, {
      now: host.now(),
      online: host.isOnline(),
    }),
  };
}

async function waitForAttestation(
  host: DshPassHost,
  credentialId: string,
  predicate: (attestation: PassAttestation) => boolean,
): Promise<PassState> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const attestation = host.getAttestation(credentialId);
    if (attestation && predicate(attestation)) return stateOf(host, credentialId);
    await delay(25);
  }
  const last = host.getAttestation(credentialId);
  throw new Error(`pass attestation not ready: ${JSON.stringify(last)}`);
}

let current: DshPassHost | null = null;
let modelPayload: PassPayload | null = null;
const NOW = Date.now();

window.__passTest = {
  async start(url, payload) {
    await current?.clear();
    current?.dispose();
    modelPayload = payload;
    current = createDshPassHost({
      issuerUrl: url,
      now: () => NOW,
      online: () => true,
      // Keep the timeout test fast; the test issuer's slow scenario waits 12s.
      timeoutMs: 750,
    });
    current.ensurePass(payload);
    return waitForAttestation(current, payload.credentialId, (item) => item.integrity !== "unverified");
  },
  async refresh() {
    if (!current || !modelPayload) throw new Error("pass host is not started");
    await current.refresh(modelPayload.credentialId);
    return waitForAttestation(current, modelPayload.credentialId, (item) => item.checkedAt !== "");
  },
  async offline(url, payload) {
    const host = createDshPassHost({
      issuerUrl: url,
      now: () => NOW,
      online: () => false,
    });
    host.ensurePass(payload);
    const state = await waitForAttestation(host, payload.credentialId, (item) => item.integrity !== "unverified");
    host.dispose();
    return state;
  },
  async clear() {
    await current?.clear();
    current?.dispose();
    current = null;
    modelPayload = null;
  },
};
