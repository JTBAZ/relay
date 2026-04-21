import type { PrismaClient } from "@prisma/client";
import { createSupabaseAdminClient, getSupabaseAdminEnv } from "../lib/supabase-admin.js";
import { getAccountIdForSession } from "./patron-auth-context.js";
import type { SessionToken } from "./types.js";

/** When true, `POST .../patron/patron/link` requires Supabase email confirmed for Supabase-linked accounts. */
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
 * If {@link patreonLinkRequiresVerifiedEmail} is off, always allows.
 * If on: only enforces when `Account.supabaseUserId` is set; native-email accounts skip.
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
 * For `GET /api/v1/me/session` — whether this session may use session-first Patreon `/link`
 * from an email perspective (Supabase confirmed when enforcement is on).
 * Returns `true` when enforcement is off, account is non-Supabase, admin is unavailable, or lookup fails (lenient read path).
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
