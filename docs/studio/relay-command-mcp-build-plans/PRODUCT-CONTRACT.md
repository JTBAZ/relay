# Relay Command Layer — Product Contract

**Status:** Frozen for Phases 1–4 of this program  
**Expansion (P5–P10):** [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md) — do not mutate this P1–P4 lock to “make conversation work.”  
**Program hub:** [`00-README.md`](00-README.md)  
**Acceptance:** [`../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md`](../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md)  
**Lab 2 test ground:** [`LAB2-TEST-GROUND-CONTRACT.md`](LAB2-TEST-GROUND-CONTRACT.md)

This contract is the product lock. Implementation may not invent unsolicited curation, autonomous publishing, raw database tools, or a second content inventory. If a contradiction appears in code, stop with evidence; do not redesign the product in a batch.

## Product promise

Relay is an **Art Post Centralizer**. A creator hosts their work in one Library, then **organizes, edits, and plans it with natural language**. They do not spend hours manually curating hundreds of posts. They speak the relationships they already know; Relay executes the mechanics against a durable PostgreSQL + Prisma content graph.

The product is **not**:

- an AI curator that guesses which works belong together;
- a generic CMS or page builder;
- an autonomous social publisher;
- a chatbot that dumps the Library into a model context window;
- a second inventory beside Gallery, Collections, or the Schedule Rail.

The governing sentence:

> The artist supplies the meaning. Relay supplies the mechanics.

## Primary experience

1. The creator opens Studio (Lab 2 is the required test ground; production Library is the later host).
2. They type a direction they already know, for example: *Take my comic series “Hero Academy,” organize it by page, and plan one page a week on X.*
3. Relay asks **at most one focused clarifying question**, and only when the answer changes the result.
4. Safe internal work applies immediately with Undo. Public, access, and external work shows a compact ChangeSet summary first.
5. The **gallery physically rearranges**: Collection labels appear, posts pile into stacks, order is visible, schedule slices appear on the rail. Database tags alone are not success.
6. The creator can refine with another sentence, refresh, and Undo.

MCP is the **capability protocol**, not the consumer onboarding surface. The in-Relay command box uses the same capabilities as an optional external assistant. The user never has to know what MCP is.

## Five POC capabilities

These five (plus Undo) are the Phase 1–4 product surface. Later expansion is a human go/no-go after Phase 4, not implied scope.

| Capability | User intent | Deterministic authority |
|---|---|---|
| **Find / resolve** | “Find everything tagged watercolor” / “Hero Academy pages” | Explicit selection grammar over titles, tags, ids, dates, visibility, source, collection membership, and destination publication status. No visual similarity inference. |
| **Organize collections** | “Put them in a collection ordered by page, cover first” | `LibraryCollection` + ordered membership. Number extraction is deterministic and reports gaps/duplicates. |
| **Revise content correctly** | “Rename Page 12 on my Relay gallery, don’t change Patreon” | Imported posts: `PostPresentation` / `PostOverride`. Relay-native posts: append `PostVersion`. The model never chooses a table. |
| **Plan a release** | “One page a week on X, skip pages already posted there” | Schedule + distribution plan objects. Analytics arrive as a prepared fact pack. Weak evidence is disclosed. No publish. |
| **Prepare destination drafts** | “Use the Patreon descriptions, keep them under the platform limit” | Destination variants / Autopost drafts. Existing creator text is adapted; story is not invented. No publish. |
| **Undo** | “Undo that” | ChangeSet rollback to the captured before-state. Source content and unrelated work stay intact. |

## Semantics vs mechanics

Relay **may** diagnose mechanics:

- import failed;
- requested sequence has a missing or duplicate number;
- two selected records share the same exact source revision;
- a scheduled item lacks public-safe media;
- a change would expose gated originals;
- a source changed after approval;
- a destination connection expired;
- the same command was already applied.

Relay **must not** invent creative ontology:

- which unrelated works “seem” to belong together;
- which upload is the “better” aesthetic original;
- which pieces deserve featuring;
- how an archive “ought” to be organized;
- whether an apparent duplicate is artist-intentional, except when the artist asked Relay to compare **already selected** records.

Unsolicited cleanup, similarity clustering, and “you should tidy your library” chores are out of scope.

## Write-layer ownership

| Origin | Canonical truth | Command writes |
|---|---|---|
| Patreon / SubscribeStar ingest | Append-only `PostVersion` from sync | Presentation overlay, overrides, collections, layout, distribution variants |
| Relay-native posts | `Post.source = RELAY` + `PostVersion` history | Append a new `PostVersion` (optimistic concurrency). Do not treat presentation as the native edit path. |
| Collections / layout | Relay-owned | Collection and layout services |
| Schedule / distribution | Relay-owned plans, variants, rail events | Plan and draft objects only until a human publishes |
| CreativeWork / linked sets | Analytics grouping | Not a second post copy; command organization uses Collections unless the artist explicitly asks to link a set |

