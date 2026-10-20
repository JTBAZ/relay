// Requires npm run build. Default is dry-run; --apply enables the explicit cutover.
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env"), quiet: true });

const args = process.argv.slice(2);
if ((args.length !== 2 && args.length !== 3) || args[0] !== "--source" || !args[1] ||
  (args.length === 3 && args[2] !== "--apply")) {
  console.error("Usage: node scripts/migrate-patreon-cookie-vault.mjs --source <encrypted-file> [--apply]");
  process.exitCode = 1;
} else {
  let prisma;
  try {
    ({ prisma } = await import("../dist/src/lib/db.js"));
    const { TokenEncryption } = await import("../dist/src/lib/crypto.js");
    const { migratePatreonCookieVault } = await import("../dist/src/auth/migrate-cookie-vault.js");
    const encryption = new TokenEncryption(process.env.RELAY_TOKEN_ENCRYPTION_KEY ?? "");
    const result = await migratePatreonCookieVault({ prisma, encryption, sourcePath: args[1], apply: args[2] === "--apply" });
    console.log(JSON.stringify(result));
  } catch {
    console.error("Patreon session migration failed. Keep the source and any backup; check the key, studio mappings, database migration, and stopped legacy writers before retrying.");
    process.exitCode = 1;
  } finally { await prisma?.$disconnect(); }
}
