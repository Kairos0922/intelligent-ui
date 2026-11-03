import "@intelligent-ui/core/styles.css";
import "./styles.css";
import {
  createIntelligentUI,
  registerBlockSpec,
  type IuiEvent,
  type Op,
} from "@intelligent-ui/core";
import jsQR from "jsqr";
import { fetchIssuerState, type IssuerScenario } from "./issuer";
import {
  clearSnapshot,
  formatInZone,
  loadLatestKnown,
  loadSnapshot,
  qrPayload,
  rememberLatestKnown,
  saveSnapshot,
  type Attestation,
  type PassData,
  type Snapshot,
} from "./pass-model";
import { mountPass, type PassBlockProps } from "./pass-block";
import { isForcedOffline, isOnline, setForcedOffline } from "./net";
import {
  clearTrust,
  getWalletState,
  HOST_CAPABILITIES,
  setAttestation,
  setWalletState,
} from "./trust";

const LOCALE_KEY = "iui.pass-spike.locale";
const SCENARIO_KEY = "iui.pass-spike.scenario";

interface State {
  scenario: IssuerScenario;
  locale: string;
  pass: PassData | null;
  attestation: Attestation | null;
  latestKnown: { gate: string; observedAt: string } | null;
  snapshotMode: boolean;
}

let renderedPass = false;

