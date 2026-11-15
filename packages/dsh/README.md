# @intelligent-ui/dsh

DeepSeek Harness (DSH) adapter for Intelligent UI. It registers the `render_iui` tool, gives the model the IUI-1 rules, and renders the result as a keyed tool row in the DSH web client.

- Host: DSH `0.2.2-rc.1`, web profile. The peer range accepts `0.2.1-rc.2` and later. This source tree targets `0.2.2-rc.1`. A hosted-provider web smoke passed with an explicit complete-ops second-turn recovery. See [SMOKE.md](SMOKE.md).
- Runtime: DSH supplies React.
- Package entries: `.` for the server and `./client` for the browser. The `dsh.client` field declares the client entry.
- Package contents: one self-contained tarball. The server bundle includes the core validator. The client bundle includes the core and the adapter. The package has no npm runtime dependency on `@intelligent-ui/*`.

**Status:** Version 0.2.2 is a source release. The package is not on npm.

## Function

- A `render_iui` tool validates and cleans each op with the core validator.
- A capability manifest declares only read (`copy_text`, `open_link`) and reversible (`save_note`) actions. Reversible actions must opt into confirmation. Irreversible actions are never declared.
- A system prompt section tells the model when to render an interface and how to answer an `[iui-action]` message. Every render is a complete replacement. The model is told to resend all blocks with stable ids, never a patch or delta op.
- The tool result repeats the recovery instruction when an update renders zero valid ops, so the model can retry with a complete interface.
- A keyed `tool.call.toolview` reads ops from `presentationMeta`.
- A replay without `presentationMeta` reads the ops from the tool arguments.
- A theme bridge maps the `body[data-ds-dark-theme]` marker and the DSH tokens to the core.
- A block action, suggestion chip, or form button returns as one `[iui-action]` user message in the same session.
- Answer actions are confirmed by the core runtime's dialog before `onAction`. A declared block action that needs confirmation uses a host dialog. Cancelling leaves the interface unchanged.

The adapter sets no global CSS reset and makes no network request at render time.

## Install

Use the DSH web profile. The adapter does not support another DSH profile.

### 1. Install the package

Use the DSH tarball from the GitHub release:

```bash
dsh plugin --profile web add /absolute/path/to/intelligent-ui-dsh-0.2.2.tgz
```

The tarball is self-contained. It installs without a registry copy of `@intelligent-ui/core` or `@intelligent-ui/adapter`.

Or build the repository and link the source package:

```bash
git clone https://github.com/Kairos0922/intelligent-ui.git
cd intelligent-ui
npm ci
npm run build
dsh plugin --profile web add link:/absolute/path/to/intelligent-ui/packages/dsh
```

`dsh plugin` uses pnpm inside `$DSH_HOME/profiles/web`. The link uses the built `lib` directory.

The package name command works after npm publication:

```bash
dsh plugin --profile web add @intelligent-ui/dsh
```

### 2. Let the bundle patch add the plugin

DSH `0.2.2-rc.1` reads the `dsh.bundle.patch` field in the package and appends `@intelligent-ui/dsh` to `dsh.profile.bundles` in `$DSH_HOME/profiles/web/package.json`. Check that the list contains the package. If it does not, add it:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@intelligent-ui/dsh"
      ]
    }
  }
}
```

For older hosts, or when you use an overlay, add the plugin to `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: intelligent-ui
      name: "@intelligent-ui/dsh"
```

The `- insert:` wrapper is necessary. Use the package name, not an absolute path. DSH finds the client entry in the profile `node_modules`.

To keep the tool row visible after a turn, set Work details to Verbose:

```yaml
- id: ui-chat
  name: "@deepseek-ai/dsh-client-ui-chat"
  config:
    transcriptView: verbose
