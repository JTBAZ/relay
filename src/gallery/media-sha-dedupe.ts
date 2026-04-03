import type { CreatorExportIndex } from "../export/types.js";

/**
 * Within a single post's `media_ids`, drop duplicates that share the same export `sha256`.
 * Prefer keeping a **non-cover** row when one exists; otherwise smallest `media_id` lexicographically.
 *
 * Rows without an export SHA are left unchanged (cannot be clustered).
 * Intended for optional batch/export reconciliation — not enabled on every gallery list by default.
 */
export function collapseDuplicateMediaIdsBySha(
  mediaIds: string[],
  exportIndex: CreatorExportIndex,
  roleByMediaId: (id: string) => string | undefined
): string[] {
  const groups = new Map<string, string[]>();
  for (const id of mediaIds) {
    const sha = exportIndex.media[id]?.sha256;
    if (!sha) continue;
    const g = groups.get(sha) ?? [];
    g.push(id);
    groups.set(sha, g);
  }

  const losers = new Set<string>();
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const winner = pickShaDuplicateWinner(ids, roleByMediaId);
    for (const id of ids) {
      if (id !== winner) losers.add(id);
    }
  }

  return mediaIds.filter((id) => !losers.has(id));
}

function pickShaDuplicateWinner(
  ids: string[],
  roleByMediaId: (id: string) => string | undefined
): string {
  return [...ids].sort((a, b) => {
    const ra = roleByMediaId(a) === "cover" ? 1 : 0;
    const rb = roleByMediaId(b) === "cover" ? 1 : 0;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  })[0]!;
}
