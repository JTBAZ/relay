import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../src/lib/db.js";
import {
  STUDIO_LAB2_CREATOR_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_POST_IDS,
  STUDIO_LAB2_DEFAULT_COLLECTION_TITLE,
  STUDIO_LAB2_LABEL,
  loadStudioLab2Corpus
} from "../../../src/studio/lab2/corpus-spec.js";
import {
  applyStudioLab2Corpus,
  evalStudioLab2Corpus,
  restoreStudioLab2PlaygroundBaseline,
  statusStudioLab2Corpus
} from "../../../src/studio/lab2/seed-studio-lab2.js";
import { loadCommandLibraryItemsFromDb } from "../../../src/studio/command/library-items-from-db.js";
import { commandCapabilityFacade } from "../../../src/studio/command/capability-facade.js";
import {
  applyCommandChangeSet,
  undoCommandChangeSet,
  clearCommandEngineUndoStore
} from "../../../src/studio/command/change-set-engine.js";
import { previewChangeSet, clearChangeSetPreviewStore } from "../../../src/studio/command/change-set-types.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const seedEnv = {
  ...process.env,
  RELAY_ALLOW_STUDIO_LAB2_SEED: "1",
  NODE_ENV: "test",
  RELAY_COMMAND_LAYER_ENABLED: "1",
  RELAY_COMMAND_APPLY_ENABLED: "1"
};

describe("Studio Lab 2 seed guards", () => {
  it("refuses production even when the allow flag is set", async () => {
    await expect(
      applyStudioLab2Corpus({} as PrismaClient, {
        env: {
          NODE_ENV: "production",
          RELAY_ALLOW_STUDIO_LAB2_SEED: "1",
          DATABASE_URL: "postgres://local"
        }
      })
    ).rejects.toThrow(/production/);
  });

  it("playground reset refuses production and foreign creators", async () => {
    await expect(
      restoreStudioLab2PlaygroundBaseline({} as PrismaClient, {
        env: { NODE_ENV: "production" }
      })
    ).rejects.toThrow(/production/);
    await expect(
      restoreStudioLab2PlaygroundBaseline({} as PrismaClient, {
        creatorId: "cr_other",
        env: { NODE_ENV: "test" }
      })
    ).rejects.toThrow(/rcx_studio_lab2/);
  });
});

