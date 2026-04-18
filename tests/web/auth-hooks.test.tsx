/** @vitest-environment happy-dom */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextNavigationMock } from "../mocks/next-navigation";
import type { StudioSessionValue } from "../../web/lib/studio-session-context";
import { useRequireLoggedIn } from "../../web/lib/use-require-logged-in";
import { useRequireLoggedOut } from "../../web/lib/use-require-logged-out";

const mockUseStudioSession = vi.fn<[], StudioSessionValue>();

vi.mock("../../web/lib/studio-session-context", () => ({
  useStudioSession: () => mockUseStudioSession()
}));

function baseSession(over: Partial<StudioSessionValue>): StudioSessionValue {
  return {
    ready: true,
    hasRelaySession: false,
    activeRole: null,
    storedRelayCreatorId: null,
    creatorId: "creator_1",
    ...over
  };
}

describe("useRequireLoggedIn", () => {
  beforeEach(() => {
    nextNavigationMock.replace.mockClear();
    mockUseStudioSession.mockReset();
    nextNavigationMock.pathname = "/gallery";
    nextNavigationMock.search = new URLSearchParams("foo=bar");
  });

  it("when ready=false: blocked=false, no redirect", () => {
    mockUseStudioSession.mockReturnValue(baseSession({ ready: false, hasRelaySession: false }));
    const { result } = renderHook(() => useRequireLoggedIn());
    expect(result.current.ready).toBe(false);
    expect(result.current.blocked).toBe(false);
    expect(nextNavigationMock.replace).not.toHaveBeenCalled();
  });

  it("when ready=true and hasRelaySession=true: blocked=false, no redirect", () => {
    mockUseStudioSession.mockReturnValue(baseSession({ ready: true, hasRelaySession: true }));
    const { result } = renderHook(() => useRequireLoggedIn());
    expect(result.current.blocked).toBe(false);
    expect(nextNavigationMock.replace).not.toHaveBeenCalled();
  });

  it("when ready=true and hasRelaySession=false: router.replace with returnTo = pathname + search", async () => {
    mockUseStudioSession.mockReturnValue(baseSession({ ready: true, hasRelaySession: false }));
    renderHook(() => useRequireLoggedIn());
    await waitFor(() => {
      expect(nextNavigationMock.replace).toHaveBeenCalledTimes(1);
    });
    const arg = nextNavigationMock.replace.mock.calls[0]![0] as string;
    expect(arg.startsWith("/login?returnTo=")).toBe(true);
    const encoded = arg.slice("/login?returnTo=".length);
    expect(decodeURIComponent(encoded)).toBe("/gallery?foo=bar");
  });
});

describe("useRequireLoggedOut", () => {
  beforeEach(() => {
    nextNavigationMock.replace.mockClear();
    mockUseStudioSession.mockReset();
    nextNavigationMock.pathname = "/login";
    nextNavigationMock.search = new URLSearchParams();
  });

  it("when ready=true and hasRelaySession=true and no returnTo: redirects to /", async () => {
    mockUseStudioSession.mockReturnValue(baseSession({ ready: true, hasRelaySession: true }));
    renderHook(() => useRequireLoggedOut());
    await waitFor(() => expect(nextNavigationMock.replace).toHaveBeenCalledWith("/"));
  });

  it("when returnTo=/designer: redirects to /designer", async () => {
    nextNavigationMock.search = new URLSearchParams("returnTo=%2Fdesigner");
    mockUseStudioSession.mockReturnValue(baseSession({ ready: true, hasRelaySession: true }));
    renderHook(() => useRequireLoggedOut());
    await waitFor(() => expect(nextNavigationMock.replace).toHaveBeenCalledWith("/designer"));
  });

  it("when returnTo=//evil.com: redirects to / (sanitized)", async () => {
    nextNavigationMock.search = new URLSearchParams("returnTo=%2F%2Fevil.com");
    mockUseStudioSession.mockReturnValue(baseSession({ ready: true, hasRelaySession: true }));
    renderHook(() => useRequireLoggedOut());
    await waitFor(() => expect(nextNavigationMock.replace).toHaveBeenCalledWith("/"));
  });
});
