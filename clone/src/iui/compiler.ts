import type { AnswerOp, HostCapabilityManifest, ProposedAction } from "./contracts";
import { findAction, isP0Risk } from "./contracts";
import { h, append } from "./dom";
import { createI18n, type I18n } from "./i18n";
import { renderBlock, renderInline } from "./md";
import { decode, Op } from "./protocol";
import { mountBlock, BlockApi, Ctx } from "./registry";

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function slotNames(envelope: AnswerOp | null, id: string, kind: "op" | "comp" | "action"): string[] {
  if (!envelope) return [];
  const slots = envelope.slots;
  const names: string[] = [];
  const matches = (ref: { kind: string; id: string } | undefined) =>
    !!ref && ref.kind === kind && ref.id === id;
  if (matches(slots.conclusion)) names.push("conclusion");
  if (matches(slots.primaryArtifact)) names.push("primaryArtifact");
  if (matches(slots.primaryAction)) names.push("primaryAction");
  if ((slots.explanation ?? []).some((ref) => matches(ref))) names.push("explanation");
  if ((slots.provenance ?? []).some((ref) => matches(ref))) names.push("provenance");
  return names;
}

export class Compiler {
  readonly prose: HTMLElement;
  private buf = "";
  private openBlock: HTMLElement | null = null;
  private openBlockId: string | null = null;
  private openMd = "";
  private blocks = new Map<string, { el: HTMLElement; api: BlockApi }>();
  private _done = false;
  private _ops = 0;
  private _seen = 0;
  private envelope: AnswerOp | null = null;
  private actionsRendered = false;
  private i18n: I18n = createI18n();
  /** wall-clock ms since the answer started (for diagnostics) */
  startedAt = performance.now();

  constructor(
    readonly ctx: Ctx,
    host: HTMLElement,
    private opts: {
      className?: string;
      /** last line of defence: validate/sanitize (or drop) each decoded op */
      beforeApply?: (op: Op) => Op | null;
      /** a `comp` op named a block type that is not registered */
      onUnknown?: (id: string, type: string) => void;
      onIssue?: (path: string, message: string) => void;
      onError?: (error: Error, phase: "mount" | "render") => void;
      /** answer actions are shown only when the host declares them */
      capabilities?: HostCapabilityManifest | null;
      onAction?: (action: ProposedAction, actionId: string) => void;
    } = {},
  ) {
    this.prose = h("div", {
      class: `iui-prose ${opts.className ?? ""}`.trim(),
    });
    host.append(this.prose);
  }

  get done() {
    return this._done;
  }

  get opCount() {
    return this._ops;
  }

  get answer(): AnswerOp | null {
    return this.envelope;
  }

