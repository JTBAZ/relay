-- T-1.3 — how media was first ingested (Patreon sync vs future Relay direct upload). Default matches historical Patreon path.
CREATE TYPE "MediaIngestOrigin" AS ENUM ('PATREON', 'RELAY_UPLOAD');

ALTER TABLE "media_assets" ADD COLUMN "ingest_origin" "MediaIngestOrigin" NOT NULL DEFAULT 'PATREON';
