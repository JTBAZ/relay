-- PE-D / D29 + D11: cross-creator favorites + collections live re-check + public collections.
-- Additive only — no rename, no drop.
--
-- snapshot_tier_ids: forensic record of which tier ids the patron was entitled to AT save time.
-- Access decisions at render time use a LIVE re-check against the viewer's current
-- PatronEntitlementSnapshot — never consult these columns for gate decisions (D29).
--
-- is_public: marks a saved collection as visible on the patron's public profile (D11).

ALTER TABLE "patron_favorites"
  ADD COLUMN "snapshot_tier_ids" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

ALTER TABLE "patron_saved_collections"
  ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "patron_saved_collection_entries"
  ADD COLUMN "snapshot_tier_ids" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