  /** Feed a raw chunk of the wire format. */
  feed(chunk: string) {
    this.buf += chunk;
    let nl: number;
    while (!this._done && (nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (!line.trim()) continue;
      const op = decode(line);
      if (op) this.apply(op);
    }
    this.ctx.scrollToBottom();
  }

  /** Flush: if a partial line is stuck in the buffer, apply it. */
  end() {
    if (this._done) return;
    const rest = this.buf.trim();
    this.buf = "";
    if (rest) {
      const op = decode(rest);
      if (op) this.apply(op);
    }
    this.renderActions();
    this.closeOpen();
    for (const b of this.blocks.values()) {
      try {
        b.api?.finalize?.();
      } catch (error) {
        this.opts.onError?.(toError(error), "render");
      }
    }
    this._done = true;
    this.ctx.scrollToBottom();
  }

  private closeOpen() {
    this.openBlock = null;
    this.openBlockId = null;
    this.openMd = "";
  }

  private markSlot(el: HTMLElement, id: string | undefined, kind: "op" | "comp" | "action") {
    if (!id) return;
    const names = slotNames(this.envelope, id, kind);
    if (!names.length) return;
    el.dataset.iuiSlot = names.join(" ");
    el.dataset.iuiSlotKind = kind;
    el.dataset.iuiSlotId = id;
  }

  private open(lvl: 0 | 2 | 3 | 4, id?: string) {
    this.closeOpen();
    const tag = lvl ? (`h${lvl}` as const) : "p";
    const el = document.createElement(tag);
    this.prose.append(el);
    this.openBlock = el;
    this.openBlockId = id ?? null;
    this.openMd = "";
    this.markSlot(el, id, "op");
    return el;
  }

  private apply(raw: Op) {
    if (this._done) return;
    this._seen++;
    const gated = this.opts.beforeApply ? this.opts.beforeApply(raw) : raw;
    if (!gated) return;
    this._ops++;
    try {
      this.dispatch(gated);
    } catch (error) {
      this.opts.onError?.(toError(error), "render");
    }
  }

  private dispatch(op: Op) {
    switch (op.t) {
      case "answer": {
        if (this._seen !== 1 || this.envelope) {
          this.opts.onIssue?.("t", "answer must be the first op and may appear only once");
          break;
        }
        this.envelope = op;
        this.i18n = createI18n({
          locale: op.locale,
          timeZone: op.timeZone,
          currency: op.currency,
          units: op.units,
        });
        this.ctx.i18n = this.i18n;
        this.ctx.locale = this.i18n.locale;
        this.ctx.timeZone = this.i18n.timeZone;
        this.ctx.t = this.i18n.t;
        break;
      }
      case "model": {
        const el = h("div", { class: "iui-model-note", text: op.v });
        el.style.display = "none";
        this.prose.append(el);
        break;
      }
      case "p": {
        this.open(op.lvl ?? 0, op.id);
        break;
      }
      case "md": {
        if (op.id && (!this.openBlock || this.openBlockId !== op.id)) {
          this.open(0, op.id);
        } else if (!this.openBlock) {
          this.open(0);
        }
        this.openMd += op.v;
        this.openBlock = renderBlock(this.openBlock!, this.openMd, {
          allowList: true,
        });
        break;
      }
      case "table": {
        this.closeOpen();
        const table = h("table");
        const thead = h("thead");
        const trh = h("tr");
        for (const cell of op.head)
          trh.append(h("th", { scope: "col", text: cell }));
        thead.append(trh);
        const tbody = h("tbody");
        for (const row of op.rows) {
          const tr = h("tr");
          for (const cell of row) {
            const td = h("td");
            append(td, [renderInline(cell)]);
            tr.append(td);
          }
          tbody.append(tr);
        }
        table.append(thead, tbody);
        this.markSlot(table, op.id, "op");
        this.prose.append(table);
        break;
      }
      case "comp": {
        this.closeOpen();
        if (this.blocks.has(op.id)) {
          this.opts.onIssue?.("id", `duplicate component id "${op.id}"`);
          break;
        }
        let mounted: ReturnType<typeof mountBlock>;
        try {
          mounted = mountBlock(op.type, op.props ?? {}, this.ctx, op.id);
        } catch (error) {
          this.opts.onError?.(toError(error), "mount");
          break;
        }
        if (!mounted) {
          this.opts.onUnknown?.(op.id, op.type);
          break;
        }
        this.markSlot(mounted.el, op.id, "comp");
        this.prose.append(mounted.el);
        this.blocks.set(op.id, mounted);
        if (this.ctx.animate !== false) {
          mounted.el.animate?.(
            [
              { opacity: 0, transform: "translateY(6px)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 260, easing: "cubic-bezier(.2,.7,.3,1)" },
          );
        }
        break;
      }
      case "set": {
        const b = this.blocks.get(op.id);
        if (!b) {
          this.opts.onIssue?.("id", `set targets unknown component "${op.id}"`);
          break;
        }
        b.api?.set?.(op.path, op.v);
        break;
      }
      case "ask": {
        this.closeOpen();
        const wrap = h("div", { class: "iui-actions" });
        for (const label of op.v) {
          const btn = h("button", {
            class: "iui-action",
            type: "button",
            text: label,
            onclick: () => this.ctx.onPrompt(label),
          });
          wrap.append(btn);
        }
        this.prose.append(wrap);
        break;
      }
      case "done": {
        this.end();
        break;
      }
    }
  }

  /**
   * Answer actions are proposals. They render only when the host manifest
   * declares the action; execution stays in the host action runtime.
   */
  private renderActions() {
    if (this.actionsRendered || !this.envelope?.actions?.length) return;
    this.actionsRendered = true;
    const wrap = h("div", { class: "iui-answer-actions" });
    for (const action of this.envelope.actions) {
      const descriptor = findAction(this.opts.capabilities, action.name);
      if (!descriptor || !isP0Risk(descriptor.risk)) continue;
      const label = action.confirmHint?.trim() || descriptor.description || action.name;
      const button = h("button", {
        class: "iui-answer-action",
        type: "button",
        text: label,
        "data-action-name": action.name,
        "data-risk": descriptor.risk,
        ...(descriptor.requiresConfirmation ? { "data-confirm": "true" } : {}),
      }) as HTMLButtonElement;
      if (slotNames(this.envelope, action.id, "action").includes("primaryAction")) {
        this.markSlot(button, action.id, "action");
      }
      button.addEventListener("click", () => {
        if (descriptor.requiresConfirmation) {
          this.openConfirmation(action, descriptor.description || label, () => {
            this.opts.onAction?.(action, action.id);
          });
        } else {
          this.opts.onAction?.(action, action.id);
        }
      });
      wrap.append(button);
    }
    if (wrap.childElementCount) this.prose.append(wrap);
  }

  private openConfirmation(action: ProposedAction, description: string, onConfirm: () => void) {
    const dialog = h("dialog", { class: "iui-confirm-dialog" }) as HTMLDialogElement;
    const title = h("h4", { text: this.i18n.t("confirmAction") });
    const body = h("p", { text: description });
    const buttons = h("div", { class: "iui-confirm-actions" });
    const cancel = h("button", {
      type: "button",
      class: "iui-action",
      text: this.i18n.t("cancel"),
    });
    const confirm = h("button", {
      type: "button",
      class: "iui-answer-action",
      text: this.i18n.t("confirm"),
      "data-action-name": action.name,
      "data-risk": "reversible",
    });
    buttons.append(cancel, confirm);
    dialog.append(title, body, buttons);
    cancel.addEventListener("click", () => dialog.close());
    confirm.addEventListener("click", () => {
      dialog.close();
      onConfirm();
    });
    dialog.addEventListener("close", () => dialog.remove());
    this.prose.append(dialog);
    dialog.showModal();
    confirm.focus();
  }
}
