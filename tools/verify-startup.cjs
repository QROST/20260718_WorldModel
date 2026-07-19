#!/usr/bin/env node

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
  canIssueGenerationStart,
  canStagePendingMaze,
  isReactorDisconnectEdge,
  sanitizeReactorDebugText,
} = require(path.join(__dirname, "../lib/reactor-lifecycle.ts"));

const experienceSource = fs.readFileSync(
  path.join(__dirname, "../components/FashionMazeExperience.tsx"),
  "utf8",
);
const stagePendingMazeSource = experienceSource.slice(
  experienceSource.indexOf("const stagePendingMaze = useCallback"),
  experienceSource.indexOf("const enterMaze = useCallback"),
);
const stageGateGuardIndex = stagePendingMazeSource.indexOf(
  "if (!canStage || !maze)",
);
const stageGateLogIndex = stagePendingMazeSource.indexOf(
  'appendDebugEvent(\n      "sdk",\n      "stage_gate"',
);

const assertions = [
  [
    "initial disconnected snapshot is not a disconnect edge",
    !isReactorDisconnectEdge("disconnected", "disconnected"),
  ],
  [
    "connecting UI work cannot erase a fresh pending activation",
    !isReactorDisconnectEdge("disconnected", "connecting"),
  ],
  [
    "a real ready-to-disconnected transition resets the runtime",
    isReactorDisconnectEdge("ready", "disconnected"),
  ],
  [
    "a waiting-to-disconnected transition resets the runtime",
    isReactorDisconnectEdge("waiting", "disconnected"),
  ],
  [
    "staging waits for command-ready status",
    !canStagePendingMaze("waiting", true, false),
  ],
  [
    "an already-ready warm connection stages its pending maze",
    canStagePendingMaze("ready", true, false),
  ],
  [
    "staging remains once-only",
    !canStagePendingMaze("ready", true, true),
  ],
  [
    "a blocked staging effect cannot log and trigger a render loop",
    stageGateGuardIndex >= 0 &&
      stageGateLogIndex >= 0 &&
      stageGateGuardIndex < stageGateLogIndex,
  ],
  [
    "generation waits for both image and prompt",
    !canIssueGenerationStart({
      terminating: false,
      pendingStart: true,
      startIssued: false,
      hasImage: true,
      hasPrompt: false,
    }),
  ],
  [
    "generation starts exactly when both conditions are ready",
    canIssueGenerationStart({
      terminating: false,
      pendingStart: true,
      startIssued: false,
      hasImage: true,
      hasPrompt: true,
    }),
  ],
  [
    "generation start remains once-only",
    !canIssueGenerationStart({
      terminating: false,
      pendingStart: true,
      startIssued: true,
      hasImage: true,
      hasPrompt: true,
    }),
  ],
  [
    "debug text redacts bearer tokens and API keys",
    !sanitizeReactorDebugText(
      "Authorization: Bearer secret-token-123 OPENAI_API_KEY=sk-proj-abcdefghijklmnop",
    ).includes("secret-token-123") &&
      !sanitizeReactorDebugText(
        "Authorization: Bearer secret-token-123 OPENAI_API_KEY=sk-proj-abcdefghijklmnop",
      ).includes("sk-proj-abcdefghijklmnop"),
  ],
  [
    "debug text redacts POSIX and Windows local paths",
    !sanitizeReactorDebugText(
      "failed at /home/operator/project and C:\\Users\\operator\\project",
    ).includes("operator"),
  ],
];

const failures = assertions.filter(([, passed]) => !passed);
if (failures.length > 0) {
  for (const [label] of failures) console.error(`FAIL: ${label}`);
  process.exitCode = 1;
} else {
  console.log(`Startup lifecycle verification passed: ${assertions.length} assertions.`);
}
