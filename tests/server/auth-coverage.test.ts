/**
 * Tier 1.1 — `/api/v1/*` routes should use `requirePatronBearerSession`, `requireAccount`,
 * `assertCreatorRelayMutationAllowed`, optional `identityService.resolveSession`, or a
 * `// PUBLIC:` marker (see preceding ~900 chars).
 *
 * `LEGACY_CREATOR_SCOPED` lists routes still gated by `creator_id` in body/query only
 * (migrate to session + RLS in a follow-up).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "..", "src", "server.ts");

const AUTH_PATTERN =
  /requirePatronBearerSession|requireAccount\s*\(|requireAccountWithRole\s*\(|requireAccountMatchesCreator|assertCreatorRelayMutationAllowed|identityService\.resolveSession|readSessionCookie\s*\(|getSupabaseUserFromAccessToken|checkPostAccess|evaluatePostPermission/;

/** Intentionally unauthenticated or OAuth-only; not creator session–scoped. */
const LEGACY_CREATOR_SCOPED = new Set([
  "/api/v1/webhooks/patreon/platform/:opaqueToken",
  "/api/v1/auth/patreon/patron/exchange",
  "/api/v1/auth/signup",
  "/api/v1/auth/login",
  "/api/v1/identity/register",
  "/api/v1/identity/register-patreon",
  "/api/v1/payments/checkout",
  "/api/v1/migrations/campaigns/:campaign_id/bounce",
  "/api/v1/migrations/campaigns/:campaign_id/complaint",
  "/api/v1/migrations/campaigns/:campaign_id/click",
  "/api/v1/migrations/campaigns/:campaign_id/resubscribe"
]);

describe("server /api/v1 auth coverage markers", () => {
  it("each /api/v1 route has PUBLIC, auth helper, or legacy allowlist", () => {
    const src = readFileSync(serverPath, "utf8");
    const routeRe =
      /\n\s*app\.(get|post|put|patch|delete)\(\s*["'](\/api\/v1\/[^"']+)["']/g;
    const missing: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = routeRe.exec(src)) !== null) {
      const path = m[2]!;
      if (LEGACY_CREATOR_SCOPED.has(path)) continue;

      const routeStart = m.index;
      const preamble = src.slice(Math.max(0, routeStart - 900), routeStart);
      if (preamble.includes("// PUBLIC:")) continue;

      const handlerWindow = src.slice(routeStart, routeStart + 4500);
      if (!AUTH_PATTERN.test(handlerWindow)) {
        missing.push(path);
      }
    }
    expect(
      missing,
      `Add // PUBLIC: <reason> above the route, use requireAccount/requirePatronBearerSession, or extend LEGACY_CREATOR_SCOPED with a comment. Offenders: ${missing.join(", ")}`
    ).toEqual([]);
  });
});
