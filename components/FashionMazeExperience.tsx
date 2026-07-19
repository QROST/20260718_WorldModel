"use client";

import {
  LingbotWorld2MainVideoView,
  LingbotWorld2Provider,
  type LingbotWorld2Message,
  type LingbotWorld2StateMessage,
  useLingbotWorld2,
  useLingbotWorld2Message,
} from "@reactor-models/lingbot-world-2";
import {
  ClipDownloadButton,
  ClipPlayer,
  RecordingError,
  type Clip,
} from "@reactor-team/js-sdk";
import NextImage from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  composeWorldPrompt,
  explainFashionMazePrompt,
  FASHION_MAZE_PROMPT_BUDGET,
  createFashionMazeSceneOrder,
  fashionDoorQuestions,
  fashionMazes,
  findMaze,
  PORTAL_CHOREOGRAPHY,
  resolveMazeEntrance,
  type FashionMaze,
} from "@/lib/fashion-maze";
import {
  createGrandPalaisMaze,
  GRAND_PALAIS_SCENE_ID,
  GRAND_PALAIS_STORY_LINES,
  type GrandPalaisGenerationRequest,
} from "@/lib/grand-palais";
import {
  canIssueGenerationStart,
  classifyReactorDisconnect,
  isReactorSessionActive,
  planFrameProbeRecovery,
  planPendingMazeStage,
  sanitizeReactorDebugText,
  shouldConfirmReactorReconnect,
} from "@/lib/reactor-lifecycle";
import {
  useReactorControls,
  type ReactorControlCode,
} from "./fashion-maze-runtime/useReactorControls";
import { useDoorQuestion } from "./fashion-maze-runtime/useDoorQuestion";
import { usePhotoCapture } from "./fashion-maze-runtime/usePhotoCapture";
import { useSceneTransition } from "./fashion-maze-runtime/useSceneTransition";

type ExperiencePhase =
  | "preview"
  | "connecting"
  | "uploading"
  | "arming"
  | "starting"
  | "live"
  | "switching"
  | "paused"
  | "ending"
  | "error";

type FinalePhase =
  | "idle"
  | "generating"
  | "ready"
  | "starting"
  | "live"
  | "error";

type DebugLogLevel = "info" | "success" | "warning" | "error";
type DebugLogSource = "ui" | "sdk" | "model" | "media" | "timer";

interface DebugLogEntry {
  seq: number;
  at: string;
  tMs: number;
  attempt: number;
  level: DebugLogLevel;
  source: DebugLogSource;
  event: string;
  detail: string;
}

interface FashionMazeExperienceProps {
  reactorConfigured: boolean;
  openaiConfigured: boolean;
  initialEntranceVariantIds: Record<string, string>;
}

const SCENE_AUTO_ADVANCE_SECONDS = 30;
const TOKEN_EXPIRY_SKEW_SECONDS = 60;
const SNAP_CLIP_SECONDS = 10;
const DEBUG_LOG_LIMIT = 250;
// Hackathon sessions intentionally wait indefinitely for Reactor state changes.
// Keep the former bounds documented below, but never arm a timer unless this
// policy is explicitly re-enabled for a spend-limited deployment.
const CREDIT_PROTECTION_TIMEOUTS_ENABLED = false;
const CONNECTION_READY_WATCHDOG_MS = 60_000;
const ARMING_WATCHDOG_MS = 30_000;
const START_WATCHDOG_MS = 20_000;
const VISIBLE_VIDEO_WATCHDOG_MS = 20_000;
const VIDEO_FRAME_PROBE_TIMEOUT_MS = 1_000;
const CONTROL_RELEASE_TIMEOUT_MS = 750;
const DISCONNECT_CONFIRM_TIMEOUT_MS = 10_000;
const RECONNECT_CONFIRM_TIMEOUT_MS = 15_000;
const GRAND_PALAIS_CLIENT_TIMEOUT_MS = 170_000;
const PORTAL_VIDEO_ZOOM_MS = PORTAL_CHOREOGRAPHY.clientZoomMs;
const CONNECTION_DROPPED_WARNING =
  "The Reactor connection dropped. The existing session may still be billing while this app tries to reconnect it.";
const CONNECTION_RECOVERY_FAILED_WARNING =
  "The Reactor connection dropped. Reconnection failed and the old session may still be billing. End it before starting another live maze.";

let cachedToken: { jwt: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

const CONTROL_BUTTONS: Array<{
  code: ReactorControlCode;
  label: string;
  hint: string;
}> = [
  { code: "KeyW", label: "W", hint: "forward" },
  { code: "KeyA", label: "A", hint: "left" },
  { code: "KeyS", label: "S", hint: "back" },
  { code: "KeyD", label: "D", hint: "right" },
  { code: "ArrowLeft", label: "←", hint: "look left" },
  { code: "ArrowRight", label: "→", hint: "look right" },
];

async function getReactorJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedToken &&
    cachedToken.expiresAt - TOKEN_EXPIRY_SKEW_SECONDS > now
  ) {
    return cachedToken.jwt;
  }

  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const response = await fetch("/api/reactor/token", {
      method: "POST",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      jwt?: string;
      expires_at?: number;
      error?: string;
    };

    if (!response.ok || !payload.jwt) {
      throw new Error(
        payload.error ?? `Token request failed (${response.status})`,
      );
    }

    cachedToken = {
      jwt: payload.jwt,
      // Reactor still enforces the server-requested ten-minute JWT lifetime.
      // This fallback only prevents the client cache from reusing an expired
      // token when an upstream response omits expires_at.
      expiresAt: payload.expires_at ?? now + 10 * 60,
    };
    return payload.jwt;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

async function decodeImage(image: HTMLImageElement): Promise<void> {
  if (image.decode) {
    await image.decode();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not decode seed image"));
  });
}

