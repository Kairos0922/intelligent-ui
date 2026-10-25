# @intelligent-ui/ai-sdk

Renderer for a Vercel AI SDK tool part from the `render_iui` tool.

The package does not import the `ai` package. `IuiToolPart` accepts the minimal structural shape of a tool part. This design supports compatible AI SDK versions without a hard dependency.

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

Then install the Intelligent UI packages and the AI SDK peer:

```bash
npm install /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-core-0.2.0.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-adapter-0.2.0.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-react-0.2.0.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-ai-sdk-0.2.0.tgz \
  ai react react-dom
```

After the first npm release, use `npm install @intelligent-ui/ai-sdk ai react react-dom`.

## 3-step quickstart

```tsx
// 1. Import the core CSS.
import "@intelligent-ui/core/styles.css";

// 2. Register the tool on the server.
import { iuiSystemPrompt, iuiTool } from "@intelligent-ui/core/agent";

const result = streamText({
  model,
  messages,
  system: iuiSystemPrompt({ mode: "tool" }),
  tools: { render_iui: iuiTool() },
});

// 3. Render the tool part on the client.
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

## API

| Export | Function |
|---|---|
| `IuiToolPart` | Render ops from a tool part. |
| `isIuiToolPart(part, toolName?)` | Return true for `tool-render_iui` or `dynamic-tool`. |
| `opsFromToolPart(part)` | Read ops from `output` or `input`. |

`opsFromToolPart()` also reads a nested `ops` array, a `structuredContent.ops` value, an `output.ops` value, or a `result.ops` value.

## Tool states

| Part state or data | Render |
|---|---|
| Ops are present | The full `IntelligentUI` surface. |
| `output-error` | The `errorText` row. |
| `output-available` without ops | `No Intelligent UI blocks in this result.` |
| Input streaming or a partial part | `Preparing interface...` |

Set `fallback` to replace the three fallback rows:

```tsx
<IuiToolPart
  part={part}
  onAction={handleAction}
  fallback={() => <MySkeleton />}
/>
```

## Server example

```ts
import { iuiSystemPrompt, iuiTool } from "@intelligent-ui/core/agent";
import { generateText } from "ai";

const result = await generateText({
  model,
  system: iuiSystemPrompt({ mode: "tool" }),
  tools: { render_iui: iuiTool() },
  prompt: "Plan a 3-day trip to Kyoto",
});
```

The core validator cleans the tool arguments before they reach the DOM. `opsFromToolCall()` accepts `{ ops: [...] }` or a bare array.

## Dependencies

`ai` version 5 or later, `react` version 18 or later, and `react-dom` version 18 or later are peer dependencies. `@intelligent-ui/core`, `@intelligent-ui/adapter`, and `@intelligent-ui/react` are runtime dependencies.

## License

MIT. Read [LICENSE](LICENSE) and [NOTICE.md](https://github.com/Kairos0922/intelligent-ui/blob/main/NOTICE.md).
