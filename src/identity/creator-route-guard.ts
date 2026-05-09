/**
 * @fileoverview Optional shared secret + tenant existence for creator-scoped mutations (MT-010/011).
 * @description Headless/operator flows via `X-Relay-Creator-Secret`; JSON error envelopes on deny.
 * @security-audit-required Strong env secret and TLS termination assumptions for header-based auth.
 */

import type { Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { errorEnvelope } from "../contracts/api.js";

/**
 * When `RELAY_CREATOR_ROUTE_SECRET` is set, mutating creator routes must send the same value in
 * **`X-Relay-Creator-Secret`** (MT-010). When unset, only optional Postgres tenant provisioning checks apply.
 */
/**
 * @description True when `RELAY_CREATOR_ROUTE_SECRET` is set and header matches expected value (or env unset → true).
 * @param {import("express").Request} req
 * @returns {boolean}
 */
export function relayCreatorRouteSecretMatches(req: Request): boolean {
  const expected = process.env.RELAY_CREATOR_ROUTE_SECRET?.trim();
  if (!expected) {
    return true;
  }
  const got = req.header("x-relay-creator-secret")?.trim();
  return got === expected;
}

/**
 * When `RELAY_CREATOR_ROUTE_SECRET` is set and the request header matches, allow creator OAuth
 * exchange without Bearer + signed `state` (MT-011 operator / headless flows).
 */
/**
 * @description Operator/headless OAuth bypass when shared secret header matches.
 * @param {import("express").Request} req
 * @returns {boolean}
 */
export function relayCreatorSecretBypassesOAuthBind(req: Request): boolean {
  const expected = process.env.RELAY_CREATOR_ROUTE_SECRET?.trim();
  if (!expected) {
    return false;
  }
  return req.header("x-relay-creator-secret")?.trim() === expected;
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} relayCreatorId
 * @returns {Promise<boolean>}
 * @async
 */
export async function relayTenantExists(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<boolean> {
  const row = await prisma.tenant.findUnique({
    where: { relayCreatorId },
    select: { id: true }
  });
  return row != null;
}

/**
 * @description Whether Prisma should verify a `Tenant` row exists for the creator id.
 * @returns {boolean}
 */
function shouldVerifyTenantRow(): boolean {
  return (
    process.env.RELAY_ENFORCE_CREATOR_TENANT === "1" ||
    Boolean(process.env.RELAY_CREATOR_ROUTE_SECRET?.trim())
  );
}

/**
 * @description Enforce optional shared secret + known `Tenant` row for creator-scoped mutations.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {string} traceId
 * @param {import("@prisma/client").PrismaClient | undefined} prisma
 * @param {string} relayCreatorId
 * @returns {Promise<boolean>} `false` if the response was already sent with 403/404.
 * @async
 */
export async function assertCreatorRelayMutationAllowed(
  req: Request,
  res: Response,
  traceId: string,
  prisma: PrismaClient | undefined,
  relayCreatorId: string
): Promise<boolean> {
  if (!relayCreatorRouteSecretMatches(req)) {
    res.status(403).json(
      errorEnvelope(
        "FORBIDDEN",
        "Invalid or missing X-Relay-Creator-Secret (set RELAY_CREATOR_ROUTE_SECRET on the server).",
        traceId
      )
    );
    return false;
  }
  if (prisma && shouldVerifyTenantRow()) {
    const ok = await relayTenantExists(prisma, relayCreatorId.trim());
    if (!ok) {
      res
        .status(404)
        .json(errorEnvelope("NOT_FOUND", "No tenant for this creator_id.", traceId));
      return false;
    }
  }
  return true;
}
