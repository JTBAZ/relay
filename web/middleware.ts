import { NextResponse, type NextRequest } from "next/server";

/**
 * Tier 1.7 — Edge perimeter: cookie **presence** only (`relay_session`).
 * Token validation is API/RLS (T1-1). Keep in sync with docs/AUTH_GUARDRAILS_TIER_1.md § Stage F.
 *
 * `safeReturnTo` duplicates the rule in `web/lib/post-login-redirect.ts` (`resolvePostAuthPath`) —
 * middleware cannot import that module (it pulls browser-only helpers). Change both if the rule changes.
 */

/**
 * Logged-out users are redirected to /login?returnTo=…
 * Public marketing and legal routes stay out of this list (e.g. `/legal/*`).
 */
const APP_ROUTES: RegExp[] = [
  /^\/designer(\/|$)/,
  /^\/action-center(\/|$)/,
  /^\/collections(\/|$)/,
  /** All `/patron/*` except public creator profiles `/patron/c/[handle]`. */
  /^\/patron\/(?!c\/)/,
  /^\/dev\//,
  /^\/creator\/connect(\/|$)/,
  /^\/extension\/authorize(\/|$)/,
  /^\/settings\/connected-extensions(\/|$)/
];

/** Logged-in users are redirected away from marketing / auth entry (not onboarding — setup continues while signed in). */
const AUTH_ENTRY_ROUTES: RegExp[] = [/^\/login(\/|$)/, /^\/landing(\/|$)/];

/** Same logic as `resolvePostAuthPath` in `web/lib/post-login-redirect.ts`. */
function safeReturnTo(raw: string | null): string {
  const r = raw?.trim();
  if (!r) return "/";
  if (!r.startsWith("/")) return "/";
  if (r.startsWith("//")) return "/";
  return r;
}

function isAppRoute(path: string): boolean {
  return APP_ROUTES.some((re) => re.test(path));
}

/**
 * Narrow dev-only carve-out: `/patron/library?state=...` is the BO-P2-02 skeletal-UI
 * design fixture entry point. When the patron-feed dev tools flag is on, allow
 * unauthenticated viewing so designers/QA can inspect the gated states without a session.
 * Production builds never set this flag, so the route stays auth-gated.
 */
function isPatronLibraryDevFixture(path: string, search: URLSearchParams): boolean {
  if (path !== "/patron/library") return false;
  if (!search.has("state")) return false;
  const flag =
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase();
  return flag === "true";
}

/**
 * PE-E (BO-P2-04) — sibling carve-out for `/patron/feed?state=...`. Lets designers/QA review
 * the live-wired comment surface (mixed thread, empty, error, moderating, auto-mod-blocked)
 * without an authenticated session. Same flag-gated pattern as the library fixture.
 */
function isPatronFeedDevFixture(path: string, search: URLSearchParams): boolean {
  if (path !== "/patron/feed") return false;
  if (!search.has("state")) return false;
  const flag =
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase();
  return flag === "true";
}

/**
 * PE-F (BO-P3-02) — sibling carve-out for `/patron/discover?state=...`. Same flag-gated
 * pattern; lets design/QA review the Discover grid states (mixed / empty / error / searched)
 * without seeded backend rows.
 */
function isPatronDiscoverDevFixture(path: string, search: URLSearchParams): boolean {
  if (path !== "/patron/discover") return false;
  if (!search.has("state")) return false;
  const flag =
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase();
  return flag === "true";
}

/**
 * PE-G (BO-P3-04) — sibling carve-out for `/patron/notifications?state=...` and
 * `/patron/notifications/preferences?state=...`. Same flag-gated pattern; covers both the
 * inbox and the preferences settings page.
 */
function isPatronNotificationsDevFixture(path: string, search: URLSearchParams): boolean {
  if (path !== "/patron/notifications" && path !== "/patron/notifications/preferences") {
    return false;
  }
  if (!search.has("state")) return false;
  const flag =
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase();
  return flag === "true";
}

/**
 * PE-J (BO-P4-03) — sibling carve-out for `/patron/settings?state=...`. Same flag-gated
 * pattern; lets design / QA review the settings page states (mixed / empty / error /
 * pending-deletion) without seeded backend rows. Destructive actions in the dev preview
 * mutate the local fixture only.
 */
function isPatronSettingsDevFixture(path: string, search: URLSearchParams): boolean {
  if (path !== "/patron/settings") return false;
  if (!search.has("state")) return false;
  const flag =
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase();
  return flag === "true";
}

function isAuthEntryRoute(path: string): boolean {
  return AUTH_ENTRY_ROUTES.some((re) => re.test(path));
}

export function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname;

  if (
    path.startsWith("/api/") ||
    path.startsWith("/_next/") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const signedIn = Boolean(req.cookies.get("relay_session")?.value);

  /** Logged-out visitors to the marketing home or legacy landing should start at onboarding. */
  if (!signedIn && (path === "/" || path === "/landing")) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (
    !signedIn &&
    isAppRoute(path) &&
    !isPatronLibraryDevFixture(path, url.searchParams) &&
    !isPatronFeedDevFixture(path, url.searchParams) &&
    !isPatronDiscoverDevFixture(path, url.searchParams) &&
    !isPatronNotificationsDevFixture(path, url.searchParams) &&
    !isPatronSettingsDevFixture(path, url.searchParams)
  ) {
    const dest = new URL("/login", req.url);
    dest.searchParams.set("returnTo", path + url.search);
    return NextResponse.redirect(dest);
  }

  if (signedIn && isAuthEntryRoute(path)) {
    const target = safeReturnTo(url.searchParams.get("returnTo"));
    const dest = new URL(target, req.url);
    return NextResponse.redirect(dest);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)"
  ]
};
