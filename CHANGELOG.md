# Changelog

All notable changes to this project are documented in this file.

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
