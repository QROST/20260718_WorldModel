#!/usr/bin/env node

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(
  request,
  parent,
  isMain,
  options,
) {
  const resolvedRequest = request.startsWith("@/")
    ? path.join(root, request.slice(2))
    : request;
  return originalResolveFilename.call(
    this,
    resolvedRequest,
    parent,
    isMain,
    options,
  );
};

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const result = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
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
  canContinueSceneTransition,
  reduceSceneTransitionChunk,
} = require(path.join(
  root,
  "components/fashion-maze-runtime/useSceneTransition.ts",
));

const assertions = [];
const check = (label, passed) => assertions.push([label, Boolean(passed)]);
const pendingScene = (overrides = {}) => ({
  stage: "summoning",
  destination: "scene",
  targetMaze: null,
  imageRefPromise: null,
  summonPrompt: "summon",
  enterPrompt: "enter",
  targetPrompt: "target",
  summonMatchedChunks: 0,
  enterMatchedChunks: 0,
  ...overrides,
});
const chunk = (activePrompt, activeAction) => ({
  active_prompt: activePrompt,
  active_action: activeAction,
});

const unmatched = reduceSceneTransitionChunk(
  pendingScene(),
  chunk("ambient", "still"),
);
check("a pending scene owns unmatched chunks", unmatched.consumed);
check("an unmatched scene chunk has no effects", unmatched.effects.length === 0);

const firstSummon = reduceSceneTransitionChunk(
  pendingScene(),
  chunk("summon", "still"),
  { summonHoldChunks: 2 },
);
check(
  "the summon hold increments without entering early",
  firstSummon.transition.stage === "summoning" &&
    firstSummon.transition.summonMatchedChunks === 1,
);
check(
  "an incomplete summon rearms its watchdog",
  firstSummon.effects.some((effect) => effect.type === "arm-watchdog"),
);

const secondSummon = reduceSceneTransitionChunk(
  firstSummon.transition,
  chunk("summon", "still"),
  { summonHoldChunks: 2 },
);
check(
  "the completed summon enters the portal approach",
  secondSummon.transition.stage === "entering" &&
    secondSummon.effects.some((effect) => effect.type === "enter-portal"),
);

const wrongApproach = reduceSceneTransitionChunk(
  pendingScene({ stage: "entering" }),
  chunk("enter", "still"),
  { approachHoldChunks: 2 },
);
check(
  "a non-forward approach is corrected but not counted",
  wrongApproach.transition.enterMatchedChunks === 0 &&
    wrongApproach.effects.some((effect) => effect.type === "keep-approaching"),
);

const completedApproach = reduceSceneTransitionChunk(
  pendingScene({ stage: "entering", enterMatchedChunks: 1 }),
  chunk("enter", "w"),
  { approachHoldChunks: 2 },
);
check(
  "the measured approach reaches zooming at its hold threshold",
  completedApproach.transition.stage === "zooming" &&
    completedApproach.effects.some(
      (effect) => effect.type === "stop-approaching",
    ),
);

const target = reduceSceneTransitionChunk(
  pendingScene({ stage: "waiting" }),
  chunk("target", "still"),
);
check(
  "the target requires exact prompt and still-action confirmation",
  target.effects.some((effect) => effect.type === "target-confirmed"),
);
check(
  "unmount and lifecycle rollover invalidate scene continuations",
  canContinueSceneTransition({
    mounted: true,
    startedLifecycle: 2,
    currentLifecycle: 2,
    pendingMatches: true,
    terminating: false,
  }) &&
    !canContinueSceneTransition({
      mounted: false,
      startedLifecycle: 2,
      currentLifecycle: 2,
      pendingMatches: true,
      terminating: false,
    }) &&
    !canContinueSceneTransition({
      mounted: true,
      startedLifecycle: 2,
      currentLifecycle: 4,
      pendingMatches: true,
      terminating: false,
    }),
);

const failures = assertions.filter(([, passed]) => !passed);
if (failures.length > 0) {
  for (const [label] of failures) console.error(`FAIL: ${label}`);
  process.exitCode = 1;
} else {
  console.log(
    `Scene transition verification passed: ${assertions.length} assertions.`,
  );
}
