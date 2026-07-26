import type { PrismaClient } from "@prisma/client";
import type { TokenEncryption } from "../lib/crypto.js";

export type CreatorBlueskyCredentialWire = {
  creator_id: string;
  handle: string;
  connected: true;
  updated_at: string;
};

export class BlueskyCredentialValidationError extends Error {
  public override readonly name = "BlueskyCredentialValidationError";
  public constructor(
    message: string,
    public readonly details: Array<{ field: string; issue: string }>
  ) {
    super(message);
  }
}

function normalizeHandle(raw: string): string {
  const trimmed = raw.trim().replace(/^@/, "");
  if (!trimmed) return "";
  if (trimmed.includes(".") && !trimmed.endsWith(".bsky.social")) {
    return trimmed.includes("@") ? trimmed.split("@").pop()!.trim() : `${trimmed}.bsky.social`;
  }
  return trimmed;
}

export async function getCreatorBlueskyCredential(
  prisma: PrismaClient,
  creatorId: string
): Promise<CreatorBlueskyCredentialWire | null> {
  const row = await prisma.creatorBlueskyCredential.findUnique({
    where: { creatorId },
    select: { creatorId: true, handle: true, updatedAt: true }
  });
  if (!row) return null;
  return {
    creator_id: row.creatorId,
    handle: row.handle,
    connected: true,
    updated_at: row.updatedAt.toISOString()
  };
}

export async function putCreatorBlueskyCredential(
  prisma: PrismaClient,
  encryption: TokenEncryption,
  creatorId: string,
  input: { handle: string; app_password: string }
): Promise<CreatorBlueskyCredentialWire> {
  const handle = normalizeHandle(input.handle);
  const appPassword = input.app_password?.trim() ?? "";
  if (!handle) {
    throw new BlueskyCredentialValidationError("Bluesky handle is required.", [
      { field: "handle", issue: "required" }
    ]);
  }
  if (!appPassword) {
    throw new BlueskyCredentialValidationError("Bluesky app password is required.", [
      { field: "app_password", issue: "required" }
    ]);
  }

  const row = await prisma.creatorBlueskyCredential.upsert({
    where: { creatorId },
    create: {
      creatorId,
      handle,
      encryptedAppPassword: Buffer.from(encryption.encrypt(appPassword), "utf8")
    },
    update: {
      handle,
      encryptedAppPassword: Buffer.from(encryption.encrypt(appPassword), "utf8")
    }
  });

  return {
    creator_id: row.creatorId,
    handle: row.handle,
    connected: true,
    updated_at: row.updatedAt.toISOString()
  };
}

export async function deleteCreatorBlueskyCredential(
  prisma: PrismaClient,
  creatorId: string
): Promise<void> {
  await prisma.creatorBlueskyCredential.deleteMany({ where: { creatorId } });
}

export async function loadCreatorBlueskyAppPassword(
  prisma: PrismaClient,
  encryption: TokenEncryption,
  creatorId: string
): Promise<{ handle: string; appPassword: string } | null> {
  const row = await prisma.creatorBlueskyCredential.findUnique({
    where: { creatorId }
  });
  if (!row) return null;
  const appPassword = encryption.decrypt(
    Buffer.from(row.encryptedAppPassword).toString("utf8")
  );
  return { handle: row.handle, appPassword };
}
