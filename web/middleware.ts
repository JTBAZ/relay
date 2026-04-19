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

/** Logged-in users are redirected away (marketing / auth entry). */
const AUTH_ENTRY_ROUTES: RegExp[] = [
  /^\/login(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/landing(\/|$)/
];

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

  if (!signedIn && isAppRoute(path)) {
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
