# Relay Command Layer — Traceability

This map connects each dream-flow step to one implementation owner, canonical contracts, tests, and a smallest reopen target. Detailed scenarios live in [`../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md`](../../qa/RELAY_COMMAND_DREAM_FLOW_ACCEPTANCE.md). Lab 2 corpus rules live in [`LAB2-TEST-GROUND-CONTRACT.md`](LAB2-TEST-GROUND-CONTRACT.md). Lab 3 conversational playground: [`LAB3-TEST-GROUND-CONTRACT.md`](LAB3-TEST-GROUND-CONTRACT.md). Conversation lock: [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md). Playground chrome to fulfill lives in [`UI-DEBT.md`](UI-DEBT.md).

Status changes still require Delta Out in the owning phase file and the row in [`00-README.md`](00-README.md).

## Acceptance ownership

| ID | Dream step | Primary owner | Supporting | Contract | Exit evidence |
|---|---|---|---|---|---|
| RC-DF-01 | Enter Lab 2 playground | P2 | P1 flags | Lab 2 contract: seed + route | Seeded creator opens `/studio/lab2`; ≥100 posts visible with Load more |
| RC-DF-02 | Type a command | P3 | P4 productizes | Product: primary experience | Plain harness accepts a sentence; no MCP setup required |
| RC-DF-03 | Clarification only when necessary | P3 | P1 selection grammar | Product: NL bounds | Ambiguous “Academy” asks once; exact “Hero Academy” does not |
| RC-DF-04 | Visible collection organization | P2 | P3/P4 | Product: five capabilities | Labels, stacks, order visible; survive refresh |
| RC-DF-05 | Numbered series + naming variants | P1 parse / P2 apply | P3 eval | Lab 2: Hero Academy pages | Page/Part/Pg variants sort numerically, not lexicographically |
| RC-DF-06 | Missing / duplicate page report | P1 parse / P2 apply | P3 | Product: mechanics vs ontology | Gap and duplicate called out; no invented page |
| RC-DF-07 | Exclude already-posted | P2 | P3 | Lab 2: distribution profiles | X plan skips seeded present pages. Month-ahead calendar inspect is RC-UI-02, not this row |
| RC-DF-08 | Analytics-informed schedule | P2 fact pack / P3 | P4 | Product: fact packs | Weak evidence disclosed; fallback window used when required |
| RC-DF-09 | Destination drafts without publish | P2 | P3/P4 | Product: no autonomous publish | Drafts/variants exist; `publishState` unchanged; no attempts completed |
| RC-DF-10 | Imported vs native write layers | P1 facade / P2 tests | P3 eval | Product: write-layer ownership | Patreon title → presentation; native title → new `PostVersion` |
| RC-DF-11 | Gated media refusal | P2 | P3 | Product: risk classes | Command to expose originals is refused or public-cover-only |
| RC-DF-12 | Idempotency | P1 store / P2 apply | P3 retry eval | ChangeSet idempotency key | Second identical command creates no duplicate rows |
| RC-DF-13 | Undo | P2 | P3/P4 | ChangeSet undo | Gallery and rail restore; source posts intact |
| RC-DF-14 | Multi-lens views | P2 capacity / P4 chrome | P3 harness uses lenses | Product: multi-lens Studio | Same post IDs in chrono, Collections, schedule; chrome not frozen in P2 |
| RC-DF-15 | Cross-tenant isolation | P1 guards / P3 MCP | P2 seed isolation | Auth contract | Foreign creator tools/HTTP return 403/empty; no corpus leakage |
| RC-DF-16 | Five-minute creator journey | P4 | P2–P3 | Product: primary experience | HUMAN-UX-JOURNEY script passes |
| RC-DF-17 | Persistence after refresh | P2 apply / P4 | P3 | ChangeSet applied state | Hard refresh keeps collection order and rail slices |
| RC-CX-01 | Full-corpus selection completeness | P5 | Gallery bounded reads | Conversation: selection authority | Snapshot `complete=true`; IDs match visible effective metadata; no silent partial scan |
| RC-CX-02 | Lab 3 data-plane alignment | P5 | Lab 3 contract | Lab 3 test ground | Interpret/apply target the logged-in creator, not Lab 2 JSON, on `/studio/lab3` |
| RC-CX-03 | Selection review + freeze | P6 | P5 snapshot | Conversation: stage gates | Tile grid, exclusions, already-posted warning; Approve freezes IDs; gallery not mutated |
| RC-CX-04 | Active proposal continuity | P6 / P9 | P7 patches | Conversation: continuity | Follow-ups edit the open proposal; not full-session chat |
| RC-CX-05 | Live paraphrase → same query | P7 | P5 resolver | Conversation: planner | Held-out phrases hit expected `CommandSelectionQuery`; one clarification max |
| RC-CX-06 | Planner safety | P7 | P3 redact / allowlist | Conversation: never | Publish, other creators, gated media, SQL, write-layer choice all refused |
| RC-CX-07 | Durable ChangeSet / Undo | P8 | P2 engine | Product: ChangeSet | Proposal, apply, undo survive API restart; MCP apply uses DB engine |
| RC-CX-08 | Finite weekly-drop plan | P9 | P5 snapshot + P8 compiler | Conversation: stage machine | Chat + drag share `ProposalPatch`; no rail rows until one plan approval |
| RC-CX-09 | Due handoff without publish | P10 | Existing extension / distribution | Product: no autonomous publish | Reminder → preload/fill → artist Post; missed toast recoverable on rail |

