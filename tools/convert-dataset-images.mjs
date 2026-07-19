#!/usr/bin/env node
// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel


import { readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const datasetRoot = path.join(repositoryRoot, "public", "dataset");

async function findPngFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findPngFiles(entryPath);
      return entry.isFile() && path.extname(entry.name).toLowerCase() === ".png"
        ? [entryPath]
        : [];
    }),
  );
  return nested.flat().sort();
}

const pngFiles = await findPngFiles(datasetRoot);
if (pngFiles.length === 0) {
  console.log("Dataset image optimization complete: no PNG files remain.");
  process.exit(0);
}

let sourceBytes = 0;
let outputBytes = 0;
for (const sourcePath of pngFiles) {
  const targetPath = sourcePath.replace(/\.png$/i, ".webp");
  const temporaryPath = `${targetPath}.tmp`;
  const sourceStats = await stat(sourcePath);
  const source = sharp(sourcePath, { failOn: "error" }).rotate();
  const sourceMetadata = await source.metadata();
  const output = await source
    .clone()
    .webp({ quality: 90, effort: 6, smartSubsample: true })
    .toFile(temporaryPath);
  const outputMetadata = await sharp(temporaryPath).metadata();
  const expectedWidth =
    sourceMetadata.orientation && sourceMetadata.orientation >= 5
      ? sourceMetadata.height
      : sourceMetadata.width;
  const expectedHeight =
    sourceMetadata.orientation && sourceMetadata.orientation >= 5
      ? sourceMetadata.width
      : sourceMetadata.height;
  if (
    outputMetadata.format !== "webp" ||
    outputMetadata.width !== expectedWidth ||
    outputMetadata.height !== expectedHeight
  ) {
    await rm(temporaryPath, { force: true });
    throw new Error(`WebP verification failed for ${sourcePath}`);
  }
  await rename(temporaryPath, targetPath);
  await rm(sourcePath);
  sourceBytes += sourceStats.size;
  outputBytes += output.size;
  console.log(
    `${path.relative(repositoryRoot, sourcePath)} -> ${path.relative(repositoryRoot, targetPath)}`,
  );
}

console.log(
  `Optimized ${pngFiles.length} images: ${(sourceBytes / 1_048_576).toFixed(2)} MiB -> ${(outputBytes / 1_048_576).toFixed(2)} MiB.`,
);
