import type { McpUiHostContext, McpUiStyleVariableKey } from "@modelcontextprotocol/ext-apps";

/**
 * Map the MCP Apps host style variables onto the core runtime's `--iui-*`
 * tokens. Hosts are allowed to provide any subset; missing values are omitted so
 * the core's light/dark defaults remain in effect.
 */
export function iuiTokensFromHost(
  context?: McpUiHostContext,
  options: { background?: "transparent" | "host" } = {},
): Record<string, string> {
  const vars = context?.styles?.variables;
  if (!vars) return { "--iui-bg": "transparent" };

  const tokens: Record<string, string> = {
    "--iui-bg": options.background === "host" ? pick(vars, "--color-background-primary") ?? "transparent" : "transparent",
  };
  const map: Array<[string, McpUiStyleVariableKey]> = [
    ["--iui-text", "--color-text-primary"],
    ["--iui-muted", "--color-text-secondary"],
    ["--iui-subtle", "--color-text-tertiary"],
    ["--iui-border", "--color-border-primary"],
    ["--iui-border-soft", "--color-border-secondary"],
    ["--iui-border-strong", "--color-border-tertiary"],
    ["--iui-control-border", "--color-border-primary"],
    ["--iui-control-bg", "--color-background-primary"],
    ["--iui-surface", "--color-background-secondary"],
    ["--iui-elevated", "--color-background-primary"],
    ["--iui-hover", "--color-background-secondary"],
    ["--iui-solid", "--color-text-primary"],
    ["--iui-on-solid", "--color-background-primary"],
    ["--iui-prompt", "--color-background-secondary"],
    ["--iui-prompt-after", "--color-background-info"],
    ["--iui-chip", "--color-background-secondary"],
    ["--iui-completed", "--color-text-tertiary"],
    ["--iui-focus", "--color-ring-primary"],
    ["--iui-success", "--color-text-success"],
    ["--iui-progress", "--color-text-success"],
    ["--iui-progress-track", "--color-background-secondary"],
    ["--iui-font", "--font-sans"],
    ["--iui-font-size", "--font-text-md-size"],
    ["--iui-line-height", "--font-text-md-line-height"],
  ];

  for (const [target, source] of map) {
    const value = pick(vars, source);
    if (value) tokens[target] = value;
  }
  return tokens;
}

function pick(
  vars: Partial<Record<McpUiStyleVariableKey, string | undefined>>,
  key: McpUiStyleVariableKey,
): string | undefined {
  const value = vars[key];
  return value && value.trim() ? value : undefined;
}

export function iuiThemeFromHost(context?: McpUiHostContext): "light" | "dark" | "auto" {
  return context?.theme === "dark" ? "dark" : context?.theme === "light" ? "light" : "auto";
}
