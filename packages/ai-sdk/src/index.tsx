import type { CSSProperties, ReactNode } from "react";
import type { IuiEvent, Op, ThemeMode } from "@intelligent-ui/core";
import type { IuiHostAction } from "@intelligent-ui/adapter";
import { IntelligentUI } from "@intelligent-ui/react";

/** The subset of an AI SDK tool part this renderer needs. */
export interface IuiToolPartLike {
  type?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export interface IuiToolPartProps {
  part: IuiToolPartLike;
  onAction: (action: IuiHostAction) => void | Promise<void>;
  theme?: ThemeMode;
  tokens?: Record<string, string>;
  className?: string;
  style?: CSSProperties;
  onEvent?: (event: IuiEvent) => void;
  onError?: (error: Error, event: IuiEvent & { type: "error" }) => void;
  /** custom UI for streaming, errors, or an empty tool result */
  fallback?: (part: IuiToolPartLike) => ReactNode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Extract ops from the common tool-part shapes (output / input / result). */
export function opsFromToolPart(part: IuiToolPartLike): Op[] | null {
  const candidates: unknown[] = [part.output, part.input];
  for (const candidate of candidates) {
    const ops = opsFromUnknown(candidate);
    if (ops) return ops;
  }
  return null;
}

function opsFromUnknown(value: unknown): Op[] | null {
  if (Array.isArray(value)) return value as Op[];
  if (!isRecord(value)) return null;
  if (Array.isArray(value.ops)) return value.ops as Op[];
  if (isRecord(value.structuredContent) && Array.isArray(value.structuredContent.ops)) {
    return value.structuredContent.ops as Op[];
  }
  if (isRecord(value.output) && Array.isArray(value.output.ops)) {
    return value.output.ops as Op[];
  }
  if (isRecord(value.result) && Array.isArray(value.result.ops)) {
    return value.result.ops as Op[];
  }
  return null;
}

/** True when this part is the `render_iui` tool in any AI SDK state. */
export function isIuiToolPart(part: IuiToolPartLike, toolName = "render_iui"): boolean {
  return part.type === `tool-${toolName}` || part.type === "dynamic-tool";
}

function FallbackRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid var(--iui-border, #e5e5e5)",
        borderRadius: 12,
        padding: "10px 12px",
        color: "var(--iui-muted, #6b6b6b)",
        font: "13px/1.5 var(--iui-font, ui-sans-serif, system-ui, sans-serif)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Render a Vercel AI SDK tool part containing `render_iui` output.
 *
 * ```tsx
 * import "@intelligent-ui/core/styles.css";
 * <IuiToolPart part={part} onAction={(action) => sendMessage({ text: formatAction(action) })} />
 * ```
 */
export function IuiToolPart(props: IuiToolPartProps) {
  const { part, onAction, theme, tokens, className, style, onEvent, onError, fallback } = props;
  const ops = opsFromToolPart(part);

  if (ops?.length) {
    return (
      <IntelligentUI
        ops={ops}
        theme={theme}
        tokens={tokens}
        className={className}
        style={style}
        onAction={onAction}
        onEvent={onEvent}
        onError={onError}
      />
    );
  }

  if (fallback) return <>{fallback(part)}</>;
  if (part.state === "output-error") {
    return <FallbackRow>{part.errorText || "Intelligent UI failed to render."}</FallbackRow>;
  }
  if (part.state === "output-available") {
    return <FallbackRow>No Intelligent UI blocks in this result.</FallbackRow>;
  }
  return <FallbackRow>Preparing interface…</FallbackRow>;
}
