import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import type { IdentityService } from "../../../src/identity/identity-service.js";
import { registerRelayCommandHttpRoutes } from "../../../src/studio/command/http-routes.js";
import { clearSelectionProposalStore } from "../../../src/studio/command/proposal-types.js";
import { clearChangeSetPreviewStore } from "../../../src/studio/command/change-set-types.js";
import { clearCommandEngineUndoStore } from "../../../src/studio/command/change-set-engine.js";
import type { CommandLibraryItem } from "../../../src/studio/command/selection.js";

const { applyMock } = vi.hoisted(() => ({ applyMock: vi.fn() }));

vi.mock("../../../src/studio/command/change-set-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/studio/command/change-set-engine.js")>();
  return {
    ...actual,
    applyCommandChangeSet: (...args: unknown[]) => applyMock(...args)
  };
});

vi.mock("../../../src/studio/command/library-items-from-db.js", () => ({
  loadCommandLibraryItemsFromDb: async () =>
    [
      {
        media_id: "m_a",
        post_id: "a",
        title: "Hero Academy Page 1",
        published_at: "2026-03-01T00:00:00.000Z",
        tag_ids: [],
        tier_ids: [],
        has_export: true,
        processing_status: "READY",
        export_status: "ready",
        content_url_path: "",
        preview_url_path: "",
        thumb_url_path: "",
        visibility: "visible",
        collection_ids: [],
        collection_theme_tag_ids: []
      },
      {
        media_id: "m_b",
        post_id: "b",
        title: "Hero Academy Page 2",
        published_at: "2026-03-02T00:00:00.000Z",
        tag_ids: [],
        tier_ids: [],
        has_export: true,
        processing_status: "READY",
        export_status: "ready",
        content_url_path: "",
        preview_url_path: "",
        thumb_url_path: "",
        visibility: "visible",
        collection_ids: [],
        collection_theme_tag_ids: []
      }
    ] satisfies CommandLibraryItem[]
}));

const FLAG_KEYS = [
  "RELAY_COMMAND_LAYER_ENABLED",
  "RELAY_COMMAND_APPLY_ENABLED",
  "RELAY_COMMAND_SELECTION_UX_ENABLED"
] as const;

function labIdentity(): IdentityService {
  return {
    resolveSession: async (token: string) => {
      if (token !== "web_lab2") return null;
      return {
        token,
        user_id: "tm_lab2",
        creator_id: "rcx_studio_lab2",
        tier_ids: [],
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        kind: "web" as const
      };
    }
  } as IdentityService;
}

function labPrisma(): PrismaClient {
  return {
    tenantMembership: {
      findUnique: async () => ({ accountId: "acc_lab2" })
    },
    account: {
      findUnique: async () => ({
        id: "acc_lab2",
        supabaseUserId: null,
        primaryRelayCreatorId: "rcx_studio_lab2"
      })
    }
  } as unknown as PrismaClient;
}

async function startApp(env: Partial<Record<(typeof FLAG_KEYS)[number], string>>) {
  const previous: Record<string, string | undefined> = {};
  for (const key of FLAG_KEYS) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  const app = express();
  app.use(express.json());
  registerRelayCommandHttpRoutes(app, {
    prisma: labPrisma(),
    identityService: labIdentity()
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      for (const key of FLAG_KEYS) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  };
}

afterEach(() => {
  clearSelectionProposalStore();
  clearChangeSetPreviewStore();
  clearCommandEngineUndoStore();
  applyMock.mockReset();
  for (const key of FLAG_KEYS) {
    delete process.env[key];
  }
});

describe("command apply from approved proposal (RC-P8-T02)", () => {
  it("compiles frozen IDs and ignores client ops", async () => {
    applyMock.mockResolvedValue({
      change_set_id: "cs_p8",
      status: "applied",
      resolved_post_ids: ["a", "b"],
      after_summary: "applied"
    });
    const handle = await startApp({
      RELAY_COMMAND_LAYER_ENABLED: "true",
      RELAY_COMMAND_APPLY_ENABLED: "true",
      RELAY_COMMAND_SELECTION_UX_ENABLED: "true"
    });
    try {
      const created = await fetch(`${handle.url}/api/v1/creator/command/selection-proposal`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          instruction: "Organize Hero Academy into a collection.",
          post_ids: ["a", "b"]
        })
      });
      expect(created.status).toBe(200);
      const createdBody = (await created.json()) as {
        data: { proposal: { proposal_id: string } };
      };
      const approved = await fetch(`${handle.url}/api/v1/creator/command/selection-proposal/patch`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          proposal_id: createdBody.data.proposal.proposal_id,
          op: "approve"
        })
      });
      expect(approved.status).toBe(200);
      const approvedBody = (await approved.json()) as {
        data: { proposal: { frozen_revision: string; frozen_post_ids: string[] } };
      };
      const applied = await fetch(`${handle.url}/api/v1/creator/command/apply`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          proposal_id: createdBody.data.proposal.proposal_id,
          expected_revision: approvedBody.data.proposal.frozen_revision,
          operation_kind: "create_or_update_collection",
          collection_title: "Hero Academy",
          change_set_id: "cs_p8",
          resolved_post_ids: ["client_extra"],
          ops: [
            {
              op_id: "op_client",
              capability: "create_or_update_collection",
              risk_class: "execute_undo",
              target_ids: ["col_client"],
              payload: { post_ids: ["client_extra"], title: "Ignored" }
            }
          ]
        })
      });
      expect(applied.status).toBe(200);
      expect(applyMock).toHaveBeenCalled();
      const applyArg = applyMock.mock.calls[0]?.[2] as {
        resolved_post_ids: string[];
        ops: Array<{ payload: Record<string, unknown> }>;
      };
      expect(applyArg.resolved_post_ids).toEqual(["a", "b"]);
      expect(applyArg.ops[0]?.payload.post_ids).toEqual(["a", "b"]);
      expect(applyArg.ops[0]?.payload.title).toBe("Hero Academy");
    } finally {
      await handle.close();
    }
  });

  it("blocks schedule apply from an approved proposal", async () => {
    const handle = await startApp({
      RELAY_COMMAND_LAYER_ENABLED: "true",
      RELAY_COMMAND_APPLY_ENABLED: "true",
      RELAY_COMMAND_SELECTION_UX_ENABLED: "true"
    });
    try {
      const created = await fetch(`${handle.url}/api/v1/creator/command/selection-proposal`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          instruction: "Plan a weekly X schedule.",
          post_ids: ["a", "b"]
        })
      });
      const createdBody = (await created.json()) as {
        data: { proposal: { proposal_id: string } };
      };
      const approved = await fetch(`${handle.url}/api/v1/creator/command/selection-proposal/patch`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          proposal_id: createdBody.data.proposal.proposal_id,
          op: "approve"
        })
      });
      const approvedBody = (await approved.json()) as {
        data: { proposal: { frozen_revision: string } };
      };
      const applied = await fetch(`${handle.url}/api/v1/creator/command/apply`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          proposal_id: createdBody.data.proposal.proposal_id,
          expected_revision: approvedBody.data.proposal.frozen_revision,
          operation_kind: "create_release_plan",
          change_set_id: "cs_sched"
        })
      });
      expect(applied.status).toBe(400);
      const body = (await applied.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/Schedule apply waits for the plan workbench/);
      expect(applyMock).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });
});
