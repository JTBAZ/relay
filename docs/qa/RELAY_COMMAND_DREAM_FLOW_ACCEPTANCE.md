# Relay Command Layer — Dream Flow Acceptance

**Purpose:** Pass/fail contract for the Art Post Centralizer command experience  
**Product contract:** [`../studio/relay-command-mcp-build-plans/PRODUCT-CONTRACT.md`](../studio/relay-command-mcp-build-plans/PRODUCT-CONTRACT.md)  
**Program:** [`../studio/relay-command-mcp-build-plans/00-README.md`](../studio/relay-command-mcp-build-plans/00-README.md)  
**Lab 2 corpus:** [`../studio/relay-command-mcp-build-plans/LAB2-TEST-GROUND-CONTRACT.md`](../studio/relay-command-mcp-build-plans/LAB2-TEST-GROUND-CONTRACT.md)  
**Traceability:** [`../studio/relay-command-mcp-build-plans/TRACEABILITY.md`](../studio/relay-command-mcp-build-plans/TRACEABILITY.md)

These scenarios are numbered **RC-DF-01** through **RC-DF-17**. They are the acceptance language for Phases 1–4. A green database assertion without the named visible behavior is a **fail** for any UI-owning phase.

## Fixture persona

Use the dedicated Lab 2 creator (`rcx_studio_lab2`, `studio-lab2@relay.test`) with the `studio-lab2-corpus-v1` corpus:

- ~112 Postgres-backed published posts (more than one gallery page; server `limit` max is 100);
- Hero Academy with mixed `Page` / `Part` / `Pg.` / `P.` titles, missing page 17, duplicate page 8;
- Academy Studies (second “Academy” token);
- watercolor + landscape tagged standalones;
- public and gated posts (gated originals with public covers);
- Relay-native posts and imported Patreon-sourced posts;
- completed X publication history on Hero Academy pages 1–6;
- labeled synthetic analytics (`studio-lab2-corpus-v1`);
- empty command-created collections at baseline;
- Command Layer flags as specified by the owning phase (apply on for playground; production flags default off).

Do not run these scenarios against a personal Goals Lab account or `web/app/components/studio-lab2/fixtures.ts` thumbs.

## Timing expectations

| Step | Expectation |
|---|---|
| Open Lab 2 after seed | Grid populated without a dashboard tour or voice questionnaire |
| Deterministic apply (P2) | Collection stacks and labels visible without a full reload **or** after one documented refresh triggered by the client — not a manual SQL check |
| Natural-language round-trip (P3/P4) | Type → optional one clarification → preview/apply → visible reorganization in **under five minutes** for RC-DF-16 |
| Weak analytics | Fallback window shown immediately; no spinner that implies invented precision |
| Identical retry | Second submit returns the first ChangeSet / no new rows without a multi-second “working” duplicate |

If a model call is slow, the harness shows a loading state. Timeout/error is retryable. Do not block RC-DF-16 on vendor latency when the facade path already organized the gallery in P2.

## Dream UX steps

### RC-DF-01 — Enter Lab 2 playground

The creator signs in as Lab 2 and opens `/studio/lab2`. Chronological Active Posts show the seeded corpus. Pagination or Load more reveals posts beyond the first API page (≥100). The Schedule Rail stays mounted. Static fixture thumbs are not the data source.

**Fail:** empty demo tiles substituting for Postgres posts; fewer than 100 published posts; first page silently treated as the entire library; rail unmounted; seed bound to another creator.

### RC-DF-02 — Type a command

The creator types a natural-language direction into the Lab 2 harness (P3) or product CommandBox (P4). External MCP install is **not** required. The box is labelled, keyboard reachable, and does not publish on Enter without the documented confirm path for compact-review / publish-class ops. Organization-class work may apply with Undo after the sentence (product: execute + undo).

**Fail:** MCP onboarding as a prerequisite; unbounded chat transcript as the only UI; Enter publishes to X; no textbox on Lab 2 after P3 claims Done.

### RC-DF-03 — Clarification only when necessary

Exact “Hero Academy” (or a unique tag such as watercolor) proceeds without a question. Ambiguous “Academy” asks **once**, with candidate labels **Hero Academy** and **Academy Studies**. The creator’s answer persists through retry. A third required question does not appear.

**Fail:** silent pick of one Academy series; more than one stacked questionnaire; clarification when the instruction already uniquely resolves; inventing a third series name.

### RC-DF-04 — Visible collection organization

