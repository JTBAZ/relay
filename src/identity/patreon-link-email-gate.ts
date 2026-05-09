/**
 * @fileoverview Gate Patreon link behind Supabase email verification when configured.
 * @description Uses optional admin client for `getUserById`; lenient read path for session status.
 * @see ../lib/supabase-admin.js
 * @security-audit-required Service role env is required only when enforcement is on.
 */

import type { PrismaClient } from "@prisma/client";
import { createSupabaseAdminClient, getSupabaseAdminEnv } from "../lib/supabase-admin.js";
import { getAccountIdForSession } from "./patron-auth-context.js";
import type { SessionToken } from "./types.js";

/**
 * @description Reads `RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL`.
 * @returns {boolean}
 */
export function patreonLinkRequiresVerifiedEmail(): boolean {
  const v = process.env.RELAY_PATREON_LINK_REQUIRE_VERIFIED_EMAIL?.trim().toLowerCase();
  return v === "true" || v === "1";
}

export type PatreonLinkEmailGateFailure = {
  ok: false;
  httpStatus: number;
  code: string;
  message: string;
};

export type PatreonLinkEmailGateResult = { ok: true } | PatreonLinkEmailGateFailure;

type AdminDeps = {
  getUserById: (
    supabaseUserId: string
  ) => Promise<{ email_confirmed_at: string | null | undefined } | null>;
};

/**
 * @description If {@link patreonLinkRequiresVerifiedEmail} is off, always allows; when on, enforces for Supabase-linked accounts via admin API.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} accountId
 * @param {AdminDeps} [deps]
 * @returns {Promise<PatreonLinkEmailGateResult>}
 * @async
 */
export async function checkPatreonLinkEmailGate(
  prisma: PrismaClient,
  accountId: string,
  deps?: AdminDeps
): Promise<PatreonLinkEmailGateResult> {
  if (!patreonLinkRequiresVerifiedEmail()) {
    return { ok: true };
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { supabaseUserId: true }
  });

  if (!account?.supabaseUserId) {
    return { ok: true };
  }

  if (!deps?.getUserById && !getSupabaseAdminEnv()) {
    return {
      ok: false,
      httpStatus: 503,
      code: "NOT_AVAILABLE",
      message:
        "Email verification enforcement requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    };
  }

  const getUserById: AdminDeps["getUserById"] =
    deps?.getUserById ??
    (async (supabaseUserId: string) => {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase.auth.admin.getUserById(supabaseUserId);
      if (error || !data.user) {
        return null;
      }
      return { email_confirmed_at: data.user.email_confirmed_at ?? null };
    });

  const user = await getUserById(account.supabaseUserId);
  if (user === null) {
    return {
      ok: false,
      httpStatus: 403,
      code: "EMAIL_VERIFICATION_UNAVAILABLE",
      message: "Could not verify your Supabase account email."
    };
  }
  if (!user.email_confirmed_at) {
    return {
      ok: false,
      httpStatus: 403,
      code: "EMAIL_NOT_VERIFIED",
      message: "Verify your email before linking Patreon."
    };
  }
  return { ok: true };
}

/**
 * @description Lenient read path for `/api/v1/me/session` Patreon link eligibility.
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {import("./types.js").SessionToken} session
 * @returns {Promise<boolean>}
 * @async
 */
export async function getSessionEmailVerifiedForPatronLink(
  prisma: PrismaClient,
  session: SessionToken
): Promise<boolean> {
  if (!patreonLinkRequiresVerifiedEmail()) {
    return true;
  }
  const accountId = await getAccountIdForSession(prisma, session);
  if (!accountId) {
    return true;
  }
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { supabaseUserId: true }
  });
  if (!account?.supabaseUserId) {
    return true;
  }
  if (!getSupabaseAdminEnv()) {
    return true;
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(account.supabaseUserId);
  if (error || !data?.user) {
    return true;
  }
  return Boolean(data.user.email_confirmed_at);
}
