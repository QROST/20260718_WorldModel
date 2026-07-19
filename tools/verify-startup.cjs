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
  isReactorDisconnectEdge,
  planFrameProbeRecovery,
  planPendingMazeStage,
  sanitizeReactorDebugText,
} = require(path.join(__dirname, "../lib/reactor-lifecycle.ts"));

const stagePlan = (overrides = {}) =>
  planPendingMazeStage({
    status: "ready",
    hasPendingMaze: true,
    stagingIssued: false,
    terminating: false,
    ...overrides,
  });

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
    stagePlan({ status: "waiting" }).action === "wait" &&
      !stagePlan({ status: "waiting" }).emitStageGate,
  ],
  [
    "an already-ready warm connection stages its pending maze",
    stagePlan().action === "stage" && stagePlan().emitStageGate,
  ],
  [
    "staging remains once-only",
    stagePlan({ stagingIssued: true }).action === "wait" &&
      !stagePlan({ stagingIssued: true }).emitStageGate,
  ],
  [
    "staging cannot start while the runtime is terminating",
    stagePlan({ terminating: true }).action === "wait" &&
      !stagePlan({ terminating: true }).emitStageGate,
  ],
  [
    "staging without a pending maze remains side-effect free",
    stagePlan({ hasPendingMaze: false }).action === "wait" &&
      !stagePlan({ hasPendingMaze: false }).emitStageGate,
  ],
  [
    "a stalled frame callback is canceled, reset, and retried",
    planFrameProbeRecovery("watchdog").cancelPending &&
      planFrameProbeRecovery("watchdog").resetVisibleFrames &&
      planFrameProbeRecovery("watchdog").scheduleRetry &&
      !planFrameProbeRecovery("watchdog").markVideoNotReady,
  ],
  [
    "a muted or ended stream cancels the probe and hides stale video",
    planFrameProbeRecovery("stream-unavailable").cancelPending &&
      planFrameProbeRecovery("stream-unavailable").resetVisibleFrames &&
      !planFrameProbeRecovery("stream-unavailable").scheduleRetry &&
      planFrameProbeRecovery("stream-unavailable").markVideoNotReady,
  ],
  [
    "probe cleanup cancels pending work without scheduling new work",
    planFrameProbeRecovery("cleanup").cancelPending &&
      !planFrameProbeRecovery("cleanup").resetVisibleFrames &&
      !planFrameProbeRecovery("cleanup").scheduleRetry &&
      !planFrameProbeRecovery("cleanup").markVideoNotReady,
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

const photoExperienceSource = fs.readFileSync(
  path.join(__dirname, "../components/FashionMazeExperience.tsx"),
  "utf8",
);
const renderedPhotoWaitStart = photoExperienceSource.indexOf(
  "async function waitForRenderedVideoDuration",
);
const renderedPhotoWaitEnd = photoExperienceSource.indexOf(
  "\nasync function captureReactorPhoto",
  renderedPhotoWaitStart,
);
const renderedPhotoWaitSource =
  renderedPhotoWaitStart >= 0 && renderedPhotoWaitEnd > renderedPhotoWaitStart
    ? photoExperienceSource.slice(renderedPhotoWaitStart, renderedPhotoWaitEnd)
    : "";
const renderedPhotoTimeoutIndex = renderedPhotoWaitSource.indexOf(
  "timeout = window.setTimeout",
);
const renderedPhotoFrameBranchIndex = renderedPhotoWaitSource.lastIndexOf(
  'if (typeof video.requestVideoFrameCallback === "function")',
);
const renderedPhotoSettledGuards =
  renderedPhotoWaitSource.match(/if \(settled\) return;/g)?.length ?? 0;
const photoWaitAssertions = [
  [
    "photo render wait has one total timeout across both frame APIs",
    renderedPhotoTimeoutIndex >= 0 &&
      renderedPhotoFrameBranchIndex > renderedPhotoTimeoutIndex &&
      renderedPhotoWaitSource.includes("PHOTO_FRAME_TIMEOUT_MS"),
  ],
  [
    "photo fallback checks media time and available presented-frame evidence",
    renderedPhotoWaitSource.includes("const pollFallback") &&
      renderedPhotoWaitSource.includes("getVideoPlaybackQuality") &&
      renderedPhotoWaitSource.includes("totalVideoFrames") &&
      renderedPhotoWaitSource.includes("mediaAdvanced && framesAdvanced"),
  ],
  [
    "late photo frame callbacks cannot restart polling after settlement",
    renderedPhotoSettledGuards >= 3,
  ],
  [
    "photo render wait clears every timer and pending frame callback",
    renderedPhotoWaitSource.includes("window.clearTimeout(timeout)") &&
      renderedPhotoWaitSource.includes("window.clearTimeout(fallbackTimer)") &&
      renderedPhotoWaitSource.includes("cancelVideoFrameCallback(frameRequest)"),
  ],
  [
    "photo fallback never treats one arbitrary animation frame as ready",
    !renderedPhotoWaitSource.includes("requestAnimationFrame"),
  ],
];
const photoWaitFailures = photoWaitAssertions.filter(([, passed]) => !passed);
if (photoWaitFailures.length > 0) {
  for (const [label] of photoWaitFailures) console.error(`FAIL: ${label}`);
  process.exitCode = 1;
} else {
  console.log(
    `Photo render wait verification passed: ${photoWaitAssertions.length} assertions.`,
  );
}