const state: State = {
  scenario: (localStorage.getItem(SCENARIO_KEY) as IssuerScenario | null) ?? "normal",
  locale:
    localStorage.getItem(LOCALE_KEY) ??
    (navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US"),
  pass: null,
  attestation: null,
  latestKnown: null,
  snapshotMode: false,
};

const answerEl = document.querySelector<HTMLElement>("#answer")!;
const logEl = document.querySelector<HTMLOListElement>("#log")!;

function log(kind: string, message: string): void {
  const item = document.createElement("li");
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString(state.locale, { hour12: false });
  const tag = document.createElement("span");
  tag.className = "log-kind";
  tag.textContent = kind;
  const text = document.createElement("span");
  text.textContent = message;
  item.append(time, tag, text);
  logEl.prepend(item);
}

function conclusion(): string {
  if (!state.pass) return "";
  const boarding = formatInZone(state.pass.boardingAt, state.pass.departTimeZone, state.locale);
  if (state.locale.toLowerCase().startsWith("zh")) {
    return `你已值机 **${state.pass.flight} 飞往里斯本**。**${boarding} 在 ${state.pass.gate} 登机口**开始登机。`;
  }
  return `You're checked in for **${state.pass.flight} to Lisbon**. Boarding starts at **${boarding} at Gate ${state.pass.gate}**.`;
}

function explanation(): string {
  if (!state.pass) return "";
  if (state.locale.toLowerCase().startsWith("zh")) {
    return `步行到 ${state.pass.gate} 约 10 分钟。里斯本比阿姆斯特丹晚 1 小时。`;
  }
  return `Walk to Gate ${state.pass.gate} takes about 10 minutes. Lisbon is 1 hour behind Amsterdam.`;
}

function passProps(): PassBlockProps {
  return {
    pass: state.pass!,
    locale: state.locale,
    latestKnown: state.latestKnown ?? undefined,
  };
}

const ui = createIntelligentUI({
  container: answerEl,
  theme: "inherit",
  animate: false,
  ariaLabel: "Boarding pass answer",
  onPrompt: (prompt) => {
    if (/refresh|刷新/i.test(prompt)) void refreshFromIssuer(false);
  },
  onEvent: handleEvent,
});

function handleEvent(event: IuiEvent): void {
  if (event.type === "validation" || event.type === "unknown-block" || event.type === "error") {
    // Keep validation problems visible: a silently dropped op is a protocol
    // finding, not a cosmetic bug.
    if (event.type === "error") {
      log("error", `${event.phase}: ${event.error.message} ${event.error.stack ?? ""}`.slice(0, 600));
    } else {
      log(event.type, JSON.stringify(event).slice(0, 240));
    }
    return;
  }
  if (event.type !== "block") return;
  const detail = event.detail as { credentialId?: string; pass?: PassData };
  if (event.name === "wallet") {
    // The protocol has no action result channel. The host keeps a side-channel
    // state and the block listens to a DOM event to repaint. This is exactly the
    // workaround the plan predicts.
    if (getWalletState() === "running") {
      log("action", "duplicate wallet click ignored by host (no idempotency key in protocol)");
      return;
    }
    setWalletState("running");
    log("action", `wallet: running for ${detail.credentialId ?? "?"}`);
    window.setTimeout(() => {
      const verified = state.attestation?.integrity === "verified";
      setWalletState(verified ? "succeeded" : "failed");
      log(
        "action",
        verified
          ? "wallet: succeeded (host-local result; block has no result contract)"
          : "wallet: failed (issuer not verified; UI had to decide)",
      );
    }, 700);
  }
  if (event.name === "refresh") {
    void refreshFromIssuer(false);
  }
}

function applyAnswer(): void {
  if (!state.pass) return;
  renderedPass = true;
  const ops: Op[] = [
    { t: "p" },
    { t: "md", v: conclusion() },
    {
      t: "comp",
      id: "pass1",
      type: "pass",
      props: passProps() as unknown as Record<string, unknown>,
    },
    { t: "p" },
    { t: "md", v: explanation() },
    { t: "ask", v: [state.locale.startsWith("zh") ? "刷新状态" : "Refresh status"] },
  ];
  ui.reset();
  ui.apply(ops);
  updateToolbar();
  log("render", `answer rendered (${ops.length} ops, no answer-level slot metadata)`);
}

function updateInPlace(): void {
  if (!state.pass) return;
  if (!renderedPass) {
    applyAnswer();
    return;
  }
  ui.apply({ t: "set", id: "pass1", path: "pass", v: state.pass });
  log("render", "set pass (custom setter; no remount, dialog stays open)");
}

async function refreshFromIssuer(initial: boolean): Promise<void> {
  if (!isOnline()) {
    log("issuer", "refresh skipped: offline");
    return;
  }
  try {
    const response = await fetchIssuerState(state.scenario);
    state.pass = response.pass;
    state.attestation = response.attestation;
    state.latestKnown = { gate: response.pass.gate, observedAt: response.attestation.observedAt };
    setAttestation(response.attestation);
    rememberLatestKnown(response.pass, response.attestation);
    log(
      "issuer",
      `status: gate=${response.pass.gate} integrity=${response.attestation.integrity} observed=${response.attestation.observedAt}`,
    );
    if (initial || !renderedPass) applyAnswer();
    else updateInPlace();
  } catch (error) {
    log("issuer", `refresh failed: ${(error as Error).message}`);
    if (initial) {
      const snapshot = loadSnapshot();
      if (snapshot) hydrate(snapshot, true);
      else renderEmpty("Issuer unreachable and no offline snapshot exists.");
    }
  }
}

function hydrate(snapshot: Snapshot, fromReload: boolean): void {
  state.pass = snapshot.pass;
  state.attestation = { ...snapshot.attestation, snapshotAt: snapshot.savedAt };
  state.latestKnown = loadLatestKnown();
  state.snapshotMode = true;
  setAttestation(state.attestation);
  log(
    "snapshot",
    `restored pass saved at ${snapshot.savedAt}${fromReload ? " (page reload)" : ""}; gate=${snapshot.pass.gate}`,
  );
}

function reopenFromSnapshot(): void {
  const snapshot = loadSnapshot();
  if (!snapshot) {
    log("snapshot", "no snapshot found");
    return;
  }
  hydrate(snapshot, false);
  applyAnswer();
}

function renderEmpty(message: string): void {
  renderedPass = false;
  ui.reset();
  ui.apply([
    { t: "p" },
    { t: "md", v: `**${message}**` },
  ]);
}

function updateToolbar(): void {
  const scenario = document.querySelector<HTMLSelectElement>("#scenario")!;
  const locale = document.querySelector<HTMLSelectElement>("#locale")!;
  scenario.value = state.scenario;
  locale.value = state.locale;
  const offline = document.querySelector<HTMLInputElement>("#offline")!;
  offline.checked = isForcedOffline();
  document.querySelector<HTMLElement>("#snapshot-state")!.textContent = loadSnapshot()
    ? `Snapshot saved: gate ${loadSnapshot()!.pass.gate}`
    : "No snapshot";
  document.querySelector<HTMLElement>("#capabilities")!.textContent = JSON.stringify(
    HOST_CAPABILITIES,
  );
}

function register(): void {
  const spec: Parameters<typeof registerBlockSpec>[0] = {
    type: "pass",
    title: "Travel pass",
    description:
      "Boarding pass, train ticket or event ticket with a scannable code, issuer trust, freshness, and a single present action.",
    kind: "domain",
    props: {
      type: "object",
      required: ["pass"],
      properties: {
        pass: {
          type: "object",
          required: ["credentialId", "issuer", "flight", "route", "qr"],
          properties: {
            kind: { type: "string" },
            credentialId: { type: "string" },
            issuer: { type: "object", properties: {} },
            holder: { type: "object", properties: {} },
            bookingRef: { type: "string" },
            cabin: { type: "string" },
            flight: { type: "string" },
            route: { type: "object", properties: {} },
            departAt: { type: "string" },
            arriveAt: { type: "string" },
            boardingAt: { type: "string" },
            departTimeZone: { type: "string" },
            arriveTimeZone: { type: "string" },
            terminal: { type: "string" },
            gate: { type: "string" },
            seat: { type: "string" },
            boardingGroup: { type: "string" },
            qr: { type: "object", properties: {} },
            validFrom: { type: "string" },
            validUntil: { type: "string" },
          },
        },
        locale: { type: "string" },
        latestKnown: { type: "object", properties: {} },
        claimedStatus: { type: "object", properties: {} },
      },
    },
    state: [
      { path: "pass", description: "replace the whole pass" },
      { path: "pass.gate", description: "update the gate after an issuer refresh" },
      { path: "locale", description: "change the answer locale" },
      { path: "latestKnown", description: "update the last gate seen online" },
    ],
  };
  try {
    registerBlockSpec(spec);
  } catch {
    // the spec may already be registered during HMR
  }
  ui.registerBlock("pass", mountPass);
}

function bindToolbar(): void {
  document.querySelector<HTMLSelectElement>("#scenario")!.addEventListener("change", async (event) => {
    state.scenario = (event.target as HTMLSelectElement).value as IssuerScenario;
    localStorage.setItem(SCENARIO_KEY, state.scenario);
    log("scenario", `issuer scenario -> ${state.scenario}`);
    await refreshFromIssuer(false);
  });

  document.querySelector<HTMLSelectElement>("#locale")!.addEventListener("change", (event) => {
    state.locale = (event.target as HTMLSelectElement).value;
    localStorage.setItem(LOCALE_KEY, state.locale);
    if (state.pass) applyAnswer();
  });

  document.querySelector<HTMLButtonElement>("#save")!.addEventListener("click", () => {
    if (!state.pass || !state.attestation) return;
    saveSnapshot(state.pass, state.attestation);
    rememberLatestKnown(state.pass, state.attestation);
    state.snapshotMode = false;
    log("snapshot", `saved at gate ${state.pass.gate} (integrity=${state.attestation.integrity})`);
    updateToolbar();
  });

  document.querySelector<HTMLInputElement>("#offline")!.addEventListener("change", (event) => {
    const offline = (event.target as HTMLInputElement).checked;
    setForcedOffline(offline);
    log("net", offline ? "forced offline" : "back online");
  });

  document.querySelector<HTMLButtonElement>("#reopen")!.addEventListener("click", reopenFromSnapshot);

  document.querySelector<HTMLButtonElement>("#clear")!.addEventListener("click", () => {
    clearSnapshot();
    log("snapshot", "snapshot cleared");
    updateToolbar();
  });

  document.querySelector<HTMLButtonElement>("#tamper")!.addEventListener("click", () => {
    const snapshot = loadSnapshot();
    if (!snapshot) {
      log("tamper", "no snapshot to tamper with");
      return;
    }
    snapshot.pass.gate = "D9";
    localStorage.setItem("iui.pass-spike.snapshot.v1", JSON.stringify(snapshot));
    log("tamper", "snapshot gate changed D? -> D9 without re-signing; localStorage has no integrity check");
    if (state.snapshotMode) reopenFromSnapshot();
    updateToolbar();
  });

  document.querySelector<HTMLButtonElement>("#forge")!.addEventListener("click", () => {
    // A model can put anything in props. This simulates a model claiming a
    // verified pass. The host has no attestation for this credential.
    const forged: PassData = {
      ...(state.pass ?? ({} as PassData)),
      credentialId: "cred_forged_by_model",
      gate: "D1",
      seat: "1A",
    };
    renderedPass = false;
    ui.reset();
    ui.apply([
      { t: "p" },
      { t: "md", v: "**Model-claimed pass.** The model says it is verified and live." },
      {
        t: "comp",
        id: "forged1",
        type: "pass",
        props: {
          pass: forged,
          locale: state.locale,
          claimedStatus: { integrity: "verified", freshness: "live", producer: "issuer" },
        },
      },
    ]);
      log(
      "adversarial",
      "model-supplied integrity=verified, producer=issuer, signature=<absent>; protocol has no way to bind props to a trusted verifier",
    );
  });

  document.querySelector<HTMLButtonElement>("#reload")!.addEventListener("click", () => {
    window.location.reload();
  });
}

async function boot(): Promise<void> {
  register();
  bindToolbar();
  log("boot", `online=${isOnline()} locale=${state.locale} scenario=${state.scenario}`);

  if (!isOnline()) {
    const snapshot = loadSnapshot();
    if (snapshot) {
      hydrate(snapshot, true);
      applyAnswer();
      return;
    }
    renderEmpty("Offline and no saved pass. Reconnect to fetch the pass.");
    log("boot", "offline with no snapshot");
    return;
  }

  await refreshFromIssuer(true);
}

// ---------------------------------------------------------------------------
// Test hooks. The verification script drives the same public paths as a user.
// ---------------------------------------------------------------------------

async function verifyQr(): Promise<{ text: string | null; expected: string; modules: number }> {
  const svg = document.querySelector<SVGSVGElement>("dialog[open] svg[data-qr-payload]");
  if (!svg) throw new Error("no open QR dialog");
  const expected = svg.dataset.qrPayload ?? "";
  const modules = Number(svg.dataset.qrModules ?? 0);
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
    type: "image/svg+xml",
  });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 512, 512);
    context.drawImage(image, 0, 0, 512, 512);
    const data = context.getImageData(0, 0, 512, 512);
    const decoded = jsQR(data.data, data.width, data.height);
    return { text: decoded?.data ?? null, expected, modules };
  } finally {
    URL.revokeObjectURL(url);
  }
}

