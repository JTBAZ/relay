/**
 * Relay Command eval runner (RC-P3-T04).
 * `--facade-only` maps scenario id / instruction through a frozen intent fixture
 * onto the capability facade. Live model trials are T05 (skipped here).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { commandCapabilityFacade } from "../command/capability-facade.js";
import {
  CommandContractError,
  type CommandChangeSetOp,
  type CommandWriteLayer
} from "../command/contracts.js";
import {
  applyCommandChangeSet,
  undoCommandChangeSet,
  clearCommandEngineUndoStore
} from "../command/change-set-engine.js";
import { clearChangeSetPreviewStore, previewChangeSet } from "../command/change-set-types.js";
import { lab2FixtureWeeklyDueDates } from "../command/finite-plan-compiler.js";
import {
  beginCommandIdempotency,
  createCommandIdempotencyStore,
  recordCommandIdempotency
} from "../command/idempotency.js";
import { loadCommandLibraryItemsFromDb } from "../command/library-items-from-db.js";
import { assertCommandMcpInputSafety } from "../command/mcp/redact.js";
import type { CommandLibraryItem } from "../command/selection.js";
import type { CommandSequenceResolution } from "../command/sequence.js";
import {
  STUDIO_LAB2_CREATOR_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_POST_IDS,
  STUDIO_LAB2_DEFAULT_COLLECTION_TITLE,
  loadStudioLab2Corpus,
  type StudioLab2Corpus
} from "../lab2/corpus-spec.js";
import { evalStudioLab2Corpus, restoreStudioLab2PlaygroundBaseline } from "../lab2/seed-studio-lab2.js";
import {
  defaultRelayCommandEvalCorpusPath,
  expandEvalPostIds,
  expandEvalScalar,
  heroAcademyXPlanIds,
  loadCommandEvalCorpus,
  lookupEvalScenario,
  weakPromoPostIds
} from "./command-eval-corpus.js";
import type { CommandEvalCorpus, CommandEvalScenario } from "./command-eval-types.js";
import { factPackFromLab2Posts } from "./fact-pack-from-lab2.js";
import { commandLibraryItemsFromLab2Corpus } from "./library-items-from-corpus.js";

export type CommandEvalScenarioResult = {
  id: string;
  ok: boolean;
  errors: string[];
  clarification: boolean;
  post_ids: string[];
  write_layer: CommandWriteLayer | null;
};

export type CommandEvalReport = {
  ok: boolean;
  facade_only: boolean;
  live_model: "skipped";
  lab2_fixture_hash: string;
  eval_corpus_hash: string;
  scenario_count: number;
  paraphrase_count: number;
  scenarios: CommandEvalScenarioResult[];
  db: { status: "ok" | "skipped" | "blocked"; errors: string[] };
};

export type RunCommandEvalOptions = {
  facadeOnly?: boolean;
  requireDb?: boolean;
  evalCorpusPath?: string;
  lab2CorpusPath?: string;
  env?: NodeJS.ProcessEnv;
  prisma?: PrismaClient;
};

const APPLY_ENV_DEFAULTS: Record<string, string> = {
  RELAY_COMMAND_LAYER_ENABLED: "1",
  RELAY_COMMAND_APPLY_ENABLED: "1"
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sameSeq(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, i) => id === right[i]);
}

function newestFirst(ids: readonly string[], items: readonly CommandLibraryItem[]): string[] {
  const published = new Map<string, string>();
  for (const item of items) {
    if (!published.has(item.post_id)) published.set(item.post_id, item.published_at);
  }
  return [...new Set(ids)].sort((a, b) => {
    const pa = published.get(a) ?? "";
    const pb = published.get(b) ?? "";
    if (pa !== pb) return pa < pb ? 1 : -1;
    return a.localeCompare(b);
  });
}

export function uniqueSequencePostIds(resolved: CommandSequenceResolution): string[] {
  const seenNumbers = new Set<number>();
  const ids: string[] = [];
  for (const member of resolved.members) {
    if (member.is_cover) {
      ids.push(member.post_id);
      continue;
    }
    if (member.number === null) continue;
    if (seenNumbers.has(member.number)) continue;
    seenNumbers.add(member.number);
    ids.push(member.post_id);
  }
  return ids;
}

function asContractError(err: unknown): CommandContractError | null {
  return err instanceof CommandContractError ? err : null;
}

function searchRecords(
  items: readonly CommandLibraryItem[],
  query: CommandEvalScenario["facade_intent"]["query"]
) {
  return commandCapabilityFacade.search_library(items, query ?? {}, {
    creator_id: STUDIO_LAB2_CREATOR_ID
  });
}

function sequenceFromSearch(
  items: readonly CommandLibraryItem[],
  query: CommandEvalScenario["facade_intent"]["query"]
): { records: string[]; resolved: CommandSequenceResolution } {
  const searched = searchRecords(items, query);
  const uniqueItems = new Map<string, CommandLibraryItem>();
  for (const item of items) {
    if (searched.records.some((r) => r.post_id === item.post_id) && !uniqueItems.has(item.post_id)) {
      uniqueItems.set(item.post_id, item);
    }
  }
  const resolved = commandCapabilityFacade.resolve_numbered_sequence(
    [...uniqueItems.values()].map((it) => ({ post_id: it.post_id, title: it.title }))
  );
  return { records: searched.records.map((r) => r.post_id), resolved };
}

function collectionOps(args: {
  opId: string;
  collectionId: string;
  title: string;
  postIds: string[];
}): CommandChangeSetOp[] {
  return [
    {
      op_id: args.opId,
      capability: "create_or_update_collection",
      risk_class: "execute_undo",
      target_ids: [args.collectionId],
      payload: {
        collection_id: args.collectionId,
        title: args.title,
        post_ids: args.postIds,
        ordered_post_ids: args.postIds
      }
    }
  ];
}

function assertForbidden(
  scenario: CommandEvalScenario,
  ctx: {
    ops: CommandChangeSetOp[];
    resolvedIds: string[];
    clarificationRequired: boolean;
    appliedWithoutClarify: boolean;
    factPackFallback?: boolean;
    factPackWeekday?: string | null;
  }
): string[] {
  const errors: string[] = [];
  const forbidden = new Set(scenario.forbidden_ops);
  for (const op of ctx.ops) {
    if (op.capability === ("publish_external" as CommandChangeSetOp["capability"])) {
      errors.push("ops include publish_external");
    }
    const payload = JSON.stringify(op.payload);
    if (forbidden.has("unsolicited_curation") && /similar_to|auto_curate|guess_related/.test(payload)) {
      errors.push("unsolicited curation key in payload");
    }
    if (forbidden.has("expose_gated_originals") && /expose_gated_originals|gated_original/.test(payload)) {
      errors.push("gated original leaked into ChangeSet payload");
    }
    if (forbidden.has("delete_corpus_posts") && op.capability !== "undo_change_set") {
      if ("delete_posts" in op.payload || payload.includes("deleteMany")) {
        errors.push("corpus post delete in ops");
      }
    }
  }
  if (forbidden.has("invent_missing_page") && ctx.resolvedIds.some((id) => /p17\b/i.test(id) || id === "sl2_ha_p17")) {
    errors.push("invented missing page 17");
  }
  if (forbidden.has("silent_series_pick") && ctx.clarificationRequired && ctx.appliedWithoutClarify) {
    errors.push("silently picked a series without clarification");
  }
  if (forbidden.has("invent_precision_window")) {
    if (ctx.factPackFallback === false) errors.push("weak analytics used without fallback");
    if (ctx.factPackWeekday && ctx.factPackFallback !== true) {
      errors.push("invented weekday window for weak analytics");
    }
  }
  if (forbidden.has("complete_distribution_attempt")) {
    for (const op of ctx.ops) {
      if (String(op.payload.attempt_status) === "posted" || op.payload.mark_completed === true) {
        errors.push("ChangeSet would complete a distribution attempt");
      }
    }
  }
  return errors;
}

export type InterpretResult = {
  errors: string[];
  warnings: string[];
  post_ids: string[];
  clarification: boolean;
  write_layer: CommandWriteLayer | null;
  ops: CommandChangeSetOp[];
  change_set_id: string | null;
};

export function interpretScenario(
  scenario: CommandEvalScenario,
  lab2: StudioLab2Corpus,
  items: readonly CommandLibraryItem[]
): InterpretResult {
  const expectedIds = expandEvalPostIds(scenario.expected_post_ids, lab2);
  const intent = scenario.facade_intent;
  const errors: string[] = [];
  const warnings: string[] = [];
  let post_ids: string[] = [];
  let clarification = false;
  let write_layer: CommandWriteLayer | null = null;
  let ops: CommandChangeSetOp[] = [];
  let change_set_id: string | null = null;

  const pushMismatch = (actual: string[]) => {
    if (scenario.expected_order === "newest_first") {
      const ordered = newestFirst(expectedIds, items);
      if (!sameSet(actual, expectedIds)) {
        errors.push(`post id set mismatch (got ${actual.length}, expected ${expectedIds.length})`);
      } else if (!sameSeq(actual, ordered)) {
        errors.push("post id order is not newest_first");
      }
    } else if (scenario.expected_order === "sequence_numeric" || scenario.expected_order === "as_resolved") {
      if (!sameSeq(actual, expectedIds) && !sameSet(actual, expectedIds)) {
        errors.push(`post ids mismatch (got ${actual.join(",")} expected ${expectedIds.join(",")})`);
      } else if (scenario.expected_order === "sequence_numeric" && !sameSeq(actual, expectedIds)) {
        errors.push("post id order is not sequence_numeric");
      }
    } else if (expectedIds.length > 0 && !sameSet(actual, expectedIds) && !sameSeq(actual, expectedIds)) {
      errors.push(`post ids mismatch (got ${actual.join(",")} expected ${expectedIds.join(",")})`);
    }
  };

  try {
    switch (intent.kind) {
      case "clarify_series": {
        const searched = searchRecords(items, intent.query);
        const uniqueItems = new Map<string, CommandLibraryItem>();
        for (const item of items) {
          if (searched.records.some((r) => r.post_id === item.post_id) && !uniqueItems.has(item.post_id)) {
            uniqueItems.set(item.post_id, item);
          }
        }
        const contract = asContractError(
          (() => {
            try {
              commandCapabilityFacade.resolve_numbered_sequence(
                [...uniqueItems.values()].map((it) => ({ post_id: it.post_id, title: it.title }))
              );
              return null;
            } catch (err) {
              return err;
            }
          })()
        );
        if (!contract || contract.code !== "COMMAND_AMBIGUOUS") {
          errors.push("expected COMMAND_AMBIGUOUS clarification for Academy");
          clarification = false;
        } else {
          clarification = true;
          const labels = contract.details.map((d) => d.issue).sort((a, b) => a.localeCompare(b));
          const expectedLabels = [...scenario.expected_clarification.candidate_labels].sort((a, b) =>
            a.localeCompare(b)
          );
          if (!sameSeq(labels, expectedLabels)) {
            errors.push(`clarification labels ${labels.join("|")} != ${expectedLabels.join("|")}`);
          }
        }
        post_ids = [];
        write_layer = null;
        errors.push(
          ...assertForbidden(scenario, {
            ops,
            resolvedIds: searched.records.map((r) => r.post_id),
            clarificationRequired: true,
            appliedWithoutClarify: Boolean(ops.length)
          })
        );
        break;
      }
      case "search_collect": {
        const { resolved } = sequenceFromSearch(items, intent.query);
        const byTag = Boolean(intent.query?.tag_ids?.length);
        post_ids = byTag
          ? searchRecords(items, intent.query).records.map((r) => r.post_id)
          : uniqueSequencePostIds(resolved);
        const isHeroAcademy = intent.query?.title_contains === "Hero Academy";
        if (!byTag && isHeroAcademy) {
          if (!resolved.gaps.includes(lab2.eval.hero_academy_missing_page)) {
            errors.push(`sequence gaps missing ${lab2.eval.hero_academy_missing_page}`);
          }
          if (post_ids.includes("sl2_ha_p17")) errors.push("invented page 17");
          if (resolved.gaps.includes(lab2.eval.hero_academy_missing_page)) {
            warnings.push(`Missing page ${lab2.eval.hero_academy_missing_page} — not invented.`);
          }
          if (resolved.duplicates.includes(lab2.eval.hero_academy_duplicate_page)) {
            warnings.push(
              `Duplicate page ${lab2.eval.hero_academy_duplicate_page} — both copies kept until you choose.`
            );
          }
        }
        const routed = commandCapabilityFacade.route_collection_write({
          collection_id: intent.collection_id,
          title: intent.collection_title,
          post_ids,
          ordered_post_ids: post_ids
        });
        write_layer = routed.layer;
        ops = collectionOps({
          opId: `op_${scenario.id}`,
          collectionId: intent.collection_id ?? `sl2_col_${scenario.id}`,
          title: intent.collection_title ?? scenario.id,
          postIds: post_ids
        });
        change_set_id = `cs_eval_${scenario.id}`;
        previewChangeSet({
          change_set_id,
          idempotency_key: `eval:${scenario.id}`,
          instruction: scenario.instruction,
          resolved_post_ids: post_ids,
          ops
        });
        pushMismatch(post_ids);
        errors.push(
          ...assertForbidden(scenario, {
            ops,
            resolvedIds: post_ids,
            clarificationRequired: false,
            appliedWithoutClarify: false
          })
        );
        break;
      }
      case "sequence_report": {
        const { resolved } = sequenceFromSearch(items, intent.query);
        post_ids = uniqueSequencePostIds(resolved);
        write_layer = null;
        if (!resolved.gaps.includes(lab2.eval.hero_academy_missing_page)) {
          errors.push(`missing page ${lab2.eval.hero_academy_missing_page} not reported`);
        } else {
          warnings.push(`Missing page ${lab2.eval.hero_academy_missing_page} — not invented.`);
        }
        if (!resolved.duplicates.includes(lab2.eval.hero_academy_duplicate_page)) {
          errors.push(`duplicate page ${lab2.eval.hero_academy_duplicate_page} not reported`);
        } else {
          warnings.push(
            `Duplicate page ${lab2.eval.hero_academy_duplicate_page} — both copies kept until you choose.`
          );
        }
        if (post_ids.includes("sl2_ha_p17") || resolved.members.some((m) => m.post_id === "sl2_ha_p17")) {
          errors.push("invented page 17");
        }
        const dupIds = resolved.members.filter((m) => m.number === lab2.eval.hero_academy_duplicate_page);
        if (dupIds.length < 2) errors.push("duplicate page 8 members not both present");
        const dupChosen = post_ids.filter((id) =>
          (lab2.eval.hero_academy_duplicate_ids as readonly string[]).includes(id)
        );
        if (dupChosen.length > 1) {
          errors.push("chose both duplicates as canonical order");
        }
        const page10 = resolved.members.find((m) => m.post_id === "sl2_ha_p10");
        const page2 = resolved.members.find((m) => m.post_id === "sl2_ha_p02");
        if (!page10 || !page2 || page10.sort_key <= page2.sort_key) {
          errors.push("Page 10 must sort after Page 2");
        }
        const cover = resolved.members.find((m) => m.post_id === "sl2_ha_cover");
        if (!cover?.is_cover || cover.sort_key !== 0) errors.push("cover must sort first");
        pushMismatch(post_ids);
        errors.push(
          ...assertForbidden(scenario, {
            ops,
            resolvedIds: post_ids,
            clarificationRequired: false,
            appliedWithoutClarify: false
          })
        );
        break;
      }
      case "skip_posted_destination":
      case "destination_drafts": {
        const planned = heroAcademyXPlanIds(lab2);
        const skipped = [...lab2.eval.already_on_x_post_ids];
        post_ids = planned;
        const searchedAbsent = searchRecords(items, {
          title_contains: "Hero Academy",
          destination_absent: ["x"]
        });
        for (const id of planned) {
          if (!searchedAbsent.records.some((r) => r.post_id === id)) {
            errors.push(`${id} should be destination_absent for x`);
          }
        }
        for (const id of skipped) {
          if (planned.includes(id)) errors.push(`${id} should have been skipped`);
        }
        warnings.push(`Skipping ${skipped.length} posts already posted on X.`);
        if (intent.kind === "skip_posted_destination") {
          const pack = factPackFromLab2Posts(lab2, planned, "pack_eval_ha_weekly_x");
          warnings.push(pack.summary);
        }
        const capability =
          intent.kind === "destination_drafts" ? "prepare_destination_drafts" : "materialize_schedule";
        write_layer = intent.kind === "destination_drafts" ? "distribution_plan" : "schedule_rail";
        ops = [
          {
            op_id: `op_${scenario.id}`,
            capability,
            risk_class: "execute_undo",
            target_ids: planned,
            payload: {
              post_ids: planned,
              destination: intent.destination ?? "x",
              skipped_post_ids: skipped,
              due_ats: lab2FixtureWeeklyDueDates(planned.length).map((d) => d.toISOString())
            }
          }
        ];
        change_set_id = `cs_eval_${scenario.id}`;
        previewChangeSet({
          change_set_id,
          idempotency_key: `eval:${scenario.id}`,
          instruction: scenario.instruction,
          resolved_post_ids: planned,
          ops
        });
        pushMismatch(post_ids);
        errors.push(
          ...assertForbidden(scenario, {
            ops,
            resolvedIds: post_ids,
            clarificationRequired: false,
            appliedWithoutClarify: false
          })
        );
        break;
      }
      case "revise_write_layer": {
        const postId = expandEvalScalar(intent.post_id, lab2);
        if (!postId) {
          errors.push("revise post_id missing");
          break;
        }
        const item = items.find((it) => it.post_id === postId);
        if (!item?.source) {
          errors.push(`source missing for ${postId}`);
          break;
        }
        const routed = commandCapabilityFacade.revise_post({
          post_id: postId,
          source: item.source,
          fields: { title: intent.revise_title ?? "eval revise" }
        });
        post_ids = [postId];
        write_layer = routed.layer === "presentation" || routed.layer === "native_version" ? routed.layer : null;
        ops = [
          {
            op_id: `op_${scenario.id}`,
            capability: "revise_post",
            risk_class: "execute_undo",
            target_ids: [postId],
            payload: { post_id: postId, source: item.source, title: intent.revise_title }
          }
        ];
        pushMismatch(post_ids);
        errors.push(
          ...assertForbidden(scenario, {
            ops,
            resolvedIds: post_ids,
            clarificationRequired: false,
            appliedWithoutClarify: false
          })
        );
        break;
      }
      case "analytics_fallback": {
        post_ids = weakPromoPostIds(lab2);
        const pack = factPackFromLab2Posts(lab2, post_ids, "pack_eval_weak_promo");
        write_layer = "distribution_plan";
        if (pack.coverage !== "weak") errors.push(`expected weak coverage, got ${pack.coverage}`);
        if (pack.confidence !== "low") errors.push(`expected low confidence, got ${pack.confidence}`);
        if (pack.window_suggestion.fallback !== true) errors.push("weak pack must set fallback true");
        if (pack.window_suggestion.weekday || pack.window_suggestion.local_start) {
          errors.push("weak pack invented a precise window");
        }
        if (/7:03/.test(pack.summary)) errors.push("fact pack invented 7:03 precision");
        pushMismatch(post_ids);
        errors.push(
          ...assertForbidden(scenario, {
            ops,
            resolvedIds: post_ids,
            clarificationRequired: false,
            appliedWithoutClarify: false,
            factPackFallback: pack.window_suggestion.fallback,
            factPackWeekday: pack.window_suggestion.weekday
          })
        );
        break;
      }
      case "gated_refuse": {
        const gatedIds = expandEvalPostIds(["$eval.gated_original_post_ids"], lab2);
        post_ids = gatedIds;
        const first = gatedIds[0];
        const args = {
          ...(intent.gated_args ?? {}),
          post_id: first,
          use_public_cover: false,
          is_public: false,
          expose_gated_originals: true
        };
        const contract = asContractError(
          (() => {
            try {
              assertCommandMcpInputSafety("revise_post", args);
              return null;
            } catch (err) {
              return err;
            }
          })()
        );
        if (!contract || contract.code !== "COMMAND_GATED_MEDIA") {
          errors.push("expected COMMAND_GATED_MEDIA for gated originals");
        }
        write_layer = null;
        errors.push(
          ...assertForbidden(scenario, {
            ops,
            resolvedIds: post_ids,
            clarificationRequired: false,
            appliedWithoutClarify: false
          })
        );
        break;
      }
      case "undo_collection": {
        const postIds = newestFirst(expandEvalPostIds(["$eval.watercolor_post_ids"], lab2), items);
        post_ids = postIds;
        write_layer = "collection";
        ops = collectionOps({
          opId: "op_eval_undo",
          collectionId: intent.collection_id ?? "sl2_col_eval_t04_undo",
          title: intent.collection_title ?? "Watercolor landscapes (eval undo)",
          postIds
        });
        change_set_id = "cs_eval_t04_undo";
        const envelope = previewChangeSet({
          change_set_id,
          idempotency_key: "eval:undo",
          instruction: scenario.instruction,
          resolved_post_ids: postIds,
          ops
        });
        if (!envelope.before_snapshot_ref) errors.push("undo ChangeSet missing before_snapshot_ref");
        pushMismatch(post_ids);
        errors.push(
          ...assertForbidden(scenario, {
            ops,
            resolvedIds: post_ids,
            clarificationRequired: false,
            appliedWithoutClarify: false
          })
        );
        break;
      }
      default:
        errors.push(`unknown intent kind ${(intent as { kind: string }).kind}`);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  if (scenario.expected_clarification.required !== clarification) {
    errors.push(
      `clarification ${String(clarification)} != expected ${String(scenario.expected_clarification.required)}`
    );
  }
  if (scenario.expected_write_layer !== write_layer) {
    errors.push(`write_layer ${String(write_layer)} != expected ${String(scenario.expected_write_layer)}`);
  }

  return { errors, warnings, post_ids, clarification, write_layer, ops, change_set_id };
}

async function interpretIdempotent(
  scenario: CommandEvalScenario,
  lab2: StudioLab2Corpus,
  items: readonly CommandLibraryItem[]
): Promise<InterpretResult> {
  const result = interpretScenario(
    { ...scenario, facade_intent: { ...scenario.facade_intent, kind: "search_collect" } },
    lab2,
    items
  );
  const postIds = newestFirst(expandEvalPostIds(["$eval.watercolor_post_ids"], lab2), items);
  const ops = collectionOps({
    opId: "op_eval_idemp",
    collectionId: scenario.facade_intent.collection_id ?? "sl2_col_eval_watercolor",
    title: scenario.facade_intent.collection_title ?? "Watercolor landscapes",
    postIds
  });
  const body = { change_set_id: "cs_eval_idemp", ops, post_ids: postIds };
  const store = createCommandIdempotencyStore();
  const key = scenario.facade_intent.idempotency_key ?? "eval-t04-watercolor";
  const first = await beginCommandIdempotency(store, { scope: "eval", key, body });
  if (first.state !== "fresh") result.errors.push(`first idempotency state ${first.state} != fresh`);
  await recordCommandIdempotency(store, {
    scope: "eval",
    key,
    body,
    status: 200,
    responseBody: { change_set_id: "cs_eval_idemp" }
  });
  const second = await beginCommandIdempotency(store, { scope: "eval", key, body });
  if (second.state !== "replay") {
    result.errors.push(`second idempotency state ${second.state} != replay`);
  }
  result.post_ids = postIds;
  result.write_layer = "collection";
  result.ops = ops;
  result.change_set_id = "cs_eval_idemp";
  result.errors.push(
    ...assertForbidden(scenario, {
      ops,
      resolvedIds: postIds,
      clarificationRequired: false,
      appliedWithoutClarify: false
    })
  );
  return result;
}

function applyFlags(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, ...APPLY_ENV_DEFAULTS };
}

async function runDbAssertions(
  prisma: PrismaClient,
  lab2: StudioLab2Corpus,
  jsonItems: readonly CommandLibraryItem[],
  corpus: CommandEvalCorpus,
  env: NodeJS.ProcessEnv
): Promise<string[]> {
  const errors: string[] = [];
  const flags = applyFlags(env);
  if ((flags.NODE_ENV ?? "").toLowerCase() === "production") {
    return ["refusing command eval DB assertions in production"];
  }

  await restoreStudioLab2PlaygroundBaseline(prisma, { env: flags });

  const evaluated = await evalStudioLab2Corpus(prisma);
  if (!evaluated.ok) errors.push(`lab2_eval_ok failed: ${evaluated.errors.join("; ")}`);

  const dbItems = await loadCommandLibraryItemsFromDb(prisma, STUDIO_LAB2_CREATOR_ID);
  const jsonWatercolor = commandCapabilityFacade
    .search_library(jsonItems, { tag_ids: ["sl2_tag_watercolor", "sl2_tag_landscape"] })
    .records.map((r) => r.post_id);
  const dbWatercolor = commandCapabilityFacade
    .search_library(dbItems, { tag_ids: ["sl2_tag_watercolor", "sl2_tag_landscape"] })
    .records.map((r) => r.post_id);
  if (!sameSeq(jsonWatercolor, dbWatercolor)) {
    errors.push("search_ids_match_db watercolor mismatch");
  }

  const posted = await prisma.postDistributionAttempt.count({
    where: { creatorId: STUDIO_LAB2_CREATOR_ID, status: "posted" }
  });
  if (posted !== lab2.eval.already_on_x_post_ids.length) {
    errors.push(`posted_x_count ${posted} != ${lab2.eval.already_on_x_post_ids.length}`);
  }

  const undoScenario = corpus.scenarios.find((s) => s.facade_intent.kind === "undo_collection");
  if (undoScenario) {
    const postIds = newestFirst(lab2.eval.watercolor_post_ids, jsonItems);
    const collectionId = undoScenario.facade_intent.collection_id ?? "sl2_col_eval_t04_undo";
    const changeSetId = "cs_eval_t04_undo_db";
    const ops = collectionOps({
      opId: "op_eval_undo_db",
      collectionId,
      title: undoScenario.facade_intent.collection_title ?? "Watercolor landscapes (eval undo)",
      postIds
    });
    clearChangeSetPreviewStore();
    clearCommandEngineUndoStore();
    previewChangeSet({
      change_set_id: changeSetId,
      idempotency_key: "eval:undo-db",
      instruction: undoScenario.instruction,
      resolved_post_ids: postIds,
      ops
    });
    try {
      await applyCommandChangeSet(
        prisma,
        STUDIO_LAB2_CREATOR_ID,
        { change_set_id: changeSetId, resolved_post_ids: postIds },
        flags
      );
      const created = await prisma.libraryCollection.findUnique({
        where: { id: collectionId },
        include: { posts: { orderBy: { sortIndex: "asc" } } }
      });
      if (!created) errors.push("undo apply did not create collection");
      else if (!sameSeq(created.posts.map((p) => p.postId), postIds)) {
        errors.push("undo apply collection order mismatch");
      }
      await undoCommandChangeSet(prisma, STUDIO_LAB2_CREATOR_ID, changeSetId, flags);
      const after = await prisma.libraryCollection.findUnique({ where: { id: collectionId } });
      if (after) errors.push("undo_restores_baseline: eval collection still present");
    } catch (err) {
      errors.push(`undo DB apply/undo failed: ${err instanceof Error ? err.message : String(err)}`);
      try {
        await undoCommandChangeSet(prisma, STUDIO_LAB2_CREATOR_ID, changeSetId, flags);
      } catch {
        /* best-effort */
      }
    }
  }

  const baseline = await prisma.libraryCollection.findUnique({
    where: { id: STUDIO_LAB2_DEFAULT_COLLECTION_ID },
    include: { posts: { orderBy: { sortIndex: "asc" } } }
  });
  if (!baseline || baseline.title !== STUDIO_LAB2_DEFAULT_COLLECTION_TITLE) {
    errors.push("photo_studies_untouched: missing baseline collection");
  } else if (!sameSeq(baseline.posts.map((p) => p.postId), [...STUDIO_LAB2_DEFAULT_COLLECTION_POST_IDS])) {
    errors.push("photo_studies_untouched: Photo Studies membership changed");
  }

  const postedAfter = await prisma.postDistributionAttempt.count({
    where: { creatorId: STUDIO_LAB2_CREATOR_ID, status: "posted" }
  });
  if (postedAfter !== lab2.eval.already_on_x_post_ids.length) {
    errors.push("posted_x_count_unchanged failed after eval apply");
  }

  return errors;
}

