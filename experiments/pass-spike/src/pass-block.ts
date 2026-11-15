import {
  evaluate,
  formatDay,
  formatInZone,
  freshnessFor,
  relativeTime,
  type Attestation,
  type Freshness,
  type Integrity,
  type PassData,
  type Presentability,
} from "./pass-model";
import { qrSvg } from "./qr";
import { isOnline } from "./net";
import { getAttestation, getWalletState, HOST_CAPABILITIES } from "./trust";

/** Subset of the core block context used by this experiment. */
interface Ctx {
  emit?: (name: string, detail?: Record<string, unknown>) => void;
  registerCleanup: (fn: () => void) => void;
}

export interface PassBlockProps {
  pass: PassData;
  locale?: string;
  /** Snapshot of the last gate seen online, used to explain a stale offline pass. */
  latestKnown?: { gate: string; observedAt: string };
  /**
   * Model-supplied status. The block shows it only as a warning; it never
   * promotes it to a trust badge. In a real protocol this field would not be
   * part of the artifact props at all.
   */
  claimedStatus?: { integrity?: Integrity; freshness?: Freshness; producer?: string };
}

const STRINGS = {
  en: {
    boardingPass: "Boarding pass",
    showCode: "Show code",
    hideCode: "Done",
    wallet: "Add to Wallet",
    refresh: "Refresh status",
    verified: "Verified",
    unverified: "Issuer not verified",
    invalid: "Signature invalid",
    revoked: "Revoked",
    live: "Live",
    stale: "Saved copy",
    expired: "Expired",
    unknown: "Status unknown",
    gate: "Gate",
    seat: "Seat",
    group: "Group",
    terminal: "Terminal",
    passenger: "Passenger",
    flight: "Flight",
    checked: "Checked",
    cached: "Cached",
    offline: "Offline",
    gateChanged: "Gate changed",
    codeHint: "Show this code at the gate",
    dismiss: "Close code",
    walletRunning: "Sending to Wallet…",
    walletSucceeded: "Added to Wallet",
    walletFailed: "Wallet handoff failed",
    walletUnknown: "Wallet result unknown — check Wallet before retrying",
    modelClaim: "Model-supplied status is shown for debugging only; the host did not verify it.",
    noAttestation: "No host attestation. This code is shown as unverified.",
    walletUnsupported: "This host cannot open Wallet.",
    staleDetail: "The code is valid, but the gate may have changed. Check the latest status.",
    snapshot: "Offline snapshot",
  },
  zh: {
    boardingPass: "登机牌",
    showCode: "出示二维码",
    hideCode: "完成",
    wallet: "添加到 Wallet",
    refresh: "刷新状态",
    verified: "已验证",
    unverified: "未验证签发方",
    invalid: "签名无效",
    revoked: "已撤销",
    live: "实时",
    stale: "离线副本",
    expired: "已过期",
    unknown: "状态未知",
    gate: "登机口",
    seat: "座位",
    group: "分组",
    terminal: "航站楼",
    passenger: "乘客",
    flight: "航班",
    checked: "校验于",
    cached: "缓存于",
    offline: "离线",
    gateChanged: "登机口已变更",
    codeHint: "请在登机口出示此二维码",
    dismiss: "关闭二维码",
    walletRunning: "正在发送到 Wallet…",
    walletSucceeded: "已添加到 Wallet",
    walletFailed: "Wallet 交接失败",
    walletUnknown: "Wallet 结果未知，重试前请先检查 Wallet",
    modelClaim: "模型自带状态仅供调试；宿主没有验证它。",
    noAttestation: "没有宿主校验记录，此二维码按未验证展示。",
    walletUnsupported: "当前宿主无法打开 Wallet。",
    staleDetail: "二维码仍有效，但登机口可能已变更。请核对最新状态。",
    snapshot: "离线快照",
  },
} as const;

function strings(locale: string) {
  return locale.toLowerCase().startsWith("zh") ? STRINGS.zh : STRINGS.en;
}

function localizedVerdict(
  locale: string,
  verdict: Presentability,
  t: ReturnType<typeof strings>,
): { headline: string; detail: string } {
  if (!locale.toLowerCase().startsWith("zh")) {
    return { headline: verdict.headline, detail: verdict.detail };
  }
  if (verdict.reasons.includes("integrity=revoked")) {
    return { headline: t.revoked, detail: "签发方已撤销此凭证。请勿出示此二维码。" };
  }
  if (verdict.reasons.includes("integrity=invalid")) {
    return { headline: t.invalid, detail: "此凭证未通过签名校验。请勿出示此二维码。" };
  }
  if (verdict.reasons.some((reason) => reason.includes("expired"))) {
    return { headline: t.expired, detail: "凭证已超出有效窗口。请重新获取。" };
  }
  if (verdict.reasons.includes("freshness=stale")) {
    return { headline: t.stale, detail: t.staleDetail };
  }
  if (verdict.reasons.includes("freshness=unknown")) {
    return { headline: t.unknown, detail: "无法连接签发方。二维码仍可出示，但登机口可能已变更。" };
  }
  if (verdict.reasons.includes("integrity=unverified")) {
    return { headline: t.unverified, detail: "二维码可出示，但签发方签名尚未校验。" };
  }
  return { headline: t.verified, detail: "签名已校验，最新状态为实时。" };
}

