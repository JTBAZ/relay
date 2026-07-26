/**
 * HTTP routes for Relay-managed Patreon verification (EH-041).
 * Mounted under /api/v1/escape-hatch/managed-verify/*.
 * Health + JWKS are public; mutating routes require operator token.
 * CI/dev: in-memory service; no live Patreon.
 */

import type { Application, Request, Response } from "express";
import { resolveManagedVerifyOperatorToken } from "./metrics.js";
import type { ManagedVerifyService } from "./service.js";

export type RegisterManagedVerifyRoutesDeps = {
  service: ManagedVerifyService;
  /** Extra gate — when false, all routes 503. */
  isMounted?: () => boolean;
  env?: NodeJS.ProcessEnv;
};

function traceId(req: Request): string {
  return (
    (req.header("x-trace-id") as string | undefined) ??
    `trace_eh041_${Date.now()}`
  );
}

function jsonError(
  res: Response,
  status: number,
  code: string,
  message: string,
  tid: string
): void {
  res.status(status).json({
    ok: false,
    error: { code, message },
    production_safe: false,
    trace_id: tid
  });
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

/**
 * Mutating routes require Authorization Bearer operator token
 * or header x-eh-managed-verify-token. Fail closed when token unset.
 */
function requireOperator(
  req: Request,
  res: Response,
  env: NodeJS.ProcessEnv
): boolean {
  const expected = resolveManagedVerifyOperatorToken(env);
  if (!expected) {
    jsonError(
      res,
      503,
      "MANAGED_VERIFY_OPERATOR_REQUIRED",
      "Mutating managed-verify routes require ESCAPE_HATCH_RELAY_MANAGED_VERIFY_OPERATOR_TOKEN (fail closed).",
      traceId(req)
    );
    return false;
  }
  const bearer = req.header("authorization");
  let presented: string | undefined;
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    presented = bearer.slice(7).trim();
  } else {
    presented = req.header("x-eh-managed-verify-token")?.trim();
  }
  if (!presented || !timingSafeEqualString(presented, expected)) {
    jsonError(
      res,
      401,
      "MANAGED_VERIFY_UNAUTHORIZED",
      "Invalid or missing operator token.",
      traceId(req)
    );
    return false;
  }
  return true;
}

