# Tracked offer links — contract (Slice 7)

@see `docs/studio/AUDIENCE_PROMOTION_CONVERSION.md`  
@see plan Slice 7 build contract

## Public URL shape (frozen)

```
GET {public_origin}/go/:slug
```

- `:slug` is an opaque, immutable token minted once per `PostMarketingOffer`.
- Destination is **never** taken from request query/body — only from the offer row’s `patreon_destination_url`.
- Coupon / discount query params are **not** appended by Relay.

`public_origin` defaults to the Relay API base in v1 (`RELAY_API_BASE` / studio env). QR encodes this exact URL.

## HTTP outcomes

| Condition | Status | Body |
|-----------|--------|------|
| Unknown slug | 404 | JSON error envelope |
| Offer inactive, or destination missing/invalid | 410 | JSON error envelope |
| Active + valid destination | 302 | `Location: <patreon_destination_url>` after click write |

## Destination allowlist

Reuse / harden `normalizePatreonDestinationUrl`:

- Scheme: `https` only
- Host: `patreon.com` or a subdomain of `patreon.com`
- Reject: credentials in URL, IP-literal hosts, non-https, relative URLs, other hosts

Updating destination **must not** change `redirect_slug`.

## Click telemetry (`MarketingOfferClickEvent`)

Stored fields:

- `offer_id`, `creator_id`, `post_id`, `occurred_at`
- Optional `referrer_host` — hostname only from `Referer`, else null

**Forbidden** in click rows / logs: raw IP, raw User-Agent, full destination query string, discount code values.

## First-party event name

`offer_link_clicked` — registered in `first-party-event-contract` with storage `domain_table` (`marketing_offer_click_events`). Payload must not include forbidden fields above.

## Rate-limit posture

Public `/go/:slug` uses a short-window IP-bucket when available; failures still must not leak destination. Creator mint/read APIs use existing studio auth + sync gates.

## Creator UX

- Ensure slug (mint if missing) + copy Relay URL
- Download QR (SVG/PNG) encoding the Relay URL
- Destination edit stays on offer upsert; inactive/missing destination disables redirect (410) and shows honest UI state

## Future Promo Pool attribution handoff (planned)

Status: **documentation / contract only** — no discovery insertion, impression writes, or Patreon conversion reconciliation ships with this section.

Identity rules:

1. Durable keys are `promo_piece_id` + `post_id`. Slot rank is display order only and must not be the permanent attribution key.
2. Future placement creates an opaque `placement_id` / `impression_id` before any feed surface shows a Promo Piece.
3. Impression events require: `creator_id`, `promo_piece_id`, `post_id`, `placement_id` (or `impression_id`), `surface`, `occurred_at`.
4. Clicks carry opaque placement/impression context into `GET /go/:slug`. The server validates ownership and context before recording; destination remains server-owned.
5. Tier-default tracked links need `post_id` + `promo_piece_id` on the click row (in addition to `tier_default_id`) so per-piece reporting is possible without inventing a second precedence layer.
6. Conversion reconciliation may reference click/placement context only when Patreon supplies a trustworthy subscription event — out of scope until that ingestion exists.
7. Privacy: host-only referrer; never raw destination URL, query strings, IP, or User-Agent on click/impression rows.

Registered planned first-party names (see `src/platform-metrics/first-party-event-contract.ts`):

- `promo_piece_impression` — planned
- `promo_piece_link_clicked` — planned

Performance UI must treat metrics as **unavailable** until a real service owns values. Zero and unavailable are distinct states (`src/marketing/promo-performance-contract.ts`).
