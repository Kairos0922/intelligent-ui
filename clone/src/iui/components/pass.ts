import qrcode from "qrcode-generator";
import { h, svg } from "../dom";
import { defineBlock, type Ctx } from "../registry";
import {
  evaluatePass,
  freshnessForPass,
  validatePassPayload,
  type PassFreshness,
  type PassIntegrity,
  type PassPayload,
} from "../pass";

interface PassProps {
  pass: PassPayload;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function qrFormatSupported(format: PassPayload["qr"]["format"]): boolean {
  return format === "qr" || format === "iui-pass-v1";
}

function qrUrlNeedsPolicy(payload: string): boolean {
  return /^https:\/\//i.test(payload.trim());
}

function qrPayloadIsOpaque(payload: string): boolean {
  const value = payload.trim();
  if (!value) return false;
  if (value.toLowerCase().startsWith("iui1:")) return true;
  if (value.startsWith("//")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

function qrSvg(payload: string, label: string): SVGSVGElement {
  const code = qrcode(0, "M");
  code.addData(payload);
  code.make();
  const count = code.getModuleCount();
  const margin = 4;
  const size = count + margin * 2;
  const root = svg("svg", {
    viewBox: `0 0 ${size} ${size}`,
    role: "img",
    "aria-label": label,
    class: "iui-pass-qr",
  }) as SVGSVGElement;
  root.dataset.qrPayload = payload;
  root.dataset.qrModules = String(count);

  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("width", String(size));
  bg.setAttribute("height", String(size));
  bg.setAttribute("fill", "#fff");
  root.append(bg);

  const path: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (code.isDark(row, col)) path.push(`M${col + margin} ${row + margin}h1v1h-1z`);
    }
  }
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path.join(""));
  shape.setAttribute("fill", "#000");
  root.append(shape);
  return root;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatTime(value: string, locale: string, timeZone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return value;
  }
}

function formatDate(value: string, locale: string, timeZone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      month: "short",
      day: "numeric",
      weekday: "short",
    }).format(date);
  } catch {
    return value;
  }
}

function statusLabel(
  integrity: PassIntegrity,
  freshness: PassFreshness,
  label: (key: "revoked" | "invalid" | "expired" | "unverified" | "snapshot" | "unknown" | "verified", fallback: string) => string,
): string {
  if (integrity === "revoked") return label("revoked", "Revoked");
  if (integrity === "invalid") return label("invalid", "Invalid");
  if (freshness === "expired") return label("expired", "Expired");
  if (integrity === "unverified") return label("unverified", "Unverified");
  if (freshness === "stale") return label("snapshot", "Snapshot");
  if (freshness === "unknown") return label("unknown", "Unknown");
  return label("verified", "Verified");
}

function statusClass(integrity: PassIntegrity, freshness: PassFreshness): string {
  if (integrity === "revoked" || integrity === "invalid" || freshness === "expired") {
    return "danger";
  }
  if (integrity === "unverified" || freshness === "stale" || freshness === "unknown") {
    return "warning";
  }
  return "ok";
}

function hasAction(ctx: Ctx, name: string): boolean {
  return ctx.capabilities?.actions.some((action) => action.name === name) ?? false;
}

