import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

const LOCAL_KEY_FILE = "openai.key";

function normalizeKey(value: string): string {
  const trimmed = value.trim();
  const envAssignment = trimmed.match(/^OPENAI_API_KEY\s*=\s*([\s\S]+)$/);
  return (envAssignment?.[1] ?? trimmed).trim().replace(/^['"]|['"]$/g, "");
}

/** Resolve the private OpenAI key without serializing it into client props. */
export function getOpenAIApiKey(): string | null {
  const fromEnvironment = process.env.OPENAI_API_KEY;
  if (fromEnvironment?.trim()) return normalizeKey(fromEnvironment);

  try {
    const fromFile = readFileSync(
      path.join(process.cwd(), LOCAL_KEY_FILE),
      "utf8",
    );
    const key = normalizeKey(fromFile);
    return key || null;
  } catch {
    return null;
  }
}

export function hasOpenAIApiKey(): boolean {
  return getOpenAIApiKey() !== null;
}
