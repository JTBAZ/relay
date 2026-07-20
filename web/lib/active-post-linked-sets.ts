import type { PostGalleryGroup } from "@/lib/gallery-group";
import type { GalleryItem } from "@/lib/relay-api";
import {
  summaryToPresence,
  type PresentDestination,
} from "@/lib/active-post-presence";
import { PRESENCE_PRODUCT_DESTINATIONS } from "@/lib/active-post-presence";

export type LinkedSetMemberCard = {
  post_id: string;
  member_label: string | null;
  variant_role: string;
  sort_order: number;
  group: PostGalleryGroup;
  present: PresentDestination[];
  missing: string[];
};

export type ActivePostsGridCard =
  | { kind: "post"; group: PostGalleryGroup }
  | {
      kind: "linked_set";
      creative_work_id: string;
      title: string;
      cover_post_id: string;
      member_count: number;
      members: LinkedSetMemberCard[];
      present: PresentDestination[];
      missing: string[];
    };

function primaryItem(group: PostGalleryGroup): GalleryItem | undefined {
  return group.items.find((it) => !it.shadow_cover) ?? group.items[0];
}

function isLinkedSetMembership(item: GalleryItem | undefined): boolean {
  if (!item?.creative_work_id) return false;
  if (item.is_default_bundle !== false) return false;
  return (item.creative_work_member_count ?? 0) >= 2;
}

/** Union present destinations across members; missing = product set minus union. */
export function unionMemberPresence(
  members: Array<{ present: PresentDestination[]; missing: string[] }>
): { present: PresentDestination[]; missing: string[] } {
  const presentMap = new Map<string, PresentDestination>();
  for (const member of members) {
    for (const row of member.present) {
      const prev = presentMap.get(row.destination);
      if (!prev || (!prev.external_url && row.external_url)) {
        presentMap.set(row.destination, row);
      }
    }
  }
  const present = PRESENCE_PRODUCT_DESTINATIONS.filter((d) => presentMap.has(d)).map(
    (d) => presentMap.get(d)!
  );
  const presentSet = new Set(present.map((p) => p.destination));
  const missing = PRESENCE_PRODUCT_DESTINATIONS.filter((d) => !presentSet.has(d));
  return { present, missing: [...missing] };
}

/**
 * Collapse post groups into Active Posts cards.
 * Non-default CreativeWorks with ≥2 members become one linked_set card.
 * Carousel (multi-asset one post) stays a post card.
 */
export function collapsePostGroupsToGridCards(
  groups: PostGalleryGroup[]
): ActivePostsGridCard[] {
  const cards: ActivePostsGridCard[] = [];
  const emittedWorks = new Set<string>();
  const groupsByWork = new Map<string, PostGalleryGroup[]>();

  for (const group of groups) {
    const item = primaryItem(group);
    if (!isLinkedSetMembership(item)) continue;
    const workId = item!.creative_work_id!;
    const list = groupsByWork.get(workId) ?? [];
    list.push(group);
    groupsByWork.set(workId, list);
  }

  for (const group of groups) {
    const item = primaryItem(group);
    if (!isLinkedSetMembership(item)) {
      cards.push({ kind: "post", group });
      continue;
    }
    const workId = item!.creative_work_id!;
    if (emittedWorks.has(workId)) continue;
    emittedWorks.add(workId);

    const memberGroups = groupsByWork.get(workId) ?? [group];
    const members: LinkedSetMemberCard[] = memberGroups.map((g) => {
      const primary = primaryItem(g)!;
      const presence = summaryToPresence(primary.distribution_summary);
      return {
        post_id: g.post_id,
        member_label: primary.member_label ?? null,
        variant_role: primary.variant_role ?? "standalone",
        sort_order: primary.creative_work_sort_order ?? 0,
        group: g,
        present: presence.present,
        missing: presence.missing,
      };
    });
    members.sort((a, b) => a.sort_order - b.sort_order || a.post_id.localeCompare(b.post_id));

    const cover = members.find((m) => m.sort_order === 0) ?? members[0]!;
    const presenceUnion = unionMemberPresence(members);
    cards.push({
      kind: "linked_set",
      creative_work_id: workId,
      title: primaryItem(cover.group)?.title ?? cover.post_id,
      cover_post_id: cover.post_id,
      member_count: members.length,
      members,
      present: presenceUnion.present,
      missing: presenceUnion.missing,
    });
  }

  return cards;
}
