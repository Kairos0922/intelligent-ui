# Host adapters

An adapter connects the host-neutral core to one host application. The adapter does three tasks:

1. It mounts the core runtime in a host container.
2. It maps host data and host theme values to the core.
3. It sends user actions back to the agent in one format.

The core does not contain a host DOM selector, a host event name, or a host theme variable.

**Status:** Version 0.2.0 is a source release. The packages are not on npm. Read [README.md](README.md) for the GitHub install steps.

## 1. Layers

```text
model output
    |
    v
@intelligent-ui/core       protocol, validation, blocks, agent contract
    |
    v
@intelligent-ui/adapter    action, theme, and lifecycle mapping
    |
    +--> @intelligent-ui/react
    +--> @intelligent-ui/ai-sdk
    +--> @intelligent-ui/mcp-apps
    +--> @intelligent-ui/dsh
    +--> your host adapter
```

A host adapter must not change the core protocol. It can select a data path, map theme tokens, and set an action policy.

## 2. Host matrix

| Host or protocol | Data path | Package | Status |
|---|---|---|---|
| MCP Apps | `render_iui` tool and `ui://` resource | `@intelligent-ui/mcp-apps` | Local MCP stdio test pass |
| React web application | `ops`, `wire`, or `source` prop | `@intelligent-ui/react` | Ready |
| Vercel AI SDK | Tool part from `render_iui` | `@intelligent-ui/ai-sdk` | Ready |
| DeepSeek Harness (DSH) | Keyed tool row | `@intelligent-ui/dsh` | Synthetic replay pass |
| Custom web host | Core runtime and adapter | `@intelligent-ui/adapter` | Ready |
| Plain text host | Markdown fallback | Core `opsToMarkdown()` | Ready |
| AG-UI or CopilotKit | Custom event or tool call | None | Roadmap |
| Open WebUI | Iframe and `postMessage` | None | Roadmap |

## 3. Adapter contract

A new adapter must answer these four questions:

| Question | Required result |
|---|---|
| Where does the answer go? | A host element for one answer surface. |
| How does data arrive? | A stream, a complete wire string, or a tool call. |
| How do theme values arrive? | A theme mode and a set of CSS variables. |
| Where do actions go? | A prompt or one `[iui-action]` message. |

The adapter can use `createIuiHost()` from `@intelligent-ui/adapter`. The adapter does not start a network request unless you pass a URL to `connect()`. The host decides where an action goes.

```ts
import "@intelligent-ui/core/styles.css";
import { createIuiHost, formatAction } from "@intelligent-ui/adapter";

const host = createIuiHost({
  container: document.querySelector("#answer"),
  theme: "inherit",
  onAction: (action) => {
    if (action.kind === "prompt") {
      sendToAgent(action.text);
      return;
    }
    sendToAgent(formatAction(action));
  },
});

await host.connect("/api/chat/stream");
```

### 3.1 Host API

```ts
interface IuiHost {
  ui: IntelligentUI;
  begin(): Answer;
  ingest(chunk: string | Uint8Array): void;
  end(): void;
  apply(ops: Op | Op[]): void;
  show(ops: Op[]): void;
  connect(source: StreamSource, options?: ConnectOptions): Promise<Answer>;
  reset(): void;
  setTheme(mode: ThemeMode): void;
  setTokens(tokens: Record<string, string>): void;
  destroy(): void;
}
```

`show(ops)` resets the answer, applies the ops, and ends the answer. Use it for a complete tool result.

### 3.2 Action shape

```ts
type IuiHostAction =
  | { kind: "prompt"; text: string; answerId?: string }
  | { kind: "block"; envelope: IuiActionEnvelope };
```

A `prompt` action is a suggestion chip, a form button, or other raw user intent. Send it as a normal user message.

A `block` action is a block interaction. Send `formatAction(action)`. It gives one line with the `[iui-action]` prefix.

The action policy supplies a filter:

| Policy | Action that leaves the UI |
|---|---|
| `prompt` | Prompt actions only. |
| `agent` | Prompts and the `select`, `step`, `view`, and `filter` block events. This is the default. |
| `all` | All block events, including local events. |
| Function | The function selects each event. |

The `submit` event is not in the `agent` policy. A form sends a raw prompt on submit. If the adapter also sends the block event, the agent receives the same interaction two times.

The adapter keeps a local event in the UI unless the host selects a policy that sends it.

## 4. MCP Apps

MCP Apps is the cross-host path. One server helper registers the tool and one self-contained HTML resource.

```ts
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createIuiServer } from "@intelligent-ui/mcp-apps";

const server = createIuiServer({
  name: "my-app",
  version: "1.0.0",
  include: ["card", "checklist", "tabs", "table", "chips"],
});

await server.connect(new StdioServerTransport());
```

The server supplies:

- The `render_iui` tool. The input is `{ ops: [...] }`. The tool returns `structuredContent.ops` and a Markdown fallback.
- The `ui://intelligent-ui/app.html` resource. The file contains the runtime, the adapter, the CSS, and the blocks. It makes no network request by default.
- The server `instructions` and the tool description. A tool-only host does not need a system prompt channel.

Use `registerIui(server, options)` to add the same items to an existing `McpServer`.

### 4.1 Action path

| UI event | MCP Apps call |
|---|---|
| Suggestion chip or form button | `ui/message` |
| `select`, `step`, `view`, or `filter` | `ui/update-model-context` when the host supports it, `ui/message` when it does not |
| Checkbox, copy, or local state | No call by default |

A block action goes to the model as an `[iui-action]` envelope. The model must update the block with a new `render_iui` call.

### 4.2 Theme path

