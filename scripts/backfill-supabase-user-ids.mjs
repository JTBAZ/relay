/**
 * MIG-12 — Link existing `Account` rows to Supabase Auth (`auth.users.id`) by normalized email.
 *
 * Requires: `npm run build`; repo root `.env` with DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   node scripts/backfill-supabase-user-ids.mjs
 *   node scripts/backfill-supabase-user-ids.mjs --dry-run
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const dryRun = process.argv.includes("--dry-run");

const { prisma } = await import("../dist/src/lib/db.js");
const { createSupabaseAdminClient } = await import("../dist/src/lib/supabase-admin.js");
const { backfillAccountSupabaseUserIds } = await import(
  "../dist/src/identity/backfill-supabase-user-ids.js"
);

const supabase = createSupabaseAdminClient();
const result = await backfillAccountSupabaseUserIds({ prisma, supabase, dryRun });

// eslint-disable-next-line no-console -- CLI output
console.log(
  JSON.stringify(
    {
      dryRun,
      ...result
    },
    null,
    2
  )
);

await prisma.$disconnect();
