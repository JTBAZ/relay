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
 * Public marketing and legal routes stay out of this list (e.g. `/legal/*`, `/[handle]`, `/u/[handle]`).
 */
const APP_ROUTES: RegExp[] = [
  /^\/studio$/,
  /^\/studio\/designer(\/|$)/,
  /^\/studio\/analytics(\/|$)/,
  /^\/studio\/actions(\/|$)/,
  /^\/studio\/new-post(\/|$)/,
  /^\/studio\/autopost(\/|$)/,
  /^\/studio\/import(\/|$)/,
  /^\/studio\/moderation(\/|$)/,
  /^\/feed(\/|$)/,
  /^\/discover(\/|$)/,
  /^\/library(\/|$)/,
  /^\/notifications(\/|$)/,
  /^\/settings(\/|$)/,
  /^\/profile(\/|$)/,
  /^\/collections(\/|$)/,
  /^\/commission-hub(\/|$)/,
  /^\/former-subscriptions(\/|$)/,
  /^\/dev\//,
  /^\/connect\/creator(\/|$)/,
  /^\/extension\/authorize(\/|$)/,
  /^\/settings\/connected-extensions(\/|$)/
];

/** Logged-in users are redirected away from marketing / auth entry (not onboarding — setup continues while signed in). */
const AUTH_ENTRY_ROUTES: RegExp[] = [/^\/login(\/|$)/, /^\/landing(\/|$)/];

type ActiveRole = "creator" | "supporter";

/** Same path rules as `resolvePostAuthPath` in `web/lib/post-login-redirect.ts`. */
function safeReturnTo(raw: string | null, fallback = "/"): string {
  const r = raw?.trim();
  if (!r) return fallback;
  if (!r.startsWith("/")) return fallback;
  if (r.startsWith("//")) return fallback;
  return r;
}

function readActiveRoleFromRequest(req: NextRequest): ActiveRole | null {
  const raw = req.cookies.get("relay_active_role")?.value?.trim();
  return raw === "creator" || raw === "supporter" ? raw : null;
}

/** Role-aware default when a signed-in user hits an auth entry route without returnTo. */
function defaultSignedInLanding(req: NextRequest): string {
  return readActiveRoleFromRequest(req) === "creator" ? "/studio" : "/feed";
}

/** PUX-001 — dev account switcher must stay reachable while signed in. */
function isPilotUxDevLoginRoute(path: string): boolean {
  return path === "/login/pilot-ux";
}

function isAppRoute(path: string): boolean {
  return APP_ROUTES.some((re) => re.test(path));
}

function devToolsEnabled(): boolean {
  return (
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "").toString().toLowerCase() ===
    "true"
  );
}

function isDevFixture(path: string, expected: string, search: URLSearchParams): boolean {
  if (path !== expected) return false;
  if (!search.has("state")) return false;
  return devToolsEnabled();
}

function isPatronLibraryDevFixture(path: string, search: URLSearchParams): boolean {
  return isDevFixture(path, "/library", search);
}

function isPatronFeedDevFixture(path: string, search: URLSearchParams): boolean {
  return isDevFixture(path, "/feed", search);
}

function isPatronDiscoverDevFixture(path: string, search: URLSearchParams): boolean {
  return isDevFixture(path, "/discover", search);
}

function isPatronNotificationsDevFixture(path: string, search: URLSearchParams): boolean {
  return (
    isDevFixture(path, "/notifications", search) ||
    isDevFixture(path, "/notifications/preferences", search)
  );
}

function isPatronSettingsDevFixture(path: string, search: URLSearchParams): boolean {
  return isDevFixture(path, "/settings", search);
}

/** Patron profile layout draft at `/dev/patron-profile` — inspectable from pilot UX dev login. */
function isPatronProfileDevDraft(path: string): boolean {
  if (path !== "/dev/patron-profile" && !path.startsWith("/dev/patron-profile/")) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return (
    (process.env.NEXT_PUBLIC_RELAY_PILOT_UX_DEV_LOGIN ?? "").trim().toLowerCase() === "true"
  );
}

function isAuthEntryRoute(path: string): boolean {
  return AUTH_ENTRY_ROUTES.some((re) => re.test(path));
}

function redirectPreservingQuery(req: NextRequest, pathname: string): NextResponse {
  const dest = new URL(req.url);
  dest.pathname = pathname;
  return NextResponse.redirect(dest);
}

