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

const promptModule = require(path.join(__dirname, "../lib/fashion-maze.ts"));
const {
  FASHION_MAZE_PROMPT_BUDGET: budget,
  PORTAL_CHOREOGRAPHY: portalChoreography,
  composePortalPrompt,
  composePortalPromptSegments,
  composeWorldPrompt,
  composeWorldPromptSegments,
  createFashionMazeSceneOrder,
  assertFashionMazeSceneOrder,
  fashionDoorQuestions,
  fashionMazes,
  findMaze,
  joinFashionMazePromptSegments,
  resolveMazeEntrance,
  resolvePhotoAction,
} = promptModule;

const errors = [];
const warnings = [];
const cases = [];
let entranceCount = 0;

positiveInteger("portal summon hold", portalChoreography.summonHoldChunks);
positiveInteger("portal approach hold", portalChoreography.approachHoldChunks);
positiveInteger("portal client zoom duration", portalChoreography.clientZoomMs);
if (portalChoreography.summonHoldChunks < 3) {
  fail("portal choreography", "ornamental doorway must settle for at least 3 chunks");
}
if (portalChoreography.approachHoldChunks < 6) {
  fail("portal choreography", "doorway passage must use at least 6 forward chunks");
}
if (portalChoreography.clientZoomMs > 2_000) {
  fail("portal choreography", "client zoom must remain a short, subtle finish");
}

const globalsCss = fs.readFileSync(
  path.join(__dirname, "../app/globals.css"),
  "utf8",
);
const portalZoomStart = globalsCss.indexOf("@keyframes portal-video-zoom");
const portalZoomEnd = globalsCss.indexOf("\n.media-vignette", portalZoomStart);
const portalZoomCss = globalsCss.slice(portalZoomStart, portalZoomEnd);
const portalZoomScales = [...portalZoomCss.matchAll(/scale\(([\d.]+)\)/g)].map(
  (match) => Number(match[1]),
);
const portalZoomBrightness = [
  ...portalZoomCss.matchAll(/brightness\(([\d.]+)\)/g),
].map((match) => Number(match[1]));
if (
  portalZoomStart < 0 ||
  portalZoomEnd < 0 ||
  portalZoomScales.length < 2 ||
  portalZoomBrightness.length < 2
) {
  fail("portal client zoom", "missing complete portal-video-zoom keyframes");
} else {
  if (Math.max(...portalZoomScales) > 1.2) {
    fail("portal client zoom", "scale exceeds the subtle 1.2x ceiling");
  }
  if (Math.min(...portalZoomBrightness) < 0.9) {
    fail("portal client zoom", "brightness drop exceeds the subtle 10% ceiling");
  }
}

function fail(label, message) {
  errors.push(`${label}: ${message}`);
}

function warn(label, message) {
  warnings.push(`${label}: ${message}`);
}

function occurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function sentenceCount(text) {
  return text
    .split(/[.!?]+(?:\s+|$)/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function uniqueIds(label, values) {
  const seen = new Set();
  for (const value of values) {
    if (!value) fail(label, "contains an empty id");
    if (seen.has(value)) fail(label, `duplicates id "${value}"`);
    seen.add(value);
  }
}

function uniqueCopy(label, values) {
  const seen = new Map();
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized) {
      fail(label, "contains empty copy");
      continue;
    }
    const previous = seen.get(normalized);
    if (previous) {
      fail(label, `repeats "${value}" after "${previous}"`);
    } else {
      seen.set(normalized, value);
    }
  }
}

function positiveInteger(label, value) {
  if (!Number.isInteger(value) || value <= 0) {
    fail(label, `expected a positive integer, received ${String(value)}`);
  }
}

function nonNegativeInteger(label, value) {
  if (!Number.isInteger(value) || value < 0) {
    fail(label, `expected a non-negative integer, received ${String(value)}`);
  }
}

function expectThrow(label, operation) {
  try {
    operation();
    fail(label, "expected the operation to fail closed");
  } catch {
    // Expected.
  }
}

function verifyLayerBudgets(label, segments) {
  for (const item of segments) {
    const limit =
      item.kind === "base"
        ? budget.base
        : item.kind === "camera"
          ? budget.camera
          : item.kind === "movement"
            ? budget.movement
            : item.kind === "event"
              ? budget.event
              : null;
    if (limit !== null && item.text.length > limit) {
      fail(
        label,
        `${item.label} is ${item.text.length} chars; layer limit is ${limit}`,
      );
    }
  }
}

