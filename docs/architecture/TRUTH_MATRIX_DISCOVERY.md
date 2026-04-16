# Truth matrix discovery (intent → explicit contracts)

This workbook turns **product intent** into a **truth matrix**: for each concern, what is authoritative at runtime, who may access it, how you verify it, and what would falsify your claims. It complements the Cursor plan **Truth matrix discovery** (not the operational Airtable Production Ledger).

**Audience:** Product owner + engineering. **Constraint:** strict **multi-tenant SaaS** (many unrelated creators on shared infrastructure; tenant isolation is non-negotiable).

---

## Owner decisions (summary)

**Accounts and Patreon shape**  
Design for **one Relay login** that can (a) **manage multiple Patreon campaigns / studios** when one person owns more than one—**multiple campaigns under one account** is an allowed (if rare) case the architecture must accommodate. (b) **Switch between creator and patron** in the same spirit as Patreon: the same person can run a studio *and* act as a fan, with patron entitlements tied to the **same identity story** (email / Patreon linkage).

**Isolation and support**  
**Tenant safety stays non-negotiable**; priority order is **safety → completeness → freshness**. **Support is privacy-first:** default to **blind tools** (reset, disconnect, reconnect). **Deeper visibility** (“see enough to fix it”) only with **explicit user permission** for that incident. If overhead stays small, maintain a **staff audit log** of privileged actions.

**Operations and environments**  
Use **separate Patreon developer apps** for **staging** and **production** so OAuth redirects and webhooks do not cross environments.

**Sync, discovery, and “I just subscribed”**  
Background staleness (TTL, webhooks, scrape cadence) is acceptable in general, but **post-subscribe and discovery flows must not feel stuck for hours.** Provide a **user-visible “push” path**—e.g. manual re-verification or refresh (re-OAuth or a dedicated sync trigger)—so someone who just subscribed can prompt Relay to **verify access now** without waiting on a long snapshot window alone.

**One-line intent for engineering**  
Multi-studio / multi-campaign capable **per login**; creator + patron in one login like Patreon; strict isolation; privacy-first support with optional escalation; staging/prod Patreon apps split; **staleness tolerable in the abstract, unacceptable at the moment of subscribe—ship explicit user-driven refresh.**

---

## How to use this doc

1. **Runtime truth** rows describe what the repo does today—see [`docs/database/migration-from-relay-data.md`](../database/migration-from-relay-data.md) for `RELAY_DB_STORE_*` ↔ storage.
2. For each concern in the matrix, **verification** must match the **actual** read path (file vs DB), not aspirational Prisma tables.
3. Dashboards and health UIs use **Honest UI** states (`ok` | `degraded` | `not_applicable` | `unknown`)—never imply Postgres parity where the app still reads files or flags are off.

---

## A. Product and actors

### Decisions

| # | Topic | Decision |
|---|--------|----------|
| A1 | **Creator** | Manages one **studio** per linked campaign context (`relay_creator_id`); must never read or mutate another creator’s private data. The studio ingests Patreon media via OAuth + cookies; paywall semantics follow Patreon/OAuth metadata. |
| A1 | **Fan (patron)** | Patreon OAuth (or equivalent) establishes which creators they support and at what tier; their feed is creator-allowed content they may access. Fans have profiles (public or private) and may interact where permissions allow (comments, collections, etc.). |
| A1 | **Platform admin / support** | No routine “view as user” or first-person browsing of libraries. **First line:** blind tools (audit connection state, repair links, connect/disconnect Patreon, reset where safe). **Escalation:** deeper visibility only if the **account owner opts in** for that support case. |
| A1 | **Billing-only** | Not specified here; scope billing roles to **subscription and payment metadata** when a monetization spec exists—do not treat this doc as the billing source of truth until then. |
| A2 | **What is a “tenant”?** | A **Relay studio** is anchored by **`Tenant.relayCreatorId`**. A **Patreon campaign** is linked via OAuth and **`CreatorProfile.patreonCampaignId`**. **One human** may use **one login** to manage **multiple studios / multiple Patreon campaigns** over time; the product must allow that shape. |
| A2 | **Creator + fan, same login** | **Mirror Patreon:** the same login may **switch** between creator and patron contexts so a creator can also see patron-side subscriptions tied to the same email / Patreon identity story. |
| A3 | **Correctness priority** | **Safety** (no cross-tenant leakage) **>** **completeness** (ingest and entitlements match policy) **>** **freshness** (feeds and snapshots up to date). |
| A4 | **Staleness—creator content** | Creator feed freshness follows **Patreon activity + webhooks + scrape**—no fixed clock SLA stated here; “as fresh as upstream + pipeline” unless the product later defines tighter SLAs. |
| A4 | **Staleness—patron access** | Default snapshot TTL remains configurable (e.g. `RELAY_PATRON_ENTITLEMENT_STALE_AFTER_MS`); **after subscribe or upgrade,** users must have a **manual “verify / refresh now”** path so they are not blocked for multi-hour delays purely by TTL (see Owner summary). |

