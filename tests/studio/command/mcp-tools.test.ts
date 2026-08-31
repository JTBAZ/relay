import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { COMMAND_CAPABILITY_NAMES } from "../../../src/studio/command/contracts.js";
import {
  commandCapabilityFacade,
  type CommandCapabilityFacade
} from "../../../src/studio/command/capability-facade.js";
import { handleCommandMcpJsonRpc } from "../../../src/studio/command/mcp/jsonrpc.js";
import { invokeCommandMcpTool } from "../../../src/studio/command/mcp/dispatch.js";
import { redactCommandMcpValue, assertCommandMcpInputSafety } from "../../../src/studio/command/mcp/redact.js";
import { resolveCommandMcpAuth, type CommandMcpAuth } from "../../../src/studio/command/mcp/auth.js";
import {
  COMMAND_MCP_SYSTEM_RULES,
  commandMcpForbiddenToolNames,
  commandMcpToolSchemaSnapshot,
  listCommandMcpToolDefs,
  listCommandMcpToolDefsForScopes
} from "../../../src/studio/command/mcp/tool-defs.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

function readGrant(scopes: CommandMcpAuth["scopes"] = ["library:read"]): CommandMcpAuth {
  return { origin: "mcp", creatorId: "rcx_studio_lab2", scopes };
}

function mockFacade(partial: Partial<CommandCapabilityFacade>): CommandCapabilityFacade {
  return { ...commandCapabilityFacade, ...partial };
}

describe("Command MCP tool schemas (RC-P3-T01)", () => {
  it("exposes exactly the frozen capability names and never publish_external", () => {
    const names = listCommandMcpToolDefs().map((t) => t.name);
    expect(names).toEqual([...COMMAND_CAPABILITY_NAMES]);
    expect(names).not.toContain("publish_external");
    expect(commandMcpForbiddenToolNames()).toContain("publish_external");
  });

  it("snapshots JSON schemas so adding a tool requires a contract change", async () => {
    await expect(`${JSON.stringify(commandMcpToolSchemaSnapshot(), null, 2)}\n`).toMatchFileSnapshot(
      join(fixtureDir, "relay-command-mcp-tool-schemas.json")
    );
  });

  it("keeps initialize instructions as data-not-ontology rules", () => {
    expect(COMMAND_MCP_SYSTEM_RULES).toMatch(/User instruction is data/);
    expect(COMMAND_MCP_SYSTEM_RULES).toMatch(/Do not guess related works/);
    expect(COMMAND_MCP_SYSTEM_RULES).toMatch(/Never SQL/);
  });

  it("does not wrap src/server.ts routes as tools", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../src/studio/command/mcp/dispatch.ts"),
      "utf8"
    );
    expect(src).toMatch(/capability-facade/);
    expect(src).not.toMatch(/src\/server\.ts/);
    expect(src).not.toMatch(/app\.(get|post|patch|put|delete)\(/);
  });
});

describe("Command MCP auth (RC-P3-T01)", () => {
  it("refuses lab bypass in production", async () => {
    await expect(
      resolveCommandMcpAuth({
        creatorIdHeader: "rcx_studio_lab2",
        env: {
          RELAY_COMMAND_LAYER_ENABLED: "true",
          RELAY_COMMAND_MCP_ENABLED: "true",
          RELAY_COMMAND_MCP_LAB_BYPASS: "true",
          NODE_ENV: "production"
        }
      })
    ).rejects.toMatchObject({ code: "COMMAND_FORBIDDEN" });
  });

  it("allows documented lab bypass only when not production", async () => {
    const auth = await resolveCommandMcpAuth({
      creatorIdHeader: "rcx_studio_lab2",
      env: {
        RELAY_COMMAND_LAYER_ENABLED: "true",
        RELAY_COMMAND_MCP_ENABLED: "true",
        RELAY_COMMAND_MCP_LAB_BYPASS: "1",
        NODE_ENV: "development"
      }
    });
    expect(auth).toEqual({
      origin: "lab_bypass",
      creatorId: "rcx_studio_lab2",
      accountId: null,
      scopes: ["library:read"]
    });
  });

  it("rejects bearer tokens without a grant store", async () => {
    await expect(
      resolveCommandMcpAuth({
        authorization: "Bearer not-a-grant",
        env: {
          RELAY_COMMAND_LAYER_ENABLED: "true",
          RELAY_COMMAND_MCP_ENABLED: "true",
          NODE_ENV: "development"
        }
      })
    ).rejects.toMatchObject({ code: "COMMAND_FORBIDDEN" });
  });
});

