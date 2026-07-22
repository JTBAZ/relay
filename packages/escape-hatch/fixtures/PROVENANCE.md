# Escape Hatch fixture provenance (EH-010 / EH-011 / EH-012 / EH-013)

All fixtures under `packages/escape-hatch/fixtures/` are **synthetic or irreversibly sanitized**. They preserve Relay-supported structural oddities without live secrets or patron PII.

## Policy

Never commit:

- live OAuth / cookie / session tokens;
- Patreon client secrets;
- R2 / AWS credentials or private keys;
- real patron names, emails, phones, payment IDs, or addresses;
- real private media bytes (only tiny synthetic SVG / placeholder files).

Sanitization method for Patreon-shaped JSON:

1. Start from documented Relay golden shapes (`tests/fixtures/patreon/*`) or synthetic clones of those shapes.
2. Replace IDs with `fixture_*` / numeric-looking synthetic ids.
3. Replace CDN hosts with `cdn.fixture.example` (and similar `*.fixture.example` / `example.com` allowlisted hosts).
4. Strip auth headers, cookies, JWTs, and PEM blocks.
5. Keep structural oddities: empty `tiers`, sparse `included`, raw numeric tier strings, absent relationships, HTML bodies, sentinel tier ids where applicable.

## Source families

| Family id | Source | Notes |
|-----------|--------|-------|
| `baseline-sample-bundle` | synthetic SiteBundle | Legacy unversioned `sample.bundle.json`; EH-000/001 CLI + contract upgrade. |
| `baseline-clone-site` | synthetic CloneSiteModel | Legacy unversioned `clone-site.json`; path rewrite + `has_export: false`. |
| `baseline-relay-dump` | synthetic canonical/export | `relay-dump/*`; **EH-011** importer + **EH-012** migrate-media checksum/private-read ledger + **EH-013** library-truth parity report. |
| `public-text-only` | OAuth JSON:API + SiteBundle | Mirrors `oauth-list-post-text-only` (HTML body, empty tiers, no media). |
| `all-patrons-with-image` | cookie JSON:API + SiteBundle | `member_only` / all-patrons with relationship media + sparse `included`. |
| `exact-tier` | cookie-like + SiteBundle | Raw numeric tier string preserved in Patreon shape; SiteBundle uses `match_mode: exact` + `amount_cents`. |
| `tier-or-higher` | synthetic SiteBundle | `match_mode: tier_or_higher` with ordered floors. |
| `multi-media-gallery` | OAuth-like + SiteBundle/Clone | Multi-image gallery + attachment mime. |
| `free-vs-paid` | synthetic SiteBundle | Free follower (`amount_cents: 0`) vs paid member personas. |
| `export-failure` | CloneSiteModel | `has_export: false` missing-blob case (no fake importer success). |
| `unicode-rich` | OAuth JSON:API + SiteBundle | Unicode title/slug; long sanitized HTML `content` in Patreon shape (SiteBundle has no body field yet). |
| `multi-tier-floors` | synthetic SiteBundle | Creator with multiple paid floors + free tier. |
| `duplicate-cdn-urls` | Patreon JSON:API | Duplicate / normalized CDN URL oddity preserved intentionally. |
| `missing-cover-attachment` | CloneSiteModel | Attachment present without cover image media. |
| `deleted-tombstoned` | **present (EH-011)** | `relay-dump` `p_tombstone` + importer accounted exclusion/conflict path. |
| `legacy-tier-rename` | **present (EH-011)** | Importer `tier_remap` conflict queue for mappings + title/amount drift. |
| `video-audio-embed` | **present (EH-012 migration accounting)** | Tiny text placeholders with video/audio/embed mime; private object ledger only — no visitor players. |
| `mature-metadata` | **deferred-to-EH-033** | EH-011 **excludes** mature/legal-adult posts from live SiteBundle (accounted); private/legal enforcement is EH-033+. |

## Intentionally preserved oddities

- Empty `tiers: []` on public OAuth posts.
- Cookie posts with **string** tier ids in `attributes.tiers` (e.g. `"555"`).
- Sparse `included` media with `download_url` only.
- `links: {}` pagination placeholder.
- Relay sentinels documented in SiteBundle personas / notes: `relay_tier_public`, `relay_tier_all_patrons` (never treated as paid pledges by preview access).
- `has_export: false` / missing on-disk blob without inventing successful blob copy.
- Tombstoned canonical posts (`upstream_status: "deleted"`) accounted by the importer.
- AV/embed placeholders are text only — never real private binaries or live embed fetches.

## Confirmation

- No live tokens, cookies, or PEM material in this tree.
- No real patron PII; display names are fictional fixture labels (`Fixture Creator`, etc.).
- Media files are tiny synthetic SVGs / text placeholders under `fixtures/media/` and `fixtures/relay-dump/**/blobs/`.
- Automated scan: `packages/escape-hatch/src/fixture-scan.ts` (wired into package tests / `npm run escape-hatch:test`).

## Consumers

| Slice | Use |
|-------|-----|
| **EH-001** | `parseSiteBundle` / `parseCloneSiteModelInput`, preview `canAccessPost` / `canViewPost`. |
| **EH-010** | Matrix index, provenance, secret/PII scan, contract + access coverage. |
| **EH-011** | Relay-dump importer, provenance/local-state split, conflict queue, tombstone + legacy tier coverage. |
| **EH-012** | Media migration engine (`migrate-media`), private object keys, checksum ledger; **never** treats `public/media` as private delivery. |
| **EH-013** | Library truth wizard / `library-parity-report` / continue gate; excludes do not delete export blobs. |
| **EH-033+** | Visitor signed-URL delivery and mature/legal enforcement beyond accounted exclusions. |
