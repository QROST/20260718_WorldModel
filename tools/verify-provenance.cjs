#!/usr/bin/env node
// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const result = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const diagnostics = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (diagnostics.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (value) => value,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => "\n",
      }),
    );
  }
  module._compile(result.outputText, filename);
};

const root = path.join(__dirname, "..");
const {
  PROJECT_PROVENANCE,
  QROST_PROVENANCE_HEADER: POLICY_HEADER,
  QROST_PROVENANCE_VALUE: POLICY_VALUE,
  contentClass,
  isAssetClass,
  signaturePolicy,
} = require("./provenance-policy.cjs");
const manifestPath = PROJECT_PROVENANCE.manifestPath;
const fromIndex = process.argv.includes("--index");
const authorshipSignature = ["Authored by QROST", "2026."].join(", ");
const authorshipProvenance = [
  "Provenance:",
  "https://github.com/QROST/20260718_WorldModel",
].join(" ");
function repositoryBytes(relativePath) {
  if (fromIndex) {
    return execFileSync("git", ["show", `:${relativePath}`], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
    });
  }
  const absolutePath = path.join(root, relativePath);
  const stat = fs.lstatSync(absolutePath);
  return stat.isSymbolicLink()
    ? Buffer.from(fs.readlinkSync(absolutePath), "utf8")
    : fs.readFileSync(absolutePath);
}

const manifest = JSON.parse(repositoryBytes(manifestPath).toString("utf8"));
const {
  QROST_PROVENANCE,
  QROST_PROVENANCE_HEADER,
  QROST_PROVENANCE_VALUE,
  createQrostRunReceipt,
  serializeQrostRunReceipt,
} = require(path.join(root, "lib/qrost-provenance.ts"));

const errors = [];
const fail = (message) => errors.push(message);
const check = (condition, message) => {
  if (!condition) fail(message);
};

const repositoryFiles = execFileSync(
  "git",
  fromIndex
    ? ["ls-files", "--cached", "-z"]
    : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root },
)
  .toString("utf8")
  .split("\0")
  .filter((item) => item && item !== manifestPath)
  .filter((item) => fromIndex || fs.existsSync(path.join(root, item)))
  .sort();
const manifestFiles = manifest.files.map((entry) => entry.path);

check(manifest.schema === PROJECT_PROVENANCE.manifestSchema, "manifest schema drifted");
check(manifest.creator === PROJECT_PROVENANCE.creator, "manifest creator drifted");
check(manifest.workId === PROJECT_PROVENANCE.workId, "manifest work id drifted");
check(manifest.workVersion === PROJECT_PROVENANCE.workVersion, "manifest version drifted");
check(manifest.claim === PROJECT_PROVENANCE.claim, "manifest claim drifted");
check(
  manifest.canonicalRepository === PROJECT_PROVENANCE.canonicalRepository,
  "manifest canonical repository drifted",
);
check(manifest.creatorUrl === PROJECT_PROVENANCE.creatorUrl, "manifest creator URL drifted");
check(manifest.hashAlgorithm === PROJECT_PROVENANCE.hashAlgorithm, "manifest hash drifted");
check(manifest.manifestPath === manifestPath, "manifest path drifted");
check(manifest.rightsBoundary === PROJECT_PROVENANCE.rightsBoundary, "rights boundary drifted");
check(manifest.manifestSelfExcluded === true, "manifest self-exclusion must be explicit");
check(
  JSON.stringify(manifestFiles) === JSON.stringify(repositoryFiles),
  "manifest paths do not exactly cover the non-ignored repository files",
);

