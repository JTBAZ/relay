/**
 * Session overrides for Escape Hatch Structure edits (tier moves).
 * Soft persistence in localStorage so Preview can reflect rearrangements.
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
