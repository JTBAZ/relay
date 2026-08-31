# Phase 3 — MCP adapter and model evaluation

## Outcome

Expose the **same** P2 capability facade through a thin MCP server and a **deliberately plain** Lab 2 command harness. Run a versioned eval corpus against the Lab 2 dataset (paraphrases, retries, safety). Stop for **HUMAN-UX-NL**: a human types natural language, confirms or clarifies, and watches the gallery and schedule move.

## Scope

In:

- MCP Streamable HTTP (or stdio for local) adapter calling `src/studio/command` only.
- Scoped command grants (`SessionKind` mcp or documented equivalent from P1).
- Tool schemas generated from P1 contracts; snapshot tests.
- Compact tool I/O (no media bytes, no OAuth, no patron PII).
- Eval corpus JSON + runner (repeat N trials; expected ids/order/state).
- Lab 2 command box: textarea, optional one clarification, preview/apply, Undo, visible grid/rail update.
- Failure-to-regression policy: every eval miss becomes a fixture.

Out:

- Production Library command chrome (P4).
- Choosing the production LLM vendor (HUMAN-CREDENTIALS / HUMAN-FLAG).
- Autonomous publish tools.
- Unbounded chat / Goal Cycle replacement.
- Requiring creators to install Cursor to get value (harness is in-product).

## Dependencies and permitted parallel work

Depends on **P2 Done** and **HUMAN-UX-VISUAL pass**. Eval YAML may be drafted from Lab 2 `eval` expected IDs in parallel with MCP transport once P2 hash is stable. Do not run live model trials against an unseeded DB.

P3 must not restyle Lab 2 into a finished product. Ugly-but-clear harness is a feature.

## Required reading

1. This program’s product contract, P1/P2 plans, Lab 2 contract, RC-DF-02/03/11/12/15
2. P2 ChangeSet engine and facade entrypoints *(implemented)*
3. `src/identity/identity-service.ts` extension consent (pattern to tighten, not reuse unconstrained)
4. `src/goal-cycle/planner/planner-prompts.ts` (how Relay already isolates evidence from instructions)
5. `docs/qa/HTTP_VERB_HYGIENE.md`

MCP protocol notes for implementers: tools are the P1 capability names. Transport is an adapter. Do not take Strapi MCP as the product model; steal only “schema-discovered tools + permission gating.”

## Locked contracts

**Tools exposed in v1 MCP**

Read: `search_library`, `resolve_numbered_sequence`, `preview_collection`, `preview_post_revision`, `preview_release_plan`, `preview_change_set`  
Write (require `command:apply` + `RELAY_COMMAND_APPLY_ENABLED`): `create_or_update_collection`, `set_collection_order`, `revise_post`, `create_release_plan`, `materialize_schedule`, `prepare_destination_drafts`, `apply_change_set`, `undo_change_set`

Never: SQL, Prisma, export zip, media byte fetch, patron search, OAuth, `publish_external`.

**Grants**

- Distinct kind from `web` / `extension`
- Default scopes read + preview
- Apply requires extra scope
- TTL shorter than extension (≤ 7d recommended)
- Hashed at rest; revocable; labeled client
- Lab 2 harness may use the existing **web** studio session internally (not MCP) so the human test does not depend on OAuth client registration. MCP path is additional.

**Eval**

- Each scenario: `id`, `instruction`, `paraphrases[]` (≥3), `expected_post_ids`, `expected_order`, `expected_clarification` (bool + candidate labels), `forbidden_ops`, `expected_write_layer`, `expected_db_assertions`
- Repeat ≥3 trials per paraphrase for model runs; deterministic facade tests run once.
- Model optional: runner must support `--facade-only` (no LLM) using a fixture interpreter **or** skip model section when keys absent and still pass facade-expected IDs.

**Harness loop (visible)**

1. Type directions into the box  
2. Confirm or add clarifications if necessary (one question)  
3. See the gallery physically rearrange in Lab 2; labels; stacks; rail slices  

## Files

Create *(future)*:

- `docs/qa/RELAY_COMMAND_P3_NL_EVIDENCE.md` template

Created:

