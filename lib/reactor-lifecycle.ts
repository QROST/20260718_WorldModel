// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

import type { ReactorStatus } from "@reactor-team/js-sdk";

export interface ReactorStartGate {
  terminating: boolean;
  pendingStart: boolean;
  startIssued: boolean;
  hasImage: boolean;
  hasPrompt: boolean;
}

export interface PendingMazeStageContext {
  status: ReactorStatus;
  hasPendingMaze: boolean;
  stagingIssued: boolean;
  terminating: boolean;
}

export type PendingMazeStagePlan =
  | { action: "wait"; emitStageGate: false }
  | { action: "stage"; emitStageGate: true };

export type ReactorFrameProbeRecoveryReason =
  | "watchdog"
  | "stream-unavailable"
  | "cleanup";

export interface ReactorFrameProbeRecoveryPlan {
  cancelPending: true;
  resetVisibleFrames: boolean;
  scheduleRetry: boolean;
  markVideoNotReady: boolean;
}

export type ReactorDisconnectAction =
  | "ignore"
  | "reset"
  | "reconnect"
  | "reconnect-failed";

export interface ReactorDisconnectContext {
  previousStatus: ReactorStatus;
  status: ReactorStatus;
  intentional: boolean;
  sessionId?: string;
  reconnectingSessionId: string | null;
  failedReconnectSessionId: string | null;
}

/** Ignore the initial disconnected snapshot and reset only after a real edge. */
export function isReactorDisconnectEdge(
  previousStatus: ReactorStatus,
  status: ReactorStatus,
): boolean {
  return previousStatus !== "disconnected" && status === "disconnected";
}

/**
 * Preserve a recoverable SDK session long enough to reconnect it. Intentional
 * disconnects still reset immediately, while a second edge for the same
 * reconnect attempt is treated as a failed recovery instead of an endless
 * reconnect loop.
 */
export function classifyReactorDisconnect({
  previousStatus,
  status,
  intentional,
  sessionId,
  reconnectingSessionId,
  failedReconnectSessionId,
}: ReactorDisconnectContext): ReactorDisconnectAction {
  if (!isReactorDisconnectEdge(previousStatus, status)) return "ignore";
  if (intentional) return "reset";
  if (!sessionId) return "reset";
  return reconnectingSessionId === sessionId ||
    failedReconnectSessionId === sessionId
    ? "reconnect-failed"
    : "reconnect";
}

export function planPendingMazeStage({
  status,
  hasPendingMaze,
  stagingIssued,
  terminating,
}: PendingMazeStageContext): PendingMazeStagePlan {
  return status === "ready" &&
    hasPendingMaze &&
    !stagingIssued &&
    !terminating
    ? { action: "stage", emitStageGate: true }
    : { action: "wait", emitStageGate: false };
}

export function planFrameProbeRecovery(
  reason: ReactorFrameProbeRecoveryReason,
): ReactorFrameProbeRecoveryPlan {
  return {
    cancelPending: true,
    resetVisibleFrames: reason !== "cleanup",
    scheduleRetry: reason === "watchdog",
    markVideoNotReady: reason === "stream-unavailable",
  };
}

export function shouldConfirmReactorReconnect(
  status: ReactorStatus,
  reconnectingSessionId: string | null,
): reconnectingSessionId is string {
  return status === "ready" && Boolean(reconnectingSessionId);
}

export function isReactorSessionActive(
  status: ReactorStatus,
  sessionId: string | undefined,
): boolean {
  return status !== "disconnected" || Boolean(sessionId);
}

export function canIssueGenerationStart(gate: ReactorStartGate): boolean {
  return (
    !gate.terminating &&
    gate.pendingStart &&
    !gate.startIssued &&
    gate.hasImage &&
    gate.hasPrompt
  );
}

/** Best-effort redaction before lifecycle diagnostics leave the browser. */
export function sanitizeReactorDebugText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[redacted-jwt]",
    )
    .replace(
      /\b(?:sk|rk|reactor)[-_][A-Za-z0-9_-]{12,}\b/gi,
      "[redacted-key]",
    )
    .replace(
      /(\b(?:openai_api_key|reactor_api_key|api[_ -]?key|access[_ -]?token|authorization|credential|signature)\b\s*["']?\s*[:=]\s*["']?)[^"'\s,;}&]+/gi,
      "$1[redacted]",
    )
    .replace(
      /([?&](?:token|key|signature|credential|authorization)=)[^&\s]+/gi,
      "$1[redacted]",
    )
    .replace(/blob:[^\s"'<>]+/gi, "[redacted-blob]")
    .replace(
      /\/(?:Users|home|private|var\/folders)\/[^\s"'`<>]+/g,
      "[redacted-local-path]",
    )
    .replace(
      /\b[A-Za-z]:\\(?:[^\\\s"'`<>]+\\)*[^\\\s"'`<>]*/g,
      "[redacted-local-path]",
    )
    .slice(0, 600);
}
