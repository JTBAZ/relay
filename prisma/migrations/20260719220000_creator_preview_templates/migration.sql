-- Creator-owned Previewizer custom templates (overlay/settings JSON; max 3 in app).

CREATE TABLE "creator_preview_templates" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_preview_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "creator_preview_templates_creator_id_idx" ON "creator_preview_templates"("creator_id");

-- PostgREST lockdown: ENABLE RLS + no permissive policies.
-- Relay API Prisma uses a role that BYPASSES RLS.
ALTER TABLE public.creator_preview_templates ENABLE ROW LEVEL SECURITY;
