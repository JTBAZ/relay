# Relay Command Layer — Conversational expansion contract

**Status:** Frozen for Phases 5–10  
**Program hub:** [`00-README.md`](00-README.md)  
**P1–P4 product lock (unchanged):** [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md)  
**Lab 3 playground:** [`LAB3-TEST-GROUND-CONTRACT.md`](LAB3-TEST-GROUND-CONTRACT.md)  
**Lab 2 eval corpus (immutable):** [`LAB2-TEST-GROUND-CONTRACT.md`](LAB2-TEST-GROUND-CONTRACT.md)  
**Expansion go/no-go:** [`EXPANSION-GONOGO.md`](EXPANSION-GONOGO.md)

This contract is the product lock for conversational mediation. It does **not** reopen P1–P4. If implementation contradicts this file or [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md), stop with evidence; do not redesign the product in a batch.

P1–P4 proved typed capabilities, ChangeSets, Lab 2 fixture NL, and a five-minute fixture journey. They did **not** prove paraphrase-tolerant natural language. Fixture match remains the CI golden path. Conversational NL is P7, after selection truth (P5) and the selection workbench (P6).

## Governing sentence (unchanged)

> The artist supplies the meaning. Relay supplies the mechanics.

## What this expansion is

An artist opens Studio Command on Lab 3 and types a direction they already know, for example: *Make a plan to post my Hero Academy series from Patreon to Twitter in a series of weekly drops.*

Relay:

1. Interprets that sentence as **tags, keywords, and operators** — not as aesthetic judgment.
2. Opens a **selection review** (tile grid) of the matching posts. The artist excludes false positives and confirms already-posted warnings.
3. After **one** selection approval, keeps that frozen set as the **active proposal**.
4. Shows a plan (cadence, order, destination) and lets the artist **chat or drag/drop** until the plan is right.
5. On **one** schedule approval, writes finite rail events and destination drafts. It never publishes.
6. When a drop is due, the existing extension reminder delivers a preloaded packet. The artist clicks **Post**.

## Continuity and confirmation (human-locked 2026-08-30)

| Decision | Lock |
|---|---|
| Conversational continuity | **Bounded active proposal.** Follow-ups such as “exclude page 8” or “make it Saturdays” edit the open proposal until the artist approves or cancels it. Not a general Studio-session memory. Not single-turn-only inside a modal. |
| Preview / approval cadence | **Stage gates.** Confirm the matched pieces once. Then chat and drag/drop may reshape the live plan without a fresh modal after every tweak. **One** final schedule approval. External posting always remains an explicit existing handoff. |

Do not require a new selection review after every reversible plan edit. Do not auto-apply reversible gallery or schedule writes during shaping.

## Technology lock

**Adopt:** hosted LLM through Relay’s existing `src/ai/` provider layer, with **Anthropic as the first implementation**, as an **untrusted semantic planner**. Deterministic TypeScript services remain the authority for ID resolution, match evidence, write-layer routing, recurrence math, ChangeSet apply, and risk.

**Reject for this program:**

- Python NLP / a second runtime that duplicates `src/studio/command/` contracts.
- Local/small-model inference in the Node/Coolify image.
- Embedding / visual-similarity search as the selection authority.
- Expanding the exact-match phrase table as the long-term NL engine.
- MCP as the in-product planner transport (MCP remains an optional peer on the same facade; the in-product planner calls the facade in-process).

The model **may**: map a sentence to a validated selection intent or a bounded `ProposalPatch`; ask **one** focused clarification when deterministic code returns `COMMAND_AMBIGUOUS` (or equivalent).

The model **must not**: pick database rows by intuition; emit SQL/Prisma/raw HTTP; choose write tables; invent missing pages; calculate recurrence; apply ChangeSets; expose gated originals; dump the Library, media bytes, URLs, PII, OAuth, or raw analytics into context; publish.

Planner output is untrusted until it passes `validateCommandSelectionQuery` / ChangeSet validators, `previewChangeSet`, and the capability facade — the same boundary MCP already uses.

## Stage machine

```text
idle
  → interpreting
  → clarification? (at most one)
  → selection_review        (P6; gallery not mutated)
  → selection_approved      (frozen snapshot; active proposal)
  → plan_shaping            (P9; chat + drag/drop; no rail rows yet)
  → plan_approved           (P8/P9; durable ChangeSet: events + drafts)
  → due_handoff             (P10; existing reminder + fill + human Post)
```

Cancel at any stage clears the active proposal. A new instruction that is not a patch to the open proposal replaces it only after the artist confirms discard, or if no proposal is open.

## Capability matrix

### Conversational (multi-item; deterministic services exist)

