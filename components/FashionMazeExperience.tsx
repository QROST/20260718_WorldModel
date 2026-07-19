"use client";

import {
  LingbotWorld2MainVideoView,
  LingbotWorld2Provider,
  type LingbotWorld2StateMessage,
  useLingbotWorld2,
  useLingbotWorld2Message,
} from "@reactor-models/lingbot-world-2";
import {
  ClipDownloadButton,
  ClipPlayer,
  RecordingError,
  type Clip,
  type FileRef,
} from "@reactor-team/js-sdk";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  composePortalPrompt,
  composeWorldPrompt,
  explainFashionMazePrompt,
  FASHION_MAZE_PROMPT_BUDGET,
  fashionMazes,
  findMaze,
  PORTAL_CHOREOGRAPHY,
  resolvePhotoAction,
  resolveMazeEntrance,
  type FashionMazeDoorChoice,
  type FashionMazeDoorQuestion,
  type FashionMaze,
  type MazeRoute,
} from "@/lib/fashion-maze";

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

type ControlCode =
  | "KeyW"
  | "KeyA"
  | "KeyS"
  | "KeyD"
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown";

interface PendingRoute {
  id: string;
  prompt: string;
  navigation: MazeRoute["navigation"];
}

interface PhotoPromptStep {
  cue: string;
  prompt: string;
  holdChunks: number;
}

type PhotoActionState =
  | "idle"
  | "framing"
  | "capturing"
  | "returning"
  | "saved";

type SceneTransitionStage =
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

interface PendingSceneTransition {
  stage: Exclude<SceneTransitionStage, "idle" | "failed">;
  targetMaze: FashionMaze;
  imageRefPromise: Promise<FileRef>;
  summonPrompt: string;
  enterPrompt: string;
  targetPrompt: string;
  summonMatchedChunks: number;
  enterMatchedChunks: number;
}

type DoorQuestionPhase =
  | "pausing"
  | "repausing"
  | "choosing"
  | "preparing"
  | "resuming";
type DoorQuestionSource = "manual" | "automatic";

interface DoorQuestionDialogState {
  phase: DoorQuestionPhase;
  source: DoorQuestionSource;
  sceneId: string;
  question: FashionMazeDoorQuestion;
  selectedChoiceId: string | null;
  frozenElapsedSeconds: number;
}

interface DoorAnswerRecord {
  sceneId: string;
  question: string;
  choiceId: string;
  choiceLabel: string;
}

interface PendingPhoto {
  stage: "capture" | "capturing" | "release" | "restore";
  prompt: string;
  cue: string;
  holdChunks: number;
  matchedChunks: number;
  remaining: PhotoPromptStep[];
  beatIndex: number;
  beatCount: number;
  releasePrompt: string;
  releaseHoldChunks: number;
  ambientPrompt: string;
  issuedAfterSerial: number;
  photoSaved: boolean;
}

interface PhotoCueDisplay {
  cue: string;
  beatIndex: number;
  beatCount: number;
}

interface CapturedPhoto {
  url: string;
  filename: string;
  width: number;
  height: number;
  chunkIndex: number;
}

interface FashionMazeExperienceProps {
  reactorConfigured: boolean;
  initialEntranceVariantIds: Record<string, string>;
}

const SCENE_AUTO_ADVANCE_SECONDS = 30;
const TOKEN_EXPIRY_SKEW_SECONDS = 60;
const SNAP_CLIP_SECONDS = 10;
const MOUSE_LOOK_SENSITIVITY = 0.0003;
const MOUSE_LOOK_MAX_ROTATION = 0.2;
const CONNECTION_READY_WATCHDOG_MS = 60_000;
const ARMING_WATCHDOG_MS = 30_000;
const START_WATCHDOG_MS = 20_000;
const VISIBLE_VIDEO_WATCHDOG_MS = 20_000;
const ROUTE_WATCHDOG_MS = 15_000;
const PHOTO_WATCHDOG_MS = 30_000;
const PHOTO_FRAME_TIMEOUT_MS = 2_000;
const PHOTO_ENCODE_TIMEOUT_MS = 2_000;
const CONTROL_RELEASE_TIMEOUT_MS = 750;
const DOOR_QUESTION_WATCHDOG_MS = 20_000;
const SCENE_TRANSITION_WATCHDOG_MS = 45_000;
const PORTAL_COVER_MS = 520;
const PORTAL_REVEAL_MS = 1_100;
const PORTAL_SUMMON_HOLD_CHUNKS = PORTAL_CHOREOGRAPHY.summonHoldChunks;
const PORTAL_APPROACH_HOLD_CHUNKS = PORTAL_CHOREOGRAPHY.approachHoldChunks;
const PORTAL_VIDEO_ZOOM_MS = PORTAL_CHOREOGRAPHY.clientZoomMs;

let cachedToken: { jwt: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

const CONTROL_CODES = new Set<ControlCode>([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
]);

const CONTROL_BUTTONS: Array<{
  code: ControlCode;
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
    const extension = source.type.includes("png") ? "png" : "jpg";
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

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
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

async function waitForFreshVideoFrame(video: HTMLVideoElement): Promise<void> {
  if (typeof video.requestVideoFrameCallback !== "function") {
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let frameRequest: number | null = null;
    const timeout = window.setTimeout(() => {
      if (
        frameRequest !== null &&
        typeof video.cancelVideoFrameCallback === "function"
      ) {
        video.cancelVideoFrameCallback(frameRequest);
      }
      reject(new Error("No fresh Reactor frame arrived for the photo."));
    }, PHOTO_FRAME_TIMEOUT_MS);

    frameRequest = video.requestVideoFrameCallback(() => {
      window.clearTimeout(timeout);
      resolve();
    });
  });
}

async function captureReactorPhoto(
  stage: HTMLDivElement | null,
  track: MediaStreamTrack | undefined,
  mazeId: string,
  chunkIndex: number,
): Promise<CapturedPhoto> {
  const video = stage?.querySelector<HTMLVideoElement>(".reactor-video video");
  if (
    !video ||
    !track ||
    track.readyState !== "live" ||
    track.muted ||
    video.ended ||
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0
  ) {
    throw new Error("The Reactor view is not ready to take a photo yet.");
  }

  await waitForFreshVideoFrame(video);

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is unavailable for photo capture.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("The browser took too long to encode the photo.")),
      PHOTO_ENCODE_TIMEOUT_MS,
    );
    try {
      canvas.toBlob(
        (result) => {
          window.clearTimeout(timeout);
          if (result) {
            resolve(result);
          } else {
            reject(new Error("The browser could not encode the photo."));
          }
        },
        "image/png",
      );
    } catch (cause) {
      window.clearTimeout(timeout);
      reject(cause);
    }
  });
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
  const paddedChunk = chunkIndex.toString().padStart(3, "0");

  return {
    url: URL.createObjectURL(blob),
    filename: `fashion-maze-${mazeId}-chunk-${paddedChunk}-${timestamp}.png`,
    width: canvas.width,
    height: canvas.height,
    chunkIndex,
  };
}

