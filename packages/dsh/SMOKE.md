# DSH live and replay smoke test

Date: 2026-10-27

Hosts: DeepSeek Harness Web `0.2.1-rc.2`, `0.2.1-rc.3`, and `0.2.1-rc.4`

Runtime: Node `v26.11.1`, Chromium through Playwright

Environment:

- Live runs: DSH `0.2.1-rc.2` and `0.2.1-rc.3` with adapter `0.2.1`, a temporary signed-in web profile, DeepSeek-V4.1-Flash, and Work details set to Verbose.
- Deterministic runs: DSH `0.2.1-rc.2` npm runtime, the installed `0.2.1-rc.3` application, and DSH `0.2.1-rc.4` npm runtime. These runs used the self-contained `@intelligent-ui/dsh@0.2.2` tarball, a local DeepSeek Messages server, and no account.

The repository contains no credential, token, screenshot, or session data.

## Why DSH rejected 0.2.0

DSH reads each `@deepseek-ai/dsh` or `@deepseek-ai/dsh-*` peer range. It compares the range with the runtime version and includes prerelease versions. Version 0.2.0 declared `@deepseek-ai/dsh-tools` `0.2.1-rc.2` exactly. That range does not include `0.2.1-rc.3`. DSH stops the profile resolution before it loads the plugin. The exact-version exemption is the only override.

Version 0.2.1 changed the peer to `>=0.2.1-rc.2 <0.3.0`. DSH accepts rc.2, rc.3, and rc.4 without an exemption. The install log has no `incompatible` or `exemption` message.

## Result

The table shows the deterministic runs with `@intelligent-ui/dsh@0.2.2` on each host.

| Case | rc.2 | rc.3 | rc.4 |
|---|---|---|---|
| The tarball installs without an exact-version exemption | Pass | Pass | Pass |
| A clean profile installs without a registry copy of core or adapter | Pass | Pass | Pass |
| The model returns a `render_iui` call | Pass | Pass | Pass |
| The keyed toolview renders tabs and stats | Pass | Pass | Pass |
| The initial stats value is `Option A` | Pass | Pass | Pass |
| A real tab click sends one `[iui-action]` message | Pass | Pass | Pass |
| The action uses `blockId` `final-tabs` | Pass | Pass | Pass |
| The next call uses the same block IDs | Pass | Pass | Pass |
| The stats value changes to `Option B` | Pass | Pass | Pass |
| Browser console errors | None | None | None |

The tab click sent this message:

```json
{"action":"select","blockId":"final-tabs","blockType":"tabs","answerId":"a1","payload":{"value":"Option B"}}
```

The initial and final calls reported six valid IUI ops in every run. The model used `final-tabs` and `final-stats` in the initial call and the update call.

## Live signed-in runs

The live runs used adapter `0.2.1` and DeepSeek-V4.1-Flash. Each run made one real tab click. The toolview and action rows passed on both hosts.

The rc.3 model made one malformed markdown op. The validator returned one issue and kept the other five ops. The model corrected the op in a second call. The final view was correct. The rc.2 model made no malformed op.

## Deterministic runs

The deterministic runs used adapter `0.2.2` and a local DeepSeek Messages server. The server returned six valid ops with `final-tabs` and `final-stats`. A Playwright click on Option B sent the action message. The next request contained the same block IDs and `Option B` in the stats block. The tool list contained `render_iui`.

A clean `DSH_HOME` installed the tarball without a registry copy of `@intelligent-ui/core` or `@intelligent-ui/adapter`. The server bundle includes the core validator. The client bundle includes the core and the adapter.

Each run made five Messages requests: the initial prompt, the tool result, the action, the next tool result, and the final update. Each run had one action turn and one unique action message. The browser console and the network log had no error.

## Visibility

DSH folds completed work steps in its default Work details mode. An earlier live run rendered the interface, but the tool row had zero height after the turn completed.

The final runs set `transcriptView: verbose` in the profile patch. The keyed tool row stayed visible, and the real tab click worked. The install steps in [README.md](README.md) include this setting.

## Synthetic replay

The synthetic replay test from version 0.2.0 still passes in light and dark themes. It covers:

- Keyed toolview replay.
- The no-meta fallback.
- A tool call without a result.
- The matrix, code, formula, and flashcard blocks.
- Tab and chip actions.
- Theme changes.
- Hot module replacement removal and restore.

## Limits

- The deterministic runs used a local server, not a signed-in model. They check the DSH protocol, tool registration, toolview, and action path. They do not measure model compliance.
- The live runs used one model and one click for each host version. They do not cover every block or model.
- The rc.3 live model made one malformed op and corrected it. Another model can make a different error.
- The tests check the DSH web profile only. They do not check the DSH desktop profile.
- DSH `0.2.1-rc.2`, `0.2.1-rc.3`, and `0.2.1-rc.4` are release candidates. Run the tests after each DSH upgrade.
- The tests kept screenshots and session records in a local temporary directory. The repository contains no screenshot or session data.

## Test files

- The DSH package is in `packages/dsh/`.
- The install steps are in [README.md](README.md).
- The core test record is in [SDK.md](https://github.com/Kairos0922/intelligent-ui/blob/main/SDK.md).
