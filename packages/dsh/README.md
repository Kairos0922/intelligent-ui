# @intelligent-ui/dsh

DeepSeek Harness (DSH) adapter for Intelligent UI. It registers the `render_iui` tool, gives the model the IUI-1 rules, and renders the result as a keyed tool row in the DSH web client.

- Host: DSH `0.2.1-rc.2`, web profile.
- Runtime: DSH supplies React.
- Package entries: `.` for the server and `./client` for the browser. The `dsh.client` field declares the client entry.

**Status:** Version 0.2.0 is a source release. The package is not on npm.

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

Open `$DSH_HOME/profiles/web/cordis.patch.yml`. Add one item to the existing list:

```yaml
- insert:
    - id: intelligent-ui
      name: "@intelligent-ui/dsh"
```

Keep the other items in the file. The `- insert:` wrapper is necessary. Use the package name, not an absolute path. DSH finds the client entry in the profile `node_modules`.

If you use a separate overlay, start DSH with `--patch` and put the same item in that file.

### 3. Restart DSH

```bash
dsh web
```

Ask for an interface, for example:

> Compare MCP and the AI SDK for local agents in an interactive card with tabs.

The model must call `render_iui`. DSH shows one keyed tool row. Expand the row if DSH groups it under "Called tools".

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

The synthetic replay test passes in light and dark themes. It covers:

- Keyed toolview replay.
- The no-meta fallback.
- The matrix, code, formula, and flashcard blocks.
- Tab and chip actions.
- Theme changes.
- Hot module replacement cleanup.

The profile was signed out. A live model call and a live action update are not tested. Test both cases in a signed-in profile before you call the adapter production-ready.

Read [SMOKE.md](https://github.com/Kairos0922/intelligent-ui/blob/main/packages/dsh/SMOKE.md) for the test record.

## Remove the adapter

1. Remove the `intelligent-ui` item from `cordis.patch.yml`.
2. Run `dsh plugin --profile web remove @intelligent-ui/dsh`.
3. Restart DSH.

An old session uses the generic DSH tool row. The adapter removes its stylesheet, React roots, and theme listeners when the client plugin unloads.

## Compatibility

- DSH `0.2.1-rc.2` is a release candidate.
- The package uses the DSH `tools`, `systemPrompt`, `slots`, and `sessions` services.
- Test the adapter after each DSH upgrade.
- The client uses the DSH `window.__ModuleLoader__` format and keeps React external.
- The `exports["./client"]` map must use the `default` condition.

## License

MIT. The three demo blocks, local research data, and third-party assets are not part of this package and are not covered by the MIT grant. Read [NOTICE.md](https://github.com/Kairos0922/intelligent-ui/blob/main/NOTICE.md).
