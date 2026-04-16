# Truth matrix discovery (intent → explicit contracts)

This workbook turns **product intent** into a **truth matrix**: for each concern, what is authoritative at runtime, who may access it, how you verify it, and what would falsify your claims. It complements the discovery questionnaire in the Cursor plan **Truth matrix discovery** (do not confuse with the operational Airtable Production Ledger).

**Audience:** Product owner + engineering. **Constraint assumed here:** strict **multi-tenant SaaS** (many unrelated creators on shared infrastructure; tenant isolation is non-negotiable).

**How to use**

1. Read **Draft baseline (Relay as-built)** rows—they reflect the repo today and [`docs/database/migration-from-relay-data.md`](../database/migration-from-relay-data.md).
2. Fill every **`[OWNER]`** cell with your product decisions (or strike/replace baselines you disagree with).
3. For each concern, complete **Falsifies if**—one concrete failure scenario.
4. When implementing a dashboard or cutover, map UI states to **Honest UI** (`ok` | `degraded` | `not_applicable` | `unknown`)—never imply Postgres parity where the app still reads files.

---

## A. Product and actors

### Questions (from discovery plan)

| # | Question |
|---|------------|
| A1 | Who are the personas (creator, fan, internal admin, billing-only)? What can each **never** do? |
| A2 | What is a “tenant” in user terms—one Patreon campaign, one Relay studio, one Stripe customer, or a bundle? Can one human own **multiple** tenants? |
| A3 | What counts as “correct” for a creator: posts ingested, members synced, webhooks firing, or “feed looks right in the app”? |
| A4 | What is acceptable downtime or staleness for sync (minutes, hours, manual refresh only)? |

### Draft baseline (Relay + strict MT SaaS) — refine with `[OWNER]`

| # | Draft answer | Owner action |
|---|----------------|--------------|
| A1 | **Creator:** manages one **studio** (Relay tenant) tied to a `relay_creator_id`; must never read or mutate another creator’s private data. **Fan (patron):** consumes published/creator-allowed experiences; must never see another fan’s private data or another creator’s drafts. **Platform admin / support:** `[OWNER]` define role, impersonation, and audit requirements (default: no production data access without explicit policy). **Billing-only:** `[OWNER]` if applicable, scope to subscription metadata only. | `[OWNER]` Admin and billing rules |
| A2 | In Relay’s multi-tenant model, a **tenant** is anchored by **`Tenant.relayCreatorId`** (studio). **`Account.primaryRelayCreatorId`** ties the logged-in **account** to that studio for artist flows. Whether one human may run **multiple studios** (multiple tenants) is `[OWNER]`; technically supported via multiple accounts or future membership rules—state your policy. **Patreon campaign** is an external identity/asset linked via **`CreatorProfile.patreonCampaignId`** and OAuth—not the same as “tenant” unless you declare it so. | `[OWNER]` One human → many studios? |
| A3 | **Correctness** is layered: (1) **Authorization:** no cross-tenant leakage. (2) **Ingest:** canonical store matches agreed sync semantics. (3) **UX:** feed matches what you promise (may lag Patreon). Prioritize which layer is mandatory for launch vs beta. | `[OWNER]` Order of priority: safety vs freshness vs completeness |
| A4 | Patron entitlement snapshots use a **staleness window** after OAuth (default **6h**, `RELAY_PATRON_ENTITLEMENT_STALE_AFTER_MS` in [`.env.example`](../../.env.example)). Creator-side scrape/watermark cadence is **`[OWNER]`** (product SLA). | `[OWNER]` Target max staleness for feeds |

---

## B. Identity and boundaries (multi-tenant SaaS core)

### Questions

| # | Question |
|---|------------|
| B1 | How does a user prove they own a studio before OAuth or scraping runs? |
| B2 | May the same Patreon account ever power more than one Relay tenant? If yes, what is the rule? |
| B3 | What happens on conflict (two tenants claim the same Patreon campaign id)? Who wins, who gets blocked? |
| B4 | Admin / support: may staff impersonate or read creator data? Under what audit rules? |

### Draft baseline — refine with `[OWNER]`

