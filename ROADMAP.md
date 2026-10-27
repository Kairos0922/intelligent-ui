# Roadmap

This roadmap shows the public plan for Intelligent UI. The maintainers can change the order when user needs or security problems require a change.

## Current release

Version 0.2.2 is a source release. It contains:

- The host-neutral core runtime.
- The IUI-1 protocol and 30 blocks.
- The adapter layer.
- React, Vercel AI SDK, MCP Apps, and DeepSeek Harness adapters.
- A 25-task structural benchmark.
- Live DSH model and action validation on `0.2.1-rc.2` and `0.2.1-rc.3`.
- Deterministic DSH `0.2.1-rc.2`, `0.2.1-rc.3`, and `0.2.1-rc.4` validation with a local Messages server.
- A self-contained DSH tarball with the core and adapter in the bundles.

## Completed

- The GitHub releases contain the six package tarballs.
- A signed-in DSH web profile passed a live model call and action update on `0.2.1-rc.2`.
- A signed-in DSH web profile passed the same live case on `0.2.1-rc.3`.
- A clean DSH profile installed the self-contained tarball. It passed the toolview and action test on rc.2, rc.3, and rc.4 without an exemption.

## Next tasks

### 1. npm release

- Confirm ownership of the `@intelligent-ui` scope.
- Confirm the npm credentials.
- Publish the six packages in dependency order.
- Install from the npm registry in a clean environment.
- Mark the registry install steps as supported.

### 2. Remaining live host checks

- Run the MCP App in the supported host applications.
- Run a signed-in DSH `0.2.1-rc.4` test when an account is available.
- Test the DSH adapter after each DSH upgrade.
- Record the host versions and results.

### 3. Benchmark results

- Run the 25 tasks with three models.
- Include at least one local model endpoint.
- Publish the model IDs, dates, and raw result files.
- Compare fence mode and tool mode.

## Later work

- Cross-block `bind` and `derive` expressions.
- More host adapters.
- A file preview block.
- A map block with an optional network origin.
- A sandbox widget with a strict Content Security Policy.
- More tests for prompt injection and unsafe model output.

## Not planned

- A hosted service.
- A component marketplace.
- A general-purpose chart editor.
- Collection of private user data.
