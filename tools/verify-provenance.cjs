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
const manifestPath = "PROVENANCE.json";
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, manifestPath), "utf8"),
);
const {
  QROST_PROVENANCE,
  QROST_PROVENANCE_HEADER,
  QROST_PROVENANCE_VALUE,
  createQrostRunReceipt,
  serializeQrostRunReceipt,
  withQrostProvenanceHeaders,
} = require(path.join(root, "lib/qrost-provenance.ts"));

const errors = [];
const fail = (message) => errors.push(message);
const check = (condition, message) => {
  if (!condition) fail(message);
};

const repositoryFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root },
)
  .toString("utf8")
  .split("\0")
  .filter((item) => item && item !== manifestPath)
  .sort();
const manifestFiles = manifest.files.map((entry) => entry.path);

check(manifest.schema === "qrost.provenance-manifest/v1", "manifest schema drifted");
check(manifest.creator === "QROST", "manifest creator must be QROST");
check(manifest.workId === "qrost.fashion-maze", "manifest work id drifted");
check(manifest.hashAlgorithm === "sha256", "manifest must use SHA-256");
check(manifest.manifestSelfExcluded === true, "manifest self-exclusion must be explicit");
check(
  JSON.stringify(manifestFiles) === JSON.stringify(repositoryFiles),
  "manifest paths do not exactly cover the non-ignored repository files",
);

for (const entry of manifest.files) {
  const absolutePath = path.join(root, entry.path);
  if (!fs.existsSync(absolutePath)) {
    fail(`manifest path is missing: ${entry.path}`);
    continue;
  }
  const stat = fs.lstatSync(absolutePath);
  const bytes = stat.isSymbolicLink()
    ? Buffer.from(fs.readlinkSync(absolutePath), "utf8")
    : fs.readFileSync(absolutePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  check(entry.sha256 === digest, `SHA-256 mismatch: ${entry.path}`);
  check(entry.bytes === bytes.length, `byte length mismatch: ${entry.path}`);
  check(
    entry.signaturePolicy === "header-and-manifest" ||
      entry.signaturePolicy === "manifest-only",
    `unknown signature policy: ${entry.path}`,
  );
}

check(QROST_PROVENANCE.schema === "qrost.provenance/v1", "runtime schema drifted");
check(QROST_PROVENANCE.creator === "QROST", "runtime creator must be QROST");
check(
  QROST_PROVENANCE.canonicalRepository === manifest.canonicalRepository,
  "runtime and manifest canonical repositories differ",
);
check(QROST_PROVENANCE_HEADER === "X-QROST-Provenance", "header name drifted");
check(
  QROST_PROVENANCE_VALUE === "qrost.fashion-maze;v=1;creator=QROST",
  "header value drifted",
);

const headers = withQrostProvenanceHeaders({
  "Cache-Control": "private, no-store",
  "Retry-After": "30",
});
check(headers[QROST_PROVENANCE_HEADER] === QROST_PROVENANCE_VALUE, "header missing");
check(headers["Cache-Control"] === "private, no-store", "cache header was replaced");
check(headers["Retry-After"] === "30", "retry header was replaced");

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

const publicDeclaration = fs.readFileSync(
  path.join(root, "public/qrost-provenance.txt"),
  "utf8",
);
check(publicDeclaration.includes("creator=QROST"), "public declaration lacks creator");
check(
  publicDeclaration.includes(manifest.canonicalRepository),
  "public declaration lacks canonical repository",
);

if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `QROST provenance verification passed: ${manifest.files.length} files and 12 contract assertions.`,
  );
}
