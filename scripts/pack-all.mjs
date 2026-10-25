import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const out = "dist-pkg";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const workspaces = [
  "@intelligent-ui/core",
  "@intelligent-ui/adapter",
  "@intelligent-ui/react",
  "@intelligent-ui/ai-sdk",
  "@intelligent-ui/mcp-apps",
  "@intelligent-ui/dsh",
];

for (const workspace of workspaces) {
  const result = spawnSync("npm", ["pack", "-w", workspace, "--pack-destination", out], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\nTarballs in ${out}/ — publish them under your own npm scope.`);