```

If the file already has a `ui-chat` item, add `transcriptView: verbose` to that item. Do not add a second item with the same id.

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

An Answer Envelope action returns its name, id, and arguments:

```json
{"action":"save_note","answerId":"a1","payload":{"title":"Q4 review","body":"Revenue +12%"}}
```

`save_note` is reversible and asks for confirmation. The core shows the confirmation dialog before `onAction`. Cancelling sends nothing and leaves the current interface unchanged. `copy_text` and `open_link` are read-only and do not ask. The DSH adapter never declares an irreversible action.

The next user message contains one line with the `[iui-action]` prefix. The model must resend the complete interface with a new `render_iui` call and the same block ids. A delta or `set` op is rejected. The tool result tells the model to retry with a complete interface.

## Test status

A live signed-in test passed on DSH `0.2.1-rc.2` and `0.2.1-rc.3` with adapter `0.2.1`. A deterministic web test passed on DSH `0.2.1-rc.2`, `0.2.1-rc.3`, and `0.2.1-rc.4` with the self-contained `0.2.2` tarball and a local DeepSeek Messages server. The tests cover:

- A `render_iui` call that returned tabs and stats.
- The keyed toolview.
- A real tab click that sent `[iui-action]`.
- A second call with the same block IDs.
- The updated stats block and no console error.

The live tests used DeepSeek-V4.1-Flash. Each run made one click. A model can make a malformed op. The validator keeps the valid ops and reports the issue.

On 2026-11-13, a hosted-provider web smoke passed on DSH `0.2.2-rc.1` with adapter `0.2.2` and `deepseek-flash` (served by `DeepSeek-V4.1-Flash-1017`). It covered the first render, cancel and confirm, the `[iui-action]` message, and a second complete interface. The model's automatic action turn answered in prose. The pre-registered protocol then sent the exact complete ops as a user message. That call rendered the replacement.

A deliberately invalid op was refused by the model before the tool call. The previous valid interface stayed usable. The sanitized record is in [specs/evidence/dsh-smoke.json](https://github.com/Kairos0922/intelligent-ui/blob/main/specs/evidence/dsh-smoke.json).

The deterministic tests used the self-contained tarball in a clean profile. They did not use an account. They check the DSH protocol, tool registration, toolview, and action path. They do not measure model compliance.

The synthetic replay test also passes in light and dark themes. It covers keyed toolview replay and the no-meta fallback. It also covers the matrix, code, formula, and flashcard blocks, tab and chip actions, theme changes, and hot module replacement cleanup.

Read [SMOKE.md](https://github.com/Kairos0922/intelligent-ui/blob/main/packages/dsh/SMOKE.md) for the test record.

## Remove the adapter

1. Remove the `intelligent-ui` item from `cordis.patch.yml`.
2. Run `dsh plugin --profile web remove @intelligent-ui/dsh`.
3. Restart DSH.

An old session uses the generic DSH tool row. The adapter removes its stylesheet, React roots, and theme listeners when the client plugin unloads.

## Compatibility

- The package targets DSH `0.2.2-rc.1`. The peer range accepts `0.2.1-rc.2` and later.
- The peer range is `@deepseek-ai/dsh-tools` `>=0.2.1-rc.2 <0.3.0`.
- DSH compares the runtime version with each `@deepseek-ai/dsh*` peer range and includes prerelease versions. Version 0.2.0 declared `0.2.1-rc.2` exactly. DSH rejected `0.2.1-rc.3` before it loaded the plugin. Version 0.2.1 and later use the range above. No exact-version exemption is necessary.
- DSH 0.2.1 is a release candidate. Test the adapter after each DSH upgrade.
- The package uses the DSH `tools`, `systemPrompt`, `slots`, and `sessions` services.
- The client uses the DSH `window.__ModuleLoader__` format and keeps React external.
- The `exports["./client"]` map must use the `default` condition.

## License

MIT. The three demo blocks, local research data, and third-party assets are not part of this package and are not covered by the MIT grant. Read [NOTICE.md](https://github.com/Kairos0922/intelligent-ui/blob/main/NOTICE.md).