- Select by explicit tags, title/description terms, source, date, visibility, collection, media type, sequence label/number, destination-present/absent.
- Explain matches; flag gaps, duplicates, already-posted items; exclude false positives; save a useful filter; Undo.
- Create/update/reorder collections; explicit tag add/remove; correct-layer title/description revisions; finite release plans; schedule placeholders; destination drafts.
- Open the existing distribution review/handoff when due.

### Keep as direct UI (do not replace with chat)

Simple search, navigation, choosing a **single visible** object, toggles, one-touch tools that are already easy and present. Conversational mediation is for **set-scale** work the artist would otherwise do by hunting through hundreds of tiles.

### Never conversational apply

Ingestion/import, autonomous aesthetic grouping, destructive deletion, account/OAuth/billing, gated-media exposure, external publish. Public visibility, access/tier changes, and recurring automation activation remain separately reviewed if later exposed; they are not P5–P10 apply tools.

## Risk-matched confirmation (expansion)

| Class | Examples | UX |
|---|---|---|
| **Selection review** | Multi-item smart select | Tile grid + exclusions + already-posted warnings. Approve freezes IDs. |
| **Plan shaping** | Cadence, weekday, start date, drag to another day | Live proposal. No rail writes. |
| **Execute + Undo** | Collection/tag/revise; finite schedule placeholders and drafts **after** plan approval | Durable ChangeSet. Undo restores before-state. |
| **Compact review** | Public visibility, tier access, gallery layout publish, activate recurring automation | Out of P5–P10 apply. Existing compact review if a later program owns them. |
| **Explicit publish confirm** | X / Patreon / etc. | Existing Autopost / extension handoff only. Command Layer never auto-publishes. |

## Flags (all default off; P10 names the matrix)

Existing:

- `RELAY_COMMAND_LAYER_ENABLED`
- `RELAY_COMMAND_APPLY_ENABLED`
- `RELAY_COMMAND_MCP_ENABLED`
- `RELAY_COMMAND_STUDIO_UX_ENABLED`
- `RELAY_ALLOW_STUDIO_LAB2_SEED`

Expansion (names frozen here; readers land in P5/P7/P10; still default off):

- `RELAY_COMMAND_PLANNER_ENABLED` — hosted planner on interpret (P7)
- `RELAY_COMMAND_EVAL_MODEL` — live-model eval runner only (P7)
- `RELAY_COMMAND_SELECTION_UX_ENABLED` — Lab 3 selection review chrome (P6)
- `RELAY_COMMAND_SCHEDULE_PLAN_ENABLED` — Lab 3 plan shaping + calendar squash (P9)

Production `/studio` CommandBox still requires `RELAY_COMMAND_STUDIO_UX_ENABLED` + **HUMAN-FLAG**. Lab 3 may mount conversational chrome under Lab 3 floorspace without that production flag.

## Quantified gates (do not lower to force launch)

| Gate | Threshold |
|---|---|
| Safety | 100% reject publish, cross-creator, gated-media, raw-database, silent-ambiguity; zero model-selected write layers |
| Selection authority | 100% exact IDs/order on deterministic fixtures; every accepted snapshot `complete=true`; no silent partial scans |
| Planner (P7) | ≥95% exact intent/query match on held-out phrases (3 runs each); 100% valid schema after one retry; no high-severity safety miss |
| Latency | Deterministic selection p95 within existing warm gallery budget; conversational preview p95 target under 4s with progress + fixture/manual fallback |
| Reliability | Idempotent retries create no duplicate collection, event, draft, plan, or attempt; proposal and Undo survive API restart |

## Playgrounds

| Surface | Role |
|---|---|
| `/studio/lab2` | Immutable deterministic + fixture-eval corpus (`rcx_studio_lab2`). Keep `--facade-only` green every batch. |
| `/studio/lab3` | Conversational playground on a **production-shaped** creator (Dev Ava / studio session). Must read and act on the **same** corpus. |
| Production `/studio` | Deferred until P10 + HUMAN-FLAG. |

## Explicitly still never / deferred

Unchanged from [`PRODUCT-CONTRACT.md`](PRODUCT-CONTRACT.md) and [`EXPANSION-GONOGO.md`](EXPANSION-GONOGO.md): autonomous publish, unsolicited similarity, Goal Cycle replacement, Escape Hatch CMS, Strapi, Airtable as execution truth, reconstructing `.docs/anthropic/`. Recurring automations stay in the Automations program — Command Layer may create **finite** plans only.

## Builder

Cursor Grok 4.6 X-High is the sole approved implementation builder. Git-only control plane. Claim P5–P10 in dependency order; stop at named human gates.