function verifyLayerOwnership(label, segments) {
  for (const item of segments) {
    if (
      item.kind === "base" &&
      /\b(first-person|camera|observer|input|pan|zoom|dolly|blink|gesture|pose|hold)\b/i.test(
        item.text,
      )
    ) {
      fail(label, `${item.label} contains camera, input, or behavior language`);
    }
    if (
      item.kind === "camera" &&
      /\b[MCSA]\d{2}\b|\b(blink|breath|gesture|pose|couture)\b/i.test(
        item.text,
      )
    ) {
      fail(label, `${item.label} contains cast identity or choreography`);
    }
    if (
      item.kind === "movement" &&
      /\b(camera|observer|viewpoint|input|pan|zoom|dolly)\b/i.test(item.text)
    ) {
      fail(label, `${item.label} contains camera or input language`);
    }
    if (/\b(try to|please|make sure|attempt to)\b/i.test(item.text)) {
      fail(label, `${item.label} contains an intent qualifier`);
    }
  }
}

function verifyPacket(label, resolvedMaze, segments, expectedCameraId) {
  const prompt = joinFashionMazePromptSegments(segments);
  cases.push({ label, prompt, segments });

  if (prompt.length > budget.hard) {
    const split = [...segments]
      .sort((left, right) => right.text.length - left.text.length)
      .map((item) => `${item.label}=${item.text.length}`)
      .join(", ");
    fail(label, `${prompt.length} chars exceeds hard cap ${budget.hard}; ${split}`);
  } else if (prompt.length > budget.target) {
    warn(label, `${prompt.length} chars exceeds target ${budget.target}`);
  }

  const counts = new Map();
  for (const item of segments) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  if (counts.get("base") !== 1) fail(label, "must contain exactly one base layer");
  if (counts.get("camera") !== 1) fail(label, "must contain exactly one camera layer");
  if (counts.get("movement") !== 1) {
    fail(label, "must contain exactly one movement layer");
  }
  if (counts.get("continuity") !== 1) {
    fail(label, "must contain exactly one continuity layer");
  }
  if ((counts.get("anchor") ?? 0) !== 2) {
    fail(label, "must contain the resolved seed anchor and world-space contract");
  }

  const camera = segments.find((item) => item.kind === "camera");
  if (camera?.id !== expectedCameraId) {
    fail(
      label,
      `expected ${expectedCameraId}, received ${camera?.id ?? "no camera layer"}`,
    );
  }
  if (occurrences(prompt, resolvedMaze.basePrompt) !== 1) {
    fail(label, "resolved base must occur exactly once");
  }
  if (occurrences(prompt, resolvedMaze.openingPrompt) !== 1) {
    fail(label, "resolved seed anchor must occur exactly once");
  }
  if (prompt !== joinFashionMazePromptSegments(segments)) {
    fail(label, "packet is not the exact single-space segment join");
  }

  verifyLayerBudgets(label, segments);
  verifyLayerOwnership(label, segments);
}

uniqueIds("scenes", fashionMazes.map((maze) => maze.id));
const orderA = createFashionMazeSceneOrder(1_234_567);
const orderARepeat = createFashionMazeSceneOrder(1_234_567);
const orderB = createFashionMazeSceneOrder(7_654_321);
for (const [label, order] of [
  ["scene order A", orderA],
  ["scene order A repeat", orderARepeat],
  ["scene order B", orderB],
]) {
  try {
    assertFashionMazeSceneOrder(order);
  } catch (cause) {
    fail(label, cause instanceof Error ? cause.message : String(cause));
  }
}
if (orderA.join("|") !== orderARepeat.join("|")) {
  fail("scene order", "the same random seed must reproduce the same order");
}
if (orderA.join("|") === orderB.join("|")) {
  fail("scene order", "the deterministic canary seeds must produce different orders");
}
expectThrow("scene order missing a scene", () =>
  assertFashionMazeSceneOrder(orderA.slice(0, -1)),
);
expectThrow("scene order moves Scene 1", () =>
  assertFashionMazeSceneOrder([...orderA.slice(1), orderA[0]]),
);
expectThrow("scene order repeats a scene", () =>
  assertFashionMazeSceneOrder([...orderA.slice(0, -1), orderA[1]]),
);

