"use client";
// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel


import type {
  LingbotWorld2ChunkCompleteMessage,
  LingbotWorld2CommandErrorMessage,
  LingbotWorld2SetCameraPoseParams,
  LingbotWorld2SetImageParams,
  LingbotWorld2SetMoveLongitudinalParams,
  LingbotWorld2SetPromptParams,
  LingbotWorld2SetSeedParams,
} from "@reactor-models/lingbot-world-2";
import type { FileRef } from "@reactor-team/js-sdk";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  composePortalPrompt,
  composeWorldPrompt,
  PORTAL_CHOREOGRAPHY,
  resolveMazeEntrance,
  type FashionMaze,
  type MazeRoute,
} from "@/lib/fashion-maze";

export interface MutableCell<T> {
  current: T;
}

export type WatchdogScheduler = (
  callback: () => void,
  timeoutMs: number,
) => number | null;

export type SceneTransitionStage =
  | "idle"
  | "summoning"
  | "entering"
  | "zooming"
  | "covering"
  | "resetting"
  | "arming"
  | "starting"
  | "waiting"
  | "revealing"
  | "failed";

export interface PendingSceneTransition {
  stage: Exclude<SceneTransitionStage, "idle" | "failed">;
  destination: "scene" | "grand-palais";
  targetMaze: FashionMaze | null;
  imageRefPromise: Promise<FileRef> | null;
  summonPrompt: string;
  enterPrompt: string;
  targetPrompt: string | null;
  summonMatchedChunks: number;
  enterMatchedChunks: number;
}

export type SceneTransitionRuntimePhase =
  | "arming"
  | "starting"
  | "switching"
  | "live";

export type SceneTransitionChunkEffect =
  | { type: "arm-watchdog"; message: string }
  | { type: "clear-watchdog" }
  | { type: "enter-portal"; prompt: string }
  | { type: "keep-approaching" }
  | { type: "stop-approaching" }
  | { type: "target-confirmed" };

export interface SceneTransitionChunkPlan {
  /** A pending scene transition always owns the chunk dispatcher. */
  consumed: true;
  transition: PendingSceneTransition;
  effects: SceneTransitionChunkEffect[];
}

export interface ReduceSceneTransitionChunkOptions {
  summonHoldChunks?: number;
  approachHoldChunks?: number;
}

export function canContinueSceneTransition({
  mounted,
  startedLifecycle,
  currentLifecycle,
  pendingMatches,
  terminating,
}: {
  mounted: boolean;
  startedLifecycle: number;
  currentLifecycle: number;
  pendingMatches: boolean;
  terminating: boolean;
}): boolean {
  return (
    mounted &&
    startedLifecycle === currentLifecycle &&
    pendingMatches &&
    !terminating
  );
}

/**
 * Pure transition planner for Reactor chunks. Keeping the prompt/action match
 * separate from the hook makes the dispatch priority and hold-count behavior
 * directly testable without mounting React or mocking the SDK.
 */
