# UI Planning — Inventory ranked vs `Agent Reference/roadmap.md`

## Important caveat

`Agent Reference/roadmap.md` describes the **CRE Due Diligence Analyzer** (PoC P1/P2, milestones **M0–M10**: SQLite checklist, Dropbox, Streamlit `data_editor`, tiers, parsers). The **UI Planning — Inventory** rows describe the **Relay / gallery** product.

There is **no literal 1:1** between roadmap bullets and UI rows. Ranking here uses a **thematic mapping**:

| Roadmap theme | Inventory band (roughly) |
|---------------|---------------------------|
| **M0** Foundations | Shell, legal, ops banners, health, onboarding entry |
| **M1–M2** Data + sync | Patreon connect/cookie/sync, library hub, export reliability |
| **M3–M4** Classification & routing | Inspect, bulk, collections, filters, post batch |
| **M5** Validation | Designer, hero/editors, publish preflight |
| **M6–M7** Outcomes / review | Triage, Action Center, explanations, provenance labels |
| **M8** Product UI | Visitor gallery, OG, dashboard |
| **M9+ / identity** | Email auth, password, settings, abuse prefs |
| **M10** Demo / commercial | Billing, usage, BYOI, migration wizards, deploy, campaigns, conversion KPIs |
| **Part 3** (fan surface) | Patron feed/browse/profiles, patron OAuth, entitlement, upgrade, engagement, promos |
| **Phase 2 / deferred** | Relay pixel, connectors, Smart Tags, MFA, age gate, coaching |

**Lower `Roadmap Rank` = build sooner** in this scheme. Ties within a band can be swapped without breaking the narrative.

## Applied in Airtable

- **Base:** Project tracker (`applW4dOjVNHoWBM9`)
- **Table:** UI Planning — Inventory (`tbluISu3XCKl3Berv`)
- **New field:** `Roadmap Rank` (integer, **1–59** for all current rows)

Sort **UI Planning — Inventory** by **Roadmap Rank** ascending in a new view (e.g. `Build order — roadmap`) for day-to-day use.

## Ordered list (rank → element)

| Rank | Element / Page |
|------|----------------|
| 1 | Root layout + AppNav |
| 2 | Global 404 / error boundary |
| 3 | Terms, Privacy, DPA summaries |
| 4 | Cookie/session explainer |
| 5 | Rate limit + maintenance banners |
| 6 | Health / status page |
| 7 | Onboarding progress (4 steps) |
| 8 | Patreon creator connect/callback |
| 9 | Patreon cookie page |
| 10 | Patreon sync menu |
| 11 | Library sync pill / banner |
| 12 | Library (GalleryView + sidebar) |
| 13 | Inspect modal |
| 14 | Bulk action bar |
| 15 | Collections panel + builder/editor |
| 16 | Saved filters |
| 17 | Post batch UI |
| 18 | Export retry on items |
| 19 | First-run Library tips |
| 20 | Designer (DesignerView + preview) |
| 21 | Hero + section editors |
| 22 | Publish preflight |
| 23 | Triage dialog |
| 24 | Action Center |
| 25 | Card explanation + history |
| 26 | Third-party metric provenance |
| 27 | Visitor gallery + favorites |
| 28 | Public OG/share metadata |
| 29 | Dashboard (what happened) |
| 30 | Email sign up / sign in / out |
| 31 | Password reset + verification |
| 32 | Settings hub |
| 33 | Report abuse + preference center |
| 34 | Billing: plan + payment + invoices |
| 35 | Usage meters (storage, egress, email) |
| 36 | BYOI vs managed indicator |
| 37 | Migration recipient preview + staged send |
| 38 | Tier → payment mapping wizard |
| 39 | Clone deploy preview + DNS checklist + rollback |
| 40 | Re-Populate campaign builder |
| 41 | Conversion + bounce dashboard |
| 42 | Patron shell: feed |
| 43 | Patron shell: Browse |
| 44 | Patron profiles + follows |
| 45 | Patreon patron connect/callback |
| 46 | Entitlement pending/downgrade UX |
| 47 | Upgrade to Patreon / deep link |
| 48 | Comments, favorites, patron collections |
| 49 | Creator promo opt-in UI |
| 50 | Daily promo slot (opt-in paywalled) |
| 51 | Premium viewer + boost token |
| 52 | Relay Link + pixel admin |
| 53 | Connector management |
| 54 | Smart Tag: processing zone |
| 55 | Smart Tag: suggestions + clusters |
| 56 | Smart Tag: audit trail |
| 57 | MFA (protect high-risk actions) |
| 58 | Age / mature gate |
| 59 | Goals / coaching loop (Phase 6) |

## Maintenance

When you add new **Inventory** rows, assign the next integer or insert between ranks (e.g. use decimals in a scratch area, then renumber). Prefer keeping **Roadmap Rank** dense **1…N** before you lean on automation.
