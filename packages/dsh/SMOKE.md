# DSH 0.2.1-rc.2 smoke test

Date: 2026-10-25

Host: DeepSeek Harness Web `0.2.1-rc.2`

Runtime: Node `v26.11.1`, Chromium through Playwright

Environment: Isolated `DSH_HOME`, web profile, plugin installed by package name through `cordis.patch.yml`, no model credentials in the profile.

## Result

| Case | Result |
|---|---|
| `render_iui` tool description contains 9,596 characters, includes `dayList` and `matrix`, and excludes the demo blocks | Pass |
| Tool result carries `presentationMeta { ops, issues }` | Pass |
| Replay reads ops from `presentationMeta` | Pass |
| Replay without metadata reads `block.args.value("ops")` | Pass |
| A tool call without a result renders from the arguments and DSH stops the turn after restart | Pass with a limit |
| Keyed toolview replaces the generic row and renders a card, tabs, form, and chips | Pass |
| Replay renders `matrix`, `code`, `formula`, and `flashcards` in light and dark themes with scoped CSS | Pass with synthetic data |
| A tab selection sends `[iui-action] {"action":"select",...}` | Pass |
| A suggestion chip sends `[iui-action] {"action":"prompt",...}` | Pass |
| The light and dark host markers update `.iui-theme[data-theme]`, text, border, and `color-scheme` | Pass |
| Hot module replacement removal drops `#iui-dsh-styles`, `.iui-theme`, and `.iui-dsh-tool` to 0 | Pass |
| Hot module replacement restore gives one style element and one toolview with no console error | Pass |

## Limits

- The unresolved-call replay is an approximation of the live `start` phase. After restart, DSH stops the open turn and the client receives a synthetic result. The view still reads the ops from the arguments.
- A live model call and a live "model updates the same block after an action" case need a signed-in profile. The isolated profile returned `ACCOUNT_SIGN_IN_REQUIRED`.
- The test used a synthetic replay with six components. It checks the client build, the scoped CSS, and the theme bridge. It does not check a live model call.
- The test removed and added the `intelligent-ui` item in `cordis.patch.yml` while the page stayed open. The page load count stayed at 1.
- The test kept screenshots in a local temporary directory. The repository contains no screenshot or session data.

## Test files

- The DSH package is in `packages/dsh/`.
- The smoke procedure is in [README.md](https://github.com/Kairos0922/intelligent-ui/blob/main/packages/dsh/README.md).
- The core test record is in [SDK.md](https://github.com/Kairos0922/intelligent-ui/blob/main/SDK.md).