const INTEGRITY_LABEL = {
  verified: "verified",
  unverified: "unverified",
  invalid: "invalid",
  revoked: "revoked",
} as const;

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function chip(
  text: string,
  tone: "ok" | "warning" | "danger" | "neutral",
  testId: string,
): HTMLSpanElement {
  const node = make("span", `pass-spike-chip pass-spike-chip--${tone}`, text);
  node.dataset.testid = testId;
  return node;
}

export function mountPass(el: HTMLElement, initial: PassBlockProps, ctx: Ctx) {
  let props: PassBlockProps = structuredClone(initial);
  let dialog: HTMLDialogElement | null = null;
  let opener: HTMLButtonElement | null = null;

  const render = () => {
    renderPass();
  };

  const closeDialog = () => {
    if (dialog?.open) dialog.close();
  };

  const openCode = (button: HTMLButtonElement) => {
    const pass = props.pass;
    const rawAttestation = getAttestation();
    const att = rawAttestation && rawAttestation.credentialId === pass.credentialId ? rawAttestation : null;
    const freshness = effectiveFreshness(att, pass);
    const verdict = evaluate(att?.integrity ?? "unverified", freshness, Date.now(), pass.validUntil);
    if (!verdict.canShowCode) return;

    const t = strings(props.locale ?? "en-US");
    const root = make("div");
    const dialogEl = document.createElement("dialog");
    dialogEl.className = "pass-spike-dialog";
    dialogEl.setAttribute("aria-label", `${t.boardingPass} ${pass.flight}`);

    const head = make("div", "pass-spike-dialog-head");
    const title = make("div");
    title.append(
      make("div", "pass-spike-dialog-title", t.codeHint),
      make("div", "pass-spike-dialog-sub", `${pass.flight} · ${pass.route.from.code} → ${pass.route.to.code}`),
    );
    const close = make("button", "pass-spike-icon-button", "×");
    close.type = "button";
    close.setAttribute("aria-label", t.dismiss);
    close.addEventListener("click", () => dialogEl.close());
    head.append(title, close);

    const qrWrap = make("div", "pass-spike-qr");
    qrWrap.append(qrSvg(pass.qr.payload, `${t.boardingPass} ${pass.flight} ${pass.seat}`));

    const meta = make("div", "pass-spike-qr-meta");
    meta.append(
      make("span", "", `${pass.route.from.code} → ${pass.route.to.code}`),
      make("span", "", `${t.seat} ${pass.seat}`),
      make("span", "", `${t.group} ${pass.boardingGroup}`),
    );

    const copy = localizedVerdict(props.locale ?? "en-US", verdict, t);
    const warning =
      verdict.level === "ok"
        ? null
        : make("p", "pass-spike-dialog-warning", `${copy.headline}. ${copy.detail}`);

    const done = make("button", "pass-spike-button pass-spike-button--primary", t.hideCode);
    done.type = "button";
    done.addEventListener("click", () => dialogEl.close());

    dialogEl.append(head, qrWrap, meta);
    if (warning) dialogEl.append(warning);
    dialogEl.append(done);
    dialogEl.addEventListener("click", (event) => {
      if (event.target === dialogEl) dialogEl.close();
    });
    dialogEl.addEventListener("close", () => {
      root.remove();
      if (dialog === dialogEl) dialog = null;
      opener = null;
      button.setAttribute("aria-expanded", "false");
      button.focus();
    });

    root.append(dialogEl);
    (el.closest(".iui-theme") ?? document.body).append(root);
    dialog = dialogEl;
    opener = button;
    button.setAttribute("aria-expanded", "true");
    dialogEl.showModal();
  };

  const effectiveFreshness = (att: Attestation | null, pass: PassData): Freshness => {
    if (!att) return "unknown";
    if (att.snapshotAt) {
      return Date.parse(att.validUntil) <= Date.now() ? "expired" : "stale";
    }
    return freshnessFor(att, Date.now(), isOnline());
  };

  const renderPass = () => {
    if (dialog?.open) dialog.close();
    el.replaceChildren();

    const t = strings(props.locale ?? "en-US");
    const pass = props.pass;
    const rawAttestation = getAttestation();
    const att = rawAttestation && rawAttestation.credentialId === pass.credentialId ? rawAttestation : null;
    const integrity = att?.integrity ?? "unverified";
    const freshness = effectiveFreshness(att, pass);
    const verdict = evaluate(integrity, freshness, Date.now(), pass.validUntil);
    const online = isOnline();

    const card = make("article", "pass-spike-card");
    card.dataset.integrity = integrity;
    card.dataset.freshness = freshness;
    card.dataset.presentable = String(verdict.canShowCode);
    card.setAttribute("aria-label", `${t.boardingPass} ${pass.flight}`);

    // Header
    const head = make("header", "pass-spike-head");
    const brand = make("div", "pass-spike-brand");
    const mark = make("div", "pass-spike-mark", pass.flight.split(" ")[0] ?? "MR");
    const titles = make("div");
    titles.append(
      make("div", "pass-spike-issuer", pass.issuer.name),
      make("div", "pass-spike-kind", t.boardingPass),
    );
    brand.append(mark, titles);
    const cred = make("div", "pass-spike-cred");
    cred.append(
      make("span", "pass-spike-cred-label", "PASS"),
      make("span", "pass-spike-cred-id", pass.credentialId),
    );
    head.append(brand, cred);

    // Status strip (two independent axes)
    const status = make("div", "pass-spike-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.dataset.testid = "pass-status";
    status.append(
      chip(
        integrity === "verified"
          ? t.verified
          : integrity === "unverified"
            ? t.unverified
            : integrity === "revoked"
              ? t.revoked
              : t.invalid,
        integrity === "verified" ? "ok" : integrity === "unverified" ? "warning" : "danger",
        "pass-integrity",
      ),
      chip(
        freshness === "live"
          ? t.live
          : freshness === "stale"
            ? t.stale
            : freshness === "expired"
              ? t.expired
              : t.unknown,
        freshness === "live" ? "ok" : freshness === "expired" ? "danger" : "warning",
        "pass-freshness",
      ),
    );
    if (!online) {
      status.append(chip(t.offline, "neutral", "pass-offline"));
    }
    const checked = att ? relativeTime(att.checkedAt, props.locale ?? "en-US") : "—";
    status.append(make("span", "pass-spike-checked", `${t.checked} ${checked}`));
    card.append(head, status);

    // Route
    const route = make("div", "pass-spike-route");
    const from = make("div", "pass-spike-endpoint");
    from.append(
      make("div", "pass-spike-code", pass.route.from.code),
      make("div", "pass-spike-city", pass.route.from.city),
      make("div", "pass-spike-time", formatInZone(pass.departAt, pass.departTimeZone, props.locale ?? "en-US")),
      make("div", "pass-spike-day", formatDay(pass.departAt, pass.departTimeZone, props.locale ?? "en-US")),
    );
    const middle = make("div", "pass-spike-middle");
    middle.append(
      make("div", "pass-spike-flight", pass.flight),
      make("div", "pass-spike-line", "········"),
      make("div", "pass-spike-city", `${pass.route.from.city} → ${pass.route.to.city}`),
    );
    const to = make("div", "pass-spike-endpoint pass-spike-endpoint--right");
    to.append(
      make("div", "pass-spike-code", pass.route.to.code),
      make("div", "pass-spike-city", pass.route.to.city),
      make("div", "pass-spike-time", formatInZone(pass.arriveAt, pass.arriveTimeZone, props.locale ?? "en-US")),
      make("div", "pass-spike-day", formatDay(pass.arriveAt, pass.arriveTimeZone, props.locale ?? "en-US")),
    );
    route.append(from, middle, to);
    card.append(route);

    // Gate change explanation (the cross-point P0-3 describes)
    const changed =
      props.latestKnown && props.latestKnown.gate !== pass.gate && freshness !== "live";
    if (changed) {
      const warning = make("div", "pass-spike-conflict");
      warning.dataset.testid = "pass-gate-conflict";
      warning.append(
        make("strong", "", `${t.gateChanged}: ${pass.gate} → ${props.latestKnown!.gate}`),
        make(
          "span",
          "",
          `${t.snapshot} · ${relativeTime(props.latestKnown!.observedAt, props.locale ?? "en-US")}`,
        ),
      );
      card.append(warning);
    }

    // Key fields
    const grid = make("dl", "pass-spike-grid");
    const field = (label: string, value: string, strong = false, testId?: string) => {
      const cell = make("div", "pass-spike-field");
      if (testId) cell.dataset.testid = testId;
      cell.append(make("dt", "", label), make("dd", strong ? "pass-spike-strong" : "", value));
      return cell;
    };
    grid.append(
      field(t.gate, pass.gate, true, "pass-gate"),
      field(t.seat, pass.seat, true, "pass-seat"),
      field(t.group, pass.boardingGroup, true, "pass-group"),
      field(t.terminal, pass.terminal, false, "pass-terminal"),
      field(t.passenger, pass.holder.name, false, "pass-passenger"),
    );
    card.append(grid);

    // Perforation
    card.append(make("div", "pass-spike-perf"));

    // Actions
    const actions = make("div", "pass-spike-actions");
    const show = make("button", "pass-spike-button pass-spike-button--primary", t.showCode);
    show.type = "button";
    show.dataset.testid = "pass-show-code";
    show.disabled = !verdict.canShowCode;
    show.setAttribute("aria-haspopup", "dialog");
    show.setAttribute("aria-expanded", "false");
    show.addEventListener("click", () => openCode(show));

    const wallet = make("button", "pass-spike-button pass-spike-button--secondary", t.wallet);
    wallet.type = "button";
    wallet.dataset.testid = "pass-wallet";
    wallet.disabled = !HOST_CAPABILITIES.canOpenWallet || !verdict.canShowCode;
    if (!HOST_CAPABILITIES.canOpenWallet) wallet.title = t.walletUnsupported;
    wallet.addEventListener("click", () => {
      ctx.emit?.("wallet", { credentialId: pass.credentialId, pass });
    });

    const refresh = make("button", "pass-spike-button pass-spike-button--ghost", t.refresh);
    refresh.type = "button";
    refresh.dataset.testid = "pass-refresh";
    refresh.disabled = !HOST_CAPABILITIES.canRefresh;
    refresh.addEventListener("click", () => {
      ctx.emit?.("refresh", { credentialId: pass.credentialId, pass });
    });

    actions.append(show, wallet, refresh);
    card.append(actions);

    // Verdict + wallet state
    const copy = localizedVerdict(props.locale ?? "en-US", verdict, t);
    const conflictSuffix = changed
      ? (props.locale ?? "").toLowerCase().startsWith("zh")
        ? `${t.gateChanged}：${props.latestKnown!.gate}。`
        : `The gate may have changed to ${props.latestKnown!.gate} since this copy was saved.`
      : "";
    const verdictLine = make("p", `pass-spike-verdict pass-spike-verdict--${verdict.level}`);
    verdictLine.dataset.testid = "pass-verdict";
    verdictLine.textContent = changed
      ? `${copy.headline}. ${copy.detail} ${conflictSuffix}`
      : `${copy.headline}. ${copy.detail}`;
    card.append(verdictLine);

    const walletState = getWalletState();
    if (walletState !== "idle") {
      const walletLine = make("p", "pass-spike-wallet");
      walletLine.dataset.testid = "pass-wallet-state";
      walletLine.textContent =
        walletState === "running"
          ? t.walletRunning
          : walletState === "succeeded"
            ? t.walletSucceeded
            : walletState === "failed"
              ? t.walletFailed
              : t.walletUnknown;
      card.append(walletLine);
    }

    if (props.claimedStatus) {
      const claim = make("p", "pass-spike-model-claim");
      claim.dataset.testid = "pass-model-claim";
      claim.textContent = `${t.modelClaim} claimed=${props.claimedStatus.integrity ?? "?"}/${props.claimedStatus.freshness ?? "?"} producer=${props.claimedStatus.producer ?? "?"}`;
      card.append(claim);
    }
    if (!att) {
      const note = make("p", "pass-spike-model-claim", t.noAttestation);
      note.dataset.testid = "pass-no-attestation";
      card.append(note);
    }

    el.append(card);
  };

  const onTrustChange = () => renderPass();
  const onOnline = () => renderPass();
  const onOffline = () => renderPass();
  window.addEventListener("iui-pass-attestation", onTrustChange);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  ctx.registerCleanup(() => {
    window.removeEventListener("iui-pass-attestation", onTrustChange);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    closeDialog();
  });

  render();

  return {
    set(path: string, value: unknown) {
      const clean = path.replace(/^props\./, "");
      if (clean === "locale") {
        props.locale = String(value);
      } else if (clean === "latestKnown") {
        props.latestKnown = value as PassBlockProps["latestKnown"];
      } else if (clean === "claimedStatus") {
        props.claimedStatus = value as PassBlockProps["claimedStatus"];
      } else if (clean === "pass") {
        props.pass = value as PassData;
      } else if (clean === "pass.gate" || clean === "gate") {
        props.pass = { ...props.pass, gate: String(value) };
      } else if (clean.startsWith("pass.")) {
        const key = clean.slice("pass.".length);
        props.pass = { ...props.pass, [key]: value } as PassData;
      } else {
        (props as unknown as Record<string, unknown>)[clean] = value;
      }
      renderPass();
    },
    finalize() {
      renderPass();
    },
  };
}
