# Metadata readiness for PS-16 to PS-22

Readiness review: 2026-10-20. This is design preparation; it implements no fields or collectors.

The [program index](00-README.md) allows design and fixture preparation before implementation dependencies pass. Metadata collection and product implementation wait for PS-15. [Reliability acceptance](ACCEPTANCE.md) requires R01 to R16, including authorized live provider/browser evidence. Local mocks cannot close those cases.

## Existing evidence

The reviewed checked-in fixtures contain no provenance-bearing creator capture or export establishing the proposed conversion, revenue, trial/gift, or detailed asset fields. A provenance-bearing fixture needs a recorded source, capture context and field meaning, with credentials and unnecessary personal data removed. Realistic IDs and the word "golden" do not establish that history.

| Area | Files and contents | Evidence limit |
|---|---|---|
| CSV | [Sample CSV](../../../tests/fixtures/patreon-insights-sample.csv), [tests](../../../tests/patreon-insights-csv.test.ts): post identity, impressions, seen, likes, comments. | Example values; no capture provenance, reporting window, currency or provider-update time. |
| Performance panel | [Parser tests](../../../tests/patreon-metrics-parser.test.ts): constructed HTML with four counters, including zero. | Synthetic DOM; no paid/free joins, purchases, revenue or consumption fields. |
| Website API metrics | [Fetcher tests](../../../tests/patreon-post-metrics-fetch.test.ts): constructed post/post_insights counters and update timestamps. | Synthetic JSON. Update timestamps are requested but currently discarded by the parser. |
| Posts and media | [OAuth golden](../../../tests/fixtures/patreon/oauth-list-post-text-only.json), [cookie golden](../../../tests/fixtures/patreon/cookie-list-with-media.json), [sync baseline](../../../tests/fixtures/patreon/sync-baseline.json). | OAuth golden has no capture provenance. Cookie/baseline use fixture URLs and demonstrate identity, relationships, URL and MIME; no original filename, size, dimensions or duration. |
| Lifecycle | Sync baseline has active/absent members; [ledger logic](../../../src/patreon/membership-ledger-sync.ts) derives transitions from snapshots. | Synthetic roster evidence; no observed charge, trial, gift or payment-history payloads. |
| Cover relationships | [Cover regression](../../../tests/patreon-ingest-cover-collapse.test.ts) models attachment/cover CDN variants. | Tests identity preservation; establishes no detailed metadata provenance. |

## Documented candidates

The current [Patreon Member reference](https://docs.patreon.com/#member) documents `campaign_lifetime_support_cents`, `last_charge_date`, `last_charge_status`, `next_charge_date`, `is_free_trial`, `is_gifted`, `pledge_cadence` and `will_pay_amount_cents`. Use `is_free_trial`, not `is_trial`. `lifetime_support_cents` is deprecated. Charge time describes an attempt; lifetime support uses campaign currency. Name/email may be masked or null. [Campaign](https://docs.patreon.com/#campaign) documents `currency`; [Pledge Event](https://docs.patreon.com/#pledge-event) has event currency and payment status. These candidates still need authorized payload verification.

[Media](https://docs.patreon.com/#media) documents `file_name`, `size_bytes`, `mimetype`, nullable `metadata`, ownership relationships and expiring URLs. It does not establish dimension/duration keys or prove these resources appear through the currently authorized post request.

## Existing implementation seams

[Prisma](../../../prisma/schema.prisma) already has snapshot `raw` JSON, integer value, source and capture time. CSV rows retain four counters and nullable `asOf`; imports retain upload time/hash. Membership events lack separate provider/observation times and currency. [Ingest types](../../../src/ingest/types.ts) retain media identity/MIME/URL/revision/role. [Export records](../../../src/export/types.ts) retain downloaded checksums and byte lengths as local blob evidence.

The [metrics fetcher](../../../extension/src/lib/patreon-post-metrics-fetch.ts) uses cookie-authenticated private `/api/posts` and `/api/post_insights`, while writing `platform_api`. The [performance vocabulary](../../analytics/PERFORMANCE_INTELLIGENCE_VOCABULARY.md) defines that source as official API. PS-16 must distinguish collection channels without silently renaming persisted sources or changing precedence.

## Handoff requirements

After PS-15, preserve capture time separately from provider-update time, reporting windows and aggregation. Unknown source facts stay unknown. Keep the [CSV importer's](../../../src/analytics/patreon-insights-csv.ts) creator-scoped identity, unmatched rows, limits and file-hash idempotency when making supported columns optional.

The first locally grounded scope is compatibility for the four legacy counters, truthful observation timestamps, existing media identity/roles and downloaded checksum/length evidence. Fixture designs should cover overlapping CSV windows, cumulative versus period totals, partial captures and source precedence. A recent upload cannot make old measurements fresh. Empty supported imports must fail visibly.

Before supporting conversions/revenue/consumption, obtain authorized sanitized panel/export observations with locale, units, currency, windows and Patreon attribution wording. Trial/gift and detailed asset candidates need sparse/null payload cases and replay coverage. Resolve platform permission before expanding private collection, as [acceptance](ACCEPTANCE.md) requires.

PS-19 must preserve known source metadata through absent fields unless the source explicitly clears it. URL renewal cannot change asset identity or force another download. PS-20 uses existing Library search/details/exports and requires creator confirmation before merging related work.

PS-21 retains the [conversion contract](../../analytics/CONVERSION_ATTRIBUTION.md): provider totals cannot create deterministic conversions; free joins remain funnel evidence. Estimates require two 14-day creator-local windows, 80% coverage in both and three combined paid-support events. PS-22 requires E01 to E07, unavailable states and verified provenance for every visible measure. No patron identities enter Coach facts.
