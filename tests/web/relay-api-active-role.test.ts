/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveRole } from "../../web/lib/relay-api";

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

describe("PE-I role-switcher API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("setActiveRole posts the role and returns the persisted state", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(envelope({ active_role: "creator", available_roles: ["creator", "supporter"] }))
    );
    const out = await setActiveRole("creator");
    expect(out).toEqual({ active_role: "creator", available_roles: ["creator", "supporter"] });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toMatch(/\/api\/v1\/me\/active-role$/);
    expect((init as RequestInit).method).toBe("POST");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent).toEqual({ role: "creator" });
  });

  it("propagates a 403 envelope when the requested role is not available to the account", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { error: { code: "FORBIDDEN", message: "Account cannot occupy role 'creator'." } },
        403
      )
    );
    await expect(setActiveRole("creator")).rejects.toThrow();
  });
});
