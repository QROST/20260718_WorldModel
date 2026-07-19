import type { ReactorStatus } from "@reactor-team/js-sdk";

export interface ReactorStartGate {
  terminating: boolean;
  pendingStart: boolean;
  startIssued: boolean;
  hasImage: boolean;
  hasPrompt: boolean;
}

/** Ignore the initial disconnected snapshot and reset only after a real edge. */
export function isReactorDisconnectEdge(
  previousStatus: ReactorStatus,
  status: ReactorStatus,
): boolean {
  return previousStatus !== "disconnected" && status === "disconnected";
}

export function canStagePendingMaze(
  status: ReactorStatus,
  hasPendingMaze: boolean,
  stagingIssued: boolean,
): boolean {
  return status === "ready" && hasPendingMaze && !stagingIssued;
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