The iframe reads `hostContext.theme` and `hostContext.styles.variables`. It maps host values to core `--iui-*` tokens. The background stays transparent. Set `prefersBorder: true` if the host must draw a border.

### 4.3 Content Security Policy

The iframe makes no network request by default. If a block uses a remote image, permit the image origin:

```ts
createIuiServer({
  csp: { resourceDomains: ["https://images.example.com"] },
});
```

Read [packages/mcp-apps/README.md](packages/mcp-apps/README.md) for all options.

## 5. React

```tsx
import "@intelligent-ui/core/styles.css";
import { IntelligentUI } from "@intelligent-ui/react";
import { formatAction } from "@intelligent-ui/adapter";

export function Answer({ ops, send }) {
  return (
    <IntelligentUI
      ops={ops}
      theme="inherit"
      onAction={(action) =>
        send(action.kind === "prompt" ? action.text : formatAction(action))
      }
    />
  );
}
```

The component accepts one of three data sources. The priority is `ops`, then `wire`, then `source`.

The component is safe with React StrictMode. It does not inject styles. The host must import `@intelligent-ui/core/styles.css`.

Read [packages/react/README.md](packages/react/README.md) for the property table and the imperative handle.

## 6. Vercel AI SDK

The AI SDK adapter renders a tool part from the `render_iui` tool.

Server:

```ts
import { iuiSystemPrompt, iuiTool } from "@intelligent-ui/core/agent";

const result = streamText({
  model,
  messages,
  system: iuiSystemPrompt({ mode: "tool" }),
  tools: { render_iui: iuiTool() },
});
```

Client:

```tsx
import "@intelligent-ui/core/styles.css";
import { IuiToolPart, isIuiToolPart } from "@intelligent-ui/ai-sdk";
import { formatAction } from "@intelligent-ui/adapter";

message.parts.map((part, index) =>
  isIuiToolPart(part) ? (
    <IuiToolPart
      key={index}
      part={part}
      theme="inherit"
      onAction={(action) => sendMessage({ text: formatAction(action) })}
    />
  ) : null
);
```

The package does not import the `ai` package. It accepts the structural tool-part shape. Read [packages/ai-sdk/README.md](packages/ai-sdk/README.md) for the tool states and the fallback options.

## 7. DeepSeek Harness

The DSH adapter is for the DSH web profile. It uses DSH `0.2.1-rc.2`.

The package is not on npm. Use a link to the local source:

```bash
dsh plugin --profile web add link:/absolute/path/to/intelligent-ui/packages/dsh
```

The repository must have its dependencies and build output:

```bash
cd /absolute/path/to/intelligent-ui
npm ci
npm run build
```

Then add one entry to `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: intelligent-ui
      name: "@intelligent-ui/dsh"
```

Keep the other entries in the file. Use the package name, not an absolute path. DSH finds the client module in the profile `node_modules`.

Restart DSH:

```bash
dsh web
```

Ask for an interactive card, for example a laptop comparison with tabs. DSH must show one keyed tool row. A chip or a tab selection must return to the session as one `[iui-action]` message.

### 7.1 DSH status

The synthetic replay test passes in light and dark themes. The test covers keyed toolview replay, the no-meta fallback, block actions, suggestion chips, and hot module replacement cleanup.

A live model update is not tested. The isolated profile was signed out. Test this case in a signed-in DSH profile before you call the adapter production-ready.

Read [packages/dsh/README.md](packages/dsh/README.md) and [packages/dsh/SMOKE.md](packages/dsh/SMOKE.md).

## 8. Custom host

Use these three steps.

### 8.1 Mount the adapter

```ts
import "@intelligent-ui/core/styles.css";
import { createIuiHost } from "@intelligent-ui/adapter";

const host = createIuiHost({
  container: document.querySelector("#answer"),
  theme: "inherit",
  onAction: sendAction,
});
```

### 8.2 Select the data path

```ts
await host.connect("/api/chat/stream");
// or
host.show(opsFromToolCall(args).ops);
// or
host.ingest(ndjson);
```

### 8.3 Map host values

Map these host values to the adapter:

| Host value | Adapter option or method |
|---|---|
| Dark mode marker | `darkSelector` |
| Theme mode | `theme` |
| Host color tokens | `tokens` |
| Answer element | `container` |
| User action transport | `onAction` |

Do not add a host selector to a core block. Put the selector in the host adapter.

## 9. Action format

The action envelope is one line:

```text
[iui-action] {"action":"select","blockId":"c1","blockType":"tabs","payload":{"value":"MCP"}}
```

The fields are:

| Field | Use |
|---|---|
| `action` | The event name. |
| `blockId` | The block ID from the `comp` op. |
| `blockType` | The block type. |
| `answerId` | The answer ID from the runtime. |
| `payload` | Untrusted event data. |

Use `formatIuiAction()` and `parseIuiAction()` from `@intelligent-ui/core/agent`. A host can add the same envelope to a system prompt section. The default prompt already contains the response rules.

## 10. Theme rules

- Use `inherit` when the host has a complete theme system.
- Use `auto` when the host follows the system color scheme.
- Set `darkSelector` when the host uses a dark marker other than `.dark` or `[data-theme="dark"]`.
- Map host tokens to `--iui-*` variables. Do not edit block CSS in a host adapter.
- Keep the answer background transparent when the host already supplies a card surface.

## 11. Security rules

- Treat all model output as untrusted input.
- Keep the MCP App iframe sandboxed.
- Set a Content Security Policy.
- Do not put a secret in a prompt, a tool result, or a block property.
- Do not send local UI state to the agent without a user action.
- Do not put `recon/`, browser profile data, or third-party assets in an adapter package.

Read [SECURITY.md](SECURITY.md).
