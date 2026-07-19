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
  if (request.startsWith("@/")) {
    request = path.join(root, request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
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
  canContinuePhotoCapture,
  createInitialPhotoCaptureState,
  hasSettledRenderedVideoEvidence,
  photoExtensionForMimeType,
  reducePhotoCaptureChunk,
  reducePhotoCaptureMessage,
  waitForRenderedVideoDuration,
} = require(path.join(
  root,
  "components/fashion-maze-runtime/usePhotoCapture.ts",
));

const assertions = [];
const check = (label, passed) => assertions.push([label, Boolean(passed)]);
const chunk = (prompt, chunkIndex = 0, activeAction = "still") => ({
  type: "chunk_complete",
  chunk_index: chunkIndex,
  active_prompt: prompt,
  active_action: activeAction,
  frames_emitted: 48,
});

const initialPending = {
  stage: "capture",
  prompt: "ready",
  cue: "LOOK HERE",
  holdChunks: 2,
  matchedChunks: 0,
  remaining: [
    { cue: "HOLD", prompt: "pose", holdChunks: 3 },
    { cue: "SHUTTER", prompt: "shutter", holdChunks: 2 },
  ],
  beatIndex: 1,
  beatCount: 3,
  releasePrompt: "release",
  releaseHoldChunks: 2,
  ambientPrompt: "ambient",
  issuedAfterSerial: 10,
  photoSaved: false,
};

check(
  "video-frame callbacks require the full authored settle duration",
  !hasSettledRenderedVideoEvidence({
    minimumDurationMs: 1_200,
    firstMediaTime: 10,
    currentMediaTime: 11.19,
  }) &&
    hasSettledRenderedVideoEvidence({
      minimumDurationMs: 1_200,
      firstMediaTime: 10,
      currentMediaTime: 11.21,
    }),
);
check(
  "fallback polling requires both elapsed media and a fresh presented frame",
  !hasSettledRenderedVideoEvidence({
    minimumDurationMs: 1_200,
    initialCurrentTime: 10,
    currentTime: 11.2,
    initialPresentedFrames: 100,
    currentPresentedFrames: 100,
  }) &&
    hasSettledRenderedVideoEvidence({
      minimumDurationMs: 1_200,
      initialCurrentTime: 10,
      currentTime: 11.21,
      initialPresentedFrames: 100,
      currentPresentedFrames: 101,
    }),
);
check(
  "photo filenames follow the browser's actual encoded MIME type",
  photoExtensionForMimeType("image/webp") === "webp" &&
    photoExtensionForMimeType("image/png") === "png",
);
check(
  "unmount and lifecycle rollover invalidate an in-flight photo continuation",
  canContinuePhotoCapture({
    mounted: true,
    startedLifecycle: 4,
    currentLifecycle: 4,
    pendingMatches: true,
    terminating: false,
  }) &&
    !canContinuePhotoCapture({
      mounted: false,
      startedLifecycle: 4,
      currentLifecycle: 4,
      pendingMatches: true,
      terminating: false,
    }) &&
    !canContinuePhotoCapture({
      mounted: true,
      startedLifecycle: 4,
      currentLifecycle: 6,
      pendingMatches: true,
      terminating: false,
    }),
);
let state = {
  ...createInitialPhotoCaptureState(),
  pending: initialPending,
  photoState: "framing",
  cue: { cue: "LOOK HERE", beatIndex: 1, beatCount: 3 },
};

let transition = reducePhotoCaptureChunk(state, chunk("ready"), 10);
check(
  "a chunk at the issue serial cannot acknowledge a newly issued prompt",
  !transition.matched && transition.state === state,
);

transition = reducePhotoCaptureChunk(state, chunk("ambient"), 11);
check(
  "a fresh chunk with the wrong prompt cannot advance the photo",
  !transition.matched && transition.state === state,
);

transition = reducePhotoCaptureChunk(state, chunk("ready", 11), 11);
state = transition.state;
check(
  "the first LOOK HERE chunk holds beat one",
  state.pending.matchedChunks === 1 &&
    state.pending.beatIndex === 1 &&
    transition.commands[0]?.type === "arm-watchdog",
);

transition = reducePhotoCaptureChunk(state, chunk("ready", 12), 12);
state = transition.state;
check(
  "the second LOOK HERE chunk advances to the three-chunk HOLD beat",
  state.pending.prompt === "pose" &&
    state.pending.holdChunks === 3 &&
    state.pending.beatIndex === 2 &&
    transition.commands.some((command) => command.type === "issue-prompt"),
);

for (const serial of [13, 14]) {
  transition = reducePhotoCaptureChunk(state, chunk("pose", serial), serial);
  state = transition.state;
}
check(
  "two HOLD chunks remain on the second beat",
  state.pending.prompt === "pose" && state.pending.matchedChunks === 2,
);
transition = reducePhotoCaptureChunk(state, chunk("pose", 15), 15);
state = transition.state;
check(
  "the third HOLD chunk advances to the two-chunk SHUTTER beat",
  state.pending.prompt === "shutter" &&
    state.pending.holdChunks === 2 &&
    state.pending.beatIndex === 3,
);

transition = reducePhotoCaptureChunk(state, chunk("shutter", 16), 16);
state = transition.state;
check(
  "the first SHUTTER chunk still holds the shutter prompt",
  state.photoState === "framing" && state.pending.matchedChunks === 1,
);
transition = reducePhotoCaptureChunk(state, chunk("shutter", 17), 17);
state = transition.state;
check(
  "the second SHUTTER chunk starts exactly one rendered-frame capture",
  state.photoState === "capturing" &&
    state.pending.stage === "capturing" &&
    transition.commands.filter((command) => command.type === "capture-frame")
      .length === 1,
);
transition = reducePhotoCaptureChunk(state, chunk("shutter", 18), 18);
check(
  "extra chunks preserve the async capture guard and cannot trigger again",
  transition.matched &&
    transition.state === state &&
    transition.commands.every((command) => command.type !== "capture-frame"),
);
state = transition.state;

state = {
  pending: {
    ...state.pending,
    stage: "release",
    prompt: "release",
    cue: "NICE!",
    holdChunks: 2,
    matchedChunks: 0,
    issuedAfterSerial: 18,
    remaining: [],
    photoSaved: true,
  },
  photoState: "returning",
  cue: { cue: "NICE!", beatIndex: 3, beatCount: 3 },
};
transition = reducePhotoCaptureChunk(state, chunk("release", 19), 19);
state = transition.state;
check(
  "release remains visible for its first authored hold chunk",
  state.pending.stage === "release" &&
    transition.commands[0]?.type === "arm-watchdog",
);
transition = reducePhotoCaptureChunk(state, chunk("release", 20), 20);
check(
  "release completion requests ambient restoration",
  transition.commands[0]?.type === "restore-ambient",
);

state = {
  pending: {
    ...state.pending,
    stage: "restore",
    prompt: "ambient",
    cue: "NICE!",
    holdChunks: 1,
    matchedChunks: 0,
    issuedAfterSerial: 20,
    photoSaved: true,
  },
  photoState: "returning",
  cue: { cue: "NICE!", beatIndex: 3, beatCount: 3 },
};
transition = reducePhotoCaptureChunk(state, chunk("ambient", 21), 21);
check(
  "ambient confirmation finishes the saved receipt state",
  transition.state.pending === null &&
    transition.state.photoState === "saved" &&
    transition.commands[0]?.type === "finish",
);

state = {
  ...createInitialPhotoCaptureState(),
  pending: initialPending,
  photoState: "framing",
};
transition = reducePhotoCaptureMessage(
  state,
  { type: "command_error", command: "set_prompt", reason: "rejected" },
  10,
);
check(
  "a command error inside the photo flow is routed to recovery",
  transition.matched && transition.commands[0]?.type === "recover",
);
transition = reducePhotoCaptureMessage(
  state,
  { type: "generation_reset", reason: "scene switch" },
  10,
);
check(
  "generation reset clears only the transient photo machine",
  transition.matched &&
    transition.state.pending === null &&
    transition.state.photoState === "idle",
);

async function verifyRenderedWaitLifecycle() {
  const previousWindow = global.window;
  let nextTimerId = 0;
  let nextFrameId = 0;
  const timers = new Map();
  const frameCallbacks = new Map();
  const canceledFrames = [];
  global.window = {
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };

  const video = {
    currentTime: 0,
    getVideoPlaybackQuality: () => ({ totalVideoFrames: 0 }),
    requestVideoFrameCallback(callback) {
      const id = ++nextFrameId;
      frameCallbacks.set(id, callback);
      return id;
    },
    cancelVideoFrameCallback(id) {
      canceledFrames.push(id);
      frameCallbacks.delete(id);
    },
  };

  try {
    const settled = waitForRenderedVideoDuration(video, 1_200, 5_000);
    const firstFrame = frameCallbacks.get(1);
    frameCallbacks.delete(1);
    firstFrame(0, { mediaTime: 10 });
    const secondFrame = frameCallbacks.get(2);
    frameCallbacks.delete(2);
    secondFrame(0, { mediaTime: 11.21 });
    await settled;
    check(
      "a successful rendered-media wait clears its total timeout",
      timers.size === 0,
    );

    const timedOut = waitForRenderedVideoDuration(video, 1_200, 5_000);
    const timeout = [...timers.entries()].find(([, timer]) => timer.delay === 5_000);
    timers.delete(timeout[0]);
    timeout[1].callback();
    let timeoutRejected = false;
    try {
      await timedOut;
    } catch (cause) {
      timeoutRejected = /did not render enough settled video/.test(
        String(cause?.message ?? cause),
      );
    }
    check(
      "a rendered-media timeout rejects and cancels its pending frame callback",
      timeoutRejected && canceledFrames.includes(3),
    );
  } finally {
    global.window = previousWindow;
  }
}

async function main() {
  await verifyRenderedWaitLifecycle();
  const failures = assertions.filter(([, passed]) => !passed);
  if (failures.length > 0) {
    for (const [label] of failures) console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Photo capture verification passed: ${assertions.length} assertions.`,
    );
  }
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