- `src/studio/command/mcp/` (T01–T03)
- `tests/fixtures/relay-command-eval/corpus.json`
- `src/studio/eval/command-eval-runner.ts`
- `src/studio/eval/command-harness-interpret.ts`
- `scripts/eval-relay-command.mjs`
- `tests/studio/command/mcp-tools.test.ts`
- `tests/studio/eval/command-eval-facade.test.ts`
- `web/app/components/studio-lab2/Lab2CommandHarness.tsx`
- `tests/web/lab2-command-harness.test.tsx`

Edit:

- `StudioLab2Chassis.tsx` — mount harness (does not replace Active Posts)
- `.env.example` — `RELAY_COMMAND_MCP_ENABLED`, model key **names** only
- `src/server.ts` — register MCP HTTP route and consent routes (serialized hot file)

Do not touch:

- `GalleryView.tsx`
- Eval that mutates production creators
- Goal Cycle planner prompts except as a **read** reference

## Todo work items

### RC-P3-T01 — MCP adapter over facade

1. Map tools 1:1 to facade methods. JSON Schema from contracts.
2. Snapshot schemas in tests. Adding a tool requires contract change.
3. Stateless request auth: bearer command grant **or** documented lab bypass never enabled in production.

Acceptance: unit tests invoke facade mocks; no `src/server.ts` route enumeration as tools.

### RC-P3-T02 — Scoped grants and audit

1. Issue/revoke/list grants for the lab creator in dev.
2. Scope filter hides write tools when grant is read-only.
3. Audit each invocation: account, creator, tool, input hash, change_set_id, outcome, trace_id, origin=`mcp`|`harness`.
4. Cross-creator token cannot search `rcx_studio_lab2` if bound elsewhere (RC-DF-15).

Acceptance: negative tests for missing scope and foreign creator. HUMAN-SECURITY if this ships a new session table to staging.

### RC-P3-T03 — Compact I/O and safety filters

1. Strip media URLs to ids; never return `encryptedPayload`, patron emails, zip paths.
2. `revise_post` gated-media / public-cover checks return `COMMAND_GATED_MEDIA`.
3. Prompt/system text: user instruction is data; selection results are data; no “guess related works.”

Acceptance: redaction tests; RC-DF-11 fixture.

### RC-P3-T04 — Eval corpus

1. Scenarios covering RC-DF-03–13 at least once, plus paraphrases.
2. Include: exact tag organize; Hero Academy; “Academy” ambiguous; missing page; duplicate page; skip posted-on-X; imported rename vs native rename; weak analytics fallback; gated originals; identical retry; undo.
3. `--facade-only` maps instructions through a **deterministic intent fixture** (scenario id → ops) to prove expected state without an LLM. Live model section is additional.

Acceptance: `eval:relay-command --facade-only` exit 0 on seeded DB.

### RC-P3-T05 — Optional live model trials

1. Runner flag for a model provider already used by Relay (`src/ai/ai-service.ts`) when `RELAY_COMMAND_EVAL_MODEL=1` and keys exist.
2. Record tool-call sequences, clarification rate, wrong-layer rate, latency.
3. Do not block phase Done on vendor quality if facade-only passes; record skip. Human may still use a configured model in the harness.

Acceptance: documented skip vs run; no secrets in artifacts.

### RC-P3-T06 — Lab 2 command harness UX

1. Box at a stable Lab 2 location (top of Active Posts or chassis header). Not a dark pattern; not production polish.
2. States: idle, interpreting, clarification (one field/options), preview summary, applying, applied, error, undone.
3. On applied: reload projection; Collections lens selected when the op was a collection; schedule lens hint when rail changed.
4. Accessibility: labelled textbox, submit button, focus to clarification.
5. Desktop Lab 2 layout; note ~390px as P4 concern if it fails — do not block P3 on mobile polish.
6. Chronological collections stay a compact sticky shelf (`data-lab2-collections-density="shelf"`). Active Posts is a squared inner window (`data-lab2-feed-window`, min 4 visible rows on desktop). Put the command box in the Active Posts header/filter row — do not steal feed height.

Acceptance: `tests/web/lab2-command-harness.test.tsx` for states. **Visible:** RC-DF-02/04.

### RC-P3-T07 — Seed, restart, HUMAN-UX-NL

