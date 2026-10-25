#!/usr/bin/env node
/**
 * Release guardrail for the six package tarballs.
 *
 * The check reads only `dist-pkg/*.tgz`. It rejects private paths,
 * unlicensed demo names, secrets, non-English text, and external
 * script, link, or image content in the MCP App.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.cwd(), "dist-pkg");
const files = readdirSync(dir)
  .filter((file) => file.endsWith(".tgz"))
  .sort();

const errors = [];
const fail = (message) => errors.push(message);

if (files.length !== 6) {
  fail(`Expected 6 tarballs in dist-pkg, found ${files.length}.`);
}

const forbiddenPaths = [
  "recon/",
  "rea/",
  "report/",
  "chrome-profile",
  "cookies",
  "login data",
  "clone/public/",
  "src/demo/",
  "billsplitter",
  "rothcalc",
  "retrogame",
];
const textChecks = [
  ["CJK text", /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/],
  ["secret", /OPENAI_API_KEY|IUI_BENCH_API_KEY|eyJhbGciOi|sk-[A-Za-z0-9]{20,}/],
  ["private path", /recon\/|report\/|rea\/|chrome-profile|Login Data|Cookies/i],
  ["local user path", /\/Users\/|\/home\/|[A-Z]:\\Users/i],
  ["demo source", /billSplitter|rothCalc|retroGame/],
  ["unresolved owner placeholder", /\bOWNER\b/],
  ["source map comment", /sourceMappingURL=/],
  [
    "ChatGPT product content",
    /ChatGPT|GPT-?6|GPT‑6|OpenAI|OpenAI Sans|IntelligentUITheme|RoadTripMap|SundayRoast|ConversationPreferences|ConversationComparison|Wardrobe-module|Rocket Youth|Personalize|Pacific Northwest|Cannon Beach|Portland|Seattle|7-speed|Tailwind|Radix/i,
  ],
  ["copied-asset provenance", /\b(?:official|replica|captured)\b/i],
];

for (const file of files) {
  const path = resolve(dir, file);
  const names = execFileSync("tar", ["-tzf", path], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);

  if (!names.includes("package/LICENSE")) {
    fail(`${file}: package/LICENSE is missing.`);
  }

  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower.endsWith(".map")) {
      fail(`${file}: source map ${name}`);
    }
    for (const forbidden of forbiddenPaths) {
      if (lower.includes(forbidden)) {
        fail(`${file}: forbidden path ${name}`);
      }
    }
  }

  const text = execFileSync("tar", ["-xOzf", path], {
    maxBuffer: 100 * 1024 * 1024,
  }).toString("utf8");
  for (const [label, pattern] of textChecks) {
    if (pattern.test(text)) {
      fail(`${file}: found ${label}.`);
    }
  }
}

const dshFile = files.find((file) => file.includes("-dsh-"));
if (!dshFile) {
  fail("The DSH tarball is missing.");
} else {
  const dshNames = execFileSync("tar", ["-tzf", resolve(dir, dshFile)], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  for (const entry of ["package/lib/index.js", "package/lib/client.js"]) {
    if (!dshNames.includes(entry)) fail(`${dshFile}: ${entry} is missing.`);
  }
}

const mcpFile = files.find((file) => file.includes("mcp-apps"));
if (!mcpFile) {
  fail("The MCP Apps tarball is missing.");
} else {
  const html = execFileSync(
    "tar",
    ["-xOf", resolve(dir, mcpFile), "package/dist/app.html"],
    { maxBuffer: 20 * 1024 * 1024 }
  ).toString("utf8");
  const external = [
    ...html.matchAll(
      /<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi
    ),
  ]
    .map((match) => match[1])
    .filter((url) => /^(?:https?:)?\/\//i.test(url));
  if (external.length > 0) {
    fail(`${mcpFile}: external asset reference ${external[0]}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.stderr.write(`\naudit:pack found ${errors.length} problem(s).\n`);
  process.exit(1);
}

process.stdout.write(`audit:pack passed ${files.length} tarball(s).\n`);
