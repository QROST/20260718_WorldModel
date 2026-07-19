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

const {
  deriveControlAxes,
  matchAmbientChunk,
  matchRouteChunk,
} = require(path.join(
  __dirname,
  "../components/fashion-maze-runtime/useReactorControls.ts",
));

const pendingRoute = {
  id: "left-gallery",
  navigation: "left",
  transitionPrompt: "turn into the left gallery",
  settledPrompt: "left gallery at rest",
};

const assertions = [
  [
    "empty controls derive four idle axes",
    JSON.stringify(deriveControlAxes([])) ===
      JSON.stringify({
        longitudinal: "idle",
        lateral: "idle",
        lookHorizontal: "idle",
        lookVertical: "idle",
      }),
  ],
  [
    "the most recently pressed opposing key wins",
    deriveControlAxes(["KeyW", "KeyS"]).longitudinal === "back" &&
      deriveControlAxes(["KeyS", "KeyW"]).longitudinal === "forward",
  ],
  [
    "translation and look axes remain independent",
    JSON.stringify(
      deriveControlAxes(["KeyW", "KeyA", "ArrowRight", "ArrowUp"]),
    ) ===
      JSON.stringify({
        longitudinal: "forward",
        lateral: "strafe_left",
        lookHorizontal: "right",
        lookVertical: "up",
      }),
  ],
  [
    "route confirmation requires both exact prompt and action token",
    matchRouteChunk(pendingRoute, {
      active_prompt: " turn into the left gallery ",
      active_action: "w+left",
    }).confirmed,
  ],
  [
    "matching action cannot confirm the wrong route prompt",
    !matchRouteChunk(pendingRoute, {
      active_prompt: "turn into another gallery",
      active_action: "left",
    }).confirmed,
  ],
  [
    "matching prompt cannot confirm a missing route action",
    !matchRouteChunk(pendingRoute, {
      active_prompt: "turn into the left gallery",
      active_action: "still",
    }).confirmed,
  ],
  [
    "ambient confirmation requires a clear still chunk with exact prompt",
    matchAmbientChunk(
      {
        active_prompt: " left gallery at rest ",
        active_action: "still",
      },
      pendingRoute.settledPrompt,
      true,
    ).confirmed,
  ],
  [
    "an owned flow blocks an otherwise matching ambient chunk",
    !matchAmbientChunk(
      {
        active_prompt: "left gallery at rest",
        active_action: "still",
      },
      pendingRoute.settledPrompt,
      false,
    ).confirmed,
  ],
  [
    "camera movement blocks ambient confirmation",
    !matchAmbientChunk(
      {
        active_prompt: "left gallery at rest",
        active_action: "left",
      },
      pendingRoute.settledPrompt,
      true,
    ).confirmed,
  ],
];

let failed = 0;
for (const [name, passed] of assertions) {
  if (passed) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`Verified ${assertions.length} Reactor control invariants.`);
}