After apply, the gallery **physically rearranges**: a collection **label** is visible, member posts **stack** (or equivalent grouped chrome), and **order** is readable (cover first / newest-first as commanded). Switching to the Collections lens shows the same membership. JSON `collection_ids` without grouping is not enough.

**Fail:** tags or membership updated only in the database; sidebar filter with an unchanged ungrouped grid as the sole proof; CreativeWork linked-set mosaic used as a stand-in for a named Collection stack.

### RC-DF-05 — Numbered series and naming variants

Hero Academy titles `Page 2`, `Part 3`, `Pg. 4`, `P. 5`, and `page 06` sort **numerically** (2,3,4,5,6). `Page 10` appears after `Page 2`, not between `Page 1` and `Page 2`. Cover sorts before page 1.

**Fail:** lexicographic order; unparsed titles silently dropped; cover treated as page 0 in the middle of the sequence.

### RC-DF-06 — Missing and duplicate pages

Resolve/organize reports **missing page 17** and **duplicate page 8**. Relay does **not** invent a page 17 post, does not delete a duplicate unless the artist selected it, and does not guess which duplicate is “canonical.”

**Fail:** fabricated page 17; auto-merge/delete of the duplicate; gap ignored while claiming “complete series.”

### RC-DF-07 — Exclude already-posted destinations

A weekly X plan for Hero Academy **skips** pages 1–6 (`already_on_x_post_ids`). The ChangeSet lists skipped ids. Remaining pages become schedule drafts / rail slices only.

**Fail:** re-queue of already-present X posts as new publishes; completed distribution attempts created by Command Layer; skip list omitted so the creator cannot see why pages vanished from the plan.

### RC-DF-08 — Analytics-informed timing

The plan uses the Lab 2 **fact pack**. Tuesday-evening clustering may inform the window when evidence exists. Weak / ordinary coverage is **disclosed**. A fallback window is used rather than invented precision.

**Fail:** “best time is 7:03pm because the model said so” with no fact-pack citation; weak evidence rendered as high confidence; blocking the plan because metrics are synthetic/weak.

### RC-DF-09 — Destination drafts without publish

Prepare-destination-drafts / materialize-schedule creates unpublished plans, variants, Autopost drafts, and/or rail events. `publishState` of existing posts does not flip to published. No distribution attempt is marked completed. No extension auto-click.

**Fail:** Autonomous or dark publish; destination marked present solely from a command apply; patron-visible post created as published.

### RC-DF-10 — Imported vs native write layers

Renaming an imported Patreon Lab 2 post writes **presentation / override**, not a new canonical ingest version pretending to be Patreon. Renaming a Relay-native Lab 2 post **appends** `PostVersion`. Collection membership never chooses a write layer.

**Fail:** PATCH of ingest canonical as if it were Relay-native; native title change only in presentation while `PostVersion` stays stale; model/SQL picking the table.

### RC-DF-11 — Gated media refusal

A command that would expose gated originals (`sl2_gt_*`) as public destination media is refused (`COMMAND_GATED_MEDIA`) or constrained to the **public cover**. Tool/HTTP payloads do not include premium bytes or unsigned original URLs.

**Fail:** gated original URL in ChangeSet, MCP result, or draft package; silent widening of access.

### RC-DF-12 — Idempotency

Submitting the same instruction / idempotency key twice does not duplicate collections, membership rows, rail events, or drafts. The second call replays the first ChangeSet (`COMMAND_IDEMPOTENT_REPLAY` or equivalent).

**Fail:** “Hero Academy” collection created twice; doubled rail slices; different `change_set_id` with duplicate side effects.

### RC-DF-13 — Undo

Undo restores collection membership, order, and command-created rail/draft objects from the ChangeSet snapshot. Seeded ingest posts, tags, and unrelated work remain. After undo, Lab 2 looks like the pre-apply baseline for those ops.

**Fail:** undo deletes corpus posts; undo no-ops while UI claims success; partial undo (collection gone, rail slices left) reported as complete.

### RC-DF-14 — Multi-lens views

Chronological, Collections, and Posting Schedule lenses project the **same** `post_id`s. The rail stays mounted. P2 may ship provisional chrome; P4 refines from playground notes. Lenses are not three inventories.

**Fail:** copied post rows per lens; unmounted rail; freezing “exactly three tabs” as a P2 requirement; schedule lens that cannot show command-created slices.

### RC-DF-15 — Tenant and access safety

