#!/usr/bin/env node
/**
 * Repository content guardrail.
 *
 * Rejects ChatGPT product content and copied-asset provenance markers in
 * tracked source, tests, docs, and configuration. The audit scripts are
 * excluded because they contain the patterns they enforce.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const skip = new Set([
  "scripts/audit-content.mjs",
  "scripts/audit-pack.mjs",
]);

const checks = [
  [
    "ChatGPT product content",
    /ChatGPT|GPT-?6|GPT‑6|OpenAI Sans|IntelligentUITheme|RoadTripMap|SundayRoast|ConversationPreferences|ConversationComparison|Wardrobe-module|Rocket Youth|Personalize|Pacific Northwest|Cannon Beach|Portland|Seattle|7-speed|Tailwind|Radix/i,
  ],
  [
    "copied-asset provenance",
    /\b(?:official|replica|captured)\b/i,
  ],
];

const files = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)
  .filter((file) => !skip.has(file))
  .sort();

const errors = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [label, pattern] of checks) {
    const match = pattern.exec(text);
    if (!match) continue;
    const line = text.slice(0, match.index).split("\n").length;
    errors.push(`${file}:${line}: ${label}: ${match[0]}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.stderr.write(`\naudit:content found ${errors.length} problem(s).\n`);
  process.exit(1);
}

process.stdout.write(`audit:content passed ${files.length} file(s).\n`);
