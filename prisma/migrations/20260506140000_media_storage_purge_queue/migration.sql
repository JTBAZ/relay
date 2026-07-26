-- CreateTable
CREATE TABLE "media_storage_purge_queue" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "former_media_id" TEXT,
    "reason" TEXT NOT NULL,
    "eligible_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "media_storage_purge_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_storage_purge_queue_eligible_at_idx" ON "media_storage_purge_queue"("eligible_at");

-- CreateIndex
CREATE INDEX "media_storage_purge_queue_created_at_idx" ON "media_storage_purge_queue"("created_at");