---

## B. Identity and boundaries (multi-tenant SaaS core)

### Decisions

| # | Topic | Decision |
|---|--------|----------|
| B1 | **Prove studio ownership before OAuth / scrape** | **Relay account + session** first: Supabase (or configured) auth; **`POST /api/v1/creator/workspace`** provisions `Tenant` + `CreatorProfile` and sets **`Account.primaryRelayCreatorId`**. Creator Patreon OAuth uses signed `state` bound to account + creator when **`RELAY_ENFORCE_CREATOR_OAUTH_BIND`** and secrets are set ([`src/server.ts`](../../src/server.ts)). Patreon alone does not prove studio ownership without that binding. **No extra verification** (domain proof, manual approval) is required by this doc unless compliance later demands it. |
| B2 | **One Patreon ↔ Relay studios** | A **given Patreon campaign** may only **power one Relay studio at a time**—no splitting one campaign across two tenants. If the product allows **one login to own multiple studios**, each studio links its **own** campaign; the constraint is **per campaign**, not “one campaign per human forever.” |
| B3 | **Conflict: two studios claim the same campaign id** | **Block** the second attachment if that Patreon has already completed OAuth with another Relay studio. **User-facing:** clear message that the campaign is already linked elsewhere; must **disconnect / de-sync** from the other studio first. Provide a **help path** for suspected theft or lockout. |
| B4 | **Impersonation** | **No standing impersonation.** Break-glass or elevated access only under written policy; default remains **blind tools + opt-in visibility** (A1). |

---

## C. Data authority (“what is true?”)

For each row: **system of record** vs **cache/derivative** vs **display-only**.

| Concern | Runtime truth (as-built) | Product intent / disputes |
|---------|--------------------------|----------------------------|
| **Creator profile & public slug** | **`CreatorProfile`** + **`Tenant`** in Postgres when Prisma is enabled; public slug via [`src/server.ts`](../../src/server.ts). | **Relay** owns public slug and routing. **Patreon display names** update when cheap: OAuth or next scrape—no requirement for continuous rename sync. |
| **OAuth tokens (creator ingest)** | File default (`patreon_credentials.json`); DB when **`RELAY_DB_STORE_CREATOR_OAUTH=1`** → `DbPatreonTokenStore` / `OAuthCredential` ([`.env.example`](../../.env.example), [`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) MIG-20). | **Production** should converge on **DB-backed** tokens for durability and multi-tenant ops; exact cutover follows [`docs/database/migration-from-relay-data.md`](../database/migration-from-relay-data.md) and env parity (section D). |
| **Patreon posts / media in Relay** | With **`RELAY_DB_STORE_CANONICAL=1`**, **`DbCanonicalStore`** is authoritative **inside Relay**; **Patreon** remains the human SoR for “what exists on Patreon.” | Disputes: re-sync from Patreon; Relay may hide or mark stale content per product rules. |
| **Watermarks / last synced** | **`RELAY_DB_STORE_WATERMARK`** selects DB vs file; **behavior follows the wired store**, not the Prisma table in isolation. | During migration: **single read path** after ops dual-write/reconcile—no “both true”; follow migration runbook. |
| **Cookies / browser session** | **`FilePatreonCookieStore`**—not switched by the same flags as OAuth DB ([`src/server.ts`](../../src/server.ts)). | Treat as **sensitive operational state**; long-term **reduce reliance** where API-only paths allow—engineering roadmap, not a blocker for honest labeling today. |
| **Webhook registration** | **`PatreonWebhookMetadataStore`** → `patreon_webhook_metadata.json`; **`GET /api/v1/patreon/sync-state`** exposes `webhook_registration`. **`WebhookEndpoint`** in Prisma is a **future** replacement—**not** live control plane until wired. | Dashboards: label **file-backed** until cutover; **Patreon developer portal** is the external SoR for “what URL Patreon calls.” |
| **Member / entitlement state** | **`PatronEntitlementSnapshot`** + membership when identity DB path is on; **`staleAfter`** ([`multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) MIG-40). | **Patreon** is authoritative for entitlement; Relay snapshot gates UX. **Subscribe/upgrade moments** need the **manual refresh** path from the Owner summary so users are not stuck on TTL alone. |

