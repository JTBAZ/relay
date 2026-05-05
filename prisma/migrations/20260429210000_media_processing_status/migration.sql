-- BO-RPB-07 — API-visible Relay upload pipeline state (`MediaProcessingStatus`).
CREATE TYPE "MediaProcessingStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'READY', 'FAILED');

ALTER TABLE "media_assets"
ADD COLUMN "processing_status" "MediaProcessingStatus" NOT NULL DEFAULT 'READY';

ALTER TABLE "media_assets"
ADD COLUMN "processing_error" TEXT;
