/**
 * Declarative pilot UX dev seed (PUX-000) — loaded from tests/fixtures/pilot-ux-seed.json.
 * No Patreon OAuth/API; stable ids for deterministic local Postgres harness.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type PilotUxSeedAccount = {
  legacyFileId: string;
  email: string;
  displayName: string;
  publicSlug?: string;
  discipline?: string;
  handle?: string;
};

export type PilotUxSeedTier = {
  relayTierId: string;
  title: string;
  amountCents: number;
};

export type PilotUxSeedPost = {
  postId: string;
  title: string;
  description: string;
  isPublic: boolean;
  tierIds: string[];
  mediaType: "writing" | "photo" | "audio" | "video";
  mediaId: string;
};

export const PILOT_UX_CREATOR_PLANS = [
  "studio_core",
  "autopost",
  "growth_engine"
] as const;

export type PilotUxCreatorPlanId = (typeof PILOT_UX_CREATOR_PLANS)[number];

export type PilotUxSeedCreator = {
  relayCreatorId: string;
  accountKey: string;
  campaignId: string;
  campaignName: string;
  patreonCampaignId: string;
  tiers: PilotUxSeedTier[];
  posts: PilotUxSeedPost[];
  /** Repeatable sign-up walkthrough — profile starts disconnected from Patreon. */
  onboardingWalkthrough?: boolean;
  /**
   * Server-side CreatorPlanEntitlement (source `pilot`).
   * Omit for free / paywall-lab accounts (e.g. onboarding walkthrough).
   */
  creatorPlan?: PilotUxCreatorPlanId;
};

export type PilotUxSeedPatronEntitlement = {
  relayCreatorId: string;
  entitledTierIds: string[];
};

export type PilotUxSeedSpec = {
  version: number;
  devPasswordEnv: string;
  defaultDevPassword: string;
  accounts: Record<string, PilotUxSeedAccount>;
  creators: PilotUxSeedCreator[];
  patron: {
    accountKey: string;
    followRelayCreatorIds: string[];
    entitlements: PilotUxSeedPatronEntitlement[];
  };
  patronOnboarding?: {
    accountKey: string;
  };
};

const MIME_BY_MEDIA: Record<PilotUxSeedPost["mediaType"], string> = {
  writing: "text/plain",
  photo: "image/png",
  audio: "audio/mpeg",
  video: "video/mp4"
};

export function mediaMimeForPilotPost(mediaType: PilotUxSeedPost["mediaType"]): string {
  return MIME_BY_MEDIA[mediaType];
}

export function defaultPilotUxSeedFixturePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "../../tests/fixtures/pilot-ux-seed.json"),
    join(here, "../../../tests/fixtures/pilot-ux-seed.json")
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return candidates[0]!;
}

export function loadPilotUxSeedSpec(fixturePath?: string): PilotUxSeedSpec {
  const path = fixturePath?.trim() || defaultPilotUxSeedFixturePath();
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as PilotUxSeedSpec;
  const errors = validatePilotUxSeedSpec(parsed);
  if (errors.length > 0) {
    throw new Error(`Invalid pilot UX seed fixture (${path}):\n${errors.join("\n")}`);
  }
  return parsed;
}

/** Structural validation for fixture JSON (no DB). */
export function validatePilotUxSeedSpec(spec: unknown): string[] {
  const errors: string[] = [];
  if (!spec || typeof spec !== "object") {
    return ["spec must be an object"];
  }
  const s = spec as PilotUxSeedSpec;
  if (s.version !== 1) {
    errors.push(`version must be 1 (got ${String(s.version)})`);
  }
  if (!s.accounts || typeof s.accounts !== "object") {
    errors.push("accounts object required");
    return errors;
  }
  if (!Array.isArray(s.creators) || s.creators.length < 1) {
    errors.push("creators array required");
    return errors;
  }
  if (!s.patron?.accountKey) {
    errors.push("patron.accountKey required");
  }

  const accountKeys = new Set(Object.keys(s.accounts));
  for (const key of [
    "creatorAva",
    "creatorMilo",
    "creatorOnboarding",
    "creatorQuinn",
    "patronRiley",
    "patronOnboarding"
  ] as const) {
    if (!accountKeys.has(key)) {
      errors.push(`accounts.${key} required`);
    }
  }

  const creatorIds = new Set<string>();
  for (const c of s.creators) {
    if (!c.relayCreatorId?.trim()) {
      errors.push("creator.relayCreatorId required");
      continue;
    }
    if (creatorIds.has(c.relayCreatorId)) {
      errors.push(`duplicate relayCreatorId ${c.relayCreatorId}`);
    }
    creatorIds.add(c.relayCreatorId);
    if (!accountKeys.has(c.accountKey)) {
      errors.push(`creator ${c.relayCreatorId}: unknown accountKey ${c.accountKey}`);
    }
    if (c.creatorPlan !== undefined) {
      if (
        typeof c.creatorPlan !== "string" ||
        !(PILOT_UX_CREATOR_PLANS as readonly string[]).includes(c.creatorPlan)
      ) {
        errors.push(
          `creator ${c.relayCreatorId}: creatorPlan must be studio_core | autopost | growth_engine`
        );
      }
    }
    const tierIds = new Set(c.tiers.map((t) => t.relayTierId));
    for (const p of c.posts) {
      for (const tid of p.tierIds) {
        if (!tierIds.has(tid)) {
          errors.push(
            `post ${p.postId}: tier ${tid} not in creator tier catalog`
          );
        }
      }
    }
  }

  if (s.patron) {
    if (!accountKeys.has(s.patron.accountKey)) {
      errors.push(`patron: unknown accountKey ${s.patron.accountKey}`);
    }
    for (const rid of s.patron.followRelayCreatorIds ?? []) {
      if (!creatorIds.has(rid)) {
        errors.push(`patron follow: unknown relayCreatorId ${rid}`);
      }
    }
    for (const ent of s.patron.entitlements ?? []) {
      const creator = s.creators.find((c) => c.relayCreatorId === ent.relayCreatorId);
      if (!creator) {
        errors.push(`entitlement: unknown relayCreatorId ${ent.relayCreatorId}`);
        continue;
      }
      const tierIds = new Set(creator.tiers.map((t) => t.relayTierId));
      for (const tid of ent.entitledTierIds) {
        if (!tierIds.has(tid)) {
          errors.push(
            `entitlement ${ent.relayCreatorId}: tier ${tid} not in creator catalog`
          );
        }
      }
    }
  }

  if (s.patronOnboarding) {
    if (!accountKeys.has(s.patronOnboarding.accountKey)) {
      errors.push(`patronOnboarding: unknown accountKey ${s.patronOnboarding.accountKey}`);
    }
  }

  return errors;
}

export function resolvePilotUxDevPassword(spec: PilotUxSeedSpec): string {
  const fromEnv = process.env[spec.devPasswordEnv]?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : spec.defaultDevPassword;
}

/** Creators with a seeded post library (excludes onboarding walkthrough shell). */
export function pilotUxSeededLibraryCreators(spec: PilotUxSeedSpec): PilotUxSeedCreator[] {
  return spec.creators.filter((c) => c.onboardingWalkthrough !== true);
}