export function registerManagedVerifyRoutes(
  app: Application,
  deps: RegisterManagedVerifyRoutesDeps
): void {
  const base = "/api/v1/escape-hatch/managed-verify";
  const mounted = deps.isMounted ?? (() => true);
  const env = deps.env ?? process.env;

  const gate = (req: Request, res: Response): boolean => {
    if (!mounted()) {
      jsonError(
        res,
        503,
        "MANAGED_VERIFY_UNMOUNTED",
        "Managed verify routes are not mounted.",
        traceId(req)
      );
      return false;
    }
    if (!deps.service.isEnabled()) {
      jsonError(
        res,
        503,
        "MANAGED_VERIFY_DISABLED",
        "Kill switch is off — fail closed.",
        traceId(req)
      );
      return false;
    }
    return true;
  };

  app.get(`${base}/health`, (req, res) => {
    const h = deps.service.health();
    res.status(h.ok ? 200 : 503).json({
      ok: h.ok,
      enabled: h.enabled,
      production_safe: false,
      detail: h.detail,
      metrics: h.metrics,
      trace_id: traceId(req)
    });
  });

  app.get(`${base}/jwks`, (req, res) => {
    if (!gate(req, res)) return;
    res.status(200).json({
      ...deps.service.jwks(),
      production_safe: false,
      trace_id: traceId(req)
    });
  });

  app.get(`${base}/start`, (req, res) => {
    if (!gate(req, res)) return;
    if (!requireOperator(req, res, env)) return;
    const siteId =
      typeof req.query.site_id === "string" ? req.query.site_id.trim() : "";
    const returnUrl =
      typeof req.query.return_url === "string"
        ? req.query.return_url.trim()
        : "";
    if (!siteId || !returnUrl) {
      jsonError(
        res,
        400,
        "MANAGED_VERIFY_BAD_REQUEST",
        "site_id and return_url are required.",
        traceId(req)
      );
      return;
    }
    if (!deps.service.isReturnUrlAllowed(siteId, returnUrl)) {
      jsonError(
        res,
        403,
        "MANAGED_VERIFY_RETURN_URL_REJECTED",
        "return_url origin is not allowlisted (open redirect denied).",
        traceId(req)
      );
      return;
    }
    res.status(200).json({
      ok: true,
      preview_only: true,
      production_safe: false,
      detail:
        "Relay-managed start accepted (allowlist ok). Live Patreon OAuth is not wired in this preview — complete via authenticated POST /complete with mocked membership.",
      next: `${base}/complete`,
      query: {
        site_id: siteId,
        return_url: returnUrl,
        state: typeof req.query.state === "string" ? req.query.state : null,
        nonce: typeof req.query.nonce === "string" ? req.query.nonce : null,
        account_id:
          typeof req.query.account_id === "string"
            ? req.query.account_id
            : null
      },
      trace_id: traceId(req)
    });
  });

  app.post(`${base}/sites`, (req, res) => {
    if (!gate(req, res)) return;
    if (!requireOperator(req, res, env)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const siteId = typeof body.site_id === "string" ? body.site_id.trim() : "";
    const audience =
      typeof body.audience === "string" ? body.audience.trim() : "";
    const origins = Array.isArray(body.callback_origins)
      ? body.callback_origins.filter((o): o is string => typeof o === "string")
      : [];
    if (!siteId || !audience || origins.length === 0) {
      jsonError(
        res,
        400,
        "MANAGED_VERIFY_BAD_REQUEST",
        "site_id, audience, and callback_origins are required.",
        traceId(req)
      );
      return;
    }
    const result = deps.service.registerSite({
      siteId,
      audience,
      callbackOrigins: origins
    });
    if (!result.ok) {
      jsonError(
        res,
        400,
        "MANAGED_VERIFY_REGISTER_FAILED",
        result.reason,
        traceId(req)
      );
      return;
    }
    res.status(201).json({
      ok: true,
      site_id: result.siteId,
      production_safe: false,
      trace_id: traceId(req)
    });
  });

  app.post(`${base}/sites/:siteId/revoke`, (req, res) => {
    if (!gate(req, res)) return;
    if (!requireOperator(req, res, env)) return;
    const siteId = String(req.params.siteId ?? "");
    const result = deps.service.revokeSite(siteId);
    if (!result.ok) {
      jsonError(
        res,
        result.reason === "not_found" ? 404 : 400,
        "MANAGED_VERIFY_REVOKE_FAILED",
        result.reason,
        traceId(req)
      );
      return;
    }
    res.status(200).json({
      ok: true,
      site_id: siteId,
      production_safe: false,
      trace_id: traceId(req)
    });
  });

  app.post(`${base}/keys/rotate`, (req, res) => {
    if (!gate(req, res)) return;
    if (!requireOperator(req, res, env)) return;
    const result = deps.service.rotateKeys();
    if (!result.ok) {
      jsonError(
        res,
        503,
        "MANAGED_VERIFY_ROTATE_FAILED",
        result.reason,
        traceId(req)
      );
      return;
    }
    res.status(200).json({
      ok: true,
      kid: result.kid,
      production_safe: false,
      trace_id: traceId(req)
    });
  });

  app.post(`${base}/complete`, (req, res) => {
    if (!gate(req, res)) return;
    if (!requireOperator(req, res, env)) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const siteId = typeof body.site_id === "string" ? body.site_id.trim() : "";
    const accountId =
      typeof body.account_id === "string" ? body.account_id.trim() : "";
    const patreonUserId =
      typeof body.patreon_user_id === "string"
        ? body.patreon_user_id.trim()
        : "";
    const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
    const state = typeof body.state === "string" ? body.state : "";
    const returnUrl =
      typeof body.return_url === "string" ? body.return_url.trim() : "";
    const tierIds = Array.isArray(body.tier_ids)
      ? body.tier_ids.filter((t): t is string => typeof t === "string")
      : [];
    const observedAt =
      typeof body.observed_at === "string"
        ? body.observed_at
        : new Date().toISOString();
    const patronStatus =
      typeof body.patron_status === "string"
        ? body.patron_status.trim()
        : "active_patron";

    if (!siteId || !accountId || !patreonUserId || !nonce || !returnUrl) {
      jsonError(
        res,
        400,
        "MANAGED_VERIFY_BAD_REQUEST",
        "site_id, account_id, patreon_user_id, nonce, and return_url are required.",
        traceId(req)
      );
      return;
    }

    if (patronStatus !== "active_patron") {
      jsonError(
        res,
        403,
        "MANAGED_VERIFY_INACTIVE_PATRON",
        "Assertions require patron_status=active_patron.",
        traceId(req)
      );
      return;
    }

    const result = deps.service.completeRedirect({
      siteId,
      accountId,
      patreonUserId,
      nonce,
      state,
      returnUrl,
      entitlement: {
        tierIds,
        observedAtIso: observedAt,
        patronStatus: "active_patron"
      }
    });
    if (!result.ok) {
      const status =
        result.reason === "return_url_not_allowlisted" ? 403 : 400;
      jsonError(
        res,
        status,
        "MANAGED_VERIFY_COMPLETE_FAILED",
        result.reason,
        traceId(req)
      );
      return;
    }
    res.status(200).json({
      ok: true,
      redirect_url: result.redirectUrl,
      production_safe: false,
      trace_id: traceId(req)
    });
  });

  app.get(`${base}/sites/:siteId/migration-export`, (req, res) => {
    if (!gate(req, res)) return;
    if (!requireOperator(req, res, env)) return;
    const siteId = String(req.params.siteId ?? "");
    const result = deps.service.exportMigrationMetadata(siteId);
    if (!result.ok) {
      jsonError(
        res,
        result.reason === "not_found" ? 404 : 400,
        "MANAGED_VERIFY_EXPORT_FAILED",
        result.reason,
        traceId(req)
      );
      return;
    }
    res.status(200).json({
      ok: true,
      export: result.export,
      production_safe: false,
      note: "Non-secret link metadata only — no tokens or credentials.",
      trace_id: traceId(req)
    });
  });
}
