/* =========================================================================
   Player — replays an op stream into the compiler with realistic pacing.
   `md` ops are broken into word-sized chunks so prose types out the way a
   real stream does; structural ops get a small beat so blocks "assemble".
   ========================================================================= */

import { Compiler } from "./compiler";
import { Op, encode } from "./protocol";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Split markdown into small chunks without breaking markers (**bold**) or
 *  links. Chunks are re-encoded as their own md ops. */
export function chunkMarkdown(text: string, words = 4): string[] {
  const out: string[] = [];
  let cur = "";
  let curWords = 0;
  let stars = 0;
  let brackets = 0;

  const flush = () => {
    if (cur) out.push(cur);
    cur = "";
    curWords = 0;
  };

  for (const ch of text) {
    cur += ch;
    if (ch === "*") stars ^= 1;
    if (ch === "[") brackets++;
    if (ch === "]") brackets = Math.max(0, brackets - 1);
    if (ch === " " && stars === 0 && brackets === 0) {
      curWords++;
      if (curWords >= words) flush();
    }
  }
  flush();
  return out;
}

export class Player {
  private skipped = false;
  private _ended = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private ops: Op[],
    private compiler: Compiler,
    private opts: {
      /** chars per second for streaming prose */
      cps?: number;
      onProgress?: () => void;
      onEnd?: () => void;
    } = {},
  ) {}

  get ended() {
    return this._ended;
  }

  /** Jump to the end of the answer. */
  skip() {
    this.skipped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  async start(): Promise<void> {
    for (const op of this.ops) {
      if (this._ended) break;
      if (op.t === "md" && !this.skipped) {
        const chunks = chunkMarkdown(op.v);
        for (const c of chunks) {
          if (this.skipped) break;
          const ms = (c.length / (this.opts.cps ?? 1100)) * 1000;
          if (ms > 0 && !this.skipped) await this.pause(ms);
          this.compiler.feed(encode([{ t: "md", v: c }]));
          this.opts.onProgress?.();
        }
        continue;
      }
      if (!this.skipped) await this.pause(this.delayFor(op));
      this.feedOp(op);
      this.opts.onProgress?.();
    }
    if (!this._ended) this.finish();
  }

  private feedOp(op: Op) {
    // simulate network bytes: sometimes hand the compiler a half line
    const wire = encode([op]);
    if (op.t === "md" || wire.length < 24) {
      this.compiler.feed(wire);
      return;
    }
    const cut = Math.max(1, Math.floor(wire.length * 0.55));
    this.compiler.feed(wire.slice(0, cut));
    this.compiler.feed(wire.slice(cut));
  }

  private delayFor(op: Op): number {
    switch (op.t) {
      case "model":
        return 40;
      case "p":
        return op.lvl ? 140 : 80;
      case "table":
        return 160;
      case "comp":
        return 300;
      case "set":
        return 60;
      case "ask":
        return 240;
      case "done":
        return 0;
      default:
        return 60;
    }
  }

  private pause(ms: number): Promise<void> {
    if (this.skipped || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.timers.delete(t);
        resolve();
      }, ms);
      this.timers.add(t);
    });
  }

  private finish() {
    if (this._ended) return;
    this._ended = true;
    this.compiler.end();
    this.opts.onEnd?.();
  }
}
