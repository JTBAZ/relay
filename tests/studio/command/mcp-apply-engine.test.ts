import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../../../src/lib/db.js";
import { commandCapabilityFacade } from "../../../src/studio/command/capability-facade.js";
import { invokeCommandMcpTool } from "../../../src/studio/command/mcp/dispatch.js";
import type { CommandMcpAuth } from "../../../src/studio/command/mcp/auth.js";
import { STUDIO_LAB2_CREATOR_ID, loadStudioLab2Corpus } from "../../../src/studio/lab2/corpus-spec.js";
import { clearChangeSetPreviewStore } from "../../../src/studio/command/change-set-types.js";
import { clearCommandEngineUndoStore } from "../../../src/studio/command/change-set-engine.js";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const applyEnv = {
  RELAY_COMMAND_LAYER_ENABLED: "1",
  RELAY_COMMAND_APPLY_ENABLED: "1"
};

function applyGrant(): CommandMcpAuth {
  return {
    origin: "mcp",
    creatorId: STUDIO_LAB2_CREATOR_ID,
    scopes: ["library:read", "command:apply"]
  };
}

describe("Command MCP apply without Prisma (RC-P8-T03)", () => {
  it("refuses apply when Prisma is missing even if the apply flag is on", async () => {
    await expect(
      invokeCommandMcpTool(
        "apply_change_set",
        { change_set_id: "cs_missing", resolved_post_ids: ["a"] },
        {
          auth: applyGrant(),
          facade: commandCapabilityFacade,
          env: applyEnv
        }
      )
    ).rejects.toMatchObject({ code: "COMMAND_FORBIDDEN" });
  });
});

describe.skipIf(!hasDatabaseUrl)("Command MCP apply hits DB engine (RC-P8-T03)", () => {
  it("applies a saved filter through MCP and undoes it", async ({ skip }) => {
    try {
      await prisma.commandChangeSet.findFirst({ take: 1 });
    } catch {
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
    expect(existing, "Lab 2 watercolor post must exist").toBeTruthy();

    const changeSetId = `cs_mcp_${randomUUID()}`;
    const filterName = `T03 mcp ${changeSetId.slice(-8)}`;
    clearChangeSetPreviewStore();
    clearCommandEngineUndoStore();
    const ctx = {
      auth: applyGrant(),
      facade: commandCapabilityFacade,
      prisma,
      env: applyEnv
    };
    await invokeCommandMcpTool(
      "preview_change_set",
      {
        change_set_id: changeSetId,
        idempotency_key: `idemp_${changeSetId}`,
        instruction: "save mcp filter",
        resolved_post_ids: [postId],
        ops: [
          {
            op_id: "op_filter",
            capability: "create_saved_filter",
            risk_class: "execute_undo",
            target_ids: [postId],
            payload: { name: filterName, query: { q: "watercolor" }, post_ids: [postId] }
          }
        ]
      },
      ctx
    );
    clearChangeSetPreviewStore();
    clearCommandEngineUndoStore();
    await invokeCommandMcpTool(
      "apply_change_set",
      { change_set_id: changeSetId, resolved_post_ids: [postId] },
      ctx
    );
    const created = await prisma.savedFilter.findFirst({
      where: { creatorId: STUDIO_LAB2_CREATOR_ID, name: filterName }
    });
    expect(created).toBeTruthy();
    await invokeCommandMcpTool("undo_change_set", { change_set_id: changeSetId }, ctx);
    const gone = await prisma.savedFilter.findUnique({ where: { id: created!.id } });
    expect(gone).toBeNull();
    await prisma.commandChangeSet.deleteMany({ where: { id: changeSetId } });
  }, 30_000);
});
