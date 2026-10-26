# Intelligent UI SDK

Intelligent UI changes model output into an interactive answer surface. The core package is host-neutral. The adapter packages connect it to a host application.

This document uses ASD-STE100 Simplified Technical English. Read [docs/STE.md](docs/STE.md) for the rules.

**Status:** Version 0.2.1 is a source release. The packages are not on npm. Read [README.md](README.md) for the GitHub install steps.

## 1. Scope

The SDK has three parts:

| Part | Function |
|---|---|
| Core runtime | Compiles the IUI-1 stream and mounts blocks in a container. |
| Agent contract | Supplies the system prompt, the `render_iui` tool, parsers, and validators. |
| Adapter layer | Maps core events to a host and sends actions in one format. |

The core runtime operates in a browser. The agent entry point operates on a server or an edge runtime. The core runtime does not contain a chat shell, a sidebar, an input box, or host CSS selectors.

## 2. Install from GitHub

The repository is a monorepo. The root package is private. Build the package tarballs first:

```bash
git clone https://github.com/Kairos0922/intelligent-ui.git
cd intelligent-ui
npm ci
npm run build
npm run pack:all
```

Install the core package in your application:

```bash
npm install /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-core-0.2.1.tgz
```

For React, install the core, adapter, and React packages:

```bash
npm install /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-core-0.2.1.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-adapter-0.2.1.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-react-0.2.1.tgz
```

Read the package README for the MCP Apps, AI SDK, and DSH install steps. After the first npm release, you can use `npm install @intelligent-ui/core`.

## 3. Core quickstart

```ts
import "@intelligent-ui/core/styles.css";
import { createIntelligentUI } from "@intelligent-ui/core";

const ui = createIntelligentUI({
  container: document.querySelector("#answer"),
  theme: "auto",
  onPrompt: (text) => sendToAgent(text),
});

ui.ingest(
  '{"t":"p"}\n' +
  '{"t":"md","v":"Here is a **live** answer."}\n' +
  '{"t":"comp","id":"c1","type":"card","props":{"title":"Hello","body":"From the SDK"}}\n' +
  '{"t":"done"}\n'
);
```

You must import the CSS file one time. The runtime does not inject styles. This behavior supports a Content Security Policy (CSP) and server-side rendering.

One instance can show more than one answer:

```ts
ui.begin();
ui.ingest(op);
ui.end();
```

The host keeps its own sidebar, message bubbles, and input box. The SDK controls only the assistant answer content.

## 4. Data paths

Select one data path for your backend.

### 4.1 Direct IUI-1 stream

The backend sends IUI-1 as NDJSON or as Server-Sent Events (SSE). The runtime detects the format from the `Content-Type` header.

```ts
const ui = createIntelligentUI({ container, onPrompt: send });
await ui.connect("/api/chat/stream");
```

Use `connect()` options for a POST request or an authenticated request:

```ts
await ui.connect("/api/chat/stream", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ messages }),
  signal: abortController.signal,
});
```

`connect()` accepts these sources:

| Source | Behavior |
|---|---|
| `string` or `URL` | Fetches the URL and selects NDJSON or SSE. |
| `Response` | Reads the response body. |
| `ReadableStream` | Reads text or bytes from the stream. |
| `AsyncIterable` or `Iterable` | Reads each text or byte chunk. |

SSE support includes `data: [DONE]`, `event:` lines, comment lines, and common JSON wrappers. Use `transform` for a custom wrapper.

### 4.2 Text with an `iui` fence

This path does not need tool calling. The model writes normal text and puts the UI in an ` ```iui ` fence. The host renders the text as it arrives. The runtime compiles each line in the fence.

```ts
import { createIuiExtractor, encodeOps } from "@intelligent-ui/core/agent";

const ui = createIntelligentUI({ container, onPrompt: send });
const extractor = createIuiExtractor({
  onText: (text) => hostProse.append(text),
  onOp: (op) => ui.ingest(encodeOps([op])),
  onIssue: (issue) => console.warn(issue.path, issue.message),
});

