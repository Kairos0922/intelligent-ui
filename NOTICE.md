# NOTICE

## Project status

Intelligent UI is an independent implementation of the interactive answer-surface pattern. It is not affiliated with, endorsed by, or published by OpenAI. The public repository and the npm packages do not include third-party product UI, OpenAI fonts, private APIs, or copied media.

## MIT scope

The MIT License in [LICENSE](LICENSE) applies to the host-neutral SDK and its support code:

- `clone/` source code, except the paths in the next section
- `packages/adapter/`
- `packages/react/`
- `packages/ai-sdk/`
- `packages/mcp-apps/`
- `packages/dsh/`
- Tests, build scripts, and documentation that the project authors wrote

Each package contains a copy of the MIT License. A package tarball contains only the package output, its README, and its license data.

## Not covered by the MIT License

These paths are not part of the MIT grant:

- `recon/` contains local reverse-engineering evidence. It is ignored by Git. It can contain browser profile data, cookies, and login data. Never commit, publish, or send this path.
- `rea/` contains local analysis output. It is ignored by Git and is not published.
- `report/` contains local research material. It is ignored by Git and is not published.
- `clone/public/` contains third-party research media. It is ignored by Git and is not published.
- The three demo blocks `billSplitter`, `rothCalc`, and `retroGame` recreate third-party demo artifacts. They use the `UNLICENSED` license. They are not in this public repository, the SDK, or a package tarball.

The three demo blocks are also absent from the default prompt and the default tool schema.

## Data and credentials

Do not commit or upload browser profile data. The `recon/` path is local only. Screenshots in ignored paths can contain third-party content. The `.gitignore` file defines the repository boundary.

## Dependencies

Each package lists its runtime dependencies in `package.json`. The main dependencies are:

| Dependency | License |
|---|---|
| `@modelcontextprotocol/ext-apps` | MIT |
| `@modelcontextprotocol/server` | MIT |
| `zod` | MIT |
| `react` and `react-dom` | MIT |
| `@deepseek-ai/*` | See the upstream package license |
| `vite`, `typescript`, and `@playwright/test` | MIT or Apache-2.0 |

Read the license of each dependency for the full terms.

## Trademarks

The MIT License does not grant permission to use the Intelligent UI name, logo, or `@intelligent-ui` npm scope to imply endorsement. The project maintainers reserve these marks and this scope.

## Third-party assets

The project does not publish third-party product assets. The public repository does not contain third-party shell styles, OpenAI fonts, copied images, or private API data.
