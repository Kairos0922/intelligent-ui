import {
  createIntelligentUI,
  type Answer,
  type ConnectOptions,
  type IntelligentUI,
  type IntelligentUIOptions,
  type IuiEvent,
  type Op,
  type StreamSource,
  type ThemeMode,
} from "@intelligent-ui/core";
import { formatIuiAction, type IuiActionEnvelope } from "@intelligent-ui/core/agent";

/** A block interaction as delivered by the core runtime. */
export type IuiBlockEvent = Extract<IuiEvent, { type: "block" }>;

/** Everything a host may need to send back to its agent. */
export type IuiHostAction =
  | { kind: "prompt"; text: string; answerId?: string }
  | { kind: "block"; envelope: IuiActionEnvelope };

/**
 * Which block interactions should be forwarded to the agent.
 *
 * - `prompt` — only suggestion chips / form CTAs (raw user prompts)
 * - `agent`  — prompts plus meaningful selection/navigation actions (default)
 * - `all`    — every block event, including local checkboxes and copy buttons
 * - function — custom policy
 *
 * `submit` is deliberately not in `agent`: forms already emit a prompt, and
 * forwarding both would send the same interaction twice.
 */
export type IuiActionPolicy = "prompt" | "agent" | "all" | ((event: IuiBlockEvent) => boolean);

const AGENT_ACTIONS = new Set(["select", "step", "view", "filter"]);

export function shouldSendAction(event: IuiBlockEvent, policy: IuiActionPolicy = "agent"): boolean {
  if (typeof policy === "function") return policy(event);
  if (policy === "all") return true;
  if (policy === "prompt") return false;
  return AGENT_ACTIONS.has(event.name);
}

/** Normalise a core block event into a host-neutral action. */
export function actionFromBlockEvent(event: IuiBlockEvent): IuiHostAction {
  const { blockId, blockType, ...payload } = event.detail;
  return {
    kind: "block",
    envelope: {
      action: event.name,
      blockId: blockId === undefined ? undefined : String(blockId),
      blockType: blockType === undefined ? undefined : String(blockType),
      answerId: event.answerId,
      payload,
    },
  };
}

/** Turn any host action into the text a host should send to its agent. */
export function formatIuiActionMessage(action: IuiHostAction): string {
  return action.kind === "prompt" ? action.text : formatIuiAction(action.envelope);
}

/** Alias for call sites that already know they are formatting an action. */
export const formatAction = formatIuiActionMessage;

export interface IuiHostOptions extends Omit<IntelligentUIOptions, "onPrompt" | "onEvent"> {
  /** called for prompts and (depending on policy) block interactions */
  onAction?: (action: IuiHostAction) => void | Promise<void>;
  /** observe every core event, including lifecycle and validation */
  onEvent?: (event: IuiEvent) => void;
  actionPolicy?: IuiActionPolicy;
}

export interface IuiHost {
  /** escape hatch: full core runtime */
  readonly ui: IntelligentUI;
  readonly el: HTMLElement;
  readonly answers: readonly Answer[];
  begin(): Answer;
  ingest(chunk: string | Uint8Array): void;
  end(): void;
  apply(ops: Op | Op[]): void;
  /** replace the answer surface with a complete tool result */
  show(ops: Op[]): void;
  connect(source: StreamSource, options?: ConnectOptions): Promise<Answer>;
  reset(): void;
  setTheme(mode: ThemeMode): void;
  setTokens(tokens: Record<string, string>, replace?: boolean): void;
  destroy(): void;
}

/**
 * Mount the core runtime and wire its interaction events to a host callback.
 *
 * This is intentionally the only abstraction above the DOM: an adapter decides
 * *where* actions go, while this layer decides *what* an action looks like.
 */
export function createIuiHost(options: IuiHostOptions): IuiHost {
  const { onAction, onEvent, actionPolicy = "agent", ...coreOptions } = options;

  const emitAction = (action: IuiHostAction) => {
    if (!onAction) return;
    try {
      const result = onAction(action);
      if (result && typeof (result as Promise<void>).catch === "function") {
        void (result as Promise<void>).catch((error) => {
          console.warn("[iui] onAction failed", error);
        });
      }
    } catch (error) {
      console.warn("[iui] onAction failed", error);
    }
  };

  const ui = createIntelligentUI({
    ...coreOptions,
    onPrompt: (prompt, instance) => {
      const answerId = instance.answers.at(-1)?.id;
      emitAction({ kind: "prompt", text: prompt, answerId });
    },
    onEvent: (event) => {
      try {
        onEvent?.(event);
      } catch (error) {
        console.warn("[iui] onEvent failed", error);
      }
      if (event.type === "block" && shouldSendAction(event, actionPolicy)) {
        emitAction(actionFromBlockEvent(event));
      }
    },
  });

  return {
    ui,
    el: ui.el,
    get answers() {
      return ui.answers;
    },
    begin: () => ui.begin(),
    ingest: (chunk) => ui.ingest(chunk),
    end: () => ui.end(),
    apply: (ops) => ui.apply(ops),
    show: (ops) => {
      ui.reset();
      ui.apply(ops);
      ui.end();
    },
    connect: (source, connectOptions) => ui.connect(source, connectOptions),
    reset: () => ui.reset(),
    setTheme: (mode) => ui.setTheme(mode),
    setTokens: (tokens, replace) => ui.setTokens(tokens, replace),
    destroy: () => ui.destroy(),
  };
}