1. Reset recipe in evidence file: cleanup → apply → flags → stack restart → login → `/studio/lab2`
2. Script: type Hero Academy command; handle gap clarification; see stack; switch lenses; undo.
3. **Stop.** Do not start P4.

Acceptance: evidence template complete; builder does not mark P3 Done until human NL pass.

## Safe batches

- Batch 1: RC-P3-T01 + RC-P3-T03 (tools + redaction)
- Batch 2: RC-P3-T02
- Batch 3: RC-P3-T04
- Batch 4: RC-P3-T06
- Batch 5: RC-P3-T05 (optional) + RC-P3-T07 gate

## Verification

```bash
npx vitest run tests/studio/command/mcp-tools.test.ts tests/studio/eval/command-eval-facade.test.ts tests/web/lab2-command-harness.test.tsx
npm run eval:relay-command -- --facade-only
npm run typecheck
npm run dev:stack:restart
```

## Exit gate

- Facade eval green on Lab 2 corpus
- MCP schemas snapshotted
- Harness mounted
- HUMAN-UX-NL recorded
- P3 Done; next RC-P4-T01

## Human stop conditions

- **HUMAN-UX-NL** (required)
- HUMAN-CREDENTIALS for production model keys
- HUMAN-FLAG to enable MCP on a shared host
- HUMAN-SECURITY for grant issuance on staging
- Model jailbreak attempts that request publish or other creators — fail closed, do not “help”

## Delta Out

