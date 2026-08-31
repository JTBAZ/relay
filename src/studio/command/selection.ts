/**
 * Deterministic `search_library` over GalleryItem-shaped records (P1 / RC-P5-T03–T04).
 * No embeddings, no LLM. Compact records and complete snapshots only.
 *
 * @see docs/studio/relay-command-mcp-build-plans/01-PHASE-1-CONTENT-FOUNDATION.md RC-P1-T03
 * @see docs/studio/relay-command-mcp-build-plans/05-PHASE-5-SELECTION-TRUTH.md
 */

import { itemMatchesFreeTextQuery, stripHtmlForSearch } from "../../gallery/query.js";
import type { GalleryItem } from "../../gallery/types.js";
import {
  CommandContractError,
  type CommandCompactPostRecord,
  type CommandDestinationKey,
  type CommandMatchEvidence,
  type CommandMatchEvidenceField,
  type CommandPostSource,
  type CommandPublishState,
  type CommandSelectionQuery,
  type ResolvedSelection,
  validateCommandSelectionQuery
} from "./contracts.js";
import { assertCatalogComplete, selectionChecksum } from "./selection-snapshot.js";
import { parseSequenceToken, resolveNumberedSequence } from "./sequence.js";

/** Gallery row plus optional Prisma `Post.source` (not on GalleryItem today). */
export type CommandLibraryItem = GalleryItem & {
  source?: CommandPostSource | null;
  publish_state?: CommandPublishState;
};

export type CommandSearchLibraryOptions = {
  creator_id?: string;
  created_at?: string;
  /** False when the input catalog is a truncated page — fail closed. Default true. */
  catalog_complete?: boolean;
};

