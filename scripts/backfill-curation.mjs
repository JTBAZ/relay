/**
 * Runs gallery overrides, collections, saved filters, and page layout backfills in order.
 * Collections uses canonical.json for post_id validation (same defaults as single scripts).
 */
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const { prisma } = await import("../dist/src/lib/db.js");
const { backfillGalleryOverridesFromFile } = await import(
  "../dist/src/gallery/backfill-overrides-from-file.js"
);
const { backfillCollectionsFromFile } = await import(
  "../dist/src/gallery/backfill-collections-from-file.js"
);
const { backfillSavedFiltersFromFile } = await import(
  "../dist/src/gallery/backfill-saved-filters-from-file.js"
);
const { backfillPageLayoutFromFile } = await import("../dist/src/gallery/backfill-layout-from-file.js");

const overridesPath =
  process.env.RELAY_GALLERY_POST_OVERRIDES_PATH?.trim() ||
  join(root, ".relay-data", "gallery_post_overrides.json");
const collectionsPath =
  process.env.RELAY_COLLECTIONS_STORE_PATH?.trim() || join(root, ".relay-data", "collections.json");
const canonicalPath =
  process.env.RELAY_INGEST_CANONICAL_PATH?.trim() || join(root, ".relay-data", "canonical.json");
const filtersPath =
  process.env.RELAY_GALLERY_SAVED_FILTERS_PATH?.trim() ||
  join(root, ".relay-data", "gallery_saved_filters.json");
const layoutPath =
  process.env.RELAY_PAGE_LAYOUT_STORE_PATH?.trim() || join(root, ".relay-data", "page_layout.json");

const o = await backfillGalleryOverridesFromFile({ prisma, filePath: overridesPath });
// eslint-disable-next-line no-console -- CLI output
console.log(`[1/4] overrides: creators=${o.creatorCount} row_hint≈${o.postOverrideRowsHint}`);

const c = await backfillCollectionsFromFile({
  prisma,
  collectionsPath,
  canonicalPath
});
// eslint-disable-next-line no-console -- CLI output
console.log(
  `[2/4] collections: written=${c.collectionsWritten} links=${c.postLinksWritten} dropped=${c.postIdsDropped}`
);

const f = await backfillSavedFiltersFromFile({ prisma, filePath: filtersPath });
// eslint-disable-next-line no-console -- CLI output
console.log(`[3/4] saved_filters: ${f.filterCount}`);

const l = await backfillPageLayoutFromFile({ prisma, filePath: layoutPath });
// eslint-disable-next-line no-console -- CLI output
console.log(`[4/4] page_layout: ${l.layoutCount}`);

await prisma.$disconnect();