Include fixture hash, eval counts, whether live model ran, harness file paths, and reset commands.

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P3-T01 + RC-P3-T03 (Batch 1)
- Completed: Thin JSON-RPC MCP adapter over the capability facade (tools/list, tools/call, initialize). Schemas 1:1 with COMMAND_CAPABILITY_NAMES, snapshotted. Lab bypass documented and production-refused; bearer grants deferred to T02. Compact I/O redaction + COMMAND_GATED_MEDIA / unsolicited-curation filters. POST /api/v1/creator/command/mcp flag-gated.
- Files created/edited: src/studio/command/mcp/{tool-defs,auth,redact,dispatch,jsonrpc,http-routes,server}.ts; tests/studio/command/mcp-tools.test.ts; tests/fixtures/relay-command-mcp-tool-schemas.json; src/server.ts (register MCP route); .env.example (lab bypass comment, still off); 00-README.md P2 Done / P3 In progress; docs/qa/RELAY_COMMAND_P2_VISUAL_EVIDENCE.md
- Migration and backfill state: none. No SessionKind prisma change (T02 / HUMAN-SECURITY).
- Contracts changed: none. Tools are the P1 capability names.
- Commands and results: npx vitest run tests/studio/command/mcp-tools.test.ts → 17 passed
- Manual/browser checks: n/a (no Lab 2 harness yet; T06)
- Feature flags / kill switches: RELAY_COMMAND_MCP_ENABLED=false; RELAY_COMMAND_MCP_LAB_BYPASS commented off; never on in production
- Known risks or human gates: P3 not Done. Bearer grant issuance is RC-P3-T02. Live collection/plan facade methods still P1 notImplemented until later wiring. Do not start P4.
- Next unblocked todo IDs: RC-P3-T02
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P3-T02 (Batch 2)
- Completed: Distinct hashed command grants (`command_grants`, token prefix rcmd_) plus tool audit (`command_audit_events`). Web session issues/lists/revokes grants; MCP bearer cannot mint grants. tools/list hides write tools without command:apply. Foreign grant + Lab 2 creator header is COMMAND_FORBIDDEN (RC-DF-15). Audit stores input hash, not prompts/URLs/emails. SessionKind remains web | extension.
- Files created/edited: prisma/schema.prisma (CommandGrant, CommandAuditEvent); prisma/migrations/20260828200000_command_grants_audit/migration.sql; src/studio/command/mcp/{grant-store,audit,auth,dispatch,jsonrpc,http-routes,tool-defs,server}.ts; src/studio/command/creator-context.ts; tests/studio/command/mcp-grants.test.ts; tests/studio/command/mcp-tools.test.ts; docs/database/operations-and-security.md
- Migration and backfill state: SQL written with ENABLE RLS + REVOKE anon/authenticated. Hosted tables are absent — HUMAN-MIGRATE / HUMAN-SECURITY. Do not prisma migrate deploy to staging.
- Contracts changed: none. Grant scopes remain P1 COMMAND_GRANT_SCOPES. No SessionKind.mcp.
- Commands and results: npx vitest run tests/studio/command/mcp-tools.test.ts tests/studio/command/mcp-grants.test.ts → 26 passed; npx tsc -p tsconfig.build.json --noEmit clean
- Manual/browser checks: live MCP/grant routes 404 while flags off (stack restart after this slice)
- Feature flags / kill switches: RELAY_COMMAND_LAYER_ENABLED=false; RELAY_COMMAND_MCP_ENABLED=false; lab bypass commented off
- Known risks or human gates: P3 not Done. Hosted apply of command_grants is HUMAN-MIGRATE/HUMAN-SECURITY. Next is eval corpus RC-P3-T04. Do not start P4. HUMAN-UX-NL remains T07.
- Next unblocked todo IDs: RC-P3-T04
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P3-T04 (Batch 3)
- Completed: Versioned eval corpus covering RC-DF-03–13 (13 scenarios, 39 paraphrases) plus `--facade-only` runner. Instructions map through a frozen intent fixture onto search/sequence/write-router/ChangeSet preview/idempotency/gated-media safety — no LLM. Live model remains T05 (skipped). Seeded DB assertions: Lab 2 eval ok, watercolor search IDs match JSON vs Prisma, Photo Studies untouched, undo apply/undo of an eval-owned collection, posted-X count unchanged.
- Files created/edited: tests/fixtures/relay-command-eval/corpus.json; src/studio/eval/{command-eval-types,command-eval-corpus,command-eval-runner,library-items-from-corpus,fact-pack-from-lab2}.ts; scripts/eval-relay-command.mjs; tests/studio/eval/command-eval-facade.test.ts; package.json eval:relay-command
- Migration and backfill state: none
- Contracts changed: none
- Commands and results: npx vitest run tests/studio/eval/command-eval-facade.test.ts → 10 passed; npx tsc -p tsconfig.build.json --noEmit clean; npm run eval:relay-command -- --facade-only → exit 0 (lab2_fixture_hash 7e36b9b4fec4d2e84d12ddad79ce083002747cd0e3cb35aaae4ae0121dffa61a; eval_corpus_hash 7dad6803dafa644eafcf0040313f76240be9876c01398204dc251c54da2fb468; live_model skipped; db ok)
- Manual/browser checks: n/a (T06 harness)
- Feature flags / kill switches: committed defaults still off; runner sets apply flags in-process for eval-owned undo only
- Known risks or human gates: P3 not Done. Next is RC-P3-T06 (Lab 2 command harness). Optional T05 live model does not block. HUMAN-UX-NL remains T07. Do not start P4.
- Next unblocked todo IDs: RC-P3-T06
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P3-T06 (Batch 4)
- Completed: Plain Lab 2 command harness (idle → interpreting → one clarification → preview → applying → applied → error → undone). Instructions interpret through the T04 eval fixture (no LLM). POST /api/v1/creator/command/harness/interpret on the web session (origin=harness). Apply/undo reuse existing command HTTP. Mounted as a chassis strip above the lens switcher so Undo survives switching to Collections. Feed window unchanged (shelf + min 4 rows). On collection apply, Collections lens is selected; rail ops show a Schedule-lens hint.
- Files created/edited: src/studio/eval/command-harness-interpret.ts; src/studio/command/http-routes.ts; src/studio/eval/command-eval-runner.ts (warnings + HA-only gap check); web/app/components/studio-lab2/Lab2CommandHarness.tsx; StudioLab2Chassis.tsx; web/lib/relay-api.ts; tests/web/lab2-command-harness.test.tsx; tests/studio/eval/command-harness-interpret.test.ts; tests/web/studio-lab2-chassis.test.tsx
- Migration and backfill state: none
- Contracts changed: none
- Commands and results: npx vitest run tests/studio/eval/command-harness-interpret.test.ts tests/web/lab2-command-harness.test.tsx tests/web/studio-lab2-chassis.test.tsx tests/studio/eval/command-eval-facade.test.ts → 28 passed; npx tsc -p tsconfig.build.json --noEmit clean
- Manual/browser checks: 2026-08-28 after `npm run dev:stack:restart` + `/login/studio-lab2`. Chassis strip **above** lens switcher (Import Bay → command → Chronological/Collections/Schedule). `[data-lab2-command-harness]` + labelled `Lab 2 command` textbox + Preview. Typed "Organize Academy into a collection." → Interpreting… then `[data-lab2-command-state=error]` + alert "Command layer is disabled." (layer flag off — expected; not HUMAN-UX-NL). Collections still `data-lab2-collections-density=shelf`. `[data-lab2-feed-window]` present (~772px, 49 tiles, ≥4 rows). RC-DF-02. Apply/clarification not exercised with flags off.
- Feature flags / kill switches: RELAY_COMMAND_LAYER_ENABLED still default off (interpret 404). RELAY_COMMAND_APPLY_ENABLED still default off. MCP still off.
- Known risks or human gates: P3 not Done. HUMAN-UX-NL is RC-P3-T07. Optional T05 live model does not block T07. Do not start P4.
- Next unblocked todo IDs: RC-P3-T07
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P3-T07 (evidence template only; human pass not recorded)
- Completed: HUMAN-UX-NL evidence sheet with reset recipe (Reset to baseline preferred; full seed if corpus dirty) and Script B exact strings. Harness remains T04 fixture match — not a new sentence engine. T05 live model still skipped.
- Files created/edited: docs/qa/RELAY_COMMAND_P3_NL_EVIDENCE.md
- Migration and backfill state: none
- Contracts changed: none
- Commands and results: n/a (docs)
- Manual/browser checks: organize + weekly X already confirmed 2026-08-28; T07 still needs human Script B after reset, including Academy clarification + Undo, then a signed verdict
- Feature flags / kill switches: local layer/apply on for the pass; committed .env.example stays off
- Known risks or human gates: P3 not Done until the evidence verdict is signed. Do not start P4. Do not treat fixture paraphrases as free-form NL.
- Next unblocked todo IDs: RC-P3-T07 (human Script B)
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P3-T07 (builder browser Script B; human verdict still open)
- Completed: Walked Script B in Cursor browser on /studio/lab2 after Reset to baseline. Academy → one clarification (Hero Academy vs Academy Studies) → Continue → preview gap/dup → Apply → Hero Academy 20-piece stack. Exact HA organize: preview, no radios. Weekly X: skip 6 / 13 posts; rail Page 7 on day 27. Undo last ChangeSet restored the rail; Reset to baseline removed HA stack; posts remained. Unknown sentence fail-closed. Not a new sentence engine.
- Files created/edited: docs/qa/RELAY_COMMAND_P3_NL_EVIDENCE.md
- Migration and backfill state: none
- Contracts changed: none
- Commands and results: browser Script B on running stack (8787/3000)
- Manual/browser checks: see evidence table. Schedule lens month-cutoff remains RC-UI-02. Chassis does not auto-switch to Schedule on rail apply (hint copy instead).
- Feature flags / kill switches: local layer/apply on; committed .env.example stays off
- Known risks or human gates: P3 not Done until human signs the verdict. Do not start P4.
- Next unblocked todo IDs: RC-P3-T07 (human sign-off)
```

```text
Relay Command Delta Out
- Slice / claimed todos: RC-P3-T07 (HUMAN-UX-NL sign-off)
- Completed: Human signed Script B pass (AskQuestion: pass-start-p4). P3 → Done. T05 live model stays skipped until after P4.
- Files created/edited: docs/qa/RELAY_COMMAND_P3_NL_EVIDENCE.md (verdict); 00-README P3 Done / P4 In progress
- Migration and backfill state: none
- Contracts changed: none
- Commands and results: n/a (gate)
- Manual/browser checks: Script B recorded in evidence file
- Feature flags / kill switches: local layer/apply on for the pass; committed .env.example stays off
- Known risks or human gates: P3 Done. P4 Batch 1 is RC-P4-T01 only. Do not start T05.
- Next unblocked todo IDs: RC-P4-T01
```

