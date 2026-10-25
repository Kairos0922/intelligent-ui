# @intelligent-ui/core

Host-neutral runtime for Intelligent UI. The package supplies the IUI-1 compiler, 30 general-purpose blocks, validation and repair, the agent prompt and tool contract, and the action envelope.

No code touches the DOM outside the mount container. The `@intelligent-ui/core/agent` entry point operates on a server.

**Status:** Version 0.2.0 is a source release. The package is not on npm.

## Install from GitHub

Build the package tarball in the repository:

```bash
git clone https://github.com/Kairos0922/intelligent-ui.git
cd intelligent-ui
npm ci
npm run build
npm run pack:all
```

Then install the tarball in your application:

```bash
npm install /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-core-0.2.0.tgz
```

Read [README.md](https://github.com/Kairos0922/intelligent-ui/blob/main/README.md) for the full source install.

After the first npm release, use `npm install @intelligent-ui/core`.

## 3-step quickstart

```ts
// 1. Import the style file one time.
import "@intelligent-ui/core/styles.css";
import { createIntelligentUI } from "@intelligent-ui/core";

// 2. Mount the answer surface.
const ui = createIntelligentUI({
  container: document.querySelector("#answer"),
  theme: "inherit",
  onPrompt: (text) => myAgent.send(text),
});

// 3. Send a stream. The source can be a URL, a Response, a ReadableStream, or an AsyncIterable.
await ui.connect("/api/chat/stream");
```

The host keeps its chat shell, sidebar, and input box. The package controls only the assistant answer content.

## Exports

| Export | Entry | Function |
|---|---|---|
| `createIntelligentUI(options)` | `.` | Mount a streaming answer surface. |
| `encodeOps(ops)` | `.` | Convert ops to IUI-1 NDJSON. |
| `defineBlock(type, mount)` | `.` | Register a custom block. |
| `BLOCK_CATALOG` | `.` | The 30 block specifications. |
| `iuiSystemPrompt(options)` | `./agent` | Build a system prompt section. |
| `iuiTool(options)` | `./agent` | Build the `render_iui` tool definition. |
| `parseAgentText(text)` | `./agent` | Extract `iui` fences from a complete answer. |
| `createIuiExtractor(handlers)` | `./agent` | Extract `iui` fences from a stream. |
| `opsFromToolCall(args)` | `./agent` | Validate tool arguments. |
| `formatIuiAction(envelope)` | `./agent` | Build an `[iui-action]` user message. |
| `parseIuiAction(text)` | `./agent` | Read an `[iui-action]` user message. |
| `validateOps(ops)` | `./agent` | Validate and repair ops. |
| `opsToMarkdown(ops)` | `./agent` | Build a plain text fallback. |

Read [SDK.md](https://github.com/Kairos0922/intelligent-ui/blob/main/SDK.md) for the protocol, blocks, state, and security model.

## CSS

You must import `@intelligent-ui/core/styles.css` one time. The runtime does not inject CSS. This design supports a Content Security Policy and server-side rendering.

The CSS starts at `.iui-theme`. The package does not set a global `body` rule, a global font rule, or a global box-sizing rule.

## Agent use

The agent entry point does not use the DOM.

```ts
import { iuiSystemPrompt, iuiTool } from "@intelligent-ui/core/agent";

const system = iuiSystemPrompt({ mode: "both" });
const tools = { render_iui: iuiTool() };
```

The default prompt and tool schema omit the demo blocks. Use `include`, `exclude`, or `kinds` to select blocks.

## Custom blocks

```ts
ui.registerBlock("weather", (el, props, ctx) => {
  const node = document.createElement("div");
  node.textContent = `${props.city}: ${props.temp}°`;
  el.append(node);
});
```

The block registry is global to the page. Register a custom block one time on each page.

Read [SDK.md](https://github.com/Kairos0922/intelligent-ui/blob/main/SDK.md#81-add-a-block) for the event and state rules.

## Verification

| Check | Result |
|---|---|
| TypeScript type check | Pass |
| Browser self-test | 16 of 16 pass |
| Node tests | 14 of 14 pass |
| Playwright tests | 2 of 2 pass |
| MCP App HTML external URL scan | Pass |

## Build

```bash
npm run build:core
npm run typecheck -w @intelligent-ui/core
```

The core source is in `clone/src/`. The build output is in `clone/dist-lib/`.

## License

MIT. Read [LICENSE](LICENSE) and [NOTICE.md](https://github.com/Kairos0922/intelligent-ui/blob/main/NOTICE.md). The three demo blocks are local test fixtures. They are not in this package and are not covered by the MIT grant.