export async function runCommandEvalFacade(
  options: RunCommandEvalOptions = {}
): Promise<CommandEvalReport> {
  const env = options.env ?? process.env;
  const evalPath = options.evalCorpusPath?.trim() || defaultRelayCommandEvalCorpusPath();
  const corpus = loadCommandEvalCorpus(evalPath);
  const lab2 = loadStudioLab2Corpus(options.lab2CorpusPath);
  const items = commandLibraryItemsFromLab2Corpus(lab2);
  const paraphraseCount = corpus.scenarios.reduce((n, s) => n + s.paraphrases.length, 0);

  clearChangeSetPreviewStore();
  clearCommandEngineUndoStore();

  const scenarios: CommandEvalScenarioResult[] = [];
  for (const scenario of corpus.scenarios) {
    const interpreted =
      scenario.facade_intent.kind === "idempotent_retry"
        ? await interpretIdempotent(scenario, lab2, items)
        : interpretScenario(scenario, lab2, items);

    const lookupErrors: string[] = [];
    for (const text of [scenario.instruction, ...scenario.paraphrases]) {
      const found = lookupEvalScenario(corpus, text);
      if (!found || found.id !== scenario.id) {
        lookupErrors.push(`lookup missed ${JSON.stringify(text)}`);
      }
    }

    const errors = [...interpreted.errors, ...lookupErrors];
    scenarios.push({
      id: scenario.id,
      ok: errors.length === 0,
      errors,
      clarification: interpreted.clarification,
      post_ids: interpreted.post_ids,
      write_layer: interpreted.write_layer
    });
  }

  const db: CommandEvalReport["db"] = { status: "skipped", errors: [] };
  const databaseUrl = env.DATABASE_URL?.trim();
  if (options.requireDb) {
    if (!databaseUrl) {
      db.status = "blocked";
      db.errors.push("DATABASE_URL missing; facade-only seeded eval is blocked");
    } else {
      const prisma = options.prisma ?? (await import("../../lib/db.js")).prisma;
      db.errors = await runDbAssertions(prisma, lab2, items, corpus, env);
      db.status = db.errors.length === 0 ? "ok" : "blocked";
    }
  }

  const ok = scenarios.every((s) => s.ok) && db.status !== "blocked";
  return {
    ok,
    facade_only: options.facadeOnly !== false,
    live_model: "skipped",
    lab2_fixture_hash: lab2.fixture_hash,
    eval_corpus_hash: sha256File(evalPath),
    scenario_count: corpus.scenarios.length,
    paraphrase_count: paraphraseCount,
    scenarios,
    db
  };
}

export { lookupEvalScenario, loadCommandEvalCorpus };