An agent must never decide independently whether “change the title” means canonical history, site presentation, or all destinations.

## Risk-matched confirmation

| Class | Examples | UX |
|---|---|---|
| **Execute + Undo** | Create/reorder a collection, save a filter, produce a draft plan, add schedule placeholders, generate previews | The original sentence is authorization. Show a concise result and Undo. |
| **Compact review** | Publish a gallery layout, change public visibility, replace a featured work, alter tier access, activate a recurring automation | One batch ChangeSet summary. Not twelve dialogs. |
| **Explicit publish confirm** | Publish to X / DeviantArt / Patreon, delete remote content, send messages, reveal gated media | Existing human-confirmed handoff. Command Layer never auto-publishes. |

## ChangeSet

Every compound command produces a version-pinned ChangeSet:

- original instruction;
- resolved target IDs (snapshot, not a live query at apply time);
- selection explanation the creator can inspect;
- before / after state;
- expected revisions;
- proposed operations with risk class;
- access implications;
- schedule implications;
- idempotency key;
- undo data;
- expiry / stale-revision checks.

Lifecycle: `draft → validated → preview_ready → apply_requested → applied | failed | undone`.

Safe organization may skip the visible preview step and still persist a ChangeSet so Undo works.

## Natural-language bounds

- The model calls **typed capabilities**. It does not generate SQL, Prisma queries, or raw HTTP against undocumented routes.
- Search results returned to a model are **compact**: ids, titles, tags, dates, visibility, page-number parse, destination flags — not media bytes, patron PII, or OAuth material.
- Ambiguity produces **one** question. If two series match “Academy,” ask which. Do not silently pick.
- Weak analytics produce a disclosed fallback (for example Tuesday evening), never invented precision.
- Repeated identical commands are idempotent: no duplicate collections or schedule rows.

## Multi-lens Studio

The Library remains the source of truth. Studio may present **lenses** over the same IDs:

- **Chronological** — already supported Active Posts / gallery feed.
- **Collections** — curated stacks the artist named.
- **Posting schedule** — rail / planned release view of the same posts.

These are presentation settings, analogous to saved seat positions, not separate inventories. Phase 2–3 land provisional lens capacity in Lab 2. Phase 4 may persist a preset only after the human playground proves it is useful. Do not freeze exactly three permanent tabs in this contract.

## Auth, tenancy, and data minimization

- Creator scope is `Account.primaryRelayCreatorId`.
- MCP / command grants are a **distinct, scoped, revocable** credential. Do not reuse web or extension sessions as unconstrained MCP tokens.
- Default grant is read + propose. Apply requires matching scope. Publish remains a separate, existing confirmation path and is out of Phases 1–4 apply tools.
- Tool results never include OAuth payloads, patron rosters/emails, raw premium media, or unsigned upload URLs.
- Cross-creator reads and writes fail closed before content is returned.

## Feature flags

All Command Layer side effects default off:

- `RELAY_COMMAND_LAYER_ENABLED` — capability HTTP/MCP host
- `RELAY_COMMAND_APPLY_ENABLED` — apply path (preview may exist without this)
- `RELAY_COMMAND_MCP_ENABLED` — MCP transport
- `RELAY_COMMAND_STUDIO_UX_ENABLED` — production Studio command chrome
- `RELAY_ALLOW_STUDIO_LAB2_SEED` — corpus seed/cleanup (never in production)

## Explicitly deferred

- Autonomous or dark publishing
- Unsolicited similarity / cleanup suggestions
- Arbitrary user-defined content types and page builders
- Profile / bio / presence mutation across destinations
- Patron PII tools
- Recurring automations as a Command Layer preset (reuse Automations; [`EXPANSION-GONOGO.md`](EXPANSION-GONOGO.md) 2026-08-29: **defer**)
- Goal Cycle planner replacement
- Escape Hatch site CMS control
- Strapi or any second content database
- Reconstructing the missing `.docs/anthropic/` tree

## Relationship to existing programs

| Program | Relationship |
|---|---|
| Library / Gallery | Source of truth. Command Layer mutates it through existing overlay and collection services. |
| Studio renovation | Visual/rail spine. Command Layer consumes Active Posts, Collections, and the rail; it does not reopen Phases 0–6. |
| Goal Cycle | Bounded Coach planning remains. Command Layer is artist-directed organization and scheduling, not a second planner. |
| Automations | Recurring composition chassis. Out of POC apply tools. |
| Escape Hatch | Separate generated-site CMS. Not this program. |
| Direct-source / Relay Master | Distribution anchors stay as documented in `docs/architecture/RELAY_MASTER_LINEAGE.md`. |