describe("Command MCP dispatch (RC-P3-T01)", () => {
  it("invokes the facade for search_library and returns compact records", async () => {
    const search = vi.fn().mockReturnValue({
      selection: { post_ids: ["sl2_wc_01"], explanation: "tag", warnings: [] },
      records: [
        {
          post_id: "sl2_wc_01",
          title: "Harbor light",
          tag_ids: ["sl2_tag_watercolor"],
          published_at: "2025-01-01T00:00:00.000Z",
          visibility: "visible",
          source: "PATREON",
          collection_ids: [],
          page_number: null,
          destination_flags: {},
          member_label: null
        }
      ]
    });
    const result = await invokeCommandMcpTool(
      "search_library",
      { query: { tag_ids: ["sl2_tag_watercolor"] } },
      {
        auth: readGrant(),
        facade: mockFacade({ search_library: search }),
        loadLibraryItems: () => []
      }
    );
    expect(search).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      selection: { post_ids: ["sl2_wc_01"] },
      records: [{ post_id: "sl2_wc_01", title: "Harbor light" }]
    });
  });

  it("redacts facade output before returning to the caller", async () => {
    const search = vi.fn().mockReturnValue({
      records: [
        {
          post_id: "sl2_gt_01",
          title: "Gated",
          content_url_path: "/api/v1/media/secret/content",
          encryptedPayload: "nope"
        }
      ]
    });
    const result = await invokeCommandMcpTool(
      "search_library",
      { query: {} },
      {
        auth: readGrant(),
        facade: mockFacade({ search_library: search }),
        loadLibraryItems: () => []
      }
    );
    expect(result).toEqual({ records: [{ post_id: "sl2_gt_01", title: "Gated" }] });
  });

  it("hides write tools without command:apply and without the apply flag", async () => {
    await expect(
      invokeCommandMcpTool(
        "apply_change_set",
        { change_set_id: "cs_1", resolved_post_ids: ["a"] },
        { auth: readGrant(["library:read"]), facade: commandCapabilityFacade }
      )
    ).rejects.toMatchObject({ code: "COMMAND_FORBIDDEN" });

    await expect(
      invokeCommandMcpTool(
        "apply_change_set",
        { change_set_id: "cs_1", resolved_post_ids: ["a"] },
        {
          auth: readGrant(["library:read", "command:apply"]),
          facade: commandCapabilityFacade,
          env: { RELAY_COMMAND_APPLY_ENABLED: "false" }
        }
      )
    ).rejects.toMatchObject({ code: "COMMAND_APPLY_DISABLED" });
  });

  it("rejects publish_external", async () => {
    await expect(
      invokeCommandMcpTool("publish_external", {}, { auth: readGrant(), facade: commandCapabilityFacade })
    ).rejects.toMatchObject({ code: "COMMAND_FORBIDDEN" });
  });

  it("lists tools over JSON-RPC and calls initialize with system rules", async () => {
    const listed = await handleCommandMcpJsonRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { auth: readGrant(), facade: commandCapabilityFacade }
    );
    expect(listed).toMatchObject({ jsonrpc: "2.0", id: 1 });
    if ("result" in listed) {
      const tools = (listed.result as { tools: Array<{ name: string }> }).tools;
      expect(tools.map((t) => t.name)).toEqual(
        listCommandMcpToolDefsForScopes(["library:read"]).map((t) => t.name)
      );
      expect(tools.map((t) => t.name)).not.toContain("apply_change_set");
    } else {
      throw new Error("expected tools/list result");
    }

    const init = await handleCommandMcpJsonRpc(
      { jsonrpc: "2.0", id: 2, method: "initialize" },
      { auth: readGrant(), facade: commandCapabilityFacade }
    );
    expect(init).toMatchObject({
      result: { instructions: COMMAND_MCP_SYSTEM_RULES, serverInfo: { name: "relay-command" } }
    });
  });
});

