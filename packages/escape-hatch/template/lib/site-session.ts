/**
 * Soft session overrides for Escape Hatch Structure edits (tier moves).
 * Soft persistence in localStorage so Preview can reflect rearrangements.
 *
 * EH-030: Demo personas remain available for local-preview UI only.
 * They are never consulted by server authorization, admin mutations, or
 * entitlement reads. When Supabase identity env is configured, the intended
 * identity path is Auth session + membership/entitlement snapshots (RLS).
 */

import type { AccessLevel, ClonePostEntry } from "./access";

export type PostAccessOverride = {
  level: AccessLevel;
  tier_ids: string[];
};

const key = (siteId: string) => `eh-structure-overrides:${siteId}`;

export function loadPostOverrides(
  siteId: string
): Record<string, PostAccessOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(key(siteId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PostAccessOverride>;
  } catch {
    return {};
  }
}

export function savePostOverrides(
  siteId: string,
  overrides: Record<string, PostAccessOverride>
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(siteId), JSON.stringify(overrides));
}

export function applyPostOverrides(
  posts: ClonePostEntry[],
  overrides: Record<string, PostAccessOverride>
): ClonePostEntry[] {
  return posts.map((p) => {
    const o = overrides[p.post_id];
    if (!o) return p;
    return { ...p, access: { level: o.level, tier_ids: [...o.tier_ids] } };
  });
}

export const INTRO_DISMISS_KEY = "eh-structure-intro-dismissed";

/** Soft persona storage key — preview UI only; not server authorization. */
export const SOFT_PERSONA_KEY_PREFIX = "eh-soft-persona:";

export function softPersonaStorageKey(siteId: string): string {
  return `${SOFT_PERSONA_KEY_PREFIX}${siteId}`;
}
