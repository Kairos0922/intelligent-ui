# DSH live smoke test

Date: 2026-10-26

Hosts: DeepSeek Harness Web `0.2.1-rc.2` and `0.2.1-rc.3`

Runtime: Node `v26.11.1`, Chromium through Playwright

Environment: One temporary web profile for each host, a signed-in DeepSeek account, DeepSeek-V4.1-Flash, and Work details set to Verbose. The repository contains no credential, token, screenshot, or session data.

The rc.2 run used the DSH npm runtime. The rc.3 run used the installed application. Each run used a new session and one real tab click.

## Result

| Case | rc.2 | rc.3 |
|---|---|---|
| Final `@intelligent-ui/dsh@0.2.1` installs without an exact-version exemption | Pass | Pass |
| The model calls `render_iui` | Pass | Pass |
| The keyed toolview renders tabs and stats | Pass | Pass |
| The initial stats value is `Option A` | Pass | Pass |
| A real tab click sends one `[iui-action]` message | Pass | Pass |
| The action uses `blockId` `final-tabs` | Pass | Pass |
| The model calls `render_iui` again with the same block IDs | Pass | Pass |
| The stats value changes to `Option B` | Pass | Pass |
| Browser console errors | None | None |

The tab click sent this message:

```json
{"action":"select","blockId":"final-tabs","blockType":"tabs","answerId":"a1","payload":{"value":"Option B"}}
```

The initial and final tool calls reported six valid IUI ops in both runs. The model used `final-tabs` and `final-stats` in the initial call and the update call.

The rc.3 update had one malformed markdown op. The validator returned one issue and kept the other five ops. The model corrected the op in a second call. The final view was correct. The model made no malformed op in the rc.2 run.

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

- The live test used one model and one click for each host version. It does not cover every block or model.
- The rc.3 model made one malformed op and corrected it. Another model can make a different error.
- The test checks the DSH web profile only. It does not check the DSH desktop profile.
- DSH `0.2.1-rc.2` and `0.2.1-rc.3` are release candidates. Run the live test after each DSH upgrade.
- The test kept screenshots and session records in a local temporary directory. The repository contains no screenshot or session data.

## Test files

- The DSH package is in `packages/dsh/`.
- The install steps are in [README.md](README.md).
- The core test record is in [SDK.md](https://github.com/Kairos0922/intelligent-ui/blob/main/SDK.md).
