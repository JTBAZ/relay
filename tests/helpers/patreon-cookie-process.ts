// Disposable-test child process. Never prints credentials or database errors.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { FilePatreonCookieStore } from "../../src/auth/cookie-store.js";
import { DbPatreonCookieStore } from "../../src/auth/cookie-store-db.js";
import { TokenEncryption } from "../../src/lib/crypto.js";

let db: PrismaClient | undefined;
try {
  const input = JSON.parse(process.env.RELAY_COOKIE_TEST_INPUT ?? "") as { key: string; path?: string; url?: string; ids: string[] };
  const encryption = new TokenEncryption(input.key);
  if (input.url) {
    const url = new URL(input.url);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" || url.search ||
      !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(url.pathname)) throw new Error();
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: input.url }) });
  }
  const store = db ? new DbPatreonCookieStore(db, encryption) : new FilePatreonCookieStore(input.path!, encryption);
  for (const id of input.ids) await store.upsert(id, `fixture-${id}`);
  process.stdout.write("done");
} catch { process.stderr.write("Cookie test child failed"); process.exitCode = 1; }
finally { await db?.$disconnect(); }
