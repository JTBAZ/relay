import { describe, expect, it, vi } from "vitest";
import { IdentityService } from "../src/identity/identity-service.js";
import type { UserAccount } from "../src/identity/types.js";

describe("MT-033 IdentityService relay session bridge", () => {
  it("supportsRelaySessionBridge is false without ensurePlatformPatronUserForAccount", () => {
    const svc = new IdentityService({
      getSession: vi.fn(),
      createSession: vi.fn()
    } as never);
    expect(svc.supportsRelaySessionBridge()).toBe(false);
  });

  it("issueRelaySessionForAccount issues opaque session via store hook", async () => {
    const user: UserAccount = {
      user_id: "tm_test",
      creator_id: "__relay_platform",
      email: "u@example.com",
      password_hash: "",
      auth_provider: "independent",
      tier_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const createSession = vi.fn().mockResolvedValue(undefined);
    const store = {
      ensurePlatformPatronUserForAccount: vi.fn().mockResolvedValue(user),
      createSession
    };
    const svc = new IdentityService(store as never);
    expect(svc.supportsRelaySessionBridge()).toBe(true);

    const session = await svc.issueRelaySessionForAccount("acc_1");
    expect(session.user_id).toBe("tm_test");
    expect(session.creator_id).toBe("__relay_platform");
    expect(session.token).toMatch(/^sess_/);
    expect(store.ensurePlatformPatronUserForAccount).toHaveBeenCalledWith("acc_1");
    expect(createSession).toHaveBeenCalled();
  });
});
