import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../../../src/lib/db.js";
import {
  applyCommandChangeSet,
  undoCommandChangeSet,
  clearCommandEngineUndoStore
} from "../../../src/studio/command/change-set-engine.js";
import { clearChangeSetPreviewStore, previewChangeSet } from "../../../src/studio/command/change-set-types.js";
import {
  hydrateSelectionProposalsFromDb,
  persistCommandChangeSet,
  persistSelectionProposal
} from "../../../src/studio/command/command-durable-store.js";
import { PrismaCommandIdempotencyStore } from "../../../src/studio/command/command-idempotency-store.js";
import {
  beginCommandIdempotency,
  recordCommandIdempotency,
  createCommandIdempotencyStore
} from "../../../src/studio/command/idempotency.js";
import {
  clearSelectionProposalStore,
  findActiveSelectionProposal,
  type CommandSelectionProposal
} from "../../../src/studio/command/proposal-types.js";
import { STUDIO_LAB2_CREATOR_ID, loadStudioLab2Corpus } from "../../../src/studio/lab2/corpus-spec.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const seedEnv = {
  ...process.env,
  RELAY_ALLOW_STUDIO_LAB2_SEED: "1",
  NODE_ENV: "test",
  RELAY_COMMAND_LAYER_ENABLED: "1",
  RELAY_COMMAND_APPLY_ENABLED: "1"
};

async function durableTablesReady(): Promise<boolean> {
  try {
    await prisma.commandSelectionProposal.findFirst({ take: 1 });
    await prisma.commandChangeSet.findFirst({ take: 1 });
    await prisma.commandChangeSetUndo.findFirst({ take: 1 });
    await prisma.commandIdempotencyKey.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasDatabaseUrl)("ChangeSet durable persist (RC-P8-T04)", () => {
  it("rehydrates a selection proposal after the process Map is cleared", async ({ skip }) => {
    if (!(await durableTablesReady())) {
      skip();
      return;
    }
    const creatorId = `rcx_cmd_t04_${randomUUID().slice(0, 8)}`;
    const proposal: CommandSelectionProposal = {
      proposal_id: `pr_t04_${randomUUID()}`,
      creator_id: creatorId,
      stage: "selection_approved",
      instruction: "watercolor pages",
      snapshot: {
        post_ids: ["p_a", "p_b"],
        explanation: "two posts",
        warnings: [],
        match_evidence: [
          { post_id: "p_a", fields: [] },
          { post_id: "p_b", fields: [] }
        ],
        revision: "rev_t04",
        complete: true,
        creator_id: creatorId,
        created_at: "2026-08-30T00:00:00.000Z"
      },
      records: [],
      exclude_post_ids: [],
      frozen_post_ids: ["p_a", "p_b"],
      frozen_revision: "rev_frozen",
      created_at: "2026-08-30T00:00:00.000Z",
      updated_at: "2026-08-30T00:00:00.000Z"
    };
    await persistSelectionProposal(prisma, proposal);
    clearSelectionProposalStore();
    expect(findActiveSelectionProposal(creatorId)).toBeUndefined();
    await hydrateSelectionProposalsFromDb(prisma, creatorId);
    const loaded = findActiveSelectionProposal(creatorId);
    expect(loaded?.proposal_id).toBe(proposal.proposal_id);
    expect(loaded?.frozen_post_ids).toEqual(["p_a", "p_b"]);
    expect(loaded?.stage).toBe("selection_approved");
    await prisma.commandSelectionProposal.deleteMany({ where: { creatorId } });
  }, 30_000);

  it("applies a saved filter, then undoes after clearing process Maps", async ({ skip }) => {
    if (!(await durableTablesReady())) {
      skip();
      return;
    }
    const spec = loadStudioLab2Corpus();
    const postId = spec.eval.watercolor_post_ids[0];
    expect(postId).toBeTruthy();
    const existing = await prisma.post.findFirst({
      where: { id: postId!, creatorId: STUDIO_LAB2_CREATOR_ID },
      select: { id: true }
    });
    expect(existing, "Lab 2 watercolor post must exist (seed the corpus)").toBeTruthy();

    const changeSetId = `cs_t04_${randomUUID()}`;
    const filterName = `T04 durable ${changeSetId.slice(-8)}`;
    clearChangeSetPreviewStore();
    clearCommandEngineUndoStore();
    const envelope = previewChangeSet({
      change_set_id: changeSetId,
      idempotency_key: `idemp_${changeSetId}`,
      instruction: "save durable filter",
      resolved_post_ids: [postId!],
      ops: [
        {
          op_id: "op_filter",
          capability: "create_saved_filter",
          risk_class: "execute_undo",
          target_ids: [postId!],
          payload: { name: filterName, query: { q: "watercolor" }, post_ids: [postId] }
        }
      ]
    });
    await persistCommandChangeSet(prisma, STUDIO_LAB2_CREATOR_ID, envelope);
    clearChangeSetPreviewStore();

    await applyCommandChangeSet(
      prisma,
      STUDIO_LAB2_CREATOR_ID,
      { change_set_id: changeSetId, resolved_post_ids: [postId!] },
      seedEnv
    );
    const created = await prisma.savedFilter.findFirst({
      where: { creatorId: STUDIO_LAB2_CREATOR_ID, name: filterName }
    });
    expect(created).toBeTruthy();

    clearChangeSetPreviewStore();
    clearCommandEngineUndoStore();
    await undoCommandChangeSet(prisma, STUDIO_LAB2_CREATOR_ID, changeSetId, seedEnv);
    const gone = await prisma.savedFilter.findUnique({ where: { id: created!.id } });
    expect(gone).toBeNull();
    const undone = await prisma.commandChangeSet.findUnique({ where: { id: changeSetId } });
    expect(undone?.status).toBe("undone");
    await prisma.commandChangeSet.deleteMany({ where: { id: changeSetId } });
  }, 30_000);

  it("replays the same idempotency key+body from Postgres and conflicts on a different body", async ({ skip }) => {
    if (!(await durableTablesReady())) {
      skip();
      return;
    }
    const storeA = createCommandIdempotencyStore(prisma);
    const key = `idem_t05_${randomUUID()}`;
    const body = { instruction: "organize", post_ids: ["a", "b"] };
    const first = await beginCommandIdempotency(storeA, { scope: "command-apply:rcx_studio_lab2", key, body });
    expect(first.state).toBe("fresh");
    await recordCommandIdempotency(storeA, {
      scope: "command-apply:rcx_studio_lab2",
      key,
      body,
      status: 200,
      responseBody: { change_set_id: "cs_t05" }
    });
    const storeB = new PrismaCommandIdempotencyStore(prisma);
    const replay = await beginCommandIdempotency(storeB, {
      scope: "command-apply:rcx_studio_lab2",
      key,
      body
    });
    expect(replay.state).toBe("replay");
    if (replay.state === "replay") {
      expect(replay.snapshot.body).toEqual({ change_set_id: "cs_t05" });
    }
    await expect(
      beginCommandIdempotency(storeB, {
        scope: "command-apply:rcx_studio_lab2",
        key,
        body: { instruction: "organize", post_ids: ["a", "injected"] }
      })
    ).rejects.toMatchObject({ code: "COMMAND_VALIDATION" });
    await prisma.commandIdempotencyKey.deleteMany({
      where: { storageKey: { startsWith: `command-apply:rcx_studio_lab2\u001fidem_t05_` } }
    });
  }, 30_000);
});