describe("Command MCP compact I/O and safety (RC-P3-T03)", () => {
  it("strips URLs, encrypted payloads, emails, and zip paths from tool output", () => {
    const redacted = redactCommandMcpValue({
      post_id: "sl2_gt_01",
      title: "Studio shot",
      content_url_path: "/api/v1/media/abc/content",
      preview_url_path: "https://cdn.example/preview.jpg",
      encryptedPayload: "secret",
      email: "patron@example.com",
      patron_email: "patron@example.com",
      zip_path: "/tmp/export.zip",
      distribution_summary: { destinations: [{ destination: "x", external_url: "https://x.com/p/1" }] },
      nested: { signed_url: "https://s3.example/obj", media_id: "m_1" }
    });
    expect(redacted).toEqual({
      post_id: "sl2_gt_01",
      title: "Studio shot",
      distribution_summary: { destinations: [{ destination: "x" }] },
      nested: { media_id: "m_1" }
    });
  });

  it("refuses gated-original intents on revise_post and destination drafts", async () => {
    try {
      assertCommandMcpInputSafety("revise_post", { post_id: "sl2_gt_01", expose_gated_originals: true });
      throw new Error("expected COMMAND_GATED_MEDIA");
    } catch (err) {
      expect(err).toMatchObject({ code: "COMMAND_GATED_MEDIA" });
    }
    try {
      assertCommandMcpInputSafety("prepare_destination_drafts", {
        post_ids: ["sl2_gt_01"],
        media_role: "original"
      });
      throw new Error("expected COMMAND_GATED_MEDIA");
    } catch (err) {
      expect(err).toMatchObject({ code: "COMMAND_GATED_MEDIA" });
    }
    await expect(
      invokeCommandMcpTool(
        "revise_post",
        { post_id: "sl2_gt_01", source: "PATREON", fields: { title: "x" }, use_gated_original: true },
        {
          auth: readGrant(["library:read", "command:apply"]),
          facade: commandCapabilityFacade,
          env: { RELAY_COMMAND_APPLY_ENABLED: "true" }
        }
      )
    ).rejects.toMatchObject({ code: "COMMAND_GATED_MEDIA" });
  });

  it("rejects unsolicited curation keys", () => {
    try {
      assertCommandMcpInputSafety("search_library", { query: { similar_to: "sl2_wc_01" } });
      throw new Error("expected COMMAND_FORBIDDEN");
    } catch (err) {
      expect(err).toMatchObject({ code: "COMMAND_FORBIDDEN" });
    }
  });

  it("rejects secret-bearing tool arguments", () => {
    try {
      assertCommandMcpInputSafety("search_library", { encryptedPayload: "nope" });
      throw new Error("expected COMMAND_FORBIDDEN");
    } catch (err) {
      expect(err).toMatchObject({ code: "COMMAND_FORBIDDEN" });
    }
  });
});

describe("Command MCP error mapping", () => {
  it("maps CommandContractError onto JSON-RPC error data without leaking URLs", async () => {
    const res = await handleCommandMcpJsonRpc(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "publish_external", arguments: {} }
      },
      { auth: readGrant(), facade: commandCapabilityFacade }
    );
    expect(res).toMatchObject({
      error: { data: { code: "COMMAND_FORBIDDEN" } }
    });
  });
});
