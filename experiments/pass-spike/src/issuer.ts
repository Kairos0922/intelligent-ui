import type { Attestation, PassData } from "./pass-model";
import { isOnline } from "./net";

export type IssuerScenario = "normal" | "gate-change" | "unverified" | "revoked" | "invalid";

export interface IssuerResponse {
  pass: PassData;
  attestation: Attestation;
}

function nextDeparture(): { departAt: string; arriveAt: string; boardingAt: string; validUntil: string } {
  const now = new Date();
  const depart = new Date(now);
  depart.setUTCDate(depart.getUTCDate() + 1);
  depart.setUTCHours(18, 35, 0, 0);
  const arrive = new Date(depart.getTime() + 105 * 60_000);
  const boarding = new Date(depart.getTime() - 30 * 60_000);
  const validUntil = new Date(depart.getTime() + 2 * 60 * 60_000);
  return {
    departAt: depart.toISOString(),
    arriveAt: arrive.toISOString(),
    boardingAt: boarding.toISOString(),
    validUntil: validUntil.toISOString(),
  };
}

/**
 * Semi-real issuer fixture. In a real host this would be an issuer API or a
 * verifiable credential; here it returns a deterministic record so the demo can
 * exercise gate changes, revocation and signature failure without network.
 */
export async function fetchIssuerState(scenario: IssuerScenario): Promise<IssuerResponse> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  if (!isOnline()) throw new Error("offline");
  const times = nextDeparture();
  const now = new Date();
  const integrity =
    scenario === "revoked"
      ? "revoked"
      : scenario === "invalid"
        ? "invalid"
        : scenario === "unverified"
          ? "unverified"
          : "verified";
  const gate = scenario === "normal" || scenario === "unverified" ? "D7" : "D2";

  const pass: PassData = {
    kind: "boarding-pass",
    credentialId: "cred_8f3a2c71",
    issuer: {
      id: "meridian-air",
      name: "Meridian Air",
      keyId: "meridian-2026-11",
      algorithm: "ES256",
    },
    holder: { name: "Kairos" },
    bookingRef: "X7K2QP",
    cabin: "Economy",
    flight: "MR 284",
    route: {
      from: { code: "AMS", city: "Amsterdam" },
      to: { code: "LIS", city: "Lisbon" },
    },
    ...times,
    departTimeZone: "Europe/Amsterdam",
    arriveTimeZone: "Europe/Lisbon",
    terminal: "1",
    gate,
    seat: "14A",
    boardingGroup: "2",
    qr: {
      format: "qr",
      payload: [
        "IUI1",
        "MR284",
        "AMS-LIS",
        times.departAt,
        "14A",
        "X7K2QP",
        "cred_8f3a2c71",
      ].join(":"),
    },
    validFrom: new Date(now.getTime() - 60 * 60_000).toISOString(),
    validUntil: times.validUntil,
  };

  const attestation: Attestation = {
    credentialId: pass.credentialId,
    integrity,
    observedAt: now.toISOString(),
    checkedAt: now.toISOString(),
    validUntil: pass.validUntil,
    staleAfter: new Date(now.getTime() + 15 * 60_000).toISOString(),
    source: {
      id: "meridian-air/status",
      kind: "issuer_api",
      url: "https://issuer.example/status/cred_8f3a2c71",
    },
  };

  return { pass, attestation };
}