## Work-item index

| ID | Phase file | Title |
|---|---|---|
| RC-P1-T01 | [`01-PHASE-1-CONTENT-FOUNDATION.md`](01-PHASE-1-CONTENT-FOUNDATION.md) | Characterize the existing spine |
| RC-P1-T02 | 01 | Freeze shared wire, errors, fact-pack shape |
| RC-P1-T03 | 01 | Selection grammar |
| RC-P1-T04 | 01 | Numbered sequence extraction |
| RC-P1-T05 | 01 | Write-layer router |
| RC-P1-T06 | 01 | ChangeSet types and preview-only stub |
| RC-P1-T07 | 01 | Idempotency and creator context |
| RC-P1-T08 | 01 | Tenant + flag + draft-gap note |
| RC-P2-T01 | [`02-PHASE-2-DETERMINISTIC-PLAYGROUND.md`](02-PHASE-2-DETERMINISTIC-PLAYGROUND.md) | Corpus JSON + validator |
| RC-P2-T02 | 02 | Seed apply / status / cleanup |
| RC-P2-T03 | 02 | Eval command |
| RC-P2-T04 | 02 | Live search + sequence |
| RC-P2-T05 | 02 | Collection create/order apply |
| RC-P2-T06 | 02 | Shared projection + Lab 2 pagination |
| RC-P2-T07 | 02 | Provisional lens switcher |
| RC-P2-T08 | 02 | ChangeSet apply, schedule drafts, undo |
| RC-P2-T09 | 02 | Flag-gated HTTP + HUMAN-UX-VISUAL |
| RC-P3-T01 | [`03-PHASE-3-MCP-MODEL-EVALUATION.md`](03-PHASE-3-MCP-MODEL-EVALUATION.md) | MCP adapter over facade |
| RC-P3-T02 | 03 | Scoped grants and audit |
| RC-P3-T03 | 03 | Compact I/O and safety filters |
| RC-P3-T04 | 03 | Eval corpus |
| RC-P3-T05 | 03 | Optional live model trials |
| RC-P3-T06 | 03 | Lab 2 command harness UX |
| RC-P3-T07 | 03 | Seed, restart, HUMAN-UX-NL |
| RC-P4-T01 | [`04-PHASE-4-STUDIO-COMMAND-UX.md`](04-PHASE-4-STUDIO-COMMAND-UX.md) | Product CommandBox states |
| RC-P4-T02 | 04 | Lens refinement |
| RC-P4-T03 | 04 | Flag and production-safe defaults |
| RC-P4-T04 | 04 | Five-minute journey wiring |
| RC-P4-T05 | 04 | Expansion go/no-go |
| RC-P5-T01 | [`05-PHASE-5-SELECTION-TRUTH.md`](05-PHASE-5-SELECTION-TRUTH.md) | Lab 3 interpret/apply data plane |
| RC-P5-T02 | 05 | Effective-metadata command loader |
| RC-P5-T03 | 05 | Bounded boolean selection AST + missing predicates |
| RC-P5-T04 | 05 | Complete `ResolvedSelection` snapshot |
| RC-P5-T05 | 05 | Completeness/perf probe; indexes only if measured |
| RC-P5-T06 | 05 | Parity, tenant, stale, facade-eval tests |
| RC-P6-T01 | [`06-PHASE-6-SELECTION-WORKBENCH.md`](06-PHASE-6-SELECTION-WORKBENCH.md) | Proposal types + preview HTTP (no apply) |
| RC-P6-T02 | 06 | Lab 3 tile review overlay |
| RC-P6-T03 | 06 | Exclude / restore / freeze snapshot |
| RC-P6-T04 | 06 | CommandBox states + HUMAN-UX-SELECTION evidence |
| RC-P7-T01 | [`07-PHASE-7-SEMANTIC-PLANNER.md`](07-PHASE-7-SEMANTIC-PLANNER.md) | AI structured-output / tool-call types |
| RC-P7-T02 | 07 | `CommandSemanticPlanner` selection-only |
| RC-P7-T03 | 07 | Fixture fallback + compact context |
| RC-P7-T04 | 07 | `--live-model` eval + held-out safety |
| RC-P7-T05 | 07 | HUMAN-UX-NL-LIVE |
| RC-P8-T01 | [`08-PHASE-8-SAFE-OPERATIONS.md`](08-PHASE-8-SAFE-OPERATIONS.md) | Operation compiler (no model write-layer) |
| RC-P8-T02 | 08 | Collection / tag / revise / saved-filter ops |
| RC-P8-T03 | 08 | Unify MCP apply with DB ChangeSet engine |
| RC-P8-T04 | 08 | Persist proposal / ChangeSet / undo (HUMAN-MIGRATE hosted) |
| RC-P8-T05 | 08 | Idempotency + restart Undo tests |
| RC-P9-T01 | [`09-PHASE-9-SCHEDULE-WORKBENCH.md`](09-PHASE-9-SCHEDULE-WORKBENCH.md) | Creator-TZ finite plan compiler |
| RC-P9-T02 | 09 | `ProposalPatch` API (chat + drag) |
| RC-P9-T03 | 09 | Lab 3 calendar squash + occupancy |
| RC-P9-T04 | 09 | Final plan approval (events + drafts, no rail during shaping) |
| RC-P9-T05 | 09 | HUMAN-UX-PLAN |
| RC-P10-T01 | [`10-PHASE-10-HANDOFF-AND-ROLLOUT.md`](10-PHASE-10-HANDOFF-AND-ROLLOUT.md) | Draft → existing distribution plan bridge |
| RC-P10-T02 | 10 | Existing reminder packet only |
| RC-P10-T03 | 10 | Stubbed due → fill → confirm journey |
| RC-P10-T04 | 10 | Flag matrix + evidence |
| RC-P10-T05 | 10 | Production mount only after HUMAN-FLAG |

