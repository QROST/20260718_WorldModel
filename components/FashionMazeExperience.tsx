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
} from "@reactor-team/js-sdk";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  composeWorldPrompt,
  fashionMazes,
  findMaze,
  resolveMazeEntrance,
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
  initialEntranceVariantId: string;
}

const MAX_LIVE_SESSION_SECONDS = 5 * 60;
const TOKEN_EXPIRY_SKEW_SECONDS = 60;
const SNAP_CLIP_SECONDS = 10;
const MOUSE_LOOK_SENSITIVITY = 0.0003;
const MOUSE_LOOK_MAX_ROTATION = 0.2;
const ARMING_WATCHDOG_MS = 30_000;
const START_WATCHDOG_MS = 20_000;
const VISIBLE_VIDEO_WATCHDOG_MS = 20_000;
const ROUTE_WATCHDOG_MS = 15_000;
const PHOTO_WATCHDOG_MS = 30_000;
const PHOTO_FRAME_TIMEOUT_MS = 2_000;
const PHOTO_ENCODE_TIMEOUT_MS = 2_000;
const CONTROL_RELEASE_TIMEOUT_MS = 750;

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

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
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
  initialEntranceVariantId,
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
        initialEntranceVariantId={initialEntranceVariantId}
      />
    </LingbotWorld2Provider>
  );
}

