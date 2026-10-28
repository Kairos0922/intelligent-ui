export interface Ctx {
  /** keep the conversation pinned to the newest content */
  scrollToBottom(): void;
  /** a follow-up suggestion was clicked (or a form CTA submitted) */
  onPrompt(prompt: string): void;
  /** chat surface is in dark mode */
  isDark(): boolean;
  /** register a cleanup for pending work */
  registerCleanup(fn: () => void): void;
  /** mount blocks with the fade/rise entry animation (off for instant replay) */
  animate?: boolean;
  /** report an interaction inside a block to the host (SDK event bridge) */
  emit?(name: string, detail?: Record<string, unknown>): void;
}

export interface BlockApi {
  /** apply a `set` op coming from the stream */
  set?(path: string, v: unknown): void;
  /** stream finished for this block */
  finalize?(): void;
}

export type Mount = (
  el: HTMLElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: any,
  ctx: Ctx,
) => BlockApi | void;

const registry = new Map<string, Mount>();

export function defineBlock(type: string, mount: Mount) {
  registry.set(type, mount);
}

export function hasBlock(type: string): boolean {
  return registry.has(type);
}

export function blockTypes(): ReadonlySet<string> {
  return new Set(registry.keys());
}

const UNSAFE_PATH = new Set(["__proto__", "constructor", "prototype"]);

function clonePlain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (!UNSAFE_PATH.has(key)) out[key] = clonePlain(child);
    }
    return out;
  }
  return value;
}

function patchPath(target: Record<string, unknown>, path: string, value: unknown): boolean {
  const clean = path.replace(/^props\./, "");
  const parts = clean.split(".").filter(Boolean);
  if (!parts.length || parts.some((part) => UNSAFE_PATH.has(part))) return false;
  let node: unknown = target;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const last = index === parts.length - 1;
    if (Array.isArray(node)) {
      const position = /^\d+$/.test(part) ? Number(part) : -1;
      if (position < 0 || position > node.length) return false;
      if (last) node[position] = clonePlain(value);
      else {
        if (!node[position] || typeof node[position] !== "object") {
          node[position] = /^\d+$/.test(parts[index + 1]) ? [] : {};
        }
        node = node[position];
      }
      continue;
    }
    if (!node || typeof node !== "object") return false;
    const record = node as Record<string, unknown>;
    if (last) record[part] = clonePlain(value);
    else {
      if (!record[part] || typeof record[part] !== "object") {
        record[part] = /^\d+$/.test(parts[index + 1]) ? [] : {};
      }
      node = record[part];
    }
  }
  return true;
}

export function mountBlock(
  type: string,
  props: Record<string, any>,
  ctx: Ctx,
  id?: string,
): { el: HTMLElement; api: BlockApi } | null {
  const mount = registry.get(type);
  if (!mount) {
    console.warn(`[iui] unknown block type: ${type}`);
    return null;
  }
  const el = document.createElement("div");
  el.className = "iui-block";
  el.dataset.block = type;
  if (id) el.dataset.blockId = id;
  const scoped: Ctx = ctx.emit
    ? {
        ...ctx,
        emit: (name, detail) =>
          ctx.emit!(name, { blockId: id, blockType: type, ...detail }),
      }
    : ctx;

  let currentProps = (clonePlain(props ?? {}) ?? {}) as Record<string, unknown>;
  let current = mount(el, currentProps, scoped) || {};
  const api: BlockApi = {
    set(path, value) {
      if (current.set) {
        current.set(path, value);
        return;
      }
      const next = clonePlain(currentProps) as Record<string, unknown>;
      if (!patchPath(next, path, value)) return;
      current.finalize?.();
      currentProps = next;
      el.replaceChildren();
      current = mount(el, currentProps, scoped) || {};
    },
    finalize() {
      current.finalize?.();
    },
  };
  return { el, api };
}
