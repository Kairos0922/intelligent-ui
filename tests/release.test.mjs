import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;

test("release versions match the workspace", () => {
  const output = execFileSync(process.execPath, ["scripts/check-release.mjs", `v${version}`], {
    encoding: "utf8",
  });
  assert.match(output, new RegExp(`check-release: ${version.replaceAll(".", "\\.")}`));
});

test("release check rejects a mismatched tag", () => {
  assert.throws(() =>
    execFileSync(process.execPath, ["scripts/check-release.mjs", "v9.9.9"], {
      encoding: "utf8",
      stdio: "pipe",
    }),
  );
});
