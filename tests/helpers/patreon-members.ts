import { vi } from "vitest";
import type { IdentityService } from "../../src/identity/identity-service.js";
import { PatreonSyncService } from "../../src/patreon/patreon-sync-service.js";
import type { PatreonTokenStore } from "../../src/auth/token-store.js";
import type { PatreonCookieStore } from "../../src/auth/cookie-store.js";
import type { PatreonAuthService } from "../../src/auth/auth-service.js";
import type { IngestService } from "../../src/ingest/ingest-service.js";
import type { JsonApiResource } from "../../src/patreon/jsonapi-types.js";

export function memberFixture(identity: IdentityService, creatorId = "ps10_fixture", campaignId = "1000", paidTierId = "paid") {
  const member = (id = "member-one", userId = "user-one", paid = true): JsonApiResource => ({ type: "member", id,
    attributes: { patron_status: paid ? "active_patron" : null, currently_entitled_amount_cents: paid ? 500 : 0, pledge_relationship_start: "2026-01-01T00:00:00.000Z" },
    relationships: { campaign: { data: { type: "campaign", id: campaignId } }, user: { data: { type: "user", id: userId } },
      currently_entitled_tiers: { data: [{ type: "tier", id: paid ? paidTierId : "free" }] } } });
  const state = { pages: [[member()]] as JsonApiResource[][], details: new Map<string, JsonApiResource | number>(),
    detailHook: undefined as undefined | ((id: string) => Promise<Response>), pageHook: undefined as undefined | ((page: number) => Promise<Response>) };
  state.details.set("member-one", member());
  const campaigns = { data: [{ type: "campaign", id: campaignId, attributes: { created_at: "2026-01-01T00:00:00.000Z", name: "PS10" },
    relationships: { tiers: { data: [{ type: "tier", id: paidTierId }, { type: "tier", id: "free" }] } } }], included: [
    { type: "tier", id: paidTierId, attributes: { title: "Paid", amount_cents: 500, created_at: "2026-01-01T00:00:00.000Z" } },
    { type: "tier", id: "free", attributes: { title: "Free", amount_cents: 0, created_at: "2026-01-01T00:00:00.000Z" } }] };
  const fetchImpl = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/oauth2/v2/campaigns") return Response.json(campaigns);
    if (url.pathname === `/api/oauth2/v2/campaigns/${campaignId}/members`) {
      const page = Number(url.searchParams.get("page[cursor]") ?? "0");
      if (state.pageHook) return state.pageHook(page);
      return Response.json({ data: state.pages[page] ?? [], ...(page + 1 < state.pages.length ? { meta: { pagination: { cursors: { next: String(page + 1) } } } } : {}) });
    }
    const id = decodeURIComponent(url.pathname.split("/").at(-1)!);
    if (url.pathname.startsWith("/api/oauth2/v2/members/")) {
      if (state.detailHook) return state.detailHook(id);
      const value = state.details.get(id) ?? 404;
      return typeof value === "number" ? new Response("{}", { status: value }) : Response.json({ data: value });
    }
    throw new Error(`Unexpected member request ${url.pathname}`);
  });
  const service = new PatreonSyncService({ getByCreatorId: async () => ({ access_token: "fixture" }) } as unknown as PatreonTokenStore,
    {} as PatreonCookieStore, {} as IngestService, {} as never, { ensureFreshAccessForAutomation: async () => {} } as unknown as PatreonAuthService,
    fetchImpl, undefined, identity);
  return { identity, creatorId, campaignId, member, state, fetchImpl, service, campaigns,
    sync: (max_pages = 20) => service.syncMembers(creatorId, { campaign_id: campaignId, max_pages }),
    refresh: (id = "member-one", deletion = false) => service.refreshMember(creatorId, "ps10", campaignId, id, deletion),
    context: { identity, creatorId, campaignId, paidTiers: new Set([`patreon_tier_${paidTierId}`]), fetch: { access_token: "fixture", fetch_impl: fetchImpl } } };
}
