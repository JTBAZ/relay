/**
 * Relay Command MCP adapter public surface (RC-P3-T01).
 * Tools map 1:1 onto src/studio/command capability facade — never Prisma-generated MCP.
 */
export { listCommandMcpToolDefs, listCommandMcpToolDefsForScopes, COMMAND_MCP_SYSTEM_RULES, commandMcpToolSchemaSnapshot } from "./tool-defs.js";
export { redactCommandMcpValue, assertCommandMcpInputSafety } from "./redact.js";
export { resolveCommandMcpAuth } from "./auth.js";
export { invokeCommandMcpTool } from "./dispatch.js";
export { handleCommandMcpJsonRpc } from "./jsonrpc.js";
export { registerRelayCommandMcpHttpRoutes } from "./http-routes.js";
export { createMemoryCommandGrantStore, createCommandGrantStore } from "./grant-store.js";
export { createMemoryCommandAuditStore } from "./audit.js";
