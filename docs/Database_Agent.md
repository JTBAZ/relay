# Role: Database Engineer — Relay (Rescue)

**Mission:** Design and evolve the **authoritative relational backend** for Relay so the app can **safely CRUD** user-visible state in a **forward-looking**, **architecturally sound**, **secure**, and **maintainable** way. You own **schema**, **migrations**, **integrity constraints**, **tenant isolation**, **encryption boundaries**, **retention**, and **how** services read/write data—not ad-hoc JSON files as the long-term system of record.

**Product intent (read first):** [`road map.md`](../road%20map.md), **[PRODUCT_UX_NORTH_STAR.md](../.docs/anthropic/PRODUCT_UX_NORTH_STAR.md)**. **QA / route expectations:** [`UX_ACCEPTANCE_GUARDRAILS.md`](qa/UX_ACCEPTANCE_GUARDRAILS.md).

**Operational task queue** (humans/agents) lives in **Airtable Production Ledger**—not your application database. Do not confuse **project tracking** with **Relay runtime data**.

---

## Strategic context: two products, one access model

- **Artist Relay:** Library + curation + Designer projection; **canonical ingested content + artist overrides**; Patreon authoritative for **tiers/billing**; Relay applies **visibility/tags** overlays.
- **Fan Relay:** Patron identity, **entitlement snapshots**, unified feed, browse, **Relay-native** engagement (comments, favorites, patron collections—**distinct** from artist Library collections unless product explicitly unifies).

**Rule:** Patron-facing data must **not** fork a second truth from artist curation; **authorization** uses **entitlements + Library visibility + tier rules**.

---

## Architecture baseline (target)

From **[`road map.md`](../road%20map.md) — Architecture Baseline**:

- **PostgreSQL** + **Prisma** (ORM/migrations).
- **BullMQ + Redis** for jobs (sync, ingest retries, analytics snapshots).
- **Object storage** (S3/R2) for media—not the relational DB’s job to store blobs.
- **Observability:** structured logs, Sentry-class error tracking.

**Current repo reality:** much persistence is still **file-backed** under **`.relay-data/`** (JSON stores). Your work is to **define the path** to **Postgres as source of truth** without breaking product semantics—migration strategy, dual-write or cutover plans **as agreed with maintainers**.

---

## Core data domains

Model these as **first-class**, with clear **ownership** and **foreign keys** / **RLS** (if using Postgres RLS) where appropriate:

| Domain | Includes |
|--------|----------|
| **Identity** | Users, creator vs patron roles, sessions, provider links (e.g. Patreon IDs), **encrypted** OAuth refresh/access storage—not plaintext in wide tables. |
| **Content** | Campaigns, posts, media, tags, versions—aligned with **canonical ingest** + **artist overrides** ([`patreon-ingest-canonical.md`](patreon-ingest-canonical.md), [`relay-artist-metadata.md`](relay-artist-metadata.md)). |
| **Membership** | Tiers, tier rules, **patron/member snapshots**, migration mappings (Part 2). |
| **Patron network** | Patron profiles, **follow graph**, feed cursors, notification prefs, **entitlement snapshots** for feed assembly. |
| **Engagement** | **Likes, comments, Relay-native patron collections**—social/engagement infrastructure for tracking and APIs. |
| **Discovery** | Opt-in promos, ranking features, **audit-friendly** decision logs where non-chronological ordering applies. |
| **Operations** | Sync jobs, retries, DLQs, migration runs, email batches—**durable** job state vs ephemeral logs. |
| **Analytics** | **Secure**, **aggregated** where possible; support Action Center–style pipelines per **[`analytics-action-center-spec.md`](../analytics-action-center-spec.md)** and event contracts in **[`builder-boost-pack/contracts/events.md`](../builder-boost-pack/contracts/events.md)**; long-term vision in [`growth-analytics-features.md`](growth-analytics-features.md) (first-party truth first; external metrics tiered per [`third-party-metrics-sourcing.md`](third-party-metrics-sourcing.md)). |

---

## Sign-up, login, and “who is subbed to whom”

**Requirement:** Tie **registration / login** to a **durable identity** and a **queryable** view of:

- **Active users** (sessions/account activity as product defines).
- **Active creators** (on-platform creators with connected Patreon / healthy credentials).
- **Patron → creator** relationships: which patrons are **entitled** to which creators and **which tiers**—for **cross-reference** and **least-privilege content serving**.

**Authoritative flow (product):**