function downloadCapturedPhoto(photo: CapturedPhoto): void {
  const anchor = document.createElement("a");
  anchor.href = photo.url;
  anchor.download = photo.filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function FashionMazeExperience({
  reactorConfigured,
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
        initialEntranceVariantIds={initialEntranceVariantIds}
      />
    </LingbotWorld2Provider>
  );
}

function FashionMazeRuntime({
  reactorConfigured,
  initialEntranceVariantIds,
}: FashionMazeExperienceProps) {
  const {
    status,
    sessionId,
    tracks,
    lastError,
    connect,
    disconnect,
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
  const [selectedMazeId, setSelectedMazeId] = useState(fashionMazes[0].id);
  const [activeMazeId, setActiveMazeId] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ExperiencePhase>("preview");
  const [modelState, setModelState] =
    useState<LingbotWorld2StateMessage | null>(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [mouseLook, setMouseLook] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [sceneTransitionStage, setSceneTransitionStage] =
    useState<SceneTransitionStage>("idle");
  const [targetSceneChunkReady, setTargetSceneChunkReady] = useState(false);
  const [ambientChunkReady, setAmbientChunkReady] = useState(false);
  const [doorQuestionDialog, setDoorQuestionDialog] =
    useState<DoorQuestionDialogState | null>(null);
  const [doorAnswers, setDoorAnswers] = useState<DoorAnswerRecord[]>([]);
  const [photoState, setPhotoState] = useState<PhotoActionState>("idle");
  const [photoCue, setPhotoCue] = useState<PhotoCueDisplay | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(null);
  const [photoFlash, setPhotoFlash] = useState(false);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [clip, setClip] = useState<Clip | null>(null);
  const [clipBusy, setClipBusy] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);
  const [pressedControlCodes, setPressedControlCodes] = useState<ControlCode[]>([]);

  const pendingStartRef = useRef(false);
  const startIssuedRef = useRef(false);
  const pendingMazeRef = useRef<FashionMaze | null>(null);
  const stagingIssuedRef = useRef(false);
  const autoAdvanceIssuedRef = useRef(false);
  const pendingRouteRef = useRef<PendingRoute | null>(null);
  const pendingPhotoRef = useRef<PendingPhoto | null>(null);
  const pendingSceneTransitionRef =
    useRef<PendingSceneTransition | null>(null);
  const pendingDoorQuestionRef = useRef<DoorQuestionDialogState | null>(null);
  const preparedSceneTransitionRef = useRef<PendingSceneTransition | null>(null);
  const activatePreparedSceneTransitionRef = useRef<
    (pending: PendingSceneTransition) => void
  >(() => undefined);
  const photoBusyRef = useRef(false);
  const chunkSerialRef = useRef(0);
  const heldControlsRef = useRef<ControlCode[]>([]);
  const lastPromptRef = useRef("");
  const awaitingAmbientPromptRef = useRef<string | null>(null);
  const promptRequestIdRef = useRef(0);
  const stageMediaRef = useRef<HTMLDivElement>(null);
  const doorQuestionCardRef = useRef<HTMLElement>(null);
  const mouseLookRef = useRef(false);
  const pendingMouseYawRef = useRef(0);
  const pendingMousePitchRef = useRef(0);
  const sendCameraPoseChunkRef = useRef<() => void>(() => undefined);
  const completePhotoCaptureRef = useRef<
    (pending: PendingPhoto, completedChunk: number) => void
  >(() => undefined);
  const activationWatchdogRef = useRef<number | null>(null);
  const routeWatchdogRef = useRef<number | null>(null);
  const photoWatchdogRef = useRef<number | null>(null);
  const photoFlashTimerRef = useRef<number | null>(null);
  const sceneTransitionWatchdogRef = useRef<number | null>(null);
  const doorQuestionWatchdogRef = useRef<number | null>(null);
  const portalZoomTimerRef = useRef<number | null>(null);
  const portalCoverTimerRef = useRef<number | null>(null);
  const portalRevealTimerRef = useRef<number | null>(null);
  const activationAttemptIdRef = useRef(0);
  const handledLastErrorRef = useRef<unknown>(null);
  const previousStatusRef = useRef(status);
  const terminatingRef = useRef(false);
  const lastAxesRef = useRef({
    longitudinal: "idle",
    lateral: "idle",
    lookHorizontal: "idle",
    lookVertical: "idle",
  });

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
      return resolveMazeEntrance(
        findMaze(activeMazeId),
        entranceVariantIds[activeMazeId] ?? "",
      );
    },
    [activeMazeId, entranceVariantIds, selectedMaze],
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
  const nextScene = activeMaze.sceneTransition
    ? findMaze(activeMaze.sceneTransition.targetSceneId)
    : null;
  const isLive = Boolean(modelState?.started && modelState.running);
  const isPaused = Boolean(modelState?.paused);
  const mainVideoTrack = tracks.main_video;
  const hasVideo = Boolean(mainVideoTrack);
  const generationStarted = Boolean(modelState?.started);
  const revealVideo = generationStarted && videoReady;
  const canSyncAmbient =
    status === "ready" &&
    isLive &&
    !isPaused &&
    !terminatingRef.current &&
    !pendingRouteRef.current &&
    !pendingPhotoRef.current &&
    !pendingSceneTransitionRef.current &&
    !pendingDoorQuestionRef.current &&
    phase === "live";
  const canControl = canSyncAmbient && ambientChunkReady;
  const canExplore = canControl;
  const photoBusy =
    photoState === "framing" ||
    photoState === "capturing" ||
    photoState === "returning";
  const busy = [
    "connecting",
    "uploading",
    "arming",
    "starting",
    "switching",
    "ending",
  ].includes(phase);
  const portalChoreographyVisible = ["summoning", "entering", "zooming"].includes(
    sceneTransitionStage,
  );
  const remainingSeconds = Math.max(
    0,
    SCENE_AUTO_ADVANCE_SECONDS - elapsedSeconds,
  );

  const fail = useCallback((cause: unknown) => {
    setError(errorMessage(cause));
    setPhase("error");
  }, []);

  const clearActivationWatchdog = useCallback(() => {
    if (activationWatchdogRef.current === null) return;
    window.clearTimeout(activationWatchdogRef.current);
    activationWatchdogRef.current = null;
  }, []);

  const clearRouteWatchdog = useCallback(() => {
    if (routeWatchdogRef.current === null) return;
    window.clearTimeout(routeWatchdogRef.current);
    routeWatchdogRef.current = null;
  }, []);

  const clearPhotoWatchdog = useCallback(() => {
    if (photoWatchdogRef.current === null) return;
    window.clearTimeout(photoWatchdogRef.current);
    photoWatchdogRef.current = null;
  }, []);

  const clearDoorQuestionWatchdog = useCallback(() => {
    if (doorQuestionWatchdogRef.current === null) return;
    window.clearTimeout(doorQuestionWatchdogRef.current);
    doorQuestionWatchdogRef.current = null;
  }, []);

  const clearSceneTransitionTimers = useCallback(() => {
    if (sceneTransitionWatchdogRef.current !== null) {
      window.clearTimeout(sceneTransitionWatchdogRef.current);
      sceneTransitionWatchdogRef.current = null;
    }
    clearDoorQuestionWatchdog();
    if (portalZoomTimerRef.current !== null) {
      window.clearTimeout(portalZoomTimerRef.current);
      portalZoomTimerRef.current = null;
    }
    if (portalCoverTimerRef.current !== null) {
      window.clearTimeout(portalCoverTimerRef.current);
      portalCoverTimerRef.current = null;
    }
    if (portalRevealTimerRef.current !== null) {
      window.clearTimeout(portalRevealTimerRef.current);
      portalRevealTimerRef.current = null;
    }
  }, [clearDoorQuestionWatchdog]);

  const markDoorQuestionPaused = useCallback((): boolean => {
    const pending = pendingDoorQuestionRef.current;
    if (
      !pending ||
      (pending.phase !== "pausing" && pending.phase !== "repausing")
    ) {
      return false;
    }
    clearDoorQuestionWatchdog();
    if (pending.phase === "repausing") {
      preparedSceneTransitionRef.current = null;
      pending.selectedChoiceId = null;
    }
    pending.phase = "choosing";
    setDoorQuestionDialog({ ...pending });
    setPhase("paused");
    return true;
  }, [clearDoorQuestionWatchdog]);

  const finishDoorQuestionResume = useCallback((): boolean => {
    const pending = pendingDoorQuestionRef.current;
    if (
      !pending ||
      pending.phase !== "resuming" ||
      !pending.selectedChoiceId
    ) {
      return false;
    }
    const choice = pending.question.choices.find(
      (candidate) => candidate.id === pending.selectedChoiceId,
    );
    const preparedTransition = preparedSceneTransitionRef.current;
    if (!choice || !preparedTransition) return false;

    clearDoorQuestionWatchdog();
    setDoorAnswers((answers) => [
      ...answers.filter((answer) => answer.sceneId !== pending.sceneId),
      {
        sceneId: pending.sceneId,
        question: pending.question.prompt,
        choiceId: choice.id,
        choiceLabel: choice.label,
      },
    ]);
    preparedSceneTransitionRef.current = null;
    pendingDoorQuestionRef.current = null;
    setDoorQuestionDialog(null);
    setPhase("switching");
    activatePreparedSceneTransitionRef.current(preparedTransition);
    return true;
  }, [clearDoorQuestionWatchdog]);

  const abortActivation = useCallback(
    (cause: unknown) => {
      clearActivationWatchdog();
      clearRouteWatchdog();
      clearPhotoWatchdog();
      clearSceneTransitionTimers();
      const transition = pendingSceneTransitionRef.current;
      const passedBlackThreshold = Boolean(
        transition &&
          !["summoning", "entering", "zooming"].includes(transition.stage),
      );
      terminatingRef.current = true;
      activationAttemptIdRef.current += 1;
      pendingStartRef.current = false;
      startIssuedRef.current = false;
      pendingMazeRef.current = null;
      stagingIssuedRef.current = false;
      pendingRouteRef.current = null;
      awaitingAmbientPromptRef.current = null;
      pendingPhotoRef.current = null;
      pendingSceneTransitionRef.current = null;
      pendingDoorQuestionRef.current = null;
      preparedSceneTransitionRef.current = null;
      photoBusyRef.current = false;
      setPendingRouteId(null);
      setPhotoState("idle");
      setPhotoCue(null);
      setPhotoFlash(false);
      setDoorQuestionDialog(null);
      setTargetSceneChunkReady(false);
      setAmbientChunkReady(false);
      setSceneTransitionStage(passedBlackThreshold ? "failed" : "idle");
      setError(`${errorMessage(cause)} The session is being disconnected to protect credits.`);
      setPhase("ending");
      void disconnect().catch(fail);
    },
    [
      clearActivationWatchdog,
      clearPhotoWatchdog,
      clearRouteWatchdog,
      clearSceneTransitionTimers,
      disconnect,
      fail,
    ],
  );

  const armAmbientPromptWatchdog = useCallback(
    (expectedPrompt: string, message: string) => {
      clearRouteWatchdog();
      awaitingAmbientPromptRef.current = expectedPrompt;
      routeWatchdogRef.current = window.setTimeout(() => {
        routeWatchdogRef.current = null;
        if (
          awaitingAmbientPromptRef.current !== expectedPrompt ||
          terminatingRef.current
        ) {
          return;
        }
        abortActivation(new Error(message));
      }, ROUTE_WATCHDOG_MS);
    },
    [abortActivation, clearRouteWatchdog],
  );

  const repauseDoorQuestion = useCallback((): boolean => {
    const pending = pendingDoorQuestionRef.current;
    if (
      !pending ||
      !["choosing", "preparing"].includes(pending.phase) ||
      terminatingRef.current
    ) {
      return false;
    }

    clearDoorQuestionWatchdog();
    preparedSceneTransitionRef.current = null;
    pending.phase = "repausing";
    pending.selectedChoiceId = null;
    setDoorQuestionDialog({ ...pending });
    setPhase("paused");
    setError(
      "Reactor resumed before the door decision was complete. Restoring the pause…",
    );
    doorQuestionWatchdogRef.current = window.setTimeout(() => {
      if (
        pendingDoorQuestionRef.current === pending &&
        pending.phase === "repausing" &&
        !terminatingRef.current
      ) {
        abortActivation(
          new Error(
            "Reactor could not restore the paused door decision in time.",
          ),
        );
      }
    }, DOOR_QUESTION_WATCHDOG_MS);
    void pause().catch((cause) => {
      if (
        pendingDoorQuestionRef.current === pending &&
        pending.phase === "repausing" &&
        !terminatingRef.current
      ) {
        abortActivation(
          new Error(
            `Reactor could not restore the paused door decision: ${errorMessage(cause)}`,
          ),
        );
      }
    });
    return true;
  }, [abortActivation, clearDoorQuestionWatchdog, pause]);

  const armActivationWatchdog = useCallback(
    (timeoutMs: number, message: string) => {
      clearActivationWatchdog();
      activationWatchdogRef.current = window.setTimeout(() => {
        activationWatchdogRef.current = null;
        abortActivation(new Error(message));
      }, timeoutMs);
    },
    [abortActivation, clearActivationWatchdog],
  );

  const armSceneTransitionWatchdog = useCallback(
    (pending: PendingSceneTransition, message: string) => {
      if (sceneTransitionWatchdogRef.current !== null) {
        window.clearTimeout(sceneTransitionWatchdogRef.current);
      }
      sceneTransitionWatchdogRef.current = window.setTimeout(() => {
        sceneTransitionWatchdogRef.current = null;
        if (
          pendingSceneTransitionRef.current === pending &&
          !terminatingRef.current
        ) {
          abortActivation(new Error(message));
        }
      }, SCENE_TRANSITION_WATCHDOG_MS);
    },
    [abortActivation],
  );

  const startWhenConditionsReady = useCallback(
    (hasImage: boolean, hasPrompt: boolean): boolean => {
      if (
        terminatingRef.current ||
        !pendingStartRef.current ||
        startIssuedRef.current ||
        !hasImage ||
        !hasPrompt
      ) {
        return false;
      }

      startIssuedRef.current = true;
      const sceneTransition = pendingSceneTransitionRef.current;
      if (sceneTransition?.stage === "arming") {
        sceneTransition.stage = "starting";
        setSceneTransitionStage("starting");
      }
      setPhase("starting");
      armActivationWatchdog(
        START_WATCHDOG_MS,
        "Reactor accepted the entrance conditions but generation did not start in time.",
      );
      void start().catch(abortActivation);
      return true;
    },
    [abortActivation, armActivationWatchdog, start],
  );

  const coverPortal = useCallback(() => {
    const pending = pendingSceneTransitionRef.current;
    if (
      !pending ||
      !["entering", "zooming"].includes(pending.stage) ||
      terminatingRef.current
    ) {
      return;
    }

    pending.stage = "covering";
    setSceneTransitionStage("covering");
    setPhase("switching");
    if (sceneTransitionWatchdogRef.current !== null) {
      window.clearTimeout(sceneTransitionWatchdogRef.current);
      sceneTransitionWatchdogRef.current = null;
    }
    if (portalZoomTimerRef.current !== null) {
      window.clearTimeout(portalZoomTimerRef.current);
      portalZoomTimerRef.current = null;
    }
    lastAxesRef.current.longitudinal = "idle";
    void Promise.all([
      setMoveLongitudinal({ move_longitudinal: "idle" }),
      setCameraPose({ camera_pose: [] }),
    ]).catch(() => undefined);

    portalCoverTimerRef.current = window.setTimeout(() => {
      portalCoverTimerRef.current = null;
      if (
        pendingSceneTransitionRef.current !== pending ||
        pending.stage !== "covering" ||
        terminatingRef.current
      ) {
        return;
      }
      pending.stage = "resetting";
      setSceneTransitionStage("resetting");
      armSceneTransitionWatchdog(
        pending,
        "Reactor did not reset the current scene behind the black door in time.",
      );
      void reset().catch(abortActivation);
    }, PORTAL_COVER_MS);
  }, [
    abortActivation,
    armSceneTransitionWatchdog,
    reset,
    setCameraPose,
    setMoveLongitudinal,
  ]);

  useEffect(() => {
    if (sceneTransitionStage !== "zooming") return;
    const pending = pendingSceneTransitionRef.current;
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
        pendingSceneTransitionRef.current === pending &&
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
    portalZoomTimerRef.current = window.setTimeout(
      finishZoom,
      reducedMotion ? 50 : PORTAL_VIDEO_ZOOM_MS + 250,
    );

    return () => {
      videoView?.removeEventListener("animationend", handleAnimationEnd);
      if (portalZoomTimerRef.current !== null) {
        window.clearTimeout(portalZoomTimerRef.current);
        portalZoomTimerRef.current = null;
      }
    };
  }, [coverPortal, sceneTransitionStage]);

  const restorePhotoAmbient = useCallback(
    (pending: PendingPhoto, reason: string | null) => {
      if (pendingPhotoRef.current !== pending || terminatingRef.current) return;

      clearPhotoWatchdog();
      const restoring: PendingPhoto = {
        ...pending,
        stage: "restore",
        prompt: pending.ambientPrompt,
        cue: pending.photoSaved ? "NICE!" : "RESET",
        holdChunks: 1,
        matchedChunks: 0,
        remaining: [],
        issuedAfterSerial: chunkSerialRef.current,
      };
      pendingPhotoRef.current = restoring;
      photoBusyRef.current = true;
      setPhotoState("returning");
      setPhotoCue({
        cue: restoring.cue,
        beatIndex: restoring.beatCount,
        beatCount: restoring.beatCount,
      });
      setPhase("switching");
      setError(reason);

      const requestId = ++promptRequestIdRef.current;
      lastPromptRef.current = restoring.prompt;
      photoWatchdogRef.current = window.setTimeout(() => {
        photoWatchdogRef.current = null;
        if (
          pendingPhotoRef.current === restoring &&
          !terminatingRef.current
        ) {
          abortActivation(
            new Error(
              "The photo action could not restore the ambient world in time.",
            ),
          );
        }
      }, PHOTO_WATCHDOG_MS);

      void setPrompt({ prompt: restoring.prompt }).catch((cause) => {
        if (
          pendingPhotoRef.current === restoring &&
          promptRequestIdRef.current === requestId &&
          !terminatingRef.current
        ) {
          abortActivation(
            new Error(
              `The photo action could not restore the ambient world: ${errorMessage(cause)}`,
            ),
          );
        }
      });
    },
    [abortActivation, clearPhotoWatchdog, setPrompt],
  );

  const recoverPhoto = useCallback(
    (pending: PendingPhoto, reason: string) => {
      if (pendingPhotoRef.current !== pending || terminatingRef.current) return;

      if (pending.stage === "restore") {
        abortActivation(new Error(reason));
        return;
      }
      restorePhotoAmbient(pending, reason);
    },
    [abortActivation, restorePhotoAmbient],
  );

  const armPhotoWatchdog = useCallback(
    (pending: PendingPhoto, message: string) => {
      clearPhotoWatchdog();
      photoWatchdogRef.current = window.setTimeout(() => {
        photoWatchdogRef.current = null;
        recoverPhoto(pending, message);
      }, PHOTO_WATCHDOG_MS);
    },
    [clearPhotoWatchdog, recoverPhoto],
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
    }
  }, [
    ambientChunkReady,
    phase,
    revealVideo,
    sceneTransitionStage,
    sessionStartedAt,
  ]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;

    // A fresh click changes `phase` before connect() publishes its first
    // transport status. Reset only on an actual disconnect edge; otherwise a
    // render in the initial `disconnected` state erases the pending first run.
    if (status !== "disconnected" || previousStatus === "disconnected") {
      return;
    }

    clearActivationWatchdog();
    clearRouteWatchdog();
    clearPhotoWatchdog();
    clearSceneTransitionTimers();
    terminatingRef.current = false;
    activationAttemptIdRef.current += 1;
    pendingStartRef.current = false;
    startIssuedRef.current = false;
    pendingMazeRef.current = null;
    stagingIssuedRef.current = false;
    autoAdvanceIssuedRef.current = false;
    pendingRouteRef.current = null;
    awaitingAmbientPromptRef.current = null;
    pendingPhotoRef.current = null;
    pendingSceneTransitionRef.current = null;
    pendingDoorQuestionRef.current = null;
    preparedSceneTransitionRef.current = null;
    photoBusyRef.current = false;
    chunkSerialRef.current = 0;
    heldControlsRef.current = [];
    setPressedControlCodes([]);
    lastAxesRef.current = {
      longitudinal: "idle",
      lateral: "idle",
      lookHorizontal: "idle",
      lookVertical: "idle",
    };
    setSessionStartedAt(null);
    setElapsedSeconds(0);
    setPhotoState("idle");
    setPhotoCue(null);
    setPhotoFlash(false);
    setDoorQuestionDialog(null);
    setSceneTransitionStage("idle");
    setTargetSceneChunkReady(false);
    setAmbientChunkReady(false);
    setMouseLook(false);
    setVideoReady(false);
    mouseLookRef.current = false;
    pendingMouseYawRef.current = 0;
    pendingMousePitchRef.current = 0;
    lastPromptRef.current = "";
    promptRequestIdRef.current += 1;
    setModelState(null);
    setActiveMazeId(null);
    setActiveRouteId(null);
    setPendingRouteId(null);
    setChunkIndex(0);
    setClip(null);
    setClipBusy(false);
    setClipError(null);
    setPhase("preview");
  }, [
    clearActivationWatchdog,
    clearPhotoWatchdog,
    clearRouteWatchdog,
    clearSceneTransitionTimers,
    status,
  ]);

  useEffect(
    () => () => {
      clearActivationWatchdog();
      clearRouteWatchdog();
      clearPhotoWatchdog();
      clearSceneTransitionTimers();
      if (photoFlashTimerRef.current !== null) {
        window.clearTimeout(photoFlashTimerRef.current);
      }
    },
    [
      clearActivationWatchdog,
      clearPhotoWatchdog,
      clearRouteWatchdog,
      clearSceneTransitionTimers,
    ],
  );

  useEffect(
    () => () => {
      if (capturedPhoto) URL.revokeObjectURL(capturedPhoto.url);
    },
    [capturedPhoto],
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
    if (!mainVideoTrack || !generationStarted) {
      return;
    }

    const video = stageMediaRef.current?.querySelector<HTMLVideoElement>(
      ".reactor-video video",
    );
    if (!video) return;

    let cancelled = false;
    let frameRequest: number | null = null;
    let visibleFrameCount = 0;
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

    const canInspectFrame = () =>
      mainVideoTrack.readyState === "live" &&
      !mainVideoTrack.muted &&
      !video.paused &&
      !video.ended &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0;

    const requestFrameCheck = () => {
      if (
        cancelled ||
        frameRequest !== null ||
        !canInspectFrame()
      ) {
        return;
      }
      if (typeof video.requestVideoFrameCallback === "function") {
        frameRequest = video.requestVideoFrameCallback(() => {
          frameRequest = null;
          if (!canInspectFrame()) {
            visibleFrameCount = 0;
            return;
          }
          visibleFrameCount = hasVisiblePixels()
            ? visibleFrameCount + 1
            : 0;
          if (visibleFrameCount >= 2) {
            setVideoReady(true);
          } else {
            requestFrameCheck();
          }
        });
      } else if (hasVisiblePixels()) {
        setVideoReady(true);
      }
    };

    const ensurePlaybackAndCheck = () => {
      if (video.paused) {
        void video.play().then(requestFrameCheck).catch(() => undefined);
      } else {
        requestFrameCheck();
      }
    };

    const hideUnavailableStream = () => {
      visibleFrameCount = 0;
      setVideoReady(false);
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
      if (
        frameRequest !== null &&
        typeof video.cancelVideoFrameCallback === "function"
      ) {
        video.cancelVideoFrameCallback(frameRequest);
      }
    };
  }, [generationStarted, mainVideoTrack]);

  useEffect(() => {
    if (revealVideo && !pendingSceneTransitionRef.current) {
      clearActivationWatchdog();
    }
  }, [clearActivationWatchdog, revealVideo, sceneTransitionStage]);

  useEffect(() => {
    const pending = pendingSceneTransitionRef.current;
    if (
      !pending ||
      pending.stage !== "waiting" ||
      !videoReady ||
      !targetSceneChunkReady ||
      terminatingRef.current
    ) {
      return;
    }

    pending.stage = "revealing";
    setSceneTransitionStage("revealing");
    clearActivationWatchdog();
    if (sceneTransitionWatchdogRef.current !== null) {
      window.clearTimeout(sceneTransitionWatchdogRef.current);
      sceneTransitionWatchdogRef.current = null;
    }
    portalRevealTimerRef.current = window.setTimeout(() => {
      portalRevealTimerRef.current = null;
      if (
        pendingSceneTransitionRef.current !== pending ||
        pending.stage !== "revealing" ||
        terminatingRef.current
      ) {
        return;
      }
      pendingSceneTransitionRef.current = null;
      autoAdvanceIssuedRef.current = false;
      setSessionStartedAt(Date.now());
      setElapsedSeconds(0);
      setSceneTransitionStage("idle");
      setTargetSceneChunkReady(false);
      setPhase("live");
      setError(null);
    }, PORTAL_REVEAL_MS);
  }, [clearActivationWatchdog, targetSceneChunkReady, videoReady]);

  useEffect(() => {
    if (!lastError) {
      handledLastErrorRef.current = null;
      return;
    }
    if (handledLastErrorRef.current === lastError) return;
    handledLastErrorRef.current = lastError;

    if (pendingDoorQuestionRef.current) {
      setError(`Door question: ${errorMessage(lastError)}`);
      return;
    }
    if (pendingSceneTransitionRef.current) {
      abortActivation(lastError);
      return;
    }
    if (pendingStartRef.current || startIssuedRef.current) {
      abortActivation(lastError);
      return;
    }
    const pendingPhoto = pendingPhotoRef.current;
    if (pendingPhoto) {
      recoverPhoto(
        pendingPhoto,
        `The photo action failed. ${errorMessage(lastError)} The live scene was restored.`,
      );
      return;
    }
    if (awaitingAmbientPromptRef.current) {
      abortActivation(lastError);
      return;
    }
    setError(errorMessage(lastError));
  }, [abortActivation, lastError, recoverPhoto]);

  useLingbotWorld2Message((message) => {
    switch (message.type) {
      case "state":
        setModelState(message);
        startWhenConditionsReady(message.has_image, message.has_prompt);
        if (!terminatingRef.current && message.paused) {
          markDoorQuestionPaused();
          setPhase("paused");
        } else if (!terminatingRef.current) {
          const finishedDecision = finishDoorQuestionResume();
          if (!finishedDecision) repauseDoorQuestion();
        }
        break;
      case "conditions_ready":
        startWhenConditionsReady(message.has_image, message.has_prompt);
        break;
      case "generation_started":
        if (terminatingRef.current) break;
        if (
          pendingSceneTransitionRef.current?.stage === "starting" ||
          pendingSceneTransitionRef.current?.stage === "arming"
        ) {
          const sceneTransition = pendingSceneTransitionRef.current;
          pendingStartRef.current = false;
          startIssuedRef.current = false;
          sceneTransition.stage = "waiting";
          setSceneTransitionStage("waiting");
          setTargetSceneChunkReady(false);
          setPhase("switching");
          armSceneTransitionWatchdog(
            sceneTransition,
            "The next scene started but did not produce a confirmed visible chunk in time.",
          );
          break;
        }
        pendingStartRef.current = false;
        startIssuedRef.current = false;
        pendingMazeRef.current = null;
        stagingIssuedRef.current = false;
        setPhase("live");
        armActivationWatchdog(
          VISIBLE_VIDEO_WATCHDOG_MS,
          "Generation started but Reactor did not deliver a visible video frame in time.",
        );
        break;
      case "generation_paused":
        if (terminatingRef.current) break;
        markDoorQuestionPaused();
        setPhase("paused");
        break;
      case "generation_resumed":
        if (terminatingRef.current) break;
        if (finishDoorQuestionResume()) break;
        if (repauseDoorQuestion()) break;
        setPhase(
          pendingPhotoRef.current ||
            pendingRouteRef.current ||
            pendingSceneTransitionRef.current
            ? "switching"
            : "live",
        );
        break;
      case "chunk_complete": {
        if (terminatingRef.current) break;
        const chunkSerial = ++chunkSerialRef.current;
        setChunkIndex(message.chunk_index);
        const pendingSceneTransition = pendingSceneTransitionRef.current;
        if (pendingSceneTransition) {
          const activePrompt = message.active_prompt.trim();
          if (
            pendingSceneTransition.stage === "summoning" &&
            activePrompt === pendingSceneTransition.summonPrompt.trim() &&
            message.active_action === "still"
          ) {
            pendingSceneTransition.summonMatchedChunks += 1;
            if (
              pendingSceneTransition.summonMatchedChunks <
              PORTAL_SUMMON_HOLD_CHUNKS
            ) {
              armSceneTransitionWatchdog(
                pendingSceneTransition,
                "The black door-gate did not remain visible long enough to approach.",
              );
            } else {
              pendingSceneTransition.stage = "entering";
              pendingSceneTransition.enterMatchedChunks = 0;
              setSceneTransitionStage("entering");
              armSceneTransitionWatchdog(
                pendingSceneTransition,
                "The observer did not begin the measured approach to the black door-gate in time.",
              );
              promptRequestIdRef.current += 1;
              lastPromptRef.current = pendingSceneTransition.enterPrompt;
              lastAxesRef.current.longitudinal = "forward";
              void Promise.all([
                setCameraPose({ camera_pose: [] }),
                setPrompt({ prompt: pendingSceneTransition.enterPrompt }),
                setMoveLongitudinal({ move_longitudinal: "forward" }),
              ]).catch(abortActivation);
            }
          } else if (
            pendingSceneTransition.stage === "entering" &&
            activePrompt === pendingSceneTransition.enterPrompt.trim()
          ) {
            const isForwardChunk = message.active_action
              .split("+")
              .includes("w");
            if (!isForwardChunk) {
              lastAxesRef.current.longitudinal = "forward";
              armSceneTransitionWatchdog(
                pendingSceneTransition,
                "The camera did not continue its straight approach to the black doorway.",
              );
              void setMoveLongitudinal({ move_longitudinal: "forward" }).catch(
                abortActivation,
              );
              break;
            }
            pendingSceneTransition.enterMatchedChunks += 1;
            if (
              pendingSceneTransition.enterMatchedChunks >=
              PORTAL_APPROACH_HOLD_CHUNKS
            ) {
              pendingSceneTransition.stage = "zooming";
              setSceneTransitionStage("zooming");
              if (sceneTransitionWatchdogRef.current !== null) {
                window.clearTimeout(sceneTransitionWatchdogRef.current);
                sceneTransitionWatchdogRef.current = null;
              }
              lastAxesRef.current.longitudinal = "idle";
              void Promise.all([
                setMoveLongitudinal({ move_longitudinal: "idle" }),
                setCameraPose({ camera_pose: [] }),
              ]).catch(() => undefined);
            } else {
              armSceneTransitionWatchdog(
                pendingSceneTransition,
                "The observer did not continue the measured black-door approach in time.",
              );
            }
          } else if (
            pendingSceneTransition.stage === "waiting" &&
            activePrompt === pendingSceneTransition.targetPrompt.trim() &&
            message.active_action === "still"
          ) {
            setAmbientChunkReady(true);
            setTargetSceneChunkReady(true);
          }
          break;
        }
        const pendingRoute = pendingRouteRef.current;
        if (
          pendingRoute &&
          message.active_prompt.trim() === pendingRoute.prompt.trim()
        ) {
          const expectedAction =
            pendingRoute.navigation === "forward"
              ? "w"
              : pendingRoute.navigation;
          const routeActionConfirmed = message.active_action
            .split("+")
            .includes(expectedAction);
          if (routeActionConfirmed) {
            const settledRoute = activeMaze.routes.find(
              (route) => route.id === pendingRoute.id,
            );
            if (!settledRoute) {
              abortActivation(
                new Error(
                  `The confirmed route ${pendingRoute.id} is no longer available in ${activeMaze.id}.`,
                ),
              );
              break;
            }
            const settledPrompt = composeWorldPrompt(
              activeMaze,
              settledRoute,
              { actionMode: "ambient" },
            );
            if (pendingRoute.navigation === "forward") {
              lastAxesRef.current.longitudinal = "idle";
              void setMoveLongitudinal({ move_longitudinal: "idle" }).catch(
                abortActivation,
              );
            } else {
              lastAxesRef.current.lookHorizontal = "idle";
              void setLookHorizontal({ look_horizontal: "idle" }).catch(
                abortActivation,
              );
            }
            armAmbientPromptWatchdog(
              settledPrompt,
              `Route ${pendingRoute.id} moved, but Reactor did not confirm the settled scene prompt in time.`,
            );
            setActiveRouteId(pendingRoute.id);
            setPendingRouteId(null);
            pendingRouteRef.current = null;
            setPhase("live");
          }
        }
        const pendingPhoto = pendingPhotoRef.current;
        if (
          pendingPhoto &&
          chunkSerial > pendingPhoto.issuedAfterSerial &&
          message.active_prompt.trim() === pendingPhoto.prompt.trim() &&
          message.active_action === "still"
        ) {
          pendingPhoto.matchedChunks += 1;
          pendingPhoto.issuedAfterSerial = chunkSerial;

          if (pendingPhoto.matchedChunks < pendingPhoto.holdChunks) {
            armPhotoWatchdog(
              pendingPhoto,
              `The ${pendingPhoto.cue} photo beat stopped generating. The ambient scene was restored.`,
            );
          } else if (pendingPhoto.stage === "capture") {
            const [nextStep, ...remaining] = pendingPhoto.remaining;
            if (nextStep) {
              const advancing: PendingPhoto = {
                ...pendingPhoto,
                ...nextStep,
                remaining,
                matchedChunks: 0,
                beatIndex: pendingPhoto.beatIndex + 1,
                issuedAfterSerial: chunkSerial,
              };
              pendingPhotoRef.current = advancing;
              setPhotoCue({
                cue: advancing.cue,
                beatIndex: advancing.beatIndex,
                beatCount: advancing.beatCount,
              });
              promptRequestIdRef.current += 1;
              lastPromptRef.current = advancing.prompt;
              armPhotoWatchdog(
                advancing,
                `The ${advancing.cue} photo beat did not begin in time. The ambient scene was restored.`,
              );
              void setPrompt({ prompt: advancing.prompt }).catch((cause) => {
                recoverPhoto(
                  advancing,
                  `The ${advancing.cue} photo beat failed: ${errorMessage(cause)}`,
                );
              });
            } else {
              pendingPhoto.stage = "capturing";
              setPhotoState("capturing");
              armPhotoWatchdog(
                pendingPhoto,
                "The shutter frame could not be saved in time. The ambient scene is being restored.",
              );
              completePhotoCaptureRef.current(
                pendingPhoto,
                message.chunk_index,
              );
            }
          } else if (pendingPhoto.stage === "release") {
            restorePhotoAmbient(pendingPhoto, null);
          } else if (pendingPhoto.stage === "restore") {
            clearPhotoWatchdog();
            pendingPhotoRef.current = null;
            photoBusyRef.current = false;
            setPhotoState(pendingPhoto.photoSaved ? "saved" : "idle");
            setPhotoCue(null);
            setPhase("live");
          }
        }
        const expectedAmbientPrompt =
          awaitingAmbientPromptRef.current ?? lastPromptRef.current;
        if (
          !pendingSceneTransitionRef.current &&
          !pendingRouteRef.current &&
          !pendingPhotoRef.current &&
          message.active_action === "still" &&
          message.active_prompt.trim() === expectedAmbientPrompt.trim()
        ) {
          if (awaitingAmbientPromptRef.current) {
            awaitingAmbientPromptRef.current = null;
            clearRouteWatchdog();
          }
          setAmbientChunkReady(true);
        }
        sendCameraPoseChunkRef.current();
        break;
      }
      case "generation_reset":
        clearActivationWatchdog();
        clearRouteWatchdog();
        clearPhotoWatchdog();
        pendingRouteRef.current = null;
        awaitingAmbientPromptRef.current = null;
        pendingPhotoRef.current = null;
        photoBusyRef.current = false;
        chunkSerialRef.current = 0;
        setPendingRouteId(null);
        setPhotoState("idle");
        setPhotoCue(null);
        setPhotoFlash(false);
        setVideoReady(false);
        setAmbientChunkReady(false);
        setModelState(null);
        setChunkIndex(0);
        lastPromptRef.current = "";
        promptRequestIdRef.current += 1;
        if (pendingSceneTransitionRef.current?.stage === "resetting") {
          const sceneTransition = pendingSceneTransitionRef.current;
          sceneTransition.stage = "arming";
          setActiveMazeId(sceneTransition.targetMaze.id);
          setActiveRouteId(null);
          setSceneTransitionStage("arming");
          setTargetSceneChunkReady(false);
          pendingStartRef.current = true;
          startIssuedRef.current = false;
          setPhase("arming");
          armSceneTransitionWatchdog(
            sceneTransition,
            "Reactor did not accept the next scene image and prompt in time.",
          );
          void sceneTransition.imageRefPromise
            .then(async (imageRef) => {
              if (
                pendingSceneTransitionRef.current !== sceneTransition ||
                sceneTransition.stage !== "arming" ||
                terminatingRef.current
              ) {
                return;
              }
              await setSeed({ seed: sceneTransition.targetMaze.seed });
              if (pendingSceneTransitionRef.current !== sceneTransition) return;
              await setImage({ image: imageRef });
              if (pendingSceneTransitionRef.current !== sceneTransition) return;
              await setPrompt({ prompt: sceneTransition.targetPrompt });
              if (pendingSceneTransitionRef.current !== sceneTransition) return;
              lastPromptRef.current = sceneTransition.targetPrompt;
            })
            .catch(abortActivation);
        }
        break;
      case "command_error": {
        if (terminatingRef.current) break;
        const pendingDoorQuestion = pendingDoorQuestionRef.current;
        if (pendingDoorQuestion) {
          clearDoorQuestionWatchdog();
          preparedSceneTransitionRef.current = null;
          if (pendingDoorQuestion.phase === "repausing") {
            abortActivation(
              new Error(
                `Reactor could not restore the paused door decision (${message.command}: ${message.reason}).`,
              ),
            );
            break;
          }
          if (
            pendingDoorQuestion.phase === "pausing" &&
            pendingDoorQuestion.source === "automatic"
          ) {
            abortActivation(
              new Error(
                `Automatic door question ${message.command}: ${message.reason}.`,
              ),
            );
            break;
          }
          setError(
            `Door question ${message.command}: ${message.reason}. No answer was committed.`,
          );
          if (pendingDoorQuestion.phase === "pausing") {
            pendingDoorQuestionRef.current = null;
            setDoorQuestionDialog(null);
            setSessionStartedAt(
              Date.now() - pendingDoorQuestion.frozenElapsedSeconds * 1_000,
            );
            setElapsedSeconds(pendingDoorQuestion.frozenElapsedSeconds);
            autoAdvanceIssuedRef.current =
              pendingDoorQuestion.source === "automatic";
            setPhase("live");
            void resume().catch(() => undefined);
          } else {
            pendingDoorQuestion.phase = "choosing";
            pendingDoorQuestion.selectedChoiceId = null;
            setDoorQuestionDialog({ ...pendingDoorQuestion });
            setPhase("paused");
          }
          break;
        }
        if (pendingSceneTransitionRef.current) {
          abortActivation(
            new Error(`Scene transition ${message.command}: ${message.reason}`),
          );
          break;
        }
        const wasActivating =
          pendingStartRef.current || startIssuedRef.current;
        const wasRouting = pendingRouteRef.current !== null;
        const pendingPhoto = pendingPhotoRef.current;
        clearRouteWatchdog();
        pendingStartRef.current = false;
        startIssuedRef.current = false;
        pendingRouteRef.current = null;
        setPendingRouteId(null);
        if (wasRouting) {
          lastAxesRef.current.longitudinal = "idle";
          lastAxesRef.current.lookHorizontal = "idle";
          void Promise.all([
            setMoveLongitudinal({ move_longitudinal: "idle" }),
            setLookHorizontal({ look_horizontal: "idle" }),
          ]).catch(() => undefined);
        }
        if (wasActivating) {
          abortActivation(
            new Error(`${message.command}: ${message.reason}`),
          );
        } else if (pendingPhoto) {
          recoverPhoto(
            pendingPhoto,
            `The photo action failed: ${message.command}: ${message.reason}. The live scene was restored.`,
          );
        } else if (wasRouting || awaitingAmbientPromptRef.current) {
          abortActivation(
            new Error(
              `Route transition ${message.command}: ${message.reason}`,
            ),
          );
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

      setError(null);
      setActiveMazeId(maze.id);
      setActiveRouteId(null);
      setPendingRouteId(null);
      setPhotoState("idle");
      setPhotoCue(null);
      setVideoReady(false);
      setAmbientChunkReady(false);
      clearRouteWatchdog();
      pendingRouteRef.current = null;
      awaitingAmbientPromptRef.current = null;
      pendingPhotoRef.current = null;
      photoBusyRef.current = false;
      chunkSerialRef.current = 0;
      promptRequestIdRef.current += 1;
      pendingStartRef.current = true;
      startIssuedRef.current = false;
      setPhase("uploading");
      armActivationWatchdog(
        ARMING_WATCHDOG_MS,
        "Reactor did not finish arming the entrance image and prompt in time.",
      );

      const imageFile = await seedAssetToFile(maze);
      if (!isCurrentAttempt()) return;
      const imageRef = await uploadFile(imageFile, { name: imageFile.name });
      if (!isCurrentAttempt()) return;
      const prompt = composeWorldPrompt(maze);

      setPhase("arming");
      await setSeed({ seed: maze.seed });
      if (!isCurrentAttempt()) return;
      await setImage({ image: imageRef });
      if (!isCurrentAttempt()) return;
      await setPrompt({ prompt });
      if (!isCurrentAttempt()) return;
      lastPromptRef.current = prompt;
    },
    [
      armActivationWatchdog,
      clearRouteWatchdog,
      setImage,
      setPrompt,
      setSeed,
      uploadFile,
    ],
  );

  const stagePendingMaze = useCallback(() => {
    const maze = pendingMazeRef.current;
    if (status !== "ready" || !maze || stagingIssuedRef.current) return false;
    stagingIssuedRef.current = true;
    const attemptId = activationAttemptIdRef.current;
    void stageMaze(maze, attemptId).catch((cause) => {
      if (activationAttemptIdRef.current === attemptId) {
        abortActivation(cause);
      }
    });
    return true;
  }, [abortActivation, stageMaze, status]);

  // connect() may resolve while the SDK is still in `waiting`. Uploads are
  // accepted only after the observable status reaches `ready`. The direct
  // call also covers an already-ready warm connection, where `status` itself
  // would not change and therefore could not retrigger this effect.
  useEffect(() => {
    stagePendingMaze();
  }, [stagePendingMaze]);

  const enterMaze = useCallback(async () => {
    if (!reactorConfigured) {
      fail(new Error("Add REACTOR_API_KEY before starting a live maze."));
      return;
    }

    setError(null);
    pendingDoorQuestionRef.current = null;
    preparedSceneTransitionRef.current = null;
    setDoorQuestionDialog(null);
    setDoorAnswers([]);
    setPhase("connecting");
    terminatingRef.current = false;
    activationAttemptIdRef.current += 1;
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
        stagePendingMaze();
      } else {
        await connect();
      }
    } catch (cause) {
      clearActivationWatchdog();
      pendingMazeRef.current = null;
      stagingIssuedRef.current = false;
      fail(cause);
    }
  }, [
    armActivationWatchdog,
    clearActivationWatchdog,
    connect,
    fail,
    reactorConfigured,
    selectedMaze,
    stagePendingMaze,
    status,
  ]);

  const sendAxes = useCallback(() => {
    if (!canExplore) return;
    const held = heldControlsRef.current;
    const latest = (codes: ControlCode[]) =>
      [...held].reverse().find((code) => codes.includes(code));

    const longitudinal =
      latest(["KeyW", "KeyS"]) === "KeyW"
        ? "forward"
        : latest(["KeyW", "KeyS"]) === "KeyS"
          ? "back"
          : "idle";
    const lateral =
      latest(["KeyA", "KeyD"]) === "KeyA"
        ? "strafe_left"
        : latest(["KeyA", "KeyD"]) === "KeyD"
          ? "strafe_right"
          : "idle";
    const lookHorizontal =
      latest(["ArrowLeft", "ArrowRight"]) === "ArrowLeft"
        ? "left"
        : latest(["ArrowLeft", "ArrowRight"]) === "ArrowRight"
          ? "right"
          : "idle";
    const lookVertical =
      latest(["ArrowUp", "ArrowDown"]) === "ArrowUp"
        ? "up"
        : latest(["ArrowUp", "ArrowDown"]) === "ArrowDown"
          ? "down"
          : "idle";
    const previous = lastAxesRef.current;
    const commands: Promise<void>[] = [];
    if (longitudinal !== previous.longitudinal) {
      commands.push(setMoveLongitudinal({ move_longitudinal: longitudinal }));
    }
    if (lateral !== previous.lateral) {
      commands.push(setMoveLateral({ move_lateral: lateral }));
    }
    if (lookHorizontal !== previous.lookHorizontal) {
      commands.push(setLookHorizontal({ look_horizontal: lookHorizontal }));
    }
    if (lookVertical !== previous.lookVertical) {
      commands.push(setLookVertical({ look_vertical: lookVertical }));
    }
    lastAxesRef.current = {
      longitudinal,
      lateral,
      lookHorizontal,
      lookVertical,
    };
    if (commands.length) void Promise.all(commands).catch(fail);
  }, [
    canExplore,
    fail,
    setLookHorizontal,
    setLookVertical,
    setMoveLateral,
    setMoveLongitudinal,
  ]);

  const setControl = useCallback(
    (code: ControlCode, pressed: boolean) => {
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
    lastAxesRef.current = {
      longitudinal: "idle",
      lateral: "idle",
      lookHorizontal: "idle",
      lookVertical: "idle",
    };
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
    status,
  ]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        isTypingTarget(event.target) ||
        !canExplore ||
        !CONTROL_CODES.has(event.code as ControlCode)
      ) {
        return;
      }
      event.preventDefault();
      setControl(event.code as ControlCode, true);
    };
    const keyup = (event: KeyboardEvent) => {
      if (!CONTROL_CODES.has(event.code as ControlCode)) return;
      if (!canExplore) {
        heldControlsRef.current = heldControlsRef.current.filter(
          (item) => item !== event.code,
        );
        setPressedControlCodes(heldControlsRef.current);
        return;
      }
      event.preventDefault();
      setControl(event.code as ControlCode, false);
    };
    const blur = () => void releaseControls().catch(fail);
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
  }, [canExplore, fail, releaseControls, setControl]);

  const sendMouseCameraPose = useCallback(() => {
    if (!canControl || !mouseLookRef.current) return;
    const clamp = (value: number) =>
      Math.max(
        -MOUSE_LOOK_MAX_ROTATION,
        Math.min(MOUSE_LOOK_MAX_ROTATION, value),
      );
    const yaw = clamp(
      pendingMouseYawRef.current * MOUSE_LOOK_SENSITIVITY,
    );
    const pitch = clamp(
      -pendingMousePitchRef.current * MOUSE_LOOK_SENSITIVITY,
    );
    pendingMouseYawRef.current = 0;
    pendingMousePitchRef.current = 0;
    void setCameraPose({
      camera_pose: [pitch, yaw, 0, 0, 0, 0],
    }).catch(fail);
  }, [canControl, fail, setCameraPose]);

  useEffect(() => {
    sendCameraPoseChunkRef.current = sendMouseCameraPose;
  }, [sendMouseCameraPose]);

  useEffect(() => {
    if (
      !canControl &&
      typeof document !== "undefined" &&
      document.pointerLockElement === stageMediaRef.current
    ) {
      document.exitPointerLock();
    }
  }, [canControl]);

  useEffect(() => {
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
        sendMouseCameraPose();
        return;
      }

      pendingMouseYawRef.current = 0;
      pendingMousePitchRef.current = 0;
      if (status === "ready" && !terminatingRef.current) {
        void setCameraPose({ camera_pose: [] }).catch(fail);
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
    };
  }, [fail, sendMouseCameraPose, setCameraPose, status]);

  const toggleMouseLook = useCallback(() => {
    if (!canControl) return;
    if (document.pointerLockElement === stageMediaRef.current) {
      document.exitPointerLock();
      return;
    }

    const stage = stageMediaRef.current;
    if (!stage || typeof stage.requestPointerLock !== "function") {
      setError("Pointer-lock mouse look is unavailable in this browser.");
      return;
    }
    void stage.requestPointerLock().catch(fail);
  }, [canControl, fail]);

  const prepareSceneTransition = useCallback(async () => {
    const transition = activeMaze.sceneTransition;
    if (
      !transition ||
      !nextScene ||
      status !== "ready" ||
      !revealVideo ||
      terminatingRef.current ||
      pendingSceneTransitionRef.current ||
      pendingRouteRef.current ||
      pendingPhotoRef.current
    ) {
      return null;
    }

    const entranceId =
      entranceVariantIds[nextScene.id] ??
      nextScene.entranceVariantId ??
      nextScene.entranceVariants[0]?.id ??
      "";
    const targetMaze = resolveMazeEntrance(nextScene, entranceId);
    const summonPrompt = composePortalPrompt(activeMaze, activeRoute, "summon");
    const enterPrompt = composePortalPrompt(activeMaze, activeRoute, "enter");
    const targetPrompt = composeWorldPrompt(targetMaze);
    const imageRefPromise = seedAssetToFile(targetMaze).then((imageFile) =>
      uploadFile(imageFile, { name: imageFile.name }),
    );
    void imageRefPromise.catch(() => undefined);
    const pending: PendingSceneTransition = {
      stage: "summoning",
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
    await releaseControls();
    if (terminatingRef.current) return null;
    const previousPrompt = lastPromptRef.current;
    const requestId = ++promptRequestIdRef.current;
    lastPromptRef.current = summonPrompt;
    try {
      await setPrompt({ prompt: summonPrompt });
    } catch (cause) {
      if (
        promptRequestIdRef.current === requestId &&
        lastPromptRef.current === summonPrompt
      ) {
        lastPromptRef.current = previousPrompt;
      }
      throw cause;
    }
    return pending;
  }, [
    activeMaze,
    activeRoute,
    entranceVariantIds,
    nextScene,
    releaseControls,
    revealVideo,
    setPrompt,
    status,
    uploadFile,
  ]);

  const activatePreparedSceneTransition = useCallback(
    (pending: PendingSceneTransition) => {
      if (terminatingRef.current || pendingSceneTransitionRef.current) return;
      pendingSceneTransitionRef.current = pending;
      setSceneTransitionStage("summoning");
      setTargetSceneChunkReady(false);
      setPhase("switching");
      setError(null);
      armSceneTransitionWatchdog(
        pending,
        "The black doorway did not materialize in time.",
      );
      void pending.imageRefPromise.catch((cause) => {
        if (
          pendingSceneTransitionRef.current === pending &&
          !terminatingRef.current
        ) {
          abortActivation(
            new Error(
              `The next scene image could not be staged: ${errorMessage(cause)}`,
            ),
          );
        }
      });
    },
    [abortActivation, armSceneTransitionWatchdog],
  );

  useEffect(() => {
    activatePreparedSceneTransitionRef.current = activatePreparedSceneTransition;
  }, [activatePreparedSceneTransition]);

  const requestDoorTransition = useCallback(
    async (source: DoorQuestionSource = "manual") => {
      const transition = activeMaze.sceneTransition;
      if (
        !transition ||
        !nextScene ||
        !canControl ||
        !revealVideo ||
        pendingDoorQuestionRef.current ||
        pendingSceneTransitionRef.current
      ) {
        return;
      }

      const pending: DoorQuestionDialogState = {
        phase: "pausing",
        source,
        sceneId: activeMaze.id,
        question: transition.question,
        selectedChoiceId: null,
        frozenElapsedSeconds: elapsedSeconds,
      };
      const recoverPause = (message: string): boolean => {
        if (pendingDoorQuestionRef.current !== pending) return false;
        if (source === "automatic") {
          abortActivation(new Error(message));
          return false;
        }
        clearDoorQuestionWatchdog();
        pendingDoorQuestionRef.current = null;
        preparedSceneTransitionRef.current = null;
        setDoorQuestionDialog(null);
        setSessionStartedAt(
          Date.now() - pending.frozenElapsedSeconds * 1_000,
        );
        setElapsedSeconds(pending.frozenElapsedSeconds);
        autoAdvanceIssuedRef.current = false;
        setPhase("live");
        setError(message);
        return true;
      };

      pendingDoorQuestionRef.current = pending;
      preparedSceneTransitionRef.current = null;
      autoAdvanceIssuedRef.current = true;
      setSessionStartedAt(null);
      setDoorQuestionDialog({ ...pending });
      setPhase("switching");
      setError(null);
      if (document.pointerLockElement === stageMediaRef.current) {
        document.exitPointerLock();
      }
      clearDoorQuestionWatchdog();
      doorQuestionWatchdogRef.current = window.setTimeout(() => {
        if (
          recoverPause(
            source === "automatic"
              ? "Reactor did not pause for the automatic door question in time."
              : "Reactor did not pause for the door question. Please try the door again.",
          )
        ) {
          void resume().catch(() => undefined);
        }
      }, DOOR_QUESTION_WATCHDOG_MS);

      try {
        await Promise.race([
          releaseControls(),
          new Promise<void>((resolve) =>
            window.setTimeout(resolve, CONTROL_RELEASE_TIMEOUT_MS),
          ),
        ]);
        if (
          pendingDoorQuestionRef.current !== pending ||
          terminatingRef.current
        ) {
          return;
        }
        await pause();
      } catch (cause) {
        if (
          recoverPause(
            `The scene could not pause for the door question: ${errorMessage(cause)}`,
          )
        ) {
          void resume().catch(() => undefined);
        }
      }
    },
    [
      abortActivation,
      activeMaze.id,
      activeMaze.sceneTransition,
      canControl,
      clearDoorQuestionWatchdog,
      elapsedSeconds,
      nextScene,
      pause,
      releaseControls,
      resume,
      revealVideo,
    ],
  );

  const chooseDoorAnswer = useCallback(
    async (choice: FashionMazeDoorChoice) => {
      const pending = pendingDoorQuestionRef.current;
      if (!pending || pending.phase !== "choosing" || terminatingRef.current) {
        return;
      }

      const returnToChoice = (message: string) => {
        if (pendingDoorQuestionRef.current !== pending) return;
        clearDoorQuestionWatchdog();
        preparedSceneTransitionRef.current = null;
        pending.phase = "choosing";
        pending.selectedChoiceId = null;
        setDoorQuestionDialog({ ...pending });
        setPhase("paused");
        setError(message);
      };

      clearDoorQuestionWatchdog();
      pending.phase = "preparing";
      pending.selectedChoiceId = choice.id;
      setDoorQuestionDialog({ ...pending });
      setError(null);
      doorQuestionWatchdogRef.current = window.setTimeout(() => {
        returnToChoice("The black door took too long to prepare. Choose again to retry.");
      }, DOOR_QUESTION_WATCHDOG_MS);

      try {
        const prepared = await prepareSceneTransition();
        if (
          pendingDoorQuestionRef.current !== pending ||
          pending.phase !== "preparing" ||
          terminatingRef.current
        ) {
          return;
        }
        if (!prepared) {
          throw new Error("The black door is not ready to continue.");
        }
        preparedSceneTransitionRef.current = prepared;
        clearDoorQuestionWatchdog();
        pending.phase = "resuming";
        setDoorQuestionDialog({ ...pending });
        doorQuestionWatchdogRef.current = window.setTimeout(() => {
          if (
            pendingDoorQuestionRef.current === pending &&
            pending.phase === "resuming" &&
            !terminatingRef.current
          ) {
            abortActivation(
              new Error(
                "Reactor did not confirm the resumed door transition in time.",
              ),
            );
          }
        }, DOOR_QUESTION_WATCHDOG_MS);
        await resume();
      } catch (cause) {
        returnToChoice(
          `The door could not continue: ${errorMessage(cause)}`,
        );
      }
    },
    [
      abortActivation,
      clearDoorQuestionWatchdog,
      prepareSceneTransition,
      resume,
    ],
  );

  const chooseRoute = useCallback(
    async (route: MazeRoute) => {
      if (
        !canControl ||
        pendingRouteRef.current ||
        pendingPhotoRef.current
      ) {
        return;
      }
      const prompt = composeWorldPrompt(activeMaze, route, {
        isRouteTransition: true,
        actionMode: "ambient",
      });
      setAmbientChunkReady(false);
      awaitingAmbientPromptRef.current = null;
      promptRequestIdRef.current += 1;
      const pendingRoute: PendingRoute = {
        id: route.id,
        prompt,
        navigation: route.navigation,
      };
      pendingRouteRef.current = pendingRoute;
      setPendingRouteId(route.id);
      setPhase("switching");
      setError(null);
      clearRouteWatchdog();
      routeWatchdogRef.current = window.setTimeout(() => {
        routeWatchdogRef.current = null;
        if (
          pendingRouteRef.current !== pendingRoute ||
          terminatingRef.current
        ) {
          return;
        }
        abortActivation(
          new Error(
            `Route ${route.id} did not produce a prompt-and-action matched chunk in time.`,
          ),
        );
      }, ROUTE_WATCHDOG_MS);
      try {
        await releaseControls();
        if (
          pendingRouteRef.current !== pendingRoute ||
          terminatingRef.current
        ) {
          return;
        }
        if (route.navigation === "forward") {
          lastAxesRef.current.longitudinal = "forward";
          await Promise.all([
            setPrompt({ prompt }),
            setMoveLongitudinal({ move_longitudinal: "forward" }),
          ]);
        } else {
          lastAxesRef.current.lookHorizontal = route.navigation;
          await Promise.all([
            setPrompt({ prompt }),
            setLookHorizontal({ look_horizontal: route.navigation }),
          ]);
        }
        if (
          pendingRouteRef.current !== pendingRoute ||
          terminatingRef.current
        ) {
          return;
        }
        lastPromptRef.current = prompt;
      } catch (cause) {
        if (
          pendingRouteRef.current !== pendingRoute ||
          terminatingRef.current
        ) {
          return;
        }
        abortActivation(cause);
      }
    },
    [
      activeMaze,
      abortActivation,
      canControl,
      clearRouteWatchdog,
      releaseControls,
      setLookHorizontal,
      setMoveLongitudinal,
      setPrompt,
    ],
  );

  const completePhotoCapture = useCallback(
    async (pending: PendingPhoto, completedChunk: number) => {
      let photo: CapturedPhoto;
      try {
        photo = await captureReactorPhoto(
          stageMediaRef.current,
          mainVideoTrack,
          activeMaze.id,
          completedChunk,
        );
      } catch (cause) {
        recoverPhoto(
          pending,
          `The shutter action completed, but the frame could not be saved: ${errorMessage(cause)}`,
        );
        return;
      }

      if (
        pendingPhotoRef.current !== pending ||
        terminatingRef.current
      ) {
        URL.revokeObjectURL(photo.url);
        return;
      }

      setCapturedPhoto(photo);
      try {
        downloadCapturedPhoto(photo);
      } catch (cause) {
        setError(
          `The photo was saved, but automatic download could not start: ${errorMessage(cause)}`,
        );
      }
      setPhotoFlash(true);
      if (photoFlashTimerRef.current !== null) {
        window.clearTimeout(photoFlashTimerRef.current);
      }
      photoFlashTimerRef.current = window.setTimeout(() => {
        photoFlashTimerRef.current = null;
        setPhotoFlash(false);
      }, 420);

      const releasePending: PendingPhoto = {
        ...pending,
        stage: "release",
        prompt: pending.releasePrompt,
        cue: "NICE!",
        holdChunks: pending.releaseHoldChunks,
        matchedChunks: 0,
        remaining: [],
        issuedAfterSerial: chunkSerialRef.current,
        photoSaved: true,
      };
      pendingPhotoRef.current = releasePending;
      setPhotoState("returning");
      setPhotoCue({
        cue: releasePending.cue,
        beatIndex: releasePending.beatCount,
        beatCount: releasePending.beatCount,
      });
      promptRequestIdRef.current += 1;
      lastPromptRef.current = releasePending.prompt;
      armPhotoWatchdog(
        releasePending,
        "The photo was saved, but the scene did not finish returning to its ambient state. The ambient prompt was restored.",
      );

      try {
        await setPrompt({ prompt: releasePending.prompt });
      } catch (cause) {
        recoverPhoto(
          releasePending,
          `The photo was saved, but the return action failed: ${errorMessage(cause)}`,
        );
      }
    },
    [
      activeMaze.id,
      armPhotoWatchdog,
      mainVideoTrack,
      recoverPhoto,
      setPrompt,
    ],
  );

  useEffect(() => {
    completePhotoCaptureRef.current = (pending, completedChunk) => {
      void completePhotoCapture(pending, completedChunk);
    };
  }, [completePhotoCapture]);

  const takePhoto = useCallback(async () => {
    if (
      !canControl ||
      !revealVideo ||
      photoBusyRef.current ||
      pendingRouteRef.current ||
      pendingPhotoRef.current
    ) {
      return;
    }

    const photoAction = resolvePhotoAction(activeMaze);

    photoBusyRef.current = true;
    const ambientPrompt = composeWorldPrompt(activeMaze, activeRoute, {
      actionMode: "ambient",
    });
    const steps: PhotoPromptStep[] = photoAction.beats.map(
      (beat) => ({
        cue: beat.cue,
        holdChunks: beat.holdChunks,
        prompt: composeWorldPrompt(activeMaze, activeRoute, {
          actionMode: beat.mode,
        }),
      }),
    );
    const [firstStep, ...remaining] = steps;
    if (!firstStep) {
      photoBusyRef.current = false;
      setError("The shared photo sequence is unavailable.");
      return;
    }
    setAmbientChunkReady(false);
    const pending: PendingPhoto = {
      stage: "capture",
      ...firstStep,
      matchedChunks: 0,
      remaining,
      beatIndex: 1,
      beatCount: steps.length,
      releasePrompt: composeWorldPrompt(activeMaze, activeRoute, {
        actionMode: "photo-release",
      }),
      releaseHoldChunks: photoAction.releaseHoldChunks,
      ambientPrompt,
      issuedAfterSerial: chunkSerialRef.current,
      photoSaved: false,
    };
    pendingPhotoRef.current = pending;
    setPhotoState("framing");
    setPhotoCue({
      cue: pending.cue,
      beatIndex: pending.beatIndex,
      beatCount: pending.beatCount,
    });
    setPhase("switching");
    setError(null);
    armPhotoWatchdog(
      pending,
      "The photo sequence did not begin in time. The ambient scene was restored.",
    );

    try {
      if (window.matchMedia("(max-width: 820px)").matches) {
        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        stageMediaRef.current?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start",
        });
      }
      if (document.pointerLockElement === stageMediaRef.current) {
        document.exitPointerLock();
      }
      await releaseControls();
      if (pendingPhotoRef.current !== pending || terminatingRef.current) return;
      promptRequestIdRef.current += 1;
      lastPromptRef.current = pending.prompt;
      await setPrompt({ prompt: pending.prompt });
    } catch (cause) {
      recoverPhoto(
        pending,
        `The photo action could not start: ${errorMessage(cause)}`,
      );
    }
  }, [
    activeMaze,
    activeRoute,
    armPhotoWatchdog,
    canControl,
    recoverPhoto,
    releaseControls,
    revealVideo,
    setPrompt,
  ]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.code !== "KeyC" ||
        event.repeat ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      void takePhoto();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [takePhoto]);

  // Normal navigation never changes the world prompt: WASD, arrow keys, and
  // mouse look travel exclusively through the SDK camera-input channels. Only
  // an explicit route, photo action, or scene transition is allowed to swap
  // narrative prompts.
  useEffect(() => {
    if (
      !canSyncAmbient ||
      pendingRouteRef.current ||
      pendingPhotoRef.current
    ) {
      return;
    }
    const awaitingAmbientPrompt = awaitingAmbientPromptRef.current;
    if (
      awaitingAmbientPrompt &&
      awaitingAmbientPrompt.trim() !== composedPrompt.trim()
    ) {
      abortActivation(
        new Error(
          "The route settled to a different ambient prompt than the one awaiting confirmation.",
        ),
      );
      return;
    }
    if (
      !awaitingAmbientPrompt &&
      lastPromptRef.current.trim() === composedPrompt.trim()
    ) {
      return;
    }

    const previousPrompt = lastPromptRef.current;
    const requestId = ++promptRequestIdRef.current;
    lastPromptRef.current = composedPrompt;
    void setPrompt({ prompt: composedPrompt }).catch((cause) => {
      if (
        promptRequestIdRef.current === requestId &&
        lastPromptRef.current === composedPrompt
      ) {
        lastPromptRef.current = previousPrompt;
        if (
          awaitingAmbientPromptRef.current?.trim() === composedPrompt.trim()
        ) {
          abortActivation(cause);
        } else {
          fail(cause);
        }
      }
    });
  }, [abortActivation, canSyncAmbient, composedPrompt, fail, setPrompt]);

  const togglePause = useCallback(async () => {
    if (pendingDoorQuestionRef.current) return;
    try {
      if (isPaused) {
        await resume();
      } else {
        await releaseControls();
        if (
          terminatingRef.current ||
          pendingPhotoRef.current ||
          pendingRouteRef.current
        ) {
          return;
        }
        await pause();
      }
    } catch (cause) {
      fail(cause);
    }
  }, [fail, isPaused, pause, releaseControls, resume]);

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
    terminatingRef.current = true;
    activationAttemptIdRef.current += 1;
    clearActivationWatchdog();
    clearRouteWatchdog();
    clearPhotoWatchdog();
    clearSceneTransitionTimers();
    awaitingAmbientPromptRef.current = null;
    pendingDoorQuestionRef.current = null;
    preparedSceneTransitionRef.current = null;
    setDoorQuestionDialog(null);
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
    try {
      await disconnect();
    } catch (cause) {
      fail(cause);
      return false;
    }
    pendingStartRef.current = false;
    startIssuedRef.current = false;
    pendingMazeRef.current = null;
    stagingIssuedRef.current = false;
    pendingRouteRef.current = null;
    awaitingAmbientPromptRef.current = null;
    pendingPhotoRef.current = null;
    pendingSceneTransitionRef.current = null;
    pendingDoorQuestionRef.current = null;
    preparedSceneTransitionRef.current = null;
    photoBusyRef.current = false;
    chunkSerialRef.current = 0;
    setModelState(null);
    setActiveMazeId(null);
    setActiveRouteId(null);
    setPendingRouteId(null);
    setPhotoState("idle");
    setPhotoCue(null);
    setPhotoFlash(false);
    setDoorQuestionDialog(null);
    setVideoReady(false);
    setAmbientChunkReady(false);
    setSceneTransitionStage("idle");
    setTargetSceneChunkReady(false);
    setChunkIndex(0);
    setClip(null);
    setClipError(null);
    setPhase("preview");
    return true;
  }, [
    clearActivationWatchdog,
    clearPhotoWatchdog,
    clearRouteWatchdog,
    clearSceneTransitionTimers,
    disconnect,
    fail,
    releaseControls,
  ]);

  useEffect(() => {
    if (
      status !== "ready" ||
      elapsedSeconds < SCENE_AUTO_ADVANCE_SECONDS ||
      autoAdvanceIssuedRef.current
    ) {
      return;
    }

    if (nextScene && activeMaze.sceneTransition) {
      if (!canControl || !revealVideo) return;
      void requestDoorTransition("automatic");
      return;
    }

    autoAdvanceIssuedRef.current = true;
    void endSession().then((ended) => {
      if (ended) {
        setError("The final chapter reached its 30-second limit and released the GPU.");
      }
    });
  }, [
    activeMaze.sceneTransition,
    canControl,
    elapsedSeconds,
    endSession,
    nextScene,
    requestDoorTransition,
    revealVideo,
    status,
  ]);

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
        ? "Look here…"
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
      ? "Look here"
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
          {status !== "disconnected" && (
            <button className="text-button danger" onClick={endSession} disabled={phase === "ending"}>
              End session
            </button>
          )}
        </div>
      </header>

      <section className={`maze-stage phase-${phase}`} id="top">
        <div className="stage-media" ref={stageMediaRef}>
          <img
            className={`seed-preview ${revealVideo ? "is-hidden" : ""}`}
            src={activeMaze.seedImage}
            alt={`Entrance frame for ${activeMaze.title}`}
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

          {(phase === "live" || phase === "switching" || phase === "paused") && (
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
              disabled={!reactorConfigured || busy}
            >
              <span>Start live maze</span>
            </button>
            <p>Starts a billed Reactor session.</p>
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
            <div className={`control-actions ${nextScene ? "has-next-scene" : ""}`}>
              {nextScene && activeMaze.sceneTransition && (
                <button
                  className="scene-transition-button"
                  onClick={() => void requestDoorTransition("manual")}
                  disabled={!canControl || !revealVideo}
                  aria-label={`Enter ${nextScene.title}`}
                >
                  <span>Enter black door</span>
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

      <div
        className={`scene-curtain scene-curtain-${sceneTransitionStage}`}
        aria-hidden="true"
      />

      {capturedPhoto && (
        <aside className="photo-receipt" aria-live="polite">
          <img src={capturedPhoto.url} alt="Latest Fashion Maze photo" />
          <div>
            <span>Photo saved</span>
          </div>
          <a href={capturedPhoto.url} download={capturedPhoto.filename}>
            Download photo
          </a>
          <button
            onClick={() => setCapturedPhoto(null)}
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
            <div><dt>CAST</dt><dd>{activeMaze.ensemble.count > 0 ? `${activeMaze.ensemble.count} · poised runway holds` : "0 · empty environment"}</dd></div>
            <div><dt>PHOTO</dt><dd>{photoState}</dd></div>
            <div><dt>DECISIONS</dt><dd>{doorAnswers.length} / {fashionMazes.filter((maze) => maze.sceneTransition).length}</dd></div>
            <div><dt>CHUNK</dt><dd>{chunkIndex}</dd></div>
            <div><dt>ACTION</dt><dd>{modelState?.current_action ?? "—"}</dd></div>
            <div><dt>CAMERA POSE</dt><dd>{mouseLook || modelState?.camera_pose_active ? "active" : "idle"}</dd></div>
            <div><dt>IMAGE</dt><dd>{modelState?.has_image ? "ready" : "not armed"}</dd></div>
            <div><dt>VIDEO TRACK</dt><dd>{videoReady ? "rendering" : tracks.main_video ? "warming up" : "waiting"}</dd></div>
            <div><dt>STABLE CHUNK</dt><dd>{ambientChunkReady ? "confirmed" : "waiting"}</dd></div>
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
