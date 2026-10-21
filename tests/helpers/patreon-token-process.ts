// Disposable-test child. Logs only a rotation count, never credentials or database errors.
import { appendFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DbPatreonTokenStore } from "../../src/auth/token-store-db.js";
import { FilePatreonTokenStore } from "../../src/auth/token-store.js";
import { PatreonAuthService } from "../../src/auth/auth-service.js";
import { PatreonClient } from "../../src/auth/patreon-client.js";
import { TokenEncryption } from "../../src/lib/crypto.js";
import { InMemoryEventBus } from "../../src/events/event-bus.js";

let db: PrismaClient | undefined;
try {
  const input = JSON.parse(process.env.RELAY_TOKEN_TEST_INPUT ?? "") as { key: string; path?: string; url?: string; creatorId: string; log: string };
  if (input.url) {
    const url = new URL(input.url);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" || url.search || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error();
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: input.url }) });
  }
  const encryption = new TokenEncryption(input.key);
  const store = db ? new DbPatreonTokenStore(db, encryption) : new FilePatreonTokenStore(input.path!, encryption);
  const client = new PatreonClient({ client_id: "fixture", client_secret: "fixture", token_url: "https://www.patreon.com/api/oauth2/token", fetch_impl: async (_url, init) => {
    if (new URLSearchParams(String(init?.body)).get("refresh_token") !== "old-refresh") throw new Error();
    await appendFile(input.log, "rotated\n");
    await new Promise((resolve) => setTimeout(resolve, 300));
    return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });
  } });
  await new PatreonAuthService(client, store, new InMemoryEventBus()).ensureFreshAccessForAutomation(input.creatorId, "child");
  if ((await store.getByCreatorId(input.creatorId))?.access_token !== "new-access") throw new Error();
  process.stdout.write("done");
} catch { process.stderr.write("Token test child failed"); process.exitCode = 1; }
finally { await db?.$disconnect(); }
