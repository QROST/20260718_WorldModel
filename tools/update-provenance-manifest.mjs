#!/usr/bin/env node
// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = "PROVENANCE.json";
const binaryExtensions = new Set([".m4a", ".ogg", ".webp"]);
const sourceExtensions = new Set([
  ".cjs",
  ".css",
  ".mjs",
  ".sh",
  ".ts",
  ".tsx",
]);

function repositoryFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root },
  );
  return output
    .toString("utf8")
    .split("\0")
    .filter((item) => item && item !== manifestPath)
    .sort();
}

function fileBytes(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return lstatSync(absolutePath).isSymbolicLink()
    ? Buffer.from(readlinkSync(absolutePath), "utf8")
    : readFileSync(absolutePath);
}

function contentClass(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  if (relativePath.startsWith("content/authoring/")) {
    return "imported-authoring-reference";
  }
  if (relativePath.startsWith("submission/oneshot/")) {
    return "independent-submission-artifact";
  }
  if (relativePath.startsWith("public/dataset/")) {
    return "curated-source-asset";
  }
  if (relativePath.startsWith("public/audio/") && binaryExtensions.has(extension)) {
    return "project-audio-asset";
  }
  if (relativePath === "next-env.d.ts" || relativePath === "pnpm-lock.yaml") {
    return "generated-project-metadata";
  }
  if (binaryExtensions.has(extension)) return "binary-asset";
  if (sourceExtensions.has(extension)) return "project-source";
  if (extension === ".md" || extension === ".txt") {
    return "project-documentation";
  }
  return "project-metadata";
}

function signaturePolicy() {
  return "manifest-only";
}

const entries = repositoryFiles().map((relativePath) => {
  const bytes = fileBytes(relativePath);
  const kind = contentClass(relativePath);
  return {
    path: relativePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    contentClass: kind,
    signaturePolicy: signaturePolicy(relativePath, kind),
  };
});

const firstBinaryByHash = new Map();
for (const entry of entries) {
  if (!entry.contentClass.endsWith("asset")) continue;
  const original = firstBinaryByHash.get(entry.sha256);
  if (original) entry.aliasOf = original;
  else firstBinaryByHash.set(entry.sha256, entry.path);
}

const manifest = {
  schema: "qrost.provenance-manifest/v1",
  creator: "QROST",
  workId: "qrost.fashion-maze",
  claim: "declared-authorship-and-repository-curation",
  canonicalRepository: "https://github.com/QROST/20260718_WorldModel",
  hashAlgorithm: "sha256",
  manifestPath,
  manifestSelfExcluded: true,
  rightsBoundary:
    "QROST attribution does not replace upstream authorship, asset rights, or third-party licenses.",
  files: entries,
};

writeFileSync(
  path.join(root, manifestPath),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(`Wrote ${manifestPath} with ${entries.length} file records.`);
