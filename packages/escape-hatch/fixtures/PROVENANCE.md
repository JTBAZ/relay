# Escape Hatch fixture provenance (EH-010)

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
| `baseline-relay-dump` | synthetic canonical/export | `relay-dump/*`; importer/parity deferred to **EH-011**. |
| `public-text-only` | OAuth JSON:API + SiteBundle | Mirrors `oauth-list-post-text-only` (HTML body, empty tiers, no media). |
| `all-patrons-with-image` | cookie JSON:API + SiteBundle | `member_only` / all-patrons with relationship media + sparse `included`. |
| `exact-tier` | cookie-like + SiteBundle | Raw numeric tier string preserved in Patreon shape; SiteBundle uses `match_mode: exact` + `amount_cents`. |
| `tier-or-higher` | synthetic SiteBundle | `match_mode: tier_or_higher` with ordered floors. |
| `multi-media-gallery` | OAuth-like + SiteBundle/Clone | Multi-image gallery + attachment mime; video/audio/embed structural stubs noted deferred where bytes/import needed. |
| `free-vs-paid` | synthetic SiteBundle | Free follower (`amount_cents: 0`) vs paid member personas. |
| `export-failure` | CloneSiteModel | `has_export: false` missing-blob case (no fake importer success). |
| `unicode-rich` | OAuth JSON:API + SiteBundle | Unicode title/slug; long sanitized HTML `content` in Patreon shape (SiteBundle has no body field yet). |
| `multi-tier-floors` | synthetic SiteBundle | Creator with multiple paid floors + free tier. |
| `duplicate-cdn-urls` | Patreon JSON:API | Duplicate / normalized CDN URL oddity preserved intentionally. |
| `missing-cover-attachment` | CloneSiteModel | Attachment present without cover image media. |
| `deleted-tombstoned` | **deferred-to-EH-011** | Needs canonical `upstream_status` / importer tombstone handling. |
| `mature-metadata` | **deferred-to-EH-011** | Mature/legal-adult metadata not on SiteBundle contract; avoid inventing fields. |
| `legacy-tier-rename` | **deferred-to-EH-011** | Legacy patron remapping + conflict queue belong to importer. |

## Intentionally preserved oddities

- Empty `tiers: []` on public OAuth posts.
- Cookie posts with **string** tier ids in `attributes.tiers` (e.g. `"555"`).
- Sparse `included` media with `download_url` only.
- `links: {}` pagination placeholder.
- Relay sentinels documented in SiteBundle personas / notes: `relay_tier_public`, `relay_tier_all_patrons` (never treated as paid pledges by preview access).
- `has_export: false` without inventing successful blob copy.

## Confirmation

- No live tokens, cookies, or PEM material in this tree.
- No real patron PII; display names are fictional fixture labels (`Fixture Creator`, etc.).
- Media files are tiny synthetic SVGs under `fixtures/media/`.
- Automated scan: `packages/escape-hatch/src/fixture-scan.ts` (wired into package tests / `npm run escape-hatch:test`).

## Consumers

| Slice | Use |
|-------|-----|
| **EH-001** | `parseSiteBundle` / `parseCloneSiteModelInput`, preview `canAccessPost` / `canViewPost`. |
| **EH-010** | Matrix index, provenance, secret/PII scan, contract + access coverage. |
| **EH-011** | Relay-dump + deferred families (importer, conflict queue, provenance split). |
| **EH-012+** | Media migration / private delivery must not treat `public/media` prototype copy as safe. |
