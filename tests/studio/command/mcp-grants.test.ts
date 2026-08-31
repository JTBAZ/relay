import { describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { PrismaClient } from "@prisma/client";
import type { IdentityService } from "../../../src/identity/identity-service.js";
import { commandCapabilityFacade } from "../../../src/studio/command/capability-facade.js";
import { handleCommandMcpJsonRpc } from "../../../src/studio/command/mcp/jsonrpc.js";
import { invokeCommandMcpTool } from "../../../src/studio/command/mcp/dispatch.js";
import { resolveCommandMcpAuth } from "../../../src/studio/command/mcp/auth.js";
import { createMemoryCommandAuditStore } from "../../../src/studio/command/mcp/audit.js";
import {
  COMMAND_GRANT_MAX_TTL_MS,
  createMemoryCommandGrantStore
} from "../../../src/studio/command/mcp/grant-store.js";
import { registerRelayCommandMcpHttpRoutes } from "../../../src/studio/command/mcp/http-routes.js";
import { listCommandMcpToolDefsForScopes } from "../../../src/studio/command/mcp/tool-defs.js";

const MCP_ENV = {
  RELAY_COMMAND_LAYER_ENABLED: "true",
  RELAY_COMMAND_MCP_ENABLED: "true",
  NODE_ENV: "development"
};

const WRITE_SCOPES = ["library:read", "command:apply"] as const;

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

async function startGrantApp(env: NodeJS.ProcessEnv) {
  const previous: Record<string, string | undefined> = {
    RELAY_COMMAND_LAYER_ENABLED: process.env.RELAY_COMMAND_LAYER_ENABLED,
    RELAY_COMMAND_MCP_ENABLED: process.env.RELAY_COMMAND_MCP_ENABLED,
    RELAY_COMMAND_MCP_LAB_BYPASS: process.env.RELAY_COMMAND_MCP_LAB_BYPASS
  };
  process.env.RELAY_COMMAND_LAYER_ENABLED = env.RELAY_COMMAND_LAYER_ENABLED ?? "";
  process.env.RELAY_COMMAND_MCP_ENABLED = env.RELAY_COMMAND_MCP_ENABLED ?? "";
  process.env.RELAY_COMMAND_MCP_LAB_BYPASS = env.RELAY_COMMAND_MCP_LAB_BYPASS ?? "";

  const grantStore = createMemoryCommandGrantStore();
  const auditStore = createMemoryCommandAuditStore();
  const app = express();
  app.use(express.json());
  registerRelayCommandMcpHttpRoutes(app, {
    prisma: labPrisma(),
    identityService: labIdentity(),
    grantStore,
    auditStore
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    grantStore,
    auditStore,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      process.env.RELAY_COMMAND_LAYER_ENABLED = previous.RELAY_COMMAND_LAYER_ENABLED;
      process.env.RELAY_COMMAND_MCP_ENABLED = previous.RELAY_COMMAND_MCP_ENABLED;
      process.env.RELAY_COMMAND_MCP_LAB_BYPASS = previous.RELAY_COMMAND_MCP_LAB_BYPASS;
    }
  };
}

describe("Command MCP grants and audit (RC-P3-T02)", () => {
  it("issues hashed grants, lists them without the token, and revokes", async () => {
    const store = createMemoryCommandGrantStore();
    const issued = await store.issue({
      accountId: "acc_lab2",
      creatorId: "rcx_studio_lab2",
      scopes: ["library:read"],
      clientLabel: "lab2-dev"
    });
    expect(issued.token.startsWith("rcmd_")).toBe(true);
    expect(JSON.stringify(issued.grant)).not.toContain(issued.token);

    const listed = await store.list("acc_lab2", "rcx_studio_lab2");
    expect(listed.map((g) => g.grant_id)).toEqual([issued.grant.grant_id]);
    expect(listed[0]?.revoked_at).toBeNull();

    await store.revoke(issued.grant.grant_id, "acc_lab2");
    await expect(
      resolveCommandMcpAuth({
        authorization: `Bearer ${issued.token}`,
        grantStore: store,
        env: MCP_ENV
      })
    ).rejects.toMatchObject({ code: "COMMAND_FORBIDDEN" });
  });

  it("caps TTL at 7 days and treats expired grants as invalid", async () => {
    const store = createMemoryCommandGrantStore();
    await expect(
      store.issue({
        accountId: "acc_lab2",
        creatorId: "rcx_studio_lab2",
        clientLabel: "too-long",
        ttlMs: COMMAND_GRANT_MAX_TTL_MS + 1
      })
    ).rejects.toMatchObject({ code: "COMMAND_VALIDATION" });

    const issued = await store.issue({
      accountId: "acc_lab2",
      creatorId: "rcx_studio_lab2",
      clientLabel: "expired",
      ttlMs: 1_000,
      now: new Date(0)
    });
    expect(await store.resolveToken(issued.token, new Date(2_000))).toBeNull();
  });

  it("hides write tools for a read-only grant", async () => {
    const listed = await handleCommandMcpJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      {
        auth: {
          origin: "mcp",
          creatorId: "rcx_studio_lab2",
          accountId: "acc_lab2",
          scopes: ["library:read"]
        },
        facade: commandCapabilityFacade
      }
    );
    if (!("result" in listed)) throw new Error("expected tools/list result");
    const names = (listed.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(names).toEqual(listCommandMcpToolDefsForScopes(["library:read"]).map((t) => t.name));
    expect(names).not.toContain("create_or_update_collection");
    expect(names).not.toContain("apply_change_set");
  });

  it("lists apply tools when the grant includes command:apply", async () => {
    const listed = await handleCommandMcpJsonRpc(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      {
        auth: {
          origin: "mcp",
          creatorId: "rcx_studio_lab2",
          scopes: [...WRITE_SCOPES]
        },
        facade: commandCapabilityFacade
      }
    );
    if (!("result" in listed)) throw new Error("expected tools/list result");
    const names = (listed.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(names).toContain("apply_change_set");
    expect(names).toContain("revise_post");
    expect(names).not.toContain("create_or_update_collection");
  });

  it("resolves a bearer grant to the bound creator and refuses a foreign Lab 2 header", async () => {
    const store = createMemoryCommandGrantStore();
    const issued = await store.issue({
      accountId: "acc_other",
      creatorId: "cr_other",
      scopes: ["library:read"],
      clientLabel: "other-client"
    });
    const auth = await resolveCommandMcpAuth({
      authorization: `Bearer ${issued.token}`,
      grantStore: store,
      env: MCP_ENV
    });
    expect(auth.creatorId).toBe("cr_other");
    expect(auth.accountId).toBe("acc_other");
    expect(auth.origin).toBe("mcp");

    await expect(
      resolveCommandMcpAuth({
        authorization: `Bearer ${issued.token}`,
        creatorIdHeader: "rcx_studio_lab2",
        grantStore: store,
        env: MCP_ENV
      })
    ).rejects.toMatchObject({ code: "COMMAND_FORBIDDEN" });

    const loadLibraryItems = async (creatorId: string) => {
      expect(creatorId).toBe("cr_other");
      return [];
    };
    const spy = { calledWith: "" as string };
    await invokeCommandMcpTool(
      "search_library",
      { query: { q: "Hero Academy" } },
      {
        auth,
        facade: commandCapabilityFacade,
        loadLibraryItems: async (creatorId) => {
          spy.calledWith = creatorId;
          return loadLibraryItems(creatorId);
        }
      }
    );
    expect(spy.calledWith).toBe("cr_other");
  });

  it("records an audit row with input hash, not raw arguments or URLs", async () => {
    const auditStore = createMemoryCommandAuditStore();
    await invokeCommandMcpTool(
      "search_library",
      { query: { q: "secret prompt text" } },
      {
        auth: {
          origin: "mcp",
          creatorId: "rcx_studio_lab2",
          accountId: "acc_lab2",
          scopes: ["library:read"]
        },
        facade: commandCapabilityFacade,
        auditStore,
        traceId: "trace_t02"
      }
    );
    const rows = await auditStore.listForCreator("rcx_studio_lab2");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tool: "search_library",
      outcome: "ok",
      origin: "mcp",
      traceId: "trace_t02",
      creatorId: "rcx_studio_lab2",
      accountId: "acc_lab2"
    });
    const serialized = JSON.stringify(rows[0]);
    expect(serialized).not.toMatch(/secret prompt text/);
    expect(rows[0]?.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("audits forbidden write attempts and harness origin", async () => {
    const auditStore = createMemoryCommandAuditStore();
    await expect(
      invokeCommandMcpTool(
        "apply_change_set",
        { change_set_id: "cs_secret", resolved_post_ids: ["sl2_ha_p01"] },
        {
          auth: {
            origin: "harness",
            creatorId: "rcx_studio_lab2",
            scopes: ["library:read"]
          },
          facade: commandCapabilityFacade,
          auditStore,
          traceId: "trace_forbidden"
        }
      )
    ).rejects.toMatchObject({ code: "COMMAND_FORBIDDEN" });
    const rows = await auditStore.listForCreator("rcx_studio_lab2");
    expect(rows[0]).toMatchObject({
      tool: "apply_change_set",
      outcome: "COMMAND_FORBIDDEN",
      changeSetId: "cs_secret",
      origin: "harness"
    });
  });

  it("returns 404 for grant and MCP HTTP while Command Layer flags are off", async () => {
    const handle = await startGrantApp({
      RELAY_COMMAND_LAYER_ENABLED: "false",
      RELAY_COMMAND_MCP_ENABLED: "false"
    });
    try {
      const grants = await fetch(`${handle.url}/api/v1/creator/command/grants`);
      expect(grants.status).toBe(404);
      const issue = await fetch(`${handle.url}/api/v1/creator/command/grants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_label: "lab2-dev" })
      });
      expect(issue.status).toBe(404);
      const mcp = await fetch(`${handle.url}/api/v1/creator/command/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      });
      expect(mcp.status).toBe(404);
    } finally {
      await handle.close();
    }
  });

  it("issues, lists, and revokes lab grants over HTTP using the web session, not the MCP token", async () => {
    const handle = await startGrantApp({
      RELAY_COMMAND_LAYER_ENABLED: "true",
      RELAY_COMMAND_MCP_ENABLED: "true"
    });
    try {
      const issue = await fetch(`${handle.url}/api/v1/creator/command/grants`, {
        method: "POST",
        headers: {
          authorization: "Bearer web_lab2",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          creator_id: "rcx_studio_lab2",
          client_label: "lab2-dev",
          scopes: ["library:read"]
        })
      });
      expect(issue.status).toBe(201);
      const issued = (await issue.json()) as {
        data: { grant: { grant_id: string }; token: string };
      };
      expect(issued.data.token.startsWith("rcmd_")).toBe(true);

      const listed = await fetch(`${handle.url}/api/v1/creator/command/grants`, {
        headers: { authorization: "Bearer web_lab2" }
      });
      expect(listed.status).toBe(200);
      const listedBody = (await listed.json()) as {
        data: { grants: Array<{ grant_id: string; revoked_at: string | null }> };
      };
      expect(listedBody.data.grants).toHaveLength(1);
      expect(JSON.stringify(listedBody)).not.toContain(issued.data.token);

      const mcpAsMcpToken = await fetch(`${handle.url}/api/v1/creator/command/mcp`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${issued.data.token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      });
      expect(mcpAsMcpToken.status).toBe(200);
      const rpc = (await mcpAsMcpToken.json()) as {
        result: { tools: Array<{ name: string }> };
      };
      expect(rpc.result.tools.map((t) => t.name)).not.toContain("apply_change_set");

      const grantsAsMcpToken = await fetch(`${handle.url}/api/v1/creator/command/grants`, {
        headers: { authorization: `Bearer ${issued.data.token}` }
      });
      expect(grantsAsMcpToken.status).toBe(403);

      const revoked = await fetch(`${handle.url}/api/v1/creator/command/grants/revoke`, {
        method: "POST",
        headers: {
          authorization: "Bearer web_lab2",
          "content-type": "application/json"
        },
        body: JSON.stringify({ grant_id: issued.data.grant.grant_id })
      });
      expect(revoked.status).toBe(200);
    } finally {
      await handle.close();
    }
  });
});
