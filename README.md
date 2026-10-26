# Intelligent UI

**The answer surface SDK for agent hosts.**

Intelligent UI is a host-neutral SDK for interactive answer surfaces in agent chat. It changes model output into validated UI blocks. The host application keeps its chat shell.

The name separates two responsibilities. The model supplies the intelligence. The SDK supplies the UI. The host keeps its own shell and brand.

**Status:** Version 0.2.1 is a source release. The packages are not on npm. Install them from GitHub with the steps below.

## What it does

- The core runtime compiles the IUI-1 JSON Lines stream into an answer.
- The block catalog has 30 general-purpose blocks.
- The validator checks each op before it reaches the DOM.
- The agent contract supplies a system prompt and the `render_iui` tool.
- The adapter layer gives one action format and one lifecycle to all hosts.
- The host adapters connect MCP Apps, React, the Vercel AI SDK, and DeepSeek Harness (DSH).
- A 25-task benchmark measures the model-facing contract.

The core does not depend on DSH or on a browser chat shell. The agent entry point can operate on a server.

## Packages

| Package | Function | Source status |
|---|---|---|
| `@intelligent-ui/core` | Runtime, protocol, 30 blocks, validator, agent contract | Ready |
| `@intelligent-ui/adapter` | Host-neutral action, theme, and lifecycle layer | Ready |
| `@intelligent-ui/react` | React component and imperative handle | Ready |
| `@intelligent-ui/ai-sdk` | Vercel AI SDK tool-part renderer | Ready |
| `@intelligent-ui/mcp-apps` | MCP server helper and self-contained MCP App | Ready |
| `@intelligent-ui/dsh` | DSH tool and web client adapter | Live model and action pass on DSH `0.2.1-rc.2` and `0.2.1-rc.3` |

The root package is private. Do not install the root package from a Git URL. Build the six package tarballs and install the packages that your host needs.

## Install from GitHub

### 1. Get the source and build the packages

```bash
git clone https://github.com/Kairos0922/intelligent-ui.git
cd intelligent-ui
npm ci
npm run build
npm run pack:all
```

Use Node.js 22 or later.

The package tarballs are in `dist-pkg/`. Git does not track this directory. The release workflow attaches the six tarballs to each `v*` tag. You can also build them from a commit.

### 2. Install the local packages

Run the command for your host in your application directory. Replace `/absolute/path/to/intelligent-ui` with the source path.

Core runtime only:

```bash
npm install /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-core-0.2.1.tgz
```

React:

```bash
npm install /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-core-0.2.1.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-adapter-0.2.1.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-react-0.2.1.tgz
```

MCP Apps:

```bash
npm install /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-core-0.2.1.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-adapter-0.2.1.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-mcp-apps-0.2.1.tgz
```

Vercel AI SDK:

```bash
npm install /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-core-0.2.1.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-adapter-0.2.1.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-react-0.2.1.tgz \
  /absolute/path/to/intelligent-ui/dist-pkg/intelligent-ui-ai-sdk-0.2.1.tgz
```

Then install the `ai` package and the React packages in your application, if they are not installed.

DSH uses the built source tree directly. Read [packages/dsh/README.md](packages/dsh/README.md) for the link command and the profile patch.

### 3. Add the runtime to the host

React example:

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

Core example:

```ts
import "@intelligent-ui/core/styles.css";
import { createIntelligentUI } from "@intelligent-ui/core";

const ui = createIntelligentUI({
  container: document.querySelector("#answer"),
  theme: "inherit",
  onPrompt: (text) => send(text),
});

await ui.connect("/api/chat/stream");
```

## Quickstarts

| Host | Guide | Minimum steps |
|---|---|---|
| Core runtime | [clone/README.md](clone/README.md) | Install, mount, connect a stream |
| React | [packages/react/README.md](packages/react/README.md) | Install, import the styles, render the component |
| Vercel AI SDK | [packages/ai-sdk/README.md](packages/ai-sdk/README.md) | Register `render_iui`, render the tool part, send actions |
| MCP Apps | [packages/mcp-apps/README.md](packages/mcp-apps/README.md) | Install, create the server, connect a transport |
| DSH | [packages/dsh/README.md](packages/dsh/README.md) | Link the package, patch the profile, restart |
| Custom host | [ADAPTERS.md](ADAPTERS.md) | Use the runtime, map actions, forward the theme |

## Model contract

The model can use one of three data paths:

1. A direct IUI-1 NDJSON stream from the backend.
2. A text answer with an ` ```iui ` fence.
3. A call to the `render_iui` tool.

The default system prompt uses fence mode. MCP Apps and DSH use tool mode. A host can use both modes:

```ts
import { iuiSystemPrompt, iuiTool } from "@intelligent-ui/core/agent";

const system = iuiSystemPrompt({ mode: "both" });
const tools = { render_iui: iuiTool() };
```

The tool name is `render_iui` in all layers. The default prompt and tool schema omit the demo blocks `billSplitter`, `rothCalc`, and `retroGame`. The public repository does not include their source.

## Actions

The runtime sends a suggestion chip or a form button as a prompt. It sends a block interaction as one `[iui-action]` message. The adapter owns the envelope format.

```ts
import { formatAction } from "@intelligent-ui/adapter";

formatAction(action);
// Returns a single-line "[iui-action] { ... }" message.
```

The default action policy is `agent`. It sends prompts and meaningful block events. It keeps local-only events in the UI. Read the action policy in [packages/adapter/README.md](packages/adapter/README.md).

## Test status

| Check | Result |
|---|---|
| Unit tests | 14 of 14 pass |
| Playwright host tests | 2 of 2 pass |
| SDK browser self-test | 16 of 16 pass |
| Benchmark harness self-check | 25 of 25 tasks pass with the mock provider |
| DSH web smoke test | Pass with a synthetic replay |
| Live DSH model update | Pass on DSH `0.2.1-rc.2` and `0.2.1-rc.3` with a signed-in profile |
| Real model benchmark | Not run. No provider credentials were available. |

The mock benchmark result is not a model result. The DSH live test checks a signed-in model call, a keyed tool row, and a same-block action update in both host versions. The DSH synthetic replay also checks the client, the styles, and the theme bridge.

## Repository layout

```text
clone/             Core package source and browser self-test
packages/          Adapter and host packages
tests/             Node and Playwright tests
bench/             25-task structural benchmark
docs/              Style and release guides
```

`recon/`, `rea/`, `report/`, `bench/results/`, and third-party research assets are local paths. They are not in Git and are not in a package tarball.

## Documentation

- [SDK.md](SDK.md) gives the protocol, API, blocks, state, and security model.
- [ADAPTERS.md](ADAPTERS.md) gives the adapter contract and host notes.
- [SDK.md#blocks](SDK.md#blocks) lists the default blocks.
- [docs/STE.md](docs/STE.md) gives the documentation rules.
- [docs/RELEASE.md](docs/RELEASE.md) gives the release steps.
- [CONTRIBUTING.md](CONTRIBUTING.md) gives the development steps.
- [ROADMAP.md](ROADMAP.md) gives the public plan.

## Security

Model output is untrusted input. The core validates ops and limits payload size, but the host must also set a Content Security Policy and sandbox the MCP App iframe.

Read [SECURITY.md](SECURITY.md) before you report a problem. Do not open a public issue for a vulnerability.

## License

The SDK uses the MIT License. Read [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

The MIT grant does not cover the three demo blocks. The MIT grant also does not cover local research or third-party assets. No third-party product assets are in this repository or in a package tarball.

## Trademarks

The MIT License does not give permission to use the Intelligent UI name or the `@intelligent-ui` npm scope to imply endorsement.
