# Part 1 focus — Patreon pipeline experience (north star)

**Purpose:** Re-anchor execution when scope creeps. Sequencing matches [`road map.md`](../road%20map.md): **Part 1** is gallery export, ingest, access truth, and artist UX on canonical rows; **storefront economics**, **commission**, and **workshop** surfaces are **later layers** once sync and walls are boringly reliable.

**One line to reuse**

> **Part 1 MVP = ingest + paywall truth + artist UX on that foundation; storefront and commission workshop ship after the walls are rock solid.**

---

## How to phrase the Part 1 north star

1. **Ingestion is the spine** — Incremental sync, idempotency, health/watermarks, honest errors. [`part1-sync-hardening-ledger.md`](part1-sync-hardening-ledger.md) is the shipped hardening map; DB flags and backfills support “real” persistence when you adopt it.

2. **Paywall maintenance = entitlement + tier truth** — Patreon remains authoritative; Relay must re-sync / re-evaluate access when tiers or posts change so “why can’t I see this?” is rare and explainable. Align with [`pattern-library.md`](pattern-library.md) and [`qa/UX_ACCEPTANCE_GUARDRAILS.md`](qa/UX_ACCEPTANCE_GUARDRAILS.md).

3. **UX “around those walls”** — Library, visibility, overrides, layout/designer as **projections** of the same canonical + policy model ([`relay-artist-metadata.md`](relay-artist-metadata.md), [`patreon-ingest-canonical.md`](patreon-ingest-canonical.md)): **not a second inventory.**

4. **Digital storefront + commission workshop** — Treat as **follow-on patches** after the above: monetization / workflow chrome on a **stable** access + content base. [`financial-atlas.md`](financial-atlas.md) storefront framing stays valid; it **must not** drive the critical path until ingest + paywall UX are trusted.

---

## Product call

**Double focus on nailing the Patreon pipeline experience** — ingestion reliability, sync honesty, tier/access truth, and artist UX on canonical data — so later pieces (storefront, commissions, workshops) do not steal cycles from reliability.

---

## Related docs

| Topic | Doc |
|--------|-----|
| Sync hardening (shipped map) | [`part1-sync-hardening-ledger.md`](part1-sync-hardening-ledger.md) |
| Canonical vs overrides | [`patreon-ingest-canonical.md`](patreon-ingest-canonical.md), [`relay-artist-metadata.md`](relay-artist-metadata.md) |
| UX / routes | [`pattern-library.md`](pattern-library.md), [`qa/UX_ACCEPTANCE_GUARDRAILS.md`](qa/UX_ACCEPTANCE_GUARDRAILS.md) |
| Storefront economics (later) | [`financial-atlas.md`](financial-atlas.md) |
| Full roadmap | [`road map.md`](../road%20map.md) |
