"use client";
// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel


import type { LingbotWorld2CommandErrorMessage } from "@reactor-models/lingbot-world-2";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  FashionMazeDoorChoice,
  FashionMazeDoorQuestion,
} from "@/lib/fashion-maze";
import type {
  MutableCell,
  PendingSceneTransition,
  WatchdogScheduler,
} from "./useSceneTransition";

export type DoorQuestionPhase =
  | "pausing"
  | "repausing"
  | "choosing"
  | "preparing"
  | "resuming";

export type DoorQuestionSource = "manual" | "automatic";

export interface DoorQuestionDialogState {
  phase: DoorQuestionPhase;
  source: DoorQuestionSource;
  sceneId: string;
  question: FashionMazeDoorQuestion;
  selectedChoiceId: string | null;
  frozenElapsedSeconds: number;
}

export interface DoorAnswerRecord {
  sceneId: string;
  question: string;
  choiceId: string;
  choiceLabel: string;
}

export type DoorQuestionRuntimePhase = "switching" | "paused" | "live";

export type DoorPauseSignal = "paused" | "resumed";

export type DoorPausePlan =
  | { consumed: false; action: "none" }
  | { consumed: true; action: "offer-choice" }
  | { consumed: true; action: "commit-choice" }
  | { consumed: true; action: "restore-pause" };

export type DoorReconnectPlan =
  | { consumed: false; action: "none" }
  | { consumed: true; action: "retry-pause" | "retry-resume" };

export interface DoorQuestionContinuationGate {
  mounted: boolean;
  startedLifecycle: number;
  currentLifecycle: number;
  pendingMatches: boolean;
  terminating: boolean;
}

/**
 * Pure async-continuation gate. Door commands can resolve after a disconnect,
 * reset, or unmount; those stale continuations must not mutate UI state or
 * activate a prepared scene.
 */
export function canContinueDoorQuestion(
  gate: DoorQuestionContinuationGate,
): boolean {
  return (
    gate.mounted &&
    gate.startedLifecycle === gate.currentLifecycle &&
    gate.pendingMatches &&
    !gate.terminating
  );
}

/**
 * Pure dispatcher plan used by both `state` and generation pause/resume
 * messages. This captures the important priority rule: a door decision owns
 * pause/resume messages until it commits or returns to choosing.
 */
export function planDoorPauseSignal(
  pending: DoorQuestionDialogState | null,
  signal: DoorPauseSignal,
): DoorPausePlan {
  if (!pending) return { consumed: false, action: "none" };
  if (
    signal === "paused" &&
    (pending.phase === "pausing" || pending.phase === "repausing")
  ) {
    return { consumed: true, action: "offer-choice" };
  }
  if (
    signal === "resumed" &&
    pending.phase === "resuming" &&
    pending.selectedChoiceId
  ) {
    return { consumed: true, action: "commit-choice" };
  }
  if (
    signal === "resumed" &&
    (pending.phase === "choosing" || pending.phase === "preparing")
  ) {
    return { consumed: true, action: "restore-pause" };
  }
  return { consumed: false, action: "none" };
}

/**
 * Reconcile only the two ambiguous command outcomes after a transport
 * reconnect. Ordinary duplicate state messages continue through
 * `planDoorPauseSignal` and never reissue commands.
 */
export function planDoorReconnectSignal(
  pending: DoorQuestionDialogState | null,
  signal: DoorPauseSignal,
): DoorReconnectPlan {
  if (!pending) return { consumed: false, action: "none" };
  if (
    signal === "resumed" &&
    (pending.phase === "pausing" || pending.phase === "repausing")
  ) {
    return { consumed: true, action: "retry-pause" };
  }
  if (
    signal === "paused" &&
    pending.phase === "resuming" &&
    pending.selectedChoiceId
  ) {
    return { consumed: true, action: "retry-resume" };
  }
  return { consumed: false, action: "none" };
}

export interface UseDoorQuestionOptions {
  sceneId: string;
  sceneHasTransition: boolean;
  question: FashionMazeDoorQuestion | null;
  hasJourneyExit: boolean;
  canControl: boolean;
  revealVideo: boolean;
  elapsedSeconds: number;

  stageMediaRef: MutableCell<HTMLDivElement | null>;
  terminatingRef: MutableCell<boolean>;
  autoAdvanceIssuedRef: MutableCell<boolean>;