function legacyRedirectPath(path: string): string | null {
  if (path === "/patron") return "/feed";
  if (path === "/designer" || path.startsWith("/designer/")) {
    return `/studio${path}`;
  }
  if (path === "/analytics" || path.startsWith("/analytics/")) {
    return `/studio${path}`;
  }
  if (path === "/action-center" || path.startsWith("/action-center/")) {
    return path.replace(/^\/action-center/, "/studio/actions");
  }
  if (path === "/new-post" || path.startsWith("/new-post/")) {
    return `/studio${path}`;
  }
  if (path === "/manual-import" || path.startsWith("/manual-import/")) {
    return path.replace(/^\/manual-import/, "/studio/import");
  }
  if (path === "/visitor" || path.startsWith("/visitor/")) {
    return path.replace(/^\/visitor/, "/studio/preview");
  }
  if (path === "/creator/connect" || path.startsWith("/creator/connect/")) {
    return path.replace(/^\/creator\/connect/, "/connect/creator");
  }
  if (path === "/patreon" || path.startsWith("/patreon/")) {
    return path.replace(/^\/patreon/, "/connect/patreon");
  }
  if (path === "/subscribestar/creator" || path.startsWith("/subscribestar/creator/")) {
    return path.replace(/^\/subscribestar\/creator/, "/connect/subscribestar/creator");
  }
  if (path === "/p" || path.startsWith("/p/")) {
    return path === "/p" ? "/u" : path.replace(/^\/p/, "/u");
  }
  if (path === "/patron/c" || path.startsWith("/patron/c/")) {
    return path === "/patron/c" ? "/" : path.replace(/^\/patron\/c/, "");
  }
  if (path === "/patron/onboarding" || path.startsWith("/patron/onboarding/")) {
    return path.replace(/^\/patron\/onboarding/, "/onboarding/patron");
  }
  if (path === "/patron/collections" || path.startsWith("/patron/collections/")) {
    return path.replace(/^\/patron\/collections/, "/collections");
  }
  if (path === "/patron/feed/post" || path.startsWith("/patron/feed/post/")) {
    return path.replace(/^\/patron\/feed\/post/, "/feed/post");
  }
  if (path === "/patron/feed" || path.startsWith("/patron/feed/")) {
    return path.replace(/^\/patron\/feed/, "/feed");
  }
  if (path === "/patron/discover" || path.startsWith("/patron/discover/")) {
    return path.replace(/^\/patron\/discover/, "/discover");
  }
  if (path === "/patron/library" || path.startsWith("/patron/library/")) {
    return path.replace(/^\/patron\/library/, "/library");
  }
  if (path === "/patron/notifications" || path.startsWith("/patron/notifications/")) {
    return path.replace(/^\/patron\/notifications/, "/notifications");
  }
  if (path === "/patron/settings" || path.startsWith("/patron/settings/")) {
    return path.replace(/^\/patron\/settings/, "/settings");
  }
  if (path === "/patron/profile" || path.startsWith("/patron/profile/")) {
    return path.replace(/^\/patron\/profile/, "/profile");
  }
  if (path === "/patron/commission-hub" || path.startsWith("/patron/commission-hub/")) {
    return path.replace(/^\/patron\/commission-hub/, "/commission-hub");
  }
  if (
    path === "/patron/former-subscriptions" ||
    path.startsWith("/patron/former-subscriptions/")
  ) {
    return path.replace(/^\/patron\/former-subscriptions/, "/former-subscriptions");
  }
  return null;
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

  const legacyPath = legacyRedirectPath(path);
  if (legacyPath) {
    return redirectPreservingQuery(req, legacyPath);
  }

  const signedIn = Boolean(req.cookies.get("relay_session")?.value);

  /** Logged-out visitors to the marketing home or legacy landing should start at onboarding. */
  if (!signedIn && (path === "/" || path === "/landing")) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  /** Signed-in users hitting `/` land on role-appropriate home. */
  if (signedIn && path === "/") {
    return NextResponse.redirect(new URL(defaultSignedInLanding(req), req.url));
  }

  if (
    !signedIn &&
    isAppRoute(path) &&
    !isPatronLibraryDevFixture(path, url.searchParams) &&
    !isPatronFeedDevFixture(path, url.searchParams) &&
    !isPatronDiscoverDevFixture(path, url.searchParams) &&
    !isPatronNotificationsDevFixture(path, url.searchParams) &&
    !isPatronSettingsDevFixture(path, url.searchParams) &&
    !isPatronProfileDevDraft(path)
  ) {
    const dest = new URL("/login", req.url);
    dest.searchParams.set("returnTo", path + url.search);
    return NextResponse.redirect(dest);
  }

  if (signedIn && isAuthEntryRoute(path) && !isPilotUxDevLoginRoute(path)) {
    const target = safeReturnTo(
      url.searchParams.get("returnTo"),
      defaultSignedInLanding(req)
    );
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
