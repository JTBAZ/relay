# Supabase RLS rollout plan (defer-friendly)

This document captures **when and how** to enable **Row Level Security** on Supabase-hosted tables so we can revisit it without redoing large amounts of application work.

## Defer or do now?

**Default recommendation: safe to defer** as a dedicated milestone.

- Relay’s **web** and **Discord bot** flows use the **Relay HTTP API** → **Prisma** with `DATABASE_URL`. They do **not** today depend on browser **PostgREST** reads of tables like `discord_channel_bindings`.
- Enabling RLS in Postgres **does not** automatically change Prisma behavior **if** the connection uses a role that **bypasses RLS** (Supabase **`service_role`**, or a superuser-style **`postgres`** direct connection — confirm in your project).
- Turning RLS on **without** validating that role — or while granting **broad PostgREST** access — can break **unexpected** clients (dashboard experiments, Edge Functions, future Supabase Realtime).

**Do it sooner** if:

- You are about to **expose** these tables (or views) via **Supabase Data API** to `anon` / `authenticated`, or
- Compliance / threat model requires **defense in depth now**, and you can spend **one focused session** on: policies, `GRANT`s, and smoke tests.

**Ripple assessment:** Low for the main Relay **Node** app **provided** `DATABASE_URL` bypasses RLS. **Higher** if you point Prisma at a pooler role that runs **as** `authenticated` with a user JWT (unusual; avoid for the API).

See also: [`operations-and-security.md`](operations-and-security.md) (pooler vs direct, `DATABASE_URL`).

---

## Pre-flight (do before any `ENABLE ROW LEVEL SECURITY`)

1. **Identify the database role** in production **`DATABASE_URL`** (user segment of the URI).
2. Confirm whether that role **bypasses RLS** (Supabase docs: `service_role`; direct `postgres` often does).
3. List **who else** touches the DB:
   - Supabase SQL Editor (operator)
   - PostgREST / supabase-js with `anon` or `authenticated`
   - Edge Functions, migration runners, BI tools
4. **Never** ship example policies with `USING (true)` / `WITH CHECK (true)` for sensitive tables — that exposes or mutates **all rows** to every matching role.

---

## Phase 1 — `discord_channel_bindings`

### Semantics

| Column | Meaning |
|--------|--------|
| `relay_creator_id` | **Unique** Relay studio id (`cr_…`) for this binding. |
| `discord_guild_id`, `discord_channel_id` | Watched Discord locations. |
| `linked_by_account_id` | Optional FK → `accounts.id` (who linked). |

There is **no** `auth.uid()` column on the table. Tenant linkage for Supabase Auth is via **`accounts.supabase_user_id`** (see `docs/architecture/multi-tenant-option-b.md`).

### Goals

- **PostgREST / anon:** no access unless product explicitly requires public reads (it does not).
- **authenticated (direct SQL):** only rows for the **same person** as `auth.uid()`, resolved through `accounts`.

### Policy sketch (adjust after testing)

Use real conditions; replace placeholders with your naming.

```sql
ALTER TABLE public.discord_channel_bindings ENABLE ROW LEVEL SECURITY;

-- Example: SELECT for logged-in users who own the studio row.
-- Requires accounts.primary_relay_creator_id populated and aligned with relay_creator_id.
CREATE POLICY "discord_channel_bindings_select_own"
ON public.discord_channel_bindings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.supabase_user_id = auth.uid()
      AND a.primary_relay_creator_id = discord_channel_bindings.relay_creator_id
  )
);

-- Writes: usually omit for tables only mutated by Relay API (Prisma + bypass role).
-- If you add INSERT/UPDATE/DELETE for PostgREST, mirror the same ownership checks
-- in WITH CHECK / USING.
```

**GRANTs:** Grant only what you need. Avoid `GRANT … TO anon` unless the data is intentionally public.

### Application validation

- Relay: Discord **bind** + **ingest** routes still succeed (`tests/relay-discord-creator-api.test.ts`, manual link flow).
- Optionally: verify Prisma from staging with the **same** `DATABASE_URL` you use in prod.

---

## Phase 2 — related tables (batch when you enable RLS)

When you turn RLS on for one internal table, review neighbors so you do not leave **holes** or **surprises**:

| Table | Notes |
|-------|--------|
| `discord_link_tokens` | Short-lived codes; **highly sensitive**; default **no** client access. |
| `discord_media_ingest_keys` | Internal mapping; server/bot only. |
| `media_storage_purge_queue` | Internal sweeper; **no** `anon`/`authenticated` access. |
| Other Prisma models | Any table you `GRANT` to `authenticated` PostgREST needs an explicit policy story. |

Tier-1 / paywall tables may already have RLS patterns in project migrations (e.g. `prisma/migrations/*rls*`); align new policies with those docs (`docs/architecture/rls-context-usage.md`, guardrail prompts under `docs/Airtable Drops/`).

---

## Operational checklist (at rollout time)

- [ ] `ENABLE ROW LEVEL SECURITY` on chosen tables  
- [ ] Policies for `authenticated` (and `anon` only if required)  
- [ ] `GRANT` minimal privileges; document in runbook  
- [ ] Test as **anon**, **authenticated**, and **service_role** (expect bypass for service_role)  
- [ ] Monitor Relay logs and Discord ingest errors after deploy  
- [ ] Record **which role** Prisma uses in prod in the same place as `DATABASE_URL` rotation procedure  

---

## Summary

- **Planning doc only:** no requirement to enable RLS in this repo’s Prisma migrations unless you want policies **versioned** here (optional; many teams apply RLS via Supabase SQL + migration snapshots).  
- **Low downstream rework** for the Node app **if** the API database user bypasses RLS.  
- **Revisit** this doc when: enabling PostgREST for app tables, tightening Supabase security audit, or onboarding a client that queries Postgres directly.