  hasPendingSceneTransition: () => boolean;
  prepareSceneTransition: () => Promise<PendingSceneTransition | null>;
  activateSceneTransition: (pending: PendingSceneTransition) => unknown;
  releaseControls: () => Promise<unknown>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;

  scheduleWatchdog: WatchdogScheduler;
  abortActivation: (cause: unknown) => void;
  onPhaseChange: (phase: DoorQuestionRuntimePhase) => void;
  onErrorChange: (message: string | null) => void;
  onSessionStartedAtChange: (startedAt: number | null) => void;
  onElapsedSecondsChange: (seconds: number) => void;

  watchdogMs?: number;
  controlReleaseTimeoutMs?: number;
}

export interface DoorQuestionController {
  dialog: DoorQuestionDialogState | null;
  answers: DoorAnswerRecord[];
  hasPending: () => boolean;
  request: (source?: DoorQuestionSource) => Promise<void>;
  choose: (choice: FashionMazeDoorChoice) => Promise<void>;
  handlePauseSignal: (signal: DoorPauseSignal) => boolean;
  reconcileAfterReconnect: (signal: DoorPauseSignal) => boolean;
  handleCommandError: (message: LingbotWorld2CommandErrorMessage) => boolean;
  handleLastError: (cause: unknown) => boolean;
  reset: (options?: { clearAnswers?: boolean }) => void;
}

const DEFAULT_WATCHDOG_MS = 20_000;
const DEFAULT_CONTROL_RELEASE_TIMEOUT_MS = 750;

