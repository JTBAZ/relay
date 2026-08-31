/**
 * Thin JSON-RPC 2.0 MCP adapter (RC-P3-T01).
 * Streamable-HTTP compatible methods: initialize, tools/list, tools/call.
 */
import { CommandContractError } from "../contracts.js";
import { invokeCommandMcpTool, type CommandMcpDispatchContext } from "./dispatch.js";
import { COMMAND_MCP_SYSTEM_RULES, listCommandMcpToolDefsForScopes } from "./tool-defs.js";

export type CommandMcpJsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

export type CommandMcpJsonRpcSuccess = {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
};

export type CommandMcpJsonRpcFailure = {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
};

export type CommandMcpJsonRpcResponse = CommandMcpJsonRpcSuccess | CommandMcpJsonRpcFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): CommandMcpJsonRpcFailure {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

function mapContractError(err: CommandContractError): number {
  if (err.code === "COMMAND_FORBIDDEN") return -32001;
  if (err.code === "COMMAND_APPLY_DISABLED") return -32002;
  if (err.code === "COMMAND_GATED_MEDIA") return -32003;
  if (err.code === "COMMAND_NOT_FOUND") return -32004;
  return -32602;
}

export async function handleCommandMcpJsonRpc(
  body: CommandMcpJsonRpcRequest,
  ctx: CommandMcpDispatchContext
): Promise<CommandMcpJsonRpcResponse> {
  const id = body.id ?? null;
  const method = typeof body.method === "string" ? body.method : "";
  try {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "relay-command", version: "relay-command-wire-v1" },
          instructions: COMMAND_MCP_SYSTEM_RULES
        }
      };
    }
    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: listCommandMcpToolDefsForScopes(ctx.auth.scopes).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
          }))
        }
      };
    }
    if (method === "tools/call") {
      const params = isRecord(body.params) ? body.params : {};
      const name = typeof params.name === "string" ? params.name : "";
      const args = params.arguments ?? params.args ?? {};
      const result = await invokeCommandMcpTool(name, args, ctx);
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result }
      };
    }
    return jsonRpcError(id, -32601, `Method not found: ${method || "missing"}`);
  } catch (err) {
    if (err instanceof CommandContractError) {
      return jsonRpcError(id, mapContractError(err), err.message, {
        code: err.code,
        details: err.details
      });
    }
    return jsonRpcError(id, -32603, err instanceof Error ? err.message : "Internal error");
  }
}
