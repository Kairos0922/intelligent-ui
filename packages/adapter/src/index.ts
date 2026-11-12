import {
  createIntelligentUI,
  type Answer,
  type ConnectOptions,
  type HostCapabilityManifest,
  type IntelligentUI,
  type IntelligentUIOptions,
  type IuiAnswerAction,
  type IuiEvent,
  type Op,
  type RiskLevel,
  type StreamSource,
  type ThemeMode,
} from "@intelligent-ui/core";
import { formatIuiAction, type IuiActionEnvelope } from "@intelligent-ui/core/agent";

/** A block interaction as delivered by the core runtime. */
export type IuiBlockEvent = Extract<IuiEvent, { type: "block" }>;

/** An answer-level action proposal delivered by the core runtime. */
export type IuiAnswerActionEvent = IuiAnswerAction;

/** Everything a host may need to send back to its agent. */
export type IuiHostAction =
  | { kind: "prompt"; text: string; answerId?: string }
  | { kind: "block"; envelope: IuiActionEnvelope }
  | {
      kind: "action";
      answerId?: string;
      actionId: string;
      name: string;
      args?: Record<string, unknown>;
      riskHint?: RiskLevel;
    };

/**
 * Which block interactions should be forwarded to the agent.
 *
 * - `prompt` — only suggestion chips / form CTAs (raw user prompts)
 * - `agent`  — prompts plus meaningful selection/navigation actions (default)
 * - `all`    — every block event, including local checkboxes and copy buttons
 * - function — custom policy
 *
 * When a host capability manifest is provided, any action that the manifest
 * declares is forwarded under the `agent` policy. This is how travel actions
 * such as `refresh` or `wallet` reach the host without changing the default
 * local-state policy.
 *
 * `submit` is deliberately not in `agent`: forms already emit a prompt, and
 * forwarding both would send the same interaction twice.
 */
export type IuiActionPolicy = "prompt" | "agent" | "all" | ((event: IuiBlockEvent) => boolean);

const AGENT_ACTIONS = new Set(["select", "step", "view", "filter"]);

export function shouldSendAction(
  event: IuiBlockEvent,
  policy: IuiActionPolicy = "agent",
  capabilities?: HostCapabilityManifest | null,
): boolean {
  if (typeof policy === "function") return policy(event);
  if (policy === "all") return true;
  if (policy === "prompt") return false;
  if (capabilities?.actions.some((action) => action.name === event.name)) return true;
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

/** Normalise an answer-level action proposal into a host-neutral action. */
export function actionFromAnswerEvent(event: IuiAnswerActionEvent): IuiHostAction {
  return {
    kind: "action",
    answerId: event.answerId,
    actionId: event.actionId,
    name: event.name,
    ...(event.args ? { args: event.args } : {}),
    ...(event.riskHint ? { riskHint: event.riskHint } : {}),
  };
}

/** Turn any host action into the text a host should send to its agent. */
export function formatIuiActionMessage(action: IuiHostAction): string {
  if (action.kind === "prompt") return action.text;
  if (action.kind === "action") {
    return formatIuiAction({
      action: action.name,
      answerId: action.answerId,
      payload: action.args,
    });
  }
  return formatIuiAction(action.envelope);
}

/** Alias for call sites that already know they are formatting an action. */
export const formatAction = formatIuiActionMessage;

export interface IuiHostOptions extends Omit<IntelligentUIOptions, "onPrompt" | "onEvent" | "onAction"> {
  /** called for prompts and (depending on policy) block interactions */
  onAction?: (action: IuiHostAction) => void | Promise<void>;
  /** called when a host action handler throws or rejects */
  onActionError?: (error: Error, action: IuiHostAction) => void;
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
  const { onAction, onActionError, onEvent, actionPolicy = "agent", ...coreOptions } = options;

  const reportActionError = (error: unknown, action: IuiHostAction) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    try {
      onActionError?.(normalized, action);
    } catch (nested) {
      console.warn("[iui] onActionError failed", nested);
    }
    console.warn("[iui] onAction failed", normalized);
  };

  const emitAction = (action: IuiHostAction) => {
    if (!onAction) return;
    try {
      const result = onAction(action);
      if (result && typeof (result as Promise<void>).catch === "function") {
        void (result as Promise<void>).catch((error) => reportActionError(error, action));
      }
    } catch (error) {
      reportActionError(error, action);
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
      if (event.type === "block" && shouldSendAction(event, actionPolicy, coreOptions.capabilities)) {
        emitAction(actionFromBlockEvent(event));
      } else if (event.type === "action") {
        emitAction(actionFromAnswerEvent(event));
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
