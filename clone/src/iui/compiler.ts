import { h, append } from "./dom";
import { renderBlock, renderInline } from "./md";
import { decode, Op } from "./protocol";
import { mountBlock, BlockApi, Ctx } from "./registry";

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class Compiler {
  readonly prose: HTMLElement;
  private buf = "";
  private openBlock: HTMLElement | null = null;
  private openMd = "";
  private blocks = new Map<string, { el: HTMLElement; api: BlockApi }>();
  private _done = false;
  private _ops = 0;
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

  /** Feed a raw chunk of the wire format. */
  feed(chunk: string) {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
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
    this.openMd = "";
  }

  private open(lvl: 0 | 2 | 3 | 4) {
    this.closeOpen();
    const tag = lvl ? (`h${lvl}` as const) : "p";
    const el = document.createElement(tag);
    this.prose.append(el);
    this.openBlock = el;
    this.openMd = "";
    return el;
  }

  private apply(raw: Op) {
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
      case "model": {
        const el = h("div", { class: "iui-model-note", text: op.v });
        el.style.display = "none";
        this.prose.append(el);
        break;
      }
      case "p": {
        this.open(op.lvl ?? 0);
        break;
      }
      case "md": {
        if (!this.openBlock) this.open(0);
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
}