function globToRegExp(pattern: string): RegExp {
  let body = "";
  for (const ch of pattern) {
    if (ch === "*") body += ".*";
    else if (ch === "?") body += ".";
    else body += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${body}$`, "i");
}

export function isDestinationPostedOnItem(
  item: CommandLibraryItem,
  destination: CommandDestinationKey
): boolean {
  const rows = item.distribution_summary?.destinations ?? [];
  for (const row of rows) {
    if (row.destination !== destination) continue;
    const url = row.external_url?.trim();
    if (row.attempt_status === "posted" || Boolean(url)) return true;
  }
  return false;
}

function destinationFlags(
  item: CommandLibraryItem
): CommandCompactPostRecord["destination_flags"] {
  const flags: CommandCompactPostRecord["destination_flags"] = {};
  for (const row of item.distribution_summary?.destinations ?? []) {
    const dest = row.destination;
    if (dest !== "patreon" && dest !== "x" && dest !== "deviantart" && dest !== "bluesky") {
      continue;
    }
    const url = row.external_url?.trim();
    if (row.attempt_status === "posted" || Boolean(url)) {
      flags[dest] = true;
    }
  }
  return flags;
}

function isTextOnlyRow(item: CommandLibraryItem): boolean {
  return item.media_id.startsWith("post_only_");
}

function matchesLeafFields(item: CommandLibraryItem, query: CommandSelectionQuery): boolean {
  if (query.q && query.q.trim()) {
    if (!itemMatchesFreeTextQuery(item, query.q)) return false;
  }
  if (query.tag_ids && query.tag_ids.length > 0) {
    for (const tag of query.tag_ids) {
      if (!item.tag_ids.includes(tag)) return false;
    }
  }
  if (query.title_contains) {
    if (!item.title.toLowerCase().includes(query.title_contains.toLowerCase())) return false;
  }
  if (query.title_pattern) {
    if (!globToRegExp(query.title_pattern).test(item.title)) return false;
  }
  if (query.description_contains) {
    const hay = stripHtmlForSearch(item.description).toLowerCase();
    if (!hay.includes(query.description_contains.toLowerCase())) return false;
  }
  if (query.source) {
    if (item.source !== query.source) return false;
  }
  if (query.visibility && item.visibility !== query.visibility) return false;
  if (query.date_from && item.published_at < query.date_from) return false;
  if (query.date_to && item.published_at > query.date_to) return false;
  if (query.collection_id && !item.collection_ids.includes(query.collection_id)) return false;
  if (query.destination_present) {
    for (const dest of query.destination_present) {
      if (!isDestinationPostedOnItem(item, dest)) return false;
    }
  }
  if (query.destination_absent) {
    for (const dest of query.destination_absent) {
      if (isDestinationPostedOnItem(item, dest)) return false;
    }
  }
  if (query.exclude_post_ids && query.exclude_post_ids.includes(item.post_id)) return false;
  if (query.tier_ids && query.tier_ids.length > 0) {
    if (!item.tier_ids.some((t) => query.tier_ids!.includes(t))) return false;
  }
  if (query.media_type) {
    const mime = (item.mime_type ?? "").toLowerCase();
    if (!mime || !mime.startsWith(query.media_type)) return false;
  }
  if (query.publish_state) {
    const state = item.publish_state ?? "published";
    if (state !== query.publish_state) return false;
  }
  if (query.creative_work_id) {
    if ((item.creative_work_id ?? "") !== query.creative_work_id) return false;
  }
  if (query.text_only_posts === "exclude" && isTextOnlyRow(item)) return false;
  if (query.text_only_posts === "only" && !isTextOnlyRow(item)) return false;
  return true;
}

function matchesSelection(item: CommandLibraryItem, query: CommandSelectionQuery): boolean {
  if (!matchesLeafFields(item, query)) return false;
  if (query.all && query.all.length > 0) {
    if (!query.all.every((child) => matchesSelection(item, child))) return false;
  }
  if (query.any && query.any.length > 0) {
    if (!query.any.some((child) => matchesSelection(item, child))) return false;
  }
  if (query.not && query.not.length > 0) {
    if (query.not.some((child) => matchesSelection(item, child))) return false;
  }
  return true;
}

function evidenceFieldsForNode(
  item: CommandLibraryItem,
  query: CommandSelectionQuery
): CommandMatchEvidenceField[] {
  const fields: CommandMatchEvidenceField[] = [];
  if (query.q) fields.push("q");
  if (query.tag_ids?.length) fields.push("tag");
  if (query.title_contains || query.title_pattern) fields.push("title");
  if (query.description_contains) fields.push("description");
  if (query.source) fields.push("source");
  if (query.visibility) fields.push("visibility");
  if (query.collection_id) fields.push("collection");
  if (query.tier_ids?.length) fields.push("tier");
  if (query.media_type) fields.push("media_type");
  if (query.destination_present?.length || query.destination_absent?.length) {
    fields.push("destination");
  }
  if (query.publish_state) fields.push("publish_state");
  if (query.creative_work_id) fields.push("creative_work");
  for (const child of [...(query.all ?? []), ...(query.any ?? []), ...(query.not ?? [])]) {
    if (query.not?.includes(child)) continue;
    if (matchesSelection(item, child)) {
      fields.push(...evidenceFieldsForNode(item, child));
    }
  }
  return fields;
}

function uniqueEvidenceFields(fields: CommandMatchEvidenceField[]): CommandMatchEvidenceField[] {
  const seen = new Set<CommandMatchEvidenceField>();
  const out: CommandMatchEvidenceField[] = [];
  for (const f of fields) {
    if (seen.has(f)) continue;
    seen.add(f);
    out.push(f);
  }
  return out;
}

function explainQuery(query: CommandSelectionQuery): string {
  const parts: string[] = [];
  if (query.q) parts.push(`q=${JSON.stringify(query.q)}`);
  if (query.tag_ids?.length) parts.push(`tag_ids=${query.tag_ids.join("+")}`);
  if (query.title_contains) parts.push(`title_contains=${JSON.stringify(query.title_contains)}`);
  if (query.title_pattern) parts.push(`title_pattern=${JSON.stringify(query.title_pattern)}`);
  if (query.description_contains) {
    parts.push(`description_contains=${JSON.stringify(query.description_contains)}`);
  }
  if (query.source) parts.push(`source=${query.source}`);
  if (query.visibility) parts.push(`visibility=${query.visibility}`);
  if (query.date_from) parts.push(`date_from=${query.date_from}`);
  if (query.date_to) parts.push(`date_to=${query.date_to}`);
  if (query.collection_id) parts.push(`collection_id=${query.collection_id}`);
  if (query.destination_present?.length) {
    parts.push(`destination_present=${query.destination_present.join("+")}`);
  }
  if (query.destination_absent?.length) {
    parts.push(`destination_absent=${query.destination_absent.join("+")}`);
  }
  if (query.exclude_post_ids?.length) {
    parts.push(`exclude_post_ids=${query.exclude_post_ids.length}`);
  }
  if (query.tier_ids?.length) parts.push(`tier_ids=${query.tier_ids.join("|")}`);
  if (query.media_type) parts.push(`media_type=${query.media_type}`);
  if (query.publish_state) parts.push(`publish_state=${query.publish_state}`);
  if (query.creative_work_id) parts.push(`creative_work_id=${query.creative_work_id}`);
  if (query.text_only_posts) parts.push(`text_only_posts=${query.text_only_posts}`);
  if (query.numbered_sequence) parts.push("numbered_sequence");
  if (query.all?.length) parts.push(`all=(${query.all.map(explainQuery).join("; ")})`);
  if (query.any?.length) parts.push(`any=(${query.any.map(explainQuery).join(" OR ")})`);
  if (query.not?.length) parts.push(`not=(${query.not.map(explainQuery).join(" OR ")})`);
  return parts.length > 0 ? parts.join(" AND ") : "all";
}

function queryTreeHas(
  query: CommandSelectionQuery,
  pred: (q: CommandSelectionQuery) => boolean
): boolean {
  if (pred(query)) return true;
  return [...(query.all ?? []), ...(query.any ?? []), ...(query.not ?? [])].some((child) =>
    queryTreeHas(child, pred)
  );
}

export function compactCommandLibraryItem(item: CommandLibraryItem): CommandCompactPostRecord {
  return {
    post_id: item.post_id,
    title: item.title,
    tag_ids: [...item.tag_ids],
    published_at: item.published_at,
    visibility: item.visibility,
    source: item.source ?? null,
    collection_ids: [...item.collection_ids],
    page_number: parseSequenceToken(item.member_label || item.title).number,
    destination_flags: destinationFlags(item),
    member_label: item.member_label ?? null
  };
}

export type CommandSearchLibraryResult = {
  selection: ResolvedSelection;
  records: CommandCompactPostRecord[];
};

function sequenceWarningsForItems(items: readonly CommandLibraryItem[]): string[] {
  const unique = new Map<string, CommandLibraryItem>();
  for (const item of items) {
    if (!unique.has(item.post_id)) unique.set(item.post_id, item);
  }
  try {
    const resolved = resolveNumberedSequence(
      [...unique.values()].map((it) => ({
        post_id: it.post_id,
        title: it.title,
        member_label: it.member_label
      }))
    );
    const warnings: string[] = [];
    if (resolved.gaps.length > 0) {
      warnings.push(`Missing page ${resolved.gaps.join(", ")} — not invented.`);
    }
    if (resolved.duplicates.length > 0) {
      warnings.push(
        `Duplicate page ${resolved.duplicates.join(", ")} — both copies kept until you choose.`
      );
    }
    return warnings;
  } catch (err) {
    if (err instanceof CommandContractError && err.code === "COMMAND_AMBIGUOUS") {
      return ["Multiple series labels matched; ask which series to use."];
    }
    throw err;
  }
}

/**
 * Deterministic library search. Collapses media rows to one compact record per post_id.
 * Returns a complete snapshot or throws if the catalog is truncated.
 */
export function searchLibrary(
  items: readonly CommandLibraryItem[],
  rawQuery: CommandSelectionQuery | unknown,
  options: CommandSearchLibraryOptions = {}
): CommandSearchLibraryResult {
  assertCatalogComplete(options.catalog_complete !== false);
  const query = validateCommandSelectionQuery(rawQuery);
  const matched = items.filter((item) => matchesSelection(item, query));
  matched.sort((a, b) => {
    if (a.published_at !== b.published_at) return a.published_at < b.published_at ? 1 : -1;
    return a.post_id.localeCompare(b.post_id);
  });

  const seen = new Set<string>();
  const records: CommandCompactPostRecord[] = [];
  const evidenceByPost = new Map<string, CommandMatchEvidenceField[]>();
  let collapsed = 0;
  for (const item of matched) {
    if (seen.has(item.post_id)) {
      collapsed += 1;
      continue;
    }
    seen.add(item.post_id);
    records.push(compactCommandLibraryItem(item));
    evidenceByPost.set(item.post_id, uniqueEvidenceFields(evidenceFieldsForNode(item, query)));
  }

  const warnings: string[] = [];
  if (collapsed > 0) {
    warnings.push(`collapsed ${collapsed} extra media row(s) onto unique post_ids`);
  }
  if (queryTreeHas(query, (q) => Boolean(q.destination_present?.length))) {
    warnings.push("destination_present filter applied — already-posted destinations are included.");
  }
  if (queryTreeHas(query, (q) => Boolean(q.destination_absent?.length))) {
    warnings.push("destination_absent filter applied — already-posted destinations were skipped.");
  }
  if (queryTreeHas(query, (q) => Boolean(q.numbered_sequence))) {
    warnings.push(...sequenceWarningsForItems(matched));
  }

  const postIds = records.map((r) => r.post_id);
  const match_evidence: CommandMatchEvidence[] = records.map((r) => ({
    post_id: r.post_id,
    fields: evidenceByPost.get(r.post_id) ?? []
  }));

  const selection: ResolvedSelection = {
    post_ids: postIds,
    explanation: explainQuery(query),
    warnings,
    match_evidence,
    revision: selectionChecksum(postIds),
    complete: true,
    creator_id: options.creator_id?.trim() ?? "",
    created_at: options.created_at ?? new Date().toISOString()
  };
  return { selection, records };
}
