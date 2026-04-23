/**
 * One-off: compare canonical media URLs for posts (blur investigation).
 * Run: node scripts/investigate-blur-media.mjs
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const sql = `
WITH latest AS (
  SELECT DISTINCT ON (pv.post_id)
    pv.post_id,
    pv.title,
    pv.media_ids,
    pv.published_at,
    p.creator_id,
    p.is_public
  FROM post_versions pv
  INNER JOIN posts p ON p.id = pv.post_id
  WHERE pv.title IN ('All Patrons', 'test 2', 'test', 'Advanced Post', 'Flower Fields')
  ORDER BY pv.post_id, pv.version_seq DESC
)
SELECT
  l.title,
  l.post_id,
  l.creator_id,
  l.is_public,
  l.published_at,
  ma.id AS media_id,
  ma.current_role,
  ma.current_mime_type,
  ma.current_storage_key IS NOT NULL AS has_storage_key,
  ma.current_upstream_revision,
  LEFT(ma.current_upstream_url, 160) AS upstream_url_prefix,
  LENGTH(ma.current_upstream_url) AS upstream_url_len,
  CASE WHEN ma.id LIKE '%_cover' THEN true ELSE false END AS is_cover_row
FROM latest l
CROSS JOIN LATERAL unnest(l.media_ids) AS mid(media_id)
INNER JOIN media_assets ma ON ma.id = mid.media_id
ORDER BY l.published_at DESC, l.title,
  CASE WHEN ma.id LIKE '%_cover' THEN 0 ELSE 1 END,
  ma.id;
`;

const mediaOrderSql = `
WITH latest AS (
  SELECT DISTINCT ON (pv.post_id)
    pv.post_id,
    pv.title,
    pv.media_ids,
    p.creator_id
  FROM post_versions pv
  INNER JOIN posts p ON p.id = pv.post_id
  WHERE pv.title IN ('All Patrons', 'test 2', 'test')
  ORDER BY pv.post_id, pv.version_seq DESC
)
SELECT post_id, title, media_ids
FROM latest
ORDER BY title;
`;

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    console.log("=== media_ids order (defines Library tile order for all_media) ===\n");
    const orderRows = await client.query(mediaOrderSql);
    console.log(JSON.stringify(orderRows.rows, null, 2));

    console.log("\n=== per-media rows ===\n");
    const { rows } = await client.query(sql);
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