---

## D. Environments and configuration

| # | Topic | Decision |
|---|--------|----------|
| D1 | **Isolation consistency** | **Local, staging, and production** must use the **same tenant-isolation rules** (scoping by `relay_creator_id` / tenant, same OAuth binding semantics). Data sets differ; **security logic** must not. |
| D2 | **`RELAY_DB_STORE_*` parity** | Staging should **mirror production’s intent** for which domains are DB-backed, or dashboards will show misleading greens. **Never differ** across envs on: **`DATABASE_URL` target project**, **secrets**, **OAuth redirect URLs**, **webhook callback URLs**. **May differ:** load and non-security feature flags **if** UI labels them honestly. |
| D3 | **Patreon apps** | **Approved:** separate **staging** and **production** Patreon developer apps (or equivalent separation) so staging OAuth and webhooks **never** hit production users or data. |

---

## E. Observability and proof

| # | Topic | Decision |
|---|--------|----------|
| E1 | **Dashboard prove vs display** | **Prove:** tenant isolation (tests + spot checks), and **behavioral** sync health consistent with **`GET /api/v1/patreon/sync-state`** and actual stores. **Display only:** raw file paths or Prisma counts **unless** that store is the live read path—label **file-backed** and **flag-dependent** nodes. |
| E2 | **Incident severity** | **Severity 0:** cross-tenant data exposure. **Severity 1:** auth bypass or wrong-account access. **Severity 2+:** stale feeds or sync delays **unless** the product promised real-time—still important for discovery UX, but secondary to safety. |
| E3 | **Audit trail** | **Minimum:** structured logs with **`traceId`** ([`src/server.ts`](../../src/server.ts)). **Add** an **append-only staff audit log** when implementation cost stays low (who ran which privileged action against which account). |

---

## F. Migration and commitment

| # | Decision |
|---|----------|
| F1 | Ship operator UI before **`webhook_endpoints`** is live **if** the UI labels webhook state as **file-backed metadata** and does not claim Postgres parity for webhook rows. |
| F2 | Per-domain cutover: dual-write → reconcile → switch reads → remove file fallback—see [migration doc](../database/migration-from-relay-data.md) and [M10_VERIFICATION.md](../database/M10_VERIFICATION.md). |

---

## Truth matrix table (Patreon-adjacent + identity shell)

