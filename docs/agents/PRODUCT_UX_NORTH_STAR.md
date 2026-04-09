# Product UX — north star (Relay)

**Purpose:** Keep UI and API work aligned with **two intentional products** sharing one access model (see **`road map.md`** — Artist Relay vs Fan Relay).

---

## Artist Relay (creator account)

- **Jobs to be done:** Own a **Library** as curation hub; control visibility and tags; shape **Collections** and **Designer** layout so the **public gallery** is a **projection** of policy, not a second inventory.
- **Must feel:** Curation is **overlays** on canonical Patreon-sourced rows; re-ingest should not silently destroy artist tags/visibility without documented behavior (**`docs/patreon-ingest-canonical.md`**, **`docs/relay-artist-metadata.md`**).
- **Patreon remains authoritative** for tier and paywall rules; Relay applies **artist overrides** on top.

## Fan Relay (patron account)

- **Jobs to be done:** **Unified feed** of supported creators; **artist profiles**; **Browse** where policy allows; **entitlements** reflect subscription/tier changes via OAuth/sync.
- **Must feel:** Paywall follows **entitlement snapshots**; upgrade/downgrade/cancel converges without mystery (**`road map.md`** sync expectations).

## Shared rules

- **No second truth:** Patron-facing surfaces do not fork inventory from artist curation.
- **Sync honesty:** Best-effort freshness with visible **sync status** — not a promise of zero lag vs Patreon.
- **Compliance posture:** Cookie/auth and third-party integrations follow repo standards (**`builder-boost-pack/standards/`**, **`docs/cookie-auth-legal-rationale.md`** where applicable).

## Swarm implication

- **Do not** “invent” product names, tiers, or flows that contradict **`road map.md`** or **`docs/pattern-library.md`** without an explicit ledger row or owner decision.
- **Do** check **`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`** for pass/fail expectations on key routes.
