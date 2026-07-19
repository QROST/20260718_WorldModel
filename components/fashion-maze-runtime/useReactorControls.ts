"use client";
// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel


import type {
  LingbotWorld2ChunkCompleteMessage,
  LingbotWorld2CommandErrorMessage,
} from "@reactor-models/lingbot-world-2";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { MazeRoute } from "@/lib/fashion-maze";

export type ReactorControlCode =
  | "KeyW"
  | "KeyA"
  | "KeyS"
  | "KeyD"
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown";

export type LongitudinalAxis = "idle" | "forward" | "back";
export type LateralAxis = "idle" | "strafe_left" | "strafe_right";
export type HorizontalLookAxis = "idle" | "left" | "right";
export type VerticalLookAxis = "idle" | "up" | "down";

export interface ReactorControlAxes {
  longitudinal: LongitudinalAxis;
  lateral: LateralAxis;
  lookHorizontal: HorizontalLookAxis;
  lookVertical: VerticalLookAxis;
}

export interface PendingReactorRoute {
  id: string;
  navigation: MazeRoute["navigation"];
  transitionPrompt: string;
  settledPrompt: string;
}

export interface RouteChunkMatch {
  promptMatched: boolean;
  expectedAction: "w" | "left" | "right";
  actionMatched: boolean;
  confirmed: boolean;
}

export interface AmbientChunkMatch {
  flowClear: boolean;
  actionStill: boolean;
  promptMatched: boolean;
  confirmed: boolean;
}

export interface ReactorControlsChunkResult {
  route: "none" | "waiting" | "settled" | "rejected";
  ambient: AmbientChunkMatch | null;
}

export interface ReactorRoutePrompts {
  transition: string;
  settled: string;
}

type AsyncCommand<T> = (params: T) => Promise<void>;

export interface MutableCell<T> {
  current: T;
}

export interface UseReactorControlsOptions {
  /**
   * True when the session, pause state, phase, and all non-route flows permit
   * ambient navigation. The hook adds its own route/ambient-ready guards.
   */
  ambientSyncEligible: boolean;
  status: string;
  currentAmbientPrompt: string;
  stageMediaRef: MutableCell<HTMLDivElement | null>;
  /** Shared only with flows that temporarily own prompt sequencing. */
  lastPromptRef: MutableCell<string>;
  promptRequestIdRef: MutableCell<number>;
  isTerminating: () => boolean;
  isAmbientFlowClear: () => boolean;
  isRouteAvailable: (routeId: string) => boolean;
  composeRoutePrompts: (route: MazeRoute) => ReactorRoutePrompts;
  scheduleWatchdog: (
    callback: () => void,
    timeoutMs: number,
  ) => number | null;
  routeWatchdogMs: number;
  setPrompt: AsyncCommand<{ prompt: string }>;
  setCameraPose: AsyncCommand<{ camera_pose: number[] }>;
  setMoveLongitudinal: AsyncCommand<{
    move_longitudinal: LongitudinalAxis;
  }>;
  setMoveLateral: AsyncCommand<{ move_lateral: LateralAxis }>;
  setLookHorizontal: AsyncCommand<{
    look_horizontal: HorizontalLookAxis;
  }>;
  setLookVertical: AsyncCommand<{ look_vertical: VerticalLookAxis }>;
  onRouteSettled: (routeId: string) => void;
  onPhaseChange: (phase: "switching" | "live") => void;
  onClearError: () => void;
  onUserError: (message: string) => void;
  /** Ordinary control/pointer command failure (`fail` in the current runtime). */
  onRuntimeError: (cause: unknown) => void;
  /** Route/ambient invariant failure (`abortActivation` in the current runtime). */
  onActivationError: (cause: unknown) => void;
  onAmbientChunk?: (
    match: AmbientChunkMatch,
    message: LingbotWorld2ChunkCompleteMessage,
    expectedPrompt: string,
  ) => void;
  mouseLookSensitivity?: number;
  mouseLookMaxRotation?: number;
}

