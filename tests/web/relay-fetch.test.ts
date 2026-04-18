/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  relayFetch,
  relayRequest,
  RelayForbiddenError,
  RelayServerError,
  RelayUnauthorizedError
} from "../../web/lib/relay-api";

const performRelayLogout = vi.fn().mockResolvedValue(undefined);

vi.mock("../../web/lib/relay-session-logout.ts", () => ({
  performRelayLogout: (...args: unknown[]) => performRelayLogout(...args)
}));

describe("relayFetch / relayRequest", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    performRelayLogout.mockClear();
    window.location.assign = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns data on 200", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { hello: "world" },
          meta: { trace_id: "t1" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const data = await relayFetch<{ hello: string }>("/api/v1/me/session");
    expect(data).toEqual({ hello: "world" });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.credentials).toBe("include");
  });

  it("throws RelayUnauthorizedError and calls performRelayLogout on 401", async () => {
    window.history.pushState({}, "", "/gallery");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "nope" } }), {
        status: 401,
        headers: { "content-type": "application/json" }
      })
    );
    await expect(relayFetch("/api/v1/foo")).rejects.toThrow(RelayUnauthorizedError);
    expect(performRelayLogout).toHaveBeenCalled();
    expect(window.location.assign).toHaveBeenCalledWith(
      expect.stringMatching(/\/login\?reason=expired&returnTo=/)
    );
    const call = (window.location.assign as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(call).toContain(encodeURIComponent("/gallery"));
  });

  it("on 401 when already on /login, does not redirect", async () => {
    window.history.pushState({}, "", "/login");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "nope" } }), {
        status: 401,
        headers: { "content-type": "application/json" }
      })
    );
    await expect(relayFetch("/api/v1/foo")).rejects.toThrow(RelayUnauthorizedError);
    expect(performRelayLogout).toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("throws RelayForbiddenError with code on 403", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "FORBIDDEN",
            message: "no access",
            trace_id: "x"
          }
        }),
        { status: 403, headers: { "content-type": "application/json" } }
      )
    );
    try {
      await relayFetch("/api/v1/foo");
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(RelayForbiddenError);
      expect((e as RelayForbiddenError).code).toBe("FORBIDDEN");
      expect((e as Error).message).toBe("no access");
    }
  });

  it("throws RelayServerError on 500", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "INTERNAL_ERROR", message: "boom", trace_id: "z" }
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      )
    );
    try {
      await relayFetch("/api/v1/foo");
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(RelayServerError);
      const se = e as RelayServerError;
      expect(se.status).toBe(500);
      expect(se.message).toBe("boom");
      expect(se.code).toBe("INTERNAL_ERROR");
    }
  });

  it("relayRequest sends credentials include", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));
    await relayRequest("/api/v1/export/library-zip?x=1", { method: "HEAD" });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.credentials).toBe("include");
  });
});
