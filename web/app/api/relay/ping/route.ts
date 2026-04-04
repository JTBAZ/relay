import { NextResponse } from "next/server";

function relayApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_RELAY_API_URL ?? "").trim();
  const fallback = "http://127.0.0.1:8787";
  const trimmed = (raw.length > 0 ? raw : fallback).replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : fallback;
}

/** GET /api/relay/ping — check whether the Next server can reach the Relay API (open in browser when debugging ZIP). */
export async function GET(): Promise<Response> {
  const relay_api_base = relayApiBase();
  try {
    const r = await fetch(`${relay_api_base}/api/v1/health`, {
      method: "GET",
      cache: "no-store"
    });
    const text = await r.text();
    return NextResponse.json({
      relay_api_base,
      health_http_status: r.status,
      health_ok: r.ok,
      health_body_snippet: text.replace(/\s+/g, " ").trim().slice(0, 200)
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        relay_api_base,
        health_ok: false,
        error: message,
        hint: "Next.js could not open HTTP to Relay. Confirm API is running (npm run build && npm start) and URL matches web/.env.local."
      },
      { status: 200 }
    );
  }
}
