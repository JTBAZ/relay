import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import type { IdentityService } from "../../../src/identity/identity-service.js";
import { registerRelayCommandHttpRoutes } from "../../../src/studio/command/http-routes.js";
import {
  buildSelectionProposalFromPreview,
  clearSelectionProposalStore,
  findActiveSelectionProposal,
  patchSelectionProposal,
  rememberSelectionProposal,
  upsertSelectionProposalFromPreview
} from "../../../src/studio/command/proposal-types.js";
import { applyPlanPatch } from "../../../src/studio/command/proposal-patch.js";
import type { CommandLibraryItem } from "../../../src/studio/command/selection.js";

const { applyMock } = vi.hoisted(() => ({ applyMock: vi.fn() }));

vi.mock("../../../src/studio/command/change-set-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/studio/command/change-set-engine.js")>();
  return {
    ...actual,
    applyCommandChangeSet: (...args: unknown[]) => applyMock(...args)
  };
});

const FLAG_KEYS = [
  "RELAY_COMMAND_LAYER_ENABLED",
  "RELAY_COMMAND_APPLY_ENABLED",
  "RELAY_COMMAND_SELECTION_UX_ENABLED",
  "RELAY_COMMAND_SCHEDULE_PLAN_ENABLED"
] as const;

function catalog(): CommandLibraryItem[] {
  return ["a", "b"].map((id) => ({
    media_id: `m_${id}`,
    post_id: id,
    title: `Post ${id}`,
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
  }));
}

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

const railRows = { events: 0, drafts: 0 };

function labPrisma(): PrismaClient {
  railRows.events = 0;
  railRows.drafts = 0;
  return {
    tenantMembership: { findUnique: async () => ({ accountId: "acc_lab2" }) },
    account: {
      findUnique: async () => ({
        id: "acc_lab2",
        supabaseUserId: null,
        primaryRelayCreatorId: "rcx_studio_lab2"
      })
    },
    commandSelectionProposal: {
      upsert: async () => ({}),
      findUnique: async () => null
    },
    creatorScheduleEvent: {
      count: async () => railRows.events,
      create: async () => {
        railRows.events += 1;
        return {};
      },
      upsert: async () => {
        railRows.events += 1;
        return {};
      }
    },
    autopostDraft: {
      count: async () => railRows.drafts,
      create: async () => {
        railRows.drafts += 1;
        return {};
      },
      upsert: async () => {
        railRows.drafts += 1;
        return {};
      }
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
  applyMock.mockReset();
  applyMock.mockResolvedValue({ change_set_id: "cs_plan", status: "applied" });
  const app = express();
  app.use(express.json());
  registerRelayCommandHttpRoutes(app, { prisma: labPrisma(), identityService: labIdentity() });
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

function seedShapedPlan() {
  const built = buildSelectionProposalFromPreview(catalog(), {
    creator_id: "rcx_studio_lab2",
    instruction: "weekly drops",
    post_ids: ["a", "b"]
  });
  rememberSelectionProposal(built);
  const approved = patchSelectionProposal({
    creator_id: "rcx_studio_lab2",
    proposal_id: built.proposal_id,
    op: "approve"
  });
  return applyPlanPatch({
    creator_id: "rcx_studio_lab2",
    proposal_id: approved.proposal_id,
    op: "set_start",
    start_local: "2026-08-27T19:00:00",
    time_zone: "UTC"
  });
}

afterEach(() => {
  clearSelectionProposalStore();
  for (const key of FLAG_KEYS) delete process.env[key];
});

describe("finite plan apply HTTP (RC-P9-T04)", () => {
  it("does not apply a ChangeSet while shaping, then applies one materialize_schedule op", async () => {
    const shaped = seedShapedPlan();
    const app = await startApp({
      RELAY_COMMAND_LAYER_ENABLED: "true",
      RELAY_COMMAND_APPLY_ENABLED: "true",
      RELAY_COMMAND_SELECTION_UX_ENABLED: "true",
      RELAY_COMMAND_SCHEDULE_PLAN_ENABLED: "true"
    });
    try {
      const patched = await fetch(`${app.url}/api/v1/creator/command/plan-proposal/patch`, {
        method: "POST",
        headers: { authorization: "Bearer web_lab2", "content-type": "application/json" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          proposal_id: shaped.proposal.proposal_id,
          op: "set_weekday",
          weekday: "thursday",
          expected_version: shaped.plan.version
        })
      });
      expect(patched.status).toBe(200);
      expect(applyMock).not.toHaveBeenCalled();
      expect(railRows.events).toBe(0);
      expect(railRows.drafts).toBe(0);

      const applied = await fetch(`${app.url}/api/v1/creator/command/apply`, {
        method: "POST",
        headers: { authorization: "Bearer web_lab2", "content-type": "application/json" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          proposal_id: shaped.proposal.proposal_id,
          expected_revision: shaped.proposal.frozen_revision,
          operation_kind: "materialize_schedule",
          change_set_id: "cs_plan_apply"
        })
      });
      expect(applied.status).toBe(200);
      expect(applyMock).toHaveBeenCalledTimes(1);
      const applyArg = applyMock.mock.calls[0]?.[2] as {
        ops: Array<{ capability: string; payload: Record<string, unknown> }>;
      };
      expect(applyArg.ops).toHaveLength(1);
      expect(applyArg.ops[0]?.capability).toBe("materialize_schedule");
      expect(Array.isArray(applyArg.ops[0]?.payload.due_ats)).toBe(true);
      expect((applyArg.ops[0]?.payload.due_ats as string[]).length).toBe(2);
      expect(findActiveSelectionProposal("rcx_studio_lab2")).toBeUndefined();
      const next = upsertSelectionProposalFromPreview(catalog(), {
        creator_id: "rcx_studio_lab2",
        instruction: "weekly drops",
        post_ids: ["a", "b"]
      });
      expect(next.stage).toBe("selection_review");
      expect(next.proposal_id).not.toBe(shaped.proposal.proposal_id);
      expect(next.frozen_post_ids).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
