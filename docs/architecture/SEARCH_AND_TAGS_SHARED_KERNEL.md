# Search & Tags — shared kernel

> **Status:** Active. **Owner:** jorda. **Companions:** [`Patron_Experience_Roadmap.md`](../Patron_Experience_Roadmap.md) §2.5.1, §3.1, PE-E / PE-F / PE-N; [`Patron_Experience_Batting_Order.md`](../Patron_Experience_Batting_Order.md).
>
> **Why this doc exists.** Three lanes (PE-E comments-with-tags, PE-F Discover, PE-N Magnet Folders) all need search + tag handling. Each one re-implementing those primitives produces drift, parser inconsistencies, and migration headaches. This document declares the **single canonical kernel** and the contracts every consumer must wrap.

---

## 1. Decision

**Decisions [D27, D28, D32, D35]** lock these answers in [`Patron_Experience_Roadmap.md`](../Patron_Experience_Roadmap.md) §2:

1. The library tag-search engine in [`src/gallery/query.ts`](../../src/gallery/query.ts) is the **single canonical search engine**.
2. `TagSuggestion` is the **single canonical store** for community-contributed tags (whether sourced from comments today or future surfaces tomorrow).
3. Patron-supplied tags share the **artist tag namespace**. They are functionally identical until the post owner revokes them per-tag.
4. PE-F Discover and PE-N Magnet Folders **wrap or extract from** the library kernel — they do **not** re-implement free-text search, faceting, or filter handling.

---

## 2. The canonical search engine

### 2.1 Where it lives

[`src/gallery/query.ts`](../../src/gallery/query.ts).

### 2.2 What it provides today

| Function | Responsibility |
|---|---|
| `itemMatchesFreeTextQuery(item, raw)` | AND-token search across `title`, `tag_ids`, `description` (HTML-stripped, length-capped), `collection_theme_tag_ids`, `post_id`, `media_id`. Tokens are lowercase-normalised, whitespace-split. |
| `effectiveTags(base, creatorId, postId, overrides)` | Applies `add_tag_ids` / `remove_tag_ids` overrides on top of base tags from canonical snapshot. **This is the choke point** for owner revocation of any tag — including patron-comment tags. |
| `collectFacets(items)` | Returns `{ tag_ids[], tier_ids[], tag_counts, tier_counts, … }` for filter UI. |
| `buildGalleryItems(...)` | Materialises `GalleryItem[]` from canonical snapshot + export index + overrides. The shape every consumer is expected to query against. |
| `applyGalleryFilters(items, params)` | Runs the search, tag/tier/visibility filters, sort, and cursor pagination in one place. |

### 2.3 Search semantics (locked)

- **AND across tokens, OR across fields.** A token must match somewhere; all tokens must match.
- **Substring match per field.** Not stem-aware, not fuzzy. Trade-off accepted: fast, deterministic, easy to reason about. If we ever add stemming or trigram, do it inside this module so all consumers benefit.
- **Tag matching is case-insensitive substring.** This is **intentional** so a search for `fox` matches `red-fox`, `foxtail`, `foxes`. Don't switch to exact-match without product sign-off.
- **HTML stripping happens before matching** for description (`stripHtmlForSearch`); description is also length-capped (`MAX_DESC_SEARCH_CHARS`) to protect tail-latency on long descriptions.
- **Empty query returns true.** Callers that want "no results when blank" must check for empty input *before* calling.

### 2.4 What this kernel is not (today)

- Not a full-text engine (no Postgres `tsvector`, no Elasticsearch). If load forces it, **wrap** the kernel — keep the function signatures stable.
- Not a relevance ranker. Sorting is by the `GallerySortMode` enum, not by match-quality.
- Not personalised. Personalisation belongs in PE-F v2 / PE-M; the kernel is intentionally identity-blind.

---

## 3. Consumer contracts (how each lane plugs in)

### 3.1 PE-E — Comment tags

- On `POST /posts/:postId/comments` with `tagIds`, the create handler **also** writes one `TagSuggestion` row per tag with `source = "patron_comment"`.
- `TagSuggestion.confidence` is computed as the count of distinct contributor accounts for the same `(media_id, tag_id, source = "patron_comment")` — capped and decayed per a TBD policy in PE-E.
- `effectiveTags(...)` already honours `add_tag_ids` / `remove_tag_ids` overrides, so creator revocation of a tag from a single comment writes a per-comment `tagsRevokedByOwnerAt` **and** appends the tag to the post's `remove_tag_ids` (only if no other accepted suggestion still backs it). PE-E is responsible for resolving that arithmetic in one place.
- Comment tags do **not** ship a separate search code path. They land in `tag_ids` via the `TagSuggestion → effectiveTags` pipeline and become searchable through `itemMatchesFreeTextQuery` automatically.

### 3.2 PE-F — Discover

- Discover's free-text input reuses `itemMatchesFreeTextQuery`. No duplicate parser.
- Discover-specific concerns (creator-fairness cap, recency ordering, `discovery_eligible` boolean) layer on **after** the kernel returns candidates.
- Facet chips (tag, tier, free/paid) are fed by `collectFacets`.

### 3.3 PE-N — Magnet Folders

