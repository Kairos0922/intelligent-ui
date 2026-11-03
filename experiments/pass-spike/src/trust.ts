import type { Attestation } from "./pass-model";

/**
 * Host-owned trust store.
 *
 * The block never reads `integrity` from model props. A real host would fill
 * this store after checking the issuer signature, revocation list and clock.
 * The experiment fills it from a local issuer fixture.
 */
let attestation: Attestation | null = null;
let walletState: "idle" | "running" | "succeeded" | "failed" | "unknown" = "idle";

export function setAttestation(next: Attestation | null): void {
  attestation = next;
  window.dispatchEvent(new CustomEvent("iui-pass-attestation"));
}

export function getAttestation(): Attestation | null {
  return attestation;
}

export function setWalletState(next: typeof walletState): void {
  walletState = next;
  window.dispatchEvent(new CustomEvent("iui-pass-attestation"));
}

export function getWalletState(): typeof walletState {
  return walletState;
}

export function clearTrust(): void {
  attestation = null;
  walletState = "idle";
}

export interface HostCapabilities {
  canOpenWallet: boolean;
  canRefresh: boolean;
  canNotify: boolean;
  canPersist: boolean;
}

export const HOST_CAPABILITIES: HostCapabilities = {
  canOpenWallet: true,
  canRefresh: true,
  canNotify: false,
  canPersist: true,
};
