/**
 * Command MCP request auth (RC-P3-T01 / T02).
 * Bearer grants are hashed at rest. Lab bypass is production-refused.
 */
import {
  CommandContractError,
  getRelayCommandFeatureFlags,
  type CommandGrantScope
} from "../contracts.js";
import type { CommandGrantStore } from "./grant-store.js";

export type CommandMcpAuthOrigin = "mcp" | "lab_bypass" | "harness";

export type CommandMcpAuth = {
  origin: CommandMcpAuthOrigin;
  creatorId: string;
  accountId?: string | null;
  grantId?: string;
  scopes: CommandGrantScope[];
};

export type CommandMcpAuthRequest = {
  authorization?: string;
  creatorIdHeader?: string;
  env?: NodeJS.ProcessEnv;
  injected?: CommandMcpAuth | null;
  grantStore?: CommandGrantStore;
};

const LAB_READ_SCOPES: CommandGrantScope[] = ["library:read"];

function envFlagOn(env: NodeJS.ProcessEnv, key: string): boolean {
  const raw = env[key];
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function forbidden(message: string, field: string, issue: string): never {
  throw new CommandContractError("COMMAND_FORBIDDEN", message, [{ field, issue }]);
}

function bearerToken(authorization: string | undefined): string | null {
  const authz = authorization?.trim() ?? "";
  if (!authz.toLowerCase().startsWith("bearer ")) return null;
  const token = authz.slice(7).trim();
  return token || null;
}

export async function resolveCommandMcpAuth(
  input: CommandMcpAuthRequest
): Promise<CommandMcpAuth> {
  if (input.injected) return input.injected;

  const env = input.env ?? process.env;
  const flags = getRelayCommandFeatureFlags(env);
  if (!flags.layer_enabled || !flags.mcp_enabled) {
    forbidden("Command MCP is disabled.", "RELAY_COMMAND_MCP_ENABLED", "off");
  }

  const token = bearerToken(input.authorization);
  if (token) {
    if (!input.grantStore) {
      forbidden("Command MCP grant store is not configured.", "grantStore", "missing");
    }
    const grant = await input.grantStore.resolveToken(token);
    if (!grant) {
      forbidden("Invalid, expired, or revoked command grant.", "authorization", "invalid");
    }
    const headerCreator = input.creatorIdHeader?.trim() ?? "";
    if (headerCreator && headerCreator !== grant.creatorId) {
      forbidden(
        "Grant creator does not match requested creator.",
        "creator_id",
        "mismatch"
      );
    }
    return {
      origin: "mcp",
      creatorId: grant.creatorId,
      accountId: grant.accountId,
      grantId: grant.id,
      scopes: [...grant.scopes]
    };
  }

  const labBypass = envFlagOn(env, "RELAY_COMMAND_MCP_LAB_BYPASS");
  if (labBypass) {
    if ((env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
      forbidden("MCP lab bypass is never enabled in production.", "RELAY_COMMAND_MCP_LAB_BYPASS", "production");
    }
    const creatorId = input.creatorIdHeader?.trim() ?? "";
    if (!creatorId) {
      forbidden("Lab bypass requires X-Relay-Creator-Id.", "creator_id", "missing");
    }
    return { origin: "lab_bypass", creatorId, accountId: null, scopes: [...LAB_READ_SCOPES] };
  }

  forbidden("Command MCP requires a grant or documented lab bypass.", "authorization", "missing");
}

export function commandMcpAuthHasScopes(
  auth: CommandMcpAuth,
  required: readonly CommandGrantScope[]
): boolean {
  return required.every((scope) => auth.scopes.includes(scope));
}
