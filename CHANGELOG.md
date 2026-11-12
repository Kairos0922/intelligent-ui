# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- The optional `answer` op adds answer-level locale, slots, actions, provenance, and assumptions. Answers without this op stay in legacy mode.
- The host capability manifest drives the prompt, the validator, and the answer action bar from one source.
- `createActionRuntime()` provides a host-side action state machine. It covers authorization, confirmation, idempotency, timeout, reconciliation, compensation, and an audit hash chain.
- The adapter forwards manifest-declared actions and answer actions. A rejected action handler reports to `onActionError`.
- Answer-level locale drives number, date, and currency formatting in the core runtime.
- The release workflow checks the tag, package versions, and tarball names.
- A 60-task three-scenario suite covers data analysis, daily travel planning, and daily life. Each scenario registers 20 tasks and reports coverage on its own.
- The scenario runner supports validation-feedback repair calls, conservative JSON wrapping, interaction replay, per-scenario release gates, and a hosted DeepSeek OpenAI-compatible provider.
- The DSH adapter declares only `copy_text`, `open_link`, and `save_note`. It rejects undeclared actions and tells the model to resend a complete interface after an `[iui-action]` message.
- The DSH package carries a `dsh.bundle.patch` layer for DSH `0.2.2-rc.1`.

### Fixed

- The validator removes model-provided operation and audit fields. Model provenance authority is forced to `claimed`.
- The runtime enforces the op limit and the answer byte limit for each answer.
- The `set` op sanitizes URL values and enforces the prop byte limit.
- Server-side validation uses the host-neutral catalog and does not import the DOM registry.
- The `inherit` theme follows the host dark marker and sets the color scheme on the surface.
- The runtime reports duplicate block IDs, unknown `set` targets, mount errors, and render errors.
- The React docs describe mount-only options correctly.
- The AI SDK predicate ignores unrelated dynamic tools.
- Tabs use `aria-selected` and keyboard navigation. Forms use unique radio group names. The map expand control updates `aria-expanded`.
- Lightbox dialogs are scoped to each runtime root and close on reset.
- The DSH client imports the core stylesheet through the package export.

### Tested

- A hosted DeepSeek `deepseek-flash` run (served by `DeepSeek-V4.1-Flash-1017`) completed 19 of 20 data-analysis tasks, 20 of 20 daily-travel tasks, and 20 of 20 daily-life tasks. Each scenario passed its own 90% gate. Overall was 59 of 60.
- The DSH hosted-provider web smoke passed on `0.2.2-rc.1` with `deepseek-flash`. The second turn used an explicit complete-ops recovery. The invalid-op attempt was refused before the tool call.
- A historical local Ollama `qwen2.5:14b` run completed 19 of 20 tasks in each scenario. The local model was deleted after the run.
- The reference fixture completed 60 of 60 tasks. This is contract coverage, not model coverage.

## [0.2.2] - 2026-10-28

This is a source release. The packages are not published on npm.

### Changed

- The DSH adapter keeps support for DSH `0.2.1-rc.2` and `0.2.1-rc.3` and adds validated support for `0.2.1-rc.4`.
- The DSH package is self-contained. The server bundle includes the core validator. The client bundle includes the core and the adapter. A clean profile installs the tarball without a registry copy of `@intelligent-ui/core` or `@intelligent-ui/adapter`.
- The DSH peer range stays `@deepseek-ai/dsh-tools` `>=0.2.1-rc.2 <0.3.0`.

### Fixed

- DSH `0.2.1-rc.2`, `0.2.1-rc.3`, and `0.2.1-rc.4` accept the adapter without an exact-version exemption. DSH compares the runtime version with the peer range and includes prerelease versions. Version 0.2.0 declared `0.2.1-rc.2` exactly. Version 0.2.1 and later use a range.

### Tested

- DSH `0.2.1-rc.2`, `0.2.1-rc.3`, and `0.2.1-rc.4` passed a deterministic web test with a local DeepSeek Messages server and the self-contained tarball.
- Each test rendered tabs and stats, sent one `[iui-action]`, and called `render_iui` again with the same block IDs. The stats value changed from `Option A` to `Option B`.
- The browser console and the network log had no error.
- The tests did not use a signed-in account.

## [0.2.1] - 2026-10-26

This is a source release. The packages are not published on npm.

### Changed

- The DSH adapter supports DSH `0.2.1-rc.2` and `0.2.1-rc.3`.
- The DSH peer range is now `@deepseek-ai/dsh-tools` `>=0.2.1-rc.2 <0.3.0`.
- The DSH install steps set Work details to Verbose. This setting keeps the keyed tool row open after a turn.

### Fixed

- DSH `0.2.1-rc.3` accepts the adapter without an exact-version exemption.

### Tested

- A signed-in DSH web profile passed a live model call and an action update on `0.2.1-rc.2`.
- A signed-in DSH web profile passed the same case on `0.2.1-rc.3`.
- Both tests used DeepSeek-V4.1-Flash and one real tab click.
- The model called `render_iui` again with the same block IDs and the stats block changed.

## [0.2.0] - 2026-10-25

This is a source release. The packages are not published on npm.

### Added

- Host-neutral core runtime with the IUI-1 protocol.
- Thirty general-purpose blocks.
- `matrix`, `code`, `diff`, `fileTree`, `formula`, and `flashcards` blocks.
- State path updates for supported blocks.
- `@intelligent-ui/adapter` host layer.
- React, Vercel AI SDK, MCP Apps, and DeepSeek Harness adapters.
- Self-contained MCP App HTML file.
- Model prompt and `render_iui` tool contract.
- Validation, repair, and safe URL checks.
- MDX-free benchmark with 25 tasks and a mock provider.
- GitHub source build and local tarball install.

### Changed

- The tool name is `render_iui` in all layers.
- The default prompt and tool catalog exclude demo blocks.
- The core package is host-neutral.
- Documentation uses ASD-STE100 Simplified Technical English.
- The public source and packages contain no product-specific shell, branding, sample data, or copied media.
- Package builds omit source maps.

### Fixed

- Calendar state update keeps its custom `select` action.
- Replayed DSH tool rows fall back to tool arguments without presentation metadata.
- Advanced block layouts use mobile and dark theme rules.
- Diff line numbers reset at each hunk.

### Security

- The MCP App makes no network request by default.
- The validator removes dangerous keys and unsafe URLs.
- The release audit checks repository content, tarball content, and source maps.
- `recon/`, browser profiles, and third-party assets stay out of the repository and packages.
- The public repository does not contain the three unlicensed demo blocks.
- The MIT License does not cover local research or third-party assets.

## [0.1.0]

Initial internal prototype. This version is not supported.
