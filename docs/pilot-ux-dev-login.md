# Pilot UX dev login (PUX-001+)

Deterministic faux accounts for local UX gates — **no Patreon OAuth or Supabase required** for the seeded personas.

## Architecture

Permission decisions use a **three-layer model** (see [`docs/architecture/adr/004-pilot-three-layer-permissions.md`](architecture/adr/004-pilot-three-layer-permissions.md)):

- **Layer A** — post tier gate from ingest / audience-access PATCH (`PostVersion.tierIds`)
- **Layer B** — patron entitlement snapshot (`PatronEntitlementSnapshot.entitledTierIds`)
- **Layer C** — Relay presentation only (`PostOverride`: visibility, tags, discovery — **no tier ids**)

Hidden visibility (Layer C) can exclude a tier-entitled patron from feed and detail; it cannot widen paywall access.

## Prerequisites

- Postgres with `DATABASE_URL` in repo-root `.env`
- `RELAY_DB_STORE_IDENTITY=1` and `RELAY_DB_STORE_CANONICAL=1` (required — see [`pilot-db-cutover.md`](pilot-db-cutover.md))
- Seed once (idempotent):

```bash
npm run seed:pilot-ux
```

## Sign in

1. Start API + web (`npm run dev:stack` or separate terminals).
2. Open **`/login/pilot-ux`** in the Next app (e.g. `http://localhost:3000/login/pilot-ux`).
3. Use the default dev password from `tests/fixtures/pilot-ux-seed.json` (`pilot-ux-dev-only`) unless you set `RELAY_PILOT_UX_DEV_PASSWORD`.

| Account | Email | Opens |
| --- | --- | --- |
| Dev Ava (creator) | `creator_dev_ava@pilot.relay.test` | Library (`/`) — 3 posts, read-only tier chips from **`Tier.title`** |
| Dev Milo (creator) | `creator_dev_milo@pilot.relay.test` | Library (`/`) — 3 posts, read-only tier chips from **`Tier.title`** |
| Dev Onboarding (creator) | `creator_dev_onboarding@pilot.relay.test` | Repeatable sign-up walkthrough — resets to `/onboarding?path=creator&step=2` |
| Dev Riley (patron) | `patron_dev_riley@pilot.relay.test` | Patron feed — follows both creators |

Password login uses `POST /api/v1/auth/login` (independent `Account` rows from the seed). Cross-origin dev may require the dual-write Bearer on the login bootstrap hops (`web/lib/pilot-ux-password-login.ts`).

## Verification

```bash
npm run build
npx vitest run tests/pilot-permission-architecture.test.ts
npx vitest run tests/pilot-ux-permission-parity.test.ts
npx vitest run tests/patron/assemble-patron-feed.test.ts tests/pilot-contract-bundle.test.ts
```

- **Gate A (PUX-001):** creator gallery APIs return three posts with tier facets; patron `/api/v1/patron/follows` and `/api/v1/patron/feed` include both faux creators.
- **Gate B (PUX-002):** patron-visible post count diverges from creator libraries where paywalls apply.
- **Gate C (PUX-003):** paywall mutations propagate to patron feed without changing creator libraries.
- **Gate D (PUX-004):** aggregated patron feed walkthrough (below).
- **Gate E (PUX-005):** creator library walkthrough for Dev Ava + Dev Milo (below).
- **Gate F (PUX-006):** creator-hidden posts excluded from patron feed and direct URLs (below).
- **Gate G (PILOT-013):** manual import optional (below).
- **Gate H (PILOT-014):** Relay-native posts optional (below).
- **Gate I (PILOT-015):** Analytics Action Center MVP (below).
- **Gate J (PILOT-016):** Security tenant isolation (below).
- **Gate K (PILOT-017):** Pilot exit checklist (below).

## Gate D — patron feed walkthrough (PUX-004)

Sign in as **Dev Riley** → `/patron/feed` (live API, not mock fixtures).

### Sidebar

- **Following** lists **Dev Ava** and **Dev Milo** (two green “on Relay” dots).
- Tier chips on each row reflect seeded entitlements (Supporter for Ava, Supporter for Milo’s backstage tier).

