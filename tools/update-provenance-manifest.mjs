#!/usr/bin/env node
// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const {
  PROJECT_PROVENANCE,
  contentClass,
  isAssetClass,
  signaturePolicy,
} = require("./provenance-policy.cjs");
const manifestPath = PROJECT_PROVENANCE.manifestPath;
const fromIndex = process.argv.includes("--index");

function repositoryFiles() {
  const args = fromIndex
    ? ["ls-files", "--cached", "-z"]
    : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"];
  const output = execFileSync(
    "git",
    args,
    { cwd: root },
  );
  return output
    .toString("utf8")
    .split("\0")
    .filter((item) => item && item !== manifestPath)
    .sort();
}

function fileBytes(relativePath) {
  if (fromIndex) {
    return execFileSync("git", ["show", `:${relativePath}`], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
    });
  }
  const absolutePath = path.join(root, relativePath);
  return lstatSync(absolutePath).isSymbolicLink()
    ? Buffer.from(readlinkSync(absolutePath), "utf8")
    : readFileSync(absolutePath);
}

const entries = repositoryFiles().map((relativePath) => {
  const bytes = fileBytes(relativePath);
  const kind = contentClass(relativePath);
  return {
    path: relativePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    contentClass: kind,
    signaturePolicy: signaturePolicy(relativePath),
  };
});

const firstBinaryByHash = new Map();
for (const entry of entries) {
  if (!isAssetClass(entry.contentClass)) continue;
  const original = firstBinaryByHash.get(entry.sha256);
  if (original) entry.aliasOf = original;
  else firstBinaryByHash.set(entry.sha256, entry.path);
}

const manifest = {
  schema: PROJECT_PROVENANCE.manifestSchema,
  creator: PROJECT_PROVENANCE.creator,
  workId: PROJECT_PROVENANCE.workId,
  workVersion: PROJECT_PROVENANCE.workVersion,
  claim: PROJECT_PROVENANCE.claim,
  canonicalRepository: PROJECT_PROVENANCE.canonicalRepository,
  creatorUrl: PROJECT_PROVENANCE.creatorUrl,
  hashAlgorithm: PROJECT_PROVENANCE.hashAlgorithm,
  manifestPath,
  manifestSelfExcluded: true,
  rightsBoundary: PROJECT_PROVENANCE.rightsBoundary,
  files: entries,
};

writeFileSync(
  path.join(root, manifestPath),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(
  `Wrote ${manifestPath} with ${entries.length} ${fromIndex ? "index" : "working-tree"} file records.`,
);
