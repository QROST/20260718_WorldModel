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

interface FashionMazeExperienceProps {
  reactorConfigured: boolean;
}

const MAX_LIVE_SESSION_SECONDS = 5 * 60;
const TOKEN_EXPIRY_SKEW_SECONDS = 60;
const SNAP_CLIP_SECONDS = 10;
const MOUSE_LOOK_SENSITIVITY = 0.0003;
const MOUSE_LOOK_MAX_ROTATION = 0.2;
const ARMING_WATCHDOG_MS = 30_000;
const START_WATCHDOG_MS = 20_000;
const ROUTE_WATCHDOG_MS = 15_000;

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
  if (!source.type.includes("svg")) {
    const extension = source.type.includes("png") ? "png" : "jpg";
    return new File([source], `${maze.id}.${extension}`, { type: source.type });
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
    return new File([png], `${maze.id}.png`, { type: "image/png" });
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

export function FashionMazeExperience({
  reactorConfigured,
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
      <FashionMazeRuntime reactorConfigured={reactorConfigured} />
    </LingbotWorld2Provider>
  );
}

function FashionMazeRuntime({ reactorConfigured }: FashionMazeExperienceProps) {
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
  const [isTraversing, setIsTraversing] = useState(false);
  const [mouseLook, setMouseLook] = useState(false);
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
  const heldControlsRef = useRef<ControlCode[]>([]);
  const lastPromptRef = useRef("");
  const promptRequestIdRef = useRef(0);
  const stageMediaRef = useRef<HTMLDivElement>(null);
  const mouseLookRef = useRef(false);
  const pendingMouseYawRef = useRef(0);
  const pendingMousePitchRef = useRef(0);
  const sendCameraPoseChunkRef = useRef<() => void>(() => undefined);
  const activationWatchdogRef = useRef<number | null>(null);
  const routeWatchdogRef = useRef<number | null>(null);
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
    () => findMaze(selectedMazeId),
    [selectedMazeId],
  );
  const activeMaze = activeMazeId ? findMaze(activeMazeId) : selectedMaze;
  const activeRoute = activeMaze.routes.find(
    (route) => route.id === activeRouteId,
  );
  const composedPrompt = useMemo(
    () =>
      composeWorldPrompt(activeMaze, activeRoute, {
        isMoving: isTraversing,
      }),
    [activeMaze, activeRoute, isTraversing],
  );
  const narrative = activeRoute?.narrative ?? activeMaze.entrance;
  const isLive = Boolean(modelState?.started && modelState.running);
  const isPaused = Boolean(modelState?.paused);
  const hasVideo = Boolean(tracks.main_video);
  const canControl =
    status === "ready" &&
    isLive &&
    !isPaused &&
    !terminatingRef.current &&
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

  const abortActivation = useCallback(
    (cause: unknown) => {
      clearActivationWatchdog();
      clearRouteWatchdog();
      terminatingRef.current = true;
      activationAttemptIdRef.current += 1;
      pendingStartRef.current = false;
      startIssuedRef.current = false;
      pendingMazeRef.current = null;
      stagingIssuedRef.current = false;
      pendingRouteRef.current = null;
      setPendingRouteId(null);
      setError(`${errorMessage(cause)} The session is being disconnected to protect credits.`);
      setPhase("ending");
      void disconnect().catch(fail);
    },
    [clearActivationWatchdog, clearRouteWatchdog, disconnect, fail],
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

  useEffect(() => {
    if (status === "ready" && sessionStartedAt === null) {
      setSessionStartedAt(Date.now());
    }
    if (status === "disconnected") {
      clearActivationWatchdog();
      clearRouteWatchdog();
      terminatingRef.current = false;
      activationAttemptIdRef.current += 1;
      pendingStartRef.current = false;
      startIssuedRef.current = false;
      pendingMazeRef.current = null;
      stagingIssuedRef.current = false;
      autoEndIssuedRef.current = false;
      pendingRouteRef.current = null;
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
      setIsTraversing(false);
      setMouseLook(false);
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
  }, [clearActivationWatchdog, clearRouteWatchdog, sessionStartedAt, status]);

  useEffect(
    () => () => {
      clearActivationWatchdog();
      clearRouteWatchdog();
    },
    [clearActivationWatchdog, clearRouteWatchdog],
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
    setError(errorMessage(lastError));
  }, [abortActivation, lastError]);

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
        clearActivationWatchdog();
        pendingStartRef.current = false;
        startIssuedRef.current = false;
        pendingMazeRef.current = null;
        stagingIssuedRef.current = false;
        setPhase("live");
        break;
      case "generation_paused":
        if (terminatingRef.current) break;
        setPhase("paused");
        break;
      case "generation_resumed":
        if (terminatingRef.current) break;
        setPhase("live");
        break;
      case "chunk_complete": {
        if (terminatingRef.current) break;
        setChunkIndex(message.chunk_index);
        const pending = pendingRouteRef.current;
        if (pending && message.active_prompt.trim() === pending.prompt.trim()) {
          clearRouteWatchdog();
          if (pending.navigation === "forward") {
            lastAxesRef.current.longitudinal = "idle";
            void setMoveLongitudinal({ move_longitudinal: "idle" }).catch(fail);
          } else {
            lastAxesRef.current.lookHorizontal = "idle";
            void setLookHorizontal({ look_horizontal: "idle" }).catch(fail);
          }
          setIsTraversing(false);
          setActiveRouteId(pending.id);
          setPendingRouteId(null);
          pendingRouteRef.current = null;
          setPhase("live");
        }
        sendCameraPoseChunkRef.current();
        break;
      }
      case "generation_reset":
        clearActivationWatchdog();
        clearRouteWatchdog();
        pendingRouteRef.current = null;
        setPendingRouteId(null);
        setModelState(null);
        setChunkIndex(0);
        setIsTraversing(false);
        lastPromptRef.current = "";
        promptRequestIdRef.current += 1;
        break;
      case "command_error": {
        if (terminatingRef.current) break;
        const wasActivating =
          pendingStartRef.current || startIssuedRef.current;
        const wasRouting = pendingRouteRef.current !== null;
        clearRouteWatchdog();
        pendingStartRef.current = false;
        startIssuedRef.current = false;
        pendingRouteRef.current = null;
        setPendingRouteId(null);
        if (wasRouting) {
          lastAxesRef.current.longitudinal = "idle";
          lastAxesRef.current.lookHorizontal = "idle";
          setIsTraversing(false);
          void Promise.all([
            setMoveLongitudinal({ move_longitudinal: "idle" }),
            setLookHorizontal({ look_horizontal: "idle" }),
          ]).catch(() => undefined);
        }
        if (wasActivating) {
          abortActivation(
            new Error(`${message.command}: ${message.reason}`),
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
      pendingRouteRef.current = null;
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
      const prompt = composeWorldPrompt(maze, undefined, { isMoving: false });

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
    if (!canControl) return;
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
    const moving = longitudinal !== "idle" || lateral !== "idle";
    setIsTraversing((current) => (current === moving ? current : moving));

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
    canControl,
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
    setIsTraversing(false);
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
        !canControl ||
        !CONTROL_CODES.has(event.code as ControlCode)
      ) {
        return;
      }
      event.preventDefault();
      setControl(event.code as ControlCode, true);
    };
    const keyup = (event: KeyboardEvent) => {
      if (!CONTROL_CODES.has(event.code as ControlCode)) return;
      if (!canControl) {
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
  }, [canControl, fail, releaseControls, setControl]);

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
      if (!canControl || pendingRouteRef.current) return;
      const prompt = composeWorldPrompt(activeMaze, route, {
        isMoving: true,
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
        setIsTraversing(false);
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
        setIsTraversing(true);
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
        setIsTraversing(false);
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

  // The official template's structured authoring model is retained here as a
  // product-sized adapter: locomotion selects the still/moving camera and
  // movement layers while the maze identity and narrative route stay intact.
  useEffect(() => {
    if (!canControl || pendingRouteRef.current) return;
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
    setPhase("ending");
    setError(null);
    try {
      await releaseControls();
    } catch {
      // Releasing held inputs is best effort. A failed input reset must never
      // prevent the non-recoverable disconnect that stops billing.
    }
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
    setModelState(null);
    setActiveMazeId(null);
    setActiveRouteId(null);
    setPendingRouteId(null);
    setChunkIndex(0);
    setClip(null);
    setClipError(null);
    setPhase("preview");
    return true;
  }, [clearActivationWatchdog, clearRouteWatchdog, disconnect, fail, releaseControls]);

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
    switching: "The next path is taking shape…",
    ending: "Releasing the live session…",
  };

  const statusLabel =
    phase === "live" || phase === "switching"
      ? "LIVE"
      : status === "ready"
        ? "READY"
        : status.toUpperCase();

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
            className={`seed-preview ${hasVideo && modelState?.started ? "is-hidden" : ""}`}
            src={activeMaze.seedImage}
            alt={`Prototype entrance for ${activeMaze.title}`}
          />
          <LingbotWorld2MainVideoView
            className={`reactor-video ${hasVideo ? "has-track" : ""}`}
            videoObjectFit="cover"
            muted
          />
          <div className="media-vignette" />
          <div className="media-grid" />

          {busy && phaseCopy[phase] && (
            <div className="materializing" role="status">
              <span className="materializing-mark" />
              <p>{phaseCopy[phase]}</p>
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

        <aside className="maze-index" aria-label="Maze selection">
          <span className="index-label">CHOOSE AN ENTRANCE</span>
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
        </aside>

        <section className="story-panel" aria-live="polite">
          <p className="story-eyebrow">{narrative.eyebrow}</p>
          <h1>{narrative.title}</h1>
          <p className="story-body">{narrative.body}</p>
          <div className="edition-line">
            <span>{activeMaze.edition}</span>
            <span>{activeMaze.location}</span>
          </div>
        </section>

        <section className="route-panel" aria-label="Narrative directions">
          <div className="route-heading">
            <span>{isLive ? "CHOOSE YOUR DIRECTION" : "ROUTES INSIDE"}</span>
            <small>{isLive ? "Prompt changes on the next video chunk" : "Preview the narrative forks"}</small>
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
                      : !canControl || Boolean(pendingRouteId)
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
            <div className="control-copy">
              <span>HOLD TO EXPLORE</span>
              <small>Movement persists until release</small>
            </div>
            <div className="control-keys">
              {CONTROL_BUTTONS.map((control) => (
                <button
                  key={control.code}
                  aria-label={control.hint}
                  aria-pressed={pressedControlCodes.includes(control.code)}
                  disabled={!canControl}
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
                {isPaused ? "RESUME" : "PAUSE"}
              </button>
            </div>
          </div>
        )}
      </section>

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
            <div><dt>PROMPT MODE</dt><dd>{isTraversing ? "moving" : "still"}</dd></div>
            <div><dt>CHUNK</dt><dd>{chunkIndex}</dd></div>
            <div><dt>ACTION</dt><dd>{modelState?.current_action ?? "—"}</dd></div>
            <div><dt>CAMERA POSE</dt><dd>{mouseLook || modelState?.camera_pose_active ? "active" : "idle"}</dd></div>
            <div><dt>IMAGE</dt><dd>{modelState?.has_image ? "ready" : "not armed"}</dd></div>
            <div><dt>VIDEO TRACK</dt><dd>{tracks.main_video ? "received" : "waiting"}</dd></div>
          </dl>

          <div className="operator-session">
            <span>SESSION</span>
            <code>{sessionId ?? "not allocated"}</code>
          </div>

          <div className="operator-capture">
            <div>
              <span>SESSION CAPTURE</span>
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
        <span>PROTOTYPE CONTENT · REPLACE IN lib/fashion-maze.ts</span>
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
