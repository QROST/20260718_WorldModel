#!/usr/bin/env node

const fs = require("node:fs");
const Module = require("node:module");
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

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAlias(
  request,
  parent,
  isMain,
  options,
) {
  const resolvedRequest = request.startsWith("@/")
    ? path.join(__dirname, "..", request.slice(2))
    : request;
  return originalResolveFilename.call(
    this,
    resolvedRequest,
    parent,
    isMain,
    options,
  );
};

const {
  canContinueDoorQuestion,
  planDoorPauseSignal,
  planDoorReconnectSignal,
} = require(path.join(
  __dirname,
  "../components/fashion-maze-runtime/useDoorQuestion.ts",
));

const failures = [];
let assertionCount = 0;

function assert(label, condition) {
  assertionCount += 1;
  if (!condition) failures.push(label);
}

const question = {
  prompt: "Which way?",
  choices: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
};

function pendingDoor(overrides = {}) {
  return {
    phase: "pausing",
    source: "manual",
    sceneId: "scene",
    question,
    selectedChoiceId: null,
    frozenElapsedSeconds: 30,
    ...overrides,
  };
}

assert(
  "unowned pause signals fall through",
  !planDoorPauseSignal(null, "paused").consumed,
);
assert(
  "pause confirmation offers the choice",
  planDoorPauseSignal(pendingDoor(), "paused").action === "offer-choice",
);
assert(
  "a restored pause also offers the choice",
  planDoorPauseSignal(
    pendingDoor({ phase: "repausing" }),
    "paused",
  ).action === "offer-choice",
);
assert(
  "resume confirmation commits a selected choice",
  planDoorPauseSignal(
    pendingDoor({ phase: "resuming", selectedChoiceId: "a" }),
    "resumed",
  ).action === "commit-choice",
);
assert(
  "a resumed choosing dialog restores the pause",
  planDoorPauseSignal(
    pendingDoor({ phase: "choosing" }),
    "resumed",
  ).action === "restore-pause",
);
assert(
  "a resumed preparing dialog restores the pause",
  planDoorPauseSignal(
    pendingDoor({ phase: "preparing", selectedChoiceId: "a" }),
    "resumed",
  ).action === "restore-pause",
);
assert(
  "an unselected resuming dialog never commits",
  !planDoorPauseSignal(
    pendingDoor({ phase: "resuming" }),
    "resumed",
  ).consumed,
);
assert(
  "ordinary messages do not retry a missing pause",
  !planDoorPauseSignal(pendingDoor(), "resumed").consumed,
);
assert(
  "reconnect retries an unconfirmed pause exactly through its special plan",
  planDoorReconnectSignal(pendingDoor(), "resumed").action === "retry-pause",
);
assert(
  "reconnect retries an unconfirmed restored pause",
  planDoorReconnectSignal(
    pendingDoor({ phase: "repausing" }),
    "resumed",
  ).action === "retry-pause",
);
assert(
  "ordinary messages do not retry a selected resume",
  !planDoorPauseSignal(
    pendingDoor({ phase: "resuming", selectedChoiceId: "a" }),
    "paused",
  ).consumed,
);
assert(
  "reconnect retries a selected resume that remained paused",
  planDoorReconnectSignal(
    pendingDoor({ phase: "resuming", selectedChoiceId: "a" }),
    "paused",
  ).action === "retry-resume",
);
assert(
  "reconnect does not reissue commands for an already choosing pause",
  !planDoorReconnectSignal(
    pendingDoor({ phase: "choosing" }),
    "paused",
  ).consumed,
);

const validContinuation = {
  mounted: true,
  startedLifecycle: 7,
  currentLifecycle: 7,
  pendingMatches: true,
  terminating: false,
};
assert(
  "the current mounted operation may continue",
  canContinueDoorQuestion(validContinuation),
);
assert(
  "unmount invalidates async continuations",
  !canContinueDoorQuestion({ ...validContinuation, mounted: false }),
);
assert(
  "reset lifecycle rollover invalidates async continuations",
  !canContinueDoorQuestion({
    ...validContinuation,
    currentLifecycle: validContinuation.currentLifecycle + 1,
  }),
);
assert(
  "a replaced pending question invalidates async continuations",
  !canContinueDoorQuestion({ ...validContinuation, pendingMatches: false }),
);
assert(
  "session termination invalidates async continuations",
  !canContinueDoorQuestion({ ...validContinuation, terminating: true }),
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Door question verification passed (${assertionCount} assertions).`,
  );
}