| # | Draft answer | Owner action |
|---|----------------|--------------|
| B1 | **Account + session:** Supabase (or configured) auth establishes identity; **`POST /api/v1/creator/workspace`** provisions `Tenant` + `CreatorProfile` and sets **`Account.primaryRelayCreatorId`**. **Creator Patreon OAuth** uses signed `state` bound to account + creator when **`RELAY_ENFORCE_CREATOR_OAUTH_BIND`** and secrets are set ([`src/server.ts`](../../src/server.ts)). **Proof of studio** before token exchange is “authenticated account + owned `creator_id`,” not Patreon alone. | `[OWNER]` Any extra verification (e.g. domain, manual approval) |
| B2 | **As-built tension:** Patreon campaign IDs are global; Relay scopes data by **`relay_creator_id`**. Whether one Patreon creator may connect **multiple Relay studios** is a **product rule**—if forbidden, enforcement must be explicit (campaign uniqueness policy). If allowed, document the UX. | `[OWNER]` Allowed or forbidden; if forbidden, enforcement level |
| B3 | **As-built:** routing uses campaign → creator mappings (file-backed index + `CreatorProfile.patreonCampaignId`); scrapes/sync may **realign** profile campaign id ([`ensureCreatorProfilePatreonCampaignId`](../../src/patreon/campaign-tenant-resolve.ts)). **Conflict** (two studios claiming one campaign) should be **`[OWNER]`** policy: block second link, support escalation, or last-write-wins with audit. | `[OWNER]` Conflict resolution and user-facing errors |
| B4 | **`[OWNER]`** only. Baseline for strict MT SaaS: assume **no impersonation** until you define break-glass, logging, and legal/compliance sign-off. | `[OWNER]` |

---

## C. Data authority (“what is true?”)

For each row: **system of record** vs **cache/derivative** vs **display-only**.

| Concern | Questions to settle | Draft baseline — runtime truth (as-built) | `[OWNER]` intent / dispute resolution |
|---------|---------------------|-------------------------------------------|-------------------------------------|
| **Creator profile & public slug** | DB vs Patreon profile fields? | **`CreatorProfile`** (+ `Tenant`) in Postgres when Prisma is enabled; public slug APIs in [`src/server.ts`](../../src/server.ts). Patreon display names may be snapshots elsewhere—**Relay’s public URL** is your slug rules. | `[OWNER]` If Patreon renames, does Relay auto-update display? |
| **OAuth tokens (creator ingest)** | File vs DB? | **Default:** `patreon_credentials.json`. **Optional:** `RELAY_DB_STORE_CREATOR_OAUTH=1` → **`DbPatreonTokenStore`** / `OAuthCredential` (see [`.env.example`](../../.env.example), [`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) MIG-20). | `[OWNER]` Prod must use DB-only when? |
| **Patreon posts / media in Relay** | Canonical vs Patreon live API? | When **`RELAY_DB_STORE_CANONICAL=1`**, **`DbCanonicalStore`** is authoritative **inside Relay** for ingest; Patreon remains the **human** system of record for “what Patreon says.” Disputes: **`[OWNER]`** policy (re-sync, hide post, etc.). | `[OWNER]` |
| **Watermarks / last synced** | DB vs file disagreement? | **Flag-selected:** `RELAY_DB_STORE_WATERMARK` switches `DbSyncWatermarkStore` vs file watermarks ([migration table](../database/migration-from-relay-data.md)). **Behavior** follows whichever store **`createApp`** wires—**not** the Prisma table alone if the flag is off. | `[OWNER]` During migration, which wins if both exist (should be dual-write + single read path per ops runbook) |
| **Cookies / browser session** | Necessary long-term vs bridge? | **`FilePatreonCookieStore`** (e.g. `.relay-data` cookies path)—**not** gated by `RELAY_DB_STORE_*` in the same way as OAuth DB migration ([`src/server.ts`](../../src/server.ts)). Treat as **sensitive operational state** for flows that need browser session. | `[OWNER]` Roadmap to reduce or eliminate cookie reliance |
| **Webhook registration** | Patreon vs Relay metadata? | **Runtime:** `PatreonWebhookMetadataStore` → default **`patreon_webhook_metadata.json`** (encrypted metadata). **`GET /api/v1/patreon/sync-state`** exposes `webhook_registration` summary. **Prisma:** [`WebhookEndpoint`](../../prisma/schema.prisma) exists as **replacement target** for that JSON—**app paths do not treat `webhook_endpoints` as the live control plane until wired.** | `[OWNER]` Accept file-backed dashboard labels until DB cutover |
| **Member / entitlement state** | Patreon vs Relay snapshot? | Patron access uses **`PatronEntitlementSnapshot`** (when identity DB path is on) with **`staleAfter`** / tier membership ([`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) MIG-40). **Patreon** is authoritative for “is this person entitled?”; Relay holds a **snapshot for gating** with TTL. | `[OWNER]` Acceptable staleness for paywalled content |

