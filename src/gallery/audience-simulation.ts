/**
 * @fileoverview Pure Audience Simulator — wraps evaluatePostPermission for creator personas.
 * Simulation always uses isContentOwner: false.
 * @see ./post-permission.ts
 * @see docs/studio/AUDIENCE_PROMOTION_CONVERSION.md Slice 3
 */

import { evaluatePostPermission, type PostPermissionOutcome } from "./post-permission.js";
import type { PostVisibility } from "./types.js";
import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { SessionToken } from "../identity/types.js";
import type { AudiencePersonaKeyServer } from "./tier-preview-settings.js";
import { isAudiencePersonaKey } from "./tier-preview-settings.js";

export type SimulationTierRow = {
  /** Relay / compose relay_tier_id used on posts and sessions. */
  relay_tier_id: string;
  title: string;
  amount_cents: number | null;
};

export type AudienceSimulationInput = {
  creatorId: string;
  postId: string;
  /** Upstream / version tier ids on the post (relay keys; may include public sentinel). */
  postTierIds: string[];
  /** Synced catalog tiers for this creator (defines real personas). */
  catalogTiers: SimulationTierRow[];
  relayPostVisibility: PostVisibility | null;
  isPostMature?: boolean;
};

export type AudiencePersonaOutcome = {
  persona_key: AudiencePersonaKeyServer;
  label: string;
  outcome: PostPermissionOutcome["outcome"] | "missing_post";
  reason?: string;
  /** Slice 9 — resolved locked promo for this persona (absent when allow / none). */
  effective_promo?: {
    headline: string;
    cta_text: string;
    code: string | null;
    percent_off: number | null;
    tracked_url: string | null;
    source: "explicit" | "tier_default";
  } | null;
};

export type AudienceSimulationResult = {
  personas: AudiencePersonaOutcome[];
  gate_tier_ids: string[];
  relay_visibility: PostVisibility | null;
};

function buildSimulationSnapshot(input: AudienceSimulationInput): CanonicalSnapshot {
  const now = "1970-01-01T00:00:00.000Z";
  const tierMap: NonNullable<CanonicalSnapshot["tiers"][string]> = {};
  for (const t of input.catalogTiers) {
    const id = t.relay_tier_id.trim();
    if (!id) continue;
    tierMap[id] = {
      tier_id: id,
      creator_id: input.creatorId,
      campaign_id: "sim_campaign",
      title: t.title,
      amount_cents: t.amount_cents ?? 0,
      upstream_updated_at: now,
      version_seq: 1
    };
  }
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: { [input.creatorId]: tierMap },
    posts: {
      [input.creatorId]: {
        [input.postId]: {
          post_id: input.postId,
          creator_id: input.creatorId,
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "sim",
            title: "Simulation",
            published_at: now,
            tag_ids: [],
            tier_ids: [...input.postTierIds],
            media_ids: [],
            ingested_at: now
          },
          versions: []
        }
      }
    },
    media: {}
  };
}

function sessionForPersona(
  creatorId: string,
  personaKey: AudiencePersonaKeyServer
): SessionToken | null {
  if (personaKey === "anonymous") return null;
  const relayTierId = personaKey.slice("tier:".length);
  return {
    token: "sim",
    user_id: `sim_${relayTierId}`,
    creator_id: creatorId,
    tier_ids: [relayTierId],
    expires_at: "2099-01-01T00:00:00.000Z"
  };
}

/** Persona list: anonymous + one entry per synced catalog tier (never mock labels). */
export function listSimulationPersonas(
  catalogTiers: SimulationTierRow[]
): Array<{ persona_key: AudiencePersonaKeyServer; label: string }> {
  const sorted = [...catalogTiers].sort((a, b) => {
    const ac = a.amount_cents ?? 0;
    const bc = b.amount_cents ?? 0;
    if (ac !== bc) return ac - bc;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
  return [
    { persona_key: "anonymous", label: "Public (logged out)" },
    ...sorted.map((t) => ({
      persona_key: `tier:${t.relay_tier_id.trim()}` as AudiencePersonaKeyServer,
      label: t.title.trim() || t.relay_tier_id
    }))
  ];
}

/**
 * Evaluate each persona with the canonical permission evaluator.
 * Always passes `isContentOwner: false`.
 */
export function simulateAudiencePersonas(input: AudienceSimulationInput): AudienceSimulationResult {
  const snapshot = buildSimulationSnapshot(input);
  const personas = listSimulationPersonas(input.catalogTiers).map(({ persona_key, label }) => {
    if (!isAudiencePersonaKey(persona_key)) {
      return {
        persona_key,
        label,
        outcome: "deny" as const,
        reason: "Invalid persona key."
      };
    }
    const session = sessionForPersona(input.creatorId, persona_key);
    const result = evaluatePostPermission({
      snapshot,
      creatorId: input.creatorId,
      postId: input.postId,
      session,
      isContentOwner: false,
      relayPostVisibility: input.relayPostVisibility,
      isPostMature: input.isPostMature === true,
      hideMatureContent: false
    });
    if (result === null) {
      return { persona_key, label, outcome: "missing_post" as const, reason: "Post not found." };
    }
    return {
      persona_key,
      label,
      outcome: result.outcome,
      ...("reason" in result ? { reason: result.reason } : {})
    };
  });

  return {
    personas,
    gate_tier_ids: [...input.postTierIds],
    relay_visibility: input.relayPostVisibility
  };
}