export function reduceSceneTransitionChunk(
  pending: PendingSceneTransition,
  message: Pick<
    LingbotWorld2ChunkCompleteMessage,
    "active_action" | "active_prompt"
  >,
  options: ReduceSceneTransitionChunkOptions = {},
): SceneTransitionChunkPlan {
  const summonHoldChunks =
    options.summonHoldChunks ?? PORTAL_CHOREOGRAPHY.summonHoldChunks;
  const approachHoldChunks =
    options.approachHoldChunks ?? PORTAL_CHOREOGRAPHY.approachHoldChunks;
  const activePrompt = message.active_prompt.trim();

  if (
    pending.stage === "summoning" &&
    activePrompt === pending.summonPrompt.trim() &&
    message.active_action === "still"
  ) {
    const summonMatchedChunks = pending.summonMatchedChunks + 1;
    if (summonMatchedChunks < summonHoldChunks) {
      return {
        consumed: true,
        transition: { ...pending, summonMatchedChunks },
        effects: [
          {
            type: "arm-watchdog",
            message:
              "The black door-gate did not remain visible long enough to approach.",
          },
        ],
      };
    }
    return {
      consumed: true,
      transition: {
        ...pending,
        stage: "entering",
        summonMatchedChunks,
        enterMatchedChunks: 0,
      },
      effects: [
        {
          type: "arm-watchdog",
          message:
            "The observer did not begin the measured approach to the black door-gate in time.",
        },
        { type: "enter-portal", prompt: pending.enterPrompt },
      ],
    };
  }

  if (
    pending.stage === "entering" &&
    activePrompt === pending.enterPrompt.trim()
  ) {
    const isForwardChunk = message.active_action.split("+").includes("w");
    if (!isForwardChunk) {
      return {
        consumed: true,
        transition: pending,
        effects: [
          {
            type: "arm-watchdog",
            message:
              "The camera did not continue its straight approach to the black doorway.",
          },
          { type: "keep-approaching" },
        ],
      };
    }

    const enterMatchedChunks = pending.enterMatchedChunks + 1;
    if (enterMatchedChunks >= approachHoldChunks) {
      return {
        consumed: true,
        transition: { ...pending, stage: "zooming", enterMatchedChunks },
        effects: [
          { type: "clear-watchdog" },
          { type: "stop-approaching" },
        ],
      };
    }
    return {
      consumed: true,
      transition: { ...pending, enterMatchedChunks },
      effects: [
        {
          type: "arm-watchdog",
          message:
            "The observer did not continue the measured black-door approach in time.",
        },
      ],
    };
  }

  if (
    pending.stage === "waiting" &&
    pending.targetPrompt &&
    activePrompt === pending.targetPrompt.trim() &&
    message.active_action === "still"
  ) {
    return {
      consumed: true,
      transition: pending,
      effects: [{ type: "target-confirmed" }],
    };
  }

  return { consumed: true, transition: pending, effects: [] };
}

export interface UseSceneTransitionOptions {
  activeMaze: FashionMaze;
  activeRoute: MazeRoute | undefined;
  nextScene: FashionMaze | null;
  isFinaleDoor: boolean;
  entranceVariantIds: Record<string, string>;
  status: string;
  revealVideo: boolean;
  videoReady: boolean;

  stageMediaRef: MutableCell<HTMLDivElement | null>;
  terminatingRef: MutableCell<boolean>;
  lastPromptRef: MutableCell<string>;
  promptRequestIdRef: MutableCell<number>;

  hasPendingRoute: () => boolean;
  hasPendingPhoto: () => boolean;
  releaseControls: () => Promise<unknown>;
  uploadTargetImage: (maze: FashionMaze) => Promise<FileRef>;

  setPrompt: (params: LingbotWorld2SetPromptParams) => Promise<void>;
  setSeed: (params: LingbotWorld2SetSeedParams) => Promise<void>;
  setImage: (params: LingbotWorld2SetImageParams) => Promise<void>;
  setCameraPose: (params: LingbotWorld2SetCameraPoseParams) => Promise<void>;
  setMoveLongitudinal: (
    params: LingbotWorld2SetMoveLongitudinalParams,
  ) => Promise<void>;
  resetGeneration: () => Promise<void>;

  scheduleWatchdog: WatchdogScheduler;
  abortActivation: (cause: unknown) => void;
  clearActivationWatchdog: () => void;
  onPhaseChange: (phase: SceneTransitionRuntimePhase) => void;
  onErrorChange: (message: string | null) => void;
  onAmbientReadyChange: (ready: boolean) => void;
  onTargetArming: (maze: FashionMaze) => void;
  onLongitudinalCommand?: (value: "forward" | "idle") => void;
  onBeginGrandPalais: () => void;
  onTransitionComplete: () => void;

  watchdogMs?: number;
  coverMs?: number;
  revealMs?: number;
  zoomMs?: number;
}