First unblocked implementation batch: **RC-P9-T05** (HUMAN-UX-PLAN). P8 is Done. P9 T01–T04 landed (compiler, ProposalPatch, Lab 3 calendar squash, final plan apply). Do not start P10.

## Contract ownership

| Contract | Owner | Consumers |
|---|---|---|
| Selection grammar + number extraction | P1 | P2 apply, P3 tools, eval corpus |
| ChangeSet envelope + lifecycle | P1 | P2 engine, P3 MCP, P4 confirm UI |
| Write-layer router (imported vs native vs collection vs plan) | P1 | P2, P3 eval RC-DF-10 |
| Analytics fact pack | P1 shape / P2 bind to corpus | P3 timing scenarios |
| MCP tool schemas + scopes | P3 | P4 optional external client |
| Lab 2 corpus JSON + eval block | P2 | P3 expected IDs, RC-DF matrix |
| Studio content projection + lenses | P2 | P3 harness, P4 switcher. Chrome density + month grid: [`UI-DEBT.md`](UI-DEBT.md) |
| Command HTTP / Studio chrome | P4 | RC-DF-16 |
| Feature flags | P1 defaults / P10 matrix | all later phases |
| Conversation stage machine + active proposal | P5–P6 types; P9 patches | P7 planner |
| Lab 3 data plane | P5 | P6–P9 UX |
| Semantic planner I/O | P7 | P9 patches (selection/plan only) |
| Durable proposal / ChangeSet / undo store | P8 | P9 apply, P10 handoff |
| Finite release plan compiler | P9 | P10 due path |
| Existing extension/distribution handoff | P10 (wire only) | Autopost / extension programs remain owners |

