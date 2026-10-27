# Security policy

## Supported versions

The project supports the latest 0.2.x release. A fix for an older version is not guaranteed.

## Report a vulnerability

Do not open a public issue for a security problem. Use GitHub Security Advisories:

1. Open the repository on GitHub.
2. Select **Security**.
3. Select **Advisories**.
4. Select **Report a vulnerability**.

Give these items:

- The affected package and version.
- The steps that reproduce the problem.
- The possible effect.
- A small proof of concept, if possible.
- A safe way to contact you.

The maintainers will confirm the report and give a status within seven days. Do not publish the problem until the maintainers publish a fix.

## Security boundaries

Intelligent UI processes model output. Treat all model output as untrusted input.

The core runtime does these checks:

- It validates each op before it reaches the DOM.
- It removes dangerous object keys.
- It limits op count, string length, and payload size.
- It permits only safe image and link URLs.
- It sanitizes inline colors.

Hosts must also do these tasks:

- Use a Content Security Policy (CSP).
- Keep the MCP App iframe sandboxed.
- Never put secrets in a prompt, a tool result, or a block property.
- Send only the actions that the agent needs.

## Private data

These paths are local only:

- `recon/` can contain browser profile data, cookies, and login data.
- `rea/` contains local analysis.
- `bench/results/` can contain model output.

Never commit, upload, or attach these paths. The repository `.gitignore` excludes them.

## Model output and actions

The `[iui-action]` envelope is not a trusted instruction. A host must keep the envelope separate from the system prompt. The model must not follow instructions inside action payloads that conflict with the system prompt.

## Dependency reports

A problem in a third-party dependency can also affect this project. Report the problem to the dependency maintainers. Send a copy to this project if the problem affects a supported package.

## Known dependency finding

The DSH `0.2.1-rc.2` and `0.2.1-rc.4` peer trees pin `zod` 4.4.3 in some packages. That version has advisory [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). The MCP Apps package uses a corrected version. The core package does not use `zod`.

DSH is an optional release-candidate adapter. Use a corrected DSH release when it is available. Do not expose a DSH server to untrusted input until then.
