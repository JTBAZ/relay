import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

function makeReq(
  path: string,
  opts: { signedIn?: boolean; search?: string; activeRole?: "creator" | "supporter" } = {}
) {
  const url = `http://test.local${path}${opts.search ?? ""}`;
  const headers = new Headers();
  if (opts.signedIn) {
    const parts = ["relay_session=tok_test"];
    if (opts.activeRole) {
      parts.push(`relay_active_role=${opts.activeRole}`);
    }
    headers.set("cookie", parts.join("; "));
  }
  return new NextRequest(url, { headers });
}

describe("middleware", () => {
  it.each([
    ["/designer", "/studio/designer"],
    ["/designer/profile", "/studio/designer/profile"],
    ["/analytics", "/studio/analytics"],
    ["/action-center", "/studio/actions"],
    ["/new-post", "/studio/new-post"],
    ["/manual-import", "/studio/import"],
    ["/visitor", "/studio/preview"],
    ["/visitor/favorites", "/studio/preview/favorites"],
    ["/patron", "/feed"],
    ["/patron/feed", "/feed"],
    ["/patron/feed/post/creator-1/post-1", "/feed/post/creator-1/post-1"],
    ["/patron/discover", "/discover"],
    ["/patron/library", "/library"],
    ["/patron/notifications/preferences", "/notifications/preferences"],
    ["/patron/settings", "/settings"],
    ["/patron/profile", "/profile"],
    ["/patron/collections/abc", "/collections/abc"],
    ["/patron/c/dev-ava", "/dev-ava"],
    ["/p/patron_dev_riley", "/u/patron_dev_riley"],
    ["/patreon/patron/connect", "/connect/patreon/patron/connect"],
    ["/subscribestar/creator/connect", "/connect/subscribestar/creator/connect"],
    ["/creator/connect", "/connect/creator"]
  ])("redirects legacy route %s to %s", (from, to) => {
    const res = middleware(makeReq(from, { search: "?next=1" }));
    expect(res.status).toBe(307);
    const dest = new URL(res.headers.get("location")!);
    expect(dest.pathname).toBe(to);
    expect(dest.search).toBe("?next=1");
  });

  it("redirects unauthenticated user from /studio/designer to /login?returnTo=", () => {
    const res = middleware(makeReq("/studio/designer"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/login");
    expect(loc).toContain("returnTo=");
    expect(loc).toContain(encodeURIComponent("/studio/designer"));
  });

  it("redirects authenticated creator from /login to /studio", () => {
    const res = middleware(makeReq("/login", { signedIn: true, activeRole: "creator" }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/studio");
  });

  it("redirects authenticated supporter from /login to /feed", () => {
    const res = middleware(makeReq("/login", { signedIn: true, activeRole: "supporter" }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/feed");
  });

  it("allows signed-in access to /login/pilot-ux (dev account switcher)", () => {
    expect(middleware(makeReq("/login/pilot-ux", { signedIn: true })).status).not.toBe(307);
  });

  it("honors returnTo on /login when signed in (same-origin)", () => {
    const res = middleware(makeReq("/login", { signedIn: true, search: "?returnTo=%2Fstudio%2Fdesigner" }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/studio/designer");
  });

  it("rejects //evil.com returnTo and falls back to role-aware home", () => {
    const res = middleware(makeReq("/login", { signedIn: true, search: "?returnTo=%2F%2Fevil.com" }));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).not.toContain("evil.com");
    expect(new URL(loc).pathname).toBe("/feed");
  });

  it("redirects unauthenticated user from / and /landing to /onboarding", () => {
    const home = middleware(makeReq("/"));
    expect(home.status).toBe(307);
    expect(new URL(home.headers.get("location")!).pathname).toBe("/onboarding");
    const landing = middleware(makeReq("/landing"));
    expect(landing.status).toBe(307);
    expect(new URL(landing.headers.get("location")!).pathname).toBe("/onboarding");
  });

  it("redirects signed-in user on / to role-aware home", () => {
    const creator = middleware(makeReq("/", { signedIn: true, activeRole: "creator" }));
    expect(creator.status).toBe(307);
    expect(new URL(creator.headers.get("location")!).pathname).toBe("/studio");
    const supporter = middleware(makeReq("/", { signedIn: true, activeRole: "supporter" }));
    expect(supporter.status).toBe(307);
    expect(new URL(supporter.headers.get("location")!).pathname).toBe("/feed");
  });

  it("does not redirect on /somehandle (public profile)", () => {
    expect(middleware(makeReq("/anya")).status).not.toBe(307);
  });

  it("does not redirect on /auth/confirm in either state", () => {
    expect(middleware(makeReq("/auth/confirm")).status).not.toBe(307);
    expect(middleware(makeReq("/auth/confirm", { signedIn: true })).status).not.toBe(307);
  });

  it("does not redirect /studio/preview routes (public)", () => {
    expect(middleware(makeReq("/studio/preview")).status).not.toBe(307);
    expect(middleware(makeReq("/studio/preview/favorites")).status).not.toBe(307);
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
