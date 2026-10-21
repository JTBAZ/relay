import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

const identityHash = (id: string) => createHash("sha256").update(`relay:patreon-identity:${id}`).digest("hex");

/** Caller holds the provider identity lock. The hash survives purge to fence collectors already in flight. */
export async function advancePatreonIdentityFence(tx: Prisma.TransactionClient, id: string): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('patreon_member_observation_seq') AS value`;
  const value = rows[0]!.value;
  await tx.$executeRaw`INSERT INTO patreon_identity_fences(identity_hash, observation) VALUES (${identityHash(id)}, ${value})
    ON CONFLICT(identity_hash) DO UPDATE SET observation = EXCLUDED.observation`;
  return value.toString();
}

export async function assertPatreonIdentityObservation(tx: Prisma.TransactionClient, id: string, token: string, creatorId?: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ observation: bigint }>>`SELECT observation FROM patreon_identity_fences WHERE identity_hash = ${identityHash(id)}`;
  const members = creatorId ? await tx.$queryRaw<Array<{ observation: bigint | null }>>`SELECT MAX((state->>'observationToken')::bigint) AS observation
    FROM patreon_member_states WHERE creator_id = ${creatorId} AND state->>'userId' = ${id}` : [];
  if ((rows[0] && rows[0].observation > BigInt(token)) || (members[0]?.observation != null && members[0].observation > BigInt(token))) throw new Error("Patreon identity changed during collection; retry required.");
}