export interface SceneTransitionController {
  stage: SceneTransitionStage;
  targetSceneChunkReady: boolean;
  pendingRef: MutableCell<PendingSceneTransition | null>;
  hasPending: () => boolean;
  passedBlackThreshold: () => boolean;
  prepare: () => Promise<PendingSceneTransition | null>;
  activate: (pending: PendingSceneTransition) => boolean;
  handleChunk: (message: LingbotWorld2ChunkCompleteMessage) => boolean;
  handleCommandError: (message: LingbotWorld2CommandErrorMessage) => boolean;
  handleLastError: (cause: unknown) => boolean;
  handleGenerationReset: () => boolean;
  handleStartIssued: () => boolean;
  handleGenerationStarted: () => boolean;
  clearTimers: () => void;
  reset: (stage?: "idle" | "failed") => void;
}

const DEFAULT_WATCHDOG_MS = 45_000;
const DEFAULT_COVER_MS = 520;
const DEFAULT_REVEAL_MS = 1_100;

export function useSceneTransition(
  options: UseSceneTransitionOptions,
): SceneTransitionController {
  const {
    activeMaze,
    activeRoute,
    nextScene,
    isFinaleDoor,
    entranceVariantIds,
    status,
    revealVideo,
    videoReady,
    stageMediaRef,
    terminatingRef,
    lastPromptRef,
    promptRequestIdRef,
    hasPendingRoute,
    hasPendingPhoto,
    releaseControls,
    uploadTargetImage,
    setPrompt,
    setSeed,
    setImage,
    setCameraPose,
    setMoveLongitudinal,
    resetGeneration,
    scheduleWatchdog,
    abortActivation,
    clearActivationWatchdog,
    onPhaseChange,
    onErrorChange,
    onAmbientReadyChange,
    onTargetArming,
    onLongitudinalCommand,
    onBeginGrandPalais,
    onTransitionComplete,
    watchdogMs = DEFAULT_WATCHDOG_MS,
    coverMs = DEFAULT_COVER_MS,
    revealMs = DEFAULT_REVEAL_MS,
    zoomMs = PORTAL_CHOREOGRAPHY.clientZoomMs,
  } = options;

  const [stage, setStage] = useState<SceneTransitionStage>("idle");
  const [targetSceneChunkReady, setTargetSceneChunkReady] = useState(false);
  const pendingRef = useRef<PendingSceneTransition | null>(null);
  const mountedRef = useRef(false);
  const lifecycleRef = useRef(0);
  const watchdogRef = useRef<number | null>(null);
  const zoomTimerRef = useRef<number | null>(null);
  const coverTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current === null) return;
    window.clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    clearWatchdog();
    for (const timerRef of [zoomTimerRef, coverTimerRef, revealTimerRef]) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [clearWatchdog]);

  const armWatchdog = useCallback(
    (pending: PendingSceneTransition, message: string) => {
      clearWatchdog();
      watchdogRef.current = scheduleWatchdog(() => {
        watchdogRef.current = null;
        if (
          mountedRef.current &&
          pendingRef.current === pending &&
          !terminatingRef.current
        ) {
          abortActivation(new Error(message));
        }
      }, watchdogMs);
    },
    [abortActivation, clearWatchdog, scheduleWatchdog, terminatingRef, watchdogMs],
  );

  const prepare = useCallback(async () => {
    const startedLifecycle = lifecycleRef.current;
    if (
      !mountedRef.current ||
      !activeMaze.sceneTransition ||
      (!nextScene && !isFinaleDoor) ||
      status !== "ready" ||
      !revealVideo ||
      terminatingRef.current ||
      pendingRef.current ||
      hasPendingRoute() ||
      hasPendingPhoto()
    ) {
      return null;
    }

    const summonPrompt = composePortalPrompt(activeMaze, activeRoute, "summon");
    const enterPrompt = composePortalPrompt(activeMaze, activeRoute, "enter");
    let targetMaze: FashionMaze | null = null;
    let targetPrompt: string | null = null;
    let imageRefPromise: Promise<FileRef> | null = null;

    if (nextScene) {
      const entranceId =
        entranceVariantIds[nextScene.id] ??
        nextScene.entranceVariantId ??
        nextScene.entranceVariants[0]?.id ??
        "";
      targetMaze = resolveMazeEntrance(nextScene, entranceId);
      targetPrompt = composeWorldPrompt(targetMaze);
      imageRefPromise = uploadTargetImage(targetMaze);
      // Preparation deliberately overlaps the upload with the pause UI. The
      // rejection is observed again by activate(), so this prevents a transient
      // unhandled rejection while the player is still choosing.
      void imageRefPromise.catch(() => undefined);
    }

    const pending: PendingSceneTransition = {
      stage: "summoning",
      destination: nextScene ? "scene" : "grand-palais",
      targetMaze,
      imageRefPromise,
      summonPrompt,
      enterPrompt,
      targetPrompt,
      summonMatchedChunks: 0,
      enterMatchedChunks: 0,
    };

    if (document.pointerLockElement === stageMediaRef.current) {
      document.exitPointerLock();
    }
    try {
      await releaseControls();
    } catch (cause) {
      if (
        !mountedRef.current ||
        lifecycleRef.current !== startedLifecycle
      ) return null;
      throw cause;
    }
    if (
      !mountedRef.current ||
      lifecycleRef.current !== startedLifecycle ||
      terminatingRef.current
    ) return null;

    const previousPrompt = lastPromptRef.current;
    const requestId = ++promptRequestIdRef.current;
    lastPromptRef.current = summonPrompt;
    try {
      await setPrompt({ prompt: summonPrompt });
    } catch (cause) {
      if (
        !mountedRef.current ||
        lifecycleRef.current !== startedLifecycle
      ) return null;
      if (
        promptRequestIdRef.current === requestId &&
        lastPromptRef.current === summonPrompt
      ) {
        lastPromptRef.current = previousPrompt;
      }
      throw cause;
    }
    if (
      !mountedRef.current ||
      lifecycleRef.current !== startedLifecycle ||
      terminatingRef.current
    ) return null;
    return pending;
  }, [
    activeMaze,
    activeRoute,
    entranceVariantIds,
    hasPendingPhoto,
    hasPendingRoute,
    isFinaleDoor,
    lastPromptRef,
    nextScene,
    promptRequestIdRef,
    releaseControls,
    revealVideo,
    setPrompt,
    stageMediaRef,
    status,
    terminatingRef,
    uploadTargetImage,
  ]);

  const activate = useCallback(
    (pending: PendingSceneTransition): boolean => {
      if (
        !mountedRef.current ||
        terminatingRef.current ||
        pendingRef.current
      ) return false;
      const startedLifecycle = lifecycleRef.current;
      pendingRef.current = pending;
      setStage("summoning");
      setTargetSceneChunkReady(false);
      onPhaseChange("switching");
      onErrorChange(null);
      armWatchdog(pending, "The black doorway did not materialize in time.");
      void pending.imageRefPromise?.catch((cause) => {
        if (canContinueSceneTransition({
          mounted: mountedRef.current,
          startedLifecycle,
          currentLifecycle: lifecycleRef.current,
          pendingMatches: pendingRef.current === pending,
          terminating: terminatingRef.current,
        })) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          abortActivation(
            new Error(`The next scene image could not be staged: ${detail}`),
          );
        }
      });
      return true;
    },
    [
      abortActivation,
      armWatchdog,
      onErrorChange,
      onPhaseChange,
      terminatingRef,
    ],
  );

  const handleChunk = useCallback(
    (message: LingbotWorld2ChunkCompleteMessage): boolean => {
      if (!mountedRef.current) return false;
      const pending = pendingRef.current;
      if (!pending) return false;
      const startedLifecycle = lifecycleRef.current;
      const abortIfCurrent = (cause: unknown) => {
        if (canContinueSceneTransition({
          mounted: mountedRef.current,
          startedLifecycle,
          currentLifecycle: lifecycleRef.current,
          pendingMatches: pendingRef.current === pending,
          terminating: terminatingRef.current,
        })) abortActivation(cause);
      };

      const previousStage = pending.stage;
      const plan = reduceSceneTransitionChunk(pending, message);
      // Async uploads and watchdogs use object identity as their cancellation
      // token. Apply the pure plan onto the stable live object rather than
      // replacing that token with the reducer snapshot.
      Object.assign(pending, plan.transition);
      pendingRef.current = pending;
      if (pending.stage !== previousStage) {
        setStage(pending.stage);
      }

      for (const effect of plan.effects) {
        switch (effect.type) {
          case "arm-watchdog":
            armWatchdog(pending, effect.message);
            break;
          case "clear-watchdog":
            clearWatchdog();
            break;
          case "enter-portal":
            promptRequestIdRef.current += 1;
            lastPromptRef.current = effect.prompt;
            onLongitudinalCommand?.("forward");
            void Promise.all([
              setCameraPose({ camera_pose: [] }),
              setPrompt({ prompt: effect.prompt }),
              setMoveLongitudinal({ move_longitudinal: "forward" }),
            ]).catch(abortIfCurrent);
            break;
          case "keep-approaching":
            onLongitudinalCommand?.("forward");
            void setMoveLongitudinal({ move_longitudinal: "forward" }).catch(
              abortIfCurrent,
            );
            break;
          case "stop-approaching":
            onLongitudinalCommand?.("idle");
            void Promise.all([
              setMoveLongitudinal({ move_longitudinal: "idle" }),
              setCameraPose({ camera_pose: [] }),
            ]).catch(() => undefined);
            break;
          case "target-confirmed":
            onAmbientReadyChange(true);
            setTargetSceneChunkReady(true);
            break;
        }
      }
      return plan.consumed;
    },
    [
      abortActivation,
      armWatchdog,
      clearWatchdog,
      lastPromptRef,
      onAmbientReadyChange,
      onLongitudinalCommand,
      promptRequestIdRef,
      setCameraPose,
      setMoveLongitudinal,
      setPrompt,
      terminatingRef,
    ],
  );

  const handleGenerationReset = useCallback((): boolean => {
    if (!mountedRef.current) return false;
    const pending = pendingRef.current;
    if (!pending || pending.stage !== "resetting") return false;
    if (
      pending.destination !== "scene" ||
      !pending.targetMaze ||
      !pending.imageRefPromise ||
      !pending.targetPrompt
    ) {
      abortActivation(
        new Error("The authored scene transition lost its staged target."),
      );
      return true;
    }

    const targetMaze = pending.targetMaze;
    const imageRefPromise = pending.imageRefPromise;
    const targetPrompt = pending.targetPrompt;
    const startedLifecycle = lifecycleRef.current;
    pending.stage = "arming";
    const arming = pending;
    setStage("arming");
    setTargetSceneChunkReady(false);
    onAmbientReadyChange(false);
    onTargetArming(targetMaze);
    onPhaseChange("arming");
    armWatchdog(
      arming,
      "Reactor did not accept the next scene image and prompt in time.",
    );

    void imageRefPromise
      .then(async (imageRef) => {
        if (!canContinueSceneTransition({
          mounted: mountedRef.current,
          startedLifecycle,
          currentLifecycle: lifecycleRef.current,
          pendingMatches:
            pendingRef.current === arming && arming.stage === "arming",
          terminating: terminatingRef.current,
        })) {
          return;
        }
        await setSeed({ seed: targetMaze.seed });
        if (!canContinueSceneTransition({
          mounted: mountedRef.current,
          startedLifecycle,
          currentLifecycle: lifecycleRef.current,
          pendingMatches: pendingRef.current === arming,
          terminating: terminatingRef.current,
        })) return;
        await setImage({ image: imageRef });
        if (!canContinueSceneTransition({
          mounted: mountedRef.current,
          startedLifecycle,
          currentLifecycle: lifecycleRef.current,
          pendingMatches: pendingRef.current === arming,
          terminating: terminatingRef.current,
        })) return;
        await setPrompt({ prompt: targetPrompt });
        if (!canContinueSceneTransition({
          mounted: mountedRef.current,
          startedLifecycle,
          currentLifecycle: lifecycleRef.current,
          pendingMatches: pendingRef.current === arming,
          terminating: terminatingRef.current,
        })) return;
        lastPromptRef.current = targetPrompt;
      })
      .catch((cause) => {
        if (canContinueSceneTransition({
          mounted: mountedRef.current,
          startedLifecycle,
          currentLifecycle: lifecycleRef.current,
          pendingMatches: pendingRef.current === arming,
          terminating: terminatingRef.current,
        })) abortActivation(cause);
      });
    return true;
  }, [
    abortActivation,
    armWatchdog,
    lastPromptRef,
    onAmbientReadyChange,
    onPhaseChange,
    onTargetArming,
    setImage,
    setPrompt,
    setSeed,
    terminatingRef,
  ]);

  const handleStartIssued = useCallback((): boolean => {
    if (!mountedRef.current) return false;
    const pending = pendingRef.current;
    if (!pending || pending.stage !== "arming") return false;
    pending.stage = "starting";
    setStage("starting");
    onPhaseChange("starting");
    return true;
  }, [onPhaseChange]);

  const handleGenerationStarted = useCallback((): boolean => {
    if (!mountedRef.current) return false;
    const pending = pendingRef.current;
    if (!pending || !["arming", "starting"].includes(pending.stage)) {
      return false;
    }
    pending.stage = "waiting";
    const waiting = pending;
    setStage("waiting");
    setTargetSceneChunkReady(false);
    onPhaseChange("switching");
    armWatchdog(
      waiting,
      "The next scene started but did not produce a confirmed visible chunk in time.",
    );
    return true;
  }, [armWatchdog, onPhaseChange]);

  const coverPortal = useCallback(() => {
    const pending = pendingRef.current;
    if (
      !mountedRef.current ||
      !pending ||
      !["entering", "zooming"].includes(pending.stage) ||
      terminatingRef.current
    ) {
      return;
    }

    pending.stage = "covering";
    const covering = pending;
    const startedLifecycle = lifecycleRef.current;
    setStage("covering");
    onPhaseChange("switching");
    clearWatchdog();
    if (zoomTimerRef.current !== null) {
      window.clearTimeout(zoomTimerRef.current);
      zoomTimerRef.current = null;
    }
    onLongitudinalCommand?.("idle");
    void Promise.all([
      setMoveLongitudinal({ move_longitudinal: "idle" }),
      setCameraPose({ camera_pose: [] }),
    ]).catch(() => undefined);

    coverTimerRef.current = window.setTimeout(() => {
      coverTimerRef.current = null;
      if (
        !mountedRef.current ||
        pendingRef.current !== covering ||
        covering.stage !== "covering" ||
        terminatingRef.current
      ) {
        return;
      }
      if (covering.destination === "grand-palais") {
        pendingRef.current = null;
        setTargetSceneChunkReady(false);
        onBeginGrandPalais();
        return;
      }
      if (
        !covering.targetMaze ||
        !covering.imageRefPromise ||
        !covering.targetPrompt
      ) {
        abortActivation(
          new Error("The next authored scene was not staged behind the door."),
        );
        return;
      }
      covering.stage = "resetting";
      const resetting = covering;
      setStage("resetting");
      armWatchdog(
        resetting,
        "Reactor did not reset the current scene behind the black door in time.",
      );
      void resetGeneration().catch((cause) => {
        if (canContinueSceneTransition({
          mounted: mountedRef.current,
          startedLifecycle,
          currentLifecycle: lifecycleRef.current,
          pendingMatches: pendingRef.current === resetting,
          terminating: terminatingRef.current,
        })) abortActivation(cause);
      });
    }, coverMs);
  }, [
    abortActivation,
    armWatchdog,
    clearWatchdog,
    coverMs,
    onBeginGrandPalais,
    onLongitudinalCommand,
    onPhaseChange,
    resetGeneration,
    setCameraPose,
    setMoveLongitudinal,
    terminatingRef,
  ]);

  useEffect(() => {
    if (stage !== "zooming") return;
    const pending = pendingRef.current;
    if (!pending || pending.stage !== "zooming" || terminatingRef.current) {
      return;
    }

    const videoView = stageMediaRef.current?.querySelector<HTMLElement>(
      ".reactor-video",
    );
    let completed = false;
    const finishZoom = () => {
      if (completed) return;
      completed = true;
      if (
        mountedRef.current &&
        pendingRef.current === pending &&
        pending.stage === "zooming" &&
        !terminatingRef.current
      ) {
        coverPortal();
      }
    };
    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.animationName === "portal-video-zoom") finishZoom();
    };

    videoView?.addEventListener("animationend", handleAnimationEnd);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    zoomTimerRef.current = window.setTimeout(
      finishZoom,
      reducedMotion ? 50 : zoomMs + 250,
    );
    return () => {
      videoView?.removeEventListener("animationend", handleAnimationEnd);
      if (zoomTimerRef.current !== null) {
        window.clearTimeout(zoomTimerRef.current);
        zoomTimerRef.current = null;
      }
    };
  }, [coverPortal, stage, stageMediaRef, terminatingRef, zoomMs]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (
      !mountedRef.current ||
      !pending ||
      pending.stage !== "waiting" ||
      !videoReady ||
      !targetSceneChunkReady ||
      terminatingRef.current
    ) {
      return;
    }

    pending.stage = "revealing";
    const revealing = pending;
    setStage("revealing");
    clearActivationWatchdog();
    clearWatchdog();
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null;
      if (
        !mountedRef.current ||
        pendingRef.current !== revealing ||
        revealing.stage !== "revealing" ||
        terminatingRef.current
      ) {
        return;
      }
      pendingRef.current = null;
      setStage("idle");
      setTargetSceneChunkReady(false);
      onPhaseChange("live");
      onErrorChange(null);
      onTransitionComplete();
    }, revealMs);
  }, [
    clearActivationWatchdog,
    clearWatchdog,
    onErrorChange,
    onPhaseChange,
    onTransitionComplete,
    revealMs,
    targetSceneChunkReady,
    terminatingRef,
    videoReady,
  ]);

  const handleCommandError = useCallback(
    (message: LingbotWorld2CommandErrorMessage): boolean => {
      if (!mountedRef.current || !pendingRef.current) return false;
      abortActivation(
        new Error(`Scene transition ${message.command}: ${message.reason}`),
      );
      return true;
    },
    [abortActivation],
  );

  const handleLastError = useCallback(
    (cause: unknown): boolean => {
      if (!mountedRef.current || !pendingRef.current) return false;
      abortActivation(cause);
      return true;
    },
    [abortActivation],
  );

  const hasPending = useCallback(() => pendingRef.current !== null, []);
  const passedBlackThreshold = useCallback(() => {
    const pending = pendingRef.current;
    return Boolean(
      pending && !["summoning", "entering", "zooming"].includes(pending.stage),
    );
  }, []);

  const reset = useCallback(
    (nextStage: "idle" | "failed" = "idle") => {
      lifecycleRef.current += 1;
      clearTimers();
      pendingRef.current = null;
      setTargetSceneChunkReady(false);
      setStage(nextStage);
    },
    [clearTimers],
  );

  useEffect(() => {
    mountedRef.current = true;
    lifecycleRef.current += 1;
    return () => {
      mountedRef.current = false;
      lifecycleRef.current += 1;
      pendingRef.current = null;
      clearTimers();
    };
  }, [clearTimers]);

  return {
    stage,
    targetSceneChunkReady,
    pendingRef,
    hasPending,
    passedBlackThreshold,
    prepare,
    activate,
    handleChunk,
    handleCommandError,
    handleLastError,
    handleGenerationReset,
    handleStartIssued,
    handleGenerationStarted,
    clearTimers,
    reset,
  };
}