| Concern | Product intent | Runtime source of truth (as-built) | External SoR for disputes | Isolation rule | Verification (examples) | Honest UI | Falsifies if |
|---------|----------------|--------------------------------------|---------------------------|----------------|---------------------------|-----------|--------------|
| Studio provision | One login may own **multiple** studios over time; each studio scoped to its `relay_creator_id`. | Postgres: `Account`, `Tenant`, `CreatorProfile` when DB enabled | — | Queries and routes scoped by tenant / `relay_creator_id`; account ownership enforced on creator routes | `POST /api/v1/creator/workspace`, `GET /api/v1/creator/public-slug` | `ok` when profile exists for that studio; `unknown` if DB unavailable | User A provisions studio and sees User B’s tenant data. |
| Creator OAuth tokens | Durable, tenant-safe storage in production. | File **or** DB per **`RELAY_DB_STORE_CREATOR_OAUTH`** | Patreon token validity | Tokens keyed by **`creator_id`** / tenant in DB path | OAuth exchange, refresh routes, `oauth_credentials` row when flag on | `ok` / `degraded` (expiring); `unknown` if store unreadable | Token for `creator_id` X is used for ingest as `creator_id` Y. |
| Canonical ingest | Relay shows ingested content consistent with policy; safety over perfect parity. | File **or** DB per **`RELAY_DB_STORE_CANONICAL`** | Patreon | All rows tied to **`creatorId`** / tenant | Ingest tests, `POST` scrape, counts | `ok` when policy met; `degraded` on DLQ | Cross-tenant rows in canonical store for one query. |
| Sync watermark | Incremental sync correctness per creator + campaign. | File **or** DB per **`RELAY_DB_STORE_WATERMARK`** | Patreon publish times | Scoped per creator + campaign in store | `sync-state` watermark fields | `ok` / `degraded` | Watermark advances for wrong campaign or wrong creator. |
| Sync health | Operators see last scrape / member sync honestly. | File **or** DB per **`RELAY_DB_STORE_SYNC_HEALTH`** | — | Per-creator record | `sync-state` `last_post_scrape`, health stores | `ok` / `degraded` | Health shows “ok” while another creator’s events are recorded. |
| Patreon cookies | Operational need until reduced; never cross tenants. | **File** (`FilePatreonCookieStore`) | — | Per-creator record in store | `sync-state` cookie fields | `ok` / `degraded` / `not_applicable` if flow API-only | Cookie session reused across `creator_id`s. |
| Webhook metadata | Until DB cutover, truth is Relay file metadata + Patreon portal. | **File** (`patreon_webhook_metadata.json` via `PatreonWebhookMetadataStore`); not **`webhook_endpoints`** until wired | Patreon developer portal | Secrets and routing do not cross tenants; campaign → creator routing | `GET /api/v1/patreon/sync-state` (`webhook_registration`) | `ok` vs runtime store; `not_applicable` for Postgres row match until cutover | UI claims DB webhook row match while runtime reads JSON only. |
| Campaign ↔ tenant routing | **One campaign → one studio at a time**; conflicts blocked with clear UX. | File index + **`CreatorProfile.patreonCampaignId`** | Patreon campaign ownership | At most one winning Relay studio per campaign per policy | `ensureCreatorProfilePatreonCampaignId`, scrape flow | `degraded` on conflict until resolved | Second studio links same campaign while first is still active. |
| Patron entitlements | Patreon authoritative; Relay must not block **just-subscribed** users for hours if they invoke refresh. | Postgres snapshot + membership when identity DB path on | Patreon | Snapshot keyed by patron + **`relay_creator_id`** | Patron OAuth tests, snapshot rows, **manual refresh UX** | `ok` within `staleAfter`; `degraded` after; offer **user push** to refresh | Fan sees another creator’s entitlements or tier gates wrong tenant. |

---

## Strict multi-tenant SaaS review checklist

For each matrix row:

1. **Isolation rule** is testable (filters, routing keys, no shared cache across tenants).
2. **Falsifies if** is a concrete failure scenario (column above).
3. **Honest UI** never shows **green Postgres parity** for domains that still read **files** or run with **flags off**.

---

## Engineering follow-ups (from Owner summary)

These are **product-backed requirements**, not yet guaranteed by a single endpoint:

- **Multi-studio / multi-campaign per login** — account and workspace model must allow more than one `primaryRelayCreatorId` or equivalent **without** breaking isolation (design work).
- **Creator ↔ patron switch** — UX and session model aligned with Patreon-style switching on **one login**.
- **User-driven “verify / refresh now”** — explicit path after subscribe or upgrade so entitlement and discovery are not TTL-blocked alone.

---

## References

| Doc | Why |
|-----|-----|
| [`docs/database/migration-from-relay-data.md`](../database/migration-from-relay-data.md) | Flag ↔ table ↔ file map |
| [`docs/architecture/multi-tenant-cloud-runtime.md`](multi-tenant-cloud-runtime.md) | MIG-20, MIG-40, OAuth paths |
| [`docs/database/M10_VERIFICATION.md`](../database/M10_VERIFICATION.md) | File fallback removal gate |
| [`AGENTS.md`](../../AGENTS.md) | Repo map + verification |

---

## Completion note

This document is **decision-complete** for the scope above. Remaining work is **implementation**: multi-studio account model, switch UX, manual refresh flows, staff audit log, and DB cutovers per [`docs/database/migration-from-relay-data.md`](../database/migration-from-relay-data.md). Optional: an internal **`/api/v1/.../runtime-manifest`** echoing active `RELAY_DB_STORE_*` flags so UIs cannot drift from truth.
