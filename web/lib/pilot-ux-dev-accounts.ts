/**
 * PUX-001 — pilot UX dev account labels for password login (no Supabase / Patreon OAuth).
 * Keep aligned with `tests/fixtures/pilot-ux-seed.json`.
 */
export type PilotUxDevAccountKind = "creator" | "patron";

export type PilotUxDevAccountRow = {
  kind: PilotUxDevAccountKind;
  legacyFileId: string;
  email: string;
  displayName: string;
  relayCreatorId?: string;
  /** Post-login destination for one-click sign-in. */
  destination: string;
  /** Resets onboarding walkthrough state before navigating (dev-only API). */
  onboardingWalkthrough?: boolean;
  /** Lands on supporter onboarding flow with a dedicated seeded patron account. */
  patronOnboardingWalkthrough?: boolean;
};

/** Default when `RELAY_PILOT_UX_DEV_PASSWORD` is unset — matches fixture. */
export const PILOT_UX_DEFAULT_DEV_PASSWORD = "pilot-ux-dev-only";

/** Matches `tests/fixtures/pilot-ux-seed.json` onboarding walkthrough creator. */
export const PILOT_UX_ONBOARDING_RELAY_CREATOR_ID = "rcx_pilot_dev_onboarding";

export const PILOT_UX_DEV_ACCOUNTS: readonly PilotUxDevAccountRow[] = [
  {
    kind: "creator",
    legacyFileId: "creator_dev_ava",
    email: "creator_dev_ava@pilot.relay.test",
    displayName: "Dev Ava",
    relayCreatorId: "rcx_pilot_dev_ava",
    destination: "/studio"
  },
  {
    kind: "creator",
    legacyFileId: "creator_dev_milo",
    email: "creator_dev_milo@pilot.relay.test",
    displayName: "Dev Milo",
    relayCreatorId: "rcx_pilot_dev_milo",
    destination: "/studio"
  },
  {
    kind: "creator",
    legacyFileId: "creator_dev_onboarding",
    email: "creator_dev_onboarding@pilot.relay.test",
    displayName: "Dev Onboarding",
    relayCreatorId: "rcx_pilot_dev_onboarding",
    destination: "/onboarding?path=creator&step=2",
    onboardingWalkthrough: true
  },
  {
    kind: "creator",
    legacyFileId: "creator_dev_quinn",
    email: "creator_dev_quinn@pilot.relay.test",
    displayName: "Dev Quinn",
    relayCreatorId: "rcx_pilot_dev_quinn",
    destination: "/studio"
  },
  {
    kind: "patron",
    legacyFileId: "patron_dev_riley",
    email: "patron_dev_riley@pilot.relay.test",
    displayName: "Dev Riley",
    destination: "/feed"
  },
  {
    kind: "patron",
    legacyFileId: "patron_dev_onboarding",
    email: "patron_dev_onboarding@pilot.relay.test",
    displayName: "Dev Patron Onboarding",
    destination: "/onboarding?path=supporter&step=2",
    patronOnboardingWalkthrough: true
  }
] as const;

export function pilotUxDevLoginEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    return (process.env.NEXT_PUBLIC_RELAY_PILOT_UX_DEV_LOGIN ?? "").trim().toLowerCase() === "true";
  }
  return true;
}
