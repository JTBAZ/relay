-- PostgREST lockdown for creator-scoped tables created after the bulk RLS pass.
-- Pattern: ENABLE RLS + no permissive policies = deny Data API / anon / authenticated.
-- Relay API Prisma uses a role that BYPASSES RLS (see 20260415000000_rls_lockdown_prisma_tables).

ALTER TABLE public.creator_studio_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autopost_drafts ENABLE ROW LEVEL SECURITY;
