-- Performance intelligence Phase 5 — dismissed bundle suggestion tracking.

CREATE TABLE "creative_work_bundle_suggestion_dismissals" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "source_post_id" TEXT NOT NULL,
    "target_creative_work_id" TEXT NOT NULL,
    "dismissed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_work_bundle_suggestion_dismissals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "creative_work_bundle_suggestion_dismissals_creator_id_source_post_id_target_creative_work_id_key"
ON "creative_work_bundle_suggestion_dismissals"("creator_id", "source_post_id", "target_creative_work_id");

CREATE INDEX "creative_work_bundle_suggestion_dismissals_creator_id_dismissed_at_idx"
ON "creative_work_bundle_suggestion_dismissals"("creator_id", "dismissed_at" DESC);

ALTER TABLE "creative_work_bundle_suggestion_dismissals"
ADD CONSTRAINT "creative_work_bundle_suggestion_dismissals_target_creative_work_id_fkey"
FOREIGN KEY ("target_creative_work_id") REFERENCES "creative_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;
