# Release procedure

This procedure prepares a source release. It does not publish packages to npm.

## Before you start

1. Confirm that the `main` branch is clean.
2. Confirm that all repository links use `Kairos0922/intelligent-ui`.
3. Confirm that the Git remote points to the public repository.
4. Confirm that the version is correct in all six `package.json` files.
5. Read [docs/STE.md](STE.md) and run `npm run check:docs`.
6. Run `npm run audit:content`.
7. Run `npm run build` and `npm run typecheck`.
8. Run `node --test tests/*.test.mjs`.
9. Run `npx playwright test`.
10. Run `npm run bench:selfcheck`.
11. Run `npm run pack:all`.
12. Run `npm run audit:pack`.

The audit must show these results:

- The repository has no third-party product content.
- No demo block, `recon/` data, `report/` data, or third-party asset is in a tarball.
- No unresolved `OWNER` placeholder is in a tarball or a repository link.
- No source map is in a tarball.
- Each tarball has the MIT License.
- The MCP App HTML file has no external script or link tag. The iframe makes no network request by default.
- The DSH package has the server and client entries.

Do not attach `bench/results/`, `recon/`, `rea/`, or `report/` to a release.

## Build the release files

```bash
npm ci
npx playwright install chromium
npm run check:docs
npm run audit:content
npm run build
npm test
npm run pack:all
npm run audit:pack
```

The package files are in `dist-pkg/`:

- `intelligent-ui-core-0.2.0.tgz`
- `intelligent-ui-adapter-0.2.0.tgz`
- `intelligent-ui-react-0.2.0.tgz`
- `intelligent-ui-ai-sdk-0.2.0.tgz`
- `intelligent-ui-mcp-apps-0.2.0.tgz`
- `intelligent-ui-dsh-0.2.0.tgz`

## Create the GitHub release

The release workflow in `.github/workflows/release.yml` runs the checks and attaches the six tarballs when you push a tag.

1. Commit the release changes.
2. Create an annotated tag.
3. Push the tag.
4. Open the release page and check the six assets.

```bash
git tag -a v0.2.0 -m "Intelligent UI 0.2.0"
git push origin v0.2.0
```

The workflow uses `gh release create` with `--generate-notes`. If the workflow fails, run the same command on your machine after `npm run pack:all`:

```bash
gh release create v0.2.0 dist-pkg/*.tgz \
  --title "Intelligent UI 0.2.0" \
  --notes-file CHANGELOG.md
```

Use the GitHub account that owns the repository. Replace the version in each command for a new release.

## Test the release download

Use a clean directory. Download the six tarballs and install them:

```bash
mkdir iui-release-test
cd iui-release-test
npm init -y
gh release download v0.2.0 --repo Kairos0922/intelligent-ui --pattern "*.tgz"
npm install ./*.tgz
```

Then import the core package and run a small render test.

## npm release gate

Do not publish to npm until these items are true:

- The `@intelligent-ui` scope belongs to the project.
- The npm account has the correct permissions and two-factor authentication.
- The six tarballs pass the release audit.
- A clean install from the tarballs passes.
- A clean install from the GitHub release passes.
- The README has the registry install steps.
- The version and changelog agree.

After the npm release, test this command in a clean directory:

```bash
npm install @intelligent-ui/core
```

## Update the documentation

After the release, update these items:

- The status line in `README.md`.
- The install steps in each package README.
- The `CHANGELOG.md` date.
- The `ROADMAP.md` release status.
- The host compatibility notes.

Keep the GitHub source install steps. Some users cannot use npm.
