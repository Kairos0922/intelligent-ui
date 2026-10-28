import "../styles/sdk.css";
import "../iui/components/index";

import { disposeLightboxes } from "../iui/components/lightbox";
import { Compiler } from "../iui/compiler";
import type { Op } from "../iui/protocol";
import {
  blockTypes,
  defineBlock,
  hasBlock,
  type Ctx,
  type Mount,
} from "../iui/registry";
import { BLOCK_CATALOG, BLOCK_TYPES, registerBlockSpec } from "./catalog";
import { connectSource, type ConnectOptions, type StreamSource } from "./transport";
import {
  VALIDATION_LIMITS,
  validateOp,
  type ValidationIssue,
} from "./validate";

export const VERSION = "0.2.2";

export type ThemeMode = "light" | "dark" | "auto" | "inherit";

export type IuiEvent =
  | { type: "answer-start"; answerId: string }
  | { type: "answer-end"; answerId: string; ops: number; ms: number }
  | { type: "prompt"; answerId: string; prompt: string }
  | {
      type: "block";
      answerId: string;
      name: string;
      detail: Record<string, unknown>;
    }
  | { type: "unknown-block"; answerId: string; id: string; blockType: string }
  | { type: "validation"; answerId: string; issues: ValidationIssue[] }
  | { type: "error"; answerId: string | null; phase: "stream" | "mount" | "render"; error: Error };

export interface IntelligentUIOptions {
  container: HTMLElement;
  /** colour scheme: follow the host (`auto`), force light/dark, or inherit CSS */
  theme?: ThemeMode;
  /**
   * ancestor selector that marks a dark host when `theme` is `auto` or
   * `inherit` (default: `.dark, [data-theme='dark']`). Host adapters whose
   * shell uses another attribute, such as DSH's `[data-ds-dark-theme]`,
   * pass it here.
   */
  darkSelector?: string;
  /** CSS variable overrides, e.g. { "--iui-font": "Inter, sans-serif" } */
  tokens?: Record<string, string>;
  className?: string;
  /** auto-scroll the nearest scrollable ancestor (default), the window, or nothing */
  scroll?: "container" | "window" | "none";
  /** entry animation for blocks (default true; reduced-motion always disables) */
  animate?: boolean;
  /** validate + sanitize model output at the compiler boundary (default true) */
  sanitize?: boolean;
  /** accessible label for the answer log */
  ariaLabel?: string;
  /** suggestion chip / form CTA clicked */
  onPrompt?: (prompt: string, ui: IntelligentUI) => void;
  /** all SDK events (block interactions, lifecycle, validation) */
  onEvent?: (event: IuiEvent) => void;
  onError?: (error: Error, event: IuiEvent & { type: "error" }) => void;
}

export interface Answer {
  readonly id: string;
  readonly el: HTMLElement;
  readonly done: boolean;
  readonly opCount: number;
  /** feed raw IUI-1 text (may split mid-line) */
  write(chunk: string | Uint8Array): void;
  /** flush the final partial line and finalize blocks */
  end(): void;
}

interface Budget {
  ops: number;
  bytes: number;
  blocked: boolean;
}

export interface IntelligentUI {
  readonly el: HTMLElement;
  readonly answers: readonly Answer[];
  /** start a new assistant answer region */
  begin(): Answer;
  /** write to the current answer (creates one on demand) */
  ingest(chunk: string | Uint8Array): void;
  /** finalize the current answer (no-op when none is open) */
  end(): void;
  /** apply one op or a list of ops (validated in sanitize mode) */
  apply(op: Op | Op[]): void;
  /** stream a URL / Response / ReadableStream / AsyncIterable into a new answer */
  connect(source: StreamSource, options?: ConnectOptions): Promise<Answer>;
  /** abort the in-flight connect(), if any */
  abort(): void;
  reset(): void;
  setTheme(mode: ThemeMode): void;
  /** replace all custom tokens when `replace` is true */
  setTokens(tokens: Record<string, string>, replace?: boolean): void;
  /** register a custom block type for this page (global registry) */
  registerBlock(type: string, mount: Mount): IntelligentUI;
  readonly catalog: typeof BLOCK_CATALOG;
  destroy(): void;
}