Downstream phases may extend responses only through an upstream-owned contract change and fixture update. They must not infer fields from Prisma models.

## Production file ownership

| Area | Owning phase |
|---|---|
| `src/studio/command/contracts.ts` *(future)* | P1 |
| ChangeSet engine, preview, apply, undo *(future)* | P2; types P1 |
| Capability facade over gallery/collections/presentation/native posts/schedule *(future)* | P1 extract + P2 implement |
| Durable idempotency store | P1 |
| `CommandAuditEvent` or equivalent *(future)* | P1 schema if needed; P3 writes MCP origin |
| Session kind / MCP consent *(future)* | P1 enum/types; P3 issuance |
| Lab 2 corpus JSON, validator, seed CLI *(future)* | P2 |
| Lab 2 lenses + shared projection *(future)* | P2 |
| Lab 2 command harness | P3 |
| MCP server adapter *(future)* | P3 |
| Eval corpus + runner *(future)* | P3 |
| Production Studio command box + lens switcher | P4 |
| Evidence files `docs/qa/RELAY_COMMAND_*_EVIDENCE.md` *(future)* | owning phase at gate |
| Command library loader / selection snapshot | P5 |
| Lab 3 selection review overlay | P6 |
| `CommandSemanticPlanner` + live-model eval | P7 |
| Durable proposal / ChangeSet / undo | P8 |
| Finite schedule workbench | P9 |
| Distribution/extension handoff wire + production mount | P10 |

## Requirement-to-test index

- Five capabilities exist as typed ops: P1 contract tests.
- Number parse (`Page 2`, `Part 2`, `Pg. 2`, `page 03`): P1 unit tests; P2 Hero Academy apply.
- Lexicographic sort forbidden for numbered series: P1 + P2.
- Collection membership + `sort_order` visible in Lab 2 Collections lens: P2 web + HUMAN-UX-VISUAL.
- Pagination >100 items: P2 seed eval + Lab 2 Load more / virtualizer.
- Direct-source / Master unchanged: P1 characterization; do not invent a third lineage.
- Draft HTTP vs service split (existing `DRAFT_NOT_SUPPORTED`): P1 documents and, if unblocking native revise, aligns HTTP with `create-relay-post.ts`.
- No `server.ts` auto-MCP: P3 adapter tests import facade only.
- Tool schema snapshots: P3.
- Eval paraphrases ≥3 per scenario: P3.
- Flags default off: P1 `.env.example`.
- Command vs Gallery ID parity (effective tags/titles): P5.
- Snapshot `complete=true` or fail closed: P5.
- Selection review does not mutate gallery: P6.
- Live-model forbidden ops 100%: P7.
- MCP apply writes Prisma via ChangeSet engine: P8.
- No rail rows during plan shaping: P9.
- Extension packet family unchanged: P10.

## Reopen map

| Failure | Smallest owner |
|---|---|
| Wrong posts selected | RC-P1-T03 selection grammar |
| Lexicographic page order | RC-P1-T04 number extraction |
| Wrote Patreon canonical instead of presentation | RC-P1-T05 write router |
| Duplicate collection on retry | RC-P1-T07 idempotency + RC-P2-T08 apply |
| Gallery did not visually stack | RC-P2-T06 projection + RC-P2-T07 Lab 2 lenses |
| Seed not resettable | RC-P2-T02/T03 CLI |
| Model invented a series | P3 eval + system prompt; reopen RC-P3-T04 corpus |
| Published without confirm | Treat as product-contract incident; reopen P2 draft path + P3 tool allowlist |
| Cross-tenant leak | RC-P1-T08 auth context + RC-P3-T02 scopes |
| Undo incomplete | RC-P2-T08 ChangeSet undo |
| Production Library broken by Lab 2 work | RC-P2 do-not-touch `GalleryView.tsx`; revert Lab 2-only files |
| Lab 3 interpret uses Lab 2 JSON IDs | RC-P5-T01 |
| Command tags miss overlay/presentation | RC-P5-T02 |
| Partial gallery page treated as full select | RC-P5-T04 |
| Selection modal missing already-posted | RC-P6-T02 |
| Follow-up starts a new proposal silently | RC-P6-T03 / RC-P9-T02 |
| Novel sentence fails closed after P7 | RC-P7-T02 + T04 corpus |
| Model chose presentation vs native | RC-P8-T01 compiler + P1 write router |
| Undo lost on API restart | RC-P8-T04 |
| Weekly dates hardcoded to Aug 2026 | RC-P9-T01 |
| Rail rows created while dragging | RC-P9-T04 |
| New extension packet invented | RC-P10-T02 |
| Production CommandBox mounted without HUMAN-FLAG | RC-P10-T05 |

