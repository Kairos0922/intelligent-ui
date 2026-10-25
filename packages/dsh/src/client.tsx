/**
 * DeepSeek Harness client half.
 *
 * Registers a keyed `tool.call.toolview` for the wire name `render_iui`. The
 * view mounts the host-neutral adapter into a plain DOM node, maps DSH's
 * alias tokens onto the core's `--iui-*` tokens, follows DSH's dark marker,
 * and sends interactions back through the session's own prompt path.
 */
import * as React from "react";
import type { Context } from "@deepseek-ai/cordis";
import {
  createIuiHost,
  formatIuiActionMessage,
  type IuiHost,
} from "@intelligent-ui/adapter";
import type { Op } from "@intelligent-ui/core";
import { formatIuiAction } from "@intelligent-ui/core/agent";
import coreCss from "../../../clone/dist-lib/intelligent-ui.css?raw";

export const name = "intelligent-ui";

/** Services this client plugin needs before `apply` runs. */
export const inject = ["sessions", "slots"];

const TOOL_NAME = "render_iui";
const STYLE_ID = "iui-dsh-styles";

/** Map DSH's semantic alias tokens onto the core's host-neutral tokens. */
const DSH_TOKENS: Record<string, string> = {
  "--iui-bg": "transparent",
  "--iui-text": "var(--dsw-alias-label-primary)",
  "--iui-muted": "var(--dsw-alias-label-secondary)",
  "--iui-subtle": "var(--dsw-alias-label-tertiary)",
  "--iui-border": "var(--dsw-alias-border-l2)",
  "--iui-border-soft": "var(--dsw-alias-border-l1)",
  "--iui-border-strong": "var(--dsw-alias-border-l3)",
  "--iui-control-border": "var(--dsw-alias-border-l2)",
  "--iui-check-border": "var(--dsw-alias-border-l2)",
  "--iui-control-bg": "var(--dsw-alias-bg-base)",
  "--iui-surface": "var(--dsw-alias-bg-base)",
  "--iui-elevated": "var(--dsw-alias-bg-base)",
  "--iui-hover": "var(--dsw-alias-interactive-bg-hover-solid)",
  "--iui-solid": "var(--dsw-alias-label-primary)",
  "--iui-on-solid": "var(--dsw-alias-bg-base)",
  "--iui-prompt": "var(--dsw-alias-bg-base)",
  "--iui-prompt-after": "var(--dsw-alias-state-business-tertiary)",
  "--iui-chip": "var(--dsw-alias-bg-base)",
  "--iui-switcher": "var(--dsw-alias-interactive-bg-hover-solid)",
  "--iui-focus": "var(--dsw-focus-ring-color)",
  "--iui-success": "var(--dsw-alias-state-business-primary)",
  "--iui-progress": "var(--dsw-alias-state-business-primary)",
  "--iui-progress-track": "var(--dsw-alias-border-l1)",
  "--iui-completed": "var(--dsw-alias-label-tertiary)",
  "--iui-font": "var(--dsw-font-family, ui-sans-serif, -apple-system, sans-serif)",
  "--iui-font-size": "14px",
  "--iui-line-height": "1.6",
  "--iui-tracking": "0",
  "--iui-map-bg": "var(--dsw-alias-bg-base)",
  "--iui-map-card": "var(--dsw-alias-bg-base)",
  "--iui-map-control": "var(--dsw-alias-bg-base)",
  "--iui-map-control-border": "var(--dsw-alias-border-l2)",
  "--iui-map-halo": "var(--dsw-alias-border-l1)",
  "--iui-map-label": "var(--dsw-alias-label-secondary)",
  "--iui-map-pin": "var(--dsw-alias-label-primary)",
  "--iui-map-pin-border": "var(--dsw-alias-bg-base)",
  "--iui-map-pin-selected": "var(--dsw-alias-state-business-primary)",
};

const VIEW_CSS = `
.iui-dsh-tool {
  position: relative;
  margin: 4px 0 10px;
  min-width: 0;
}
.iui-dsh-tool .iui-theme {
  color-scheme: light;
}
[data-ds-dark-theme] .iui-dsh-tool .iui-theme {
  color-scheme: dark;
}
.iui-dsh-status {
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 1.5;
  padding: 6px 0;
}
.iui-dsh-error {
  margin-top: 6px;
  color: var(--dsw-alias-state-error-primary, #d33);
  font-size: 12px;
  line-height: 1.5;
}
`;

