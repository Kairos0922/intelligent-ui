# Contributing

Thank you for your interest in Intelligent UI. This guide shows how to report a problem and how to send a change.

## Report a defect

Open a GitHub issue and use the bug report form. Give these items:

- The version or commit.
- The host and browser.
- The steps that cause the problem.
- The result that you expected.
- The result that you got.
- A small code sample, if possible.

Remove secrets, private data, and `recon/` content from all reports.

## Request a feature

Open a GitHub issue and use the feature request form. Describe the user task. Describe the result that you need. Do not start with a component design.

## Set up the repository

Use Node.js 22 or later. Run these commands:

```bash
git clone https://github.com/Kairos0922/intelligent-ui.git
cd intelligent-ui
npm ci
npm run build
```

## Make a change

1. Create a branch from `main`.
2. Add or change a test for each behavior change.
3. Keep the change small and related to one task.
4. Run the checks.
5. Update the documentation.
6. Open a pull request.

## Run the checks

```bash
npm run check:docs
npm run audit:content
npm run typecheck
npm run test:unit
npm run test:e2e
```

The unit test command runs the build first. The end-to-end test uses Playwright. Install the browser before the first run:

```bash
npx playwright install --with-deps chromium
```

## Documentation

All public documentation must use ASD-STE100 Simplified Technical English. Read [docs/STE.md](docs/STE.md) before you write or change a document.

Use American English spelling. Use short sentences and the active voice. Do not use semicolons or contractions.

## Security and private data

Do not commit these items:

- API keys, tokens, cookies, or browser profile data.
- `recon/`, `rea/`, or `bench/results/` content.
- Third-party research assets under `clone/public/`.
- Files from `report/` or other research material.

Read [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

You agree that your contribution uses the MIT License in [LICENSE](LICENSE). The three demo blocks have a separate `UNLICENSED` license. They are local test fixtures. Do not add demo code to the SDK.

## Pull request review

A maintainer will review the change. The maintainer can ask for a smaller change, a test, or a documentation update. Do not merge your own pull request.
