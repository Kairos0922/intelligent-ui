#!/usr/bin/env node
/**
 * Documentation guardrail for ASD-STE100 Simplified Technical English.
 *
 * This check is not a full STE validator. It finds selected problems:
 * long sentences, contractions, semicolons, banned words, CJK text,
 * paragraphs with too many sentences, and broken relative links. A human
 * review is still necessary.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const tracked = execFileSync("git", ["ls-files", "-z", "*.md"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const untracked = execFileSync(
  "git",
  ["ls-files", "-z", "--others", "--exclude-standard", "*.md"],
  { cwd: root, encoding: "utf8" }
)
  .split("\0")
  .filter(Boolean);

const files = [...new Set([...tracked, ...untracked])]
  .filter((file) => !/^(rea|recon|report)\//.test(file))
  .filter((file) => existsSync(file))
  .sort();

const contractions =
  /\b(?:can't|won't|don't|doesn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|wouldn't|shouldn't|couldn't|it's|that's|there's|what's|let's|I'm|we're|they're|you're|I've|we've|they've|you've|I'll|we'll|they'll|you'll|I'd|we'd|they'd|you'd)\b/i;
const banned = [
  "seamless",
  "robust",
  "leverag",
  "utiliz",
  "facilitat",
  "effortless",
  "cutting-edge",
  "revolutionary",
  "best-in-class",
  "world-class",
  "agnostic",
  "empower",
  "delight",
  "obviously",
  "clearly",
  "simply",
  "just",
  "powerful",
  "via",
  "e\\.g\\.",
  "i\\.e\\.",
  "etc\\.",
];
const bannedRe = new RegExp(`\\b(?:${banned.join("|")})\\b`, "i");
const cjk = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
const errors = [];

function add(file, line, message, text = "") {
  errors.push({ file, line, message, text });
}

function checkLinks(file, raw) {
  const masked = raw
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/`[^`]*`/g, (code) => " ".repeat(code.length))
    .replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, " "));

  for (const match of masked.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) continue;

    const path = target.split("#", 1)[0];
    if (!path) continue;

    let decoded = path;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      // Keep the original path if it is not valid percent encoding.
    }
    const absolute = decoded.startsWith("/")
      ? resolve(root, `.${decoded}`)
      : resolve(root, dirname(file), decoded);
    if (!existsSync(absolute)) {
      const line = masked.slice(0, match.index).split("\n").length;
      add(file, line, `Broken relative link: ${target}`, target);
    }
  }
}

function stripInline(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/https?:\/\/\S+/g, "");
}

function sentenceWords(sentence) {
  return sentence
    .replace(/[_*~]/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function splitSentences(text) {
  const safe = text.replace(/(\d)\.(\d)/g, "$1_$2");
  return safe
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/);
  let fence = false;
  let frontMatter = false;
  let paragraph = [];
  let paragraphLine = 0;

  const flushParagraph = (line) => {
    if (paragraph.length === 0) return;
    const count = splitSentences(paragraph.join(" ")).length;
    if (count > 6) {
      add(file, paragraphLine, `Paragraph has ${count} sentences. Maximum is 6.`);
    }
    paragraph = [];
    paragraphLine = line;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const rawLine = lines[index];

    if (lineNo === 1 && rawLine.trim() === "---") {
      frontMatter = true;
      continue;
    }
    if (frontMatter) {
      if (rawLine.trim() === "---") frontMatter = false;
      continue;
    }
    if (/^\s*(```|~~~)/.test(rawLine)) {
      fence = !fence;
      flushParagraph(lineNo);
      continue;
    }
    if (fence) continue;

    if (rawLine.includes("\t")) {
      add(file, lineNo, "Tab character.");
    }
    if (/\s+$/.test(rawLine)) {
      add(file, lineNo, "Trailing whitespace.");
    }
    if (cjk.test(rawLine)) {
      add(file, lineNo, "CJK text is not permitted in an English document.");
    }

    const isHeading = /^\s{0,3}#{1,6}\s/.test(rawLine);
    const isTable = /^\s*\|/.test(rawLine);
    const isList = /^\s*(?:[-*+]|\d+\.)\s+/.test(rawLine);
    const isQuote = /^\s*>\s?/.test(rawLine);

    let text = rawLine
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
      .replace(/^\s*\[[ xX]\]\s*/, "")
      .replace(/<!--.*?-->/g, "");

    if (isTable) {
      text = text
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .replace(/\|/g, ". ");
    }

    text = stripInline(text).replace(/\s+/g, " ").trim();
    if (!text) {
      flushParagraph(lineNo);
      continue;
    }

    if (contractions.test(text)) {
      add(file, lineNo, "Contraction.", text);
    }
    if (text.includes(";")) {
      add(file, lineNo, "Semicolon in prose.", text);
    }
    if (bannedRe.test(text)) {
      add(file, lineNo, `Banned word: ${text.match(bannedRe)?.[0]}.`, text);
    }

    if (!isHeading && !isTable) {
      for (const sentence of splitSentences(text)) {
        const words = sentenceWords(sentence);
        if (words > 25) {
          add(file, lineNo, `Sentence has ${words} words. Maximum is 25.`, sentence);
        }
      }
    }

    if (!isHeading && !isTable && !isList && !isQuote) {
      if (paragraph.length === 0) paragraphLine = lineNo;
      paragraph.push(text);
    } else {
      flushParagraph(lineNo);
    }
  }
  flushParagraph(lines.length + 1);
  checkLinks(file, raw);
}

if (errors.length > 0) {
  for (const error of errors) {
    process.stderr.write(
      `${error.file}:${error.line}: ${error.message}${error.text ? `\n  ${error.text.slice(0, 200)}` : ""}\n`
    );
  }
  process.stderr.write(`\ncheck:docs found ${errors.length} problem(s) in ${files.length} file(s).\n`);
  process.exit(1);
}

process.stdout.write(`check:docs passed ${files.length} Markdown file(s).\n`);
