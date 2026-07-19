import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  GRAND_PALAIS_IMAGE_MODEL,
  GRAND_PALAIS_IMAGE_PROMPT,
} from "@/lib/grand-palais";
import { fashionMazes } from "@/lib/fashion-maze";
import {
  resolveGrandPalaisReferences,
  type ResolvedGrandPalaisReference,
} from "@/lib/grand-palais-references";
import { getOpenAIApiKey } from "@/lib/openai-server";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_REFERENCE_BYTES = 40 * 1024 * 1024;
const OPENAI_TIMEOUT_MS = 150_000;
const MIN_GENERATION_INTERVAL_MS = 30_000;

// Local/process guard for accidental double-clicks and duplicate transitions.
// Public deployments still need operator authentication and distributed limits.
let generationInFlight = false;
let lastGenerationStartedAt = 0;

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string }>;
}

function jsonError(
  error: string,
  status: number,
  headers: Record<string, string> = {},
) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "private, no-store", ...headers },
    },
  );
}

function mimeTypeFor(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".png":
      return "image/png";
    default:
      throw new Error("A finale reference uses an unsupported image type.");
  }
}

async function resolveReferenceFiles(
  selections: ResolvedGrandPalaisReference[],
) {
  const publicRoot = await realpath(path.join(process.cwd(), "public"));
  let totalBytes = 0;

  return Promise.all(
    selections.map(async (selection, index) => {
      if (!selection.seedImage.startsWith("/")) {
        throw new Error("A finale reference is not a local public asset.");
      }

      const unresolvedPath = path.resolve(
        publicRoot,
        selection.seedImage.slice(1),
      );
      const filePath = await realpath(unresolvedPath);
      if (
        filePath !== publicRoot &&
        !filePath.startsWith(`${publicRoot}${path.sep}`)
      ) {
        throw new Error("A finale reference escaped the public asset root.");
      }

      const metadata = await stat(filePath);
      if (!metadata.isFile() || metadata.size > MAX_REFERENCE_BYTES) {
        throw new Error("A finale reference is missing or too large.");
      }
      totalBytes += metadata.size;
      if (totalBytes > MAX_TOTAL_REFERENCE_BYTES) {
        throw new Error("The finale references exceed the upload budget.");
      }

      return {
        filePath,
        filename: `${String(index + 1).padStart(2, "0")}-${path.basename(filePath)}`,
        mimeType: mimeTypeFor(filePath),
      };
    }),
  );
}

export async function POST(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin !== new URL(request.url).origin) {
    return jsonError("Cross-origin generation is not allowed.", 403);
  }

  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return jsonError("OPENAI_API_KEY is not configured.", 503);
  }

  let references: ResolvedGrandPalaisReference[];
  try {
    references = resolveGrandPalaisReferences(await request.json());
  } catch {
    return jsonError(
      `Choose one valid image from each of the ${fashionMazes.length} authored scenes.`,
      400,
    );
  }

  const now = Date.now();
  if (generationInFlight) {
    return jsonError("A finale generation is already in progress.", 409);
  }
  const retryAfterMs =
    MIN_GENERATION_INTERVAL_MS - (now - lastGenerationStartedAt);
  if (retryAfterMs > 0) {
    return jsonError(
      "Please wait briefly before starting another finale generation.",
      429,
      { "Retry-After": String(Math.ceil(retryAfterMs / 1_000)) },
    );
  }
  generationInFlight = true;
  lastGenerationStartedAt = now;

  try {
    const referenceFiles = await resolveReferenceFiles(references);
    const form = new FormData();
    form.append("model", GRAND_PALAIS_IMAGE_MODEL);
    form.append("prompt", GRAND_PALAIS_IMAGE_PROMPT);
    form.append("size", "2048x1152");
    form.append("quality", "medium");
    form.append("output_format", "jpeg");

    for (const reference of referenceFiles) {
      const bytes = await readFile(reference.filePath);
      form.append(
        "image[]",
        new Blob([new Uint8Array(bytes)], { type: reference.mimeType }),
        reference.filename,
      );
    }

    const upstream = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      return jsonError(
        upstream.status === 429
          ? "The finale atelier is busy. Please try again shortly."
          : `The finale image could not be generated (${upstream.status}).`,
        upstream.status === 429 ? 503 : 502,
      );
    }

    const payload = (await upstream.json()) as OpenAIImageResponse;
    const base64Image = payload.data?.[0]?.b64_json;
    if (!base64Image) {
      return jsonError("OpenAI returned no finale image.", 502);
    }
    const image = Buffer.from(base64Image, "base64");
    if (image.length === 0) {
      return jsonError("OpenAI returned an empty finale image.", 502);
    }

    return new Response(image, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(image.length),
        "Cache-Control": "private, no-store",
        "X-Image-Model": GRAND_PALAIS_IMAGE_MODEL,
      },
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    return jsonError(
      timedOut
        ? "The Grand Palais took too long to form. Please try again."
        : "The finale references could not be prepared.",
      timedOut ? 504 : 500,
    );
  } finally {
    generationInFlight = false;
  }
}