## Human gates → evidence files *(future)*

| Gate | Evidence file to create at the gate |
|---|---|
| HUMAN-MIGRATE / HUMAN-SECURITY | `docs/qa/RELAY_COMMAND_P1_SECURITY_EVIDENCE.md` |
| HUMAN-UX-VISUAL | `docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md` |
| HUMAN-UX-NL | `docs/qa/RELAY_COMMAND_P3_NL_EVIDENCE.md` |
| HUMAN-UX-JOURNEY | `docs/qa/RELAY_COMMAND_P4_JOURNEY_EVIDENCE.md` |
| HUMAN-UX-SELECTION | `docs/qa/RELAY_COMMAND_P6_SELECTION_EVIDENCE.md` |
| HUMAN-UX-NL-LIVE | `docs/qa/RELAY_COMMAND_P7_NL_LIVE_EVIDENCE.md` |
| HUMAN-UX-PLAN | `docs/qa/RELAY_COMMAND_P9_PLAN_EVIDENCE.md` |
| P10 extension journey | `docs/qa/RELAY_COMMAND_P10_HANDOFF_EVIDENCE.md` |

Do not forge signatures. Builder prepares the file; human records pass/fail.

## Exit-gate chain

1. P1 Done → contracts, facade types, flags, idempotency interface, write router tests, no UX.
2. P2 Done + HUMAN-UX-VISUAL → seeded Lab 2, deterministic apply visible, undo, lenses present.
3. P3 Done + HUMAN-UX-NL → MCP + eval + plain harness on the same corpus.
4. P4 Done + HUMAN-UX-JOURNEY → production-shaped command UX flag-gated; expansion go/no-go written.
5. P5 Done → Lab 3/Lab 2 command IDs match visible effective metadata; snapshots complete.
6. P6 Done + HUMAN-UX-SELECTION → frozen visual selection; gallery not mutated.
7. P7 Done + HUMAN-UX-NL-LIVE → paraphrase-tolerant select; fixture eval still green; no writes from planner.
8. P8 Done → durable ops/Undo; hosted migrate still HUMAN-MIGRATE.
9. P9 Done + HUMAN-UX-PLAN → finite weekly-drop shaping then one approval.
10. P10 Done → existing handoff only; production mount waits HUMAN-FLAG.

## Non-goals trace (explicitly unowned)

| Behavior | Status |
|---|---|
| Unsolicited similarity / cleanup | Forbidden; no owner |
| Autonomous publish | Forbidden; existing Autopost/extension remain confirm-gated |
| Goal Cycle replacement | Unowned; do not edit that program |
| Automations presets via Command Layer | Deferred — [`EXPANSION-GONOGO.md`](EXPANSION-GONOGO.md) (2026-08-29; 2026-08-30 amendment: finite plans in P9, not recurrence) |
| Conversational replacement of one-touch UI | Forbidden; [`CONVERSATION-CONTRACT.md`](CONVERSATION-CONTRACT.md) |
| Embedding / similarity search | Forbidden as selection authority |
| Python NLP runtime | Forbidden |
| Escape Hatch CMS | Unowned |
| Strapi / second DB | Forbidden |
| `.docs/anthropic/` restore | Unowned |
| Airtable ledger rows for this program | Unowned (Git-only) |
| Exact three permanent Studio tabs | Unowned until P4 human findings |
