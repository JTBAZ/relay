/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  relayFetch,
  relayRequest,
  RELAY_API_BASE,
  RelayForbiddenError,
  RelayServerError,
  RelayUnauthorizedError
} from "../../web/lib/relay-api";
import { fetchRealLibrarySelectionCatalog, reviewRealLibrarySchedule, updateRealLibrarySelection, RealLibrarySelectionApiError } from "../../web/lib/editor-bench";

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
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${RELAY_API_BASE}/api/v1/export/library-zip?x=1`);
  });

  it("keeps same-origin Next requests and raw JSON separate from Relay envelopes", async () => {
    const signal = new AbortController().signal;
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: '{"mode":"curation"}', signal };
    const response = new Response('{"cards":[]}', { status: 200 });
    vi.mocked(fetch).mockResolvedValue(response);
    const result = await relayRequest("/api/editor-bench", init, "same-origin");
    expect(fetch).toHaveBeenCalledWith("/api/editor-bench", init);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toBe(init);
    expect(result).toBe(response);
    expect(await result.json()).toEqual({ cards: [] });
  });

  it.each([401, 403, 500])("leaves same-origin HTTP %i errors to the local caller", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"error":"local_failure"}', { status }));
    const response = await relayRequest("/api/editor-bench", undefined, "same-origin");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "local_failure" });
    expect(performRelayLogout).not.toHaveBeenCalled();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("preserves same-origin cancellation and rejects nonlocal API paths", async () => {
    const controller = new AbortController();
    const aborted = new DOMException("Aborted", "AbortError");
    controller.abort();
    vi.mocked(fetch).mockRejectedValue(aborted);
    await expect(relayRequest("/api/editor-bench", { signal: controller.signal }, "same-origin")).rejects.toBe(aborted);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    vi.mocked(fetch).mockClear();
    for (const path of ["https://other.invalid/api/bench", "//other.invalid/api/bench", "api/bench"]) {
      await expect(relayRequest(path, undefined, "same-origin")).rejects.toThrow(TypeError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps Library selection and scheduling on their Next routes with local errors", async () => {
    const signal = new AbortController().signal;
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"scope":"real_library"}'));
    await expect(fetchRealLibrarySelectionCatalog(signal)).resolves.toEqual({ scope: "real_library" });
    expect(fetch).toHaveBeenLastCalledWith("/api/editor-bench/library-selection", { method: "GET", signal, cache: "no-store" });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"error":"stale_library_selection","message":"Reload Library."}', { status: 409 }));
    await expect(updateRealLibrarySelection({ kind: "reset", catalogRevision: "revision-1" }, signal)).rejects.toMatchObject({
      constructor: RealLibrarySelectionApiError, status: 409, code: "stale_library_selection", message: "Reload Library."
    });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"kind":"clarification","question":"Which time?"}'));
    const input = { latestRequest: "Schedule this", postId: "post-1", mediaIds: ["media-1"] };
    await expect(reviewRealLibrarySchedule(input, signal)).resolves.toEqual({ kind: "clarification", question: "Which time?" });
    expect(fetch).toHaveBeenLastCalledWith("/api/editor-bench/library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal });
  });
});