describe.skipIf(!hasDatabaseUrl)("Studio Lab 2 seed/eval (RC-P2-T02–T08)", () => {
  it("apply is idempotent, eval passes, search/sequence/collections/undo work", async () => {
    process.env.RELAY_ALLOW_STUDIO_LAB2_SEED = "1";
    const spec = loadStudioLab2Corpus();
    await applyStudioLab2Corpus(prisma, { env: seedEnv });
    const first = await statusStudioLab2Corpus(prisma);
    await applyStudioLab2Corpus(prisma, { env: seedEnv });
    const second = await statusStudioLab2Corpus(prisma);
    expect(second.post_count).toBe(first.post_count);
    expect(second.post_count).toBe(112);
    expect(second.collection_count).toBe(1);
    expect(second.metrics_label).toBe(STUDIO_LAB2_LABEL);

    const baselineCol = await prisma.libraryCollection.findUnique({
      where: { id: STUDIO_LAB2_DEFAULT_COLLECTION_ID },
      include: { posts: { orderBy: { sortIndex: "asc" } } }
    });
    expect(baselineCol?.title).toBe(STUDIO_LAB2_DEFAULT_COLLECTION_TITLE);
    expect(baselineCol?.posts.map((p) => p.postId)).toEqual([...STUDIO_LAB2_DEFAULT_COLLECTION_POST_IDS]);

    const evaluated = await evalStudioLab2Corpus(prisma);
    expect(evaluated.ok, evaluated.errors.join("\n")).toBe(true);

    const items = await loadCommandLibraryItemsFromDb(prisma, STUDIO_LAB2_CREATOR_ID);
    const watercolor = commandCapabilityFacade.search_library(items, {
      tag_ids: ["sl2_tag_watercolor", "sl2_tag_landscape"]
    });
    expect(watercolor.records.map((r) => r.post_id).sort()).toEqual([...spec.eval.watercolor_post_ids].sort());

    const haItems = items.filter((it) => it.title.startsWith("Hero Academy"));
    const resolved = commandCapabilityFacade.resolve_numbered_sequence(
      haItems.map((it) => ({ post_id: it.post_id, title: it.title }))
    );
    expect(resolved.gaps).toEqual([17]);
    expect(resolved.duplicates).toEqual([8]);
    const orderedWithoutDup = spec.eval.hero_academy_ordered_ids;
    expect(orderedWithoutDup[0]).toBe("sl2_ha_cover");

    const alreadyOnX = commandCapabilityFacade.search_library(items, {
      destination_present: ["x"]
    });
    expect(alreadyOnX.records.map((r) => r.post_id).sort()).toEqual(
      [...spec.eval.already_on_x_post_ids].sort()
    );

    clearChangeSetPreviewStore();
    clearCommandEngineUndoStore();
    const wcNewest = [...spec.eval.watercolor_post_ids].sort((a, b) => b.localeCompare(a));
    const csId = "cs_lab2_watercolor";
    previewChangeSet({
      change_set_id: csId,
      idempotency_key: "idemp_wc",
      instruction: "Organize watercolor newest first",
      resolved_post_ids: wcNewest,
      ops: [
        {
          op_id: "op_wc",
          capability: "create_or_update_collection",
          risk_class: "execute_undo",
          target_ids: ["sl2_col_watercolor"],
          payload: {
            collection_id: "sl2_col_watercolor",
            title: "Watercolor landscapes",
            post_ids: wcNewest,
            ordered_post_ids: wcNewest
          }
        }
      ]
    });
    await applyCommandChangeSet(
      prisma,
      STUDIO_LAB2_CREATOR_ID,
      { change_set_id: csId, resolved_post_ids: wcNewest },
      seedEnv
    );
    await applyCommandChangeSet(
      prisma,
      STUDIO_LAB2_CREATOR_ID,
      { change_set_id: csId, resolved_post_ids: wcNewest, ops: [
        {
          op_id: "op_wc",
          capability: "create_or_update_collection",
          risk_class: "execute_undo",
          target_ids: ["sl2_col_watercolor"],
          payload: {
            collection_id: "sl2_col_watercolor",
            title: "Watercolor landscapes",
            post_ids: wcNewest,
            ordered_post_ids: wcNewest
          }
        }
      ] },
      seedEnv
    );
    const col = await prisma.libraryCollection.findUnique({
      where: { id: "sl2_col_watercolor" },
      include: { posts: { orderBy: { sortIndex: "asc" } } }
    });
    expect(col?.title).toBe("Watercolor landscapes");
    expect(col?.posts.map((p) => p.postId)).toEqual(wcNewest);

    const haCs = "cs_lab2_ha";
    previewChangeSet({
      change_set_id: haCs,
      idempotency_key: "idemp_ha",
      instruction: "Hero Academy cover-first",
      resolved_post_ids: orderedWithoutDup,
      ops: [
        {
          op_id: "op_ha",
          capability: "create_or_update_collection",
          risk_class: "execute_undo",
          target_ids: ["sl2_col_hero_academy"],
          payload: {
            collection_id: "sl2_col_hero_academy",
            title: "Hero Academy",
            post_ids: orderedWithoutDup,
            ordered_post_ids: orderedWithoutDup
          }
        }
      ]
    });
    await applyCommandChangeSet(
      prisma,
      STUDIO_LAB2_CREATOR_ID,
      { change_set_id: haCs, resolved_post_ids: orderedWithoutDup },
      seedEnv
    );

    const nativeCs = "cs_lab2_native_revise";
    previewChangeSet({
      change_set_id: nativeCs,
      idempotency_key: "idemp_native",
      instruction: "Native revise",
      resolved_post_ids: [spec.eval.native_revise_post_id],
      ops: [
        {
          op_id: "op_native",
          capability: "revise_post",
          risk_class: "execute_undo",
          target_ids: [spec.eval.native_revise_post_id],
          payload: {
            post_id: spec.eval.native_revise_post_id,
            source: "RELAY",
            title: "Relay native sketch 1 (revised)"
          }
        }
      ]
    });
    await applyCommandChangeSet(
      prisma,
      STUDIO_LAB2_CREATOR_ID,
      { change_set_id: nativeCs, resolved_post_ids: [spec.eval.native_revise_post_id] },
      seedEnv
    );
    const nativeVersions = await prisma.postVersion.count({
      where: { postId: spec.eval.native_revise_post_id }
    });
    expect(nativeVersions).toBeGreaterThan(1);

    const importedCs = "cs_lab2_imported_revise";
    previewChangeSet({
      change_set_id: importedCs,
      idempotency_key: "idemp_imported",
      instruction: "Imported revise",
      resolved_post_ids: [spec.eval.imported_revise_post_id],
      ops: [
        {
          op_id: "op_imported",
          capability: "revise_post",
          risk_class: "execute_undo",
          target_ids: [spec.eval.imported_revise_post_id],
          payload: {
            post_id: spec.eval.imported_revise_post_id,
            source: "PATREON",
            title: "Hero Academy Page 2 (overlay)"
          }
        }
      ]
    });
    await applyCommandChangeSet(
      prisma,
      STUDIO_LAB2_CREATOR_ID,
      { change_set_id: importedCs, resolved_post_ids: [spec.eval.imported_revise_post_id] },
      seedEnv
    );
    const overlay = await prisma.postPresentation.findUnique({
      where: { postId: spec.eval.imported_revise_post_id }
    });
    expect(overlay?.relayTitle).toBe("Hero Academy Page 2 (overlay)");
    const importedVersions = await prisma.postVersion.count({
      where: { postId: spec.eval.imported_revise_post_id }
    });
    expect(importedVersions).toBe(1);

    const skipX = spec.eval.hero_academy_ordered_ids.filter(
      (id) => !spec.eval.already_on_x_post_ids.includes(id) && id !== "sl2_ha_cover"
    );
    const planCs = "cs_lab2_x_plan";
    previewChangeSet({
      change_set_id: planCs,
      idempotency_key: "idemp_plan",
      instruction: "Weekly X skipping present",
      resolved_post_ids: skipX,
      ops: [
        {
          op_id: "op_plan",
          capability: "materialize_schedule",
          risk_class: "execute_undo",
          target_ids: skipX,
          payload: { post_ids: skipX, destination: "x" }
        }
      ]
    });
    await applyCommandChangeSet(
      prisma,
      STUDIO_LAB2_CREATOR_ID,
      { change_set_id: planCs, resolved_post_ids: skipX },
      seedEnv
    );
    const events = await prisma.creatorScheduleEvent.count({
      where: { creatorId: STUDIO_LAB2_CREATOR_ID }
    });
    expect(events).toBe(skipX.length);
    const completedAttempts = await prisma.postDistributionAttempt.count({
      where: { creatorId: STUDIO_LAB2_CREATOR_ID, status: "posted" }
    });
    expect(completedAttempts).toBe(spec.eval.already_on_x_post_ids.length);

    await undoCommandChangeSet(prisma, STUDIO_LAB2_CREATOR_ID, planCs, seedEnv);
    expect(
      await prisma.creatorScheduleEvent.count({ where: { creatorId: STUDIO_LAB2_CREATOR_ID } })
    ).toBe(0);

    await applyStudioLab2Corpus(prisma, { env: seedEnv });
    const restored = await statusStudioLab2Corpus(prisma);
    expect(restored.post_count).toBe(112);
    expect(restored.collection_count).toBe(1);
  }, 180_000);
});
