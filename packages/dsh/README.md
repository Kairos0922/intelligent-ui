# @intelligent-ui/dsh

DeepSeek Harness (DSH) adapter for Intelligent UI. It registers the `render_iui` tool, gives the model the IUI-1 rules, and renders the result as a keyed tool row in the DSH web client.

- Host: DSH `0.2.1-rc.2` and `0.2.1-rc.3`, web profile.
- Runtime: DSH supplies React.
- Package entries: `.` for the server and `./client` for the browser. The `dsh.client` field declares the client entry.

**Status:** Version 0.2.1 is a source release. The package is not on npm.

## Function

- A `render_iui` tool validates and cleans each op with the core validator.
- A system prompt section tells the model when to render an interface and how to answer an `[iui-action]` message.
- A keyed `tool.call.toolview` reads ops from `presentationMeta`.
- A replay without `presentationMeta` reads the ops from the tool arguments.
- A theme bridge maps the `body[data-ds-dark-theme]` marker and the DSH tokens to the core.
- A block action, suggestion chip, or form button returns as one `[iui-action]` user message in the same session.

The adapter sets no global CSS reset and makes no network request at render time.

## Install from source

Use the DSH web profile. The adapter does not support another DSH profile.

### 1. Build and link the package

Build the repository:

```bash
git clone https://github.com/Kairos0922/intelligent-ui.git
cd intelligent-ui
npm ci
npm run build
```

Link the package in the web profile:

```bash
dsh plugin --profile web add link:/absolute/path/to/intelligent-ui/packages/dsh
```

`dsh plugin` uses pnpm inside `$DSH_HOME/profiles/web`. The link uses the dependencies in the repository `node_modules` directory.

The package name command works after npm publication:

```bash
dsh plugin --profile web add @intelligent-ui/dsh
```

### 2. Add the plugin to the profile patch

Open `$DSH_HOME/profiles/web/cordis.patch.yml`. Add these items to the existing list:

```yaml
- insert:
    - id: intelligent-ui
      name: "@intelligent-ui/dsh"
- id: ui-chat
  name: "@deepseek-ai/dsh-client-ui-chat"
  config:
    transcriptView: verbose
```

The `- insert:` wrapper is necessary. Use the package name, not an absolute path. DSH finds the client entry in the profile `node_modules`.

The `ui-chat` item sets Work details to Verbose. This setting keeps the tool row open after a turn completes. If the file already has a `ui-chat` item, add `transcriptView: verbose` to that item. Do not add a second item with the same id.

If you use a separate overlay, start DSH with `--patch` and put the same items in that file.

### 3. Restart DSH

```bash
dsh web
```

Ask for an interface, for example:

> Compare MCP and the AI SDK for local agents in an interactive card with tabs.

The model must call `render_iui`. DSH shows one keyed tool row. With Work details set to Verbose, the interface stays visible after the turn. In other modes, DSH can fold completed tool rows.

## Action format

A tab, select, step, filter, or view interaction returns this shape:

```json
{"action":"select","blockId":"compare","blockType":"tabs","payload":{"value":"MCP"}}
```

A suggestion chip or form button returns this shape:

```json
{"action":"prompt","answerId":"a1","payload":{"text":"Compare the costs"}}
```

The next user message contains one line with the `[iui-action]` prefix. The model must update the block with a new `render_iui` call. Plain prose is not sufficient.

## Test status

A live signed-in test passed on both host versions. It covers:

- A real model call that used `render_iui`.
- The keyed toolview with tabs and stats.
- A real tab click that sent `[iui-action]`.
- A second model call with the same block IDs.
- The updated stats block and no console error.

The test used DeepSeek-V4.1-Flash. Each run made one click. A model can make a malformed op. The validator keeps the valid ops and reports the issue.

The synthetic replay test also passes in light and dark themes. It covers keyed toolview replay and the no-meta fallback. It also covers the matrix, code, formula, and flashcard blocks, tab and chip actions, theme changes, and hot module replacement cleanup.

Read [SMOKE.md](https://github.com/Kairos0922/intelligent-ui/blob/main/packages/dsh/SMOKE.md) for the test record.

## Remove the adapter

1. Remove the `intelligent-ui` item from `cordis.patch.yml`.
2. Run `dsh plugin --profile web remove @intelligent-ui/dsh`.
3. Restart DSH.

An old session uses the generic DSH tool row. The adapter removes its stylesheet, React roots, and theme listeners when the client plugin unloads.

## Compatibility

- The package is tested with DSH `0.2.1-rc.2` and `0.2.1-rc.3`.
- The peer range is `>=0.2.1-rc.2 <0.3.0`.
- DSH 0.2.1 is a release candidate. Test the adapter after each DSH upgrade.
- The package uses the DSH `tools`, `systemPrompt`, `slots`, and `sessions` services.
- The client uses the DSH `window.__ModuleLoader__` format and keeps React external.
- The `exports["./client"]` map must use the `default` condition.

## License

MIT. The three demo blocks, local research data, and third-party assets are not part of this package and are not covered by the MIT grant. Read [NOTICE.md](https://github.com/Kairos0922/intelligent-ui/blob/main/NOTICE.md).
