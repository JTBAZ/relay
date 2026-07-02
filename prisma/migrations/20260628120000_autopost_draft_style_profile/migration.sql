-- Autopost WI-2 / WI-3 — creator style profiles + autopost drafts + media reservation.

-- CreateTable
CREATE TABLE "creator_style_profiles" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Default',
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "tone_preset" TEXT NOT NULL DEFAULT 'friendly',
    "user_prompt" TEXT,
    "voice_script" TEXT NOT NULL DEFAULT '',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_style_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autopost_drafts" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'drafting',
    "media_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT,
    "body_text" TEXT,
    "style_profile_id" TEXT,
    "enhancements" JSONB NOT NULL DEFAULT '{}',
    "distribution_log" JSONB NOT NULL DEFAULT '{}',
    "published_post_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "autopost_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_style_profiles_creator_id_label_key"
ON "creator_style_profiles"("creator_id", "label");

-- CreateIndex
CREATE INDEX "creator_style_profiles_creator_id_is_default_idx"
ON "creator_style_profiles"("creator_id", "is_default");

-- CreateIndex
CREATE INDEX "autopost_drafts_creator_id_status_idx"
ON "autopost_drafts"("creator_id", "status");

-- AddForeignKey
ALTER TABLE "autopost_drafts"
ADD CONSTRAINT "autopost_drafts_style_profile_id_fkey"
FOREIGN KEY ("style_profile_id") REFERENCES "creator_style_profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Media reservation column
ALTER TABLE "media_assets" ADD COLUMN "autopost_draft_id" TEXT;

-- CreateIndex
CREATE INDEX "media_assets_autopost_draft_id_idx"
ON "media_assets"("autopost_draft_id");

-- AddForeignKey
ALTER TABLE "media_assets"
ADD CONSTRAINT "media_assets_autopost_draft_id_fkey"
FOREIGN KEY ("autopost_draft_id") REFERENCES "autopost_drafts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