function FashionMazeRuntime({
  reactorConfigured,
  initialEntranceVariantId,
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
    start,
    pause,
    resume,
    requestClip,
  } = useLingbotWorld2();

  const [entranceVariantId] = useState(initialEntranceVariantId);
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
  const autoEndIssuedRef = useRef(false);
  const pendingRouteRef = useRef<PendingRoute | null>(null);
  const pendingPhotoRef = useRef<PendingPhoto | null>(null);
  const photoBusyRef = useRef(false);
  const chunkSerialRef = useRef(0);
  const heldControlsRef = useRef<ControlCode[]>([]);
  const lastPromptRef = useRef("");
  const promptRequestIdRef = useRef(0);
  const stageMediaRef = useRef<HTMLDivElement>(null);
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
  const activationAttemptIdRef = useRef(0);
  const handledLastErrorRef = useRef<unknown>(null);
  const terminatingRef = useRef(false);
  const lastAxesRef = useRef({
    longitudinal: "idle",
    lateral: "idle",
    lookHorizontal: "idle",
    lookVertical: "idle",
  });

  const selectedMaze = useMemo(
    () => resolveMazeEntrance(findMaze(selectedMazeId), entranceVariantId),
    [entranceVariantId, selectedMazeId],
  );
  const activeMaze = useMemo(
    () =>
      activeMazeId
        ? resolveMazeEntrance(findMaze(activeMazeId), entranceVariantId)
        : selectedMaze,
    [activeMazeId, entranceVariantId, selectedMaze],
  );
  const activeRoute = activeMaze.routes.find(
    (route) => route.id === activeRouteId,
  );
  const composedPrompt = useMemo(
    () =>
      composeWorldPrompt(activeMaze, activeRoute, {
        isMoving: true,
        actionMode: "ambient",
        includeOpeningAnchor: true,
      }),
    [activeMaze, activeRoute],
  );
  const narrative = activeRoute?.narrative ?? activeMaze.entrance;
  const hasMultipleMazes = fashionMazes.length > 1;
  const isLive = Boolean(modelState?.started && modelState.running);
  const isPaused = Boolean(modelState?.paused);
  const mainVideoTrack = tracks.main_video;
  const hasVideo = Boolean(mainVideoTrack);
  const generationStarted = Boolean(modelState?.started);
  const revealVideo = generationStarted && videoReady;
  const canControl =
    status === "ready" &&
    isLive &&
    !isPaused &&
    !terminatingRef.current &&
    !pendingRouteRef.current &&
    !pendingPhotoRef.current &&
    phase === "live";
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
  const remainingSeconds = Math.max(
    0,
    MAX_LIVE_SESSION_SECONDS - elapsedSeconds,
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

  const abortActivation = useCallback(
    (cause: unknown) => {
      clearActivationWatchdog();
      clearRouteWatchdog();
      clearPhotoWatchdog();
      terminatingRef.current = true;
      activationAttemptIdRef.current += 1;
      pendingStartRef.current = false;
      startIssuedRef.current = false;
      pendingMazeRef.current = null;
      stagingIssuedRef.current = false;
      pendingRouteRef.current = null;
      pendingPhotoRef.current = null;
      photoBusyRef.current = false;
      setPendingRouteId(null);
      setPhotoState("idle");
      setPhotoCue(null);
      setPhotoFlash(false);
      setError(`${errorMessage(cause)} The session is being disconnected to protect credits.`);
      setPhase("ending");
      void disconnect().catch(fail);
    },
    [
      clearActivationWatchdog,
      clearPhotoWatchdog,
      clearRouteWatchdog,
      disconnect,
      fail,
    ],
  );

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
    if (status === "ready" && sessionStartedAt === null) {
      setSessionStartedAt(Date.now());
    }
    if (status === "disconnected") {
      clearActivationWatchdog();
      clearRouteWatchdog();
      clearPhotoWatchdog();
      terminatingRef.current = false;
      activationAttemptIdRef.current += 1;
      pendingStartRef.current = false;
      startIssuedRef.current = false;
      pendingMazeRef.current = null;
      stagingIssuedRef.current = false;
      autoEndIssuedRef.current = false;
      pendingRouteRef.current = null;
      pendingPhotoRef.current = null;
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
    }
  }, [
    clearActivationWatchdog,
    clearPhotoWatchdog,
    clearRouteWatchdog,
    sessionStartedAt,
    status,
  ]);

  useEffect(
    () => () => {
      clearActivationWatchdog();
      clearRouteWatchdog();
      clearPhotoWatchdog();
      if (photoFlashTimerRef.current !== null) {
        window.clearTimeout(photoFlashTimerRef.current);
      }
    },
    [clearActivationWatchdog, clearPhotoWatchdog, clearRouteWatchdog],
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
    if (revealVideo) clearActivationWatchdog();
  }, [clearActivationWatchdog, revealVideo]);

  useEffect(() => {
    if (!lastError) {
      handledLastErrorRef.current = null;
      return;
    }
    if (handledLastErrorRef.current === lastError) return;
    handledLastErrorRef.current = lastError;

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
    setError(errorMessage(lastError));
  }, [abortActivation, lastError, recoverPhoto]);

  useLingbotWorld2Message((message) => {
    switch (message.type) {
      case "state":
        setModelState(message);
        if (!terminatingRef.current && message.paused) setPhase("paused");
        break;
      case "conditions_ready":
        if (
          !terminatingRef.current &&
          pendingStartRef.current &&
          !startIssuedRef.current &&
          message.has_image &&
          message.has_prompt
        ) {
          startIssuedRef.current = true;
          setPhase("starting");
          armActivationWatchdog(
            START_WATCHDOG_MS,
            "Reactor accepted the entrance conditions but generation did not start in time.",
          );
          void start().catch(abortActivation);
        }
        break;
      case "generation_started":
        if (terminatingRef.current) break;
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
        setPhase("paused");
        break;
      case "generation_resumed":
        if (terminatingRef.current) break;
        setPhase(
          pendingPhotoRef.current || pendingRouteRef.current
            ? "switching"
            : "live",
        );
        break;
      case "chunk_complete": {
        if (terminatingRef.current) break;
        const chunkSerial = ++chunkSerialRef.current;
        setChunkIndex(message.chunk_index);
        const pendingRoute = pendingRouteRef.current;
        if (
          pendingRoute &&
          message.active_prompt.trim() === pendingRoute.prompt.trim()
        ) {
          clearRouteWatchdog();
          if (pendingRoute.navigation === "forward") {
            lastAxesRef.current.longitudinal = "idle";
            void setMoveLongitudinal({ move_longitudinal: "idle" }).catch(fail);
          } else {
            lastAxesRef.current.lookHorizontal = "idle";
            void setLookHorizontal({ look_horizontal: "idle" }).catch(fail);
          }
          setActiveRouteId(pendingRoute.id);
          setPendingRouteId(null);
          pendingRouteRef.current = null;
          setPhase("live");
        }
        const pendingPhoto = pendingPhotoRef.current;
        if (
          pendingPhoto &&
          chunkSerial > pendingPhoto.issuedAfterSerial &&
          message.active_prompt.trim() === pendingPhoto.prompt.trim()
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
        sendCameraPoseChunkRef.current();
        break;
      }
      case "generation_reset":
        clearActivationWatchdog();
        clearRouteWatchdog();
        clearPhotoWatchdog();
        pendingRouteRef.current = null;
        pendingPhotoRef.current = null;
        photoBusyRef.current = false;
        chunkSerialRef.current = 0;
        setPendingRouteId(null);
        setPhotoState("idle");
        setPhotoCue(null);
        setPhotoFlash(false);
        setVideoReady(false);
        setModelState(null);
        setChunkIndex(0);
        lastPromptRef.current = "";
        promptRequestIdRef.current += 1;
        break;
      case "command_error": {
        if (terminatingRef.current) break;
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
      pendingRouteRef.current = null;
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
      const prompt = composeWorldPrompt(maze, undefined, {
        isMoving: true,
        actionMode: "ambient",
        includeOpeningAnchor: true,
      });

      setPhase("arming");
      await setSeed({ seed: maze.seed });
      if (!isCurrentAttempt()) return;
      await setImage({ image: imageRef });
      if (!isCurrentAttempt()) return;
      await setPrompt({ prompt });
      if (!isCurrentAttempt()) return;
      lastPromptRef.current = prompt;
    },
    [armActivationWatchdog, setImage, setPrompt, setSeed, uploadFile],
  );

  // connect() may resolve while the SDK is still in `waiting`. Uploads are
  // accepted only after the status event reaches `ready`, so staging is driven
  // by the observable connection state rather than the connect() promise.
  useEffect(() => {
    const maze = pendingMazeRef.current;
    if (status !== "ready" || !maze || stagingIssuedRef.current) return;
    stagingIssuedRef.current = true;
    const attemptId = activationAttemptIdRef.current;
    void stageMaze(maze, attemptId).catch((cause) => {
      if (activationAttemptIdRef.current === attemptId) {
        abortActivation(cause);
      }
    });
  }, [abortActivation, stageMaze, status]);

  const enterMaze = useCallback(async () => {
    if (!reactorConfigured) {
      fail(new Error("Add REACTOR_API_KEY before starting a live maze."));
      return;
    }

    setError(null);
    setPhase("connecting");
    terminatingRef.current = false;
    activationAttemptIdRef.current += 1;
    clearActivationWatchdog();
    autoEndIssuedRef.current = false;
    pendingMazeRef.current = selectedMaze;
    stagingIssuedRef.current = false;
    try {
      if (status !== "ready") await connect();
    } catch (cause) {
      pendingMazeRef.current = null;
      stagingIssuedRef.current = false;
      fail(cause);
    }
  }, [clearActivationWatchdog, connect, fail, reactorConfigured, selectedMaze, status]);

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
        isMoving: true,
        isRouteTransition: true,
        actionMode: "ambient",
        includeOpeningAnchor: true,
      });
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
        pendingRouteRef.current = null;
        setPendingRouteId(null);
        lastAxesRef.current.longitudinal = "idle";
        lastAxesRef.current.lookHorizontal = "idle";
        setPhase("live");
        setError("This route did not settle in time. Navigation was reset; please try again.");
        void Promise.all([
          setMoveLongitudinal({ move_longitudinal: "idle" }),
          setLookHorizontal({ look_horizontal: "idle" }),
        ]).catch((cause) => setError(errorMessage(cause)));
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
        clearRouteWatchdog();
        pendingRouteRef.current = null;
        setPendingRouteId(null);
        lastAxesRef.current.longitudinal = "idle";
        lastAxesRef.current.lookHorizontal = "idle";
        void Promise.all([
          setMoveLongitudinal({ move_longitudinal: "idle" }),
          setLookHorizontal({ look_horizontal: "idle" }),
        ]).catch(() => undefined);
        fail(cause);
      }
    },
    [
      activeMaze,
      canControl,
      clearRouteWatchdog,
      fail,
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
        "The photo was saved, but the Blogger did not finish putting away the phone. The ambient scene was restored.",
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

    photoBusyRef.current = true;
    const ambientPrompt = composeWorldPrompt(activeMaze, activeRoute, {
      isMoving: true,
      actionMode: "ambient",
      includeOpeningAnchor: true,
    });
    const steps: PhotoPromptStep[] = activeMaze.photoAction.beats.map(
      (beat) => ({
        cue: beat.cue,
        holdChunks: beat.holdChunks,
        prompt: composeWorldPrompt(activeMaze, activeRoute, {
          isMoving: false,
          actionMode: beat.mode,
          includeOpeningAnchor: true,
        }),
      }),
    );
    const [firstStep, ...remaining] = steps;
    if (!firstStep) {
      photoBusyRef.current = false;
      setError("This maze does not define a photo sequence.");
      return;
    }
    const pending: PendingPhoto = {
      stage: "capture",
      ...firstStep,
      matchedChunks: 0,
      remaining,
      beatIndex: 1,
      beatCount: steps.length,
      releasePrompt: composeWorldPrompt(activeMaze, activeRoute, {
        isMoving: false,
        actionMode: "photo-release",
        includeOpeningAnchor: true,
      }),
      releaseHoldChunks: activeMaze.photoAction.releaseHoldChunks,
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
  // an explicit route or photo action is allowed to swap narrative prompts.
  useEffect(() => {
    if (
      !canControl ||
      pendingRouteRef.current ||
      pendingPhotoRef.current
    ) {
      return;
    }
    if (lastPromptRef.current.trim() === composedPrompt.trim()) return;

    const previousPrompt = lastPromptRef.current;
    const requestId = ++promptRequestIdRef.current;
    lastPromptRef.current = composedPrompt;
    void setPrompt({ prompt: composedPrompt }).catch((cause) => {
      if (
        promptRequestIdRef.current === requestId &&
        lastPromptRef.current === composedPrompt
      ) {
        lastPromptRef.current = previousPrompt;
        fail(cause);
      }
    });
  }, [canControl, composedPrompt, fail, setPrompt]);

  const togglePause = useCallback(async () => {
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
    pendingPhotoRef.current = null;
    photoBusyRef.current = false;
    chunkSerialRef.current = 0;
    setModelState(null);
    setActiveMazeId(null);
    setActiveRouteId(null);
    setPendingRouteId(null);
    setPhotoState("idle");
      setPhotoCue(null);
      setPhotoFlash(false);
      setVideoReady(false);
      setChunkIndex(0);
    setClip(null);
    setClipError(null);
    setPhase("preview");
    return true;
  }, [
    clearActivationWatchdog,
    clearPhotoWatchdog,
    clearRouteWatchdog,
    disconnect,
    fail,
    releaseControls,
  ]);

  useEffect(() => {
    if (
      status !== "ready" ||
      elapsedSeconds < MAX_LIVE_SESSION_SECONDS ||
      autoEndIssuedRef.current
    ) {
      return;
    }

    autoEndIssuedRef.current = true;
    void endSession().then((ended) => {
      if (ended) {
        setError("The five-minute safety limit ended this live session and released the GPU.");
      }
    });
  }, [elapsedSeconds, endSession, status]);

  const phaseCopy: Partial<Record<ExperiencePhase, string>> = {
    connecting: status === "waiting" ? "Waiting for a GPU…" : "Opening the maze…",
    uploading: "Uploading the entrance image…",
    arming: "Setting image, seed, and story…",
    starting: "The world is materializing…",
    switching:
      photoState === "framing"
        ? "The Blogger is framing the shot…"
        : photoState === "capturing"
          ? "Saving the shutter frame…"
          : photoState === "returning"
            ? "Returning to the live scene…"
            : "The scene is taking shape…",
    ending: "Releasing the live session…",
  };

  const statusLabel =
    phase === "live" || phase === "switching"
      ? "LIVE"
      : status === "ready"
        ? "READY"
        : status.toUpperCase();
  const photoButtonLabel =
    photoState === "framing"
      ? photoCue?.cue === "READY"
        ? "GATHERING CAST…"
        : photoCue?.cue === "CHEESE!"
          ? "CHEESE!"
          : photoCue?.cue === "SHUTTER"
            ? "HOLD THE POSE…"
            : photoCue
              ? `COUNTING ${photoCue.cue}…`
              : "FRAMING…"
      : photoState === "capturing"
        ? "SAVING PHOTO…"
        : photoState === "returning"
          ? "LOWERING PHONE…"
          : photoState === "saved"
            ? "TAKE ANOTHER"
            : "TAKE PHOTO";

  return (
    <main className="maze-app" style={{ "--maze-accent": activeMaze.accent } as React.CSSProperties}>
      <header className="maze-header">
        <a className="maze-wordmark" href="#top" aria-label="Fashion Maze home">
          <span>FASHION</span>
          <i />
          <span>MAZE</span>
        </a>
        <div className="header-meta">
          <span>REACTOR / LINGBOT WORLD 2</span>
          <span className={`connection-state state-${statusLabel.toLowerCase()}`}>
            <i /> {statusLabel}
          </span>
          <button
            className={`text-button ${operatorOpen ? "is-active" : ""}`}
            onClick={() => setOperatorOpen((open) => !open)}
            aria-expanded={operatorOpen}
            aria-controls="operator-panel"
          >
            OPERATOR
          </button>
          {status !== "disconnected" && (
            <button className="text-button danger" onClick={endSession} disabled={phase === "ending"}>
              END SESSION
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
            className={`reactor-video ${revealVideo ? "has-track" : ""}`}
            videoObjectFit="cover"
            muted
          />
          <div className="media-vignette" />
          <div className="media-grid" />
          {photoFlash && <div className="photo-flash" aria-hidden="true" />}

          {busy && phaseCopy[phase] && !photoBusy && (
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
              <span>
                {photoCue.cue === "READY"
                  ? "GATHER THE CAST"
                  : photoCue.cue === "NICE!"
                    ? "PHOTO COMPLETE"
                    : "COUNT IT OUT"}
              </span>
              <strong>{photoCue.cue}</strong>
              <small>
                BEAT {photoCue.beatIndex.toString().padStart(2, "0")} / {photoCue.beatCount.toString().padStart(2, "0")}
              </small>
            </div>
          )}

          {phase === "preview" && (
            <div className="preview-badge">
              <span>STATIC PREVIEW</span>
              <small>No Reactor credits in use</small>
            </div>
          )}

          {(phase === "live" || phase === "switching" || phase === "paused") && (
            <div className="live-readout">
              <span className="live-dot" />
              <b>{phase === "paused" ? "PAUSED · STILL BILLED" : "LIVE WORLD"}</b>
              <span>CHUNK {chunkIndex.toString().padStart(3, "0")}</span>
              <span className={remainingSeconds <= 30 ? "time-warning" : ""}>
                {formatElapsed(elapsedSeconds)} / 05:00
              </span>
            </div>
          )}

          {mouseLook && (
            <div className="mouse-look-readout" aria-live="polite">
              <i />
              <span>MOUSE LOOK</span>
              <small>ESC TO RELEASE</small>
            </div>
          )}
        </div>

        <aside
          className={`maze-index ${hasMultipleMazes ? "" : "is-single"}`}
          aria-label={hasMultipleMazes ? "Maze selection" : "Rose garden ensemble"}
        >
          <span className="index-label">
            {hasMultipleMazes
              ? "CHOOSE AN ENTRANCE"
              : `ROSE GARDEN ENSEMBLE · ${activeMaze.ensemble.count.toString().padStart(2, "0")}`}
          </span>
          {hasMultipleMazes && (
            <div className="index-list">
              {fashionMazes.map((maze, index) => {
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
          )}
          {activeMaze.characterImage && (
            <figure
              className="character-reference"
            >
              <img
                src={activeMaze.characterImage}
                alt={`${activeMaze.characterName ?? "Fashion blogger"} three-view character reference`}
              />
              <span>
                <small>CONCEPT REFERENCE</small>
                <strong>{activeMaze.characterName ?? "THE HOST"}</strong>
                <em>UI ONLY · NOT A SECOND SEED</em>
              </span>
            </figure>
          )}
          {activeMaze.ensemble.members.some((member) => member.referenceImage) && (
            <section className="ensemble-references" aria-label="Authored supporting cast references">
              <span>AUTHORED CAST · {activeMaze.ensemble.count.toString().padStart(2, "0")}</span>
              <div>
                {activeMaze.ensemble.members
                  .filter((member) => member.referenceImage)
                  .map((member) => (
                    <a
                      key={member.id}
                      href={member.referenceImage}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${member.name} character sheet`}
                    >
                      <i>
                        <img src={member.referenceImage} alt="" />
                      </i>
                      <strong>{member.name}</strong>
                    </a>
                  ))}
              </div>
            </section>
          )}
        </aside>

        <section
          className={`story-panel ${activeRoute ? "" : "is-entrance"}`}
          aria-live="polite"
        >
          <p className="story-eyebrow">{narrative.eyebrow}</p>
          {activeRoute && <h1>{narrative.title}</h1>}
          <p className="story-body">{narrative.body}</p>
          <div className="edition-line">
            <span>{activeMaze.edition}</span>
            <span>{activeMaze.location}</span>
          </div>
        </section>

        <section className="route-panel" aria-label="World transformations">
          <div className="route-heading">
            <span>{isLive ? "CHOOSE THE WORLD SHIFT" : "WORLDS AHEAD"}</span>
            <small>
              {isLive
                ? "Glides the observer camera for one generated chunk"
                : "Preview three transformations"}
            </small>
          </div>
          <div className="route-list">
            {activeMaze.routes.map((route) => {
              const active = activeRouteId === route.id;
              const pending = pendingRouteId === route.id;
              return (
                <button
                  key={route.id}
                  className={`${active ? "is-active" : ""} ${pending ? "is-pending" : ""}`}
                  style={{ "--route-accent": route.accent } as React.CSSProperties}
                  onClick={() => {
                    if (status === "disconnected") {
                      setActiveRouteId(route.id);
                    } else {
                      void chooseRoute(route);
                    }
                  }}
                  disabled={
                    status === "disconnected"
                      ? false
                      : !canControl ||
                        Boolean(pendingRouteId) ||
                        photoBusy
                  }
                >
                  <span className="route-direction">{route.direction}</span>
                  <span className="route-title">{route.title}</span>
                  <span className="route-teaser">{pending ? "Materializing…" : route.teaser}</span>
                  <span className="route-arrow">↗</span>
                </button>
              );
            })}
          </div>
        </section>

        {status === "disconnected" ? (
          <div className="enter-panel">
            <div>
              <span className="selected-kicker">SELECTED ENTRANCE</span>
              <strong>{selectedMaze.title}</strong>
              <small>{selectedMaze.subtitle}</small>
            </div>
            <button
              className="enter-button"
              onClick={enterMaze}
              disabled={!reactorConfigured || busy}
            >
              <span>ENTER LIVE MAZE</span>
              <i>↗</i>
            </button>
            <p>
              Creates a billed Reactor session only after this click.
            </p>
          </div>
        ) : (
          <div className="control-dock">
            <div className="cast-director">
              <div>
                <span>LIVE ENSEMBLE · {activeMaze.ensemble.count} MODELS · AMBIENT</span>
                <small>
                  Stay on mark → breathe → shift weight → micro-pose → hold
                </small>
              </div>
            </div>
            <div className="control-copy">
              <span>HOLD TO EXPLORE</span>
              <small>Controls move only the observer camera</small>
            </div>
            <div className="control-keys">
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
            <div className="control-actions">
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
                {mouseLook ? "ESC TO EXIT" : "MOUSE LOOK"}
              </button>
              <button
                className="pause-button"
                onClick={togglePause}
                disabled={!modelState?.started || phase === "switching"}
              >
                {isPaused ? "RESUME STREAM" : "FREEZE STREAM · STILL BILLED"}
              </button>
            </div>
          </div>
        )}
      </section>

      {capturedPhoto && (
        <aside className="photo-receipt" aria-live="polite">
          <img src={capturedPhoto.url} alt="Latest Fashion Maze photo" />
          <div>
            <span>PHOTO SAVED</span>
            <small>
              CHUNK {capturedPhoto.chunkIndex.toString().padStart(3, "0")} · {capturedPhoto.width}×{capturedPhoto.height}
            </small>
          </div>
          <a href={capturedPhoto.url} download={capturedPhoto.filename}>
            DOWNLOAD
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
              <span>REACTOR OPERATOR</span>
              <small>Live state, capture, and prompt inspection</small>
            </div>
            <button onClick={() => setOperatorOpen(false)} aria-label="Close operator panel">×</button>
          </div>

          <dl className="operator-grid">
            <div><dt>CONNECTION</dt><dd>{status}</dd></div>
            <div><dt>PHASE</dt><dd>{phase}</dd></div>
            <div><dt>PROMPT MODE</dt><dd>{photoState !== "idle" && photoState !== "saved" ? "photo action" : pendingRouteId ? "route transition" : "observer invariant"}</dd></div>
            <div><dt>CAST</dt><dd>{activeMaze.ensemble.count} · independent micro-motion</dd></div>
            <div><dt>PHOTO</dt><dd>{photoState}</dd></div>
            <div><dt>CHUNK</dt><dd>{chunkIndex}</dd></div>
            <div><dt>ACTION</dt><dd>{modelState?.current_action ?? "—"}</dd></div>
            <div><dt>CAMERA POSE</dt><dd>{mouseLook || modelState?.camera_pose_active ? "active" : "idle"}</dd></div>
            <div><dt>IMAGE</dt><dd>{modelState?.has_image ? "ready" : "not armed"}</dd></div>
            <div><dt>VIDEO TRACK</dt><dd>{videoReady ? "rendering" : tracks.main_video ? "warming up" : "waiting"}</dd></div>
          </dl>

          <div className="operator-session">
            <span>SESSION</span>
            <code>{sessionId ?? "not allocated"}</code>
          </div>

          <div className="operator-capture">
            <div>
              <span>CLIP CAPTURE</span>
              <small>Creates a playable clip from the latest recorded window.</small>
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
              {clipBusy ? "CAPTURING…" : `SNAP LAST ${SNAP_CLIP_SECONDS}S`}
            </button>
            {clipError && <p role="alert">{clipError}</p>}
          </div>

          <details className="prompt-inspector">
            <summary>ACTIVE COMPOSED PROMPT</summary>
            <p>
              {typeof modelState?.current_prompt === "string"
                ? modelState.current_prompt
                : composedPrompt}
            </p>
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
          <span>REACTOR NOTICE</span>
          <p>{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss error">×</button>
        </div>
      )}

      <footer className="maze-footer">
        <span>TEAM DATASET 01 · ROSE GARDEN ENSEMBLE</span>
        <span>
          {sessionId ? `SESSION ${sessionId.slice(0, 8)}…` : "ONE IMAGE · MANY FUTURES"}
        </span>
      </footer>
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
            <span>SESSION ARTIFACT</span>
            <small>
              {Math.max(0, clip.endMarker - clip.startMarker).toFixed(1)} seconds · {clip.kind}
            </small>
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
