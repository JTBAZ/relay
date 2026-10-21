// Private loopback HTTP fixture. Never contacts a provider or loads application dotenv.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { join } from "node:path";
import { createApp } from "../../src/server.js";

let prisma: PrismaClient | undefined;
try {
  const input = JSON.parse(process.env.PS13_CONSENT_INPUT ?? "") as { url: string; key: string; root: string; secret: string };
  const target = new URL(input.url);
  if (target.hostname !== "127.0.0.1" || target.port !== "49952" || target.search || !/^\/relay_ingest_test_[a-f0-9]{32}$/.test(target.pathname)) throw new Error();
  process.env.RELAY_EXTENSION_CONSENT_SECRET = input.secret;
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: input.url }) });
  await prisma.$connect();
  const { app } = createApp({ prisma, relay_db_store_identity: true, relay_db_store_patreon_cookie: true,
    relay_token_encryption_key: input.key, patreon_client_id: "fixture", patreon_client_secret: "fixture",
    credential_store_path: join(input.root, "tokens.json"), cookie_store_path: join(input.root, "cookies.json"),
    identity_store_path: join(input.root, "identity.json"), ingest_canonical_path: join(input.root, "canonical.json"),
    export_storage_root: join(input.root, "exports") });
  const server = app.listen(0, "127.0.0.1", () => {
    const address = server.address(); if (address && typeof address !== "string") process.send?.({ port: address.port });
  });
  process.on("message", () => { server.close(() => { void prisma!.$disconnect().then(() => process.exit(0)); }); });
  process.on("disconnect", () => { server.close(() => { void prisma!.$disconnect().then(() => process.exit(0)); }); });
} catch { process.send?.({ error: "Private consent fixture failed" }); await prisma?.$disconnect(); process.exitCode = 1; }
