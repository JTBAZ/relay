-- Autopost draft checkpoint fields (multi-draft + nudged slots + composer resume).
ALTER TABLE "autopost_drafts" ADD COLUMN IF NOT EXISTS "intent" TEXT;
ALTER TABLE "autopost_drafts" ADD COLUMN IF NOT EXISTS "performance_goal_id" TEXT;
ALTER TABLE "autopost_drafts" ADD COLUMN IF NOT EXISTS "composer_step" TEXT NOT NULL DEFAULT 'pick-media';
ALTER TABLE "autopost_drafts" ADD COLUMN IF NOT EXISTS "workspace" JSONB NOT NULL DEFAULT '{}';