declare global {
  interface Window {
    __passSpike: {
      state: () => unknown;
      verifyQr: () => Promise<{ text: string | null; expected: string; modules: number }>;
      saveSnapshot: () => void;
      setOffline: (value: boolean) => void;
      reopen: () => void;
      tamper: () => void;
      forge: () => void;
      clear: () => void;
      qrPayload: () => string;
    };
  }
}

window.__passSpike = {
  state: () => ({
    scenario: state.scenario,
    locale: state.locale,
    online: isOnline(),
    snapshotMode: state.snapshotMode,
    walletState: getWalletState(),
    pass: state.pass,
    attestation: state.attestation,
    latestKnown: state.latestKnown,
    snapshot: loadSnapshot(),
    offlineOverride: isForcedOffline(),
    capabilities: HOST_CAPABILITIES,
  }),
  verifyQr,
  saveSnapshot: () => {
    if (state.pass && state.attestation) {
      saveSnapshot(state.pass, state.attestation);
      rememberLatestKnown(state.pass, state.attestation);
      updateToolbar();
    }
  },
  setOffline: (value: boolean) => {
    setForcedOffline(value);
  },
  reopen: reopenFromSnapshot,
  tamper: () => document.querySelector<HTMLButtonElement>("#tamper")!.click(),
  forge: () => document.querySelector<HTMLButtonElement>("#forge")!.click(),
  clear: () => {
    clearSnapshot();
    updateToolbar();
  },
  qrPayload: () => (state.pass ? qrPayload(state.pass) : ""),
};

void boot();