export interface UseReactorControlsResult {
  ambientChunkReady: boolean;
  canControl: boolean;
  mouseLook: boolean;
  pendingRouteId: string | null;
  pressedControlCodes: ReactorControlCode[];
  chooseRoute: (route: MazeRoute) => Promise<void>;
  releaseControls: () => Promise<void>;
  setControl: (code: ReactorControlCode, pressed: boolean) => void;
  toggleMouseLook: () => void;
  flushMouseCameraPose: () => void;
  handleChunk: (
    message: LingbotWorld2ChunkCompleteMessage,
  ) => ReactorControlsChunkResult;
  handleCommandError: (
    message: LingbotWorld2CommandErrorMessage,
  ) => boolean;
  handleGenerationReset: () => void;
  hasPendingRoute: () => boolean;
  beginAmbientRestore: (expectedPrompt: string, timeoutMessage: string) => void;
  clearAmbientExpectation: () => void;
  getAwaitingAmbientPrompt: () => string | null;
  getExpectedPrompt: () => string;
  markPromptIssued: (prompt: string) => number;
  noteExternalAxes: (axes: Partial<ReactorControlAxes>) => void;
  setAmbientChunkReady: (ready: boolean) => void;
}

const CONTROL_CODES = new Set<ReactorControlCode>([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

const IDLE_AXES: ReactorControlAxes = {
  longitudinal: "idle",
  lateral: "idle",
  lookHorizontal: "idle",
  lookVertical: "idle",
};

const DEFAULT_MOUSE_LOOK_SENSITIVITY = 0.0003;
const DEFAULT_MOUSE_LOOK_MAX_ROTATION = 0.2;

/**
 * Derives the four Reactor input channels using the most recently pressed key
 * on each opposing axis. Keeping this pure makes simultaneous-key behavior
 * deterministic and independently testable.
 */
export function deriveControlAxes(
  heldControls: readonly ReactorControlCode[],
): ReactorControlAxes {
  const latest = (codes: readonly ReactorControlCode[]) =>
    [...heldControls].reverse().find((code) => codes.includes(code));

  const longitudinalKey = latest(["KeyW", "KeyS"]);
  const lateralKey = latest(["KeyA", "KeyD"]);
  const horizontalKey = latest(["ArrowLeft", "ArrowRight"]);
  const verticalKey = latest(["ArrowUp", "ArrowDown"]);

  return {
    longitudinal:
      longitudinalKey === "KeyW"
        ? "forward"
        : longitudinalKey === "KeyS"
          ? "back"
          : "idle",
    lateral:
      lateralKey === "KeyA"
        ? "strafe_left"
        : lateralKey === "KeyD"
          ? "strafe_right"
          : "idle",
    lookHorizontal:
      horizontalKey === "ArrowLeft"
        ? "left"
        : horizontalKey === "ArrowRight"
          ? "right"
          : "idle",
    lookVertical:
      verticalKey === "ArrowUp"
        ? "up"
        : verticalKey === "ArrowDown"
          ? "down"
          : "idle",
  };
}

export function matchRouteChunk(
  pendingRoute: PendingReactorRoute,
  message: Pick<
    LingbotWorld2ChunkCompleteMessage,
    "active_action" | "active_prompt"
  >,
): RouteChunkMatch {
  const expectedAction =
    pendingRoute.navigation === "forward" ? "w" : pendingRoute.navigation;
  const promptMatched =
    message.active_prompt.trim() === pendingRoute.transitionPrompt.trim();
  const actionMatched = message.active_action
    .split("+")
    .includes(expectedAction);

  return {
    promptMatched,
    expectedAction,
    actionMatched,
    confirmed: promptMatched && actionMatched,
  };
}

export function matchAmbientChunk(
  message: Pick<
    LingbotWorld2ChunkCompleteMessage,
    "active_action" | "active_prompt"
  >,
  expectedPrompt: string,
  flowClear: boolean,
): AmbientChunkMatch {
  const actionStill = message.active_action === "still";
  const promptMatched =
    message.active_prompt.trim() === expectedPrompt.trim();

  return {
    flowClear,
    actionStill,
    promptMatched,
    confirmed: flowClear && actionStill && promptMatched,
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useReactorControls({
  ambientSyncEligible,
  status,
  currentAmbientPrompt,
  stageMediaRef,
  lastPromptRef,
  promptRequestIdRef,
  isTerminating,
  isAmbientFlowClear,
  isRouteAvailable,
  composeRoutePrompts,
  scheduleWatchdog,
  routeWatchdogMs,
  setPrompt,
  setCameraPose,
  setMoveLongitudinal,
  setMoveLateral,
  setLookHorizontal,
  setLookVertical,
  onRouteSettled,
  onPhaseChange,
  onClearError,
  onUserError,
  onRuntimeError,
  onActivationError,
  onAmbientChunk,
  mouseLookSensitivity = DEFAULT_MOUSE_LOOK_SENSITIVITY,
  mouseLookMaxRotation = DEFAULT_MOUSE_LOOK_MAX_ROTATION,
}: UseReactorControlsOptions): UseReactorControlsResult {
  const [ambientChunkReady, setAmbientChunkReadyState] = useState(false);
  const [mouseLook, setMouseLook] = useState(false);
  const [pendingRoute, setPendingRoute] =
    useState<PendingReactorRoute | null>(null);
  const [pressedControlCodes, setPressedControlCodes] = useState<
    ReactorControlCode[]
  >([]);

  const ambientChunkReadyRef = useRef(false);
  const awaitingAmbientPromptRef = useRef<string | null>(null);
  const heldControlsRef = useRef<ReactorControlCode[]>([]);
  const lastAxesRef = useRef<ReactorControlAxes>({ ...IDLE_AXES });
  const mouseLookRef = useRef(false);
  const pendingMousePitchRef = useRef(0);
  const pendingMouseYawRef = useRef(0);
  const pendingRouteRef = useRef<PendingReactorRoute | null>(null);
  const routeWatchdogRef = useRef<number | null>(null);

  const canControl =
    ambientSyncEligible && pendingRoute === null && ambientChunkReady;

  const setAmbientChunkReady = useCallback((ready: boolean) => {
    ambientChunkReadyRef.current = ready;
    setAmbientChunkReadyState(ready);
  }, []);

  const clearRouteWatchdog = useCallback(() => {
    if (routeWatchdogRef.current === null) return;
    window.clearTimeout(routeWatchdogRef.current);
    routeWatchdogRef.current = null;
  }, []);

  const markPromptIssued = useCallback((prompt: string): number => {
    const requestId = ++promptRequestIdRef.current;
    lastPromptRef.current = prompt;
    return requestId;
  }, []);

  const getExpectedPrompt = useCallback(() => lastPromptRef.current, []);
  const getAwaitingAmbientPrompt = useCallback(
    () => awaitingAmbientPromptRef.current,
    [],
  );
  const hasPendingRoute = useCallback(
    () => pendingRouteRef.current !== null,
    [],
  );

  const clearAmbientExpectation = useCallback(() => {
    clearRouteWatchdog();
    awaitingAmbientPromptRef.current = null;
  }, [clearRouteWatchdog]);

  const beginAmbientRestore = useCallback(
    (expectedPrompt: string, timeoutMessage: string) => {
      clearRouteWatchdog();
      setAmbientChunkReady(false);
      awaitingAmbientPromptRef.current = expectedPrompt;
      routeWatchdogRef.current = scheduleWatchdog(() => {
        routeWatchdogRef.current = null;
        if (
          awaitingAmbientPromptRef.current !== expectedPrompt ||
          isTerminating()
        ) {
          return;
        }
        onActivationError(new Error(timeoutMessage));
      }, routeWatchdogMs);
    },
    [
      clearRouteWatchdog,
      isTerminating,
      onActivationError,
      routeWatchdogMs,
      scheduleWatchdog,
      setAmbientChunkReady,
    ],
  );

  const noteExternalAxes = useCallback((axes: Partial<ReactorControlAxes>) => {
    lastAxesRef.current = { ...lastAxesRef.current, ...axes };
  }, []);

  const sendAxes = useCallback(() => {
    if (!canControl) return;
    const next = deriveControlAxes(heldControlsRef.current);
    const previous = lastAxesRef.current;
    const commands: Promise<void>[] = [];

    if (next.longitudinal !== previous.longitudinal) {
      commands.push(
        setMoveLongitudinal({ move_longitudinal: next.longitudinal }),
      );
    }
    if (next.lateral !== previous.lateral) {
      commands.push(setMoveLateral({ move_lateral: next.lateral }));
    }
    if (next.lookHorizontal !== previous.lookHorizontal) {
      commands.push(
        setLookHorizontal({ look_horizontal: next.lookHorizontal }),
      );
    }
    if (next.lookVertical !== previous.lookVertical) {
      commands.push(setLookVertical({ look_vertical: next.lookVertical }));
    }

    lastAxesRef.current = next;
    if (commands.length > 0) {
      void Promise.all(commands).catch(onRuntimeError);
    }
  }, [
    canControl,
    onRuntimeError,
    setLookHorizontal,
    setLookVertical,
    setMoveLateral,
    setMoveLongitudinal,
  ]);

  const setControl = useCallback(
    (code: ReactorControlCode, pressed: boolean) => {
      const held = heldControlsRef.current;
      if (pressed) {
        if (!held.includes(code)) heldControlsRef.current = [...held, code];
      } else {
        heldControlsRef.current = held.filter((item) => item !== code);
      }
      setPressedControlCodes(heldControlsRef.current);
      sendAxes();
    },
    [sendAxes],
  );

  const releaseControls = useCallback(async () => {
    heldControlsRef.current = [];
    setPressedControlCodes([]);
    mouseLookRef.current = false;
    setMouseLook(false);
    pendingMouseYawRef.current = 0;
    pendingMousePitchRef.current = 0;

    if (
      typeof document !== "undefined" &&
      document.pointerLockElement === stageMediaRef.current
    ) {
      document.exitPointerLock();
    }

    lastAxesRef.current = { ...IDLE_AXES };
    if (status !== "ready") return;
    await Promise.all([
      setMoveLongitudinal({ move_longitudinal: "idle" }),
      setMoveLateral({ move_lateral: "idle" }),
      setLookHorizontal({ look_horizontal: "idle" }),
      setLookVertical({ look_vertical: "idle" }),
      setCameraPose({ camera_pose: [] }),
    ]);
  }, [
    setCameraPose,
    setLookHorizontal,
    setLookVertical,
    setMoveLateral,
    setMoveLongitudinal,
    stageMediaRef,
    status,
  ]);

  const flushMouseCameraPose = useCallback(() => {
    if (!canControl || !mouseLookRef.current) return;
    const clamp = (value: number) =>
      Math.max(-mouseLookMaxRotation, Math.min(mouseLookMaxRotation, value));
    const yaw = clamp(pendingMouseYawRef.current * mouseLookSensitivity);
    const pitch = clamp(-pendingMousePitchRef.current * mouseLookSensitivity);
    pendingMouseYawRef.current = 0;
    pendingMousePitchRef.current = 0;
    void setCameraPose({
      camera_pose: [pitch, yaw, 0, 0, 0, 0],
    }).catch(onRuntimeError);
  }, [
    canControl,
    mouseLookMaxRotation,
    mouseLookSensitivity,
    onRuntimeError,
    setCameraPose,
  ]);

  const toggleMouseLook = useCallback(() => {
    if (!canControl || typeof document === "undefined") return;
    if (document.pointerLockElement === stageMediaRef.current) {
      document.exitPointerLock();
      return;
    }

    const stage = stageMediaRef.current;
    if (!stage || typeof stage.requestPointerLock !== "function") {
      onUserError("Pointer-lock mouse look is unavailable in this browser.");
      return;
    }
    void stage.requestPointerLock().catch(onRuntimeError);
  }, [canControl, onRuntimeError, onUserError, stageMediaRef]);

  const chooseRoute = useCallback(
    async (route: MazeRoute) => {
      if (
        !canControl ||
        pendingRouteRef.current ||
        !isAmbientFlowClear()
      ) {
        return;
      }
      const prompts = composeRoutePrompts(route);
      const nextPending: PendingReactorRoute = {
        id: route.id,
        navigation: route.navigation,
        transitionPrompt: prompts.transition,
        settledPrompt: prompts.settled,
      };

      setAmbientChunkReady(false);
      clearAmbientExpectation();
      promptRequestIdRef.current += 1;
      pendingRouteRef.current = nextPending;
      setPendingRoute(nextPending);
      onPhaseChange("switching");
      onClearError();
      routeWatchdogRef.current = scheduleWatchdog(() => {
        routeWatchdogRef.current = null;
        if (
          pendingRouteRef.current !== nextPending ||
          isTerminating()
        ) {
          return;
        }
        onActivationError(
          new Error(
            `Route ${route.id} did not produce a prompt-and-action matched chunk in time.`,
          ),
        );
      }, routeWatchdogMs);

      try {
        await releaseControls();
        if (
          pendingRouteRef.current !== nextPending ||
          isTerminating()
        ) {
          return;
        }

        if (route.navigation === "forward") {
          noteExternalAxes({ longitudinal: "forward" });
          await Promise.all([
            setPrompt({ prompt: prompts.transition }),
            setMoveLongitudinal({ move_longitudinal: "forward" }),
          ]);
        } else {
          noteExternalAxes({ lookHorizontal: route.navigation });
          await Promise.all([
            setPrompt({ prompt: prompts.transition }),
            setLookHorizontal({ look_horizontal: route.navigation }),
          ]);
        }

        if (
          pendingRouteRef.current !== nextPending ||
          isTerminating()
        ) {
          return;
        }
        lastPromptRef.current = prompts.transition;
      } catch (cause) {
        if (
          pendingRouteRef.current !== nextPending ||
          isTerminating()
        ) {
          return;
        }
        onActivationError(cause);
      }
    },
    [
      canControl,
      clearAmbientExpectation,
      composeRoutePrompts,
      isAmbientFlowClear,
      isTerminating,
      noteExternalAxes,
      onClearError,
      onActivationError,
      onPhaseChange,
      releaseControls,
      routeWatchdogMs,
      scheduleWatchdog,
      setAmbientChunkReady,
      setLookHorizontal,
      setMoveLongitudinal,
      setPrompt,
    ],
  );

  const handleChunk = useCallback(
    (
      message: LingbotWorld2ChunkCompleteMessage,
    ): ReactorControlsChunkResult => {
      const route = pendingRouteRef.current;
      let routeResult: ReactorControlsChunkResult["route"] = route
        ? "waiting"
        : "none";

      if (route && matchRouteChunk(route, message).confirmed) {
        if (!isRouteAvailable(route.id)) {
          onActivationError(
            new Error(
              `The confirmed route ${route.id} is no longer available in the active scene.`,
            ),
          );
          return { route: "rejected", ambient: null };
        }

        if (route.navigation === "forward") {
          noteExternalAxes({ longitudinal: "idle" });
          void setMoveLongitudinal({ move_longitudinal: "idle" }).catch(
            onActivationError,
          );
        } else {
          noteExternalAxes({ lookHorizontal: "idle" });
          void setLookHorizontal({ look_horizontal: "idle" }).catch(
            onActivationError,
          );
        }

        beginAmbientRestore(
          route.settledPrompt,
          `Route ${route.id} moved, but Reactor did not confirm the settled scene prompt in time.`,
        );
        onRouteSettled(route.id);
        pendingRouteRef.current = null;
        setPendingRoute(null);
        onPhaseChange("live");
        routeResult = "settled";
      }

      const expectedPrompt =
        awaitingAmbientPromptRef.current ?? lastPromptRef.current;
      const flowClear =
        pendingRouteRef.current === null && isAmbientFlowClear();
      const ambientMatch = matchAmbientChunk(
        message,
        expectedPrompt,
        flowClear,
      );

      if (ambientMatch.confirmed) {
        if (awaitingAmbientPromptRef.current !== null) {
          clearAmbientExpectation();
        }
        setAmbientChunkReady(true);
        onAmbientChunk?.(ambientMatch, message, expectedPrompt);
      } else if (flowClear && !ambientChunkReadyRef.current) {
        onAmbientChunk?.(ambientMatch, message, expectedPrompt);
      }

      flushMouseCameraPose();
      return { route: routeResult, ambient: ambientMatch };
    },
    [
      beginAmbientRestore,
      clearAmbientExpectation,
      flushMouseCameraPose,
      isAmbientFlowClear,
      isRouteAvailable,
      noteExternalAxes,
      onAmbientChunk,
      onActivationError,
      onPhaseChange,
      onRouteSettled,
      setAmbientChunkReady,
      setLookHorizontal,
      setMoveLongitudinal,
    ],
  );

  const handleCommandError = useCallback(
    (message: LingbotWorld2CommandErrorMessage): boolean => {
      const route = pendingRouteRef.current;
      const awaitingAmbient = awaitingAmbientPromptRef.current !== null;
      if (!route && !awaitingAmbient) return false;

      clearRouteWatchdog();
      pendingRouteRef.current = null;
      setPendingRoute(null);
      awaitingAmbientPromptRef.current = null;
      setAmbientChunkReady(false);

      if (route) {
        noteExternalAxes({
          longitudinal: "idle",
          lookHorizontal: "idle",
        });
        void Promise.all([
          setMoveLongitudinal({ move_longitudinal: "idle" }),
          setLookHorizontal({ look_horizontal: "idle" }),
        ]).catch(() => undefined);
      }

      onActivationError(
        new Error(
          `Route transition ${message.command}: ${message.reason}`,
        ),
      );
      return true;
    },
    [
      clearRouteWatchdog,
      noteExternalAxes,
      onActivationError,
      setAmbientChunkReady,
      setLookHorizontal,
      setMoveLongitudinal,
    ],
  );

  const handleGenerationReset = useCallback(() => {
    clearRouteWatchdog();
    pendingRouteRef.current = null;
    setPendingRoute(null);
    awaitingAmbientPromptRef.current = null;
    heldControlsRef.current = [];
    setPressedControlCodes([]);
    lastAxesRef.current = { ...IDLE_AXES };
    lastPromptRef.current = "";
    promptRequestIdRef.current += 1;
    mouseLookRef.current = false;
    setMouseLook(false);
    pendingMousePitchRef.current = 0;
    pendingMouseYawRef.current = 0;
    setAmbientChunkReady(false);
  }, [clearRouteWatchdog, setAmbientChunkReady]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    const keydown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        isTypingTarget(event.target) ||
        !canControl ||
        !CONTROL_CODES.has(event.code as ReactorControlCode)
      ) {
        return;
      }
      event.preventDefault();
      setControl(event.code as ReactorControlCode, true);
    };
    const keyup = (event: KeyboardEvent) => {
      if (!CONTROL_CODES.has(event.code as ReactorControlCode)) return;
      if (!canControl) {
        heldControlsRef.current = heldControlsRef.current.filter(
          (item) => item !== event.code,
        );
        setPressedControlCodes(heldControlsRef.current);
        return;
      }
      event.preventDefault();
      setControl(event.code as ReactorControlCode, false);
    };
    const blur = () => void releaseControls().catch(onRuntimeError);
    const visibility = () => {
      if (document.hidden) blur();
    };

    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [canControl, onRuntimeError, releaseControls, setControl]);

  useEffect(() => {
    if (
      !canControl &&
      typeof document !== "undefined" &&
      document.pointerLockElement === stageMediaRef.current
    ) {
      document.exitPointerLock();
    }
  }, [canControl, stageMediaRef]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onMouseMove = (event: MouseEvent) => {
      if (!mouseLookRef.current) return;
      pendingMouseYawRef.current += event.movementX;
      pendingMousePitchRef.current += event.movementY;
    };
    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === stageMediaRef.current;
      mouseLookRef.current = locked;
      setMouseLook(locked);
      if (locked) {
        flushMouseCameraPose();
        return;
      }

      pendingMouseYawRef.current = 0;
      pendingMousePitchRef.current = 0;
      if (status === "ready" && !isTerminating()) {
        void setCameraPose({ camera_pose: [] }).catch(onRuntimeError);
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
    };
  }, [
    flushMouseCameraPose,
    isTerminating,
    onRuntimeError,
    setCameraPose,
    stageMediaRef,
    status,
  ]);

  // Ambient synchronization owns prompt sequencing for ordinary exploration.
  // Photo and scene hooks call markPromptIssued while they temporarily own it.
  useEffect(() => {
    if (
      !ambientSyncEligible ||
      pendingRouteRef.current ||
      !isAmbientFlowClear()
    ) {
      return;
    }
    const awaitingAmbientPrompt = awaitingAmbientPromptRef.current;
    if (
      awaitingAmbientPrompt &&
      awaitingAmbientPrompt.trim() !== currentAmbientPrompt.trim()
    ) {
      onActivationError(
        new Error(
          "The route settled to a different ambient prompt than the one awaiting confirmation.",
        ),
      );
      return;
    }
    if (
      !awaitingAmbientPrompt &&
      lastPromptRef.current.trim() === currentAmbientPrompt.trim()
    ) {
      return;
    }

    const previousPrompt = lastPromptRef.current;
    const requestId = markPromptIssued(currentAmbientPrompt);
    void setPrompt({ prompt: currentAmbientPrompt }).catch((cause) => {
      if (
        promptRequestIdRef.current === requestId &&
        lastPromptRef.current === currentAmbientPrompt
      ) {
        lastPromptRef.current = previousPrompt;
        if (
          awaitingAmbientPromptRef.current?.trim() ===
          currentAmbientPrompt.trim()
        ) {
          onActivationError(cause);
        } else {
          onRuntimeError(cause);
        }
      }
    });
  }, [
    ambientSyncEligible,
    currentAmbientPrompt,
    isAmbientFlowClear,
    markPromptIssued,
    onActivationError,
    onRuntimeError,
    setPrompt,
  ]);

  useEffect(() => clearRouteWatchdog, [clearRouteWatchdog]);

  return {
    ambientChunkReady,
    canControl,
    mouseLook,
    pendingRouteId: pendingRoute?.id ?? null,
    pressedControlCodes,
    chooseRoute,
    releaseControls,
    setControl,
    toggleMouseLook,
    flushMouseCameraPose,
    handleChunk,
    handleCommandError,
    handleGenerationReset,
    hasPendingRoute,
    beginAmbientRestore,
    clearAmbientExpectation,
    getAwaitingAmbientPrompt,
    getExpectedPrompt,
    markPromptIssued,
    noteExternalAxes,
    setAmbientChunkReady,
  };
}
