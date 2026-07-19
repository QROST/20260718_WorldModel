#!/usr/bin/env node
// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel


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
const fashion = require(path.join(root, "lib/fashion-maze.ts"));
const finale = require(path.join(root, "lib/grand-palais.ts"));
const references = require(path.join(root, "lib/grand-palais-references.ts"));
const { isAllowedRequestOrigin } = require(
  path.join(root, "lib/request-origin.ts"),
);
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function expectThrow(label, operation) {
  try {
    operation();
    errors.push(`${label}: expected failure`);
  } catch {
    // Expected.
  }
}

const order = fashion.createFashionMazeSceneOrder(0x8badf00d);
const request = {
  scenes: order.map((sceneId) => {
    const maze = fashion.findMaze(sceneId);
    return {
      sceneId,
      entranceVariantId: maze.entranceVariants[0].id,
    };
  }),
};
const resolved = references.resolveGrandPalaisReferences(request);
check(resolved.length === 7, "finale must resolve exactly seven references");
check(resolved[0].sceneId === fashion.fashionMazes[0].id, "Scene 1 must remain first");
check(new Set(resolved.map((item) => item.sceneId)).size === 7, "scene references must be unique");
for (const item of resolved) {
  const asset = path.join(root, "public", item.seedImage.replace(/^\//, ""));
  check(fs.statSync(asset).isFile(), `missing finale reference asset ${item.seedImage}`);
}

expectThrow("missing scene", () =>
  references.resolveGrandPalaisReferences({ scenes: request.scenes.slice(0, -1) }),
);
expectThrow("duplicate scene", () =>
  references.resolveGrandPalaisReferences({
    scenes: [...request.scenes.slice(0, -1), request.scenes[1]],
  }),
);
expectThrow("unknown scene", () =>
  references.resolveGrandPalaisReferences({
    scenes: request.scenes.map((item, index) =>
      index === 1 ? { ...item, sceneId: "unknown-scene" } : item,
    ),
  }),
);
expectThrow("cross-scene variant", () =>
  references.resolveGrandPalaisReferences({
    scenes: request.scenes.map((item, index) =>
      index === 1
        ? { ...item, entranceVariantId: request.scenes[0].entranceVariantId }
        : item,
    ),
  }),
);

check(finale.GRAND_PALAIS_IMAGE_MODEL === "gpt-image-2", "finale model must be gpt-image-2");
check(
  finale.GRAND_PALAIS_IMAGE_PROMPT.toLowerCase().includes("grand palais fashion show"),
  "finale prompt must keep the core keyword",
);
check(
  new Set(finale.GRAND_PALAIS_STORY_LINES).size === finale.GRAND_PALAIS_STORY_LINES.length,
  "waiting story lines must be unique",
);
check(finale.GRAND_PALAIS_STORY_LINES.length >= 8, "waiting story needs enough lines for a long generation");

const syntheticImage = "blob:https://example.test/finale";
const runtimeMaze = finale.createGrandPalaisMaze(syntheticImage, 12345);
check(runtimeMaze.id === finale.GRAND_PALAIS_SCENE_ID, "runtime Scene 8 id mismatch");
check(runtimeMaze.seedImage === syntheticImage, "runtime Scene 8 must use the generated image");
check(!runtimeMaze.sceneTransition, "Scene 8 must not open another black door");
check(
  runtimeMaze.ensemble.count === "all",
  "Scene 8 must address every seed-visible performer without guessing a count",
);
check(
  fashion
    .resolvePhotoAction(runtimeMaze)
    .beats.every((beat) => beat.prompt.includes("all seed-visible performers")),
  "Scene 8 photo beats must cover every generated performer",
);
check(
  fashion.composeWorldPrompt(runtimeMaze).length <= fashion.FASHION_MAZE_PROMPT_BUDGET.hard,
  "Scene 8 ambient prompt exceeds the hard budget",
);

const routeSource = fs.readFileSync(
  path.join(root, "app/api/grand-palais/generate/route.ts"),
  "utf8",
);
const openaiServerSource = fs.readFileSync(
  path.join(root, "lib/openai-server.ts"),
  "utf8",
);
check(/form\.append\(\s*"image\[\]"/.test(routeSource), "route must attach multiple image[] references");
check(routeSource.includes("https://api.openai.com/v1/images/edits"), "route must use the fixed OpenAI image edits endpoint");
check(!routeSource.includes("input_fidelity"), "gpt-image-2 route must omit input_fidelity");
check(
  routeSource.includes("generationInFlight") &&
    routeSource.includes("MIN_GENERATION_INTERVAL_MS"),
  "route must guard duplicate paid generations",
);
check(
  routeSource.includes("isAllowedRequestOrigin") &&
    routeSource.includes('request.headers.get("host")') &&
    !routeSource.includes("requestOrigin !== new URL(request.url).origin"),
  "route must validate the browser-facing Host instead of raw request.url equality",
);
check(
  openaiServerSource.includes("process.env.OPENAI_API_KEY") &&
    openaiServerSource.includes("path.join(process.cwd(), LOCAL_KEY_FILE)"),
  "OpenAI credentials must resolve server-side from env or the repository-local key file",
);

const originInput = (overrides = {}) => ({
  requestUrl: "http://127.0.0.1:3000/api/grand-palais/generate",
  origin: "http://127.0.0.1:3000",
  host: "127.0.0.1:3000",
  forwardedHost: null,
  forwardedProto: null,
  secFetchSite: "same-origin",
  ...overrides,
});

check(
  isAllowedRequestOrigin(originInput()),
  "exact local same-origin requests must pass",
);
check(
  isAllowedRequestOrigin(
    originInput({
      origin: "http://localhost:3000",
      host: "localhost:3000",
    }),
  ),
  "browser Host must survive a localhost/request.url bind-address mismatch",
);
check(
  isAllowedRequestOrigin(
    originInput({
      origin: "http://[::1]:3000",
      host: "[::1]:3000",
    }),
  ),
  "IPv6 loopback Host must survive an internal bind-address mismatch",
);
check(
  isAllowedRequestOrigin(originInput({ origin: "http://localhost:3000" })) ===
    false,
  "localhost and 127.0.0.1 must not be treated as interchangeable origins",
);
check(
  isAllowedRequestOrigin(
    originInput({
      origin: "http://evil.test:3000",
      host: "evil.test:3000",
    }),
  ) === false,
  "an arbitrary Host header must not create an allowed public origin",
);
check(
  isAllowedRequestOrigin(
    originInput({
      requestUrl: "https://show.example/api/grand-palais/generate",
      origin: "https://show.example",
      host: "show.example",
    }),
  ) === false,
  "a public request URL must require an explicitly configured public origin",
);
for (const port of [1, 65535]) {
  check(
    isAllowedRequestOrigin(
      originInput({
        origin: `http://localhost:${port}`,
        host: `localhost:${port}`,
      }),
    ),
    `loopback Host port ${port} must pass`,
  );
}
for (const host of [
  "127.1:3000",
  "2130706433:3000",
  "0x7f000001:3000",
  "localhost.:3000",
  "127.0.0.2:3000",
  "[::ffff:127.0.0.1]:3000",
]) {
  check(
    isAllowedRequestOrigin(
      originInput({ origin: `http://${host}`, host }),
    ) === false,
    `non-exact loopback Host ${host} must fail closed`,
  );
}
check(
  isAllowedRequestOrigin(
    originInput({ origin: "https://show.example", host: "127.0.0.1:3000" }),
    { publicOrigin: "https://show.example" },
  ),
  "an explicitly configured public origin must pass",
);
check(
  isAllowedRequestOrigin(
    originInput({
      origin: "https://show.example",
      forwardedHost: "show.example",
      forwardedProto: "https",
    }),
    { trustProxyHeaders: true },
  ),
  "explicit proxy trust must accept one exact forwarded origin",
);
check(
  isAllowedRequestOrigin(
    originInput({
      origin: "https://show.example",
      forwardedHost: "show.example",
      forwardedProto: "https",
    }),
  ) === false,
  "forwarded headers must be ignored unless proxy trust is explicit",
);

for (const [label, overrides] of [
  ["missing Origin", { origin: null }],
  ["null Origin", { origin: "null" }],
  ["malformed Origin", { origin: "not an origin" }],
  ["Origin path", { origin: "http://127.0.0.1:3000/path" }],
  ["Origin userinfo", { origin: "http://user@127.0.0.1:3000" }],
  ["wrong scheme", { origin: "https://127.0.0.1:3000" }],
  ["wrong port", { origin: "http://127.0.0.1:3001" }],
  [
    "invalid loopback port",
    { origin: "http://localhost:0", host: "localhost:0" },
  ],
  [
    "leading-zero loopback port",
    { origin: "http://localhost:03000", host: "localhost:03000" },
  ],
  [
    "out-of-range loopback port",
    { origin: "http://localhost:65536", host: "localhost:65536" },
  ],
  [
    "multi-value Host",
    { origin: "http://localhost:3000", host: "localhost:3000, evil.test" },
  ],
  ["host suffix attack", { origin: "http://127.0.0.1.evil.test:3000" }],
  ["cross-site fetch", { secFetchSite: "cross-site" }],
]) {
  check(
    isAllowedRequestOrigin(originInput(overrides)) === false,
    `${label} must fail closed`,
  );
}
check(
  isAllowedRequestOrigin(
    originInput({
      origin: "https://show.example",
      forwardedHost: "show.example, attacker.example",
      forwardedProto: "https",
      secFetchSite: null,
    }),
    { trustProxyHeaders: true },
  ) === false,
  "multi-value forwarded headers must fail closed",
);

const experienceSource = fs.readFileSync(
  path.join(root, "components/FashionMazeExperience.tsx"),
  "utf8",
);
check(
  experienceSource.includes("finaleGenerationInFlightRef.current"),
  "client must guard duplicate finale requests",
);
check(
  experienceSource.includes("GRAND_PALAIS_CLIENT_TIMEOUT_MS = 170_000") &&
    experienceSource.includes("new AbortController()") &&
    experienceSource.includes("signal: requestController.signal") &&
    experienceSource.includes("finaleGenerationAbortRef.current?.abort()"),
  "client finale generation must be abortable, time bounded, and canceled on unmount",
);
check(
  experienceSource.includes("const cancelGrandPalais = useCallback") &&
    experienceSource.includes('finalePhase === "starting" ||') &&
    experienceSource.includes("Boolean(sessionId)"),
  "finale cancellation must terminate connecting or retained Reactor sessions",
);
check(
  experienceSource.includes('"Cancel finale generation"') &&
    experienceSource.includes('"Retry end session"') &&
    experienceSource.includes('phase === "ending" ? "Ending session…" : "End session"'),
  "generating, starting, and failed finale overlays must expose bounded escape controls",
);
check(
  experienceSource.includes(
    "activationAttemptIdRef.current !== activationAttemptId",
  ) && experienceSource.includes("void disconnect().catch(fail)"),
  "canceled Scene 8 activation must not revive a stale paid session",
);
check(
  experienceSource.includes("DISCONNECT_CONFIRM_TIMEOUT_MS"),
  "finale handoff must bound disconnect confirmation",
);
check(
  experienceSource.includes('finalePhase === "starting"') &&
    experienceSource.includes("pendingMazeRef.current?.id === GRAND_PALAIS_SCENE_ID"),
  "Scene 8 activation failures must retain a retryable finale state",
);
check(
  experienceSource.includes("sourceScene: activeMaze.id") &&
    experienceSource.includes("imageReady: Boolean(finaleMaze)"),
  "debug snapshots must expose finale state separately from the authored scene",
);

const localKey = path.join(root, "openai.key");
if (fs.existsSync(localKey)) {
  check((fs.statSync(localKey).mode & 0o777) === 0o600, "openai.key must remain chmod 600");
}

if (errors.length > 0) {
  console.error(`Finale verification failed (${errors.length}):`);
  for (const error of errors) console.error(`  ERROR ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Finale verification passed: ${resolved.length} allowlisted references, ${finale.GRAND_PALAIS_STORY_LINES.length} story lines, no API request issued.`,
  );
}