for await (const chunk of modelStream) extractor.push(chunk);
extractor.end();
ui.end();
```

The extractor is safe with any chunk boundary, including a boundary in the middle of a JSON object. The `onText` callback operates at line boundaries. A fenced block with a different language stays in the text.

### 4.3 Tool call

Use this path when the model supports function calling:

```ts
import { iuiTool, opsFromToolCall, BLOCK_TYPES } from "@intelligent-ui/core/agent";

const tools = [iuiTool()];
const { ops, issues } = opsFromToolCall(toolCall.function.arguments, {
  blocks: BLOCK_TYPES,
});

for (const op of ops) ui.ingest(encodeOps([op]));
ui.end();
```

`iuiTool()` returns a function/tool definition. `iuiParameters()` returns only the JSON Schema for a different tool API.

## 5. Agent contract

The agent entry point is `@intelligent-ui/core/agent`. It does not use the DOM.

| Export | Function |
|---|---|
| `iuiSystemPrompt(options?)` | Builds a system prompt section. |
| `IUI_SYSTEM_PROMPT` | The default prompt in fence mode. |
| `IUI_TOOL_PROMPT` | The default prompt in tool mode. |
| `iuiTool(options?)` | Builds the `render_iui` tool definition. |
| `iuiParameters(options?)` | Builds the JSON Schema for the tool. |
| `iuiToolDescription(options?)` | Builds the tool description for a host without a system prompt. |
| `parseAgentText(text, options?)` | Extracts `iui` blocks from a complete answer. |
| `createIuiExtractor(handlers, options?)` | Extracts `iui` blocks from a stream. |
| `opsFromToolCall(args, options?)` | Validates the tool arguments. |
| `formatIuiAction(envelope)` | Builds an `[iui-action]` user message. |
| `parseIuiAction(text)` | Reads an `[iui-action]` message. |
| `encodeOps(ops)` | Converts ops to NDJSON. |
| `validateOps(ops)` and `validateNdjson(text)` | Validate and repair ops. |
| `BLOCK_CATALOG`, `BLOCK_TYPES`, `catalogPrompt()` | Give block data and prompt text. |
| `selectPromptBlocks(options)` | Applies a catalog filter. |
| `opsToMarkdown(ops)` | Gives a plain text fallback for a host without a DOM. |

### 5.1 Prompt modes

`iuiSystemPrompt()` has three modes:

| Mode | Use |
|---|---|
| `fence` | The model writes an `iui` fence in normal text. This is the default. |
| `tool` | The model must call `render_iui`. |
| `both` | The model uses the tool first and the fence as a fallback. |

Example:

```ts
const system = iuiSystemPrompt({
  mode: "both",
  productName: "Acme Assistant",
  include: ["card", "checklist", "tabs", "table", "chips"],
  extraRules: "Use a maximum of 3 blocks in one answer.",
});
```

The prompt tells the model when to use UI, when to use prose, the block catalog, the protocol, and the response rules for `[iui-action]`.

### 5.2 Catalog filter

The default prompt and tool schema omit the demo blocks. Use `include`, `exclude`, or `kinds` to select blocks.

```ts
const blocks = selectPromptBlocks({
  kinds: ["content", "interactive"],
  exclude: ["map"],
});
```

The prompt, the tool JSON Schema, and the server validation use the same block set.

## 6. IUI-1 protocol

The stream is NDJSON. Each line is one JSON object. The last op is `done`.

| Op | Meaning |
|---|---|
| `{"t":"p","lvl":0}` | Start a paragraph. |
| `{"t":"p","lvl":2}` | Start a heading at level 2, 3, or 4. |
| `{"t":"md","v":"..."}` | Append supported Markdown to the open block. |
| `{"t":"table","head":[],"rows":[]}` | Add a table. |
| `{"t":"comp","id":"c1","type":"card","props":{}}` | Mount a block. |
| `{"t":"set","id":"c1","path":"value","v":3}` | Change one block property. |
| `{"t":"ask","v":["..."]}` | Add one to six suggestion chips. |
| `{"t":"done"}` | End the answer. |
| `{"t":"model","v":"..."}` | Set the model label. The default render hides this node. |

Markdown support is a small set: bold, italic, inline code, links, and simple lists. The runtime does not accept raw HTML.

## 7. Validation

The validator repairs an op when it can. It drops an op when it cannot repair the op.

| Condition | Result |
|---|---|
| Unknown block type | Drop the block and send an `unknown-block` event. |
| Unsafe URL | Remove the URL field and send a `validation` event. |
| Missing block ID | Assign an ID with the `c_` prefix. |
| Table row length mismatch | Fill or cut the row to the header length. |
| Unsafe object keys | Remove the key. |
| Payload too large | Drop the op or limit the value. |

The default limits are:

| Item | Limit |
|---|---|
| `props` for one block | 192 KB |
| Answer payload | 1.5 MB |
| Ops for one answer | 512 |
| String | 40 KB |
| Array | 500 items |
| Table | 10 columns and 300 rows |

Set `sanitize: false` only for trusted local test data.

### 7.1 Fallback text

A model can return no valid UI. Do not remove the answer in this condition. Render the text and add a note.

```ts
const parsed = parseAgentText(answer);

