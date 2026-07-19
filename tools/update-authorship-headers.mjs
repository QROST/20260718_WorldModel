#!/usr/bin/env node
// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

import { execFileSync } from "node:child_process";
import {
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootRealPath = realpathSync(root);
const require = createRequire(import.meta.url);
const { headerStyleFor } = require("./provenance-policy.cjs");
const signature = ["Authored by QROST", "2026."].join(", ");
const provenance = [
  "Provenance:",
  "https://github.com/QROST/20260718_WorldModel",
].join(" ");

function gitFiles(args) {
  return execFileSync("git", [...args, "-z"], { cwd: root })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
}

function headerFor(style) {
  if (style === "block") {
    return `/* ${signature} */\n/* ${provenance} */\n`;
  }
  const marker = style === "hash" ? "#" : "//";
  return `${marker} ${signature}\n${marker} ${provenance}\n`;
}

function assertSafeRegularFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const metadata = lstatSync(absolutePath);
  if (metadata.isSymbolicLink()) {
    throw new Error(`Refusing to stamp a symbolic link: ${relativePath}`);
  }
  if (!metadata.isFile()) {
    throw new Error(`Refusing to stamp a non-file path: ${relativePath}`);
  }
  const resolved = realpathSync(absolutePath);
  if (
    resolved !== rootRealPath &&
    !resolved.startsWith(`${rootRealPath}${path.sep}`)
  ) {
    throw new Error(`Refusing to stamp a path outside the repository: ${relativePath}`);
  }
  return absolutePath;
}

function headerState(relativePath, source, style) {
  const signatureCount = source.split(signature).length - 1;
  const provenanceCount = source.split(provenance).length - 1;
  if (signatureCount === 0 && provenanceCount === 0) return "missing";
  if (signatureCount !== 1 || provenanceCount !== 1) {
    throw new Error(`${relativePath} contains a partial or duplicate QROST header.`);
  }

  const lines = source.split("\n");
  const offset =
    lines[0].startsWith("#!") || lines[0] === '"use client";' ? 1 : 0;
  const expectedLines = headerFor(style).trimEnd().split("\n");
  if (
    lines[offset] !== expectedLines[0] ||
    lines[offset + 1] !== expectedLines[1]
  ) {
    throw new Error(`${relativePath} contains a misplaced QROST header.`);
  }
  return "valid";
}

let changed = 0;
for (const relativePath of gitFiles(["ls-files", "--cached"])) {
  const style = headerStyleFor(relativePath);
  if (!style) continue;
  const absolutePath = assertSafeRegularFile(relativePath);
  const source = readFileSync(absolutePath, "utf8");
  if (headerState(relativePath, source, style) === "valid") continue;

  const header = headerFor(style);
  let updated;
  if (source.startsWith("#!")) {
    const newline = source.indexOf("\n");
    if (newline < 0) throw new Error(`${relativePath} has an invalid shebang.`);
    updated = `${source.slice(0, newline + 1)}${header}\n${source.slice(newline + 1)}`;
  } else if (source.startsWith('"use client";\n')) {
    const directive = '"use client";\n';
    updated = `${directive}${header}\n${source.slice(directive.length)}`;
  } else {
    updated = `${header}\n${source}`;
  }
  writeFileSync(absolutePath, updated, "utf8");
  changed += 1;
}

const unsafeUntracked = [];
for (const relativePath of gitFiles([
  "ls-files",
  "--others",
  "--exclude-standard",
])) {
  const style = headerStyleFor(relativePath);
  if (!style) continue;
  const absolutePath = assertSafeRegularFile(relativePath);
  const source = readFileSync(absolutePath, "utf8");
  if (headerState(relativePath, source, style) === "missing") {
    unsafeUntracked.push(relativePath);
  }
}
if (unsafeUntracked.length > 0) {
  throw new Error(
    `Refusing to rewrite untracked source; add it to Git or apply the header explicitly:\n${unsafeUntracked.join("\n")}`,
  );
}

console.log(
  `Applied QROST authorship headers to ${changed} tracked files; untracked source was read-only.`,
);
