/**
 * Delivery checklist — SPF/DKIM/DMARC guidance (EH-072).
 * No live DNS probes.
 */

import {
  classifyDomainMode,
  normalizePublicOrigin
} from "../deploy/callbacks";

export type DeliveryCheckItem = {
  id: string;
  title: string;
  ok: boolean;
  detail: string;
  guidance: string;
};

export type DeliveryChecklist = {
  ok: boolean;
  detail: string;
  sender_domain: string | null;
  link_origin_ok: boolean;
  items: DeliveryCheckItem[];
  production_safe: false;
};

function domainFromEmail(from: string | null | undefined): string | null {
  if (!from) return null;
  const m = from.match(/@([^\s>]+)/);
  return m?.[1]?.toLowerCase() ?? null;
}

/**
 * Build SPF/DKIM/DMARC + sender/link-origin checklist from env-shaped inputs.
 * Completeness flags only — creator must verify in their DNS host.
 */
export function buildDeliveryChecklist(opts: {
  fromAddress?: string | null;
  siteUrl?: string | null;
  /** Operator attested checks (fixture / admin form). */
  attested?: {
    spf?: boolean;
    dkim?: boolean;
    dmarc?: boolean;
    sender_verified?: boolean;
    test_inbox?: boolean;
  };
}): DeliveryChecklist {
  const from = opts.fromAddress?.trim() || null;
  const sender_domain = domainFromEmail(from);
  const origin = normalizePublicOrigin(opts.siteUrl ?? null);
  const domain_mode = classifyDomainMode(origin);
  const link_origin_ok =
    Boolean(origin) &&
    domain_mode !== "unset" &&
    domain_mode !== "placeholder";

  const attested = opts.attested ?? {};

  const items: DeliveryCheckItem[] = [
    {
      id: "spf",
      title: "SPF",
      ok: Boolean(attested.spf),
      detail: attested.spf
        ? "Operator attested SPF published for sender domain."
        : "SPF not attested — publish an SPF record allowing your ESP.",
      guidance:
        "At your DNS host, add TXT for the sender domain authorizing Resend (or your ESP)."
    },
    {
      id: "dkim",
      title: "DKIM",
      ok: Boolean(attested.dkim),
      detail: attested.dkim
        ? "Operator attested DKIM keys published."
        : "DKIM not attested — add ESP-provided CNAME/TXT keys.",
      guidance: "Copy DKIM CNAMEs from the ESP dashboard into DNS; wait for propagation."
    },
    {
      id: "dmarc",
      title: "DMARC",
      ok: Boolean(attested.dmarc),
      detail: attested.dmarc
        ? "Operator attested DMARC policy present."
        : "DMARC not attested — start with p=none then tighten.",
      guidance:
        "Add _dmarc TXT (e.g. v=DMARC1; p=none; rua=mailto:…) then move to quarantine/reject."
    },
    {
      id: "sender_verified",
      title: "Sender verification",
      ok: Boolean(attested.sender_verified) && Boolean(from),
      detail: from
        ? attested.sender_verified
          ? `From ${from} attested verified at ESP.`
          : `From ${from} set — complete ESP domain/sender verification.`
        : "EMAIL_FROM unset — cannot verify sender.",
      guidance: "Verify the sending domain or address in the ESP before production traffic."
    },
    {
      id: "test_inbox",
      title: "Test inbox delivery",
      ok: Boolean(attested.test_inbox),
      detail: attested.test_inbox
        ? "Operator attested a successful test-inbox delivery."
        : "Send a fixture/test message to a real inbox you control (outside CI).",
      guidance: "Use /api/admin/email fixture send or ESP dashboard test — not package CI."
    },
    {
      id: "link_origin",
      title: "Link origin",
      ok: link_origin_ok,
      detail: link_origin_ok
        ? `Links should use ${origin}.`
        : "NEXT_PUBLIC_SITE_URL unset/placeholder — verification links must not point at localhost in production.",
      guidance:
        "All email CTAs must use the public site origin; never embed secrets in query strings."
    },
    {
      id: "redaction",
      title: "Safe redaction",
      ok: true,
      detail:
        "Logs must redact recipient addresses (ehxp-style); never log API keys or full message bodies in production logs.",
      guidance: "Use redactEmailForLog; keep RESEND_API_KEY server-only."
    }
  ];

  const requiredOk = items
    .filter((i) => i.id !== "redaction")
    .every((i) => i.ok);
  const hasFrom = Boolean(from && sender_domain);

  return {
    ok: hasFrom && requiredOk,
    detail: hasFrom
      ? requiredOk
        ? `Delivery checklist complete for ${sender_domain} (operator-attested; no live DNS probe).`
        : `Sender ${sender_domain} — complete SPF/DKIM/DMARC/sender/test-inbox attestations.`
      : "Set EMAIL_FROM (and recipe env) before treating email as ready.",
    sender_domain,
    link_origin_ok,
    items,
    production_safe: false
  };
}