const doorQuestions = fashionDoorQuestions;
if (doorQuestions.length !== fashionMazes.length) {
  fail(
    "door questions",
    `expected one question per authored scene, received ${doorQuestions.length}`,
  );
}
uniqueCopy(
  "door question prompts across all scenes",
  doorQuestions.map((question) => question.prompt),
);
uniqueCopy(
  "door choice labels across all scenes",
  doorQuestions.flatMap((question) =>
    question.choices.map((choice) => choice.label),
  ),
);
uniqueIds(
  "door choice ids across all scenes",
  doorQuestions.flatMap((question) =>
    question.choices.map((choice) => choice.id),
  ),
);
for (const [index, question] of doorQuestions.entries()) {
  if (!question.prompt.trim()) {
    fail(`door question ${index + 1}`, "prompt must not be empty");
  }
  if (question.choices.length !== 2) {
    fail(`door question ${index + 1}`, "must define exactly two choices");
  }
  if (question.choices.some((choice) => !choice.label.trim())) {
    fail(`door question ${index + 1}`, "choice labels must not be empty");
  }
}

for (const maze of fashionMazes) {
  const sceneLabel = `scene ${maze.id}`;
  nonNegativeInteger(`${sceneLabel} ensemble count`, maze.ensemble.count);
  uniqueIds(
    `${sceneLabel} entrance variants`,
    maze.entranceVariants.map((variant) => variant.id),
  );
  uniqueIds(
    `${sceneLabel} routes`,
    maze.routes.map((route) => route.id),
  );
  uniqueIds(
    `${sceneLabel} member archetypes`,
    maze.ensemble.members.map((member) => member.id),
  );

  const baseSentences = sentenceCount(maze.basePrompt);
  if (baseSentences < 1 || baseSentences > 3) {
    fail(sceneLabel, `base has ${baseSentences} sentences; expected 1-3`);
  }
  if (maze.basePrompt.length > budget.base) {
    fail(
      sceneLabel,
      `base is ${maze.basePrompt.length} chars; limit is ${budget.base}`,
    );
  }

  if (!maze.sceneTransition) {
    fail(sceneLabel, "every authored scene must support the journey black door");
  } else if (!maze.sceneTransition.buttonLabel.trim()) {
    fail(sceneLabel, "door button label must not be empty");
  }

  for (const route of maze.routes) {
    if (
      /\b(appears?|grows?|changes?|resolves?|transforms?|becomes?|emerges?)\b/i.test(
        route.promptDelta.settled,
      )
    ) {
      fail(`${sceneLabel} route ${route.id}`, "settled prompt contains a process verb");
    }
  }

  if (maze.entranceVariants.length === 0) {
    fail(sceneLabel, "must define at least one entrance variant");
    continue;
  }

  for (const variant of maze.entranceVariants) {
    entranceCount += 1;
    nonNegativeInteger(`${sceneLabel} variant ${variant.id} seed`, variant.seed);
    if (!variant.seedImage.startsWith("/dataset/")) {
      fail(
        `${sceneLabel} variant ${variant.id}`,
        `seed image must live below /dataset/, received "${variant.seedImage}"`,
      );
    } else {
      const assetPath = path.join(
        __dirname,
        "../public",
        variant.seedImage.replace(/^\/+/, ""),
      );
      if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
        fail(
          `${sceneLabel} variant ${variant.id}`,
          `seed image does not exist at ${assetPath}`,
        );
      }
    }
    if (variant.ensembleCount !== undefined) {
      nonNegativeInteger(
        `${sceneLabel} variant ${variant.id} ensemble count`,
        variant.ensembleCount,
      );
    }

    let resolvedMaze;
    try {
      resolvedMaze = resolveMazeEntrance(maze, variant.id);
    } catch (error) {
      fail(`${sceneLabel} variant ${variant.id}`, error.message);
      continue;
    }
    if (
      resolvedMaze.entranceVariantId !== variant.id ||
      resolvedMaze.seedImage !== variant.seedImage ||
      resolvedMaze.seed !== variant.seed ||
      resolvedMaze.openingPrompt !== variant.openingPrompt
    ) {
      fail(`${sceneLabel} variant ${variant.id}`, "resolver lost variant metadata");
    }
    const expectedCount = variant.ensembleCount ?? maze.ensemble.count;
    if (resolvedMaze.ensemble.count !== expectedCount) {
      fail(
        `${sceneLabel} variant ${variant.id}`,
        `resolved count ${resolvedMaze.ensemble.count} differs from ${expectedCount}`,
      );
    }
    expectThrow(
      `${sceneLabel} variant ${variant.id} transition without route`,
      () =>
        composeWorldPromptSegments(resolvedMaze, undefined, {
          isRouteTransition: true,
        }),
    );

    const photoAction = resolvePhotoAction(resolvedMaze);
    const expectedModes = ["photo-ready", "photo-pose", "photo-shutter"];
    const actualModes = photoAction.beats.map((beat) => beat.mode);
    if (JSON.stringify(actualModes) !== JSON.stringify(expectedModes)) {
      fail(
        `${sceneLabel} variant ${variant.id}`,
        `photo modes must be ${expectedModes.join(" -> ")}`,
      );
    }
    for (const beat of photoAction.beats) {
      positiveInteger(
        `${sceneLabel} variant ${variant.id} ${beat.mode} hold`,
        beat.holdChunks,
      );
      if (
        beat.mode === "photo-shutter" &&
        /\b(capture|take (?:a )?photo|photograph)\b/i.test(beat.prompt)
      ) {
        fail(
          `${sceneLabel} variant ${variant.id}`,
          "shutter prompt must describe a held visual state, not order a capture",
        );
      }
    }
    if (expectedCount !== 0 && !resolvedMaze.photoAction) {
      const expectedHoldChunks = [2, 3, 2];
      const actualHoldChunks = photoAction.beats.map(
        (beat) => beat.holdChunks,
      );
      if (
        JSON.stringify(actualHoldChunks) !==
        JSON.stringify(expectedHoldChunks)
      ) {
        fail(
          `${sceneLabel} variant ${variant.id}`,
          `performer photo holds must be ${expectedHoldChunks.join(" -> ")}`,
        );
      }
      for (const beat of photoAction.beats) {
        if (
          !/camera lens at the current first-person viewpoint/i.test(
            beat.prompt,
          )
        ) {
          fail(
            `${sceneLabel} variant ${variant.id} ${beat.mode}`,
            "must direct every performer to the current camera lens",
          );
        }
        if (
          !/open eyes[^.]*directly into the (?:camera )?lens/i.test(
            beat.prompt,
          )
        ) {
          fail(
            `${sceneLabel} variant ${variant.id} ${beat.mode}`,
            "must direct open eyes into the lens in every photo beat",
          );
        }
      }
    }
    positiveInteger(
      `${sceneLabel} variant ${variant.id} photo release hold`,
      photoAction.releaseHoldChunks,
    );

    const routeCases = [undefined, ...resolvedMaze.routes];
    for (const route of routeCases) {
      const routeLabel = route ? `route ${route.id}` : "default destination";
      const prefix = `${sceneLabel} / ${variant.id} / ${routeLabel}`;

      const ambientSegments = composeWorldPromptSegments(resolvedMaze, route);
      verifyPacket(prefix, resolvedMaze, ambientSegments, "camera:interactive");
      if (
        composeWorldPrompt(resolvedMaze, route) !==
        joinFashionMazePromptSegments(ambientSegments)
      ) {
        fail(prefix, "world composer diverges from segment composer");
      }

      if (route) {
        for (const actionMode of [
          "photo-ready",
          "photo-pose",
          "photo-shutter",
          "photo-release",
        ]) {
          expectThrow(
            `${prefix} / route transition + ${actionMode}`,
            () =>
              composeWorldPromptSegments(resolvedMaze, route, {
                isRouteTransition: true,
                actionMode,
              }),
          );
        }
        const transitionSegments = composeWorldPromptSegments(
          resolvedMaze,
          route,
          { isRouteTransition: true },
        );
        verifyPacket(
          `${prefix} / route transition`,
          resolvedMaze,
          transitionSegments,
          "camera:interactive",
        );
      }

      for (const actionMode of [
        "photo-ready",
        "photo-pose",
        "photo-shutter",
        "photo-release",
      ]) {
        const actionSegments = composeWorldPromptSegments(
          resolvedMaze,
          route,
          { actionMode },
        );
        verifyPacket(
          `${prefix} / ${actionMode}`,
          resolvedMaze,
          actionSegments,
          "camera:locked",
        );
        const expectedEventId =
          actionMode === "photo-release"
            ? "photo:release"
            : `photo:${actionMode}`;
        if (
          actionSegments.filter((item) => item.id === expectedEventId).length !== 1
        ) {
          fail(`${prefix} / ${actionMode}`, "must contain exactly one photo event");
        }
      }

      if (resolvedMaze.sceneTransition) {
        for (const stage of ["summon", "enter"]) {
          const portalSegments = composePortalPromptSegments(
            resolvedMaze,
            route,
            stage,
          );
          verifyPacket(
            `${prefix} / portal-${stage}`,
            resolvedMaze,
            portalSegments,
            stage === "enter" ? "camera:forward" : "camera:locked",
          );
          if (
            composePortalPrompt(resolvedMaze, route, stage) !==
            joinFashionMazePromptSegments(portalSegments)
          ) {
            fail(`${prefix} / portal-${stage}`, "portal composer diverges from segments");
          }
          const portalEvent = portalSegments.find(
            (item) => item.id === `portal:${stage}`,
          );
          if (!portalEvent) {
            fail(`${prefix} / portal-${stage}`, "missing portal event segment");
            continue;
          }
          if (sentenceCount(portalEvent.text) !== 1) {
            fail(
              `${prefix} / portal-${stage}`,
              "SDK-style portal event must remain one composable sentence",
            );
          }
          if (stage === "summon") {
            if (
              !/\bexisting arch or doorway\b/i.test(portalEvent.text) ||
              !/\bornamental matte-black door\b/i.test(portalEvent.text) ||
              !/\bnever freestanding\b/i.test(portalEvent.text)
            ) {
              fail(
                `${prefix} / portal-summon`,
                "must reuse existing architecture as one integrated ornamental black door",
              );
            }
            if (!/\bis becoming\b.*\bis extending\b.*\bis holding\b/i.test(portalEvent.text)) {
              fail(
                `${prefix} / portal-summon`,
                "environment event must stay present-continuous",
              );
            }
          } else {
            const camera = portalSegments.find(
              (item) => item.id === "camera:forward",
            );
            if (
              !camera ||
              !camera.text.includes(
                `${portalChoreography.approachHoldChunks} chunks`,
              ) ||
              !/\bno lens zoom\b/i.test(camera.text) ||
              !/\bfinal 2 chunks cross the threshold\b/i.test(camera.text) ||
              !/\bend fully inside\b/i.test(camera.text)
            ) {
              fail(
                `${prefix} / portal-enter`,
                "camera must complete the chunk-counted passage through the threshold",
              );
            }
            if (!/\bis holding\b.*\bstaying coherent\b/i.test(portalEvent.text)) {
              fail(
                `${prefix} / portal-enter`,
                "doorway event must remain continuous and anchored",
              );
            }
          }
        }
      }
    }
  }
}