A session or MCP grant bound to another creator cannot list, preview, or apply against `rcx_studio_lab2`. Lab 2 tools cannot read other tenants. Missing prisma / missing account fails closed. Cross-creator IDs in a ChangeSet are rejected before writes.

**Fail:** 200 with another creator’s posts; seed cleanup wiping pilot-ux / Goals Lab rows; MCP grant reused from an unconstrained web/extension session.

### RC-DF-16 — Five-minute creator journey

On the seeded corpus, in one sitting (~five minutes, productized P4 box):

1. Organize the named comic **Hero Academy** by page, cover first.
2. See missing page 17 (and duplicate 8) reported — no invented page.
3. Watch the Collection **stack** form and reorder.
4. Exclude already-posted X pages from a weekly plan.
5. Create a metric-informed weekly X plan (weak evidence disclosed if applicable).
6. Inspect resulting schedule slices on the rail / schedule lens.
7. Revise one instruction (for example watercolor newest-first, or skip an extra page).
8. Refresh — organization and slices persist (RC-DF-17).
9. Undo.

No MCP install, no dashboard tour, no unbounded interview.

**Fail:** journey requires Cursor or an external MCP client; missing-page step skipped; stacks not visible; publish occurs; journey exceeds a reasonable five-minute organization path because of chores or questionnaires.

### RC-DF-17 — Persistence after refresh

Hard refresh of `/studio/lab2` keeps applied collection order and command-created rail slices until Undo. Client-only memory is not persistence.

**Fail:** refresh returns to ungrouped baseline while the database still has membership; or UI shows stacks that vanish because they were never written.

## Cross-cutting matrix

Every owning phase must cover applicable cases:

- creator/tenant isolation (RC-DF-15);
- keyboard-only submit, clarification, confirm, undo;
- screen-reader names on the command box and lens control;
- reduced motion;
- Lab 2 with rail mounted (wide); P4 notes narrow (~390px) command-box usability;
- loading, empty (flags off), retryable, permanent-failure, stale ChangeSet;
- AI/model malformed, timeout, and skip (`--facade-only`) in P3;
- weak / ordinary / clustered synthetic analytics — never “unavailable rendered as zero precision”;
- duplicate mutation and identical retry (RC-DF-12);
- UTC timestamps in corpus and schedule slices;
- gated vs public media (RC-DF-11);
- write-layer routing (RC-DF-10);
- structured logs / tool audit without prompts, provider text, tokens, private URLs, or patron identity;
- feature flags default off outside the playground recipe.

## Required automated gates

Worker docs name focused commands. Phase exits should run the repository-supported equivalents of:

```bash
npx vitest run tests/studio/command/contracts.test.ts
npx vitest run tests/studio/lab2/corpus-spec.test.ts
npm run typecheck
```

When `DATABASE_URL` and `RELAY_ALLOW_STUDIO_LAB2_SEED=1` are available:

```bash
npm run seed:studio-lab2 -- apply
npm run eval:studio-lab2-corpus
npx vitest run tests/studio/lab2/seed-eval.integration.test.ts
```

P3 additionally:

```bash
npm run eval:relay-command -- --facade-only
```

Live model trials are optional and must not be faked. Hosted migrate / RLS remain human gates.

## Browser acceptance

Run the Lab 2 scripts in [`LAB2-TEST-GROUND-CONTRACT.md`](../studio/relay-command-mcp-build-plans/LAB2-TEST-GROUND-CONTRACT.md):

- Script A → HUMAN-UX-VISUAL (`docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md`)
- Script B → HUMAN-UX-NL (`docs/qa/RELAY_COMMAND_P3_NL_EVIDENCE.md`)
- Script C → HUMAN-UX-JOURNEY (`docs/qa/RELAY_COMMAND_P4_JOURNEY_EVIDENCE.md`)

Capture: fixture hash, ChangeSet ids, screenshots of stacks/labels/rail, skip list for already-on-X, undo after-state, accessibility notes.

If OAuth, credentials, or a hosted DB gate is unavailable, stop once, record the exact blocker, and do not substitute fabricated success.

## Failure ownership

A failure reopens the smallest owner in [`TRACEABILITY.md`](../studio/relay-command-mcp-build-plans/TRACEABILITY.md). Record expected versus actual, reproduction, logs, and the owning todo id (for example `RC-P1-T04`, `RC-P2-T06`). Do not silently add unsolicited curation, publish tools, or a second inventory to “make the demo work.”