---

## D. Environments and configuration

### Questions

| # | Question |
|---|------------|
| D1 | How many environments must behave the same regarding **tenant isolation**? |
| D2 | May staging and prod differ on `RELAY_DB_STORE_*` behavior? What must **never** differ? |
| D3 | Webhook URLs: one Patreon app vs per-environment apps—rule to avoid cross-env leakage? |

### Draft baseline — refine with `[OWNER]`

| # | Draft answer | Owner action |
|---|----------------|--------------|
| D1 | **Isolation rules should match** across local, staging, and prod: same scoping by `relay_creator_id` / tenant, same auth binding semantics. **Data** may differ; **logic** must not be “prod multi-tenant, staging shared-secret.” | `[OWNER]` List envs you maintain |
| D2 | **Common pitfall:** staging has DB flags on, prod still file-backed—dashboards show different “greens.” **Never differ** on: **`DATABASE_URL` project** (no staging DB pointed from prod), **secrets**, **OAuth redirect URLs**, **webhook callback URLs**. **May differ:** load, feature flags, **only if** you label UI honestly. | `[OWNER]` Staging ≈ prod matrix for flags |
| D3 | **Each Patreon developer app** has one webhook URL. Use **separate apps or path tokens** per environment so staging deliveries never hit prod ([`.env.example`](../../.env.example) Patreon section). | `[OWNER]` One vs many Patreon apps |

---

## E. Observability and “airtight” proof

### Questions

| # | Question |
|---|------------|
| E1 | What must the dashboard **prove** vs **merely display**? |
| E2 | What is your incident bar: data leak, wrong tenant content, or stale feed? |
| E3 | Audit trail: need who triggered scrape, OAuth, webhook handling? |

### Draft baseline — refine with `[OWNER]`

| # | Draft answer | Owner action |
|---|----------------|--------------|
| E1 | **Prove:** tenant isolation invariants (tests + spot checks), and **behavioral** sync health (e.g. **`GET /api/v1/patreon/sync-state`** matches what server uses). **Merely display:** file path existence, Prisma row counts **unless** that table is the live read path. Label **file-backed** nodes explicitly. | `[OWNER]` Go-live proof list |
| E2 | For strict MT SaaS, **severity 0 = cross-tenant data exposure**; **severity 1 = auth bypass**; staleness is lower unless you promise real-time. | `[OWNER]` Severity definitions |
| E3 | **`[OWNER]`** compliance target. Minimum for ops: structured logs with **`traceId`** (API envelopes in [`src/server.ts`](../../src/server.ts))—expand to immutable audit if required. | `[OWNER]` |

---

## F. Migration and commitment

| # | Question | Draft baseline |
|---|------------|----------------|
| F1 | Ship UI before webhook rows in Postgres? | Yes, if UI labels **file-backed webhook metadata** and does not assert `WebhookEndpoint` parity ([`WebhookEndpoint`](../../prisma/schema.prisma)). |
| F2 | Cutover criteria for a domain? | Follow [migration doc](../database/migration-from-relay-data.md): dual-write → reconcile → switch reads → remove file fallback; see [M10_VERIFICATION.md](../database/M10_VERIFICATION.md) for gate. |

---

## Truth matrix table (Patreon-adjacent + identity shell)

Use this as the single sheet to maintain. **Replace** `[OWNER]` and **`TBD`** as decisions land.

