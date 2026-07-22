/**
 * Client-safe paywall / entitlement UX copy (EH-034).
 * Maps evaluator reason codes to visitor-facing language without leaking internals.
 */

export type PaywallAudience =
  | "anonymous"
  | "signed_in"
  | "staff"
  | "soft_persona_preview"
  | "soft_persona_blocked";

export type PaywallUxCopy = {
  headline: string;
  detail: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta?: string;
  secondaryHref?: string;
  /** Announced to assistive tech when access is denied. */
  deniedAnnouncement: string;
  /** Staff / preview honesty — never claim patron membership falsely. */
  honestyNote?: string;
};

const ACCOUNT = "/account";
const LOGIN = "/login";

/**
 * Resolve visitor-facing copy from an AccessReasonCode-like string.
 * Unknown codes fall back to a generic membership message.
 */
export function paywallCopyForReason(input: {
  reason: string;
  allowed: boolean;
  audience: PaywallAudience;
  themeMessage?: string;
  communityCta?: { label: string; href: string } | null;
}): PaywallUxCopy {
  const theme = input.themeMessage?.trim();
  const community = input.communityCta ?? null;

  if (input.allowed) {
    if (input.audience === "staff") {
      return {
        headline: "Staff access",
        detail: "You can view this content as site staff — not as a patron membership.",
        primaryCta: "Account",
        primaryHref: ACCOUNT,
        deniedAnnouncement: "",
        honestyNote: "Staff override — not a patron entitlement."
      };
    }
    if (input.audience === "soft_persona_preview") {
      return {
        headline: "Preview unlocked",
        detail: "Local soft-persona preview only — not a production entitlement.",
        primaryCta: "Account",
        primaryHref: ACCOUNT,
        deniedAnnouncement: "",
        honestyNote: "Soft persona is non-authoritative."
      };
    }
    return {
      headline: "Unlocked",
      detail: "Membership access confirmed by the server.",
      primaryCta: "Account",
      primaryHref: ACCOUNT,
      deniedAnnouncement: ""
    };
  }

  // Denied paths
  if (input.audience === "soft_persona_blocked" || input.reason === "soft_persona_blocked") {
    return {
      headline: "Sign in required",
      detail:
        "Demo personas cannot unlock membership content while identity is configured. Sign in with your site account.",
      primaryCta: "Sign in",
      primaryHref: LOGIN,
      secondaryCta: "Account",
      secondaryHref: ACCOUNT,
      deniedAnnouncement:
        "Access denied. Soft demo personas are blocked when identity is configured.",
      honestyNote: "Soft persona never elevates under Path A/B."
    };
  }

  switch (input.reason) {
    case "anonymous_denied":
    case "missing_credentials":
      return {
        headline: theme || "Members only",
        detail: "Sign in to check your membership, or join to unlock this post.",
        primaryCta: "Sign in",
        primaryHref: LOGIN,
        secondaryCta: community?.label,
        secondaryHref: community?.href,
        deniedAnnouncement: "This post is locked. Sign in required."
      };
    case "entitlement_expired":
      return {
        headline: "Membership expired",
        detail: "Your access has expired. Renew or update membership to continue.",
        primaryCta: "Account",
        primaryHref: ACCOUNT,
        secondaryCta: community?.label ?? "Support",
        secondaryHref: community?.href ?? ACCOUNT,
        deniedAnnouncement: "Access denied. Membership expired."
      };
    case "entitlement_revoked":
      return {
        headline: "Access revoked",
        detail: "This membership is no longer active for this content.",
        primaryCta: "Account",
        primaryHref: ACCOUNT,
        deniedAnnouncement: "Access denied. Membership revoked."
      };
    case "entitlement_stale":
      return {
        headline: "Membership needs refresh",
        detail:
          "We could not confirm a fresh membership. Sign in again or contact the creator.",
        primaryCta: "Account",
        primaryHref: ACCOUNT,
        secondaryCta: "Sign in",
        secondaryHref: LOGIN,
        deniedAnnouncement: "Access denied. Membership confirmation is stale."
      };
    case "tier_insufficient":
    case "no_entitlement":
      return {
        headline: theme || "Upgrade to unlock",
        detail:
          input.audience === "signed_in"
            ? "You are signed in, but this post needs a higher membership tier."
            : "A membership tier is required to view this post.",
        primaryCta: community?.label ?? "View membership",
        primaryHref: community?.href ?? ACCOUNT,
        secondaryCta: "Account",
        secondaryHref: ACCOUNT,
        deniedAnnouncement: "Access denied. Membership tier insufficient."
      };
    case "provider_invalid":
      return {
        headline: "Identity unavailable",
        detail: "Site identity is misconfigured. Membership checks are fail-closed.",
        primaryCta: "Account",
        primaryHref: ACCOUNT,
        deniedAnnouncement: "Access denied. Identity provider invalid."
      };
    case "unpublished_resource":
      return {
        headline: "Not available",
        detail: "This post is not published for visitors.",
        primaryCta: "Gallery",
        primaryHref: "/preview",
        deniedAnnouncement: "This post is not available."
      };
    default:
      return {
        headline: theme || "Members only",
        detail:
          input.audience === "signed_in"
            ? "You are signed in, but this content stays locked until membership allows it."
            : "Membership is required to unlock this content.",
        primaryCta: input.audience === "signed_in" ? "Account" : "Sign in",
        primaryHref: input.audience === "signed_in" ? ACCOUNT : LOGIN,
        secondaryCta: community?.label,
        secondaryHref: community?.href,
        deniedAnnouncement: "This post is locked."
      };
  }
}

/** Gallery teaser: shorter copy for card overlays. */
export function paywallTeaserHeadline(reason: string | undefined, themeMessage?: string): string {
  const theme = themeMessage?.trim();
  if (theme) return theme;
  switch (reason) {
    case "soft_persona_blocked":
      return "Sign in to unlock";
    case "entitlement_expired":
      return "Membership expired";
    case "tier_insufficient":
    case "no_entitlement":
      return "Upgrade to unlock";
    case "anonymous_denied":
    case "missing_credentials":
      return "Members only";
    default:
      return "Unlock to view";
  }
}