### Feed cards (expect five posts, newest first)

| Post | Creator | Card badge | Tier chip | In feed? |
| --- | --- | --- | --- | --- |
| Public intro | Ava | Subscribed | Free | Yes |
| Supporter photo set | Ava | Subscribed | Supporter | Yes |
| Studio archive | Ava | — | — | **No** (locked — Riley lacks Studio) |
| Public sketch | Milo | Subscribed | Free | Yes |
| Supporter video | Milo | Subscribed | Supporter | Yes (Backstage tier satisfies lower Supporter gate) |
| Backstage notes | Milo | Subscribed | Supporter | Yes |

- **Subscribed** badge on every visible card (public posts from followed creators are not labeled “Discover”).
- No misleading **“Free to read / Creators you don’t follow yet”** divider above the first card when all posts are from followed creators.

### Post detail

- Click any visible card → `/patron/feed/post/{creatorId}/{postId}` opens the gallery view with tier strip.
- Direct URL to a locked post (e.g. Ava Studio archive) is **absent from the feed**; `GET /api/v1/patron/permission/post` returns `locked_preview` or `deny` (no full access).

### Degraded / empty copy

- With healthy seed entitlements, **no** amber “Reconnect Patreon” stale banner.
- Toggle filter chips (e.g. **Photos only**) — empty filter shows honest “No posts match this filter” with **Show all posts**.

## Gate E — creator library walkthrough (PUX-005)

Sign in as each faux **creator** → Library (`/`). Repeat for **Dev Ava** and **Dev Milo**.

### Grid (all posts visible)

- **Three posts** in the main grid for each creator (seeded library, not patron-filtered).
- Each tile shows an **access chip**: **Free** when no tier gate, otherwise the Patreon tier title (**Supporter**, **Studio**, **Backstage**).
- **Visibility dot** on tiles: green = visible, gray = hidden, amber = Mature (18+).

| Creator | Post | Access chip | Patreon tier truth |
| --- | --- | --- | --- |
| Dev Ava | Public intro | Free | Public |
| Dev Ava | Supporter photo set | Supporter | Supporter tier |
| Dev Ava | Studio archive | Studio | Studio tier |
| Dev Milo | Public sketch | Free | Public |
| Dev Milo | Supporter video | Supporter | Supporter tier |
| Dev Milo | Backstage notes | Supporter (chip) / Backstage in inspect | Backstage tier |

### Sidebar filters

- **Access** tier chips list seeded tiers (Supporter, Studio / Backstage) plus **Free public** when applicable.
- **Visibility** toggles (Hidden / Mature) filter Relay presentation only — they do not change Patreon tier access.

### BulkActionBar + PostBatchPostDetails (select one post)

- **Relay visibility** panel copy states gallery-only changes — **not** Patreon tier access.
- **Hidden** toggle updates Relay list visibility; footer still shows **Patreon (read-only)** tier label unchanged.
- **Audience access** panel shows Patreon tiers as **read-only** on seeded posts (no OAuth re-sync in pilot UX).
- **PostBatchPostDetails** / inspect sidebar sections separate **Gallery visibility**, **Patreon tier access**, **Tags**, and **Collections** with distinct hints.

### Hidden vs audience (must not widen paywall)

1. Select **Supporter photo set** (Ava) or **Backstage notes** (Milo).
2. Turn **Hidden** on in BulkActionBar → Relay visibility.
3. Post remains in creator library with hidden indicator; **Patreon (read-only)** tier label is unchanged.
4. Turn **Hidden** off to restore visible state before switching accounts.

### SyncHealthBanner + PatreonSyncMenu (no OAuth)

- With pilot seed only, **no amber sync rollup banner** at top (sync-state may be absent — that is OK).
- **Patreon sync** menu may show a connect / not-found message — readable, not a blank crash.
- Library edits (visibility, tags) remain enabled when sync health is **unknown** (not degraded/failed).

## Production

The `/login/pilot-ux` page is hidden in production unless `NEXT_PUBLIC_RELAY_PILOT_UX_DEV_LOGIN=true`.

## Gate F — hidden post patron exclusion (PUX-006)

