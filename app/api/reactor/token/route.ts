import { NextResponse } from "next/server";
import { getReactorApiKey } from "@/lib/reactor-server";

// The product enforces a five-minute session cap, so ten minutes covers queue,
// generation, and clip download without issuing an unnecessarily long JWT.
const TOKEN_LIFETIME_SECONDS = 10 * 60;

/** Exchange the private Reactor API key for a short-lived browser JWT. */
export async function POST() {
  const apiKey = getReactorApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "REACTOR_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const baseUrl =
    process.env.REACTOR_API_BASE_URL || "https://api.reactor.inc";

  try {
    const upstream = await fetch(`${baseUrl}/tokens`, {
      method: "POST",
      headers: {
        "Reactor-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: TOKEN_LIFETIME_SECONDS }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Reactor token request failed (${upstream.status})` },
        { status: 502 },
      );
    }

    const { jwt, expires_at } = (await upstream.json()) as {
      jwt?: string;
      expires_at?: number;
    };
    if (!jwt) {
      return NextResponse.json(
        { error: "Reactor returned an invalid token response" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { jwt, expires_at },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not reach Reactor" },
      { status: 502 },
    );
  }
}
