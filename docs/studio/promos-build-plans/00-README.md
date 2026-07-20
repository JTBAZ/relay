# Studio Promos Build Plans

These briefs decompose the `/studio/promos` enhancement into six executable vertical slices. They are written for a Grok 4.5 builder agent working from todo items, not as product brainstorming.

## Builder operating rules

1. Read `AGENTS.md` and `.cursor/rules/rescue-workflow-always.mdc` first.
2. Claim only the todo IDs included in the current prompt batch.
3. Read only that slice's required references plus files directly touched by the claimed todos.
4. Preserve the three-layer permission invariant: Promo Pool membership never grants access, restores export URLs, or bypasses hidden visibility.
5. Preserve Patreon as origin and Relay-owned promo state as an overlay.
6. Do not implement discovery/feed insertion, paid placement, Patreon conversion ingestion, or fabricated performance data.
7. Add or update tests in the same batch as behavior.
8. Do not commit or push unless explicitly requested.
9. When implementation changes require a live refresh, finish the final batch with `npm run dev:stack:restart` and verify ports 8787 and 3000.

## Slice files

1. [`01-VS1-PROMO-PIECES-UX.md`](01-VS1-PROMO-PIECES-UX.md) — empty state, Add Post modal, saved cards
2. [`02-VS2-PROMO-IDENTITY.md`](02-VS2-PROMO-IDENTITY.md) — stable identity and owner-side markers
3. [`03-VS3-TIER-RULES.md`](03-VS3-TIER-RULES.md) — real inheritance summaries and rule UX
4. [`04-VS4-CODES.md`](04-VS4-CODES.md) — Codes/Tier Rules workflow alignment
5. [`05-VS5-PREVIEW-ATTRIBUTION.md`](05-VS5-PREVIEW-ATTRIBUTION.md) — preview parity and future tracking contract
6. [`06-VS6-VERIFICATION-ROLLOUT.md`](06-VS6-VERIFICATION-ROLLOUT.md) — regression, browser, documentation, and rollout gates

## Dependency order

```text
VS1 Promo Pieces UX
  -> VS2 Promo identity
    -> VS3 Tier Rules
      -> VS4 Codes alignment
        -> VS5 Preview and attribution
          -> VS6 Verification and rollout
```

VS3 and VS4 may be developed in parallel only after VS2 lands, but merge and verify VS3 before VS4 because Codes consumes the hub state and rule usage summary.

## Definition of complete

- A creator can select one to five active posts from `/studio/promos`, including separate members of Linked Sets.
- Saved posts render as discrete Promo Piece cards and persist through refresh.
- Promo identity remains stable through reorder.
- Tier Rules show truthful matching Promo Piece counts.
- Codes and Tier Rules share current state without stale dropdowns.
- Preview explains the effective offer without implying algorithmic placement.
- Automated and browser gates pass, and the docs distinguish shipped behavior from future discovery/conversion work.