if (parsed.ops.length > 0) {
  for (const op of parsed.ops) ui.ingest(encodeOps([op]));
  ui.end();
} else {
  renderMarkdown(parsed.text);
}
```

The `createIuiExtractor()` `onIssue` callback does not stop the stream. Text outside the fence continues to arrive.

## 8. Blocks

The default catalog has 30 general-purpose blocks.

| Type | Kind | Function |
|---|---|---|
| `collage` | media | Asymmetric hero image group. |
| `strip` | media | Equal-width image row. |
| `rtHero` | media | Wide three-image hero. |
| `pair` | media | Two images with a selectable ratio. |
| `figure` | media | One large image with a caption. |
| `mediaRow` | media | Image cards for products, places, or meals. |
| `chips` | layout | Tag chip row. |
| `card` | content | Summary card with an eyebrow, title, text, and list. |
| `chart` | content | Line, area, or grouped bar chart with a data table. |
| `stats` | content | Metric cards with a change value and trend. |
| `timeline` | content | Date event axis with status points. |
| `calendar` | interactive | Month view with a selected-day detail. |
| `matrix` | content | Row and column comparison with value bars. |
| `code` | content | Code block with a path, language, and line numbers. |
| `diff` | content | Unified diff with hunk line numbers. |
| `fileTree` | content | Indented file tree with change status. |
| `formula` | content | Formula, values, result, and steps. |
| `flashcards` | interactive | Flip cards. The flip event stays local. |
| `menu` | domain | Restaurant menu with images and descriptions. |
| `outfitGrid` | domain | Outfit grid with a lightbox. |
| `dayList` | domain | Day-by-day list for a trip or wardrobe. |
| `checklist` | interactive | Timed checklist with a live count. |
| `packing` | interactive | Grouped packing list with progress. |
| `form` | interactive | Option form with a call-to-action button. |
| `calculator` | interactive | Quantity stepper, quantity table, and copy action. |
| `tabs` | layout | Tabbed prose. |
| `tiles` | layout | Color icon tile grid. |
| `map` | interactive | Diagram map with group filter and detail. |
| `bike` | domain | Annotated figure with an exploded view. |
| `steps` | interactive | Step guide with progress and checks. |

`BLOCK_CATALOG` contains the machine-readable schema for each block. Use `kind` to filter the catalog. The `domain` blocks are for travel, wardrobe, menu, and similar tasks.

The demo blocks `billSplitter`, `rothCalc`, and `retroGame` are local test fixtures. They use the `UNLICENSED` license. They are not in this repository, `BLOCK_CATALOG`, the default prompt, the default tool schema, or a package tarball.

### 8.1 Add a block

```ts
ui.registerBlock("weather", (el, props: { city: string; temp: number }, ctx) => {
  const card = document.createElement("div");
  card.className = "my-weather";
  card.textContent = `${props.city} · ${props.temp}°`;
  el.append(card);
});
```

The block registry is global to the page. Register a custom block one time on each page. The validator also cleans the properties of a custom block. To show the block to the model, add a description to your prompt or extend `BLOCK_CATALOG`.

A block can send an event:

```ts
ctx.emit?.("change", { value: 3 });
```

The host receives this event:

```ts
{
  type: "block",
  name: "change",
  detail: { blockId: "c1", blockType: "weather", value: 3 }
}
```

### 8.2 State updates

`BlockSpec.state` lists the property paths that support a runtime update. The prompt includes these paths. The model sends a `set` op when a user action must change the UI.

```json
{"t":"set","id":"c1","path":"series","v":[{"name":"Agents","values":[30,10]}]}
{"t":"set","id":"c2","path":"items.0.done","v":true}
```

The safest update replaces a top-level value, for example `series`, `items`, `rows`, `cards`, `code`, or `lines`. A dotted path can change one nested value, for example `rows.0.values.0`.

A block without a custom setter receives a clone of the current props and mounts again. A temporary user value can reset in this condition. The `calendar` block has a custom `select` setter and does not remount.

The current SDK does not support cross-block `bind` or `derive` expressions. A block is updateable only when its specification declares a `state` path.

## 9. Theme and CSS

All component CSS starts at `.iui-theme`. The SDK does not set global `body`, font, or box-sizing rules.

| Theme | Behavior |
|---|---|
| `light` | Force the light theme. |
| `dark` | Force the dark theme. |
| `auto` | Follow `prefers-color-scheme` and update on a change. |
| `inherit` | Do not set `data-theme` or default tokens. Use the host CSS. |

The dark token set applies to `:root.dark` and `.iui-theme[data-theme="dark"]`. If the host uses a different dark selector, set `darkSelector`. The DSH adapter uses `[data-ds-dark-theme]`.

Use `tokens` to override CSS variables:

```ts
createIntelligentUI({
  container,
  theme: "auto",
  tokens: {
    "--iui-bg": "transparent",
    "--iui-surface": "#f6f6f7",
    "--iui-solid": "#111",
    "--iui-on-solid": "#fff",
    "--iui-font": "Inter, ui-sans-serif, system-ui, sans-serif",
  },
});
```

Common tokens:

| Token | Use |
|---|---|
| `--iui-bg`, `--iui-surface`, `--iui-elevated` | Background and surface colors. |
| `--iui-text`, `--iui-muted`, `--iui-subtle` | Text colors. |
| `--iui-border`, `--iui-border-soft`, `--iui-border-strong` | Border colors. |
| `--iui-solid`, `--iui-on-solid` | Strong button colors. |
| `--iui-focus` | Focus ring color. |
| `--iui-font`, `--iui-font-size`, `--iui-line-height` | Text style. |

The component column uses a 456 px reference width. A host column from 420 px to 720 px is best. The CSS is fluid.

Build sizes:

| File | Raw | Gzip |
|---|---|---|
| `intelligent-ui.css` | 65.8 KB | 13.7 KB |
| `index.js` | 103.4 KB | 26.2 KB |
| `agent.js` | 18.6 KB | 5.8 KB |

The package tarball contains no images or fonts.

## 10. Runtime API

```ts
const ui = createIntelligentUI({
  container: HTMLElement,
  theme?: "light" | "dark" | "auto" | "inherit",
  darkSelector?: string,
  tokens?: Record<string, string>,
  className?: string,
  scroll?: "container" | "window" | "none",
  animate?: boolean,
  sanitize?: boolean,
  ariaLabel?: string,
  onPrompt?: (prompt, ui) => void,
  onEvent?: (event) => void,
  onError?: (error, event) => void,
});
```

| Member | Function |
|---|---|
| `ui.el` | The `.iui-theme.iui-root` node. |
| `ui.answers` | The answers that started. Read-only. |
| `ui.begin()` | Start an answer and return it. |
| `ui.ingest(chunk)` | Write a chunk to the current answer. |
| `ui.apply(op)` | Apply one op or a list of ops. |
| `ui.connect(source, options?)` | Read a stream into a new answer. |
| `ui.end()` | End the current answer. |
| `ui.abort()` | Stop the active `connect()`. |
| `ui.reset()` | Remove all answers and run cleanups. |
| `ui.setTheme(mode)` | Change the theme. |
| `ui.setTokens(tokens)` | Change CSS variables. |
| `ui.registerBlock(type, mount)` | Add a custom block. |
| `ui.catalog` | The block catalog. |
| `ui.destroy()` | Stop streams, remove the root node, and remove listeners. |

`Answer` has `id`, `el`, `done`, `opCount`, `write(chunk)`, and `end()`.

`ConnectOptions` has `signal`, `headers`, `credentials`, `method`, `body`, `transform`, `format`, and `sse`.

## 11. Events and actions

```ts
type IuiEvent =
  | { type: "answer-start"; answerId: string }
  | { type: "answer-end"; answerId: string; ops: number; ms: number }
  | { type: "prompt"; answerId: string; prompt: string }
  | { type: "block"; answerId: string; name: string; detail: Record<string, unknown> }
  | { type: "unknown-block"; answerId: string; id: string; blockType: string }
  | { type: "validation"; answerId: string; issues: ValidationIssue[] }
  | { type: "error"; answerId: string | null; phase: "stream" | "mount" | "render"; error: Error };
