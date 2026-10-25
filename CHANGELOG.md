# Changelog

All notable changes to this project are documented in this file.

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