Automated in `tests/pilot-ux-permission-parity.test.ts` (gate F). Manual spot-check:

1. Sign in as **Dev Ava** → Library → select **Supporter photo set** → **Hidden** on in BulkActionBar.
2. Sign in as **Dev Riley** → `/patron/feed` — **Supporter photo set** must **not** appear (Riley is tier-entitled but the creator hid the post).
3. Direct URL `/patron/feed/post/{avaCreatorId}/{avaSupporterPostId}` → **404** (not full content).
4. `GET /api/v1/patron/permission/post?...` for that post → **`deny`** with reason “Post hidden by creator.”
5. Sign back in as Ava → unhide before leaving the library in a dirty state.

Creator libraries still show hidden posts with a gray visibility indicator; only patron/visitor surfaces exclude them.

## Gate G — manual import optional (PILOT-013)

Automated: `tests/manual-import-catalog.test.ts`, `tests/manual-import-staging-access.test.ts`, `tests/manual-import-route.test.ts`, `tests/pilot-013-manual-import-signoff.test.ts`.

Manual spot-check (creator only):

1. Sign in as **Dev Ava** → open **`/manual-import`** (or onboarding step 4 → **Manual Import**).
2. **Save bins** — create at least one manual folder; confirm **synced Patreon tiers** appear in link dropdown (`Supporter`, `Studio`).
3. Before linking: bin shows **Lock** copy — uploads disabled (`upload_enabled: false`).
4. Link bin to a synced tier → bin unlocks when R2 is configured (`upload.r2_configured` in setup API); otherwise R2 warning shows.
5. With R2 + linked bin: upload a small image → appears in bin staging → **Commit to Library** succeeds.

Patrons never see `/manual-import`; tier gates on committed media follow normal Layer A rules.

## Gate H — Relay-native posts optional (PILOT-014)

Automated: `tests/relay-create-post.test.ts`, `tests/relay-native-post-route.test.ts`, `tests/pilot-014-relay-native-signoff.test.ts`, `tests/relay-upload-route.test.ts`, `tests/relay-creator-tenant-authz.test.ts`.

API integration (requires `DATABASE_URL`): Dev Ava `POST /api/v1/relay/posts` with `Post.source=RELAY` → post appears in Ava gallery → Dev Riley `/api/v1/patron/feed` includes supporter-tier post, excludes studio-tier post.

R2 chain (requires `R2_*` env): same file’s **R2 upload chain** test — presign → PUT → commit → create → Riley feed.

Manual spot-check (creator + patron):

1. Sign in as **Dev Ava** → **`/new-post`** (or Library Import Bay → add to new post).
2. Upload a small image (R2 presign) or use staged Import Bay media → pick **Supporter** tier → publish.
3. Confirm success banner / return to Library — new post appears in the grid.
4. Sign in as **Dev Riley** → **`/patron/feed`** — the new Supporter-gated post appears with cover media.
5. Repeat with **Studio** tier — Riley must **not** see it in the main feed (may appear in locked upsell carousel if recently published).

## Gate I — Analytics Action Center MVP (PILOT-015)

Automated: `tests/creator-analytics-api-bundle.test.ts`, `tests/creator-membership-kpis.test.ts`, `tests/creator-membership-cohorts.test.ts`, `tests/creator-tier-stickiness.test.ts`, `tests/creator-post-performance.test.ts`, `tests/patreon-insights-csv.test.ts`, `tests/workstream-e.analytics.test.ts`, `tests/analytics-health-route.test.ts`, `tests/web/analytics-overview.test.tsx`, `tests/pilot-015-analytics-action-center-signoff.test.ts`.

Manual spot-check (creator only):

1. Sign in as **Dev Ava** → **`/analytics`**.
2. Confirm **Membership (last 30 days)** KPI tiles load (paying members, net growth) or show honest empty/degraded copy when sync ledger is sparse.
3. **Cohort retention** and **Tier stickiness** sections render tables or “needs membership history” empty state — not a blank crash.
4. **Post performance** — without CSV, expect amber “No Insights import yet”; optional: upload `tests/fixtures/patreon-insights-sample.csv` → rows appear with impressions/seen.
5. Click **Open Action Center** → **`/action-center`** loads Discovery / Community / Gallery / Insights tabs.
6. **Refresh insights** → **Insights** tab lists recommendation cards (or empty copy with generate hint); accept/dismiss updates card state when cards exist.