defineBlock("pass", (el, props: PassProps, ctx: Ctx) => {
  const initial = props?.pass;
  if (!initial || initial.kind !== "boarding-pass") {
    el.append(h("div", { class: "iui-muted", text: "Pass data is unavailable." }));
    return;
  }

  type TKey = Parameters<NonNullable<Ctx["t"]>>[0];
  const label = (key: TKey, fallback: string, params?: Record<string, string | number>) =>
    ctx.t?.(key, params) ?? fallback;
  let current = initial;
  let renderedPayload = initial;
  let canShowCode = false;
  const mountEpoch = ctx.passHost?.clearEpoch?.() ?? 0;
  const root = h("article", { class: "iui-pass", "data-testid": "pass" });
  el.append(root);
  let dialog: HTMLDialogElement | null = null;

  const closeDialog = () => {
    dialog?.close();
    dialog = null;
  };

  const qrPolicyAllowed = (pass: PassPayload): boolean => {
    if (qrUrlNeedsPolicy(pass.qr.payload)) {
      return ctx.passHost?.isQrPayloadAllowed?.(pass.qr.payload) === true;
    }
    return qrPayloadIsOpaque(pass.qr.payload);
  };

  const showCode = (pass: PassPayload) => {
    if (!canShowCode || !qrFormatSupported(pass.qr.format) || !qrPolicyAllowed(pass)) return;
    if (dialog) dialog.close();
    const qrLabel = "Scannable boarding pass code";
    const sheet = h("dialog", { class: "iui-pass-dialog", "aria-label": qrLabel }) as HTMLDialogElement;
    dialog = sheet;
    const body = h("div", { class: "iui-pass-dialog-body" });
    body.append(
      h("div", { class: "iui-pass-dialog-title", text: `${pass.route.from.code} → ${pass.route.to.code}` }),
      h("div", { class: "iui-muted", text: `${pass.flight} · ${pass.seat}` }),
      qrSvg(pass.qr.payload, qrLabel),
    );
    const close = h("button", {
      type: "button",
      class: "iui-pass-button iui-pass-button--secondary",
      text: label("done", "Done"),
      "data-testid": "pass-qr-close",
      onclick: closeDialog,
    });
    body.append(close);
    sheet.append(body);
    sheet.addEventListener("close", () => {
      if (dialog === sheet) dialog = null;
    });
    root.append(sheet);
    sheet.showModal();
  };

  const render = () => {
    if (dialog?.open) {
      dialog.close();
      dialog = null;
    }
    const host = ctx.passHost;
    const cleared = (host?.clearEpoch?.() ?? 0) !== mountEpoch;
    const hostPayload = host?.getPayload?.(current.credentialId);
    const payload = hostPayload?.credentialId === current.credentialId ? hostPayload : current;
    const hostAttestation = host?.getAttestation?.(current.credentialId);
    const attestation =
      hostAttestation?.credentialId === current.credentialId ? hostAttestation : null;
    const online = host?.isOnline?.() ?? navigator.onLine;
    const now = host?.now?.() ?? Date.now();
    const freshness = freshnessForPass(attestation, { now, online });
    const integrity = attestation?.integrity ?? "unverified";
    const latestKnown = host?.getLatestKnown?.(current.credentialId) ?? null;
    const locale = ctx.locale ?? "en-US";
    const reportFreshness = () => {
      ctx.reportArtifactFreshness?.({
        credentialId: current.credentialId,
        integrity,
        freshness,
      });
    };
    renderedPayload = payload;

    root.replaceChildren();
    if (cleared) {
      canShowCode = false;
      delete root.dataset.qrDomain;
      root.dataset.integrity = "unverified";
      root.dataset.freshness = "unknown";
      root.append(
        h("div", { class: "iui-pass-notice iui-pass-notice--danger", "data-testid": "pass-cleared" },
          h("strong", { text: label("passCleared", "Pass data was cleared on sign-out.") }),
          h("span", { text: label("passClearedDetail", "Open the pass again after signing in to reload it.") }),
        ),
      );
      reportFreshness();
      return;
    }
    if (!online && !attestation?.snapshotAt) {
      canShowCode = false;
      delete root.dataset.qrDomain;
      root.dataset.integrity = "unverified";
      root.dataset.freshness = "unknown";
      root.append(
        h("div", { class: "iui-pass-notice iui-pass-notice--danger", "data-testid": "pass-offline" },
          h("strong", { text: label("passOffline", "This pass cannot be shown offline.") }),
          h("span", { text: label("passOfflineDetail", "No sealed snapshot is available. Reconnect to load the pass.") }),
        ),
      );
      reportFreshness();
      return;
    }

    const present = evaluatePass(integrity, freshness, payload.validUntil, now);
    const codeFormatSupported = qrFormatSupported(payload.qr.format);
    const qrDomainAllowed = qrPolicyAllowed(payload);
    const canPresentCode = present.canShowCode && codeFormatSupported && qrDomainAllowed;
    canShowCode = canPresentCode;
    root.dataset.integrity = integrity;
    root.dataset.freshness = freshness;
    root.dataset.qrDomain = qrDomainAllowed ? "allowed" : "blocked";

    const head = h("div", { class: "iui-pass-head" });
    const title = h("div", { class: "iui-pass-title" });
    title.append(
      h("div", { class: "iui-pass-eyebrow", text: text(payload.issuer.name, label("boardingPass", "Boarding pass")) }),
      h("div", { class: "iui-pass-route" }, `${payload.route.from.code} → ${payload.route.to.code}`),
      h("div", { class: "iui-pass-cities", text: `${payload.route.from.city} → ${payload.route.to.city}` }),
    );
    const badge = h("div", {
      class: `iui-pass-badge iui-pass-badge--${statusClass(integrity, freshness)}`,
      "data-testid": "pass-status",
      "data-integrity": integrity,
      "data-freshness": freshness,
      text: statusLabel(integrity, freshness, (key, fallback) => label(key, fallback)),
    });
    head.append(title, badge);
    root.append(head);

    const meta = h("div", { class: "iui-pass-meta" });
    meta.append(
      h("div", { class: "iui-pass-meta-item" }, h("span", { text: label("flight", "Flight") }), h("strong", { text: payload.flight })),
      h("div", { class: "iui-pass-meta-item" }, h("span", { text: label("date", "Date") }), h("strong", { text: formatDate(payload.departAt, locale, payload.departTimeZone) })),
      h("div", { class: "iui-pass-meta-item" }, h("span", { text: label("boarding", "Boarding") }), h("strong", { text: formatTime(payload.boardingAt, locale, payload.departTimeZone) })),
      h("div", { class: "iui-pass-meta-item" }, h("span", { text: label("departs", "Departs") }), h("strong", { text: formatTime(payload.departAt, locale, payload.departTimeZone) })),
    );
    root.append(meta);

    const fields = h("dl", { class: "iui-pass-fields" });
    const field = (label: string, value: string, testId: string) => {
      const cell = h("div", { class: "iui-pass-field" });
      cell.dataset.testid = testId;
      cell.append(h("dt", { text: label }), h("dd", { text: value }));
      return cell;
    };
    fields.append(
      field(label("gate", "Gate"), payload.gate ?? "—", "pass-gate"),
      field(label("seat", "Seat"), payload.seat, "pass-seat"),
      field(label("group", "Group"), payload.boardingGroup ?? "—", "pass-group"),
      field(label("terminal", "Terminal"), payload.terminal ?? "—", "pass-terminal"),
      field(label("passenger", "Passenger"), payload.holder.name, "pass-passenger"),
    );
    root.append(fields);

    const notices = h("div", { class: "iui-pass-notices", "aria-live": "polite" });
    if (integrity === "revoked") {
      notices.append(h("div", { class: "iui-pass-notice iui-pass-notice--danger", "data-testid": "pass-revoked", text: label("passRevoked", "This pass was revoked by the issuer. Do not present it.") }));
    } else if (integrity === "invalid") {
      notices.append(h("div", { class: "iui-pass-notice iui-pass-notice--danger", "data-testid": "pass-invalid", text: label("passInvalid", "The pass signature or snapshot seal is invalid. Do not present it.") }));
    } else if (freshness === "expired") {
      notices.append(h("div", { class: "iui-pass-notice iui-pass-notice--danger", "data-testid": "pass-expired", text: label("passExpired", "This pass has expired. Do not present it.") }));
    } else if (integrity === "unverified") {
      notices.append(h("div", { class: "iui-pass-notice", "data-testid": "pass-unverified", text: label("passUnverified", "The issuer has not provided a verifiable status for this pass.") }));
    } else if (freshness === "stale") {
      notices.append(h("div", { class: "iui-pass-notice", "data-testid": "pass-stale", text: label("passStale", "Showing a saved snapshot. Refresh before boarding.") }));
    } else if (freshness === "unknown") {
      notices.append(h("div", { class: "iui-pass-notice", "data-testid": "pass-unknown", text: label("passUnknown", "The current pass status is unknown. Refresh before boarding.") }));
    }
    if (present.canShowCode && !codeFormatSupported) {
      notices.append(h("div", { class: "iui-pass-notice", "data-testid": "pass-code-unsupported", text: label("passCodeUnsupported", "This pass uses a code format this host cannot render.") }));
    } else if (present.canShowCode && !qrDomainAllowed) {
      notices.append(h("div", { class: "iui-pass-notice iui-pass-notice--danger", "data-testid": "pass-qr-domain-blocked", text: label("passQrDomainBlocked", "The code link is not on this host's issuer allowlist. The code cannot be shown.") }));
    }
    const modelGate = current.gate;
    const hostGate = payload.gate;
    if (hostGate && modelGate && hostGate !== modelGate) {
      notices.append(
        h("div", { class: "iui-pass-notice iui-pass-notice--danger", "data-testid": "pass-gate-conflict" },
          h("strong", { text: label("gateChanged", `Gate changed: ${modelGate} → ${hostGate}`, { from: modelGate, to: hostGate }) }),
          h("span", { text: label("interfaceUpdated", "The interface was updated from the issuer feed.") }),
        ),
      );
    } else if (latestKnown?.gate && hostGate && latestKnown.gate !== hostGate) {
      notices.append(
        h("div", { class: "iui-pass-notice iui-pass-notice--danger", "data-testid": "pass-gate-conflict" },
          h("strong", { text: label("gateChanged", `Gate changed: ${hostGate} → ${latestKnown.gate}`, { from: hostGate, to: latestKnown.gate }) }),
          h("span", { text: label("snapshotOutdated", "The saved snapshot is out of date.") }),
        ),
      );
    }
    if (notices.childElementCount) root.append(notices);

    const actions = h("div", { class: "iui-pass-actions" });
    const show = h("button", {
      type: "button",
      class: "iui-pass-button iui-pass-button--primary",
      text: canPresentCode ? label("showCode", "Show code") : label("codeUnavailable", "Code unavailable"),
      "data-testid": "pass-show-code",
      disabled: !canPresentCode,
      onclick: () => showCode(payload),
    });
    actions.append(show);
    if (hasAction(ctx, "refresh")) {
      actions.append(h("button", {
        type: "button",
        class: "iui-pass-button iui-pass-button--secondary",
        text: label("refresh", "Refresh"),
        "data-testid": "pass-refresh",
        onclick: () => ctx.emit?.("refresh", { credentialId: payload.credentialId }),
      }));
    }
    if (hasAction(ctx, "request_verification")) {
      actions.append(h("button", {
        type: "button",
        class: "iui-pass-button iui-pass-button--secondary",
        text: label("verify", "Verify"),
        "data-testid": "pass-verify",
        onclick: () => ctx.emit?.("request_verification", { credentialId: payload.credentialId }),
      }));
    }
    if (ctx.capabilities?.capabilities.canOpenWallet && hasAction(ctx, "open_wallet")) {
      actions.append(h("button", {
        type: "button",
        class: "iui-pass-button iui-pass-button--secondary",
        text: label("addToWallet", "Add to Wallet"),
        "data-testid": "pass-wallet",
        onclick: () => ctx.emit?.("open_wallet", { credentialId: payload.credentialId }),
      }));
    }
    root.append(actions);

    const foot = h("div", { class: "iui-pass-foot" });
    foot.append(
      h("span", { text: `${payload.issuer.name} · ${payload.bookingRef}` }),
      h("span", { text: attestation ? `${label("checked", "Checked")} ${formatTime(attestation.checkedAt, locale, ctx.timeZone ?? "UTC")}` : label("noAttestation", "No host attestation") }),
    );
    root.append(foot);
    reportFreshness();
  };

  const onShowCode = (event: Event) => {
    const detail = (event as CustomEvent<{ credentialId?: unknown }>).detail;
    if (detail?.credentialId !== current.credentialId) return;
    if (canShowCode) showCode(renderedPayload);
  };
  if (typeof window !== "undefined") {
    window.addEventListener("iui:pass-show-code", onShowCode);
    ctx.registerCleanup(() => window.removeEventListener("iui:pass-show-code", onShowCode));
  }

  const refresh = () => render();
  render();
  ctx.passHost?.ensurePass?.(current);
  const unsubscribe = ctx.passHost?.subscribe?.(refresh);
  if (unsubscribe) ctx.registerCleanup(unsubscribe);
  ctx.registerCleanup(() => {
    if (dialog) {
      dialog.close();
      dialog = null;
    }
  });

  return {
    set(path, value) {
      if (path !== "pass" || !value || typeof value !== "object") return;
      // A streaming caller may not have run the full-answer validator. Never
      // mount an unvalidated payload through a patch.
      const checked = validatePassPayload(value, "pass");
      if (!checked.payload) return;
      current = checked.payload;
      ctx.passHost?.ensurePass?.(current);
      render();
    },
  };
});