| Concern | Intent `[OWNER]` | Runtime source of truth (as-built) | Human / external SoR for disputes | Isolation rule (strict MT SaaS) | Verification (examples) | Honest UI | Falsifies if `[OWNER]` |
|---------|------------------|-------------------------------------|-----------------------------------|----------------------------------|---------------------------|-----------|-------------------------|
| Studio provision | `[OWNER]` | Postgres: `Account`, `Tenant`, `CreatorProfile` when DB enabled | — | `relay_creator_id` scoped to tenant; account ownership checks on creator routes | `POST /api/v1/creator/workspace`, `GET /api/v1/creator/public-slug` | `ok` if profile exists; `unknown` if DB off | `TBD` |
| Creator OAuth tokens | `[OWNER]` | File **or** DB per `RELAY_DB_STORE_CREATOR_OAUTH` | Patreon token validity | Tokens keyed by **`creator_id`** / tenant path in DB store | OAuth exchange, token refresh routes, DB row in `oauth_credentials` when flag on | `ok` / `degraded` if expiring; `unknown` if cannot read store | `TBD` |
| Canonical ingest | `[OWNER]` | File **or** DB per `RELAY_DB_STORE_CANONICAL` | Patreon content | All canonical rows tied to **`creatorId`** / tenant scoping in store | Ingest tests, scrape POST, counts | `ok` when ingest matches policy; `degraded` on DLQ | `TBD` |
| Sync watermark | `[OWNER]` | File **or** DB per `RELAY_DB_STORE_WATERMARK` | Patreon publish times | Scoped per creator + campaign in store implementation | `sync-state` watermark fields | `ok` / `degraded` | `TBD` |
| Sync health (last scrape / member sync) | `[OWNER]` | File **or** DB per `RELAY_DB_STORE_SYNC_HEALTH` | — | Per creator record | `sync-state` `last_post_scrape`, health stores | `ok` / `degraded` | `TBD` |
| Patreon cookies | `[OWNER]` | **File** (`FilePatreonCookieStore`) | — | Per-creator record in cookie store | `sync-state` cookie fields | `ok` / `degraded` / `not_applicable` if API-only | `TBD` |
| Webhook metadata | `[OWNER]` | **File** (`patreon_webhook_metadata.json` via `PatreonWebhookMetadataStore`) — **not** `webhook_endpoints` until wired | Patreon developer portal registration | Webhook secret must not cross tenants; routing resolves campaign → creator | `GET /api/v1/patreon/sync-state` (`webhook_registration`) | `ok` for “consistent with runtime store”; `not_applicable` for “Postgres row match” until cutover | `TBD` |
| Campaign ↔ tenant routing | `[OWNER]` | **File** index + **`CreatorProfile.patreonCampaignId`** in DB | Patreon campaign ownership | Only one “winning” creator per campaign per **policy** | `ensureCreatorProfilePatreonCampaignId`, scrape flow | `degraded` on conflict until resolved | `TBD` |
| Patron entitlements snapshot | `[OWNER]` | Postgres snapshot + membership when `RELAY_DB_STORE_IDENTITY` path | Patreon | Snapshot keyed by patron + **`relay_creator_id`** | Patron OAuth tests, snapshot rows | `ok` within `staleAfter`; `degraded` after | `TBD` |

---

## Strict multi-tenant SaaS review checklist

For each row above, confirm:

1. **Isolation rule** — stated and testable (query filters, routing keys, no shared cache across tenants).
2. **Falsifies if** — one realistic scenario (e.g. “webhook handler applies update to wrong `relay_creator_id`”).
3. **Honest UI** — dashboard never shows **green Postgres parity** for domains that still read **files** or **flags-off** paths.

---

## References (read next)

| Doc | Why |
|-----|-----|
| [`docs/database/migration-from-relay-data.md`](../database/migration-from-relay-data.md) | Flag ↔ table ↔ file artifact map |
| [`docs/architecture/multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) | Flows MIG-20, MIG-40, OAuth vs Account |
| [`docs/database/M10_VERIFICATION.md`](../database/M10_VERIFICATION.md) | When file fallbacks may be removed |
| [`AGENTS.md`](../../AGENTS.md) | Repo map + verification expectations |

---

## Completion note

This file satisfies the discovery **process**: product questions, baselines tied to the repo, a fillable matrix, and SaaS isolation review. **Replacing `[OWNER]` and `TBD`** with your decisions is the remaining human step; optional next engineering step is to add an internal **`/api/v1/.../runtime-manifest`** that echoes active stores (flags) so UIs cannot drift from truth.
