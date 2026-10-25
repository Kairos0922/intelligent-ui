/* =========================================================================
   Intelligent UI wire protocol ("IUI-1")
   -------------------------------------------------------------------------
   The assistant's answer is streamed as NDJSON: one JSON op per line.
   The compiler consumes raw text chunks, buffers partial lines and applies
   each op incrementally — the same shape a real streaming UI protocol has.

   Ops:
     {"t":"model","v":"Assistant"}              answer header
     {"t":"p","lvl":2|3|4}                      start paragraph / heading
     {"t":"md","v":"...markdown..."}            append markdown to the open block
     {"t":"table","head":[...],"rows":[[...]]}  insert a table
     {"t":"comp","id":"c1","type":"...","props":{}}   mount a component
     {"t":"set","id":"c1","path":"value","v":3}       patch component state
     {"t":"ask","v":["...","..."]}              follow-up suggestion chips
     {"t":"done"}                               end of answer
   ========================================================================= */

export type Op =
  | { t: "model"; v: string }
  | { t: "p"; lvl?: 0 | 2 | 3 | 4 }
  | { t: "md"; v: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "comp"; id: string; type: string; props?: Record<string, unknown> }
  | { t: "set"; id: string; path: string; v: unknown }
  | { t: "ask"; v: string[] }
  | { t: "done" };

export function encode(ops: Op[]): string {
  return ops.map((o) => JSON.stringify(o)).join("\n") + "\n";
}

export function decode(line: string): Op | null {
  try {
    return JSON.parse(line) as Op;
  } catch {
    return null;
  }
}

/* --- scenario builders (typed sugar over the raw ops) ------------------- */

export const P = (lvl: 0 | 2 | 3 | 4 = 0): Op => ({ t: "p", lvl });
export const MD = (v: string): Op => ({ t: "md", v });
export const TABLE = (head: string[], rows: string[][]): Op => ({
  t: "table",
  head,
  rows,
});
export const COMP = (
  id: string,
  type: string,
  props: Record<string, unknown> = {},
): Op => ({ t: "comp", id, type, props });
export const SET = (id: string, path: string, v: unknown): Op => ({
  t: "set",
  id,
  path,
  v,
});
export const ASK = (v: string[]): Op => ({ t: "ask", v });
export const DONE: Op = { t: "done" };
export const MODEL = (v: string): Op => ({ t: "model", v });