```

Block events:

| Name | Source | Detail |
|---|---|---|
| `change` | checklist, packing, calculator | `item`, `done`, `completed`, `total`, or `value` |
| `select` | tabs, bike, map, calendar | `value`, `place`, `name`, `date`, or `events` |
| `submit` | form | `values` |
| `copy` | calculator | `text` |
| `step` | steps | `index`, `total` |
| `view` | bike | `assembled` or `exploded` |
| `filter` | map | `group` |

Each `detail` object has `blockId` and `blockType`.

The `prompt` event is a user prompt. Send it as a normal user message. A block event goes to the agent as one envelope:

```ts
import { formatIuiAction, parseIuiAction } from "@intelligent-ui/core/agent";

onEvent: (event) => {
  if (event.type !== "block") return;
  sendToAgent(
    formatIuiAction({
      action: event.name,
      blockId: String(event.detail.blockId ?? ""),
      blockType: String(event.detail.blockType ?? ""),
      answerId: event.answerId,
      payload: event.detail,
    })
  );
};

const action = parseIuiAction(userMessage);
if (action) {
  // Handle action.action, action.blockId, and action.payload.
}
```

The envelope is one line. It has `action` and optional `blockId`, `blockType`, `answerId`, and `payload` fields. Treat `payload` as untrusted input.

The default action policy is `agent`. It sends prompts and the block events `select`, `step`, `view`, and `filter`. It keeps local events, for example a checkbox or a copy action, in the UI. A host can select another policy. Read [packages/adapter/README.md](packages/adapter/README.md).

## 12. Security

Treat all model output as untrusted input.

1. The Markdown renderer escapes HTML first. It then restores only the supported inline syntax.
2. A link URL must use `http`, `https`, `mailto`, `tel`, or a same-origin relative path.
3. An image URL uses an allowlist. `data:image/*` is valid only in an `<img>` element. `data:text/html` is not valid.
4. `tiles.icon` SVG content is rebuilt with a tag and attribute allowlist. The validator removes `on*`, `href`, `style`, `id`, and `url()`.
5. `tiles.bg` color values cannot contain `url(`, `expression`, `;`, `{`, `}`, `<`, or `>`.
6. The validator removes `__proto__`, `constructor`, `prototype`, functions, and symbols from props.
7. A component does not use model text as `innerHTML`. The SDK does not accept raw HTML.
8. A host must set a CSP. The runtime needs no `unsafe-eval`. The CSS is an external file. The `tokens` option writes CSS variables through `element.style.setProperty`. If your CSP blocks the `style` attribute, use a static CSS file.

Read [SECURITY.md](SECURITY.md) for the report procedure.

## 13. Build and test

Use Node.js 22 or later.

```bash
npm ci
npm run build
npm run typecheck
npm run test:unit
npm run test:e2e
npm run check:docs
npm run pack:all
npm run audit:pack
```

| Command | Function |
|---|---|
| `npm run dev` | Start the browser self-test server. |
| `npm run build` | Build the six packages. |
| `npm run test:unit` | Build and run the Node tests. |
| `npm run test:e2e` | Run the Playwright tests. |
| `npm run selftest` | Run the 16 browser self-tests. |
| `npm run bench:selfcheck` | Run the mock benchmark. |
| `npm run pack:all` | Build the six package tarballs. |
| `npm run audit:pack` | Audit the six package tarballs. |

Source entry points:

| Path | Content |
|---|---|
| `clone/src/sdk/index.ts` | Runtime entry. |
| `clone/src/sdk/agent.ts` | Agent entry. |
| `clone/src/sdk/catalog.ts` | Block catalog. |
| `clone/src/sdk/transport.ts` | Stream transport. |
| `clone/src/styles/sdk.css` | CSS entry. |

The `exports` map supplies the type declarations for `.` and `./agent`. Keep the CSS and block registration side effects in the build. Do not mark all JavaScript as side-effect free. The block registry uses a module side effect.

## 14. Test record

| Check | Result |
|---|---|
| TypeScript build and type check | Pass |
| Browser self-test | 16 of 16 pass |
| Node tests | 14 of 14 pass |
| Playwright tests | 2 of 2 pass |
| MCP stdio integration | Pass |
| MCP App HTML external URL scan | Pass |
| Tarball audit | Pass |
| DSH synthetic replay | Pass in light and dark themes |
| DSH live model update | Pass on DSH `0.2.1-rc.2` and `0.2.1-rc.3` with a signed-in profile |
| Real model benchmark | Not run. No provider credentials were available. |

The DSH live test used DeepSeek-V4.1-Flash and one real tab click for each host. Read [packages/dsh/SMOKE.md](packages/dsh/SMOKE.md) for the details.

## 15. Host adapters

The core package has no host dependency. Read [ADAPTERS.md](ADAPTERS.md) for the host matrix and the adapter contract.

| Host | Package | Status |
|---|---|---|
| MCP Apps | `@intelligent-ui/mcp-apps` | Local integration test pass |
| React | `@intelligent-ui/react` | Ready |
| Vercel AI SDK | `@intelligent-ui/ai-sdk` | Ready |
| DSH | `@intelligent-ui/dsh` | Live model and action pass |
| Plain text host | Core `opsToMarkdown()` | Ready |
| AG-UI or CopilotKit | None | Roadmap |
| Open WebUI | None | Roadmap |

An adapter combines four core primitives: `connect()` or `ingest()` for data, `createIntelligentUI()` for render, `onPrompt` or `onEvent` for actions, and the agent entry point for prompts and schemas.

## 16. Limits

- The runtime needs a DOM. Use the agent entry point on a server.
- The block registry is global to a page. More than one runtime instance on a page shares the registry.
- A `set` op updates only a block with a declared state path.
- Markdown support is small. Raw HTML and complex table markup are not supported.
- Auto-scroll uses the nearest scrollable ancestor. Use `scroll: "window"` for the page.
- The three demo blocks are not general-purpose blocks.
- The MCP App makes no network request by default. A remote image needs an explicit CSP origin.
- DSH `0.2.1-rc.2` and `0.2.1-rc.3` are release candidates. Test the adapter after each DSH upgrade.
