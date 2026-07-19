"use client";

import type { LingbotWorld2Message } from "@reactor-models/lingbot-world-2";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  composeWorldPrompt,
  resolvePhotoAction,
  type FashionMaze,
  type MazeRoute,
} from "@/lib/fashion-maze";

const PHOTO_WATCHDOG_MS = 30_000;
const PHOTO_RENDER_SETTLE_MS = 1_200;
const PHOTO_FRAME_TIMEOUT_MS = 5_000;
const PHOTO_ENCODE_TIMEOUT_MS = 2_000;
const PHOTO_FLASH_MS = 420;

export type PhotoActionState =
  | "idle"
  | "framing"
  | "capturing"
  | "returning"
  | "saved";

export interface PhotoPromptStep {
  cue: string;
  prompt: string;
  holdChunks: number;
}

export interface PendingPhoto {
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

export interface PhotoCueDisplay {
  cue: string;
  beatIndex: number;
  beatCount: number;
}

export interface CapturedPhoto {
  url: string;
  filename: string;
  width: number;
  height: number;
  chunkIndex: number;
}

export interface PhotoCaptureMachineState {
  pending: PendingPhoto | null;
  photoState: PhotoActionState;
  cue: PhotoCueDisplay | null;
}

export type PhotoChunkMessage = Extract<
  LingbotWorld2Message,
  { type: "chunk_complete" }
>;

export type PhotoCommandErrorMessage = Extract<
  LingbotWorld2Message,
  { type: "command_error" }
>;

export type PhotoCaptureCommand =
  | {
      type: "arm-watchdog";
      pending: PendingPhoto;
      message: string;
    }
  | {
      type: "issue-prompt";
      pending: PendingPhoto;
      failureMessage: string;
    }
  | {
      type: "capture-frame";
      pending: PendingPhoto;
      completedChunk: number;
    }
  | {
      type: "restore-ambient";
      pending: PendingPhoto;
      reason: string | null;
    }
  | {
      type: "finish";
    }
  | {
      type: "recover";
      pending: PendingPhoto;
      reason: string;
    };

export interface PhotoCaptureTransition {
  state: PhotoCaptureMachineState;
  commands: readonly PhotoCaptureCommand[];
  /** The message matched the photo flow. It need not own the outer switch. */
  matched: boolean;
}

interface MutableCell<T> {
  current: T;
}

export interface UsePhotoCaptureOptions {
  activeMaze: FashionMaze;
  activeRoute: MazeRoute | undefined;
  canTakePhoto: boolean;
  revealVideo: boolean;
  stageMediaRef: RefObject<HTMLDivElement | null>;
  mainVideoTrack: MediaStreamTrack | undefined;
  hasPendingRoute: () => boolean;
  isTerminating: () => boolean;
  releaseControls: () => Promise<unknown>;
  setPrompt: (params: { prompt: string }) => Promise<void>;
  lastPrompt: MutableCell<string>;
  promptRequestId: MutableCell<number>;
  scheduleWatchdog: (
    callback: () => void,
    timeoutMs: number,
  ) => number | null;
  onPhaseChange: (phase: "switching" | "live") => void;
  onError: (message: string | null) => void;
  onAmbientChunkReadyChange: (ready: boolean) => void;
  onFatalError: (cause: unknown) => void;
  onMediaEvent?: (event: string, detail: string) => void;
}

export interface PhotoCaptureController {
  photoState: PhotoActionState;
  cue: PhotoCueDisplay | null;
  capturedPhoto: CapturedPhoto | null;
  flash: boolean;
  busy: boolean;
  pending: PendingPhoto | null;
  hasPending: () => boolean;
  dismissCapturedPhoto: () => void;
  takePhoto: () => Promise<void>;
  handleChunk: (message: PhotoChunkMessage) => PhotoCaptureTransition;
  handleCommandError: (message: PhotoCommandErrorMessage) => boolean;
  handleLastError: (cause: unknown) => boolean;
  reset: (options?: { clearCapturedPhoto?: boolean }) => void;
}

export function createInitialPhotoCaptureState(): PhotoCaptureMachineState {
  return {
    pending: null,
    photoState: "idle",
    cue: null,
  };
}

export function isPhotoCaptureBusy(state: PhotoActionState): boolean {
  return state === "framing" || state === "capturing" || state === "returning";
}

export function hasSettledRenderedVideoEvidence({
  minimumDurationMs,
  firstMediaTime,
  currentMediaTime,
  initialCurrentTime,
  currentTime,
  initialPresentedFrames,
  currentPresentedFrames,
}: {
  minimumDurationMs: number;
  firstMediaTime?: number | null;
  currentMediaTime?: number;
  initialCurrentTime?: number;
  currentTime?: number;
  initialPresentedFrames?: number | null;
  currentPresentedFrames?: number | null;
}): boolean {
  if (firstMediaTime !== undefined && firstMediaTime !== null) {
    return (
      currentMediaTime !== undefined &&
      (currentMediaTime - firstMediaTime) * 1_000 >= minimumDurationMs
    );
  }

  const mediaAdvanced =
    initialCurrentTime !== undefined &&
    currentTime !== undefined &&
    (currentTime - initialCurrentTime) * 1_000 >= minimumDurationMs;
  const framesAdvanced =
    initialPresentedFrames === null ||
    (typeof initialPresentedFrames === "number" &&
      typeof currentPresentedFrames === "number" &&
      currentPresentedFrames > initialPresentedFrames);
  return mediaAdvanced && framesAdvanced;
}

export function photoExtensionForMimeType(mimeType: string): "webp" | "png" {
  return mimeType === "image/webp" ? "webp" : "png";
}

export function canContinuePhotoCapture({
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

function cueFor(pending: PendingPhoto): PhotoCueDisplay {
  return {
    cue: pending.cue,
    beatIndex: pending.beatIndex,
    beatCount: pending.beatCount,
  };
}

/**
 * Pure transition for a completed Reactor chunk. The caller executes the
 * returned commands only after committing `state`, so async completions can
 * guard themselves against the exact PendingPhoto identity they were issued
 * for.
 */
export function reducePhotoCaptureChunk(
  state: PhotoCaptureMachineState,
  message: PhotoChunkMessage,
  chunkSerial: number,
): PhotoCaptureTransition {
  const pending = state.pending;
  if (
    !pending ||
    chunkSerial <= pending.issuedAfterSerial ||
    message.active_prompt.trim() !== pending.prompt.trim() ||
    message.active_action !== "still"
  ) {
    return { state, commands: [], matched: false };
  }

  // Keep the exact object identity owned by the async capture executor. A
  // later matching chunk can arrive during the 1.2s presentation settle; it
  // is acknowledged but cannot replace the guard object or start a new draw.
  if (pending.stage === "capturing") {
    return { state, commands: [], matched: true };
  }

  const confirmed: PendingPhoto = {
    ...pending,
    matchedChunks: pending.matchedChunks + 1,
    issuedAfterSerial: chunkSerial,
  };

  if (confirmed.matchedChunks < confirmed.holdChunks) {
    return {
      state: { ...state, pending: confirmed },
      commands: [
        {
          type: "arm-watchdog",
          pending: confirmed,
          message: `The ${confirmed.cue} photo beat stopped generating. The ambient scene was restored.`,
        },
      ],
      matched: true,
    };
  }

  if (confirmed.stage === "capture") {
    const [nextStep, ...remaining] = confirmed.remaining;
    if (nextStep) {
      const advancing: PendingPhoto = {
        ...confirmed,
        ...nextStep,
        remaining,
        matchedChunks: 0,
        beatIndex: confirmed.beatIndex + 1,
        issuedAfterSerial: chunkSerial,
      };
      return {
        state: {
          ...state,
          pending: advancing,
          cue: cueFor(advancing),
        },
        commands: [
          {
            type: "arm-watchdog",
            pending: advancing,
            message: `The ${advancing.cue} photo beat did not begin in time. The ambient scene was restored.`,
          },
          {
            type: "issue-prompt",
            pending: advancing,
            failureMessage: `The ${advancing.cue} photo beat failed`,
          },
        ],
        matched: true,
      };
    }

    const capturing: PendingPhoto = {
      ...confirmed,
      stage: "capturing",
    };
    return {
      state: {
        ...state,
        pending: capturing,
        photoState: "capturing",
      },
      commands: [
        {
          type: "arm-watchdog",
          pending: capturing,
          message:
            "The shutter frame could not be saved in time. The ambient scene is being restored.",
        },
        {
          type: "capture-frame",
          pending: capturing,
          completedChunk: message.chunk_index,
        },
      ],
      matched: true,
    };
  }

  if (confirmed.stage === "release") {
    return {
      state: { ...state, pending: confirmed },
      commands: [
        {
          type: "restore-ambient",
          pending: confirmed,
          reason: null,
        },
      ],
      matched: true,
    };
  }

  if (confirmed.stage === "restore") {
    return {
      state: {
        pending: null,
        photoState: confirmed.photoSaved ? "saved" : "idle",
        cue: null,
      },
      commands: [{ type: "finish" }],
      matched: true,
    };
  }

  return { state: { ...state, pending: confirmed }, commands: [], matched: true };
}

/** Pure command-error/reset boundary used by the outer message dispatcher. */
export function reducePhotoCaptureMessage(
  state: PhotoCaptureMachineState,
  message: LingbotWorld2Message,
  chunkSerial: number,
): PhotoCaptureTransition {
  if (message.type === "chunk_complete") {
    return reducePhotoCaptureChunk(state, message, chunkSerial);
  }
  if (message.type === "generation_reset") {
    return {
      state: createInitialPhotoCaptureState(),
      commands: [],
      matched: state.pending !== null || isPhotoCaptureBusy(state.photoState),
    };
  }
  if (message.type === "command_error" && state.pending) {
    return {
      state,
      commands: [
        {
          type: "recover",
          pending: state.pending,
          reason: `The photo action failed: ${message.command}: ${message.reason}. The live scene was restored.`,
        },
      ],
      matched: true,
    };
  }
  return { state, commands: [], matched: false };
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

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export async function waitForRenderedVideoDuration(
  video: HTMLVideoElement,
  minimumDurationMs = PHOTO_RENDER_SETTLE_MS,
  timeoutMs = PHOTO_FRAME_TIMEOUT_MS,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let frameRequest: number | null = null;
    let fallbackTimer: number | null = null;
    let timeout: number | null = null;
    let firstMediaTime: number | null = null;
    let settled = false;
    const initialCurrentTime = video.currentTime;
    const initialPresentedFrames =
      typeof video.getVideoPlaybackQuality === "function"
        ? video.getVideoPlaybackQuality().totalVideoFrames
        : null;
    const cleanup = () => {
      if (timeout !== null) {
        window.clearTimeout(timeout);
        timeout = null;
      }
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (
        frameRequest !== null &&
        typeof video.cancelVideoFrameCallback === "function"
      ) {
        video.cancelVideoFrameCallback(frameRequest);
      }
      frameRequest = null;
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const requestNextFrame = () => {
      if (settled) return;
      frameRequest = video.requestVideoFrameCallback((_now, metadata) => {
        frameRequest = null;
        if (settled) return;
        if (firstMediaTime === null) firstMediaTime = metadata.mediaTime;
        if (hasSettledRenderedVideoEvidence({
          minimumDurationMs,
          firstMediaTime,
          currentMediaTime: metadata.mediaTime,
        })) {
          finish();
        } else {
          requestNextFrame();
        }
      });
    };
    const pollFallback = () => {
      if (settled) return;
      const currentPresentedFrames =
        typeof video.getVideoPlaybackQuality === "function"
          ? video.getVideoPlaybackQuality().totalVideoFrames
          : null;
      if (
        hasSettledRenderedVideoEvidence({
          minimumDurationMs,
          initialCurrentTime,
          currentTime: video.currentTime,
          initialPresentedFrames,
          currentPresentedFrames,
        })
      ) finish();
      else fallbackTimer = window.setTimeout(pollFallback, 50);
    };
    timeout = window.setTimeout(() => {
      finish(
        new Error(
          "The Reactor view did not render enough settled video for the photo.",
        ),
      );
    }, timeoutMs);

    if (typeof video.requestVideoFrameCallback === "function") {
      requestNextFrame();
    } else {
      pollFallback();
    }
  });
}

export async function captureReactorPhoto(
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

  // chunk_complete confirms generation/emission, not browser presentation.
  // Preserve the authored shutter prompt for 1.2 seconds of rendered media.
  await waitForRenderedVideoDuration(video);

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
          if (result) resolve(result);
          else reject(new Error("The browser could not encode the photo."));
        },
        "image/webp",
        0.9,
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
  const extension = photoExtensionForMimeType(blob.type);
  return {
    url: URL.createObjectURL(blob),
    filename: `fashion-maze-${mazeId}-chunk-${paddedChunk}-${timestamp}.${extension}`,
    width: canvas.width,
    height: canvas.height,
    chunkIndex,
  };
}

export function downloadCapturedPhoto(photo: CapturedPhoto): void {
  const anchor = document.createElement("a");
  anchor.href = photo.url;
  anchor.download = photo.filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function usePhotoCapture({
  activeMaze,
  activeRoute,
  canTakePhoto,
  revealVideo,
  stageMediaRef,
  mainVideoTrack,
  hasPendingRoute,
  isTerminating,
  releaseControls,
  setPrompt,
  lastPrompt,
  promptRequestId,
  scheduleWatchdog,
  onPhaseChange,
  onError,
  onAmbientChunkReadyChange,
  onFatalError,
  onMediaEvent,
}: UsePhotoCaptureOptions): PhotoCaptureController {
  const [machine, setMachine] = useState<PhotoCaptureMachineState>(
    createInitialPhotoCaptureState,
  );
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(null);
  const [flash, setFlash] = useState(false);
  const machineRef = useRef(machine);
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const lifecycleRef = useRef(0);
  const capturedPhotoUrlRef = useRef<string | null>(null);
  const chunkSerialRef = useRef(0);
  const watchdogRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const commit = useCallback((next: PhotoCaptureMachineState) => {
    machineRef.current = next;
    busyRef.current = isPhotoCaptureBusy(next.photoState);
    setMachine(next);
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current === null) return;
    window.clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  }, []);

  const replaceCapturedPhoto = useCallback((photo: CapturedPhoto | null) => {
    const previousUrl = capturedPhotoUrlRef.current;
    capturedPhotoUrlRef.current = photo?.url ?? null;
    setCapturedPhoto(photo);
    if (previousUrl && previousUrl !== photo?.url) {
      URL.revokeObjectURL(previousUrl);
    }
  }, []);

  const restoreAmbient = useCallback(
    (pending: PendingPhoto, reason: string | null) => {
      if (
        !mountedRef.current ||
        machineRef.current.pending !== pending ||
        isTerminating()
      ) {
        return;
      }

      clearWatchdog();
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
      commit({
        pending: restoring,
        photoState: "returning",
        cue: {
          cue: restoring.cue,
          beatIndex: restoring.beatCount,
          beatCount: restoring.beatCount,
        },
      });
      onPhaseChange("switching");
      onError(reason);

      const requestId = ++promptRequestId.current;
      lastPrompt.current = restoring.prompt;
      watchdogRef.current = scheduleWatchdog(() => {
        watchdogRef.current = null;
        if (
          mountedRef.current &&
          machineRef.current.pending === restoring &&
          !isTerminating()
        ) {
          onFatalError(
            new Error(
              "The photo action could not restore the ambient world in time.",
            ),
          );
        }
      }, PHOTO_WATCHDOG_MS);

      void setPrompt({ prompt: restoring.prompt }).catch((cause) => {
        if (
          mountedRef.current &&
          machineRef.current.pending === restoring &&
          promptRequestId.current === requestId &&
          !isTerminating()
        ) {
          onFatalError(
            new Error(
              `The photo action could not restore the ambient world: ${errorMessage(cause)}`,
            ),
          );
        }
      });
    },
    [
      clearWatchdog,
      commit,
      isTerminating,
      lastPrompt,
      onError,
      onFatalError,
      onPhaseChange,
      promptRequestId,
      scheduleWatchdog,
      setPrompt,
    ],
  );

  const recover = useCallback(
    (pending: PendingPhoto, reason: string) => {
      if (
        !mountedRef.current ||
        machineRef.current.pending !== pending ||
        isTerminating()
      ) {
        return;
      }
      if (pending.stage === "restore") {
        onFatalError(new Error(reason));
        return;
      }
      restoreAmbient(pending, reason);
    },
    [isTerminating, onFatalError, restoreAmbient],
  );

  const armWatchdog = useCallback(
    (pending: PendingPhoto, message: string) => {
      clearWatchdog();
      watchdogRef.current = scheduleWatchdog(() => {
        watchdogRef.current = null;
        recover(pending, message);
      }, PHOTO_WATCHDOG_MS);
    },
    [clearWatchdog, recover, scheduleWatchdog],
  );

  const completeCapture = useCallback(
    async (pending: PendingPhoto, completedChunk: number) => {
      const startedLifecycle = lifecycleRef.current;
      onMediaEvent?.(
        "photo_render_settle",
        `chunk=${completedChunk} minimumMs=${PHOTO_RENDER_SETTLE_MS}`,
      );
      let photo: CapturedPhoto;
      try {
        photo = await captureReactorPhoto(
          stageMediaRef.current,
          mainVideoTrack,
          activeMaze.id,
          completedChunk,
        );
      } catch (cause) {
        if (
          !mountedRef.current ||
          lifecycleRef.current !== startedLifecycle
        ) {
          return;
        }
        recover(
          pending,
          `The shutter action completed, but the frame could not be saved: ${errorMessage(cause)}`,
        );
        return;
      }

      if (
        !canContinuePhotoCapture({
          mounted: mountedRef.current,
          startedLifecycle,
          currentLifecycle: lifecycleRef.current,
          pendingMatches: machineRef.current.pending === pending,
          terminating: isTerminating(),
        })
      ) {
        URL.revokeObjectURL(photo.url);
        return;
      }

      replaceCapturedPhoto(photo);
      try {
        downloadCapturedPhoto(photo);
      } catch (cause) {
        onError(
          `The photo was saved, but automatic download could not start: ${errorMessage(cause)}`,
        );
      }
      setFlash(true);
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
      flashTimerRef.current = window.setTimeout(() => {
        flashTimerRef.current = null;
        setFlash(false);
      }, PHOTO_FLASH_MS);

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
      commit({
        pending: releasePending,
        photoState: "returning",
        cue: cueFor(releasePending),
      });
      promptRequestId.current += 1;
      lastPrompt.current = releasePending.prompt;
      armWatchdog(
        releasePending,
        "The photo was saved, but the scene did not finish returning to its ambient state. The ambient prompt was restored.",
      );

      try {
        await setPrompt({ prompt: releasePending.prompt });
      } catch (cause) {
        recover(
          releasePending,
          `The photo was saved, but the return action failed: ${errorMessage(cause)}`,
        );
      }
    },
    [
      activeMaze.id,
      armWatchdog,
      commit,
      isTerminating,
      lastPrompt,
      mainVideoTrack,
      onError,
      onMediaEvent,
      promptRequestId,
      recover,
      replaceCapturedPhoto,
      setPrompt,
      stageMediaRef,
    ],
  );

  const executeCommands = useCallback(
    (commands: readonly PhotoCaptureCommand[]) => {
      for (const command of commands) {
        switch (command.type) {
          case "arm-watchdog":
            armWatchdog(command.pending, command.message);
            break;
          case "issue-prompt":
            promptRequestId.current += 1;
            lastPrompt.current = command.pending.prompt;
            void setPrompt({ prompt: command.pending.prompt }).catch((cause) => {
              recover(
                command.pending,
                `${command.failureMessage}: ${errorMessage(cause)}`,
              );
            });
            break;
          case "capture-frame":
            void completeCapture(command.pending, command.completedChunk);
            break;
          case "restore-ambient":
            restoreAmbient(command.pending, command.reason);
            break;
          case "finish":
            clearWatchdog();
            onPhaseChange("live");
            break;
          case "recover":
            recover(command.pending, command.reason);
            break;
        }
      }
    },
    [
      armWatchdog,
      clearWatchdog,
      completeCapture,
      lastPrompt,
      onPhaseChange,
      promptRequestId,
      recover,
      restoreAmbient,
      setPrompt,
    ],
  );

  const handleChunk = useCallback(
    (message: PhotoChunkMessage): PhotoCaptureTransition => {
      const transition = reducePhotoCaptureChunk(
        machineRef.current,
        message,
        ++chunkSerialRef.current,
      );
      if (transition.state !== machineRef.current) commit(transition.state);
      executeCommands(transition.commands);
      return transition;
    },
    [commit, executeCommands],
  );

  const handleCommandError = useCallback(
    (message: PhotoCommandErrorMessage): boolean => {
      const transition = reducePhotoCaptureMessage(
        machineRef.current,
        message,
        chunkSerialRef.current,
      );
      if (transition.state !== machineRef.current) commit(transition.state);
      executeCommands(transition.commands);
      return transition.matched;
    },
    [commit, executeCommands],
  );

  const handleLastError = useCallback(
    (cause: unknown): boolean => {
      const pending = machineRef.current.pending;
      if (!pending) return false;
      recover(
        pending,
        `The photo action failed. ${errorMessage(cause)} The live scene was restored.`,
      );
      return true;
    },
    [recover],
  );

  const reset = useCallback(
    (options?: { clearCapturedPhoto?: boolean }) => {
      clearWatchdog();
      chunkSerialRef.current = 0;
      commit(createInitialPhotoCaptureState());
      setFlash(false);
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      if (options?.clearCapturedPhoto) replaceCapturedPhoto(null);
    },
    [clearWatchdog, commit, replaceCapturedPhoto],
  );

  const takePhoto = useCallback(async () => {
    if (
      !canTakePhoto ||
      !revealVideo ||
      busyRef.current ||
      hasPendingRoute() ||
      machineRef.current.pending
    ) {
      return;
    }

    const photoAction = resolvePhotoAction(activeMaze);
    const ambientPrompt = composeWorldPrompt(activeMaze, activeRoute, {
      actionMode: "ambient",
    });
    const steps: PhotoPromptStep[] = photoAction.beats.map((beat) => ({
      cue: beat.cue,
      holdChunks: beat.holdChunks,
      prompt: composeWorldPrompt(activeMaze, activeRoute, {
        actionMode: beat.mode,
      }),
    }));
    const [firstStep, ...remaining] = steps;
    if (!firstStep) {
      onError("The shared photo sequence is unavailable.");
      return;
    }

    onAmbientChunkReadyChange(false);
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
    commit({
      pending,
      photoState: "framing",
      cue: cueFor(pending),
    });
    onPhaseChange("switching");
    onError(null);
    armWatchdog(
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

      // Both commands apply on the next chunk. Queue them in the same turn so
      // waiting for input release cannot burn an extra ambient chunk boundary.
      const controlsReleased = releaseControls();
      promptRequestId.current += 1;
      lastPrompt.current = pending.prompt;
      await Promise.all([
        controlsReleased,
        setPrompt({ prompt: pending.prompt }),
      ]);
    } catch (cause) {
      recover(
        pending,
        `The photo action could not start: ${errorMessage(cause)}`,
      );
    }
  }, [
    activeMaze,
    activeRoute,
    armWatchdog,
    canTakePhoto,
    commit,
    hasPendingRoute,
    lastPrompt,
    onAmbientChunkReadyChange,
    onError,
    onPhaseChange,
    promptRequestId,
    recover,
    releaseControls,
    revealVideo,
    setPrompt,
    stageMediaRef,
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

  useEffect(() => {
    mountedRef.current = true;
    lifecycleRef.current += 1;
    return () => {
      mountedRef.current = false;
      lifecycleRef.current += 1;
      clearWatchdog();
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      if (capturedPhotoUrlRef.current) {
        URL.revokeObjectURL(capturedPhotoUrlRef.current);
        capturedPhotoUrlRef.current = null;
      }
    };
  }, [clearWatchdog]);

  const hasPending = useCallback(
    () => machineRef.current.pending !== null,
    [],
  );
  const dismissCapturedPhoto = useCallback(
    () => replaceCapturedPhoto(null),
    [replaceCapturedPhoto],
  );

  return {
    photoState: machine.photoState,
    cue: machine.cue,
    capturedPhoto,
    flash,
    busy: isPhotoCaptureBusy(machine.photoState),
    pending: machine.pending,
    hasPending,
    dismissCapturedPhoto,
    takePhoto,
    handleChunk,
    handleCommandError,
    handleLastError,
    reset,
  };
}
