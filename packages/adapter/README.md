# @intelligent-ui/adapter

The middle layer between `@intelligent-ui/core` and an agent host. It mounts the runtime, maps each interaction to one action shape, formats the `[iui-action]` envelope, and supplies the theme and lifecycle bridge.

A host adapter should not use a core event name or a block implementation directly.

**Status:** Version 0.2.1 is a source release. The package is not on npm.

## Install from GitHub

Build the repository tarballs first:

```bash
git clone https://github.com/Kairos0922/intelligent-ui.git
cd intelligent-ui
npm ci
npm run build
npm run pack:all
```

Then install the core and adapter packages in your application:

```bash
npm install /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-core-0.2.1.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-adapter-0.2.1.tgz
```

Read [README.md](https://github.com/Kairos0922/intelligent-ui/blob/main/README.md) for the full source install.

After the first npm release, use `npm install @intelligent-ui/core @intelligent-ui/adapter`.

## 3-step quickstart

```ts
// 1. Import the core CSS.
import "@intelligent-ui/core/styles.css";
import { createIuiHost, formatAction } from "@intelligent-ui/adapter";

// 2. Mount the host.
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

// 3. Send data.
await host.connect("/api/chat/stream");
// Other methods: host.show(ops), host.ingest(ndjson), host.apply(op).
```

The adapter does not start a network request unless you pass a URL to `connect()`. The host controls where an action goes.

## Action shape

```ts
type IuiHostAction =
  | { kind: "prompt"; text: string; answerId?: string }
  | { kind: "block"; envelope: IuiActionEnvelope };
```

A `prompt` action is a suggestion chip, a form button, or other raw user intent. Send it as a normal user message.

A `block` action is a block interaction. Send `formatAction(action)`. It gives one line with the `[iui-action]` prefix.

```ts
formatAction(action);
// "[iui-action] { ... }"
```

## Action policy

The default policy is `agent`. It sends prompts and the `select`, `step`, `view`, and `filter` block events.

| Policy | Action that leaves the UI |
|---|---|
| `prompt` | Raw prompts only. |
| `agent` | Prompts and the `select`, `step`, `view`, and `filter` events. |
| `all` | All block events, including a checkbox or a copy action. |
| Function | The function selects each event. |

The `submit` event is not in the `agent` policy. A form sends a raw prompt on submit. If the adapter also sends the block event, the agent receives the same interaction two times.

Local state stays in the UI unless the host selects a policy that sends it.

## API

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

## Theme

Use `inherit` when the host supplies all colors. Use `auto` when the host follows the system color scheme.

Set `darkSelector` when the host uses a dark marker other than `.dark` or `[data-theme="dark"]`. Pass `tokens` to map host values to `--iui-*` variables.

## Security

The adapter does not trust a model payload. It sends only the events that the selected policy permits. The host must keep a secret out of all prompts, tool results, and block properties.

Read [SECURITY.md](https://github.com/Kairos0922/intelligent-ui/blob/main/SECURITY.md) and [ADAPTERS.md](https://github.com/Kairos0922/intelligent-ui/blob/main/ADAPTERS.md).

## License

MIT. Read [LICENSE](LICENSE) and [NOTICE.md](https://github.com/Kairos0922/intelligent-ui/blob/main/NOTICE.md).
