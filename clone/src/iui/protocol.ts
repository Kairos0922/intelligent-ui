import type { AnswerOp } from "./contracts";

export type Op =
  | { t: "model"; v: string }
  | { t: "p"; lvl?: 0 | 2 | 3 | 4; id?: string }
  | { t: "md"; v: string; id?: string }
  | { t: "table"; head: string[]; rows: string[][]; id?: string }
  | { t: "comp"; id: string; type: string; props?: Record<string, unknown> }
  | { t: "set"; id: string; path: string; v: unknown }
  | { t: "ask"; v: string[] }
  | AnswerOp
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

export const P = (lvl: 0 | 2 | 3 | 4 = 0, id?: string): Op => ({
  t: "p",
  lvl,
  ...(id ? { id } : {}),
});
export const MD = (v: string, id?: string): Op => ({
  t: "md",
  v,
  ...(id ? { id } : {}),
});
export const TABLE = (head: string[], rows: string[][], id?: string): Op => ({
  t: "table",
  head,
  rows,
  ...(id ? { id } : {}),
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
export const ANSWER = (answer: AnswerOp): Op => ({ ...answer });
export const DONE: Op = { t: "done" };
export const MODEL = (v: string): Op => ({ t: "model", v });
