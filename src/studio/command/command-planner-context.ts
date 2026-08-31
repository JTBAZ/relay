/**
 * Compact planner context (RC-P7-T03).
 * Catalogs only: tags, collection titles, destinations, title vocabulary, proposal summary.
 * Never media, URLs, patron PII, or raw library dumps.
 */
import { COMMAND_DESTINATION_KEYS } from "./contracts.js";
import { redactCommandMcpValue } from "./mcp/redact.js";
import type { CommandSelectionProposal } from "./proposal-types.js";
import type { CommandLibraryItem } from "./selection.js";
import { STUDIO_LAB2_TAGS } from "../lab2/corpus-spec.js";

export const COMMAND_PLANNER_CONTEXT_SCHEMA_VERSION = "relay-command-planner-v1";

export const COMMAND_PLANNER_CONTEXT_CAPS = {
  tags: 80,
  titles: 60,
  collections: 40,
  frozen_ids: 100
} as const;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_RE = /https?:\/\/|\/api\/v1\/media\//i;

export type CommandPlannerTagCatalogEntry = {
  tag_id: string;
  label: string;
};

export type CommandPlannerCollectionCatalogEntry = {
  collection_id: string;
  title: string;
};

export type CommandPlannerProposalSummary = {
  stage: string;
  pending_count: number;
  frozen_count: number;
  exclude_count: number;
  frozen_post_ids: string[];
  plan: { weekday: number; interval_days: number; start_local: string } | null;
};

export type CommandPlannerContext = {
  schema_version: string;
  stage: string;
  destinations: string[];
  tags: CommandPlannerTagCatalogEntry[];
  collection_titles: CommandPlannerCollectionCatalogEntry[];
  title_vocabulary: string[];
  proposal: CommandPlannerProposalSummary | null;
  clarification_choice?: string;
};

export type BuildCommandPlannerContextInput = {
  items: readonly CommandLibraryItem[];
  proposal?: CommandSelectionProposal | null;
  collections?: Array<{ collection_id: string; title: string }>;
  clarification_choice?: string | null;
};

function isSafeCatalogString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (EMAIL_RE.test(trimmed) || URL_RE.test(trimmed)) return false;
  return true;
}

function humanizeTagId(tagId: string): string {
  const known = STUDIO_LAB2_TAGS.find((row) => row.tag_id === tagId);
  if (known) return known.label;
  const tagPart = tagId.split("_tag_").pop();
  if (tagPart && tagPart !== tagId) return tagPart.replace(/_/g, " ");
  return tagId;
}

function uniqueCap<T>(values: Iterable<T>, cap: number, keyFn: (value: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * True when a serialized planner payload still contains URL/email material.
 */
export function plannerPayloadContainsSecrets(value: unknown): boolean {
  const raw = JSON.stringify(value ?? "");
  return EMAIL_RE.test(raw) || URL_RE.test(raw);
}

export function buildCommandPlannerContext(
  input: BuildCommandPlannerContextInput
): CommandPlannerContext {
  const tagIds: string[] = [];
  const titles: string[] = [];
  const collectionIds = new Set<string>();
  for (const item of input.items) {
    for (const tagId of item.tag_ids) {
      if (typeof tagId === "string" && tagId.trim()) tagIds.push(tagId.trim());
    }
    if (typeof item.title === "string" && isSafeCatalogString(item.title)) {
      titles.push(item.title.trim());
    }
    for (const collectionId of item.collection_ids) {
      if (typeof collectionId === "string" && collectionId.trim()) {
        collectionIds.add(collectionId.trim());
      }
    }
  }

  const titleByCollection = new Map<string, string>();
  for (const collection of input.collections ?? []) {
    const id = collection.collection_id.trim();
    const title = collection.title.trim();
    if (!id || !isSafeCatalogString(title)) continue;
    titleByCollection.set(id, title);
  }

  const tags = uniqueCap(
    tagIds.map((tag_id) => ({ tag_id, label: humanizeTagId(tag_id) })),
    COMMAND_PLANNER_CONTEXT_CAPS.tags,
    (row) => row.tag_id
  );

  const collection_titles = uniqueCap(
    [...collectionIds].map((collection_id) => ({
      collection_id,
      title: titleByCollection.get(collection_id) ?? collection_id
    })),
    COMMAND_PLANNER_CONTEXT_CAPS.collections,
    (row) => row.collection_id
  );
  if (collection_titles.length < COMMAND_PLANNER_CONTEXT_CAPS.collections) {
    for (const [collection_id, title] of titleByCollection) {
      if (collection_titles.some((row) => row.collection_id === collection_id)) continue;
      collection_titles.push({ collection_id, title });
      if (collection_titles.length >= COMMAND_PLANNER_CONTEXT_CAPS.collections) break;
    }
  }

  const proposal = input.proposal
    ? {
        stage: input.proposal.stage,
        pending_count:
          input.proposal.snapshot.post_ids.length - input.proposal.exclude_post_ids.length,
        frozen_count: input.proposal.frozen_post_ids.length,
        exclude_count: input.proposal.exclude_post_ids.length,
        frozen_post_ids: input.proposal.frozen_post_ids.slice(
          0,
          COMMAND_PLANNER_CONTEXT_CAPS.frozen_ids
        ),
        plan: input.proposal.plan
          ? {
              weekday: input.proposal.plan.weekday,
              interval_days: input.proposal.plan.interval_days,
              start_local: input.proposal.plan.start_local
            }
          : null
      }
    : null;

  const clarification = input.clarification_choice?.trim();
  const raw: CommandPlannerContext = {
    schema_version: COMMAND_PLANNER_CONTEXT_SCHEMA_VERSION,
    stage: input.proposal?.stage ?? "idle",
    destinations: [...COMMAND_DESTINATION_KEYS],
    tags,
    collection_titles,
    title_vocabulary: uniqueCap(titles, COMMAND_PLANNER_CONTEXT_CAPS.titles, (title) => title),
    proposal,
    ...(clarification ? { clarification_choice: clarification } : {})
  };

  return redactCommandMcpValue(raw) as CommandPlannerContext;
}