/** Convert our lightweight SVG placeholders to a model-friendly PNG upload. */
async function seedAssetToFile(maze: FashionMaze): Promise<File> {
  const response = await fetch(maze.seedImage, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${maze.seedImage}`);
  }

  const source = await response.blob();
  const seedName = maze.entranceVariantId
    ? `${maze.id}-${maze.entranceVariantId}`
    : maze.id;
  if (!source.type.includes("svg")) {
    const extension = source.type.includes("webp")
      ? "webp"
      : source.type.includes("png")
        ? "png"
        : source.type.includes("jpeg")
          ? "jpg"
          : null;
    if (!extension) {
      throw new Error(`Unsupported seed image type: ${source.type || "unknown"}`);
    }
    return new File([source], `${seedName}.${extension}`, { type: source.type });
  }

  const objectUrl = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = objectUrl;
    await decodeImage(image);

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || 1664;
    canvas.height = image.naturalHeight || 960;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("PNG conversion failed")),
        "image/png",
        0.94,
      );
    });
    return new File([png], `${seedName}.png`, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return cause.message;
  }
  return String(cause);
}

function drawSceneOrderSeed(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] ?? 0;
}

function promptFingerprint(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "none";
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function summarizeLingbotMessage(message: LingbotWorld2Message): {
  detail: string;
  level: DebugLogLevel;
} {
  switch (message.type) {
    case "state":
      return {
        detail: `started=${message.started} running=${message.running} paused=${message.paused} image=${message.has_image} prompt=${message.has_prompt} chunk=${message.current_chunk} action=${message.current_action} promptId=${promptFingerprint(message.current_prompt)}`,
        level: "info",
      };
    case "conditions_ready":
      return {
        detail: `image=${message.has_image} prompt=${message.has_prompt}`,
        level: message.has_image && message.has_prompt ? "success" : "info",
      };
    case "image_accepted":
      return {
        detail: `size=${message.width}x${message.height}`,
        level: "success",
      };
    case "prompt_accepted":
      return {
        detail: `promptId=${promptFingerprint(message.prompt)}`,
        level: "success",
      };
    case "generation_started":
      return {
        detail: `chunks=${message.chunk_num} frames=${message.frame_num} promptId=${promptFingerprint(message.prompt)}`,
        level: "success",
      };
    case "chunk_complete":
      return {
        detail: `chunk=${message.chunk_index} frames=${message.frames_emitted} action=${message.active_action} promptId=${promptFingerprint(message.active_prompt)}`,
        level: "success",
      };
    case "generation_paused":
    case "generation_resumed":
      return {
        detail: `chunk=${message.chunk_index}`,
        level: "info",
      };
    case "generation_reset":
      return { detail: `reason=${message.reason}`, level: "warning" };
    case "generation_complete":
      return {
        detail: `totalChunks=${message.total_chunks}`,
        level: "info",
      };
    case "command_error":
      return {
        detail: `command=${message.command} reason=${message.reason}`,
        level: "error",
      };
  }
}

async function copyPlainText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard access is unavailable.");
}

function scheduleCreditProtectionTimeout(
  callback: () => void,
  timeoutMs: number,
): number | null {
  if (!CREDIT_PROTECTION_TIMEOUTS_ENABLED) return null;
  return window.setTimeout(callback, timeoutMs);
}
export function FashionMazeExperience({
  reactorConfigured,
  openaiConfigured,
  initialEntranceVariantIds,
}: FashionMazeExperienceProps) {
  const getJwt = useCallback(() => getReactorJwt(), []);

  return (
    <LingbotWorld2Provider
      getJwt={getJwt}
      connectOptions={{
        autoConnect: false,
        autoResumeTracks: true,
      }}
    >
      <FashionMazeRuntime
        reactorConfigured={reactorConfigured}
        openaiConfigured={openaiConfigured}
        initialEntranceVariantIds={initialEntranceVariantIds}
      />
    </LingbotWorld2Provider>
  );
}

function FashionMazeRuntime({
  reactorConfigured,
  openaiConfigured,
  initialEntranceVariantIds,
}: FashionMazeExperienceProps) {
  const {
    status,
    sessionId,
    tracks,
    lastError,
    connect,
    disconnect,
    reconnect,
    uploadFile,
    setSeed,
    setImage,
    setPrompt,
    setCameraPose,
    setMoveLongitudinal,
    setMoveLateral,
    setLookHorizontal,
    setLookVertical,
    reset,
    start,
    pause,
    resume,
    requestClip,
  } = useLingbotWorld2();

  const [entranceVariantIds] = useState(initialEntranceVariantIds);
  const [sceneOrderIds, setSceneOrderIds] = useState(() =>
    fashionMazes.map((maze) => maze.id),
  );
  const [sceneOrderSeed, setSceneOrderSeed] = useState(0);
  const [selectedMazeId, setSelectedMazeId] = useState(fashionMazes[0].id);
  const [activeMazeId, setActiveMazeId] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ExperiencePhase>("preview");
  const [modelState, setModelState] =
    useState<LingbotWorld2StateMessage | null>(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [finalePhase, setFinalePhase] = useState<FinalePhase>("idle");
  const [finaleMaze, setFinaleMaze] = useState<FashionMaze | null>(null);
  const [finaleStoryIndex, setFinaleStoryIndex] = useState(0);
  const [finaleError, setFinaleError] = useState<string | null>(null);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([]);
  const [debugCopyStatus, setDebugCopyStatus] = useState<string | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [clipBusy, setClipBusy] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);

  const pendingStartRef = useRef(false);
  const startIssuedRef = useRef(false);
  const pendingMazeRef = useRef<FashionMaze | null>(null);
  const stagingIssuedRef = useRef(false);
  const autoAdvanceIssuedRef = useRef(false);
  const beginGrandPalaisGenerationRef = useRef<() => void>(() => undefined);
  const generatedFinaleUrlRef = useRef<string | null>(null);
  const finaleGenerationAttemptRef = useRef(0);
  const finaleGenerationInFlightRef = useRef(false);
  const finaleGenerationAbortRef = useRef<AbortController | null>(null);
  const finaleGenerationTimeoutRef = useRef<number | null>(null);
  const finaleCancelInFlightRef = useRef(false);
  const lastPromptRef = useRef("");
  const promptRequestIdRef = useRef(0);
  const stageMediaRef = useRef<HTMLDivElement>(null);
  const doorQuestionCardRef = useRef<HTMLElement>(null);
  const activationWatchdogRef = useRef<number | null>(null);
  const reconnectWatchdogRef = useRef<number | null>(null);
  const activationAttemptIdRef = useRef(0);
  const handledLastErrorRef = useRef<unknown>(null);
  const previousStatusRef = useRef(status);
  const loggedStatusRef = useRef<typeof status | null>(null);
  const loggedPhaseRef = useRef<ExperiencePhase | null>(null);
  const loggedSessionIdRef = useRef<string | undefined>(undefined);
  const debugSequenceRef = useRef(0);
  const debugStartedAtRef = useRef(Date.now());
  const terminatingRef = useRef(false);
  const intentionalDisconnectRef = useRef(false);
  const reconnectingSessionIdRef = useRef<string | null>(null);
  const failedReconnectSessionIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const doorReconnectReconcileRef = useRef(false);
  const controlsResetRef = useRef<() => void>(() => undefined);
  const photoFlowRef = useRef<{
    hasPending: () => boolean;
    reset: () => void;
  }>({
    hasPending: () => false,
    reset: () => undefined,
  });
  const sceneFlowRef = useRef<{
    hasPending: () => boolean;
    passedBlackThreshold: () => boolean;
    reset: (stage?: "idle" | "failed") => void;
  }>({
    hasPending: () => false,
    passedBlackThreshold: () => false,
    reset: () => undefined,
  });
  const doorFlowRef = useRef<{
    hasPending: () => boolean;
    reset: (options?: { clearAnswers?: boolean }) => void;
  }>({
    hasPending: () => false,
    reset: () => undefined,
  });

  const appendDebugEvent = useCallback(
    (
      source: DebugLogSource,
      event: string,
      detail = "",
      level: DebugLogLevel = "info",
    ) => {
      const now = Date.now();
      const entry: DebugLogEntry = {
        seq: ++debugSequenceRef.current,
        at: new Date(now).toISOString(),
        tMs: now - debugStartedAtRef.current,
        attempt: activationAttemptIdRef.current,
        level,
        source,
        event,
        detail: sanitizeReactorDebugText(detail),
      };
      setDebugLog((entries) => {
        const next = [...entries, entry];
        return next.length > DEBUG_LOG_LIMIT
          ? next.slice(next.length - DEBUG_LOG_LIMIT)
          : next;
      });
      const line = `[FashionMaze][${source}][${event}] ${entry.detail}`;
      if (level === "error") console.error(line);
      else if (level === "warning") console.warn(line);
      else console.debug(line);
    },
    [],
  );

  const selectedMaze = useMemo(
    () =>
      resolveMazeEntrance(
        findMaze(selectedMazeId),
        entranceVariantIds[selectedMazeId] ?? "",
      ),
    [entranceVariantIds, selectedMazeId],
  );
  const activeMaze = useMemo(
    () => {
      if (!activeMazeId) return selectedMaze;
      if (activeMazeId === GRAND_PALAIS_SCENE_ID && finaleMaze) {
        return finaleMaze;
      }
      return resolveMazeEntrance(
        findMaze(activeMazeId),
        entranceVariantIds[activeMazeId] ?? "",
      );
    },
    [activeMazeId, entranceVariantIds, finaleMaze, selectedMaze],
  );
  const activeRoute = activeMaze.routes.find(
    (route) => route.id === activeRouteId,
  );
  const composedPrompt = useMemo(
    () =>
      composeWorldPrompt(activeMaze, activeRoute, {
        actionMode: "ambient",
      }),
    [activeMaze, activeRoute],
  );
  const inspectedPrompt =
    typeof modelState?.current_prompt === "string"
      ? modelState.current_prompt
      : composedPrompt;
  const inspectedPromptSegments = useMemo(
    () => explainFashionMazePrompt(activeMaze, inspectedPrompt),
    [activeMaze, inspectedPrompt],
  );
  const narrative = activeRoute?.narrative ?? activeMaze.entrance;
  const selectableMazes = fashionMazes.filter(
    (maze) => maze.entrySelectable !== false,
  );
  const hasMultipleMazes = selectableMazes.length > 1;
  const activeSceneIndex = sceneOrderIds.indexOf(activeMaze.id);
  const activeDoorQuestion =
    activeSceneIndex >= 0 ? fashionDoorQuestions[activeSceneIndex] ?? null : null;
  const nextSceneId =
    activeSceneIndex >= 0 ? sceneOrderIds[activeSceneIndex + 1] : undefined;
  const nextScene = nextSceneId ? findMaze(nextSceneId) : null;
  const isFinaleDoor =
    activeSceneIndex === sceneOrderIds.length - 1 &&
    activeMaze.id !== GRAND_PALAIS_SCENE_ID;
  const hasJourneyExit = Boolean(
    activeMaze.sceneTransition &&
      activeDoorQuestion &&
      (nextScene || isFinaleDoor),
  );
  const isGrandPalaisScene = activeMaze.id === GRAND_PALAIS_SCENE_ID;
  const isLive = Boolean(modelState?.started && modelState.running);
  const isPaused = Boolean(modelState?.paused);
  const mainVideoTrack = tracks.main_video;
  const hasVideo = Boolean(mainVideoTrack);
  const generationStarted = Boolean(modelState?.started);
  const revealVideo = generationStarted && videoReady;
  const ambientSyncEligible =
    status === "ready" &&
    isLive &&
    !isPaused &&
    !terminatingRef.current &&
    !photoFlowRef.current.hasPending() &&
    !sceneFlowRef.current.hasPending() &&
    !doorFlowRef.current.hasPending() &&
    phase === "live";
  const busy = [
    "connecting",
    "uploading",
    "arming",
    "starting",
    "switching",
    "ending",
  ].includes(phase);
  const remainingSeconds = Math.max(
    0,
    SCENE_AUTO_ADVANCE_SECONDS - elapsedSeconds,
  );

  const fail = useCallback(
    (cause: unknown) => {
      const message = errorMessage(cause);
      appendDebugEvent("sdk", "runtime_error", message, "error");
      setError(message);
      setPhase("error");
    },
    [appendDebugEvent],
  );

  const clearActivationWatchdog = useCallback(() => {
    if (activationWatchdogRef.current === null) return;
    window.clearTimeout(activationWatchdogRef.current);
    activationWatchdogRef.current = null;
  }, []);

  const clearReconnectWatchdog = useCallback(() => {
    if (reconnectWatchdogRef.current === null) return;
    window.clearTimeout(reconnectWatchdogRef.current);
    reconnectWatchdogRef.current = null;
  }, []);

  const abortActivation = useCallback(
    (cause: unknown) => {
      appendDebugEvent(
        "sdk",
        "activation_aborted",
        errorMessage(cause),
        "error",
      );
      clearActivationWatchdog();
      controlsResetRef.current();
      photoFlowRef.current.reset();
      doorFlowRef.current.reset();
      clearReconnectWatchdog();
      reconnectAttemptRef.current += 1;
      doorReconnectReconcileRef.current = false;
      reconnectingSessionIdRef.current = null;
      failedReconnectSessionIdRef.current = null;
      intentionalDisconnectRef.current = true;
      const activatingFinale =
        finalePhase === "starting" ||
        pendingMazeRef.current?.id === GRAND_PALAIS_SCENE_ID;
      const passedBlackThreshold =
        sceneFlowRef.current.passedBlackThreshold();
      terminatingRef.current = true;
      activationAttemptIdRef.current += 1;
      pendingStartRef.current = false;
      startIssuedRef.current = false;
      pendingMazeRef.current = null;
      stagingIssuedRef.current = false;
      sceneFlowRef.current.reset(passedBlackThreshold ? "failed" : "idle");
      setError(
        `${errorMessage(cause)} The live session closed after an unrecoverable Reactor error.`,
      );
      if (activatingFinale) {
        setFinaleError(
          `${errorMessage(cause)} The generated show is still available to retry.`,
        );
        setFinalePhase("error");
      }
      setPhase("ending");
      void disconnect().catch(fail);
    },
    [
      appendDebugEvent,
      clearActivationWatchdog,
      clearReconnectWatchdog,
      disconnect,
      fail,
      finalePhase,
    ],
  );

  const isTerminating = useCallback(() => terminatingRef.current, []);
  const isAmbientFlowClear = useCallback(
    () =>
      !photoFlowRef.current.hasPending() &&
      !sceneFlowRef.current.hasPending() &&
      !doorFlowRef.current.hasPending(),
    [],
  );
  const composeRoutePrompts = useCallback(
    (route: FashionMaze["routes"][number]) => ({
      transition: composeWorldPrompt(activeMaze, route, {
        isRouteTransition: true,
        actionMode: "ambient",
      }),
      settled: composeWorldPrompt(activeMaze, route, {
        actionMode: "ambient",
      }),
    }),
    [activeMaze],
  );
  const isRouteAvailable = useCallback(
    (routeId: string) =>
      activeMaze.routes.some((route) => route.id === routeId),
    [activeMaze.routes],
  );
  const reportAmbientChunk = useCallback(
    (
      match: {
        confirmed: boolean;
        actionStill: boolean;
        promptMatched: boolean;
      },
      message: Extract<LingbotWorld2Message, { type: "chunk_complete" }>,
      expectedPrompt: string,
    ) => {
      appendDebugEvent(
        "timer",
        match.confirmed ? "ambient_chunk_confirmed" : "ambient_chunk_blocked",
        match.confirmed
          ? `chunk=${message.chunk_index} promptId=${promptFingerprint(expectedPrompt)}`
          : `chunk=${message.chunk_index} still=${match.actionStill} exactMatch=${match.promptMatched} activePromptId=${promptFingerprint(message.active_prompt)} expectedPromptId=${promptFingerprint(expectedPrompt)}`,
        match.confirmed ? "success" : "warning",
      );
    },
    [appendDebugEvent],
  );
  const controls = useReactorControls({
    ambientSyncEligible,
    status,
    currentAmbientPrompt: composedPrompt,
    stageMediaRef,
    lastPromptRef,
    promptRequestIdRef,
    isTerminating,
    isAmbientFlowClear,
    isRouteAvailable,
    composeRoutePrompts,
    scheduleWatchdog: scheduleCreditProtectionTimeout,
    routeWatchdogMs: 15_000,
    setPrompt,
    setCameraPose,
    setMoveLongitudinal,
    setMoveLateral,
    setLookHorizontal,
    setLookVertical,
    onRouteSettled: setActiveRouteId,
    onPhaseChange: (nextPhase) => setPhase(nextPhase),
    onClearError: () => setError(null),
    onUserError: setError,
    onRuntimeError: fail,
    onActivationError: abortActivation,
    onAmbientChunk: reportAmbientChunk,
  });
  const {
    ambientChunkReady,
    canControl,
    getAwaitingAmbientPrompt,
    getExpectedPrompt,
    handleChunk: handleControlsChunk,
    handleCommandError: handleControlsCommandError,
    hasPendingRoute,
    mouseLook,
    noteExternalAxes,
    pendingRouteId,
    pressedControlCodes,
    chooseRoute,
    handleGenerationReset: resetControls,
    releaseControls,
    setAmbientChunkReady,
    setControl,
    toggleMouseLook,
  } = controls;
  controlsResetRef.current = resetControls;
  const canExplore = canControl;
  const reportPhotoMediaEvent = useCallback(
    (event: string, detail: string) =>
      appendDebugEvent("media", event, detail),
    [appendDebugEvent],
  );
  const photo = usePhotoCapture({
    activeMaze,
    activeRoute,
    canTakePhoto: canControl,
    revealVideo,
    stageMediaRef,
    mainVideoTrack,
    hasPendingRoute,
    isTerminating,
    releaseControls,
    setPrompt,
    lastPrompt: lastPromptRef,
    promptRequestId: promptRequestIdRef,
    scheduleWatchdog: scheduleCreditProtectionTimeout,
    onPhaseChange: setPhase,
    onError: setError,
    onAmbientChunkReadyChange: setAmbientChunkReady,
    onFatalError: abortActivation,
    onMediaEvent: reportPhotoMediaEvent,
  });
  const {
    photoState,
    cue: photoCue,
    capturedPhoto,
    flash: photoFlash,
    busy: photoBusy,
    dismissCapturedPhoto,
    hasPending: hasPendingPhoto,
    handleChunk: handlePhotoChunk,
    handleCommandError: handlePhotoCommandError,
    handleLastError: handlePhotoLastError,
    reset: resetPhoto,
    takePhoto,
  } = photo;
  photoFlowRef.current = {
    hasPending: hasPendingPhoto,
    reset: resetPhoto,
  };
  const uploadSceneTargetImage = useCallback(
    async (maze: FashionMaze) => {
      const imageFile = await seedAssetToFile(maze);
      return uploadFile(imageFile, { name: imageFile.name });
    },
    [uploadFile],
  );
  const handleSceneTargetArming = useCallback((maze: FashionMaze) => {
    setActiveMazeId(maze.id);
    setActiveRouteId(null);
    pendingStartRef.current = true;
    startIssuedRef.current = false;
  }, []);
  const handleSceneTransitionComplete = useCallback(() => {
    autoAdvanceIssuedRef.current = false;
    setSessionStartedAt(Date.now());
    setElapsedSeconds(0);
  }, []);
  const handleSceneLongitudinalCommand = useCallback(
    (value: "forward" | "idle") =>
      noteExternalAxes({ longitudinal: value }),
    [noteExternalAxes],
  );
  const beginGrandPalaisFromScene = useCallback(
    () => beginGrandPalaisGenerationRef.current(),
    [],
  );
  const scene = useSceneTransition({
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
    uploadTargetImage: uploadSceneTargetImage,
    setPrompt,
    setSeed,
    setImage,
    setCameraPose,
    setMoveLongitudinal,
    resetGeneration: reset,
    scheduleWatchdog: scheduleCreditProtectionTimeout,
    abortActivation,
    clearActivationWatchdog,
    onPhaseChange: setPhase,
    onErrorChange: setError,
    onAmbientReadyChange: setAmbientChunkReady,
    onTargetArming: handleSceneTargetArming,
    onLongitudinalCommand: handleSceneLongitudinalCommand,
    onBeginGrandPalais: beginGrandPalaisFromScene,
    onTransitionComplete: handleSceneTransitionComplete,
  });
  const {
    stage: sceneTransitionStage,
    activate: activatePreparedSceneTransition,
    handleChunk: handleSceneTransitionChunk,
    handleCommandError: handleSceneTransitionCommandError,
    handleGenerationReset: handleSceneTransitionGenerationReset,
    handleGenerationStarted: handleSceneGenerationStarted,
    handleLastError: handleSceneTransitionLastError,
    handleStartIssued: handleSceneStartIssued,
    hasPending: hasPendingSceneTransition,
    prepare: prepareSceneTransition,
    reset: resetSceneTransition,
  } = scene;
  sceneFlowRef.current = {
    hasPending: hasPendingSceneTransition,
    passedBlackThreshold: scene.passedBlackThreshold,
    reset: resetSceneTransition,
  };
  const door = useDoorQuestion({
    sceneId: activeMaze.id,
    sceneHasTransition: Boolean(activeMaze.sceneTransition),
    question: activeDoorQuestion,
    hasJourneyExit,
    canControl,
    revealVideo,
    elapsedSeconds,
    stageMediaRef,
    terminatingRef,
    autoAdvanceIssuedRef,
    hasPendingSceneTransition,
    prepareSceneTransition,
    activateSceneTransition: activatePreparedSceneTransition,
    releaseControls,
    pause,
    resume,
    scheduleWatchdog: scheduleCreditProtectionTimeout,
    abortActivation,
    onPhaseChange: setPhase,
    onErrorChange: setError,
    onSessionStartedAtChange: setSessionStartedAt,
    onElapsedSecondsChange: setElapsedSeconds,
  });
  const {
    dialog: doorQuestionDialog,
    answers: doorAnswers,
    choose: chooseDoorAnswer,
    request: requestDoorTransition,
    handlePauseSignal: handleDoorPauseSignal,
    handleCommandError: handleDoorCommandError,
    handleLastError: handleDoorLastError,
    hasPending: hasPendingDoorQuestion,
    reconcileAfterReconnect: reconcileDoorAfterReconnect,
    reset: resetDoorQuestion,
  } = door;
  doorFlowRef.current = {
    hasPending: hasPendingDoorQuestion,
    reset: resetDoorQuestion,
  };
  const reconcileDoorSignalAfterReconnect = useCallback(
    (signal: "paused" | "resumed") => {
      if (!doorReconnectReconcileRef.current || status !== "ready") {
        return false;
      }
      doorReconnectReconcileRef.current = false;
      return reconcileDoorAfterReconnect(signal);
    },
    [reconcileDoorAfterReconnect, status],
  );
  const portalChoreographyVisible = [
    "summoning",
    "entering",
    "zooming",
  ].includes(sceneTransitionStage);
  const curtainSessionExitVisible =
    status !== "disconnected" &&
    ["resetting", "arming", "starting", "waiting", "failed"].includes(
      sceneTransitionStage,
    );

  const armActivationWatchdog = useCallback(
    (timeoutMs: number, message: string) => {
      clearActivationWatchdog();
      activationWatchdogRef.current = scheduleCreditProtectionTimeout(() => {
        activationWatchdogRef.current = null;
        abortActivation(new Error(message));
      }, timeoutMs);
    },
    [abortActivation, clearActivationWatchdog],
  );

  const startWhenConditionsReady = useCallback(
    (hasImage: boolean, hasPrompt: boolean): boolean => {
      const gate = {
        terminating: terminatingRef.current,
        pendingStart: pendingStartRef.current,
        startIssued: startIssuedRef.current,
        hasImage,
        hasPrompt,
      };
      const canStart = canIssueGenerationStart(gate);
      appendDebugEvent(
        "sdk",
        "start_gate",
        `eligible=${canStart} pending=${gate.pendingStart} issued=${gate.startIssued} image=${hasImage} prompt=${hasPrompt} terminating=${gate.terminating}`,
        canStart ? "success" : "info",
      );
      if (!canStart) {
        return false;
      }

      startIssuedRef.current = true;
      handleSceneStartIssued();
      setPhase("starting");
      armActivationWatchdog(
        START_WATCHDOG_MS,
        "Reactor accepted the entrance conditions but generation did not start in time.",
      );
      appendDebugEvent("sdk", "start_issued", "start() sent");
      void start()
        .then(() => {
          appendDebugEvent("sdk", "start_resolved", "start() promise resolved", "success");
        })
        .catch((cause) => {
          appendDebugEvent("sdk", "start_rejected", errorMessage(cause), "error");
          abortActivation(cause);
        });
      return true;
    },
    [
      abortActivation,
      appendDebugEvent,
      armActivationWatchdog,
      handleSceneStartIssued,
      start,
    ],
  );

  const confirmGenerationStarted = useCallback(
    (source: "state" | "generation_started"): boolean => {
      if (terminatingRef.current) {
        return false;
      }
      const transitionStarted = handleSceneGenerationStarted();
      if (
        !pendingStartRef.current &&
        !startIssuedRef.current &&
        !transitionStarted
      ) return false;

      pendingStartRef.current = false;
      startIssuedRef.current = false;
      if (transitionStarted) {
        appendDebugEvent(
          "sdk",
          "generation_confirmed",
          `source=${source} mode=scene-transition target=${activeMaze.id}`,
          "success",
        );
        return true;
      }

      pendingMazeRef.current = null;
      stagingIssuedRef.current = false;
      setPhase("live");
      armActivationWatchdog(
        VISIBLE_VIDEO_WATCHDOG_MS,
        "Generation started but Reactor did not deliver a visible video frame in time.",
      );
      appendDebugEvent(
        "sdk",
        "generation_confirmed",
        `source=${source} mode=initial-scene`,
        "success",
      );
      return true;
    },
    [
      appendDebugEvent,
      activeMaze.id,
      armActivationWatchdog,
      handleSceneGenerationStarted,
    ],
  );

  useEffect(() => {
    if (
      revealVideo &&
      phase === "live" &&
      sceneTransitionStage === "idle" &&
      ambientChunkReady &&
      sessionStartedAt === null
    ) {
      setSessionStartedAt(Date.now());
      setElapsedSeconds(0);
      autoAdvanceIssuedRef.current = false;
      appendDebugEvent(
        "timer",
        "countdown_started",
        `scene=${activeMaze.id} phase=${phase}`,
        "success",
      );
    }
  }, [
    activeMaze.id,
    ambientChunkReady,
    appendDebugEvent,
    phase,
    revealVideo,
    sceneTransitionStage,
    sessionStartedAt,
  ]);

  useEffect(() => {
    const previous = loggedStatusRef.current;
    if (previous === status) return;
    loggedStatusRef.current = status;
    appendDebugEvent(
      "sdk",
      "status_changed",
      `from=${previous ?? "initial"} to=${status} session=${sessionId ? sessionId.slice(-6) : "none"}`,
      status === "disconnected" && previous !== null ? "warning" : "info",
    );
  }, [appendDebugEvent, sessionId, status]);

  useEffect(() => {
    const previous = loggedPhaseRef.current;
    if (previous === phase) return;
    loggedPhaseRef.current = phase;
    appendDebugEvent(
      "ui",
      "phase_changed",
      `from=${previous ?? "initial"} to=${phase}`,
    );
  }, [appendDebugEvent, phase]);

  useEffect(() => {
    if (loggedSessionIdRef.current === sessionId) return;
    loggedSessionIdRef.current = sessionId;
    appendDebugEvent(
      "sdk",
      sessionId ? "session_allocated" : "session_cleared",
      `session=${sessionId ? sessionId.slice(-6) : "none"}`,
      sessionId ? "success" : "warning",
    );
  }, [appendDebugEvent, sessionId]);

  useEffect(() => {
    const blockers: string[] = [];
    if (!generationStarted) blockers.push("generation");
    if (!videoReady) blockers.push("visible-video");
    if (phase !== "live") blockers.push(`phase:${phase}`);
    if (sceneTransitionStage !== "idle") {
      blockers.push(`scene:${sceneTransitionStage}`);
    }
    if (!ambientChunkReady) blockers.push("ambient-chunk");
    appendDebugEvent(
      "timer",
      "countdown_gate",
      `eligible=${blockers.length === 0} blockedBy=${blockers.join(",") || "none"} started=${sessionStartedAt !== null} modelStarted=${generationStarted} videoReady=${videoReady} ambientReady=${ambientChunkReady}`,
      blockers.length === 0 ? "success" : "info",
    );
  }, [
    ambientChunkReady,
    appendDebugEvent,
    generationStarted,
    phase,
    sceneTransitionStage,
    sessionStartedAt,
    videoReady,
  ]);

  const resetRuntimeAfterDisconnect = useCallback(() => {
    clearReconnectWatchdog();
    clearActivationWatchdog();
    resetControls();
    resetPhoto();
    resetSceneTransition();
    resetDoorQuestion();
    reconnectAttemptRef.current += 1;
    doorReconnectReconcileRef.current = false;
    reconnectingSessionIdRef.current = null;
    failedReconnectSessionIdRef.current = null;
    intentionalDisconnectRef.current = false;
    terminatingRef.current = false;
    activationAttemptIdRef.current += 1;
    pendingStartRef.current = false;
    startIssuedRef.current = false;
    pendingMazeRef.current = null;
    stagingIssuedRef.current = false;
    autoAdvanceIssuedRef.current = false;
    setSessionStartedAt(null);
    setElapsedSeconds(0);
    setVideoReady(false);
    setModelState(null);
    setActiveMazeId(null);
    setActiveRouteId(null);
    setChunkIndex(0);
    setClip(null);
    setClipBusy(false);
    setClipError(null);
    setPhase("preview");
  }, [
    clearActivationWatchdog,
    clearReconnectWatchdog,
    resetControls,
    resetPhoto,
    resetSceneTransition,
    resetDoorQuestion,
  ]);

  const failReconnectAttempt = useCallback(
    (droppedSessionId: string, attempt: number, reason: string) => {
      if (
        reconnectingSessionIdRef.current !== droppedSessionId ||
        reconnectAttemptRef.current !== attempt
      ) {
        return;
      }
      clearReconnectWatchdog();
      reconnectingSessionIdRef.current = null;
      reconnectAttemptRef.current += 1;
      appendDebugEvent(
        "sdk",
        "reconnect_failed",
        `session=${droppedSessionId.slice(-6)} reason=${reason}`,
        "error",
      );
      resetRuntimeAfterDisconnect();
      failedReconnectSessionIdRef.current = droppedSessionId;
      setError(CONNECTION_RECOVERY_FAILED_WARNING);
      if (finalePhase === "starting") {
        setFinaleError(CONNECTION_RECOVERY_FAILED_WARNING);
        setFinalePhase("error");
      }
    },
    [
      appendDebugEvent,
      clearReconnectWatchdog,
      finalePhase,
      resetRuntimeAfterDisconnect,
    ],
  );

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;

    const reconnectingSessionId = reconnectingSessionIdRef.current;
    if (shouldConfirmReactorReconnect(status, reconnectingSessionId)) {
      const restoredSessionId = reconnectingSessionId;
      clearReconnectWatchdog();
      reconnectingSessionIdRef.current = null;
      failedReconnectSessionIdRef.current = null;
      reconnectAttemptRef.current += 1;
      void releaseControls().catch((cause) => {
        appendDebugEvent(
          "sdk",
          "reconnect_idle_rejected",
          errorMessage(cause),
          "warning",
        );
      });
      appendDebugEvent(
        "sdk",
        "reconnect_confirmed",
        `session=${restoredSessionId.slice(-6)} status=ready`,
        "success",
      );
      setError(
        "The Reactor connection was interrupted and restored to the existing session.",
      );
      if (doorReconnectReconcileRef.current && modelState?.started) {
        const signal = modelState.paused ? "paused" : "resumed";
        reconcileDoorSignalAfterReconnect(signal);
        handleDoorPauseSignal(signal);
      }
      return;
    }

    const disconnectAction = classifyReactorDisconnect({
      previousStatus,
      status,
      intentional: intentionalDisconnectRef.current,
      sessionId,
      reconnectingSessionId: reconnectingSessionIdRef.current,
      failedReconnectSessionId: failedReconnectSessionIdRef.current,
    });
    if (disconnectAction === "ignore") return;

    if (disconnectAction === "reset") {
      const wasIntentional = intentionalDisconnectRef.current;
      resetRuntimeAfterDisconnect();
      if (!wasIntentional) setError(CONNECTION_DROPPED_WARNING);
      return;
    }

    if (!sessionId) return;
    if (disconnectAction === "reconnect-failed") {
      failReconnectAttempt(
        sessionId,
        reconnectAttemptRef.current,
        "the recovery transport disconnected",
      );
      return;
    }

    const attempt = ++reconnectAttemptRef.current;
    doorReconnectReconcileRef.current =
      doorFlowRef.current.hasPending();
    reconnectingSessionIdRef.current = sessionId;
    failedReconnectSessionIdRef.current = null;
    setError(CONNECTION_DROPPED_WARNING);
    appendDebugEvent(
      "sdk",
      "reconnect_issued",
      `session=${sessionId.slice(-6)} attempt=${attempt}`,
      "warning",
    );
    clearReconnectWatchdog();
    reconnectWatchdogRef.current = window.setTimeout(() => {
      reconnectWatchdogRef.current = null;
      failReconnectAttempt(
        sessionId,
        attempt,
        `status did not return to ready within ${RECONNECT_CONFIRM_TIMEOUT_MS}ms`,
      );
    }, RECONNECT_CONFIRM_TIMEOUT_MS);
    // SDK 2.12.1 resolves reconnect() even after its internal failure path.
    // Observable `status === "ready"` above is the only success signal.
    void reconnect({ sessionId }).catch((cause) => {
      failReconnectAttempt(sessionId, attempt, errorMessage(cause));
    });
  }, [
    appendDebugEvent,
    clearReconnectWatchdog,
    failReconnectAttempt,
    handleDoorPauseSignal,
    modelState?.paused,
    modelState?.started,
    reconnect,
    reconcileDoorSignalAfterReconnect,
    releaseControls,
    resetRuntimeAfterDisconnect,
    sessionId,
    status,
  ]);

  useEffect(
    () => () => {
      clearActivationWatchdog();
      clearReconnectWatchdog();
      reconnectAttemptRef.current += 1;
      reconnectingSessionIdRef.current = null;
      failedReconnectSessionIdRef.current = null;
    },
    [clearActivationWatchdog, clearReconnectWatchdog],
  );

  useEffect(
    () => () => {
      finaleGenerationAttemptRef.current += 1;
      finaleGenerationAbortRef.current?.abort();
      finaleGenerationAbortRef.current = null;
      if (finaleGenerationTimeoutRef.current !== null) {
        window.clearTimeout(finaleGenerationTimeoutRef.current);
        finaleGenerationTimeoutRef.current = null;
      }
      if (generatedFinaleUrlRef.current) {
        URL.revokeObjectURL(generatedFinaleUrlRef.current);
        generatedFinaleUrlRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (sessionStartedAt === null) return;
    const update = () =>
      setElapsedSeconds(Math.floor((Date.now() - sessionStartedAt) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [sessionStartedAt]);

  useEffect(() => {
    if (!doorQuestionDialog) return;
    const frame = window.requestAnimationFrame(() => {
      if (doorQuestionDialog.phase === "choosing") {
        doorQuestionCardRef.current
          ?.querySelector<HTMLButtonElement>(".door-question-choices button")
          ?.focus();
      } else {
        doorQuestionCardRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [doorQuestionDialog]);

  useEffect(() => {
    setVideoReady(false);
    appendDebugEvent(
      "media",
      "probe_setup",
      `generationStarted=${generationStarted} track=${Boolean(mainVideoTrack)}`,
    );
    if (!mainVideoTrack || !generationStarted) {
      appendDebugEvent(
        "media",
        "probe_waiting",
        `blockedBy=${!generationStarted ? "generation" : "main_video_track"}`,
      );
      return;
    }

    const video = stageMediaRef.current?.querySelector<HTMLVideoElement>(
      ".reactor-video video",
    );
    if (!video) {
      appendDebugEvent(
        "media",
        "video_element_missing",
        "LingbotWorld2MainVideoView has no video element",
        "warning",
      );
      return;
    }

    let cancelled = false;
    let frameRequest: number | null = null;
    let frameWatchdogTimer: number | null = null;
    let frameRetryTimer: number | null = null;
    let visibleFrameCount = 0;
    let lastProbeReport = "";
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 14;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const hasVisiblePixels = () => {
      if (!context) return true;
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        let visiblePixels = 0;
        let totalLuminance = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const luminance =
            pixels[index] * 0.2126 +
            pixels[index + 1] * 0.7152 +
            pixels[index + 2] * 0.0722;
          totalLuminance += luminance;
          if (luminance > 12) visiblePixels += 1;
        }
        const pixelCount = pixels.length / 4;
        return (
          visiblePixels / pixelCount >= 0.06 &&
          totalLuminance / pixelCount >= 6
        );
      } catch {
        // MediaStream frames are normally canvas-readable. If a browser blocks
        // sampling, fall back to the two-frame transport/decoder gate below.
        return true;
      }
    };

    const frameProbeBlockers = () => {
      const blockers: string[] = [];
      if (mainVideoTrack.readyState !== "live") {
        blockers.push(`track:${mainVideoTrack.readyState}`);
      }
      if (mainVideoTrack.muted) blockers.push("track:muted");
      if (video.paused) blockers.push("video:paused");
      if (video.ended) blockers.push("video:ended");
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        blockers.push(`video:readyState-${video.readyState}`);
      }
      if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        blockers.push(`video:size-${video.videoWidth}x${video.videoHeight}`);
      }
      return blockers;
    };

    const reportProbe = (
      event: string,
      detail: string,
      level: DebugLogLevel = "info",
    ) => {
      const signature = `${event}:${detail}`;
      if (signature === lastProbeReport) return;
      lastProbeReport = signature;
      appendDebugEvent("media", event, detail, level);
    };

    const scheduleFrameRetry = () => {
      if (cancelled || frameRetryTimer !== null) return;
      frameRetryTimer = window.setTimeout(() => {
        frameRetryTimer = null;
        ensurePlaybackAndCheck();
      }, 250);
    };

    const cancelPendingFrameProbe = () => {
      if (frameWatchdogTimer !== null) {
        window.clearTimeout(frameWatchdogTimer);
        frameWatchdogTimer = null;
      }
      if (frameRequest === null) return;
      if (typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(frameRequest);
      }
      frameRequest = null;
    };

    const requestFrameCheck = () => {
      if (cancelled || frameRequest !== null) {
        return;
      }
      const blockers = frameProbeBlockers();
      if (blockers.length > 0) {
        visibleFrameCount = 0;
        reportProbe(
          "frame_probe_blocked",
          `blockedBy=${blockers.join(",")} trackMuted=${mainVideoTrack.muted}`,
        );
        scheduleFrameRetry();
        return;
      }
      if (typeof video.requestVideoFrameCallback === "function") {
        const requestedFrame = video.requestVideoFrameCallback(() => {
          if (frameRequest !== requestedFrame) return;
          if (frameWatchdogTimer !== null) {
            window.clearTimeout(frameWatchdogTimer);
            frameWatchdogTimer = null;
          }
          frameRequest = null;
          const callbackBlockers = frameProbeBlockers();
          if (callbackBlockers.length > 0) {
            visibleFrameCount = 0;
            reportProbe(
              "frame_probe_blocked",
              `blockedBy=${callbackBlockers.join(",")} callback=true`,
            );
            scheduleFrameRetry();
            return;
          }
          const visible = hasVisiblePixels();
          visibleFrameCount = visible
            ? visibleFrameCount + 1
            : 0;
          reportProbe(
            "frame_probe_sample",
            `visible=${visible} consecutive=${visibleFrameCount} video=${video.videoWidth}x${video.videoHeight} readyState=${video.readyState}`,
          );
          if (visibleFrameCount >= 2) {
            appendDebugEvent(
              "media",
              "video_ready",
              "two consecutive visible frames confirmed",
              "success",
            );
            setVideoReady(true);
          } else {
            requestFrameCheck();
          }
        });
        frameRequest = requestedFrame;
        frameWatchdogTimer = window.setTimeout(() => {
          if (frameRequest !== requestedFrame) return;
          const recovery = planFrameProbeRecovery("watchdog");
          if (recovery.cancelPending) cancelPendingFrameProbe();
          if (recovery.resetVisibleFrames) visibleFrameCount = 0;
          reportProbe(
            "frame_callback_stalled",
            `timeoutMs=${VIDEO_FRAME_PROBE_TIMEOUT_MS}`,
            "warning",
          );
          if (recovery.scheduleRetry) scheduleFrameRetry();
        }, VIDEO_FRAME_PROBE_TIMEOUT_MS);
      } else if (hasVisiblePixels()) {
        appendDebugEvent(
          "media",
          "video_ready",
          "visible fallback frame confirmed",
          "success",
        );
        setVideoReady(true);
      } else {
        reportProbe("frame_probe_sample", "visible=false fallback=true");
        scheduleFrameRetry();
      }
    };

    function ensurePlaybackAndCheck(event?: Event) {
      if (!video) return;
      reportProbe(
        "video_event",
        `event=${event?.type ?? "probe-retry"} paused=${video.paused} ended=${video.ended} readyState=${video.readyState} size=${video.videoWidth}x${video.videoHeight} track=${mainVideoTrack.readyState} muted=${mainVideoTrack.muted}`,
      );
      if (video.paused) {
        void video
          .play()
          .then(requestFrameCheck)
          .catch((cause) => {
            reportProbe(
              "video_play_rejected",
              errorMessage(cause),
              "warning",
            );
            scheduleFrameRetry();
          });
      } else {
        requestFrameCheck();
      }
    }

    const hideUnavailableStream = (event: Event) => {
      const recovery = planFrameProbeRecovery("stream-unavailable");
      if (recovery.cancelPending) cancelPendingFrameProbe();
      if (recovery.resetVisibleFrames) visibleFrameCount = 0;
      appendDebugEvent(
        "media",
        `track_${event.type}`,
        `readyState=${mainVideoTrack.readyState} muted=${mainVideoTrack.muted}`,
        event.type === "ended" ? "error" : "warning",
      );
      if (recovery.markVideoNotReady) setVideoReady(false);
    };

    video.addEventListener("loadeddata", ensurePlaybackAndCheck);
    video.addEventListener("canplay", ensurePlaybackAndCheck);
    video.addEventListener("playing", requestFrameCheck);
    mainVideoTrack.addEventListener("unmute", ensurePlaybackAndCheck);
    mainVideoTrack.addEventListener("mute", hideUnavailableStream);
    mainVideoTrack.addEventListener("ended", hideUnavailableStream);
    ensurePlaybackAndCheck();

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", ensurePlaybackAndCheck);
      video.removeEventListener("canplay", ensurePlaybackAndCheck);
      video.removeEventListener("playing", requestFrameCheck);
      mainVideoTrack.removeEventListener("unmute", ensurePlaybackAndCheck);
      mainVideoTrack.removeEventListener("mute", hideUnavailableStream);
      mainVideoTrack.removeEventListener("ended", hideUnavailableStream);
      if (frameRetryTimer !== null) {
        window.clearTimeout(frameRetryTimer);
      }
      const recovery = planFrameProbeRecovery("cleanup");
      if (recovery.cancelPending) cancelPendingFrameProbe();
    };
  }, [appendDebugEvent, generationStarted, mainVideoTrack]);

  useEffect(() => {
    if (revealVideo && !hasPendingSceneTransition()) {
      clearActivationWatchdog();
    }
  }, [clearActivationWatchdog, hasPendingSceneTransition, revealVideo]);

  useEffect(() => {
    if (!lastError) {
      handledLastErrorRef.current = null;
      return;
    }
    if (handledLastErrorRef.current === lastError) return;
    handledLastErrorRef.current = lastError;
    appendDebugEvent(
      "sdk",
      "last_error",
      errorMessage(lastError),
      "error",
    );

    if (lastError.code === "RECONNECTION_FAILED") {
      const reconnectingSessionId = reconnectingSessionIdRef.current;
      if (reconnectingSessionId) {
        failReconnectAttempt(
          reconnectingSessionId,
          reconnectAttemptRef.current,
          errorMessage(lastError),
        );
      } else {
        setError(CONNECTION_RECOVERY_FAILED_WARNING);
      }
      return;
    }

    if (handleDoorLastError(lastError)) return;
    if (handleSceneTransitionLastError(lastError)) return;
    if (pendingStartRef.current || startIssuedRef.current) {
      abortActivation(lastError);
      return;
    }
    if (handlePhotoLastError(lastError)) return;
    if (getAwaitingAmbientPrompt()) {
      abortActivation(lastError);
      return;
    }
    setError(errorMessage(lastError));
  }, [
    abortActivation,
    appendDebugEvent,
    failReconnectAttempt,
    getAwaitingAmbientPrompt,
    handleDoorLastError,
    handlePhotoLastError,
    handleSceneTransitionLastError,
    lastError,
  ]);

  useLingbotWorld2Message((message) => {
    const summary = summarizeLingbotMessage(message);
    const expectedPrompt = getExpectedPrompt().trim();
    const detail =
      message.type === "chunk_complete"
        ? `${summary.detail} expectedPromptId=${promptFingerprint(expectedPrompt)} exactMatch=${message.active_prompt.trim() === expectedPrompt} still=${message.active_action === "still"}`
        : summary.detail;
    appendDebugEvent("model", message.type, detail, summary.level);

    switch (message.type) {
      case "state":
        setModelState(message);
        if (message.started) {
          confirmGenerationStarted("state");
        } else {
          startWhenConditionsReady(message.has_image, message.has_prompt);
        }
        if (!terminatingRef.current && message.paused) {
          reconcileDoorSignalAfterReconnect("paused");
          handleDoorPauseSignal("paused");
          setPhase("paused");
        } else if (!terminatingRef.current) {
          reconcileDoorSignalAfterReconnect("resumed");
          handleDoorPauseSignal("resumed");
        }
        break;
      case "conditions_ready":
        startWhenConditionsReady(message.has_image, message.has_prompt);
        break;
      case "generation_started":
        if (terminatingRef.current) break;
        confirmGenerationStarted("generation_started");
        break;
      case "generation_paused":
        if (terminatingRef.current) break;
        reconcileDoorSignalAfterReconnect("paused");
        handleDoorPauseSignal("paused");
        setPhase("paused");
        break;
      case "generation_resumed": {
        if (terminatingRef.current) break;
        const reconciledDoor =
          reconcileDoorSignalAfterReconnect("resumed");
        if (handleDoorPauseSignal("resumed") || reconciledDoor) break;
        setPhase(
          hasPendingPhoto() ||
            hasPendingRoute() ||
            hasPendingSceneTransition()
            ? "switching"
            : "live",
        );
        break;
      }
      case "chunk_complete": {
        if (terminatingRef.current) break;
        setChunkIndex(message.chunk_index);
        if (handleSceneTransitionChunk(message)) break;
        handlePhotoChunk(message);
        handleControlsChunk(message);
        break;
      }
      case "generation_reset":
        clearActivationWatchdog();
        resetControls();
        resetPhoto();
        setVideoReady(false);
        setModelState(null);
        setChunkIndex(0);
        handleSceneTransitionGenerationReset();
        break;
      case "command_error": {
        if (terminatingRef.current) break;
        if (handleDoorCommandError(message)) break;
        if (handleSceneTransitionCommandError(message)) break;
        const wasActivating =
          pendingStartRef.current || startIssuedRef.current;
        pendingStartRef.current = false;
        startIssuedRef.current = false;
        if (wasActivating) {
          abortActivation(
            new Error(`${message.command}: ${message.reason}`),
          );
        } else if (handlePhotoCommandError(message)) {
          break;
        } else if (handleControlsCommandError(message)) {
          break;
        } else if (["pause", "resume"].includes(message.command)) {
          setError(`${message.command}: ${message.reason}`);
          setPhase(isPaused ? "paused" : "live");
        } else {
          fail(new Error(`${message.command}: ${message.reason}`));
        }
        break;
      }
    }
  });

  const stageMaze = useCallback(
    async (maze: FashionMaze, attemptId: number) => {
      const isCurrentAttempt = () =>
        activationAttemptIdRef.current === attemptId &&
        !terminatingRef.current;
      if (!isCurrentAttempt()) return;

      appendDebugEvent(
        "sdk",
        "stage_started",
        `scene=${maze.id} attempt=${attemptId}`,
      );

      setError(null);
      setActiveMazeId(maze.id);
      setActiveRouteId(null);
      resetControls();
      resetPhoto();
      setVideoReady(false);
      pendingStartRef.current = true;
      startIssuedRef.current = false;
      setPhase("uploading");
      armActivationWatchdog(
        ARMING_WATCHDOG_MS,
        "Reactor did not finish arming the entrance image and prompt in time.",
      );

      const imageFile = await seedAssetToFile(maze);
      if (!isCurrentAttempt()) return;
      appendDebugEvent(
        "sdk",
        "seed_asset_ready",
        `bytes=${imageFile.size} type=${imageFile.type || "unknown"}`,
        "success",
      );
      appendDebugEvent("sdk", "upload_issued", `bytes=${imageFile.size}`);
      const imageRef = await uploadFile(imageFile, { name: imageFile.name });
      if (!isCurrentAttempt()) return;
      appendDebugEvent("sdk", "upload_resolved", "image upload complete", "success");
      const prompt = composeWorldPrompt(maze);

      setPhase("arming");
      appendDebugEvent("sdk", "set_seed_issued", `seed=${maze.seed}`);
      await setSeed({ seed: maze.seed });
      if (!isCurrentAttempt()) return;
      appendDebugEvent("sdk", "set_seed_resolved", `seed=${maze.seed}`, "success");
      appendDebugEvent("sdk", "set_image_issued", "uploaded image reference");
      await setImage({ image: imageRef });
      if (!isCurrentAttempt()) return;
      appendDebugEvent("sdk", "set_image_resolved", "image command sent", "success");
      appendDebugEvent(
        "sdk",
        "set_prompt_issued",
        `promptId=${promptFingerprint(prompt)}`,
      );
      await setPrompt({ prompt });
      if (!isCurrentAttempt()) return;
      lastPromptRef.current = prompt;
      appendDebugEvent(
        "sdk",
        "set_prompt_resolved",
        `promptId=${promptFingerprint(prompt)}`,
        "success",
      );
      appendDebugEvent(
        "sdk",
        "stage_commands_complete",
        `scene=${maze.id}`,
        "success",
      );
    },
    [
      appendDebugEvent,
      armActivationWatchdog,
      resetControls,
      resetPhoto,
      setImage,
      setPrompt,
      setSeed,
      uploadFile,
    ],
  );

  const stagePendingMaze = useCallback(() => {
    const maze = pendingMazeRef.current;
    const plan = planPendingMazeStage({
      status,
      hasPendingMaze: Boolean(maze),
      stagingIssued: stagingIssuedRef.current,
      terminating: terminatingRef.current,
    });
    // The SDK command wrappers currently receive a new identity on every
    // render. Keep the failed gate path side-effect free so this callback can
    // safely be re-evaluated without creating an effect -> log -> render loop.
    if (plan.action === "wait" || !maze) {
      return false;
    }
    if (plan.emitStageGate) {
      appendDebugEvent(
        "sdk",
        "stage_gate",
        `eligible=true status=${status} pending=true issued=${stagingIssuedRef.current} terminating=${terminatingRef.current}`,
        "success",
      );
    }
    stagingIssuedRef.current = true;
    const attemptId = activationAttemptIdRef.current;
    appendDebugEvent(
      "sdk",
      "stage_dispatched",
      `scene=${maze.id} attempt=${attemptId}`,
      "success",
    );
    void stageMaze(maze, attemptId).catch((cause) => {
      if (activationAttemptIdRef.current === attemptId) {
        appendDebugEvent("sdk", "stage_rejected", errorMessage(cause), "error");
        abortActivation(cause);
      }
    });
    return true;
  }, [abortActivation, appendDebugEvent, stageMaze, status]);

  // connect() may resolve while the SDK is still in `waiting`. Uploads are
  // accepted only after the observable status reaches `ready`. The direct
  // call also covers an already-ready warm connection, where `status` itself
  // would not change and therefore could not retrigger this effect.
  useEffect(() => {
    stagePendingMaze();
  }, [stagePendingMaze]);

  const enterMaze = useCallback(async () => {
    if (isReactorSessionActive(status, sessionId)) {
      setError(
        "A previous Reactor session may still be billing. End that session before starting another live maze.",
      );
      return;
    }
    if (!reactorConfigured) {
      fail(
        new Error(
          "Reactor API key is missing. Only the static preview is available; run ./check-demo-keys.sh in the server repository, save the key, and restart.",
        ),
      );
      return;
    }

    setError(null);
    const orderSeed = drawSceneOrderSeed();
    setSceneOrderSeed(orderSeed);
    setSceneOrderIds(createFashionMazeSceneOrder(orderSeed));
    if (generatedFinaleUrlRef.current) {
      URL.revokeObjectURL(generatedFinaleUrlRef.current);
      generatedFinaleUrlRef.current = null;
    }
    setFinaleMaze(null);
    setFinalePhase("idle");
    setFinaleStoryIndex(0);
    setFinaleError(null);
    resetDoorQuestion({ clearAnswers: true });
    doorReconnectReconcileRef.current = false;
    setPhase("connecting");
    terminatingRef.current = false;
    activationAttemptIdRef.current += 1;
    appendDebugEvent(
      "ui",
      "start_click",
      `scene=${selectedMaze.id} status=${status} configured=${reactorConfigured}`,
    );
    clearActivationWatchdog();
    autoAdvanceIssuedRef.current = false;
    pendingMazeRef.current = selectedMaze;
    stagingIssuedRef.current = false;
    armActivationWatchdog(
      CONNECTION_READY_WATCHDOG_MS,
      "Reactor did not reach a command-ready connection in time.",
    );
    try {
      if (status === "ready") {
        appendDebugEvent("sdk", "warm_connection_reused", "status=ready");
        stagePendingMaze();
      } else {
        appendDebugEvent("sdk", "connect_issued", `status=${status}`);
        await connect();
        appendDebugEvent(
          "sdk",
          "connect_resolved",
          "connect() promise resolved; waiting for observable ready status",
          "success",
        );
      }
    } catch (cause) {
      appendDebugEvent("sdk", "connect_rejected", errorMessage(cause), "error");
      clearActivationWatchdog();
      pendingMazeRef.current = null;
      stagingIssuedRef.current = false;
      fail(cause);
    }
  }, [
    appendDebugEvent,
    armActivationWatchdog,
    clearActivationWatchdog,
    connect,
    fail,
    reactorConfigured,
    resetDoorQuestion,
    selectedMaze,
    sessionId,
    stagePendingMaze,
    status,
  ]);

  const togglePause = useCallback(async () => {
    if (hasPendingDoorQuestion()) return;
    try {
      if (isPaused) {
        await resume();
      } else {
        await releaseControls();
        if (
          terminatingRef.current ||
          hasPendingPhoto() ||
          hasPendingRoute()
        ) {
          return;
        }
        await pause();
      }
    } catch (cause) {
      fail(cause);
    }
  }, [
    fail,
    hasPendingDoorQuestion,
    hasPendingPhoto,
    hasPendingRoute,
    isPaused,
    pause,
    releaseControls,
    resume,
  ]);

  const captureClip = useCallback(async () => {
    if (
      clipBusy ||
      terminatingRef.current ||
      status !== "ready" ||
      !modelState?.started
    ) {
      return;
    }
    setClipBusy(true);
    setClipError(null);
    try {
      setClip(await requestClip(SNAP_CLIP_SECONDS));
    } catch (cause) {
      setClipError(
        cause instanceof RecordingError
          ? `${cause.code}: ${cause.reason}`
          : cause instanceof Error
            ? cause.message
            : String(cause),
      );
    } finally {
      setClipBusy(false);
    }
  }, [clipBusy, modelState?.started, requestClip, status]);

  const endSession = useCallback(async (): Promise<boolean> => {
    const disconnectedAtStart = status === "disconnected";
    clearReconnectWatchdog();
    reconnectAttemptRef.current += 1;
    reconnectingSessionIdRef.current = null;
    failedReconnectSessionIdRef.current = null;
    intentionalDisconnectRef.current = true;
    terminatingRef.current = true;
    doorReconnectReconcileRef.current = false;
    activationAttemptIdRef.current += 1;
    clearActivationWatchdog();
    resetControls();
    resetPhoto();
    resetSceneTransition();
    resetDoorQuestion();
    setPhase("ending");
    setError(null);
    await Promise.race([
      releaseControls().catch(() => undefined),
      new Promise<void>((resolve) =>
        window.setTimeout(resolve, CONTROL_RELEASE_TIMEOUT_MS),
      ),
    ]);
    // Releasing held inputs is best effort and bounded. A failed or stalled
    // input reset must never prevent the disconnect that stops billing.
    let disconnectTimer: number | null = null;
    try {
      const disconnectAttempt = disconnect()
        .then(() => ({ status: "disconnected" as const }))
        .catch((cause: unknown) => ({ status: "failed" as const, cause }));
      const disconnectResult = await Promise.race([
        disconnectAttempt,
        new Promise<{ status: "timed-out" }>((resolve) => {
          disconnectTimer = window.setTimeout(
            () => resolve({ status: "timed-out" }),
            DISCONNECT_CONFIRM_TIMEOUT_MS,
          );
        }),
      ]);
      if (disconnectResult.status === "failed") {
        if (disconnectedAtStart) intentionalDisconnectRef.current = false;
        fail(disconnectResult.cause);
        return false;
      }
      if (disconnectResult.status === "timed-out") {
        if (disconnectedAtStart) intentionalDisconnectRef.current = false;
        fail(
          new Error(
            "Reactor did not confirm disconnect within 10 seconds. The session may still be active; retry End Session before continuing.",
          ),
        );
        return false;
      }
    } catch (cause) {
      if (disconnectedAtStart) intentionalDisconnectRef.current = false;
      fail(cause);
      return false;
    } finally {
      if (disconnectTimer !== null) {
        window.clearTimeout(disconnectTimer);
      }
    }
    pendingStartRef.current = false;
    startIssuedRef.current = false;
    pendingMazeRef.current = null;
    stagingIssuedRef.current = false;
    setModelState(null);
    setActiveMazeId(null);
    setActiveRouteId(null);
    setVideoReady(false);
    setChunkIndex(0);
    setClip(null);
    setClipError(null);
    setPhase("preview");
    if (disconnectedAtStart) intentionalDisconnectRef.current = false;
    return true;
  }, [
    clearActivationWatchdog,
    clearReconnectWatchdog,
    disconnect,
    fail,
    releaseControls,
    resetControls,
    resetPhoto,
    resetSceneTransition,
    resetDoorQuestion,
    status,
  ]);

  const beginGrandPalaisGeneration = useCallback(async () => {
    if (finaleGenerationInFlightRef.current) return;
    finaleGenerationInFlightRef.current = true;
    let requestController: AbortController | null = null;
    let requestTimedOut = false;
    try {
      const attempt = ++finaleGenerationAttemptRef.current;
      setFinalePhase("generating");
      setFinaleStoryIndex(0);
      setFinaleError(null);

      if (isReactorSessionActive(status, sessionId)) {
        const ended = await endSession();
        if (!ended || finaleGenerationAttemptRef.current !== attempt) {
          if (finaleGenerationAttemptRef.current === attempt) {
            setFinaleError("The live maze could not release its session.");
            setFinalePhase("error");
          }
          return;
        }
      }
      if (!openaiConfigured) {
        setFinaleError(
          "OpenAI API key is missing. Scene 8 is unavailable; run ./check-demo-keys.sh in the server repository, save the key, and restart.",
        );
        setFinalePhase("error");
        return;
      }

      const body: GrandPalaisGenerationRequest = {
        scenes: sceneOrderIds.map((sceneId) => ({
          sceneId,
          entranceVariantId: entranceVariantIds[sceneId] ?? "",
        })),
      };

      requestController = new AbortController();
      finaleGenerationAbortRef.current = requestController;
      finaleGenerationTimeoutRef.current = window.setTimeout(() => {
        if (finaleGenerationAbortRef.current !== requestController) return;
        requestTimedOut = true;
        finaleGenerationTimeoutRef.current = null;
        requestController?.abort();
      }, GRAND_PALAIS_CLIENT_TIMEOUT_MS);

      try {
        const response = await fetch("/api/grand-palais/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: requestController.signal,
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            payload.error ?? `The finale atelier returned ${response.status}.`,
          );
        }

        const imageBlob = await response.blob();
        if (!imageBlob.type.startsWith("image/") || imageBlob.size === 0) {
          throw new Error("The finale atelier returned an invalid image.");
        }
        const imageUrl = URL.createObjectURL(imageBlob);
        try {
          const preview = new Image();
          preview.src = imageUrl;
          await decodeImage(preview);
        } catch (cause) {
          URL.revokeObjectURL(imageUrl);
          throw cause;
        }
        if (finaleGenerationAttemptRef.current !== attempt) {
          URL.revokeObjectURL(imageUrl);
          return;
        }
        if (generatedFinaleUrlRef.current) {
          URL.revokeObjectURL(generatedFinaleUrlRef.current);
        }
        generatedFinaleUrlRef.current = imageUrl;
        const finaleSeed = drawSceneOrderSeed();
        setFinaleMaze(createGrandPalaisMaze(imageUrl, finaleSeed));
        setFinalePhase("ready");
      } catch (cause) {
        if (finaleGenerationAttemptRef.current !== attempt) return;
        setFinaleError(
          requestTimedOut
            ? "The finale image did not arrive within 170 seconds. Check the network and try again."
            : errorMessage(cause),
        );
        setFinalePhase("error");
      }
    } finally {
      if (
        requestController &&
        finaleGenerationAbortRef.current === requestController
      ) {
        finaleGenerationAbortRef.current = null;
        if (finaleGenerationTimeoutRef.current !== null) {
          window.clearTimeout(finaleGenerationTimeoutRef.current);
          finaleGenerationTimeoutRef.current = null;
        }
      }
      finaleGenerationInFlightRef.current = false;
    }
  }, [
    endSession,
    entranceVariantIds,
    openaiConfigured,
    sceneOrderIds,
    sessionId,
    status,
  ]);

  const cancelGrandPalais = useCallback(async () => {
    if (finaleCancelInFlightRef.current) return;
    finaleCancelInFlightRef.current = true;
    const attempt = ++finaleGenerationAttemptRef.current;
    const requestController = finaleGenerationAbortRef.current;
    finaleGenerationAbortRef.current = null;
    if (finaleGenerationTimeoutRef.current !== null) {
      window.clearTimeout(finaleGenerationTimeoutRef.current);
      finaleGenerationTimeoutRef.current = null;
    }
    requestController?.abort();
    setFinaleError(null);

    try {
      const mustEndSession =
        finalePhase === "starting" ||
        isReactorSessionActive(status, sessionId);
      if (mustEndSession) {
        const ended = await endSession();
        if (finaleGenerationAttemptRef.current !== attempt) return;
        if (!ended) {
          setFinaleError(
            "Reactor did not confirm that the session ended. The old session may still be billing; retry End session.",
          );
          setFinalePhase("error");
          return;
        }
      }
      if (finaleGenerationAttemptRef.current !== attempt) return;
      setFinaleError(null);
      setFinalePhase("idle");
    } finally {
      finaleCancelInFlightRef.current = false;
    }
  }, [endSession, finalePhase, sessionId, status]);

  useEffect(() => {
    beginGrandPalaisGenerationRef.current = () => {
      void beginGrandPalaisGeneration();
    };
  }, [beginGrandPalaisGeneration]);

  const attendGrandPalais = useCallback(async () => {
    if (!reactorConfigured || !finaleMaze || finalePhase !== "ready") {
      setFinaleError(
        !reactorConfigured
          ? "Add REACTOR_API_KEY before attending the generated show."
          : "The generated show is not ready yet.",
      );
      setFinalePhase("error");
      return;
    }

    setFinalePhase("starting");
    setFinaleError(null);
    setError(null);
    terminatingRef.current = false;
    const activationAttemptId = ++activationAttemptIdRef.current;
    clearActivationWatchdog();
    autoAdvanceIssuedRef.current = true;
    pendingMazeRef.current = finaleMaze;
    stagingIssuedRef.current = false;
    setPhase("connecting");
    armActivationWatchdog(
      CONNECTION_READY_WATCHDOG_MS,
      "Reactor did not reach a command-ready connection for Scene 8.",
    );
    try {
      if (status === "ready") {
        stagePendingMaze();
      } else {
        await connect();
      }
      if (activationAttemptIdRef.current !== activationAttemptId) {
        intentionalDisconnectRef.current = true;
        terminatingRef.current = true;
        void disconnect().catch(fail);
      }
    } catch (cause) {
      if (activationAttemptIdRef.current !== activationAttemptId) return;
      clearActivationWatchdog();
      pendingMazeRef.current = null;
      stagingIssuedRef.current = false;
      setFinaleError(errorMessage(cause));
      setFinalePhase("ready");
    }
  }, [
    armActivationWatchdog,
    clearActivationWatchdog,
    connect,
    disconnect,
    fail,
    finaleMaze,
    finalePhase,
    reactorConfigured,
    stagePendingMaze,
    status,
  ]);

  useEffect(() => {
    if (
      finalePhase === "starting" &&
      activeMaze.id === GRAND_PALAIS_SCENE_ID &&
      phase === "live" &&
      revealVideo &&
      ambientChunkReady
    ) {
      setFinalePhase("live");
    }
  }, [
    activeMaze.id,
    ambientChunkReady,
    finalePhase,
    phase,
    revealVideo,
  ]);

  useEffect(() => {
    if (finalePhase !== "generating") return;
    const timer = window.setInterval(() => {
      setFinaleStoryIndex(
        (index) => (index + 1) % GRAND_PALAIS_STORY_LINES.length,
      );
    }, 4_500);
    return () => window.clearInterval(timer);
  }, [finalePhase]);

  useEffect(() => {
    if (
      status !== "ready" ||
      elapsedSeconds < SCENE_AUTO_ADVANCE_SECONDS ||
      autoAdvanceIssuedRef.current
    ) {
      return;
    }

    if (!hasJourneyExit) {
      autoAdvanceIssuedRef.current = true;
      return;
    }
    if (!canControl || !revealVideo) {
      return;
    }

    void requestDoorTransition("automatic");
  }, [
    activeMaze.sceneTransition,
    canControl,
    elapsedSeconds,
    hasJourneyExit,
    requestDoorTransition,
    revealVideo,
    status,
  ]);

  const copyDebugLog = useCallback(async () => {
    const videoElement = stageMediaRef.current?.querySelector<HTMLVideoElement>(
      ".reactor-video video",
    );
    const snapshot = {
      type: "fashion-maze-debug-snapshot",
      exportedAt: new Date().toISOString(),
      status,
      phase,
      scene:
        finalePhase === "idle" ? activeMaze.id : GRAND_PALAIS_SCENE_ID,
      sourceScene: activeMaze.id,
      finale: {
        phase: finalePhase,
        imageReady: Boolean(finaleMaze),
        error: finaleError ? sanitizeReactorDebugText(finaleError) : null,
      },
      sessionAllocated: Boolean(sessionId),
      sessionSuffix: sessionId?.slice(-6) ?? null,
      model: {
        started: generationStarted,
        running: Boolean(modelState?.running),
        paused: isPaused,
        hasImage: Boolean(modelState?.has_image),
        hasPrompt: Boolean(modelState?.has_prompt),
      },
      startup: {
        pendingMaze: Boolean(pendingMazeRef.current),
        stagingIssued: stagingIssuedRef.current,
        pendingStart: pendingStartRef.current,
        startIssued: startIssuedRef.current,
        terminating: terminatingRef.current,
      },
      media: {
        trackAttached: Boolean(mainVideoTrack),
        trackReadyState: mainVideoTrack?.readyState ?? null,
        trackMuted: mainVideoTrack?.muted ?? null,
        videoReady,
        revealVideo,
        videoElement: videoElement
          ? {
              readyState: videoElement.readyState,
              paused: videoElement.paused,
              ended: videoElement.ended,
              width: videoElement.videoWidth,
              height: videoElement.videoHeight,
            }
          : null,
      },
      countdown: {
        ambientChunkReady,
        sessionStarted: sessionStartedAt !== null,
        elapsedSeconds,
        sceneTransitionStage,
      },
      retainedEvents: debugLog.length,
    };
    const value = [
      JSON.stringify(snapshot),
      ...debugLog.map((entry) => JSON.stringify(entry)),
    ].join("\n");
    try {
      await copyPlainText(value);
      setDebugCopyStatus(`Copied ${debugLog.length} events`);
    } catch (cause) {
      setDebugCopyStatus(`Copy failed: ${errorMessage(cause)}`);
    }
  }, [
    activeMaze.id,
    ambientChunkReady,
    debugLog,
    elapsedSeconds,
    finaleError,
    finaleMaze,
    finalePhase,
    generationStarted,
    isPaused,
    mainVideoTrack,
    modelState?.has_image,
    modelState?.has_prompt,
    modelState?.running,
    phase,
    revealVideo,
    sceneTransitionStage,
    sessionId,
    sessionStartedAt,
    status,
    videoReady,
  ]);

  const clearDebugLog = useCallback(() => {
    debugSequenceRef.current = 0;
    debugStartedAtRef.current = Date.now();
    setDebugLog([]);
    setDebugCopyStatus("Log cleared");
  }, []);

  const countdownGateLabel =
    sessionStartedAt !== null
      ? `running · ${elapsedSeconds}s`
      : !generationStarted
        ? "waiting · generation"
        : !videoReady
          ? "waiting · visible video"
          : phase !== "live"
            ? `waiting · phase ${phase}`
            : sceneTransitionStage !== "idle"
              ? `waiting · scene ${sceneTransitionStage}`
              : !ambientChunkReady
                ? "waiting · ambient chunk"
                : "ready to start";

  const phaseCopy: Partial<Record<ExperiencePhase, string>> = {
    connecting: status === "waiting" ? "Waiting for Reactor…" : "Opening the maze…",
    uploading: "Preparing the entrance…",
    arming: "Preparing the world…",
    starting: "The world is materializing…",
    switching:
      sceneTransitionStage === "summoning"
        ? "The black door is appearing…"
        : sceneTransitionStage === "entering"
          ? "Approaching the black door…"
          : sceneTransitionStage === "zooming"
            ? "Entering the black door…"
            : sceneTransitionStage !== "idle"
              ? "The next scene is opening…"
              : photoState === "framing"
                  ? "Preparing the photo…"
              : photoState === "capturing"
                ? "Saving the photo…"
              : photoState === "returning"
                  ? "Returning to the scene…"
                  : "Preparing the scene…",
    ending: "Ending the live session…",
  };

  const statusTone =
    phase === "live" || phase === "switching"
      ? "live"
      : status === "ready"
        ? "ready"
        : status;
  const statusLabel =
    statusTone === "disconnected"
      ? "Preview"
      : statusTone === "live"
        ? "Live"
        : statusTone.charAt(0).toUpperCase() + statusTone.slice(1);
  const photoButtonLabel =
    photoState === "framing"
      ? photoCue?.cue === "LOOK HERE"
        ? "Turning to camera…"
        : photoCue?.cue === "FRAME"
          ? "Frame the scene…"
        : photoCue?.cue === "HOLD" || photoCue?.cue === "SHUTTER"
          ? "Hold the pose…"
          : "Preparing…"
      : photoState === "capturing"
        ? "Saving photo…"
        : photoState === "returning"
          ? "Returning…"
          : photoState === "saved"
            ? "Take another photo"
            : "Take photo";
  const photoCueLabel =
    photoCue?.cue === "LOOK HERE"
      ? "Turning to camera"
      : photoCue?.cue === "FRAME"
        ? "Frame the scene"
        : photoCue?.cue === "HOLD"
          ? "Hold the pose"
          : photoCue?.cue === "SHUTTER"
            ? "Smile"
            : photoCue?.cue === "NICE!"
              ? "Photo saved"
              : "Relax";

  return (
    <main
      className="maze-app"
      style={
        {
          "--maze-accent": activeMaze.accent,
          "--portal-video-zoom-duration": `${PORTAL_VIDEO_ZOOM_MS}ms`,
        } as React.CSSProperties
      }
    >
      <header className="maze-header">
        <a className="maze-wordmark" href="#top" aria-label="Fashion Maze home">
          <span>FASHION</span>
          <i />
          <span>MAZE</span>
        </a>
        <div className="header-meta">
          <span className={`connection-state state-${statusTone}`}>
            <i /> {statusLabel}
          </span>
          <button
            className={`text-button ${operatorOpen ? "is-active" : ""}`}
            onClick={() => setOperatorOpen((open) => !open)}
            aria-expanded={operatorOpen}
            aria-controls="operator-panel"
          >
            Session tools
          </button>
          {isReactorSessionActive(status, sessionId) && (
            <button className="text-button danger" onClick={endSession} disabled={phase === "ending"}>
              End session
            </button>
          )}
        </div>
      </header>

      <section className={`maze-stage phase-${phase}`} id="top">
        <div className="stage-media" ref={stageMediaRef}>
          <NextImage
            className={`seed-preview ${revealVideo ? "is-hidden" : ""}`}
            src={activeMaze.seedImage}
            alt={`Entrance frame for ${activeMaze.title}`}
            fill
            sizes="100vw"
            priority={phase === "preview"}
          />
          <LingbotWorld2MainVideoView
            className={`reactor-video ${revealVideo ? "has-track" : ""} ${
              ["zooming", "covering"].includes(sceneTransitionStage)
                ? "portal-video-zoom"
                : ""
            }`}
            videoObjectFit="cover"
            muted
          />
          <div className="media-vignette" />
          <div className="media-grid" />
          {photoFlash && <div className="photo-flash" aria-hidden="true" />}

          {busy &&
            phaseCopy[phase] &&
            !photoBusy &&
            !portalChoreographyVisible &&
            !doorQuestionDialog && (
            <div className="materializing" role="status">
              <span className="materializing-mark" />
              <p>{phaseCopy[phase]}</p>
            </div>
          )}

          {photoCue && photoBusy && (
            <div
              key={`${photoCue.beatIndex}-${photoCue.cue}`}
              className={`photo-countdown cue-${photoCue.cue
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}`}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <strong>{photoCueLabel}</strong>
            </div>
          )}

          {!isGrandPalaisScene &&
            (phase === "live" || phase === "switching" || phase === "paused") && (
            <div
              className={`live-readout ${
                remainingSeconds <= 10 ? "is-urgent" : ""
              } ${remainingSeconds <= 5 ? "is-critical" : ""} ${
                phase === "paused" ? "is-paused" : ""
              }`}
              role="timer"
              aria-live="off"
              aria-label={`${remainingSeconds} seconds remaining in this scene`}
            >
              <div className="timer-status">
                <span className="live-dot" />
                <b>{phase === "paused" ? "Paused · Credits continue" : "Live"}</b>
              </div>
              <strong className="countdown-value">{remainingSeconds}</strong>
              <span className="countdown-unit">seconds</span>
            </div>
          )}

          {mouseLook && (
            <div className="mouse-look-readout" aria-live="polite">
              <i />
              <span>Press Esc to exit look mode</span>
            </div>
          )}
        </div>

        {hasMultipleMazes && (
          <aside className="maze-index" aria-label="Maze selection">
            <span className="index-label">Choose an entrance</span>
            <div className="index-list">
              {selectableMazes.map((maze, index) => {
                const selected = maze.id === selectedMazeId;
                return (
                  <button
                    key={maze.id}
                    className={selected ? "is-selected" : ""}
                    onClick={() => {
                      setSelectedMazeId(maze.id);
                      setActiveRouteId(null);
                    }}
                    disabled={status !== "disconnected"}
                    aria-label={`Select ${maze.title}`}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <i style={{ background: maze.accent }} />
                    <em>{maze.title}</em>
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        <section
          className={`story-panel ${activeRoute ? "" : "is-entrance"}`}
          aria-live="polite"
        >
          <p className="story-eyebrow">{narrative.eyebrow}</p>
          <p className="story-body">{narrative.body}</p>
          {doorAnswers.length > 0 && (
            <div className="editorial-trail" aria-label="Your editorial choices">
              <span>YOUR EDIT</span>
              <p>{doorAnswers.map((answer) => answer.choiceLabel).join(" · ")}</p>
            </div>
          )}
        </section>

        {status === "disconnected" ? (
          <div className="enter-panel">
            <button
              className="enter-button"
              onClick={enterMaze}
              disabled={
                !reactorConfigured ||
                busy ||
                isReactorSessionActive(status, sessionId)
              }
            >
              <span>Start live maze</span>
            </button>
            <p>
              {reactorConfigured
                ? "Starts a billed Reactor session."
                : "Reactor key missing · static preview only."}
            </p>
            {!openaiConfigured && (
              <p>OpenAI key missing · Scene 8 generation is unavailable.</p>
            )}
            {(!reactorConfigured || !openaiConfigured) && (
              <p>
                Run <code>./check-demo-keys.sh</code> in the server repository
                for setup links and safe local paths.
              </p>
            )}
          </div>
        ) : (
          <div className="control-dock">
            <div className="control-keys" aria-label="Camera movement">
              {CONTROL_BUTTONS.map((control) => (
                <button
                  key={control.code}
                  aria-label={control.hint}
                  aria-pressed={pressedControlCodes.includes(control.code)}
                  disabled={!canExplore}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setControl(control.code, true);
                  }}
                  onPointerUp={() => setControl(control.code, false)}
                  onPointerCancel={() => setControl(control.code, false)}
                  onPointerLeave={() => setControl(control.code, false)}
                  onKeyDown={(event) => {
                    if (
                      !event.repeat &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      setControl(control.code, true);
                    }
                  }}
                  onKeyUp={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setControl(control.code, false);
                    }
                  }}
                  onBlur={() => setControl(control.code, false)}
                >
                  <b>{control.label}</b>
                  <span>{control.hint}</span>
                </button>
              ))}
            </div>
            <div className={`control-actions ${hasJourneyExit ? "has-next-scene" : ""}`}>
              {hasJourneyExit && activeMaze.sceneTransition && (
                <button
                  className="scene-transition-button"
                  onClick={() => void requestDoorTransition("manual")}
                  disabled={!canControl || !revealVideo}
                  aria-label={
                    isFinaleDoor
                      ? "Enter the generated Grand Palais finale"
                      : `Enter ${nextScene?.title ?? "the next scene"}`
                  }
                >
                  <span>{isFinaleDoor ? "Enter finale door" : "Enter black door"}</span>
                </button>
              )}
              <button
                className={`photo-button ${photoBusy ? "is-busy" : ""}`}
                onClick={() => void takePhoto()}
                disabled={
                  !canControl ||
                  !revealVideo ||
                  photoBusy ||
                  Boolean(pendingRouteId)
                }
                aria-label="Take a photo"
                aria-keyshortcuts="C"
              >
                <span>{photoButtonLabel}</span>
                <kbd>C</kbd>
              </button>
              <button
                className={`mouse-look-button ${mouseLook ? "is-active" : ""}`}
                onClick={toggleMouseLook}
                disabled={!canControl}
              >
                {mouseLook ? "Exit look mode" : "Look around"}
              </button>
              <button
                className="pause-button"
                onClick={togglePause}
                disabled={
                  !modelState?.started ||
                  phase === "switching" ||
                  Boolean(doorQuestionDialog)
                }
              >
                <span>{isPaused ? "Resume world" : "Pause world"}</span>
                {!isPaused && <small>Credits continue</small>}
              </button>
            </div>
          </div>
        )}
      </section>

      {doorQuestionDialog && (
        <div className="door-question-backdrop">
          <section
            ref={doorQuestionCardRef}
            className={`door-question-card phase-${doorQuestionDialog.phase}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="door-question-title"
            aria-describedby="door-question-status"
            aria-busy={doorQuestionDialog.phase !== "choosing"}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const focusable = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              );
              if (focusable.length === 0) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <h2 id="door-question-title">
              {doorQuestionDialog.question.prompt}
            </h2>
            <div className="door-question-choices">
              {doorQuestionDialog.question.choices.map((choice) => (
                <button
                  key={choice.id}
                  className={
                    doorQuestionDialog.selectedChoiceId === choice.id
                      ? "is-selected"
                      : ""
                  }
                  onClick={() => void chooseDoorAnswer(choice)}
                  disabled={doorQuestionDialog.phase !== "choosing"}
                >
                  <strong>{choice.label}</strong>
                </button>
              ))}
            </div>
            {error && (
              <p className="door-question-error" role="alert">
                {error}
              </p>
            )}
            <footer>
              <div id="door-question-status" aria-live="polite">
                <span>
                  {doorQuestionDialog.phase === "pausing"
                    ? "Pausing the world…"
                    : doorQuestionDialog.phase === "repausing"
                      ? "Checking the pause…"
                    : doorQuestionDialog.phase === "choosing"
                      ? "Choose an answer to open the door"
                      : doorQuestionDialog.phase === "preparing"
                        ? "Preparing the black door…"
                        : "Answer saved. Continuing…"}
                </span>
                <small>
                  Reactor credits continue while this session is paused.
                </small>
              </div>
              <button
                onClick={() => void endSession()}
                disabled={phase === "ending"}
              >
                {phase === "ending" ? "Ending session…" : "End session"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {["generating", "ready", "starting", "error"].includes(finalePhase) && (
        <section
          className={`grand-palais-overlay phase-${finalePhase}`}
          aria-live="polite"
          aria-busy={finalePhase === "generating" || finalePhase === "starting"}
        >
          {finaleMaze && (
            <NextImage
              className="grand-palais-backdrop"
              src={finaleMaze.seedImage}
              alt="This run’s generated Grand Palais fashion show"
              fill
              sizes="100vw"
              unoptimized
            />
          )}
          <div className="grand-palais-shade" />
          <div className="grand-palais-content">
            {finalePhase === "generating" && (
              <>
                <span className="grand-palais-mark" aria-hidden="true" />
                <p className="grand-palais-kicker">THE FINAL GATE IS OPEN</p>
                <p
                  className="grand-palais-story-line"
                  key={finaleStoryIndex}
                  role="status"
                >
                  {GRAND_PALAIS_STORY_LINES[finaleStoryIndex]}
                </p>
                <small>Seven worlds are becoming one new show.</small>
                <button
                  onClick={() => void cancelGrandPalais()}
                  disabled={phase === "ending"}
                >
                  {phase === "ending"
                    ? "Ending live session…"
                    : "Cancel finale generation"}
                </button>
              </>
            )}

            {finalePhase === "ready" && (
              <>
                <p className="grand-palais-kicker">GRAND PALAIS · SCENE 08</p>
                <h2>You are on time.</h2>
                <p>Your front-row place is waiting.</p>
                <button onClick={() => void attendGrandPalais()}>
                  Attend the show
                </button>
              </>
            )}

            {finalePhase === "starting" && (
              <>
                <span className="grand-palais-mark" aria-hidden="true" />
                <p className="grand-palais-kicker">YOUR SEAT IS OPENING</p>
                <h2>Entering the show…</h2>
                <button
                  onClick={() => void cancelGrandPalais()}
                  disabled={phase === "ending"}
                >
                  {phase === "ending" ? "Ending session…" : "End session"}
                </button>
              </>
            )}

            {finalePhase === "error" && (
              <>
                <p className="grand-palais-kicker">THE FINAL ATELIER PAUSED</p>
                <h2>{finaleMaze ? "Your show is still waiting." : "The image did not arrive."}</h2>
                <p role="alert">{finaleError ?? "Please try again."}</p>
                {isReactorSessionActive(status, sessionId) ? (
                  <button
                    onClick={() => void cancelGrandPalais()}
                    disabled={phase === "ending"}
                  >
                    {phase === "ending"
                      ? "Ending session…"
                      : "Retry end session"}
                  </button>
                ) : finaleMaze ? (
                  <button onClick={() => void attendGrandPalais()}>
                    Attend the show
                  </button>
                ) : (
                  <button onClick={() => void beginGrandPalaisGeneration()}>
                    Try again
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      )}

      <div
        className={`scene-curtain scene-curtain-${sceneTransitionStage}`}
        aria-hidden={curtainSessionExitVisible ? undefined : true}
      >
        {curtainSessionExitVisible && (
          <button
            className="scene-curtain-exit"
            onClick={() => void endSession()}
            disabled={phase === "ending"}
          >
            {phase === "ending" ? "Ending session…" : "End session"}
          </button>
        )}
      </div>

      {capturedPhoto && (
        <aside className="photo-receipt" aria-live="polite">
          <div className="photo-receipt-image">
            <NextImage
              src={capturedPhoto.url}
              alt="Latest Fashion Maze photo"
              fill
              sizes="76px"
              unoptimized
            />
          </div>
          <div>
            <span>Photo saved</span>
          </div>
          <a href={capturedPhoto.url} download={capturedPhoto.filename}>
            Download photo
          </a>
          <button
            onClick={dismissCapturedPhoto}
            aria-label="Close saved photo"
          >
            ×
          </button>
        </aside>
      )}

      {operatorOpen && (
        <aside className="operator-panel" id="operator-panel" aria-label="Reactor operator telemetry">
          <div className="operator-heading">
            <div>
              <span>Session tools</span>
            </div>
            <button onClick={() => setOperatorOpen(false)} aria-label="Close operator panel">×</button>
          </div>

          <dl className="operator-grid">
            <div><dt>CONNECTION</dt><dd>{status}</dd></div>
            <div><dt>PHASE</dt><dd>{phase}</dd></div>
            <div><dt>PROMPT MODE</dt><dd>{sceneTransitionStage !== "idle" ? `scene · ${sceneTransitionStage}` : photoState !== "idle" && photoState !== "saved" ? "photo action" : pendingRouteId ? "route transition" : "observer invariant"}</dd></div>
            <div><dt>CAST</dt><dd>{activeMaze.ensemble.count === "all" ? "all seed-visible performers" : activeMaze.ensemble.count > 0 ? `${activeMaze.ensemble.count} · poised runway holds` : "0 · empty environment"}</dd></div>
            <div><dt>PHOTO</dt><dd>{photoState}</dd></div>
            <div><dt>DECISIONS</dt><dd>{doorAnswers.length} / {fashionDoorQuestions.length}</dd></div>
            <div><dt>RUN ORDER</dt><dd>{sceneOrderSeed || "not drawn"} · {activeSceneIndex >= 0 ? `${activeSceneIndex + 1}/${sceneOrderIds.length}` : "finale"}</dd></div>
            <div><dt>CHUNK</dt><dd>{chunkIndex}</dd></div>
            <div><dt>ACTION</dt><dd>{modelState?.current_action ?? "—"}</dd></div>
            <div><dt>CAMERA POSE</dt><dd>{mouseLook || modelState?.camera_pose_active ? "active" : "idle"}</dd></div>
            <div><dt>IMAGE</dt><dd>{modelState?.has_image ? "ready" : "not armed"}</dd></div>
            <div><dt>VIDEO TRACK</dt><dd>{videoReady ? "rendering" : tracks.main_video ? "warming up" : "waiting"}</dd></div>
            <div><dt>STABLE CHUNK</dt><dd>{ambientChunkReady ? "confirmed" : "waiting"}</dd></div>
            <div><dt>TIMER GATE</dt><dd>{countdownGateLabel}</dd></div>
            <div><dt>START FLAGS</dt><dd>{`maze:${pendingMazeRef.current ? "1" : "0"} stage:${stagingIssuedRef.current ? "1" : "0"} pending:${pendingStartRef.current ? "1" : "0"} issued:${startIssuedRef.current ? "1" : "0"}`}</dd></div>
          </dl>

          <div className="operator-session">
            <span>SESSION</span>
            <code>{sessionId ?? "not allocated"}</code>
          </div>

          <div className="operator-capture">
            <div>
              <span>Save session clip</span>
            </div>
            <button
              onClick={captureClip}
              disabled={
                clipBusy ||
                phase === "ending" ||
                status !== "ready" ||
                !modelState?.started
              }
            >
              {clipBusy ? "Saving…" : `Save last ${SNAP_CLIP_SECONDS} seconds`}
            </button>
            {clipError && <p role="alert">{clipError}</p>}
          </div>

          <details className="debug-log">
            <summary>
              <span>Debug event log</span>
              <em>{debugLog.length} / {DEBUG_LOG_LIMIT}</em>
            </summary>
            <div className="debug-log-actions">
              <button onClick={() => void copyDebugLog()}>
                Copy log
              </button>
              <button onClick={clearDebugLog} disabled={debugLog.length === 0}>
                Clear
              </button>
              <small>{debugCopyStatus ?? "Best-effort redaction · review before sharing"}</small>
            </div>
            <ol aria-live="off" aria-label="Reactor debug event log">
              {debugLog.length === 0 ? (
                <li className="is-empty">No events recorded yet.</li>
              ) : (
                debugLog.map((entry) => (
                  <li key={entry.seq} data-level={entry.level}>
                    <time dateTime={entry.at}>
                      +{(entry.tMs / 1000).toFixed(2)}s
                    </time>
                    <b>{entry.source} · {entry.event}</b>
                    <small>attempt {entry.attempt}</small>
                    {entry.detail && <code>{entry.detail}</code>}
                  </li>
                ))
              )}
            </ol>
          </details>

          <details className="prompt-inspector">
            <summary>
              <span>ACTIVE COMPOSED PROMPT</span>
              <em
                className={
                  inspectedPrompt.length > FASHION_MAZE_PROMPT_BUDGET.hard
                    ? "is-over"
                    : inspectedPrompt.length > FASHION_MAZE_PROMPT_BUDGET.target
                      ? "is-near"
                      : ""
                }
              >
                {inspectedPrompt.length} / {FASHION_MAZE_PROMPT_BUDGET.hard}
              </em>
            </summary>
            <ol>
              {inspectedPromptSegments.map((item) => (
                <li key={`${item.id}-${item.text}`} data-kind={item.kind}>
                  <header>
                    <span>{item.label}</span>
                    <small>{item.text.length} chars</small>
                  </header>
                  <p>{item.text}</p>
                </li>
              ))}
            </ol>
          </details>
        </aside>
      )}

      {clip && (
        <FashionMazeClipModal
          clip={clip}
          filename={`fashion-maze-${activeMaze.id}-${sessionId?.slice(0, 8) ?? "clip"}.mp4`}
          onClose={() => setClip(null)}
          onError={(cause) => setClipError(cause.message)}
          onDownloaded={() => setClipError(null)}
        />
      )}

      {error && (
        <div className="error-toast" role="alert">
          <span>Notice</span>
          <p>{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss error">×</button>
        </div>
      )}

    </main>
  );
}

function FashionMazeClipModal({
  clip,
  filename,
  onClose,
  onError,
  onDownloaded,
}: {
  clip: Clip;
  filename: string;
  onClose: () => void;
  onError: (error: Error) => void;
  onDownloaded: () => void;
}) {
  return (
    <div className="clip-backdrop" onClick={onClose} role="presentation">
      <section
        className="clip-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Fashion Maze session clip"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="clip-heading">
          <div>
            <span>Session clip</span>
          </div>
          <button onClick={onClose} aria-label="Close clip preview">×</button>
        </div>
        <ClipPlayer
          clip={clip}
          onError={onError}
          className="clip-player"
        />
        <div className="clip-actions">
          <p>The playlist is short-lived. Download the MP4 before ending the demo.</p>
          <ClipDownloadButton
            clip={clip}
            filename={filename}
            onSuccess={onDownloaded}
            onError={onError}
          />
        </div>
      </section>
    </div>
  );
}
