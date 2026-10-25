# @intelligent-ui/mcp-apps

MCP Apps adapter for Intelligent UI. The package supplies one server helper and one self-contained iframe.

`createIuiServer()` returns a normal `McpServer` with two registered items:

1. The `render_iui` tool. The input is `{ ops: [...] }`. The tool validates the ops with the core and returns `structuredContent.ops` and a Markdown fallback.
2. The `ui://intelligent-ui/app.html` resource. The file contains the runtime, the adapter, the blocks, and the CSS. It starts without a network request and uses no external script.

The server `instructions` and the tool description contain the protocol, the block catalog, and the rules. A tool-only host works without a system prompt channel.

**Status:** Version 0.2.0 is a source release. The package is not on npm.

## Install from GitHub

Build the repository tarballs first:

```bash
git clone https://github.com/Kairos0922/intelligent-ui.git
cd intelligent-ui
npm ci
npm run build
npm run pack:all
```

Then install the core, adapter, and MCP Apps packages:

```bash
npm install /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-core-0.2.0.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-adapter-0.2.0.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-mcp-apps-0.2.0.tgz
```

After the first npm release, use `npm install @intelligent-ui/mcp-apps`.

## 3-step quickstart

```ts
// 1. Import the server packages.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createIuiServer } from "@intelligent-ui/mcp-apps";

// 2. Create the server.
const server = createIuiServer({ name: "my-app", version: "1.0.0" });
// Add your own tools on the same server if necessary.

// 3. Connect a transport.
await server.connect(new StdioServerTransport());
```

The example in the repository runs without code changes:

```bash
npm run example:mcp
npx @modelcontextprotocol/inspector node examples/mcp-server.mjs
```

After a local package install, run the bundled server:

```bash
node node_modules/@intelligent-ui/mcp-apps/dist/cli.js
```

## Add to an existing server

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { registerIui } from "@intelligent-ui/mcp-apps";

const server = new McpServer({ name: "my-app", version: "1.0.0" });
registerIui(server, { name: "my-app" });
```

`registerIui()` adds `render_iui` and the iframe resource.

## Options

```ts
interface IuiMcpOptions extends PromptOptions {
  name?: string;
  version?: string;
  title?: string;
  instructions?: string;
  toolName?: string;
  resourceUri?: string;
  csp?: McpUiResourceCsp;
  permissions?: McpUiResourcePermissions;
  prefersBorder?: boolean;
  sanitize?: boolean;
  maxOps?: number;
  include?: string[];
  exclude?: string[];
  kinds?: BlockKind[];
  productName?: string;
  extraRules?: string;
}
```

The default tool name is `render_iui`. The default resource URI is `ui://intelligent-ui/app.html`. The default `prefersBorder` value is `false`.

### Catalog filter

```ts
createIuiServer({
  name: "travel-app",
  include: ["dayList", "checklist", "form", "table", "tabs"],
});
```

The prompt, the tool description, the JSON Schema enum, and the server-side block allowlist use the same `selectPromptBlocks()` result. The model cannot see or submit a block that the server rejects.

### Content Security Policy

The iframe requests no network by default. If a block uses a remote image, permit the image origin:

```ts
createIuiServer({
  csp: { resourceDomains: ["https://images.example.com"] },
});
```

## Actions

The iframe uses the MCP Apps transport. It does not use a custom network path.

| UI event | MCP Apps call |
|---|---|
| Suggestion chip or form button (`prompt`) | `ui/message`. This call starts a new turn. |
| `select`, `step`, `view`, or `filter` | `ui/update-model-context` when the host supports it, `ui/message` when it does not. |
| Checkbox, copy, or local state | No call. The default policy is `agent`. |

A block action travels as one `[iui-action] { ... }` envelope. The form `submit` event is not sent as a block event because the form sends the raw prompt.

## Theme

The iframe reads `hostContext.theme` and `hostContext.styles.variables`. It maps host values to core `--iui-*` tokens for text, borders, surfaces, focus, status, font, and size.

The background stays transparent. Set `prefersBorder: true` when the host must draw a boundary.

## Resources

| Export | Function |
|---|---|
| `createIuiServer(options)` | Create a server with Intelligent UI registered. |
| `registerIui(server, options)` | Add Intelligent UI to an existing server. |
| `iuiAppHtml()` | Read the single-file iframe HTML. |
| `IUI_APP_URI` | The default resource URI. |
| `IUI_APP_MIME` | The MCP App MIME type. |

## Dependencies

The package depends on `@modelcontextprotocol/server` version 2.3 or later, `@modelcontextprotocol/ext-apps` version 2.0.3 or later, and `zod` version 4.2 or later.

The target MCP Apps specification era is `2026-01-26`.

## Verification

| Check | Result |
|---|---|
| MCP stdio client `tools/list` | Pass |
| MCP stdio client `tools/call` | Pass |
| MCP stdio client `resources/read` | Pass |
| External script or link scan | Pass |
| Iframe start without a host | Pass with a fallback |

## License

MIT. Read [LICENSE](LICENSE) and [NOTICE.md](https://github.com/Kairos0922/intelligent-ui/blob/main/NOTICE.md).
