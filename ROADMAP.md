# Roadmap

This roadmap shows the public plan for Intelligent UI. The maintainers can change the order when user needs or security problems require a change.

## Current release

Version 0.2.0 is a source release. It contains:

- The host-neutral core runtime.
- The IUI-1 protocol and 30 blocks.
- The adapter layer.
- React, Vercel AI SDK, MCP Apps, and DeepSeek Harness adapters.
- A 25-task structural benchmark.

## Next tasks

### 1. GitHub release

- Verify the repository content.
- Add the open-source policy files.
- Build the six package tarballs.
- Attach the tarballs to a GitHub release.
- Write the install steps for the GitHub release.

### 2. npm release

- Confirm ownership of the `@intelligent-ui` scope.
- Confirm the npm credentials.
- Publish the six packages in dependency order.
- Install from the npm registry in a clean environment.
- Mark the registry install steps as supported.

### 3. Live host checks

- Run a live model call in the DSH web profile.
- Verify action writeback in a signed-in session.
- Run the MCP App in the supported host applications.
- Record the host versions and results.

### 4. Benchmark results

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
