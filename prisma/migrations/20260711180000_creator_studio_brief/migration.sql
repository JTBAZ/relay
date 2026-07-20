-- Durable creator-scoped studio brief for Insights Action Hub / Coach / Autopost.
CREATE TABLE IF NOT EXISTS "creator_studio_briefs" (
    "creator_id" TEXT NOT NULL,
    "goals" JSONB NOT NULL DEFAULT '[]',
    "user_notes" TEXT,
    "locale" TEXT,
    "trend_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_studio_briefs_pkey" PRIMARY KEY ("creator_id")
);
