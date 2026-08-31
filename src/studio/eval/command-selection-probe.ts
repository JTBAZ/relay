/**
 * Completeness / perf probe for command `search_library` (RC-P5-T05).
 * In-memory over a loaded catalog. Does not add indexes. No embeddings.
 */
import type { PrismaClient } from "@prisma/client";
import { PostPublishState, PostUpstreamStatus } from "@prisma/client";
import { itemMatchesFreeTextQuery } from "../../gallery/query.js";
import type { CommandSelectionQuery } from "../command/contracts.js";
import { loadCommandLibraryItemsFromDb } from "../command/library-items-from-db.js";
import { searchLibrary, type CommandLibraryItem } from "../command/selection.js";
import { STUDIO_LAB2_CREATOR_ID, loadStudioLab2Corpus } from "../lab2/corpus-spec.js";
import { commandLibraryItemsFromLab2Corpus } from "./library-items-from-corpus.js";

export const COMMAND_SELECTION_WARM_BUDGET_MS = 1000;
export const PILOT_DEV_AVA_CREATOR_ID = "rcx_pilot_dev_ava";

/** Proposed only if this probe records a miss. Not applied. Hosted apply is HUMAN-MIGRATE. */
export const COMMAND_SELECTION_PROPOSED_INDEX_SQL = [
  "-- RC-P5-T05 proposed (not applied). Hosted deploy is HUMAN-MIGRATE.",
  "CREATE EXTENSION IF NOT EXISTS pg_trgm;",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS post_versions_title_trgm",
  "  ON post_versions USING gin (title gin_trgm_ops);",
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS post_versions_description_trgm",
  "  ON post_versions USING gin (description gin_trgm_ops);"
].join("\n");

export const COMMAND_SELECTION_PROPOSED_ROLLBACK_SQL = [
  "DROP INDEX CONCURRENTLY IF EXISTS post_versions_title_trgm;",
  "DROP INDEX CONCURRENTLY IF EXISTS post_versions_description_trgm;"
].join("\n");

export type CommandSelectionProbeQuery = {
  name: string;
  query: CommandSelectionQuery;
};

export type CommandSelectionProbeCaseResult = {
  name: string;
  catalog_post_count: number;
  expected_match_count: number;
  snapshot_size: number;
  complete: boolean;
  completeness_ok: boolean;
  samples_ms: number[];
  p50_ms: number;
  p95_ms: number;
  budget_ms: number;
  within_budget: boolean;
};

export type CommandSelectionProbeCorpusResult = {
  label: string;
  creator_id: string;
  catalog_post_count: number;
  catalog_row_count: number;
  db_published_post_count: number | null;
  loader_complete: boolean;
  load_ms: number | null;
  cases: CommandSelectionProbeCaseResult[];
};

export type CommandSelectionProbeReport = {
  ok: boolean;
  index_recommendation: "no_index" | "sql_proposed";
  proposed_sql: string | null;
  rollback_sql: string | null;
  budget_ms: number;
  corpora: CommandSelectionProbeCorpusResult[];
};

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

export function uniquePostIds(items: readonly CommandLibraryItem[]): string[] {
  return [...new Set(items.map((it) => it.post_id))];
}

function independentMatchPostIds(
  items: readonly CommandLibraryItem[],
  query: CommandSelectionQuery
): string[] {
  const hits = items.filter((item) => {
    if (query.q && query.q.trim() && !itemMatchesFreeTextQuery(item, query.q)) return false;
    if (query.tag_ids && query.tag_ids.length > 0) {
      for (const tag of query.tag_ids) {
        if (!item.tag_ids.includes(tag)) return false;
      }
    }
    if (query.date_from && item.published_at < query.date_from) return false;
    if (query.date_to && item.published_at > query.date_to) return false;
    return true;
  });
  return uniquePostIds(hits);
}

export function defaultProbeQueries(): CommandSelectionProbeQuery[] {
  return [
    { name: "q_hero", query: { q: "Hero Academy" } },
    { name: "tag_ids_watercolor_and_landscape", query: { tag_ids: ["sl2_tag_watercolor", "sl2_tag_landscape"] } },
    {
      name: "date_range_2025_2026",
      query: {
        date_from: "2025-01-01T00:00:00.000Z",
        date_to: "2026-12-31T23:59:59.000Z"
      }
    }
  ];
}

function runCase(
  items: readonly CommandLibraryItem[],
  spec: CommandSelectionProbeQuery,
  samples: number,
  budgetMs: number,
  creatorId: string
): CommandSelectionProbeCaseResult {
  const catalogPostCount = uniquePostIds(items).length;
  const expectedIds = independentMatchPostIds(items, spec.query);
  const samplesMs: number[] = [];
  let lastIds: string[] = [];
  let complete = false;
  for (let i = 0; i < samples; i += 1) {
    const t0 = performance.now();
    const { selection } = searchLibrary(items, spec.query, {
      catalog_complete: true,
      creator_id: creatorId,
      created_at: "2026-01-01T00:00:00.000Z"
    });
    samplesMs.push(Math.round(performance.now() - t0));
    lastIds = selection.post_ids;
    complete = selection.complete === true;
  }
  const sameSet =
    lastIds.length === expectedIds.length &&
    [...lastIds].sort().every((id, i) => id === [...expectedIds].sort()[i]);
  const p95 = percentile(samplesMs, 95);
  return {
    name: spec.name,
    catalog_post_count: catalogPostCount,
    expected_match_count: expectedIds.length,
    snapshot_size: lastIds.length,
    complete,
    completeness_ok: complete && sameSet,
    samples_ms: samplesMs,
    p50_ms: percentile(samplesMs, 50),
    p95_ms: p95,
    budget_ms: budgetMs,
    within_budget: p95 <= budgetMs
  };
}