let answerSeq = 0;

class AnswerImpl implements Answer {
  readonly id: string;
  readonly el: HTMLElement;
  readonly startedAt = performance.now();
  private compiler: Compiler;
  private cleanups: Array<() => void> = [];
  private budget: Budget = { ops: 0, bytes: 0, blocked: false };
  private _done = false;
  private decoder = new TextDecoder();

  constructor(
    private ui: IntelligentUIInternal,
    host: HTMLElement,
    id: string,
  ) {
    this.id = id;
    this.el = host;
    const ctx = ui.makeCtx(id, this.cleanups);
    this.compiler = new Compiler(ctx, host, {
      beforeApply: (op) => ui.validate(op, id, this.budget),
      onUnknown: (opId, type) => ui.emit({ type: "unknown-block", answerId: id, id: opId, blockType: type }),
      onIssue: (path, message) =>
        ui.emit({ type: "validation", answerId: id, issues: [{ path, message }] }),
      onError: (error, phase) => ui.reportError(id, phase, error),
    });
    ui.emit({ type: "answer-start", answerId: id });
  }

  get done() {
    return this._done;
  }

  get opCount() {
    return this.compiler.opCount;
  }

  write(chunk: string | Uint8Array): void {
    if (this._done) return;
    const text = typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    if (!text) return;
    this.compiler.feed(text);
    if (this.compiler.done) this.finish();
  }

  end(): void {
    if (this._done) return;
    const tail = this.decoder.decode();
    if (tail) {
      this.compiler.feed(tail);
      if (this.compiler.done) return this.finish();
    }
    this.compiler.end();
    this.finish();
  }

  private finish() {
    if (this._done) return;
    this._done = true;
    this.ui.emit({
      type: "answer-end",
      answerId: this.id,
      ops: this.compiler.opCount,
      ms: Math.round(performance.now() - this.startedAt),
    });
  }

  /** @internal */
  dispose() {
    for (const fn of this.cleanups) {
      try {
        fn();
      } catch (err) {
        console.warn("[iui] cleanup failed", err);
      }
    }
    this.cleanups = [];
    for (const dialog of this.el.querySelectorAll("dialog")) {
      if (dialog.open) dialog.close();
    }
    this.el.remove();
  }
}

class IntelligentUIInternal implements IntelligentUI {
  readonly el: HTMLElement;
  private _answers: AnswerImpl[] = [];
  private current: AnswerImpl | null = null;
  private opts: IntelligentUIOptions;
  private themeMode: ThemeMode;
  private dark = false;
  private controller: AbortController | null = null;
  private mql: MediaQueryList | null = null;
  private mqlListener: ((e: MediaQueryListEvent) => void) | null = null;
  private tokenKeys = new Set<string>();
  private scrollQueued = false;
  private pinNext = false;
  private destroyed = false;

  constructor(options: IntelligentUIOptions) {
    if (!options?.container) throw new Error("[iui] createIntelligentUI requires a container element");
    this.opts = options;
    this.el = document.createElement("div");
    this.el.className = ["iui-theme", "iui-root", options.className ?? ""].filter(Boolean).join(" ");
    this.el.dataset.iuiVersion = VERSION;
    this.el.setAttribute("role", "log");
    this.el.setAttribute("aria-live", "polite");
    this.el.setAttribute("aria-label", options.ariaLabel ?? "Assistant response");
    options.container.append(this.el);

    this.themeMode = options.theme ?? "auto";
    this.applyTheme(this.themeMode);
    if (options.tokens) this.setTokens(options.tokens);
  }

  get answers(): readonly Answer[] {
    return this._answers;
  }

  get catalog() {
    return BLOCK_CATALOG;
  }

  begin(): Answer {
    if (this.destroyed) throw new Error("[iui] cannot begin an answer on a destroyed instance");
    if (this.current && !this.current.done) this.current.end();
    const id = `a${++answerSeq}`;
    const host = document.createElement("div");
    host.className = "iui-answer";
    host.dataset.answerId = id;
    this.el.append(host);
    const answer = new AnswerImpl(this, host, id);
    this._answers.push(answer);
    this.current = answer;
    this.pinNext = true;
    return answer;
  }

