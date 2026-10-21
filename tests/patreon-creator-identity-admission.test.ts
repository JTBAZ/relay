import { describe, expect, it, vi } from "vitest";
import { hasVerifiedCreatorMembershipRelationships, tierIdsFromIdentityDoc, type PatreonIdentityDocument } from "../src/patreon/patreon-user-identity.js";
import { exchangePatreonPatronOAuth } from "../src/patreon/patreon-patron-oauth.js";
import { refreshPatronEntitlementSnapshotFromPatreon } from "../src/patron/patron-entitlement-refresh.js";
import { TokenEncryption } from "../src/lib/crypto.js";

const document = (relationships: unknown, status = "active_patron") => ({ data: { type: "user", id: "provider-user" }, included: [
  { type: "member", id: "member-one", attributes: { patron_status: status, currently_entitled_amount_cents: 0 }, relationships }
] }) as PatreonIdentityDocument;
const campaign = { data: { type: "campaign", id: "A" } };
const tiers = { data: [{ type: "tier", id: "paid" }] };
const invalid = [
  ["missing campaign with paid tiers", { currently_entitled_tiers: tiers }],
  ["missing campaign with empty tiers", { currently_entitled_tiers: { data: [] } }],
  ["missing campaign and tiers", {}],
  ["wrong campaign type", { campaign: { data: { type: "user", id: "A" } }, currently_entitled_tiers: tiers }],
  ["blank campaign id", { campaign: { data: { type: "campaign", id: "" } }, currently_entitled_tiers: tiers }],
  ["whitespace campaign id", { campaign: { data: { type: "campaign", id: " " } }, currently_entitled_tiers: tiers }],
  ["missing target tiers", { campaign }],
  ["null target tiers", { campaign, currently_entitled_tiers: { data: null } }],
  ["singleton target tiers", { campaign, currently_entitled_tiers: { data: { type: "tier", id: "paid" } } }],
  ["wrong target tier type", { campaign, currently_entitled_tiers: { data: [{ type: "campaign", id: "paid" }] } }],
  ["blank target tier id", { campaign, currently_entitled_tiers: { data: [{ type: "tier", id: "" }] } }],
  ["padded target tier id", { campaign, currently_entitled_tiers: { data: [{ type: "tier", id: " paid " }] } }]
] as const;

describe("creator-scoped Patreon identity admission", () => {
  it.each(invalid)("rejects %s before either caller admits state", async (_name, relationships) => {
    const doc = document(relationships);
    expect(hasVerifiedCreatorMembershipRelationships(doc, "A")).toBe(false);
    const complete = vi.fn();
    await expect(exchangePatreonPatronOAuth({ creatorId: "creator", patreonCampaignNumericId: "A", code: "code", redirectUri: "https://fixture.example/callback",
      patreonClient: { exchangeCode: async () => ({ access_token: "fixture" }) } as never,
      identityService: { capturePatreonObservation: async () => "1", completePatreonPatronOAuth: complete } as never,
      fetchImpl: async () => Response.json(doc) })).rejects.toThrow("identity_campaign_binding_unverified");
    expect(complete).not.toHaveBeenCalled();

    const encryption = new TokenEncryption(Buffer.alloc(32, 7).toString("base64"));
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ value: 1n }]), $transaction: vi.fn(),
      tenantMembership: { findUnique: vi.fn().mockResolvedValue({ accountId: "account", account: { patronPatreonUserId: "provider-user" } }) },
      patronOAuthCredential: { findUnique: vi.fn().mockResolvedValue({ encryptedPayload: Buffer.from(JSON.stringify({ encrypted_access_token: encryption.encrypt("fixture"), encrypted_refresh_token: encryption.encrypt("refresh") })) }) } };
    expect(await refreshPatronEntitlementSnapshotFromPatreon({ prisma: prisma as never, encryption, patreonClient: {} as never,
      patronMembershipId: "anchor", relayCreatorId: "creator", snapshotCampaignId: "A", source: "scheduled_refresh", fetchImpl: async () => Response.json(doc) }))
      .toEqual({ ok: false, reason: "identity_campaign_binding_unverified" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("accepts explicit A/B, free empty tiers and complete no-active responses", () => {
    const linked = document({ campaign, currently_entitled_tiers: tiers });
    linked.included!.push(document({ campaign: { data: { type: "campaign", id: "B" } } }).included![0]!);
    expect(hasVerifiedCreatorMembershipRelationships(linked, "A")).toBe(true);
    expect(tierIdsFromIdentityDoc(linked, "A")).toEqual(["patreon_tier_paid"]);
    const free = document({ campaign, currently_entitled_tiers: { data: [] } });
    expect(hasVerifiedCreatorMembershipRelationships(free, "A")).toBe(true);
    expect(tierIdsFromIdentityDoc(free, "A")).toEqual([]);
    expect(hasVerifiedCreatorMembershipRelationships(document({}, "former_patron"), "A")).toBe(true);
    expect(hasVerifiedCreatorMembershipRelationships({ data: { type: "user", id: "provider-user" }, included: [] }, "A")).toBe(true);
  });

  it("leaves the general identity parser's legacy fallback unchanged", () => {
    expect(tierIdsFromIdentityDoc(document({ currently_entitled_tiers: tiers }), "A")).toEqual(["patreon_tier_paid"]);
  });
});
