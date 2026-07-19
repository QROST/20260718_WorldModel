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

const root = path.join(__dirname, "..");
const {
  classifyReactorDisconnect,
  isReactorSessionActive,
  shouldConfirmReactorReconnect,
} = require(path.join(root, "lib/reactor-lifecycle.ts"));
const experienceSource = fs.readFileSync(
  path.join(root, "components/FashionMazeExperience.tsx"),
  "utf8",
);
const sdkSource = fs.readFileSync(
  path.join(root, "node_modules/@reactor-team/js-sdk/dist/index.mjs"),
  "utf8",
);
const sdkReconnectSource = sdkSource.slice(
  sdkSource.indexOf("  reconnect(options) {"),
  sdkSource.indexOf("  /**\n   * Connects to the coordinator", sdkSource.indexOf("  reconnect(options) {")),
);

const classify = (overrides = {}) =>
  classifyReactorDisconnect({
    previousStatus: "ready",
    status: "disconnected",
    intentional: false,
    sessionId: "session-1",
    reconnectingSessionId: null,
    failedReconnectSessionId: null,
    ...overrides,
  });

const assertions = [
  ["intentional disconnect resets", classify({ intentional: true }) === "reset"],
  ["unexpected disconnect reconnects once", classify() === "reconnect"],
  [
    "recovery transport failure does not loop",
    classify({
      previousStatus: "connecting",
      reconnectingSessionId: "session-1",
    }) === "reconnect-failed",
  ],
  [
    "delayed failure edge does not loop",
    classify({
      previousStatus: "connecting",
      failedReconnectSessionId: "session-1",
    }) === "reconnect-failed",
  ],
  [
    "disconnect without a retained session resets",
    classify({ sessionId: undefined }) === "reset",
  ],
  [
    "recovery confirms only a retained session at observable ready",
    shouldConfirmReactorReconnect("ready", "session-1") &&
      !shouldConfirmReactorReconnect("connecting", "session-1") &&
      !shouldConfirmReactorReconnect("ready", null),
  ],
  [
    "an active transport or retained id blocks a second billed session",
    isReactorSessionActive("ready", undefined) &&
      isReactorSessionActive("disconnected", "session-1") &&
      !isReactorSessionActive("disconnected", undefined),
  ],
  [
    "SDK reconnect failure is not represented by a rejected promise",
    sdkReconnectSource.includes("this.disconnect(true)") &&
      sdkReconnectSource.includes('"RECONNECTION_FAILED"') &&
      !sdkReconnectSource.includes("throw error"),
  ],
  [
    "app reconnects the retained session and confirms only observable ready",
    experienceSource.includes("reconnect({ sessionId })") &&
      experienceSource.includes(
        "shouldConfirmReactorReconnect(status, reconnectingSessionId)",
      ),
  ],
  [
    "reconnect confirmation has an always-on bounded watchdog",
    experienceSource.includes("RECONNECT_CONFIRM_TIMEOUT_MS = 15_000") &&
      experienceSource.includes("reconnectWatchdogRef.current = window.setTimeout"),
  ],
  [
    "both app-owned disconnect paths are marked intentional",
    (experienceSource.match(/intentionalDisconnectRef\.current = true/g) ?? [])
      .length >= 2,
  ],
  [
    "SDK reconnect errors bypass generic runtime teardown",
    experienceSource.includes('lastError.code === "RECONNECTION_FAILED"'),
  ],
  [
    "session predicate is wired across Start, End, and Grand Palais flows",
    experienceSource.includes("A previous Reactor session may still be billing") &&
      (experienceSource.match(/isReactorSessionActive\(status, sessionId\)/g) ?? [])
        .length >= 6,
  ],
];

const failures = assertions.filter(([, passed]) => !passed);
if (failures.length > 0) {
  for (const [label] of failures) console.error(`FAIL: ${label}`);
  process.exitCode = 1;
} else {
  console.log(
    `Reconnect lifecycle verification passed: ${assertions.length} assertions.`,
  );
}
