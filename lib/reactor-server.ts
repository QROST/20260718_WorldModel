// Authored by QROST, 2026.
// Provenance: https://github.com/QROST/20260718_WorldModel

import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

const LOCAL_KEY_FILE = "reactor.key";

function normalizeKey(value: string): string {
  const trimmed = value.trim();
  const envAssignment = trimmed.match(/^REACTOR_API_KEY\s*=\s*(.+)$/);
  return (envAssignment?.[1] ?? trimmed).trim().replace(/^['"]|['"]$/g, "");
}

/**
 * Resolve the Reactor API key on the server only.
 *
 * Production should use REACTOR_API_KEY. For this local hackathon workspace we
 * also accept ./reactor.key, which is chmod 600 and gitignored. The key is never
 * serialized into a Server Component or sent to the browser.
 */
export function getReactorApiKey(): string | null {
  const fromEnvironment = process.env.REACTOR_API_KEY;
  if (fromEnvironment?.trim()) {
    return normalizeKey(fromEnvironment);
  }

  try {
    const fromFile = readFileSync(path.join(process.cwd(), LOCAL_KEY_FILE), "utf8");
    const key = normalizeKey(fromFile);
    return key || null;
  } catch {
    return null;
  }
}

export function hasReactorApiKey(): boolean {
  return getReactorApiKey() !== null;
}
