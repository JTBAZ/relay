import { expect, vi } from "vitest";
import { PatreonAuthService } from "../../src/auth/auth-service.js";
import { PatreonClient } from "../../src/auth/patreon-client.js";
import type { PatreonTokenStore } from "../../src/auth/token-store.js";
import { InMemoryEventBus } from "../../src/events/event-bus.js";

export const expiredCredential = (creator_id = "c") => ({ creator_id, access_token: "old-access", refresh_token: "old-refresh", access_token_expires_at: "2000-01-01T00:00:00.000Z", provider_user_id: `${creator_id}-fixture-user`, credential_health_status: "healthy" as const });

export async function proveSharedRotation(first: PatreonTokenStore, second: PatreonTokenStore, creatorId = "c") {
  await first.upsert(expiredCredential(creatorId));
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const fake = vi.fn<typeof fetch>(async (_input, init) => {
    expect(new URLSearchParams(String(init!.body)).get("refresh_token")).toBe("old-refresh");
    entered(); await gate;
    return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });
  });
  const bus = new InMemoryEventBus();
  const client = () => new PatreonClient({ client_id: "fixture", client_secret: "fixture", token_url: "https://www.patreon.com/api/oauth2/token", fetch_impl: fake });
  const a = new PatreonAuthService(client(), first, bus);
  const b = new PatreonAuthService(client(), second, bus);
  let attempted!: () => void;
  const secondAttempted = new Promise<void>((resolve) => { attempted = resolve; });
  const update = second.updateForCreator.bind(second);
  const spy = vi.spyOn(second, "updateForCreator").mockImplementation((id, fn) => { attempted(); return update(id, fn); });
  const one = a.ensureFreshAccessForAutomation(creatorId, "api");
  await started;
  const two = b.ensureFreshAccessForAutomation(creatorId, "worker");
  await secondAttempted;
  release();
  await Promise.all([one, two]);
  spy.mockRestore();
  expect(fake).toHaveBeenCalledTimes(1);
  expect(await second.getByCreatorId(creatorId)).toMatchObject({ access_token: "new-access", refresh_token: "new-refresh", provider_user_id: `${creatorId}-fixture-user`, credential_health_status: "healthy" });
  expect(bus.getAll().filter((e) => e.event_name === "patreon_token_refreshed")).toHaveLength(1);
}