Patrons never see `/analytics` or `/action-center`; membership KPIs come from Patreon sync ledger, post impressions from optional Insights CSV only.

## Gate J — Security tenant isolation (PILOT-016)

Automated: `tests/identity/require-account.test.ts`, `tests/relay-creator-tenant-authz.test.ts`, `tests/server/auth-coverage.test.ts`, `tests/security/tenant-isolation.test.ts`, `tests/m10-cross-tenant-isolation.test.ts`, `tests/identity/resolve-tenant.test.ts`, `tests/identity/rls-context.test.ts`, `tests/rls/two-sided-paywall.test.ts`, `tests/pilot-016-tenant-isolation-signoff.test.ts`.

Requires `DATABASE_URL` for live RLS tests (`two-sided-paywall`, `rls-context`); other tests use mocks/file stores.

Manual spot-check (optional, staging):

1. Two creator accounts — each can read/write only their own library mutations (`creator_id` in body must match session).
2. Patron session for creator A — `GET /api/v1/patron/favorites?creator_id=<B>` returns **403 FORBIDDEN**.
3. Supabase/Postgres: RLS enabled on tenant tables per `prisma/migrations/*rls*`; `setSupabaseRlsContext` used on authenticated DB paths.

See `docs/database/M10_VERIFICATION.md` for full M10 checklist and staging exercises.

## Gate K — Pilot exit (PILOT-017)

**Engineering bar (automated):** `npm run verify:pilot` — root build + test, web lint + build. Signoff wiring: `tests/pilot-017-pilot-exit-signoff.test.ts`, prior gates A–J bundles in this doc.

**Product bar (human — required before calling pilot done):**

| Check | Pilot target | Evidence |
| --- | --- | --- |
| Creators published | ≥5 | Airtable / support log |
| Patrons active on feed | ≥25 | OAuth link + feed usage |
| Browser matrix | Chrome blocking; iOS/Android best effort | `docs/pilot-browser-matrix.md` sign-off line |
| Prod env | `RELAY_DB_STORE_*=1`, webhooks, RLS | `node scripts/pilot-env-check.mjs` + staging checklist |
| Security | Zero new P1 regressions | PILOT-016 bundle green |
| UX gates | PUX-000 … PUX-006 (+ PILOT-011 … 016) | Gates A–J in this doc |

**Known follow-ups before full exit:**

- Gate F manual browser: confirm hidden-post exclusion after visibility API changes (automated PUX-006 passes after seed reset).
- Cohort counts are not validated by dev seed alone — track real pilot OAuth accounts separately.

See `docs/pilot-exit-checklist.md` for the scale table and CI parity notes.

## Onboarding walkthrough (dev)

Sign in as **Dev Onboarding** on `/login/pilot-ux`. Each login **resets** that account’s onboarding state (Patreon disconnect, empty profile, URL unclaimed) without touching Dev Ava/Milo/Riley or deleting catalog rows.

After **Simulate Patreon connect (dev)**, step 4 reads faux Patreon metadata: **2 tiers** (Supporter, Studio), **127 patrons**, and **~$1,015/mo** detected revenue. Media stays pending until import. Re-run `npm run seed:pilot-ux` once if tiers are missing from an older seed.

1. Lands on onboarding step 2 (Patreon).
2. Click **Simulate Patreon connect (dev)** — no OAuth, no new Patreon pages; seeds walkthrough tiers + patron snapshot.
3. Complete the mandatory profile step — creator name and avatar. Relay creates your @handle and gallery URL from the name.
4. Use the avatar uploader or keep the Patreon/default avatar when available.
5. Review **What Relay sees** (Tiers, Patrons, Revenue, Media), then click **Import your Media**.
6. Pick **Media Sync** (recommended) or **Manual Import** from the import modal.

Re-run anytime from the same dev login button.
