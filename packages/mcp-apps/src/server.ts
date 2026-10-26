import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpUiResourceCsp, McpUiResourcePermissions } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import {
  IUI_TOOL_NAME,
  IUI_VERSION,
  iuiSystemPrompt,
  iuiToolDescription,
  opsFromToolCall,
  opsToMarkdown,
  selectPromptBlocks,
  type PromptOptions,
} from "@intelligent-ui/core/agent";

/** Default `ui://` URI for the self-contained Intelligent UI iframe. */
export const IUI_APP_URI = "ui://intelligent-ui/app.html";
export const IUI_APP_MIME = RESOURCE_MIME_TYPE;

export interface IuiMcpOptions extends PromptOptions {
  /** MCP server name (also used as the default product name in instructions). */
  name?: string;
  /** MCP server version. */
  version?: string;
  /** Human-readable tool title. */
  title?: string;
  /** Override the generated server instructions. */
  instructions?: string;
  /** Resource URI; must be stable because tool metadata points at it. */
  resourceUri?: string;
  /** Network/static origins the iframe may use (images in component props, etc.). */
  csp?: McpUiResourceCsp;
  /** Sandbox permissions (camera, clipboard, …). */
  permissions?: McpUiResourcePermissions;
  /** Ask the host for a visible card boundary. Default: false (inline). */
  prefersBorder?: boolean;
  /** Validate/sanitize model output before rendering. Default: true. */
  sanitize?: boolean;
  /** Hard cap on ops per tool call (core default: 200). */
  maxOps?: number;
}

export interface RegisteredIui {
  toolName: string;
  resourceUri: string;
}

let cachedAppHtml: string | undefined;

/** Read the single-file iframe generated at build time. */
export function iuiAppHtml(): string {
  return (cachedAppHtml ??= readFileSync(new URL(/* @vite-ignore */ "./app.html", import.meta.url), "utf8"));
}

/** Register `render_iui` and its iframe resource on an existing McpServer. */
export function registerIui(server: McpServer, options: IuiMcpOptions = {}): RegisteredIui {
  const toolName = options.toolName ?? IUI_TOOL_NAME;
  const resourceUri = options.resourceUri ?? IUI_APP_URI;
  const resourceMeta = {
    ...(options.csp ? { csp: options.csp } : {}),
    ...(options.permissions ? { permissions: options.permissions } : {}),
    prefersBorder: options.prefersBorder ?? false,
  };
  const allowedBlocks = new Set(selectPromptBlocks(options).map((block) => block.type));

  registerAppTool(
    server,
    toolName,
    {
      title: options.title ?? "Render Intelligent UI",
      description: iuiToolDescription({ ...options, name: toolName }),
      inputSchema: z.object({
        ops: z.array(z.record(z.string(), z.unknown())).min(1),
      }),
      _meta: {
        ui: { resourceUri },
      },
    },
    async (args) => {
      const { ops, issues } = opsFromToolCall(args, {
        sanitize: options.sanitize ?? true,
        blocks: allowedBlocks,
        maxOps: options.maxOps,
      });

      if (!ops.length) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Intelligent UI rejected the op list: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`,
            },
          ],
        };
      }

      const markdown = opsToMarkdown(ops);
      return {
        content: [
          {
            type: "text" as const,
            text: markdown
              ? `Intelligent UI rendered ${ops.length} ops.\n\n${markdown}`
              : `Intelligent UI rendered ${ops.length} ops.`,
          },
        ],
        structuredContent: {
          version: IUI_VERSION,
          ops,
          issues,
        },
      };
    },
  );

  registerAppResource(
    server,
    "Intelligent UI",
    resourceUri,
    {
      description: "Interactive Intelligent UI answer surface",
      _meta: { ui: resourceMeta },
    },
    async () => ({
      contents: [
        {
          uri: resourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: iuiAppHtml(),
          _meta: { ui: resourceMeta },
        },
      ],
    }),
  );

  return { toolName, resourceUri };
}

/**
 * Create an MCP server that already advertises the IUI protocol in its
 * `instructions` field and exposes the `render_iui` tool.
 *
 * ```ts
 * const server = createIuiServer({ name: "my-app", version: "1.0.0" });
 * await server.connect(new StdioServerTransport());
 * ```
 */
export function createIuiServer(options: IuiMcpOptions = {}): McpServer {
  const name = options.name ?? "intelligent-ui";
  const instructions =
    options.instructions ??
    iuiSystemPrompt({
      ...options,
      mode: "tool",
      toolName: options.toolName ?? IUI_TOOL_NAME,
      productName: options.productName ?? name,
    });

  const server = new McpServer(
    { name, version: options.version ?? "0.2.1" },
    { instructions, maxToolInputElements: 100_000 },
  );
  registerIui(server, options);
  return server;
}
