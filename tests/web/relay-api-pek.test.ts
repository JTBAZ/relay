/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPublicPatronProfileByHandle,
  type PublicPatronProfile
} from "../../web/lib/relay-api";

const performRelayLogout = vi.fn().mockResolvedValue(undefined);
vi.mock("../../web/lib/relay-session-logout.ts", () => ({
  performRelayLogout: (...args: unknown[]) => performRelayLogout(...args)
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function envelope<T>(data: T) {
  return { data, meta: { trace_id: "trace-test" } };
}

const SAMPLE: PublicPatronProfile = {
  handle: "alice",
  display_name: "Alice",
  bio: "Lover of analog photography.",
  avatar_url: null,
  banner_url: null,
  public_collections: []
};

describe("PE-K Rest public patron profile API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the profile shape on a 200 envelope", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(envelope(SAMPLE)));
    const out = await fetchPublicPatronProfileByHandle("alice");
    expect(out).toEqual(SAMPLE);
    const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
    expect(url).toContain("/api/v1/public/patrons/alice");
  });

  it("URL-encodes the handle path segment", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(envelope(SAMPLE)));
    await fetchPublicPatronProfileByHandle("with space");
    const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
    expect(url).toContain("/api/v1/public/patrons/with%20space");
  });

  it("returns null on a 404 (lets pages call notFound() instead of throwing)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { error: { code: "NOT_FOUND", message: "Profile not found." } },
        404
      )
    );
    const out = await fetchPublicPatronProfileByHandle("ghost");
    expect(out).toBeNull();
  });

  it("propagates non-404 errors so the page can surface a real error state", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { error: { code: "INTERNAL_ERROR", message: "boom" } },
        500
      )
    );
    await expect(fetchPublicPatronProfileByHandle("alice")).rejects.toThrow();
  });
});
