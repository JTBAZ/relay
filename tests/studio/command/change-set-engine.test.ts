import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { CommandContractError } from "../../../src/studio/command/contracts.js";
import {
  applyCommandChangeSet,
  undoCommandChangeSet,
  clearCommandEngineUndoStore
} from "../../../src/studio/command/change-set-engine.js";
import { clearChangeSetPreviewStore, previewChangeSet } from "../../../src/studio/command/change-set-types.js";
import { prisma } from "../../../src/lib/db.js";
import { STUDIO_LAB2_CREATOR_ID, loadStudioLab2Corpus } from "../../../src/studio/lab2/corpus-spec.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const seedEnv = {
  ...process.env,
  RELAY_ALLOW_STUDIO_LAB2_SEED: "1",
  NODE_ENV: "test",
  RELAY_COMMAND_LAYER_ENABLED: "1",
  RELAY_COMMAND_APPLY_ENABLED: "1"
};

describe("ChangeSet engine flags (RC-P2-T08)", () => {
  it("refuses apply unless both layer and apply flags are on", async () => {
    clearCommandEngineUndoStore();
    await expect(
      applyCommandChangeSet({} as PrismaClient, "rcx_studio_lab2", {
        change_set_id: "cs_x",
        resolved_post_ids: []
      }, {
        RELAY_COMMAND_LAYER_ENABLED: "false",
        RELAY_COMMAND_APPLY_ENABLED: "1"
      })
    ).rejects.toMatchObject({ code: "COMMAND_APPLY_DISABLED" });
  });

  it("requires a preview when flags are on", async () => {
    await expect(
      applyCommandChangeSet({} as PrismaClient, "rcx_studio_lab2", {
        change_set_id: "cs_missing",
        resolved_post_ids: ["p1"]
      }, {
        RELAY_COMMAND_LAYER_ENABLED: "1",
        RELAY_COMMAND_APPLY_ENABLED: "1"
      })
    ).rejects.toBeInstanceOf(CommandContractError);
  });
});

describe("ChangeSet engine finite plan apply (RC-P9-T04 / RC-DF-09)", () => {
  it("materialize_schedule writes rail events and unpublished nudged drafts", async () => {
    clearChangeSetPreviewStore();
    clearCommandEngineUndoStore();
    const events: Array<Record<string, unknown>> = [];
    const drafts: Array<Record<string, unknown>> = [];
    const prismaMock = {
      post: {
        findFirst: async () => ({
          id: "p1",
          isPublic: true,
          versions: [{ title: "Hero Academy p1", description: "desc" }],
          mediaAssets: [{ id: "m1", currentRole: "cover" }]
        })
      },
      creatorScheduleEvent: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          events.push(create);
          return create;
        }
      },
      autopostDraft: {
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          drafts.push(create);
          return create;
        }
      },
      distributionAttempt: { create: async () => {
        throw new Error("distribution must not run");
      } }
    } as unknown as PrismaClient;
    await applyCommandChangeSet(
      prismaMock,
      "creator_plan",
      {
        change_set_id: "cs_plan_df09",
        resolved_post_ids: ["p1"],
        ops: [
          {
            op_id: "op_ms",
            capability: "materialize_schedule",
            risk_class: "execute_undo",
            target_ids: ["p1"],
            payload: {
              post_ids: ["p1"],
              due_ats: ["2026-09-03T19:00:00.000Z"],
              destination: "x"
            }
          }
        ]
      },
      seedEnv
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("pending");
    expect(events[0]?.id).toBe("sl2_evt_cs_plan_df09_p1");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.status).toBe("nudged");
    expect(drafts[0]?.id).toBe("sl2_draft_cs_plan_df09_p1");
  });
});

describe.skipIf(!hasDatabaseUrl)("ChangeSet engine stock ops (RC-P8-T02)", () => {
  it("applies override tags and a saved filter, then undoes both", async () => {
    const spec = loadStudioLab2Corpus();
    const postId = spec.eval.watercolor_post_ids[0];
    expect(postId).toBeTruthy();
    const existing = await prisma.post.findFirst({
      where: { id: postId!, creatorId: STUDIO_LAB2_CREATOR_ID },
      select: { id: true }
    });
    expect(existing, "Lab 2 watercolor post must exist (seed the corpus)").toBeTruthy();
    const before = await prisma.postOverride.findUnique({
      where: {
        creatorId_postId_mediaId: {
          creatorId: STUDIO_LAB2_CREATOR_ID,
          postId: postId!,
          mediaId: ""
        }
      }
    });

    clearChangeSetPreviewStore();
    clearCommandEngineUndoStore();
    const tagCs = "cs_p8_tags";
    previewChangeSet({
      change_set_id: tagCs,
      idempotency_key: "idemp_p8_tags",
      instruction: "tag watercolor",
      resolved_post_ids: [postId!],
      ops: [
        {
          op_id: "op_tag",
          capability: "add_post_tags",
          risk_class: "execute_undo",
          target_ids: [postId!],
          payload: { post_ids: [postId], tag_ids: ["tag_p8_stock"] }
        }
      ]
    });
    await applyCommandChangeSet(
      prisma,
      STUDIO_LAB2_CREATOR_ID,
      { change_set_id: tagCs, resolved_post_ids: [postId!] },
      seedEnv
    );
    const tagged = await prisma.postOverride.findUnique({
      where: {
        creatorId_postId_mediaId: {
          creatorId: STUDIO_LAB2_CREATOR_ID,
          postId: postId!,
          mediaId: ""
        }
      }
    });
    expect(tagged?.addTagIds).toContain("tag_p8_stock");
    expect(tagged?.visibility).toBeNull();

    await undoCommandChangeSet(prisma, STUDIO_LAB2_CREATOR_ID, tagCs, seedEnv);
    const afterUndo = await prisma.postOverride.findUnique({
      where: {
        creatorId_postId_mediaId: {
          creatorId: STUDIO_LAB2_CREATOR_ID,
          postId: postId!,
          mediaId: ""
        }
      }
    });
    if (!before) {
      expect(afterUndo).toBeNull();
    } else {
      expect(afterUndo?.addTagIds).toEqual(before.addTagIds);
    }

    clearChangeSetPreviewStore();
    clearCommandEngineUndoStore();
    const filterCs = "cs_p8_filter";
    previewChangeSet({
      change_set_id: filterCs,
      idempotency_key: "idemp_p8_filter",
      instruction: "save watercolor filter",
      resolved_post_ids: [postId!],
      ops: [
        {
          op_id: "op_filter",
          capability: "create_saved_filter",
          risk_class: "execute_undo",
          target_ids: [postId!],
          payload: { name: "P8 watercolor stock", query: { q: "watercolor" }, post_ids: [postId] }
        }
      ]
    });
    await applyCommandChangeSet(
      prisma,
      STUDIO_LAB2_CREATOR_ID,
      { change_set_id: filterCs, resolved_post_ids: [postId!] },
      seedEnv
    );
    const created = await prisma.savedFilter.findFirst({
      where: { creatorId: STUDIO_LAB2_CREATOR_ID, name: "P8 watercolor stock" }
    });
    expect(created).toBeTruthy();
    await undoCommandChangeSet(prisma, STUDIO_LAB2_CREATOR_ID, filterCs, seedEnv);
    const gone = await prisma.savedFilter.findUnique({ where: { id: created!.id } });
    expect(gone).toBeNull();
  }, 30_000);
});
