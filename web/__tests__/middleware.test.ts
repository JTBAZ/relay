import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

function makeReq(path: string, opts: { signedIn?: boolean; search?: string } = {}) {
  const url = `http://test.local${path}${opts.search ?? ""}`;
  const headers = new Headers();
  if (opts.signedIn) {
    headers.set("cookie", "relay_session=tok_test");
  }
  return new NextRequest(url, { headers });
}

describe("middleware", () => {
  it("redirects unauthenticated user from /designer to /login?returnTo=", () => {
    const res = middleware(makeReq("/designer"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/login");
    expect(loc).toContain("returnTo=");
    expect(loc).toContain(encodeURIComponent("/designer"));
  });

  it("redirects authenticated user from /login to /", () => {
    const res = middleware(makeReq("/login", { signedIn: true }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("honors returnTo on /login when signed in (same-origin)", () => {
    const res = middleware(makeReq("/login", { signedIn: true, search: "?returnTo=%2Fdesigner" }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/designer");
  });

  it("rejects //evil.com returnTo and falls back to /", () => {
    const res = middleware(makeReq("/login", { signedIn: true, search: "?returnTo=%2F%2Fevil.com" }));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).not.toContain("evil.com");
    expect(new URL(loc).pathname).toBe("/");
  });

  it("does not redirect on / (public)", () => {
    expect(middleware(makeReq("/")).status).not.toBe(307);
    expect(middleware(makeReq("/", { signedIn: true })).status).not.toBe(307);
  });

  it("does not redirect on /patron/c/somehandle (public profile)", () => {
    expect(middleware(makeReq("/patron/c/anya")).status).not.toBe(307);
  });

  it("does not redirect on /auth/confirm in either state", () => {
    expect(middleware(makeReq("/auth/confirm")).status).not.toBe(307);
    expect(middleware(makeReq("/auth/confirm", { signedIn: true })).status).not.toBe(307);
  });

  it("does not redirect /visitor routes (public)", () => {
    expect(middleware(makeReq("/visitor")).status).not.toBe(307);
    expect(middleware(makeReq("/visitor/favorites")).status).not.toBe(307);
  });

  it("does not invoke redirect for /api when middleware is called directly", () => {
    const res = middleware(makeReq("/api/v1/health"));
    expect(res.status).not.toBe(307);
  });

  it("redirects unauthenticated user from /extension/authorize with returnTo preserving query", () => {
    const res = middleware(
      makeReq("/extension/authorize", {
        search: "?ext_id=a&installation_id=b"
      })
    );
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/login");
    expect(loc).toContain(encodeURIComponent("/extension/authorize?ext_id=a&installation_id=b"));
  });

  it("redirects unauthenticated user from /settings/connected-extensions to /login?returnTo=", () => {
    const res = middleware(makeReq("/settings/connected-extensions"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/login");
    expect(loc).toContain(encodeURIComponent("/settings/connected-extensions"));
  });
});