const emptyEnvironment = {
  ...fashionMazes[0],
  id: "__synthetic_empty_environment__",
  basePrompt:
    "A geometric garden corridor contains pale stone, clipped greenery and one reflective pool. Photorealistic quiet daylight with precise natural materials.",
  openingPrompt:
    "Seed-space marks establish the corridor walls, pool edge and clipped greenery at fixed world positions.",
  defaultDestinationPrompt:
    "The geometric corridor and reflective pool form the settled environment.",
  promptLayers: {
    movement:
      "Leaves stir faintly and reflected daylight ripples gently across the settled pool.",
  },
  ensemble: { count: 0, members: [] },
  photoAction: undefined,
  routes: [],
};
const emptyPhotoAction = resolvePhotoAction(emptyEnvironment);
if (emptyPhotoAction.beats[0]?.cue !== "FRAME") {
  fail("generic empty-environment photo", "must use the FRAME cue");
}
for (const actionMode of [
  "photo-ready",
  "photo-pose",
  "photo-shutter",
  "photo-release",
]) {
  const prompt = composeWorldPrompt(emptyEnvironment, undefined, { actionMode });
  if (/\b(ensemble|performers?|cast|identit(?:y|ies))\b/i.test(prompt)) {
    fail(
      `generic empty-environment ${actionMode}`,
      "must not conjure a cast through generic photo prose",
    );
  }
}
for (const stage of ["summon", "enter"]) {
  const prompt = composePortalPrompt(emptyEnvironment, undefined, stage);
  if (/\b(ensemble|performers?|cast|identit(?:y|ies))\b/i.test(prompt)) {
    fail(
      `generic empty-environment portal-${stage}`,
      "must not conjure a cast through generic portal prose",
    );
  }
}

try {
  findMaze("__missing_prompt_verifier_scene__");
  fail("findMaze", "unknown scene ids must fail closed");
} catch {
  // Expected.
}

try {
  resolveMazeEntrance(fashionMazes[0], "__missing_prompt_verifier_variant__");
  fail("resolveMazeEntrance", "unknown variant ids must fail closed");
} catch {
  // Expected.
}

if (warnings.length > 0) {
  console.warn(`Prompt budget warnings (${warnings.length}):`);
  for (const message of warnings) console.warn(`  WARN ${message}`);
}

if (errors.length > 0) {
  console.error(`Prompt verification failed (${errors.length}):`);
  for (const message of errors) console.error(`  ERROR ${message}`);
  process.exitCode = 1;
} else {
  const longest = [...cases].sort(
    (left, right) => right.prompt.length - left.prompt.length,
  )[0];
  console.log(
    `Prompt verification passed: ${fashionMazes.length} scenes, ${entranceCount} entrance variants, ${cases.length} packets.`,
  );
  console.log(
    `Longest packet: ${longest.prompt.length}/${budget.hard} chars (${longest.label}).`,
  );
}
