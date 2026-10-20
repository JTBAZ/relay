BEGIN;
-- CreateTable
CREATE TABLE "creator_posting_rhythm_windows" (
    "id" TEXT NOT NULL,
    "rhythm_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "eligible_from" TIMESTAMP(3) NOT NULL,
    "eligible_to" TIMESTAMP(3),
    "always_on" BOOLEAN NOT NULL,
    "next_match" BOOLEAN NOT NULL DEFAULT false,
    "cursor" JSONB,

    CONSTRAINT "creator_posting_rhythm_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_posting_rhythm_windows_rhythm_id_eligible_from_idx" ON "creator_posting_rhythm_windows"("rhythm_id", "eligible_from");

-- CreateIndex
CREATE INDEX "post_versions_ingested_at_id_idx" ON "post_versions"("ingested_at", "id");

-- AddForeignKey
ALTER TABLE "creator_posting_rhythm_windows" ADD CONSTRAINT "creator_posting_rhythm_windows_rhythm_id_fkey" FOREIGN KEY ("rhythm_id") REFERENCES "creator_posting_rhythms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "creator_posting_rhythm_windows" ENABLE ROW LEVEL SECURITY;
INSERT INTO "creator_posting_rhythm_windows" ("id","rhythm_id","version","config","eligible_from","always_on","next_match","cursor")
SELECT 'rhythm_window_' || md5("id" || ':' || "version"::text), "id", "version", "config", "eligible_from", "always_on" AND "status"='active', "armed" AND "status"='active', "cursor"
FROM "creator_posting_rhythms";

COMMIT;