  ingest(chunk: string | Uint8Array): void {
    const current = !this.current || this.current.done ? this.begin() : this.current;
    current.write(chunk);
  }

  end(): void {
    this.current?.end();
  }

  apply(op: Op | Op[]): void {
    const ops = Array.isArray(op) ? op : [op];
    this.ingest(ops.map((o) => JSON.stringify(o)).join("\n") + "\n");
  }

  async connect(source: StreamSource, options: ConnectOptions = {}): Promise<Answer> {
    this.abort();
    const controller = new AbortController();
    this.controller = controller;
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const answer = this.begin();
    try {
      await connectSource(source, (text) => answer.write(text), {
        ...options,
        signal: controller.signal,
      });
      if (!this.destroyed) answer.end();
    } catch (err) {
      if (!this.destroyed && !controller.signal.aborted) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emit({ type: "error", answerId: answer.id, phase: "stream", error });
        this.opts.onError?.(error, { type: "error", answerId: answer.id, phase: "stream", error });
      }
      if (!this.destroyed) answer.end();
    } finally {
      if (this.controller === controller) this.controller = null;
    }
    return answer;
  }

  abort(): void {
    this.controller?.abort();
    this.controller = null;
  }

  reset(): void {
    this.abort();
    for (const answer of this._answers) answer.dispose();
    disposeLightboxes(this.el);
    this._answers = [];
    this.current = null;
    this.pinNext = false;
  }

  destroy(): void {
    this.destroyed = true;
    this.reset();
    if (this.mql && this.mqlListener) {
      this.mql.removeEventListener("change", this.mqlListener);
      this.mql = null;
      this.mqlListener = null;
    }
    for (const key of this.tokenKeys) this.el.style.removeProperty(key);
    this.tokenKeys.clear();
    this.el.remove();
  }

  setTheme(mode: ThemeMode): void {
    this.themeMode = mode;
    this.applyTheme(mode);
  }

  private applyTheme(mode: ThemeMode) {
    this.dark = mode === "inherit"
      ? this.hostIsDark()
      : mode === "dark" || (mode === "auto" && this.detectDark());
    this.el.dataset.theme = this.dark ? "dark" : "light";

    if (mode === "auto") {
      if (!this.mql) {
        this.mql = window.matchMedia("(prefers-color-scheme: dark)");
        this.mqlListener = () => {
          this.dark = this.detectDark();
          if (this.themeMode === "auto") this.el.dataset.theme = this.dark ? "dark" : "light";
        };
        this.mql.addEventListener("change", this.mqlListener);
      }
    } else if (this.mql && this.mqlListener) {
      this.mql.removeEventListener("change", this.mqlListener);
      this.mql = null;
      this.mqlListener = null;
    }
  }

  private hostIsDark(): boolean {
    const selector = this.opts.darkSelector ?? ".dark, [data-theme='dark']";
    try {
      return !!this.el.parentElement?.closest(selector);
    } catch {
      console.warn(`[iui] invalid darkSelector: ${selector}`);
      return false;
    }
  }

  private detectDark(): boolean {
    if (this.hostIsDark()) return true;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  }

  setTokens(tokens: Record<string, string>, replace = false): void {
    if (replace) {
      for (const key of this.tokenKeys) this.el.style.removeProperty(key);
      this.tokenKeys.clear();
    }
    for (const [rawKey, value] of Object.entries(tokens)) {
      const key = rawKey.startsWith("--") ? rawKey : `--iui-${rawKey}`;
      this.el.style.setProperty(key, value);
      this.tokenKeys.add(key);
    }
  }

  registerBlock(type: string, mount: Mount): IntelligentUI {
    defineBlock(type, mount);
    return this;
  }

  /** @internal */
  emit(event: IuiEvent) {
    try {
      this.opts.onEvent?.(event);
    } catch (err) {
      console.warn("[iui] onEvent listener failed", err);
    }
  }

  /** @internal */
  reportError(answerId: string | null, phase: "stream" | "mount" | "render", error: Error) {
    const event = { type: "error" as const, answerId, phase, error };
    this.emit(event);
    this.opts.onError?.(error, event);
  }

  /** @internal compiler gate */
  validate(op: Op, answerId: string, budget?: Budget): Op | null {
    if (this.opts.sanitize === false) return op;
    if (op.t === "comp" && !hasBlock(op.type) && !BLOCK_TYPES.has(op.type)) {
      this.emit({ type: "unknown-block", answerId, id: op.id, blockType: op.type });
      return null;
    }
    const blocks = new Set([...BLOCK_TYPES, ...blockTypes()]);
    const result = validateOp(op, { sanitize: true, blocks });
    if (result.issues.length) {
      this.emit({ type: "validation", answerId, issues: result.issues });
    }
    if (!result.op || !budget) return result.op;
    if (budget.ops >= VALIDATION_LIMITS.maxOps) {
      if (!budget.blocked) {
        budget.blocked = true;
        this.emit({
          type: "validation",
          answerId,
          issues: [{ path: "$", message: `op limit (${VALIDATION_LIMITS.maxOps}) reached` }],
        });
      }
      return null;
    }
    if (budget.bytes + result.bytes > VALIDATION_LIMITS.maxTotalBytes) {
      if (!budget.blocked) {
        budget.blocked = true;
        this.emit({
          type: "validation",
          answerId,
          issues: [{
            path: "$",
            message: `answer exceeds ${VALIDATION_LIMITS.maxTotalBytes} bytes`,
          }],
        });
      }
      return null;
    }
    budget.ops += 1;
    budget.bytes += result.bytes;
    return result.op;
  }

  /** @internal */
  makeCtx(answerId: string, cleanups: Array<() => void>): Ctx {
    return {
      scrollToBottom: () => this.scheduleScroll(),
      onPrompt: (prompt) => {
        this.emit({ type: "prompt", answerId, prompt });
        this.opts.onPrompt?.(prompt, this);
      },
      isDark: () => this.dark,
      registerCleanup: (fn) => cleanups.push(fn),
      animate:
        this.opts.animate !== false &&
        !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
      emit: (name, detail) => this.emit({ type: "block", answerId, name, detail: detail ?? {} }),
    };
  }

  private scheduleScroll() {
    const mode = this.opts.scroll ?? "container";
    if (mode === "none" || this.scrollQueued) return;
    this.scrollQueued = true;
    requestAnimationFrame(() => {
      this.scrollQueued = false;
      if (mode === "window") {
        const doc = document.documentElement;
        const near = window.innerHeight + window.scrollY >= doc.scrollHeight - 240;
        if (near || this.pinNext) {
          window.scrollTo({ top: doc.scrollHeight, behavior: "auto" });
          this.pinNext = false;
        }
        return;
      }
      let node = this.el.parentElement;
      while (node) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2) {
          const near =
            node.scrollHeight - node.scrollTop - node.clientHeight < 240;
          if (near || this.pinNext) {
            node.scrollTop = node.scrollHeight;
            this.pinNext = false;
          }
          return;
        }
        node = node.parentElement;
      }
      this.pinNext = false;
    });
  }
}

/**
 * Mount an Intelligent UI answer surface.
 *
 * The returned object owns only the content inside `container`; the host keeps
 * its own composer, headers, user bubbles and routing. One instance can render
 * many consecutive answers (`begin()` / `ingest()` / `connect()`).
 */
export function createIntelligentUI(options: IntelligentUIOptions): IntelligentUI {
  return new IntelligentUIInternal(options);
}

/** Serialize ops to the IUI-1 NDJSON wire format. */
export function encodeOps(ops: Op[]): string {
  return ops.map((op) => JSON.stringify(op)).join("\n") + "\n";
}

export { defineBlock, BLOCK_CATALOG, registerBlockSpec };
export type { Op, Mount, ValidationIssue };
export type { ConnectOptions, StreamSource } from "./transport";
