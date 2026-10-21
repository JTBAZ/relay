import { FileIdentityStore } from "../../src/identity/identity-store.js";
import { IdentityService } from "../../src/identity/identity-service.js";
try {
  const input = JSON.parse(process.env.RELAY_MEMBER_FILE_TEST_INPUT ?? "") as { path: string; prefix: string };
  const store = new FileIdentityStore(input.path), identity = new IdentityService(store);
  for (let index = 0; index < 10; index++) {
    const id = `${input.prefix}-${index}`;
    const user = await identity.registerPatreonFallback("file-fixture", id, "", ["patreon_tier_paid"]);
    await store.createSession({ token: id, user_id: user.user_id, creator_id: user.creator_id, tier_ids: user.tier_ids, expires_at: "2099-01-01T00:00:00.000Z" });
  }
  process.stdout.write("done");
} catch { process.exitCode = 1; }