function describeError(cause: unknown): string {
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

export function useDoorQuestion(
  options: UseDoorQuestionOptions,
): DoorQuestionController {
  const {
    sceneId,
    sceneHasTransition,
    question,
    hasJourneyExit,
    canControl,
    revealVideo,
    elapsedSeconds,
    stageMediaRef,
    terminatingRef,
    autoAdvanceIssuedRef,
    hasPendingSceneTransition,
    prepareSceneTransition,
    activateSceneTransition,
    releaseControls,
    pause,
    resume,
    scheduleWatchdog,
    abortActivation,
    onPhaseChange,
    onErrorChange,
    onSessionStartedAtChange,
    onElapsedSecondsChange,
    watchdogMs = DEFAULT_WATCHDOG_MS,
    controlReleaseTimeoutMs = DEFAULT_CONTROL_RELEASE_TIMEOUT_MS,
  } = options;

  const [dialog, setDialog] = useState<DoorQuestionDialogState | null>(null);
  const [answers, setAnswers] = useState<DoorAnswerRecord[]>([]);
  const pendingRef = useRef<DoorQuestionDialogState | null>(null);
  const preparedTransitionRef = useRef<PendingSceneTransition | null>(null);
  const watchdogRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const lifecycleRef = useRef(0);

  const canContinue = useCallback(
    (pending: DoorQuestionDialogState, startedLifecycle: number) =>
      canContinueDoorQuestion({
        mounted: mountedRef.current,
        startedLifecycle,
        currentLifecycle: lifecycleRef.current,
        pendingMatches: pendingRef.current === pending,
        terminating: terminatingRef.current,
      }),
    [terminatingRef],
  );

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current === null) return;
    window.clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  }, []);

  const armWatchdog = useCallback(
    (pending: DoorQuestionDialogState, callback: () => void) => {
      const startedLifecycle = lifecycleRef.current;
      clearWatchdog();
      watchdogRef.current = scheduleWatchdog(() => {
        watchdogRef.current = null;
        if (canContinue(pending, startedLifecycle)) {
          callback();
        }
      }, watchdogMs);
    },
    [canContinue, clearWatchdog, scheduleWatchdog, watchdogMs],
  );

  const restoreCountdown = useCallback(
    (pending: DoorQuestionDialogState) => {
      onSessionStartedAtChange(
        Date.now() - pending.frozenElapsedSeconds * 1_000,
      );
      onElapsedSecondsChange(pending.frozenElapsedSeconds);
    },
    [onElapsedSecondsChange, onSessionStartedAtChange],
  );

  const offerChoice = useCallback((): boolean => {
    const pending = pendingRef.current;
    const startedLifecycle = lifecycleRef.current;
    const plan = planDoorPauseSignal(pending, "paused");
    if (
      !pending ||
      !canContinue(pending, startedLifecycle) ||
      !plan.consumed ||
      plan.action !== "offer-choice"
    ) {
      return false;
    }
    clearWatchdog();
    if (pending.phase === "repausing") {
      preparedTransitionRef.current = null;
      pending.selectedChoiceId = null;
    }
    pending.phase = "choosing";
    setDialog({ ...pending });
    onPhaseChange("paused");
    return true;
  }, [canContinue, clearWatchdog, onPhaseChange]);

  const commitChoice = useCallback((): boolean => {
    const pending = pendingRef.current;
    const startedLifecycle = lifecycleRef.current;
    const plan = planDoorPauseSignal(pending, "resumed");
    if (
      !pending ||
      !canContinue(pending, startedLifecycle) ||
      !plan.consumed ||
      plan.action !== "commit-choice"
    ) {
      return false;
    }
    const choice = pending.question.choices.find(
      (candidate) => candidate.id === pending.selectedChoiceId,
    );
    const prepared = preparedTransitionRef.current;
    if (!choice || !prepared) return false;

    clearWatchdog();
    setAnswers((current) => [
      ...current.filter((answer) => answer.sceneId !== pending.sceneId),
      {
        sceneId: pending.sceneId,
        question: pending.question.prompt,
        choiceId: choice.id,
        choiceLabel: choice.label,
      },
    ]);
    preparedTransitionRef.current = null;
    pendingRef.current = null;
    setDialog(null);
    onPhaseChange("switching");
    activateSceneTransition(prepared);
    return true;
  }, [activateSceneTransition, canContinue, clearWatchdog, onPhaseChange]);

  const restorePause = useCallback((): boolean => {
    const pending = pendingRef.current;
    const startedLifecycle = lifecycleRef.current;
    const plan = planDoorPauseSignal(pending, "resumed");
    if (
      !pending ||
      !canContinue(pending, startedLifecycle) ||
      !plan.consumed ||
      plan.action !== "restore-pause"
    ) {
      return false;
    }

    clearWatchdog();
    preparedTransitionRef.current = null;
    pending.phase = "repausing";
    pending.selectedChoiceId = null;
    setDialog({ ...pending });
    onPhaseChange("paused");
    onErrorChange(
      "Reactor resumed before the door decision was complete. Restoring the pause…",
    );
    armWatchdog(pending, () => {
      abortActivation(
        new Error("Reactor could not restore the paused door decision in time."),
      );
    });
    void pause().catch((cause) => {
      if (
        canContinue(pending, startedLifecycle) &&
        pending.phase === "repausing" &&
        pending.selectedChoiceId === null
      ) {
        abortActivation(
          new Error(
            `Reactor could not restore the paused door decision: ${describeError(cause)}`,
          ),
        );
      }
    });
    return true;
  }, [
    abortActivation,
    armWatchdog,
    canContinue,
    clearWatchdog,
    onErrorChange,
    onPhaseChange,
    pause,
  ]);

  const handlePauseSignal = useCallback(
    (signal: DoorPauseSignal): boolean => {
      if (signal === "paused") return offerChoice();
      if (commitChoice()) return true;
      return restorePause();
    },
    [commitChoice, offerChoice, restorePause],
  );

  const reconcileAfterReconnect = useCallback(
    (signal: DoorPauseSignal): boolean => {
      const pending = pendingRef.current;
      const startedLifecycle = lifecycleRef.current;
      const plan = planDoorReconnectSignal(pending, signal);
      if (
        !pending ||
        !plan.consumed ||
        !canContinue(pending, startedLifecycle)
      ) {
        return false;
      }

      if (plan.action === "retry-pause") {
        onErrorChange(
          "Reactor reconnected before confirming the door pause. Retrying the pause…",
        );
        armWatchdog(pending, () => {
          abortActivation(
            new Error(
              "Reactor did not confirm the retried door pause after reconnecting.",
            ),
          );
        });
        void pause().catch((cause) => {
          if (
            !canContinue(pending, startedLifecycle) ||
            !["pausing", "repausing"].includes(pending.phase)
          ) {
            return;
          }
          const message = `Reactor could not restore the door pause after reconnecting: ${describeError(cause)}`;
          if (pending.phase === "repausing" || pending.source === "automatic") {
            abortActivation(new Error(message));
            return;
          }
          clearWatchdog();
          pendingRef.current = null;
          preparedTransitionRef.current = null;
          setDialog(null);
          restoreCountdown(pending);
          autoAdvanceIssuedRef.current = false;
          onPhaseChange("live");
          onErrorChange(message);
        });
        return true;
      }

      onErrorChange(
        "Reactor reconnected while the selected door was still paused. Retrying the resume…",
      );
      armWatchdog(pending, () => {
        abortActivation(
          new Error(
            "Reactor did not confirm the retried door resume after reconnecting.",
          ),
        );
      });
      void resume().catch((cause) => {
        if (
          !canContinue(pending, startedLifecycle) ||
          pending.phase !== "resuming"
        ) {
          return;
        }
        clearWatchdog();
        preparedTransitionRef.current = null;
        pending.phase = "choosing";
        pending.selectedChoiceId = null;
        setDialog({ ...pending });
        onPhaseChange("paused");
        onErrorChange(
          `The door could not resume after reconnecting: ${describeError(cause)}`,
        );
      });
      return true;
    },
    [
      abortActivation,
      armWatchdog,
      autoAdvanceIssuedRef,
      canContinue,
      clearWatchdog,
      onErrorChange,
      onPhaseChange,
      pause,
      restoreCountdown,
      resume,
    ],
  );

  const request = useCallback(
    async (source: DoorQuestionSource = "manual") => {
      if (
        !mountedRef.current ||
        terminatingRef.current ||
        !sceneHasTransition ||
        !question ||
        !hasJourneyExit ||
        !canControl ||
        !revealVideo ||
        pendingRef.current ||
        hasPendingSceneTransition()
      ) {
        return;
      }

      const pending: DoorQuestionDialogState = {
        phase: "pausing",
        source,
        sceneId,
        question,
        selectedChoiceId: null,
        frozenElapsedSeconds: elapsedSeconds,
      };
      const startedLifecycle = lifecycleRef.current;

      const recoverPause = (message: string): boolean => {
        if (!canContinue(pending, startedLifecycle)) return false;
        if (source === "automatic") {
          abortActivation(new Error(message));
          return false;
        }
        clearWatchdog();
        pendingRef.current = null;
        preparedTransitionRef.current = null;
        setDialog(null);
        restoreCountdown(pending);
        autoAdvanceIssuedRef.current = false;
        onPhaseChange("live");
        onErrorChange(message);
        return true;
      };

      pendingRef.current = pending;
      preparedTransitionRef.current = null;
      autoAdvanceIssuedRef.current = true;
      onSessionStartedAtChange(null);
      setDialog({ ...pending });
      onPhaseChange("switching");
      onErrorChange(null);
      if (document.pointerLockElement === stageMediaRef.current) {
        document.exitPointerLock();
      }
      armWatchdog(pending, () => {
        if (
          recoverPause(
            source === "automatic"
              ? "Reactor did not pause for the automatic door question in time."
              : "Reactor did not pause for the door question. Please try the door again.",
          )
        ) {
          void resume().catch(() => undefined);
        }
      });

      try {
        await Promise.race([
          releaseControls(),
          new Promise<void>((resolve) =>
            window.setTimeout(resolve, controlReleaseTimeoutMs),
          ),
        ]);
        if (!canContinue(pending, startedLifecycle)) return;
        await pause();
      } catch (cause) {
        if (
          recoverPause(
            `The scene could not pause for the door question: ${describeError(cause)}`,
          )
        ) {
          void resume().catch(() => undefined);
        }
      }
    },
    [
      abortActivation,
      armWatchdog,
      autoAdvanceIssuedRef,
      canContinue,
      canControl,
      controlReleaseTimeoutMs,
      elapsedSeconds,
      hasJourneyExit,
      hasPendingSceneTransition,
      onErrorChange,
      onPhaseChange,
      onSessionStartedAtChange,
      pause,
      question,
      releaseControls,
      restoreCountdown,
      resume,
      revealVideo,
      sceneHasTransition,
      sceneId,
      stageMediaRef,
      terminatingRef,
    ],
  );

  const choose = useCallback(
    async (choice: FashionMazeDoorChoice) => {
      const pending = pendingRef.current;
      const startedLifecycle = lifecycleRef.current;
      if (
        !pending ||
        pending.phase !== "choosing" ||
        !canContinue(pending, startedLifecycle)
      ) {
        return;
      }

      const returnToChoice = (message: string) => {
        if (!canContinue(pending, startedLifecycle)) return;
        clearWatchdog();
        preparedTransitionRef.current = null;
        pending.phase = "choosing";
        pending.selectedChoiceId = null;
        setDialog({ ...pending });
        onPhaseChange("paused");
        onErrorChange(message);
      };

      clearWatchdog();
      pending.phase = "preparing";
      pending.selectedChoiceId = choice.id;
      setDialog({ ...pending });
      onErrorChange(null);
      armWatchdog(pending, () => {
        returnToChoice(
          "The black door took too long to prepare. Choose again to retry.",
        );
      });

      try {
        const prepared = await prepareSceneTransition();
        if (
          !canContinue(pending, startedLifecycle) ||
          pending.phase !== "preparing" ||
          pending.selectedChoiceId !== choice.id
        ) {
          return;
        }
        if (!prepared) {
          throw new Error("The black door is not ready to continue.");
        }
        preparedTransitionRef.current = prepared;
        clearWatchdog();
        pending.phase = "resuming";
        setDialog({ ...pending });
        armWatchdog(pending, () => {
          if (pending.phase === "resuming") {
            abortActivation(
              new Error(
                "Reactor did not confirm the resumed door transition in time.",
              ),
            );
          }
        });
        await resume();
      } catch (cause) {
        returnToChoice(`The door could not continue: ${describeError(cause)}`);
      }
    },
    [
      abortActivation,
      armWatchdog,
      canContinue,
      clearWatchdog,
      onErrorChange,
      onPhaseChange,
      prepareSceneTransition,
      resume,
    ],
  );

  const handleCommandError = useCallback(
    (message: LingbotWorld2CommandErrorMessage): boolean => {
      const pending = pendingRef.current;
      const startedLifecycle = lifecycleRef.current;
      if (!pending || !canContinue(pending, startedLifecycle)) return false;

      clearWatchdog();
      preparedTransitionRef.current = null;
      if (pending.phase === "repausing") {
        abortActivation(
          new Error(
            `Reactor could not restore the paused door decision (${message.command}: ${message.reason}).`,
          ),
        );
        return true;
      }
      if (pending.phase === "pausing" && pending.source === "automatic") {
        abortActivation(
          new Error(
            `Automatic door question ${message.command}: ${message.reason}.`,
          ),
        );
        return true;
      }

      onErrorChange(
        `Door question ${message.command}: ${message.reason}. No answer was committed.`,
      );
      if (pending.phase === "pausing") {
        pendingRef.current = null;
        setDialog(null);
        restoreCountdown(pending);
        autoAdvanceIssuedRef.current = pending.source === "automatic";
        onPhaseChange("live");
        void resume().catch(() => undefined);
      } else {
        pending.phase = "choosing";
        pending.selectedChoiceId = null;
        setDialog({ ...pending });
        onPhaseChange("paused");
      }
      return true;
    },
    [
      abortActivation,
      autoAdvanceIssuedRef,
      clearWatchdog,
      onErrorChange,
      onPhaseChange,
      restoreCountdown,
      resume,
      canContinue,
    ],
  );

  const handleLastError = useCallback(
    (cause: unknown): boolean => {
      const pending = pendingRef.current;
      if (!pending || !canContinue(pending, lifecycleRef.current)) return false;
      onErrorChange(`Door question: ${describeError(cause)}`);
      return true;
    },
    [canContinue, onErrorChange],
  );

  const hasPending = useCallback(() => pendingRef.current !== null, []);
  const reset = useCallback(
    ({ clearAnswers = false }: { clearAnswers?: boolean } = {}) => {
      lifecycleRef.current += 1;
      clearWatchdog();
      pendingRef.current = null;
      preparedTransitionRef.current = null;
      if (mountedRef.current) {
        setDialog(null);
        if (clearAnswers) setAnswers([]);
      }
    },
    [clearWatchdog],
  );

  useEffect(() => {
    mountedRef.current = true;
    lifecycleRef.current += 1;
    return () => {
      mountedRef.current = false;
      lifecycleRef.current += 1;
      clearWatchdog();
      pendingRef.current = null;
      preparedTransitionRef.current = null;
    };
  }, [clearWatchdog]);

  return {
    dialog,
    answers,
    hasPending,
    request,
    choose,
    handlePauseSignal,
    reconcileAfterReconnect,
    handleCommandError,
    handleLastError,
    reset,
  };
}
