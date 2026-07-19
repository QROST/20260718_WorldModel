// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

const path = require("node:path");

const PROJECT_PROVENANCE = Object.freeze({
  manifestSchema: "qrost.provenance-manifest/v1",
  schema: "qrost.provenance/v1",
  creator: "QROST",
  workId: "qrost.fashion-maze",
  workVersion: "0.1.0",
  claim: "declared-project-authorship-and-repository-curation",
  canonicalRepository: "https://github.com/QROST/20260718_WorldModel",
  creatorUrl: "https://qrost.github.io/",
  hashAlgorithm: "sha256",
  manifestPath: "PROVENANCE.json",
  rightsBoundary:
    "QROST attribution covers project authorship, integration, curation, conversion, and publication only; upstream authorship, asset rights, contributor rights, and third-party licenses remain unchanged.",
});

const QROST_PROVENANCE_HEADER = "X-QROST-Provenance";
const QROST_PROVENANCE_VALUE =
  `work=${PROJECT_PROVENANCE.workId};v=1;maintainer=${PROJECT_PROVENANCE.creator}`;

const mediaExtensions = new Set([
  ".aac",
  ".avif",
  ".flac",
  ".gif",
  ".heic",
  ".heif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".opus",
  ".otf",
  ".pdf",
  ".png",
  ".svg",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);
const sourceExtensions = new Set([
  ".cjs",
  ".css",
  ".mjs",
  ".sh",
  ".ts",
  ".tsx",
]);
const commentableMetadata = new Set([
  ".env.example",
  ".gitattributes",
  ".gitignore",
  "pnpm-workspace.yaml",
]);

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
  if (relativePath.startsWith("public/audio/") && mediaExtensions.has(extension)) {
    return "project-audio-asset";
  }
  if (relativePath === "next-env.d.ts" || relativePath === "pnpm-lock.yaml") {
    return "generated-project-metadata";
  }
  if (mediaExtensions.has(extension)) return "binary-asset";
  if (sourceExtensions.has(extension)) return "project-source";
  if (extension === ".md" || extension === ".txt") {
    return "project-documentation";
  }
  return "project-metadata";
}

function headerStyleFor(relativePath) {
  if (commentableMetadata.has(relativePath)) return "hash";
  if (
    relativePath === "next-env.d.ts" ||
    relativePath.startsWith("content/authoring/") ||
    relativePath.startsWith("submission/")
  ) {
    return null;
  }
  const extension = path.extname(relativePath).toLowerCase();
  if (!sourceExtensions.has(extension)) return null;
  if (extension === ".css") return "block";
  if (extension === ".sh") return "hash";
  return "slash";
}

function signaturePolicy(relativePath) {
  return headerStyleFor(relativePath) ? "header-and-manifest" : "manifest-only";
}

function isAssetClass(kind) {
  return kind.endsWith("asset");
}

module.exports = {
  PROJECT_PROVENANCE,
  QROST_PROVENANCE_HEADER,
  QROST_PROVENANCE_VALUE,
  contentClass,
  headerStyleFor,
  isAssetClass,
  signaturePolicy,
};