- The boolean criteria parser (D32) lives in a new module `src/search/magnet-criteria.ts`. It produces a normalised `MagnetCriteria` AST.
- The evaluator translates `MagnetCriteria` into a sequence of kernel calls — `applyGalleryFilters` plus an outer set-operation pass for `AND` / `OR` / `NOT`. **It does not re-tokenise text.**
- The same `MagnetCriteria` AST is consumable by PE-F when product wants to expose advanced filters in Discover.

---

## 4. The canonical community-tag store

### 4.1 Where it lives

`prisma.tagSuggestion` — see [`prisma/schema.prisma`](../../prisma/schema.prisma) `model TagSuggestion`.

```prisma
model TagSuggestion {
  id         String    @id @default(cuid())
  creatorId  String    @map("creator_id")
  mediaId    String    @map("media_id")
  tagId      String    @map("tag_id")
  confidence Float
  source     String
  acceptedAt DateTime? @map("accepted_at")
  rejectedAt DateTime? @map("rejected_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  @@index([creatorId, mediaId])
  @@map("tag_suggestions")
}
```

### 4.2 The `source` field is the namespace switch

| `source` value | Origin | Notes |
|---|---|---|
| `manual_artist` | Studio UI | Highest implicit confidence; never auto-rejected. |
| `patron_comment` | PE-E (comments) | New in P2. `confidence` derived from distinct-contributor count. |
| `auto_tagger` | Future ML / heuristic | Reserved. |
| `import_<provider>` | Bulk import / migration | Reserved. |

**Why one table, not three:** the search kernel doesn't care about provenance — it cares about the resulting `tag_ids` on a `GalleryItem`. Splitting tables forces every reader to UNION; one table with an indexed `source` column scales fine and keeps the read path identical for every consumer.

### 4.3 Owner revocation contract (D27)

- The post owner can revoke a single `(media, tag)` contribution from a single comment.
- Comment-side: `Comment.tagsRevokedByOwnerAt` is set on that comment for that tag (granular column or join table — PE-E decides; this doc's contract is the externally observable behaviour).
- Tag-side: if no other non-rejected `TagSuggestion(media_id, tag_id, source = "patron_comment")` remains, the per-post `remove_tag_ids` override gains the tag so `effectiveTags` strips it. If at least one other suggestion still backs the tag, no override is added — the tag survives by virtue of community consensus.
- This keeps revocation **per-comment** at the data layer but **per-tag-on-the-post** at the search layer. That's the user's mental model: "I'm revoking *that* contribution from *that* commenter," but the post stops showing the tag only when *no one* is contributing it any more.

### 4.4 Visibility tiering (D28)

The store does not enforce visibility — the **renderer** does. The store always returns suggestions; consumers filter:

- **MVP / P2:** community-tag chips render in a separate, collapsed-by-default surface on post / media detail.
- **Polish / later:** per-creator setting ("Allow community tags to display publicly"). When off, suggestions still flow into `effectiveTags` for search/algos but UI hides the chip surface entirely.
- **Aspirational / PE-N era or later:** upvote model and contributor reputation. New columns on `TagSuggestion` (`upvotes`, `unique_voter_count`) plus a `verified_at` flag for high-confidence promotion. **Schema slots reserved; no UI ships yet.**

---

## 5. Migration & rollout notes

- PE-E migration adds `Comment.mediaId?`, `anchorX?`, `anchorY?`, `tagIds[]`, `tagsRevokedByOwnerAt?`, renames `Comment.pinnedAt?` → `creatorPinnedAt?` (the rename is the only destructive piece — coordinate matters for a clean grep, see §2.5.1 of the roadmap).
- `TagSuggestion.source` already exists; PE-E only contributes new rows with a new value.
- PE-F's parser does **not** ship until the kernel function signatures in §2.2 are confirmed stable (currently they are — they have not changed since the library shipped).
- PE-N's `MagnetCriteria` parser ships independently of the kernel; the kernel is read-only from PE-N's perspective.

---

## 6. Anti-patterns to refuse in code review

1. **A second tokenizer.** If you're writing `raw.split(...)` and lowercasing for "search," you're forking the kernel. Call `itemMatchesFreeTextQuery` (or extract a sibling helper inside `query.ts` and call it from both places).
2. **A second tag-source table.** If a future surface needs a new origin (e.g. `auto_tagger`), it gets a new `source` value — not a new table.
3. **Bypassing `effectiveTags`.** Anything that reads tags off a post for display or search must go through `effectiveTags` so creator overrides stay authoritative.
4. **Surfacing similarity scores in UI** (D33). The similarity graph is hidden infrastructure; only the "more like this" *list* ships to users.

---

## 7. Cross-references

- Roadmap decisions: D27 (comment tags), D28 (visibility tiers), D32 (Magnet boolean grammar), D33 (similarity infra), D35 (search kernel).
- Roadmap §2.5.1 (comments primitive), §2.5.5 (Magnet Folders primitive).
- Schema: [`prisma/schema.prisma`](../../prisma/schema.prisma) `model TagSuggestion`, `model Comment`.
- Code: [`src/gallery/query.ts`](../../src/gallery/query.ts).
