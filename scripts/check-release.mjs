import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const packages = [
  "clone",
  "packages/adapter",
  "packages/ai-sdk",
  "packages/dsh",
  "packages/mcp-apps",
  "packages/react",
];

const root = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const tag = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];
const version = (tag ?? `v${root.version}`).replace(/^v/, "");
const failures = [];

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  failures.push(`Invalid release version: ${version}`);
}
if (root.version !== version) {
  failures.push(`package.json version ${root.version} does not match ${version}`);
}

const published = [];
for (const dir of packages) {
  const file = resolve(dir, "package.json");
  if (!existsSync(file)) {
    failures.push(`Missing package manifest: ${file}`);
    continue;
  }
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (pkg.version !== version) {
    failures.push(`${pkg.name} version ${pkg.version} does not match ${version}`);
  }
  published.push(pkg);
}

if (process.argv.includes("--tarballs")) {
  const out = resolve("dist-pkg");
  if (!existsSync(out)) {
    failures.push("dist-pkg does not exist. Run npm run pack:all first.");
  } else {
    const expected = new Set(
      published.map((pkg) => `${pkg.name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`),
    );
    const actual = new Set(readdirSync(out).filter((name) => name.endsWith(".tgz")));
    for (const name of expected) {
      if (!actual.has(name)) failures.push(`Missing tarball: dist-pkg/${name}`);
    }
    for (const name of actual) {
      if (!expected.has(name)) failures.push(`Unexpected tarball: dist-pkg/${name}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`check-release: ${failure}`);
  process.exit(1);
}

console.log(
  `check-release: ${version} matches the root package and ${published.length} workspace packages.`,
);
if (process.argv.includes("--tarballs")) console.log("check-release: all six tarball names match.");
