import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import type { IdentityService } from "../../../src/identity/identity-service.js";
import { SELECTION_REFINE_PLANNER_UNAVAILABLE } from "../../../src/studio/command/command-proposal-refine.js";
import { registerRelayCommandHttpRoutes } from "../../../src/studio/command/http-routes.js";
import {
  ACTIVE_SELECTION_PROPOSAL_EXISTS,
  clearSelectionProposalStore
} from "../../../src/studio/command/proposal-types.js";
import type { CommandLibraryItem } from "../../../src/studio/command/selection.js";

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
  "RELAY_COMMAND_SELECTION_UX_ENABLED",
  "RELAY_COMMAND_PLANNER_ENABLED"
] as const;

function labIdentity(creatorId = "rcx_studio_lab2"): IdentityService {
  return {
    resolveSession: async (token: string) => {
      if (token !== "web_lab2") return null;
      return {
        token,
        user_id: "tm_lab2",
        creator_id: creatorId,
        tier_ids: [],
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        kind: "web" as const
      };
    }
  } as IdentityService;
}

function labPrisma(creatorId = "rcx_studio_lab2"): PrismaClient {
  return {
    tenantMembership: {
      findUnique: async () => ({ accountId: "acc_lab2" })
    },
    account: {
      findUnique: async () => ({
        id: "acc_lab2",
        supabaseUserId: null,
        primaryRelayCreatorId: creatorId
      })
    }
  } as unknown as PrismaClient;
}

async function startApp(env: Partial<Record<(typeof FLAG_KEYS)[number], string>>, prisma: PrismaClient | null) {
  const previous: Record<string, string | undefined> = {};
  for (const key of FLAG_KEYS) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  const app = express();
  app.use(express.json());
  registerRelayCommandHttpRoutes(app, {
    prisma,
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
  for (const key of FLAG_KEYS) {
    delete process.env[key];
  }
});

describe("selection proposal refine HTTP", () => {
  it("404s when selection UX is off", async () => {
    const handle = await startApp({ RELAY_COMMAND_LAYER_ENABLED: "true" }, labPrisma());
    try {
      const res = await fetch(`${handle.url}/api/v1/creator/command/selection-proposal/refine`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          proposal_id: "pr_missing",
          instruction: "Remove anything already on X."
        })
      });
      expect(res.status).toBe(404);
    } finally {
      await handle.close();
    }
  });

  it("rejects a foreign creator_id before touching the proposal", async () => {
    const handle = await startApp(
      {
        RELAY_COMMAND_LAYER_ENABLED: "true",
        RELAY_COMMAND_SELECTION_UX_ENABLED: "true"
      },
      labPrisma()
    );
    try {
      const res = await fetch(`${handle.url}/api/v1/creator/command/selection-proposal/refine`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_other",
          proposal_id: "pr_missing",
          instruction: "drop page 2"
        })
      });
      expect(res.status).toBe(403);
    } finally {
      await handle.close();
    }
  });

  it("applies already-on-X cleanup without the planner", async () => {
    const handle = await startApp(
      {
        RELAY_COMMAND_LAYER_ENABLED: "true",
        RELAY_COMMAND_SELECTION_UX_ENABLED: "true"
      },
      labPrisma()
    );
    try {
      const created = await fetch(`${handle.url}/api/v1/creator/command/selection-proposal`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          instruction: "Organize the watercolor landscapes newest first into a collection.",
          post_ids: ["a", "b"]
        })
      });
      expect(created.status).toBe(200);
      const createdBody = (await created.json()) as { data: { proposal: { proposal_id: string } } };
      const refined = await fetch(`${handle.url}/api/v1/creator/command/selection-proposal/refine`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          proposal_id: createdBody.data.proposal.proposal_id,
          instruction: "Remove anything already on X."
        })
      });
      expect(refined.status).toBe(200);
      const body = (await refined.json()) as { data: { summary: string; post_ids: string[] } };
      expect(body.data.post_ids).toEqual([]);
      expect(body.data.summary).toMatch(/None of these are marked as already on X/);
    } finally {
      await handle.close();
    }
  });

  it("fails closed when the planner is off", async () => {
    const handle = await startApp(
      {
        RELAY_COMMAND_LAYER_ENABLED: "true",
        RELAY_COMMAND_SELECTION_UX_ENABLED: "true"
      },
      labPrisma()
    );
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
      const createdBody = (await created.json()) as { data: { proposal: { proposal_id: string } } };
      const refined = await fetch(`${handle.url}/api/v1/creator/command/selection-proposal/refine`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          proposal_id: createdBody.data.proposal.proposal_id,
          instruction: "drop page 2"
        })
      });
      expect(refined.status).toBe(400);
      const body = (await refined.json()) as { error: { message: string } };
      expect(body.error.message).toBe(SELECTION_REFINE_PLANNER_UNAVAILABLE);
    } finally {
      await handle.close();
    }
  });
});

describe("selection proposal active GET / conflict", () => {
  it("returns null when no proposal is open", async () => {
    const handle = await startApp(
      {
        RELAY_COMMAND_LAYER_ENABLED: "true",
        RELAY_COMMAND_SELECTION_UX_ENABLED: "true"
      },
      labPrisma()
    );
    try {
      const res = await fetch(
        `${handle.url}/api/v1/creator/command/selection-proposal?creator_id=rcx_studio_lab2`,
        { headers: { authorization: "Bearer web_lab2" } }
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { proposal: null } };
      expect(body.data.proposal).toBeNull();
    } finally {
      await handle.close();
    }
  });

  it("returns the active proposal and rejects a second create until it is discarded", async () => {
    const handle = await startApp(
      {
        RELAY_COMMAND_LAYER_ENABLED: "true",
        RELAY_COMMAND_SELECTION_UX_ENABLED: "true"
      },
      labPrisma()
    );
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
      const createdBody = (await created.json()) as { data: { proposal: { proposal_id: string } } };
      const active = await fetch(
        `${handle.url}/api/v1/creator/command/selection-proposal?creator_id=rcx_studio_lab2`,
        { headers: { authorization: "Bearer web_lab2" } }
      );
      expect(active.status).toBe(200);
      const activeBody = (await active.json()) as { data: { proposal: { proposal_id: string } } };
      expect(activeBody.data.proposal.proposal_id).toBe(createdBody.data.proposal.proposal_id);
      const second = await fetch(`${handle.url}/api/v1/creator/command/selection-proposal`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer web_lab2" },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          instruction: "Organize the watercolor landscapes newest first into a collection.",
          post_ids: ["b"]
        })
      });
      expect(second.status).toBe(400);
      const err = (await second.json()) as { error: { message: string } };
      expect(err.error.message).toBe(ACTIVE_SELECTION_PROPOSAL_EXISTS);
    } finally {
      await handle.close();
    }
  });
});