/** Core CSS is written for a standalone page; scope its root tokens to the view. */
const SCOPED_CSS = coreCss
  .replace(/:root\s*\{/g, ".iui-theme{")
  .replace(/:root\.dark/g, ".iui-theme.dark");

function installStyles(): () => void {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = SCOPED_CSS + VIEW_CSS;
  document.head.append(style);
  return () => {
    if (style.isConnected) style.remove();
  };
}

function hostIsDark(): boolean {
  const root = document.documentElement;
  const body = document.body;
  return (
    root.hasAttribute("data-ds-dark-theme") ||
    body?.hasAttribute("data-ds-dark-theme") === true ||
    root.classList.contains("dark") ||
    body?.classList.contains("dark") === true
  );
}

type Phase = "preparing" | "start" | "result";

interface BlockLike {
  args?: { value(key: string): unknown };
  meta?: unknown;
}

interface ToolViewProps {
  phase: Phase;
  block: BlockLike;
  callId: string;
  sessionId: string;
  toolName?: string;
}

interface Payload {
  ops: Op[] | null;
  issues: string[];
}

function issueText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((issue) => {
    if (issue && typeof issue === "object" && "path" in issue && "message" in issue) {
      return `${String((issue as { path: unknown }).path)}: ${String((issue as { message: unknown }).message)}`;
    }
    return String(issue);
  });
}

function readPayload(block: BlockLike): Payload {
  const meta = block.meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const record = meta as { ops?: unknown; issues?: unknown };
    if (Array.isArray(record.ops)) {
      return { ops: record.ops as Op[], issues: issueText(record.issues) };
    }
  }
  const value = block.args?.value("ops");
  if (Array.isArray(value)) return { ops: value as Op[], issues: [] };
  return { ops: null, issues: [] };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createToolView(ctx: Context) {
  return function IuiToolView(props: ToolViewProps): React.ReactElement {
    const mountRef = React.useRef<HTMLDivElement>(null);
    const hostRef = React.useRef<IuiHost | null>(null);
    const [sendError, setSendError] = React.useState<string | null>(null);
    const [renderError, setRenderError] = React.useState<string | null>(null);
    const payload = React.useMemo(() => readPayload(props.block), [props.block]);
    const opsKey = payload.ops === null ? "" : JSON.stringify(payload.ops);
    const issuesKey = payload.issues.join("\u0000");

    React.useEffect(() => {
      const container = mountRef.current;
      if (!container) return;
      const host = createIuiHost({
        container,
        theme: "inherit",
        darkSelector: "[data-ds-dark-theme]",
        tokens: DSH_TOKENS,
        scroll: "none",
        animate: true,
        onAction: async (action) => {
          try {
            // DSH teaches the model that every interaction arrives as an
            // `[iui-action]` envelope, including suggestion chips and form
            // CTAs, so keep prompts structured instead of sending raw text.
            const text =
              action.kind === "prompt"
                ? formatIuiAction({
                    action: "prompt",
                    ...(action.answerId === undefined
                      ? {}
                      : { answerId: action.answerId }),
                    payload: { text: action.text },
                  })
                : formatIuiActionMessage(action);
            const binding = ctx.sessions.binding(props.sessionId);
            if (!binding) throw new Error("This session is no longer available.");
            const result = await binding.session.prompt([{ type: "text", text }], "queue");
            if (!result.ok) {
              throw new Error(result.error?.message ?? "The host rejected the action.");
            }
            setSendError(null);
          } catch (error) {
            setSendError(errorMessage(error));
          }
        },
      });
      hostRef.current = host;
      const syncTheme = () => host.ui.setTheme(hostIsDark() ? "dark" : "light");
      syncTheme();
      const observer = new MutationObserver(syncTheme);
      const options: MutationObserverInit = {
        attributes: true,
        attributeFilter: ["class", "data-theme", "data-ds-dark-theme"],
      };
      observer.observe(document.documentElement, options);
      if (document.body) observer.observe(document.body, options);
      return () => {
        observer.disconnect();
        host.destroy();
        hostRef.current = null;
      };
    }, [props.callId, props.sessionId]);

    React.useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      if (payload.ops !== null && payload.ops.length > 0) {
        try {
          host.show(payload.ops);
          setRenderError(null);
        } catch (error) {
          setRenderError(errorMessage(error));
        }
      } else if (payload.issues.length > 0) {
        setRenderError(payload.issues.join("; "));
      }
    }, [opsKey, issuesKey]);

    const hasOps = payload.ops !== null && payload.ops.length > 0;
    const status =
      props.phase === "preparing"
        ? "Preparing interface…"
        : !hasOps
          ? renderError ?? "No renderable interface."
          : null;
    const error = sendError ?? (hasOps ? renderError : null);

    return React.createElement(
      "div",
      { className: "iui-dsh-tool", "data-iui-phase": props.phase },
      React.createElement("div", { ref: mountRef, className: "iui-dsh-mount" }),
      status
        ? React.createElement("div", { className: "iui-dsh-status", role: "status" }, status)
        : null,
      error
        ? React.createElement("div", { className: "iui-dsh-error", role: "status" }, error)
        : null,
    );
  };
}

export function apply(ctx: Context): void {
  ctx.effect(() => installStyles(), "intelligent-ui: styles");
  ctx.slots.inject("tool.call.toolview", () =>
    ctx.slots.register(
      { name: "tool.call.toolview", key: TOOL_NAME },
      createToolView(ctx),
    ),
  );
}
