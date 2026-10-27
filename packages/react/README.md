# @intelligent-ui/react

React wrapper for `@intelligent-ui/core` and `@intelligent-ui/adapter`.

- One component: `IntelligentUI`.
- Three data sources: `ops`, `wire`, and `source`.
- React 18 or later. Safe with StrictMode.
- No style injection. Import `@intelligent-ui/core/styles.css` yourself.

**Status:** Version 0.2.2 is a source release. The package is not on npm.

## Install from GitHub

Build the repository tarballs first:

```bash
git clone https://github.com/Kairos0922/intelligent-ui.git
cd intelligent-ui
npm ci
npm run build
npm run pack:all
```

Then install the core, adapter, and React packages:

```bash
npm install /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-core-0.2.2.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-adapter-0.2.2.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-react-0.2.2.tgz
```

After the first npm release, use `npm install @intelligent-ui/core @intelligent-ui/react`.

## 3-step quickstart

```tsx
// 1. Import the core CSS one time.
import "@intelligent-ui/core/styles.css";

// 2. Import the component and the action formatter.
import { IntelligentUI } from "@intelligent-ui/react";
import { formatAction } from "@intelligent-ui/adapter";

// 3. Render the answer.
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

## Data sources

The component uses the first source that has a value. The priority is `ops`, then `wire`, then `source`.

| Source | Type | Use |
|---|---|---|
| `ops` | `Op[]` or `null` | A complete answer or a tool result. |
| `wire` | `string` or `null` | A complete IUI-1 NDJSON string. |
| `source` | `StreamSource` or `null` | A URL, `Response`, `ReadableStream`, or `AsyncIterable`. |

## Properties

| Property | Type | Notes |
|---|---|---|
| `ops` | `Op[]` or `null` | Highest priority. |
| `wire` | `string` or `null` | Complete NDJSON. |
| `source` | `StreamSource` or `null` | A stream source. |
| `theme` | `light`, `dark`, `auto`, or `inherit` | Reactive. |
| `tokens` | `Record<string, string>` | Reactive `--iui-*` overrides. |
| `darkSelector` | `string` | Read at mount only. |
| `scroll` | `container`, `window`, or `none` | Read at mount only. |
| `animate` | `boolean` | Read at mount only. |
| `sanitize` | `boolean` | Read at mount only. |
| `actionPolicy` | `prompt`, `agent`, `all`, or a function | Read at event time. |
| `onAction` | `(action: IuiHostAction) => void` | Gives a prompt or an envelope. |
| `onEvent` | `(event: IuiEvent) => void` | Core event callback. |
| `onError` | `(error, event) => void` | Error callback. |
| `onReady` | `(host: IuiHost) => void` | Runs one time after mount. |
| `className` | `string` | Container class. |
| `style` | `CSSProperties` | Container style. |

The `darkSelector`, `scroll`, `animate`, and `sanitize` options are read at mount. A change to one of these options makes a new runtime and removes the current answer.

The `theme`, `tokens`, `actionPolicy`, and callback options update without a remount.

## Imperative handle

```tsx
import { useRef } from "react";
import type { IntelligentUIHandle } from "@intelligent-ui/react";

const ref = useRef<IntelligentUIHandle>(null);

ref.current?.show(ops);       // Reset and render.
ref.current?.apply(op);       // Add one op.
ref.current?.ingest(chunk);   // Add one NDJSON chunk.
ref.current?.reset();         // Clear the answer.
ref.current?.host;            // Access the IuiHost object.
```

## Stream example

```tsx
const [source, setSource] = useState<Response | null>(null);

<IntelligentUI
  source={source}
  onAction={(action) => send(formatAction(action))}
/>;

setSource(await fetch("/api/chat/stream", { method: "POST", body }));
```

A new `source` value stops the previous stream with an `AbortController`.

## Peer dependencies

`react` and `react-dom` version 18 or later. The package is ESM only.

## License

MIT. Read [LICENSE](LICENSE) and [NOTICE.md](https://github.com/Kairos0922/intelligent-ui/blob/main/NOTICE.md).