export function probeCommandSelectionCatalog(input: {
  label: string;
  creatorId: string;
  items: readonly CommandLibraryItem[];
  queries?: readonly CommandSelectionProbeQuery[];
  samples?: number;
  budgetMs?: number;
  loadMs?: number | null;
  dbPublishedPostCount?: number | null;
}): CommandSelectionProbeCorpusResult {
  const samples = Math.max(1, input.samples ?? 7);
  const budgetMs = input.budgetMs ?? COMMAND_SELECTION_WARM_BUDGET_MS;
  const queries = input.queries ?? defaultProbeQueries();
  const catalogPostCount = uniquePostIds(input.items).length;
  const loaderComplete =
    input.dbPublishedPostCount == null || input.dbPublishedPostCount === catalogPostCount;
  return {
    label: input.label,
    creator_id: input.creatorId,
    catalog_post_count: catalogPostCount,
    catalog_row_count: input.items.length,
    db_published_post_count: input.dbPublishedPostCount ?? null,
    loader_complete: loaderComplete,
    load_ms: input.loadMs ?? null,
    cases: queries.map((q) => runCase(input.items, q, samples, budgetMs, input.creatorId))
  };
}

/** Repeat Lab 2 rows with new ids so in-memory timing has a larger catalog when Dev Ava is unavailable. */
export function scaleCommandLibraryItems(
  items: readonly CommandLibraryItem[],
  copies: number,
  prefix: string
): CommandLibraryItem[] {
  const out: CommandLibraryItem[] = [];
  for (let i = 0; i < copies; i += 1) {
    const tag = `${prefix}${i}_`;
    for (const item of items) {
      out.push({
        ...item,
        post_id: `${tag}${item.post_id}`,
        media_id: `${tag}${item.media_id}`
      });
    }
  }
  return out;
}

export function assembleCommandSelectionProbeReport(
  corpora: readonly CommandSelectionProbeCorpusResult[]
): CommandSelectionProbeReport {
  const budgetMs = COMMAND_SELECTION_WARM_BUDGET_MS;
  const miss = corpora.some(
    (c) =>
      !c.loader_complete ||
      c.cases.some((k) => !k.completeness_ok || !k.within_budget)
  );
  return {
    ok: !miss,
    index_recommendation: miss ? "sql_proposed" : "no_index",
    proposed_sql: miss ? COMMAND_SELECTION_PROPOSED_INDEX_SQL : null,
    rollback_sql: miss ? COMMAND_SELECTION_PROPOSED_ROLLBACK_SQL : null,
    budget_ms: budgetMs,
    corpora: [...corpora]
  };
}

export function probeLab2JsonCatalog(options: {
  samples?: number;
  budgetMs?: number;
} = {}): CommandSelectionProbeCorpusResult {
  const lab2 = loadStudioLab2Corpus();
  const items = commandLibraryItemsFromLab2Corpus(lab2);
  return probeCommandSelectionCatalog({
    label: "lab2_json",
    creatorId: STUDIO_LAB2_CREATOR_ID,
    items,
    samples: options.samples,
    budgetMs: options.budgetMs
  });
}

export async function countPublishedPosts(
  prisma: PrismaClient,
  creatorId: string
): Promise<number> {
  return prisma.post.count({
    where: {
      creatorId,
      publishState: PostPublishState.published,
      upstreamStatus: { not: PostUpstreamStatus.deleted }
    }
  });
}

export async function probeCreatorDbCatalog(
  prisma: PrismaClient,
  input: {
    label: string;
    creatorId: string;
    samples?: number;
    budgetMs?: number;
  }
): Promise<CommandSelectionProbeCorpusResult> {
  const t0 = performance.now();
  const items = await loadCommandLibraryItemsFromDb(prisma, input.creatorId);
  const loadMs = Math.round(performance.now() - t0);
  const dbCount = await countPublishedPosts(prisma, input.creatorId);
  return probeCommandSelectionCatalog({
    label: input.label,
    creatorId: input.creatorId,
    items,
    samples: input.samples,
    budgetMs: input.budgetMs,
    loadMs,
    dbPublishedPostCount: dbCount
  });
}

export async function runCommandSelectionProbe(options: {
  prisma?: PrismaClient | null;
  samples?: number;
  budgetMs?: number;
} = {}): Promise<CommandSelectionProbeReport> {
  const samples = options.samples ?? 7;
  const budgetMs = options.budgetMs ?? COMMAND_SELECTION_WARM_BUDGET_MS;
  const corpora: CommandSelectionProbeCorpusResult[] = [
    probeLab2JsonCatalog({ samples, budgetMs })
  ];

  if (options.prisma) {
    corpora.push(
      await probeCreatorDbCatalog(options.prisma, {
        label: "lab2_db",
        creatorId: STUDIO_LAB2_CREATOR_ID,
        samples,
        budgetMs
      })
    );
    corpora.push(
      await probeCreatorDbCatalog(options.prisma, {
        label: "dev_ava_db",
        creatorId: PILOT_DEV_AVA_CREATOR_ID,
        samples,
        budgetMs
      })
    );
  } else {
    const lab2 = loadStudioLab2Corpus();
    const scaled = scaleCommandLibraryItems(commandLibraryItemsFromLab2Corpus(lab2), 3, "syn_");
    corpora.push(
      probeCommandSelectionCatalog({
        label: "synthetic_3x_lab2",
        creatorId: "cr_synthetic_scale",
        items: scaled,
        samples,
        budgetMs
      })
    );
  }

  return assembleCommandSelectionProbeReport(corpora);
}
