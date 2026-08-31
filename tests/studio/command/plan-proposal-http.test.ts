import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import type { IdentityService } from "../../../src/identity/identity-service.js";
import { registerRelayCommandHttpRoutes } from "../../../src/studio/command/http-routes.js";
import { applyPlanPatch } from "../../../src/studio/command/proposal-patch.js";
import {
  buildSelectionProposalFromPreview,
  clearSelectionProposalStore,
  patchSelectionProposal,
  rememberSelectionProposal
} from "../../../src/studio/command/proposal-types.js";
import type { CommandLibraryItem } from "../../../src/studio/command/selection.js";

vi.mock("../../../src/studio/command/library-items-from-db.js", () => ({
  loadCommandLibraryItemsFromDb: async () => []
}));

const FLAG_KEYS = [
  "RELAY_COMMAND_LAYER_ENABLED",
  "RELAY_COMMAND_SELECTION_UX_ENABLED",
  "RELAY_COMMAND_SCHEDULE_PLAN_ENABLED"
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
    },
    commandSelectionProposal: {
      upsert: async () => ({}),
      findUnique: async () => null
    }
  } as unknown as PrismaClient;
}

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

function seedApproved() {
  const built = buildSelectionProposalFromPreview(catalog(), {
    creator_id: "rcx_studio_lab2",
    instruction: "weekly drops",
    post_ids: ["a", "b"]
  });
  rememberSelectionProposal(built);
  return patchSelectionProposal({
    creator_id: "rcx_studio_lab2",
    proposal_id: built.proposal_id,
    op: "approve"
  });
}

afterEach(() => {
  clearSelectionProposalStore();
  for (const key of FLAG_KEYS) delete process.env[key];
});

describe("plan proposal HTTP (RC-P9-T02)", () => {
  it("404s when the schedule plan flag is off", async () => {
    const app = await startApp({
      RELAY_COMMAND_LAYER_ENABLED: "true",
      RELAY_COMMAND_SELECTION_UX_ENABLED: "true"
    });
    try {
      const res = await fetch(`${app.url}/api/v1/creator/command/plan-proposal?creator_id=rcx_studio_lab2`, {
        headers: { authorization: "Bearer web_lab2" }
      });
      expect(res.status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("GET is side-effect free and POST persists a versioned patch", async () => {
    const approved = seedApproved();
    const app = await startApp({
      RELAY_COMMAND_LAYER_ENABLED: "true",
      RELAY_COMMAND_SELECTION_UX_ENABLED: "true",
      RELAY_COMMAND_SCHEDULE_PLAN_ENABLED: "true"
    });
    try {
      const getRes = await fetch(
        `${app.url}/api/v1/creator/command/plan-proposal?creator_id=rcx_studio_lab2&start_local=${encodeURIComponent("2026-08-27T19:00:00")}&time_zone=UTC&weekday=4`,
        { headers: { authorization: "Bearer web_lab2" } }
      );
      expect(getRes.status).toBe(200);
      const getBody = (await getRes.json()) as {
        data: { persisted: boolean; plan: { version: number }; slots: unknown[] };
      };
      expect(getBody.data.persisted).toBe(false);
      expect(getBody.data.plan.version).toBe(0);
      expect(getBody.data.slots).toHaveLength(2);

      const postRes = await fetch(`${app.url}/api/v1/creator/command/plan-proposal/patch`, {
        method: "POST",
        headers: { authorization: "Bearer web_lab2", "content-type": "application/json" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          proposal_id: approved.proposal_id,
          op: "set_start",
          start_local: "2026-08-27T19:00:00",
          time_zone: "UTC"
        })
      });
      expect(postRes.status).toBe(200);
      const postBody = (await postRes.json()) as {
        data: { plan: { version: number }; proposal: { stage: string; plan: { version: number } } };
      };
      expect(postBody.data.plan.version).toBe(1);
      expect(postBody.data.proposal.stage).toBe("plan_shaping");

      const getAfter = await fetch(
        `${app.url}/api/v1/creator/command/plan-proposal?creator_id=rcx_studio_lab2`,
        { headers: { authorization: "Bearer web_lab2" } }
      );
      const afterBody = (await getAfter.json()) as { data: { persisted: boolean; plan: { version: number } } };
      expect(getAfter.status).toBe(200);
      expect(afterBody.data.persisted).toBe(true);
      expect(afterBody.data.plan.version).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("POST refine maps Saturday language to a weekday patch", async () => {
    const approved = seedApproved();
    applyPlanPatch({
      creator_id: "rcx_studio_lab2",
      proposal_id: approved.proposal_id,
      op: "set_start",
      start_local: "2026-09-03T19:00:00",
      time_zone: "UTC",
      weekday: 4
    });
    const app = await startApp({
      RELAY_COMMAND_LAYER_ENABLED: "true",
      RELAY_COMMAND_SELECTION_UX_ENABLED: "true",
      RELAY_COMMAND_SCHEDULE_PLAN_ENABLED: "true"
    });
    try {
      const res = await fetch(`${app.url}/api/v1/creator/command/plan-proposal/refine`, {
        method: "POST",
        headers: { authorization: "Bearer web_lab2", "content-type": "application/json" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          proposal_id: approved.proposal_id,
          instruction: "Change the drops to every Saturday."
        })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: {
          op: string;
          summary: string;
          plan: { weekday: number };
          proposal: { stage: string; frozen_post_ids: string[] };
        };
      };
      expect(body.data.op).toBe("set_weekday");
      expect(body.data.plan.weekday).toBe(6);
      expect(body.data.proposal.stage).toBe("plan_shaping");
      expect(body.data.proposal.frozen_post_ids).toEqual(["a", "b"]);
      expect(body.data.summary).toMatch(/saturday/i);
    } finally {
      await app.close();
    }
  });
});
