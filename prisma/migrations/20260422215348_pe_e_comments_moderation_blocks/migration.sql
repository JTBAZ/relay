-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('everyone', 'patrons_only');

-- CreateEnum
CREATE TYPE "ContentReportTargetKind" AS ENUM ('comment', 'post', 'account');

-- CreateEnum
CREATE TYPE "ContentReportStatus" AS ENUM ('open', 'dismissed', 'actioned');

-- CreateEnum
CREATE TYPE "ModerationActorKind" AS ENUM ('creator', 'admin', 'system_auto_mod', 'patron_self');

-- CreateEnum
CREATE TYPE "ModerationTargetKind" AS ENUM ('comment', 'post', 'account');

-- CreateEnum
CREATE TYPE "ModerationActionKind" AS ENUM ('comment_hide', 'comment_unhide', 'comment_remove', 'comment_restore', 'comment_pin', 'comment_unpin', 'comment_tag_revoke', 'comment_tag_unrevoke', 'account_block', 'account_unblock', 'report_dismiss', 'report_action', 'auto_mod_flag');

-- CreateEnum
CREATE TYPE "CommentReactionKind" AS ENUM ('like', 'heart', 'insightful', 'laugh');

-- AlterTable
ALTER TABLE "relay_comments" ADD COLUMN     "anchor_x" DECIMAL(5,2),
ADD COLUMN     "anchor_y" DECIMAL(5,2),
ADD COLUMN     "auto_mod_flags_json" JSONB,
ADD COLUMN     "creator_pinned_at" TIMESTAMP(3),
ADD COLUMN     "edited_at" TIMESTAMP(3),
ADD COLUMN     "media_id" TEXT,
ADD COLUMN     "parent_comment_id" TEXT,
ADD COLUMN     "required_tier_id" TEXT,
ADD COLUMN     "tag_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tags_revoked_by_owner" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "visibility" "CommentVisibility" NOT NULL DEFAULT 'everyone';

-- CreateTable
CREATE TABLE "comment_reactions" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "kind" "CommentReactionKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" TEXT NOT NULL,
    "reporter_account_id" TEXT NOT NULL,
    "relay_creator_id" TEXT NOT NULL DEFAULT '',
    "target_kind" "ContentReportTargetKind" NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "body" TEXT,
    "status" "ContentReportStatus" NOT NULL DEFAULT 'open',
    "resolved_by_account_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "relay_creator_id" TEXT NOT NULL DEFAULT '',
    "actor_kind" "ModerationActorKind" NOT NULL,
    "actor_account_id" TEXT,
    "kind" "ModerationActionKind" NOT NULL,
    "target_kind" "ModerationTargetKind" NOT NULL,
    "target_id" TEXT NOT NULL,
    "payload_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_blocks" (
    "id" TEXT NOT NULL,
    "blocker_account_id" TEXT NOT NULL,
    "blocked_account_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comment_reactions_comment_id_idx" ON "comment_reactions"("comment_id");

-- CreateIndex
CREATE INDEX "comment_reactions_account_id_idx" ON "comment_reactions"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "comment_reactions_comment_id_account_id_kind_key" ON "comment_reactions"("comment_id", "account_id", "kind");

-- CreateIndex
CREATE INDEX "content_reports_relay_creator_id_status_created_at_idx" ON "content_reports"("relay_creator_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "content_reports_target_kind_target_id_idx" ON "content_reports"("target_kind", "target_id");

-- CreateIndex
CREATE INDEX "content_reports_reporter_account_id_idx" ON "content_reports"("reporter_account_id");

-- CreateIndex
CREATE INDEX "moderation_actions_relay_creator_id_created_at_idx" ON "moderation_actions"("relay_creator_id", "created_at");

-- CreateIndex
CREATE INDEX "moderation_actions_target_kind_target_id_idx" ON "moderation_actions"("target_kind", "target_id");

-- CreateIndex
CREATE INDEX "moderation_actions_actor_account_id_idx" ON "moderation_actions"("actor_account_id");

-- CreateIndex
CREATE INDEX "account_blocks_blocker_account_id_idx" ON "account_blocks"("blocker_account_id");

-- CreateIndex
CREATE INDEX "account_blocks_blocked_account_id_idx" ON "account_blocks"("blocked_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_blocks_blocker_account_id_blocked_account_id_key" ON "account_blocks"("blocker_account_id", "blocked_account_id");

-- CreateIndex
CREATE INDEX "relay_comments_relay_creator_id_post_id_media_id_idx" ON "relay_comments"("relay_creator_id", "post_id", "media_id");

-- CreateIndex
CREATE INDEX "relay_comments_parent_comment_id_idx" ON "relay_comments"("parent_comment_id");

-- AddForeignKey
ALTER TABLE "relay_comments" ADD CONSTRAINT "relay_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "relay_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "relay_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
