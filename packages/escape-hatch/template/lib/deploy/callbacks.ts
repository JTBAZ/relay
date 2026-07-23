/**
 * Domain / callback checklist for Vercel Path A (EH-070).
 * No live DNS/TLS probes — fail closed on placeholder origins.
 */

export type DomainMode = "unset" | "placeholder" | "provider_url" | "custom";

export type CallbackSlot = {
  id: string;
  label: string;
  path: string;
  absolute_url: string | null;
  required: boolean;
};

export type CallbackChecklist = {
  origin: string | null;
  domain_mode: DomainMode;
  ok: boolean;
  detail: string;
  slots: CallbackSlot[];
};

const PLACEHOLDER_ORIGIN_RE =
  /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|example\.(com|org|net)|yoursite|changeme)(:\d+)?$/i;

export function normalizePublicOrigin(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (!url.hostname) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function classifyDomainMode(
  origin: string | null
): DomainMode {
  if (!origin) return "unset";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (
      PLACEHOLDER_ORIGIN_RE.test(origin) ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".example.com") ||
      host === "example.com"
    ) {
      return "placeholder";
    }
    if (host.endsWith(".vercel.app")) return "provider_url";
    return "custom";
  } catch {
    return "placeholder";
  }
}

const CALLBACK_PATHS: Array<{
  id: string;
  label: string;
  path: string;
  required: boolean;
}> = [
  {
    id: "auth_callback",
    label: "Auth / identity callback",
    path: "/auth/callback",
    required: true
  },
  {
    id: "patreon_oauth_callback",
    label: "Patreon OAuth callback",
    path: "/api/patreon/oauth/callback",
    required: true
  },
  {
    id: "patreon_relay_callback",
    label: "Relay-managed Patreon callback",
    path: "/api/patreon/relay/callback",
    required: false
  },
  {
    id: "billing_success",
    label: "Billing success return",
    path: "/billing/success",
    required: true
  },
  {
    id: "billing_cancel",
    label: "Billing cancel return",
    path: "/billing/cancel",
    required: true
  },
  {
    id: "billing_portal_return",
    label: "Billing portal return",
    path: "/account",
    required: true
  },
  {
    id: "stripe_webhook",
    label: "Stripe webhook endpoint",
    path: "/api/billing/webhook",
    required: true
  }
];

/**
 * Build absolute callback URLs from NEXT_PUBLIC_SITE_URL (or equivalent).
 * Placeholder / unset origins fail closed — no absolute URLs claimed.
 */
export function buildCallbackChecklist(
  siteUrl: string | null | undefined
): CallbackChecklist {
  const origin = normalizePublicOrigin(siteUrl ?? null);
  const domain_mode = classifyDomainMode(origin);

  if (!origin || domain_mode === "unset") {
    return {
      origin: null,
      domain_mode: "unset",
      ok: false,
      detail:
        "NEXT_PUBLIC_SITE_URL unset — cannot mint absolute OAuth/billing/webhook callbacks.",
      slots: CALLBACK_PATHS.map((p) => ({
        ...p,
        absolute_url: null
      }))
    };
  }

  if (domain_mode === "placeholder") {
    return {
      origin,
      domain_mode,
      ok: false,
      detail:
        "Site URL looks like localhost/placeholder — register callbacks only after a real preview or custom domain.",
      slots: CALLBACK_PATHS.map((p) => ({
        ...p,
        absolute_url: null
      }))
    };
  }

  const slots: CallbackSlot[] = CALLBACK_PATHS.map((p) => ({
    ...p,
    absolute_url: `${origin}${p.path}`
  }));

  return {
    origin,
    domain_mode,
    ok: true,
    detail:
      domain_mode === "provider_url"
        ? "Provider URL mode (*.vercel.app) — suitable for preview callback registration; custom domain still deferred for live TLS proof."
        : "Custom domain origin set — still verify DNS/TLS in the provider dashboard (no live probe in kit).",
    slots
  };
}