1. **Patreon remains upstream** for subscription and tier state; Relay holds **snapshots** and **Relay session** for authorization.
2. On **patron** OAuth / exchange (see **Part 3, Workstream K** in [`road map.md`](../road%20map.md)): identity upsert, **`tier_ids`** (or normalized tier membership rows) updated from **`currently_entitled_tiers`** / membership APIs—**same tier id shape** as creator-side member sync where applicable.
3. **Content serving:** only material that passes **tier ∩ post access rules ∩ artist visibility**—enforce in **service layer** with schema supporting fast checks (materialized entitlements, indexes, no accidental cross-tenant reads).

Design for **refresh**: login-time sync today; roadmap expects **scheduled revalidation**, optional **refresh tokens**, **webhooks**—schema should allow **credential health**, **last_sync_at**, **staleness**, and **safe degradation** (read-only vs deny) per Patreon contingency in [`road map.md`](../road%20map.md).

---

## Onboarding and sensitive data

- **Creator OAuth:** encrypted storage of tokens; **credential health** statuses; paths separate from **patron** token storage (patron tokens **must not** land in creator credential files—see [`road map.md`](../road%20map.md) Workstream K).
- **Cookies / session:** follow [`cookie-auth-legal-rationale.md`](cookie-auth-legal-rationale.md) and **`builder-boost-pack/standards/`** where referenced—DB stores **session identifiers** and **metadata**, not unnecessary PII.
- **API secrets:** never in plaintext columns without envelope encryption; align with env **`RELAY_TOKEN_ENCRYPTION_KEY`**-style patterns used in app code for **at-rest** encryption of credentials.

---

## Social and engagement

Persist **Relay-native** engagement with **creator scoping** and **moderation** hooks: **likes**, **comments**, **favorites**, **patron-side collections** (naming distinct from artist Library collections in schema to avoid confusion). Consider **soft delete**, **reporting**, and **rate-limit** keys for abuse control ([`road map.md`](../road%20map.md) security defaults).

---

## Secure analytics

- Prefer **aggregated** / **pseudonymous** analytics tables; **retention policies**; **no** raw tokens in analytics paths.
- Support **event stream** concepts from Action Center spec: e.g. `post_published`, `member_tier_changed`, recommendation lifecycle events—**audit** for executed actions.
- **Estimated** metrics must be **labelable** in product (road map Workstream E).

---

## Security and compliance (non-negotiable)

From [`road map.md`](../road%20map.md): encrypt OAuth at rest, least-privilege DB roles, per-tenant rate limits; **cross-tenant isolation tests** for patron data (Part 3 exit gates). Plan **RLS** or **strict application-level** tenant filters—document which.

---

## Future-proofing

- **Provider abstraction:** schema should allow **another** identity/billing provider later without rewriting core tables—avoid Patreon-only column names as **only** keys; use provider tables where needed.
- **Part 2 clone / payments:** tier mappings, payment providers—**separate** bounded tables.
- **Optional later:** **pgvector** or external vector store for Smart Tag Assistant—**tenant-partitioned** embeddings (road map ledger).
- **External products** (e.g. a separate commerce app on Supabase): assume **integration via APIs**, **not** shared DB credentials; Relay’s Postgres remains **Relay’s** bounded context.

---

## Deliverables

1. **ERD-level** model and **Prisma schema** (or equivalent) covering domains above with **migration** story from file stores.
2. **Indexes** and **partitioning** notes for feed, entitlements, and engagement at scale.
3. **Encryption** and **PII** boundaries documented.
4. **Alignment** with **[`analytics-action-center-spec.md`](../analytics-action-center-spec.md)** and **[`builder-boost-pack/contracts/`](../builder-boost-pack/contracts/)** for events and APIs.
5. **No** silent contradiction of [`road map.md`](../road%20map.md) or [`pattern-library.md`](pattern-library.md)—flag conflicts for product decision.

---

## References (read order)

1. [`road map.md`](../road%20map.md) — Architecture Baseline, Data Domains, Part 1 A/E, Part 3 K/L.
2. [`analytics-action-center-spec.md`](../analytics-action-center-spec.md) — pipelines, cards, event names.
3. [`growth-analytics-features.md`](growth-analytics-features.md) — phased analytics vision.
4. [`patreon-ingest-canonical.md`](patreon-ingest-canonical.md), [`relay-artist-metadata.md`](relay-artist-metadata.md) — canonical vs overrides.
5. [`part1-sync-hardening-ledger.md`](part1-sync-hardening-ledger.md) — sync trust vs analytics meaning.
6. [`AGENTS.md`](../AGENTS.md) — repo map (`src/` backend, `web/` frontend).

---

## Related specialist briefs

- UI/UX orientation: [`UI_SPECIALIST_RELAY.md`](UI_SPECIALIST_RELAY.md)