for (const entry of manifest.files) {
  if (!fromIndex && !fs.existsSync(path.join(root, entry.path))) {
    fail(`manifest path is missing: ${entry.path}`);
    continue;
  }
  const bytes = repositoryBytes(entry.path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  check(entry.sha256 === digest, `SHA-256 mismatch: ${entry.path}`);
  check(entry.bytes === bytes.length, `byte length mismatch: ${entry.path}`);
  check(entry.contentClass === contentClass(entry.path), `content class mismatch: ${entry.path}`);
  check(entry.signaturePolicy === signaturePolicy(entry.path), `signature policy mismatch: ${entry.path}`);

  if (entry.signaturePolicy === "header-and-manifest") {
    const source = bytes.toString("utf8");
    check(
      source.split(authorshipSignature).length - 1 === 1,
      `authorship signature must appear exactly once: ${entry.path}`,
    );
    check(
      source.split(authorshipProvenance).length - 1 === 1,
      `authorship provenance must appear exactly once: ${entry.path}`,
    );
    const lines = source.split("\n");
    const offset =
      lines[0].startsWith("#!") || lines[0] === '"use client";' ? 1 : 0;
    const extension = path.extname(entry.path).toLowerCase();
    const expectedMarker = extension === ".css" ? "/*" :
      extension === ".sh" || entry.path.startsWith(".") || entry.path.endsWith(".yaml")
        ? "#"
        : "//";
    check(
      lines[offset]?.startsWith(`${expectedMarker} ${authorshipSignature}`),
      `authorship header is in the wrong position: ${entry.path}`,
    );
    check(
      lines[offset + 1]?.includes(authorshipProvenance),
      `provenance header is in the wrong position: ${entry.path}`,
    );
  }
}

const firstAssetByHash = new Map();
for (const entry of manifest.files) {
  const expectedAlias = isAssetClass(entry.contentClass)
    ? firstAssetByHash.get(entry.sha256)
    : undefined;
  if (expectedAlias) {
    check(entry.aliasOf === expectedAlias, `asset alias mismatch: ${entry.path}`);
  } else {
    check(!Object.hasOwn(entry, "aliasOf"), `unexpected asset alias: ${entry.path}`);
  }
  if (isAssetClass(entry.contentClass) && !expectedAlias) {
    firstAssetByHash.set(entry.sha256, entry.path);
  }
}

const pinnedSubmissionHashes = {
  "submission/oneshot/fork-the-block.prompt.txt":
    "3ff0b35e9af9482285f18f20bef5e1efe5b3b95746aa28fa6031785a2bc18cc2",
  "submission/oneshot/fork-the-block.terra.prompt.txt":
    "29c2b5f934749ee789fb63cef6c32753b85869e34351fa2a9fca6cc7962e9a78",
  "submission/oneshot/dry-run.html":
    "838241bf6d23dfda3de8614ba63d6a6aa6efdc8db0ac09f437e6930828ddb050",
  "submission/oneshot/dry-run-v2.html":
    "0ef2a233b3645cc77b06195106c7a493bfe7fb3ed44af3950cf9b7129de5fbd9",
  "submission/oneshot/dry-run-terra.html":
    "121c3665bb63f7c017e398020f1453e4d88f29337169b5e63e088108f1a3927e",
  "submission/oneshot/dry-run-terra-v2.html":
    "d45af881f447fa53da3b314e83e9dceae70bfbee5c8d3418452d5a64afe71401",
  "submission/oneshot/dry-run-terra-v3.html":
    "ff5b514ef6b73be3ac908f384f2121281365aae052ca5ead23d2ae49b86acb6a",
};
for (const [relativePath, expectedHash] of Object.entries(pinnedSubmissionHashes)) {
  const digest = createHash("sha256")
    .update(repositoryBytes(relativePath))
    .digest("hex");
  check(digest === expectedHash, `pinned submission artifact changed: ${relativePath}`);
}

check(QROST_PROVENANCE.schema === PROJECT_PROVENANCE.schema, "runtime schema drifted");
check(QROST_PROVENANCE.creator === PROJECT_PROVENANCE.creator, "runtime creator drifted");
check(QROST_PROVENANCE.workId === PROJECT_PROVENANCE.workId, "runtime work id drifted");
check(QROST_PROVENANCE.workVersion === PROJECT_PROVENANCE.workVersion, "runtime version drifted");
check(QROST_PROVENANCE.claim === PROJECT_PROVENANCE.claim, "runtime claim drifted");
check(
  QROST_PROVENANCE.canonicalRepository === manifest.canonicalRepository,
  "runtime and manifest canonical repositories differ",
);
check(QROST_PROVENANCE_HEADER === POLICY_HEADER, "header name drifted");
check(QROST_PROVENANCE_VALUE === POLICY_VALUE, "header value drifted");

const receipt = createQrostRunReceipt({
  sceneOrderSeed: 0,
  sceneOrderIds: ["rose-garden", "cyberpunk-garden"],
  entranceVariantIds: ["rose-01", "cyberpunk-02"],
  promptFingerprint: "sha256:fixture",
});
const serializedReceipt = serializeQrostRunReceipt(receipt);
check(receipt.sceneOrderSeed === 0, "a legal zero seed was lost");
check(
  serializedReceipt === serializeQrostRunReceipt(createQrostRunReceipt({
    sceneOrderSeed: 0,
    sceneOrderIds: ["rose-garden", "cyberpunk-garden"],
    entranceVariantIds: ["rose-01", "cyberpunk-02"],
    promptFingerprint: "sha256:fixture",
  })),
  "run receipt serialization is not deterministic",
);
check(!/token|jwt|api.?key|session/i.test(serializedReceipt), "receipt leaked secret fields");

const publicDeclaration = repositoryBytes("public/qrost-provenance.txt").toString("utf8");
check(publicDeclaration.includes("creator=QROST"), "public declaration lacks creator");
check(publicDeclaration.includes(`claim=${PROJECT_PROVENANCE.claim}`), "public declaration claim drifted");
check(
  publicDeclaration.includes(manifest.canonicalRepository),
  "public declaration lacks canonical repository",
);

const layoutSource = repositoryBytes("app/layout.tsx").toString("utf8");
const nextConfigSource = repositoryBytes("next.config.ts").toString("utf8");
const experienceSource = repositoryBytes("components/FashionMazeExperience.tsx").toString("utf8");
const photoSource = repositoryBytes("components/fashion-maze-runtime/usePhotoCapture.ts").toString("utf8");
check(
  layoutSource.includes("authors:") &&
    layoutSource.includes('"qrost:provenance"') &&
    layoutSource.includes("QROST_PROVENANCE.creator"),
  "document metadata is not wired to the canonical QROST constants",
);
check(
  nextConfigSource.includes("QROST_PROVENANCE_HEADER") &&
    nextConfigSource.includes("QROST_PROVENANCE_VALUE") &&
    nextConfigSource.includes('source: "/:path*"'),
  "global response header is not wired to the canonical QROST constants",
);
check(
  experienceSource.includes("createQrostRunReceipt({") &&
    experienceSource.includes("runReceipt: qrostRunReceipt") &&
    experienceSource.includes("<small>BY QROST</small>") &&
    experienceSource.includes('sceneOrderSeed ?? "not drawn"'),
  "runtime credit or sidecar run receipt is not wired",
);
check(
  experienceSource.includes("QROST_OUTPUT_PREFIX}-run-") &&
    photoSource.includes("QROST_OUTPUT_PREFIX}-${mazeId}"),
  "downloaded artifact names lack the QROST prefix",
);
const seedUploadStart = experienceSource.indexOf("async function seedAssetToFile");
const seedUploadEnd = experienceSource.indexOf("function errorMessage", seedUploadStart);
const seedUploadSource = experienceSource.slice(seedUploadStart, seedUploadEnd);
check(
  seedUploadStart >= 0 && seedUploadEnd > seedUploadStart && !seedUploadSource.includes("QROST"),
  "QROST provenance must not enter Reactor seed upload metadata",
);

if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `QROST provenance verification passed: ${manifest.files.length} files, source headers, and pinned submission hashes.`,
  );
}
