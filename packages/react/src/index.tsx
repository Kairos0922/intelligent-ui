import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties } from "react";
import type {
  ConnectOptions,
  IuiEvent,
  Op,
  StreamSource,
  ThemeMode,
} from "@intelligent-ui/core";
import {
  createIuiHost,
  type IuiActionPolicy,
  type IuiHost,
  type IuiHostAction,
} from "@intelligent-ui/adapter";

export interface IntelligentUIHandle {
  readonly host: IuiHost | null;
  apply(ops: Op | Op[]): void;
  show(ops: Op[]): void;
  ingest(chunk: string | Uint8Array): void;
  reset(): void;
}

export interface IntelligentUIProps {
  /** Tool result / complete answer ops. Takes precedence over `wire` and `source`. */
  ops?: Op[] | null;
  /** Complete IUI-1 NDJSON. Takes precedence over `source`. */
  wire?: string | null;
  /** Streaming source: URL, Response, ReadableStream, AsyncIterable. */
  source?: StreamSource | null;
  theme?: ThemeMode;
  darkSelector?: string;
  tokens?: Record<string, string>;
  scroll?: "container" | "window" | "none";
  animate?: boolean;
  sanitize?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  actionPolicy?: IuiActionPolicy;
  onAction?: (action: IuiHostAction) => void | Promise<void>;
  onEvent?: (event: IuiEvent) => void;
  onError?: (error: Error, event: IuiEvent & { type: "error" }) => void;
  /** called once the runtime is mounted; useful for imperative control */
  onReady?: (host: IuiHost) => void;
}

/**
 * React wrapper around the Intelligent UI runtime.
 *
 * ```tsx
 * import "@intelligent-ui/core/styles.css";
 * <IntelligentUI ops={ops} onAction={(action) => send(action)} />
 * ```
 *
 * Structural options (darkSelector / scroll / animate / sanitize) are recorded
 * at mount; theme and tokens are applied reactively.
 */
export const IntelligentUI = forwardRef<IntelligentUIHandle, IntelligentUIProps>(
  function IntelligentUI(props, ref) {
    const {
      ops,
      wire,
      source,
      theme = "inherit",
      darkSelector,
      tokens,
      scroll,
      animate,
      sanitize,
      ariaLabel,
      className,
      style,
      actionPolicy = "agent",
      onAction,
      onEvent,
      onError,
      onReady,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<IuiHost | null>(null);
    const callbacks = useRef({ onAction, onEvent, onError, onReady, actionPolicy });
    callbacks.current = { onAction, onEvent, onError, onReady, actionPolicy };

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const host = createIuiHost({
        container,
        theme,
        darkSelector,
        tokens,
        scroll,
        animate,
        sanitize,
        ariaLabel,
        actionPolicy: callbacks.current.actionPolicy,
        onAction: (action) => callbacks.current.onAction?.(action),
        onEvent: (event) => callbacks.current.onEvent?.(event),
        onError: (error, event) => callbacks.current.onError?.(error, event),
      });
      hostRef.current = host;
      callbacks.current.onReady?.(host);

      return () => {
        host.destroy();
        hostRef.current = null;
      };
      // Structural options are intentionally mount-time: changing them
      // recreates the runtime and would drop the current answer.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      hostRef.current?.setTheme(theme);
    }, [theme]);

    useEffect(() => {
      if (tokens) hostRef.current?.setTokens(tokens);
    }, [tokens]);

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      if (ops) {
        host.show(ops);
        return;
      }
      if (wire != null) {
        host.reset();
        host.ingest(wire);
        host.end();
        return;
      }
      if (!source) {
        host.reset();
        return;
      }

      const controller = new AbortController();
      let active = true;
      void host.connect(source, { signal: controller.signal }).catch((error) => {
        if (!active || controller.signal.aborted) return;
        console.warn("[iui] stream failed", error);
      });

      return () => {
        active = false;
        controller.abort();
      };
    }, [ops, wire, source]);

    useImperativeHandle(
      ref,
      () => ({
        get host() {
          return hostRef.current;
        },
        apply: (value: Op | Op[]) => hostRef.current?.apply(value),
        show: (value: Op[]) => hostRef.current?.show(value),
        ingest: (chunk: string | Uint8Array) => hostRef.current?.ingest(chunk),
        reset: () => hostRef.current?.reset(),
      }),
      [],
    );

    return <div ref={containerRef} className={className} style={style} />;
  },
);

export type { IuiActionPolicy, IuiHost, IuiHostAction, IuiEvent, Op, StreamSource, ThemeMode, ConnectOptions };
