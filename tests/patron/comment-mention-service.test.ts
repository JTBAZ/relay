import { describe, expect, it, vi } from "vitest";
import {
  extractMentionHandles,
  resolveMentionRecipients
} from "../../src/patron/comment-mention-service.js";

describe("extractMentionHandles", () => {
  it("extracts unique normalized @handles and ignores email addresses", () => {
    expect(
      extractMentionHandles("Thanks @Dev-Milo and @patron_one. Not email dev@example.com @Dev-Milo")
    ).toEqual(["dev-milo", "patron_one"]);
  });
});

describe("resolveMentionRecipients", () => {
  it("resolves Relay usernames to memberships owned by that account", async () => {
    const prisma = {
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({ id: "author-m", accountId: "author-a" }),
        findMany: vi.fn().mockResolvedValue([{ id: "creator-m", accountId: "creator-a" }])
      },
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: "creator-a", usernameNorm: "dev-milo", primaryRelayCreatorId: "creator-milo" }
        ])
      }
    } as never;

    const recipients = await resolveMentionRecipients(prisma, {
      handles: ["dev-milo"],
      authorMembershipId: "author-m"
    });

    expect(recipients).toEqual([
      {
        handle: "dev-milo",
        recipientMembershipId: "creator-m",
        targetKind: "creator",
        targetAccountId: "creator-a"
      }
    ]);
  });

  it("resolves supporter Relay usernames", async () => {
    const prisma = {
      tenantMembership: {
        findUnique: vi.fn().mockResolvedValue({ id: "author-m", accountId: "author-a" }),
        findMany: vi.fn().mockResolvedValue([{ id: "riley-m", accountId: "riley-a" }])
      },
      account: {
        findMany: vi.fn().mockResolvedValue([
          { id: "riley-a", usernameNorm: "riley", primaryRelayCreatorId: null }
        ])
      }
    } as never;

    const recipients = await resolveMentionRecipients(prisma, {
      handles: ["riley"],
      authorMembershipId: "author-m"
    });

    expect(recipients).toEqual([
      {
        handle: "riley",
        recipientMembershipId: "riley-m",
        targetKind: "patron",
        targetAccountId: "riley-a"
      }
    ]);
  });
});

