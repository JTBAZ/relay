# Extension Build — Decomposer Orientation (paste at session start)

You are a **decomposer agent** (Composer 2, ~200k context window). You are **not** the builder. Your single job, across this session and possibly the next, is to read one master plan document and produce a folder of **standalone, claimable build prompts** that downstream builder agents will execute one at a time.

**You do not write production code.** You do not modify `src/`, `web/`, `prisma/`, or `extension/`. You only create `.md` files inside `docs/Airtable Drops/Extension/`.

---

## 1. Ground truth (read in this order, then stop reading)

Do not skim. Do not search. Read these and only these:

| # | Path | Why |
|---|---|---|
| 1 | `docs/EXTENSION_BUILD_PLAN.md` | **The master plan.** Every prompt you produce decomposes this document. ~620 lines. |
| 2 | `docs/AUTH_GUARDRAILS_TIER_1.md` | The Tier 0 / Tier 1 invariants every prompt must restate. |
| 3 | `docs/Airtable Drops/Guardrails/00-README.md` | The index file shape you will mirror. |
| 4 | `docs/Airtable Drops/Guardrails/BUILDER-ORIENTATION.md` | The shape of the per-builder orientation file you will also produce. |
| 5 | `docs/Airtable Drops/Guardrails/GR-T1-1-require-account-prompt.md` | The **canonical example** of a heavyweight build prompt. Match this structure. |
| 6 | `docs/Airtable Drops/Guardrails/GR-T0-VERIFY-prompt.md` | The **canonical example** of a verification-gate prompt. Match this structure for every gate row. |
| 7 | `AGENTS.md` (repo root) | Project map; anything you reference in prompts must use the paths shown here. |
| 8 | `docs/qa/HTTP_VERB_HYGIENE.md` | Verb hygiene rule every prompt must respect. |

That is **~6,000 lines total**, well under your context budget. Do not pull additional files unless a specific prompt you are drafting needs to cite a path you cannot find from the plan itself.

If you are tempted to read `src/server.ts`, `prisma/schema.prisma`, or any other code file: **stop**. The master plan already cites the exact line numbers you need; copy those citations verbatim. The builder will read the actual code.

---

## 2. What you produce

A folder: `docs/Airtable Drops/Extension/` containing:

- `00-README.md` — index file. Mirrors `Guardrails/00-README.md` shape: parent doc link, dependency graph, build hierarchy table, invariants list, estimated effort.
- `BUILDER-ORIENTATION.md` — short orientation file for builder agents. Mirrors `Guardrails/BUILDER-ORIENTATION.md` shape (≤25 lines).
- One `EXT-*-prompt.md` per work item. Naming: `EXT-{phase}{letter}-{slug}-prompt.md` for build rows; `EXT-{phase}V-{slug}-prompt.md` for verification gates; `EXT-{phase}H-{slug}-prompt.md` for human-action gates.

This file (the one you are reading) stays untouched — you do not regenerate it.

---

## 3. Filename conventions and full work-item list

Produce these files in this order. The list is final; **do not add, remove, rename, merge, or split items** without surfacing the proposed change as a delta in your batch summary first.

### Phase 0 — Backend prerequisites (6 files)

| File | Maps to plan § | Type |
|---|---|---|
| `EXT-0A-cookie-endpoint-auth-prompt.md` | 0.A | Build |
| `EXT-0B-session-kind-extension-ttl-prompt.md` | 0.B | Build (DB migration) |
| `EXT-0C-extension-consent-endpoints-prompt.md` | 0.C | Build |
| `EXT-0D-rate-limiting-prompt.md` | 0.D | Build |
| `EXT-0E-cors-extension-allowlist-prompt.md` | 0.E | Build |
| `EXT-0V-phase0-verify-prompt.md` | 0.F | **Verification gate** |

### Phase 1 — Web app changes (4 files)

| File | Maps to plan § | Type |
|---|---|---|
| `EXT-1A-consent-page-prompt.md` | 1.A | Build |
| `EXT-1B-connected-extensions-page-prompt.md` | 1.B | Build |
| `EXT-1C-cookie-page-cta-prompt.md` | 1.C | Build |
| `EXT-1V-phase1-verify-prompt.md` | 1.D | **Verification gate** |

### Phase 2 — Extension scaffold (3 files)

| File | Maps to plan § | Type |
|---|---|---|
| `EXT-2A-workspace-tooling-prompt.md` | 2.A | Build |
| `EXT-2B-production-manifest-prompt.md` | 2.B | Build |
| `EXT-2V-phase2-verify-prompt.md` | 2.C | **Verification gate** |

### Phase 3 — Extension service worker (5 files)

| File | Maps to plan § | Type |
|---|---|---|
| `EXT-3A-storage-shape-prompt.md` | 3.A | Build |
| `EXT-3B-background-worker-prompt.md` | 3.B | Build |
| `EXT-3C-sync-now-prompt.md` | 3.C | Build |
| `EXT-3D-cross-browser-shim-prompt.md` | 3.D | Build |
| `EXT-3V-phase3-verify-prompt.md` | 3.E | **Verification gate** |

### Phase 4 — Extension popup (2 files)

| File | Maps to plan § | Type |
|---|---|---|
| `EXT-4A-popup-ui-prompt.md` | 4.A | Build |
| `EXT-4V-phase4-verify-prompt.md` | 4.B | **Verification gate** |

### Phase 5 — End-to-end QA (1 file)

| File | Maps to plan § | Type |
|---|---|---|
| `EXT-5V-e2e-verify-prompt.md` | 5.A + 5.B | **Verification gate (human-led test matrix)** |

### Phase 6 — Privacy policy + store submission (4 files)

| File | Maps to plan § | Type |
|---|---|---|
| `EXT-6A-privacy-policy-prompt.md` | 6.A | Build |
| `EXT-6B-store-listings-prompt.md` | 6.B | Build (writing copy + reviewer justifications) |
| `EXT-6H-build-sign-submit-prompt.md` | 6.C | **Human-action gate** |
| `EXT-6V-store-review-gate-prompt.md` | 6.D | **Verification gate (waits on store review)** |

### Phase 7 — Post-launch (3 files)

| File | Maps to plan § | Type |
|---|---|---|
| `EXT-7H-pin-extension-ids-prompt.md` | 7.A | **Human-action gate** (extension IDs only known after publish) |
| `EXT-7B-update-cta-urls-prompt.md` | 7.B | Build |
| `EXT-7C-operational-runbook-prompt.md` | 7.C | Build (docs only) |

**Total: 28 work-item prompts + `00-README.md` + `BUILDER-ORIENTATION.md` = 30 files.**

---

## 4. Required structure for each `EXT-*-prompt.md`

Match `GR-T1-1-require-account-prompt.md` exactly for **build rows**, and match `GR-T0-VERIFY-prompt.md` exactly for **verification rows**. Both share the headers below; only the body shape differs. **Do not invent new sections.** Order matters.

### 4.1 Build prompt skeleton (use for all `EXT-*A`, `EXT-*B`, `EXT-*C`, `EXT-*D` rows)

```markdown
# EXT-{id} — {short title}

## Context

{1–3 paragraphs. State which phase of `docs/EXTENSION_BUILD_PLAN.md` this implements, why this work item exists in isolation, and what the broader extension delivers. Cite the plan with a section anchor.}

## Preconditions

- [ ] {Preceding EXT-* row that must be shipped, by filename}
- [ ] {Any required env var, migration, or external setup that an earlier row provided}

If a precondition is unmet, mark this row **Blocked** with Delta Out naming the missing item.

## Tier 0 invariants (always apply)

{Restate the 4 Tier 0 invariants from `AUTH_GUARDRAILS_TIER_1.md` §1.2 + the 4 add-ons from `Guardrails/00-README.md` "Tier 0 invariants" §, condensed to a numbered list. Do NOT change wording — copy verbatim from `Guardrails/00-README.md` lines 87–94. Add one extension-specific invariant if the plan §0 introduces one (e.g. "extension never reads `relay_session`" — see plan's compliance table).}

## Goal

{1 sentence. The specific deliverable this row produces. No verbs like "begin" or "start" — only completion verbs.}

## Reference reading

{Numbered list of files the builder MUST read before starting. Cap at 6 entries. Always include:
1. `docs/EXTENSION_BUILD_PLAN.md` § the matching subsection
2. `docs/AUTH_GUARDRAILS_TIER_1.md` § the most relevant stage (B for auth-touching rows; H for verb-touching rows)
3. The directly preceding EXT-* prompt's "Handoff" section
4. Any specific source files the plan calls out by name and line number for THIS work item

Do NOT include all 8 ground-truth files from this orientation; that is over-quoting and will exceed the builder's context.}

## Implementation steps

{Numbered list, partitioned by Part A / Part B / Part C if the work is large. Each step is concrete enough that a builder can produce a diff without ambiguity. Include code skeletons for new files (in fenced ```ts / ```sql / ```json blocks) lifted directly from `EXTENSION_BUILD_PLAN.md` — do not paraphrase. Add a `// {filename}` comment at the top of each skeleton. Include exact `rg` commands for any audit/enumeration step.}

## Acceptance criteria

- [ ] {Each criterion is independently testable: a single `npm` command, a single `rg` invocation, or a single manual UI check phrased as "doing X produces Y".}
- [ ] `npm run test` passes at repo root.
- [ ] `npm run build` passes at the relevant workspace (root for `src/`, `web/` for `web/`, `extension/` for `extension/`).
- [ ] No new ESLint errors in touched files (run `npm run lint` if the workspace defines it; otherwise skip).
- [ ] Every Tier 0 invariant restated above remains satisfied (manual code-review checklist).

## Out of scope

- {3–6 items the builder is NOT allowed to do, lifted from the plan's "Out of scope" notes for that subsection.}
- {Always include: any work item belonging to a later EXT-* row.}

## Handoff

Delta Out:
- {What changed, in 2–4 bullets, written from the perspective of the next builder (not the operator).}
- {Any env vars added; the next row will need to set them on staging.}
- {Any unexpected friction the next builder should know about.}

Next claimable: {comma-separated list of EXT-* rows that this row unblocks per the dependency graph.}
```

### 4.2 Verification-gate prompt skeleton (use for all `EXT-*V` rows)

Match `GR-T0-VERIFY-prompt.md` shape exactly. Sections in order:

1. `# EXT-{id}V — {phase name} verification suite`
2. `## Context` — state that this is a gate row, what it verifies, and that no code is committed in this row.
3. `## Preconditions` — every build row in the phase shipped.
4. `## Tier 0 invariants (always apply)` — same as build rows.
5. `## Goal` — one sentence, same shape as `GR-T0-VERIFY` line 32.
6. `## Reference reading` — the verified phase's prompts.
7. `## Verification checklist` — partitioned A / B / C / etc., one section per logical area. Each check is an independent box. **Borrow the A1/A2/A3 numbering scheme from `GR-T0-VERIFY-prompt.md`.** Mix automated checks (`npm`, `rg`, `curl`) with manual UI checks. Always include a regression section: "existing flows still work."
8. `## Failure handling` — verbatim copy of `GR-T0-VERIFY-prompt.md` § Failure handling, but with phase-appropriate row names. The rule "do not patch in this row" is sacred.
9. `## Acceptance criteria` — every box checked; no code committed; index files annotated with the verification timestamp.
10. `## Out of scope` — fixing failures (they reopen the originating row); verifying any later phase.
11. `## Handoff` — Delta Out template + the list of EXT-* rows this gate unblocks.

### 4.3 Human-action-gate prompt skeleton (use for `EXT-6H` and `EXT-7H`)

Same skeleton as the build prompt, but:
- Replace `## Implementation steps` with `## Operator actions`. Each step starts with **HUMAN ACTION REQUIRED:**.
- The agent claiming this row is **expected to coordinate with the operator**, not execute.
- `## Acceptance criteria` is "operator confirms each step completed; agent has captured the resulting values (extension IDs, store URLs) and updated downstream config or env vars."
- `## Reference reading` includes the `extension/store/` folder created by `EXT-6B` if the plan calls for it.

---

## 5. Cross-cutting rules every prompt must include

Embed these into the appropriate sections of every prompt; they are not optional.

| Rule | Where it lives | Source |
|---|---|---|
| `relay_session` is `HttpOnly` `SameSite=Lax` and the extension never touches it | Tier 0 invariants section | Plan §0 finding 2 + AUTH_GUARDRAILS_TIER_1.md §1 Decision 0.1 |
| Every new `/api/v1/*` route uses `requirePatronBearerSession` + `requireAccountMatchesCreator` (or has a `// PUBLIC: <reason>` comment) | Tier 0 invariants section, applied especially to EXT-0A, 0C, 0D | AUTH_GUARDRAILS_TIER_1.md §3 Stage B |
| Mutations are POST/PUT/PATCH/DELETE; GETs are side-effect-free | Tier 0 invariants section | docs/qa/HTTP_VERB_HYGIENE.md |
| Token raw values are NEVER stored — only `tokenHash` (SHA-256) | Implementation steps for EXT-0B | prisma/schema.prisma `Session.tokenHash` field comment |
| `chrome.cookies.get` and `cookie.value` are **never logged** in extension code (Phase 5 §P-5: no telemetry) | Implementation steps for EXT-3B and acceptance for EXT-3V | EXTENSION_BUILD_PLAN.md §0 P-5, §3.C critical-correctness notes |
| Popup never displays the cookie value (P-2) | Implementation steps for EXT-4A and acceptance for EXT-4V | EXTENSION_BUILD_PLAN.md §0 P-2 |
| Localhost never appears in the published manifest (P-12) | Acceptance for EXT-2B (`rg localhost extension/dist/chrome-prod/` returns zero) | EXTENSION_BUILD_PLAN.md §0 P-12 |
| Sliding 30-day TTL: `lastUsedAt` and `expiresAt` updated **fire-and-forget**, not awaited (request latency unchanged) | Implementation steps for EXT-0B | EXTENSION_BUILD_PLAN.md §0.B last bullet |
| All HUMAN ACTION REQUIRED items from the plan are surfaced as their own EXT-*H rows OR explicit blocks within a build row — never silently ignored | Across phases | EXTENSION_BUILD_PLAN.md (7 such blocks) |

---

## 6. Dependency graph (use this verbatim in `00-README.md`)

```
0A ─┐
0B ─┤
0C ─┤   (0A, 0B, 0C, 0D, 0E may run in parallel)
0D ─┤
0E ─┘
    └─> 0V ──> 1A ─┐
                   ├─> 1V ──> 2A ──> 2B ──> 2V ──> 3A ─┐
              1B ──┤                                    ├─> 3V ──> 4A ──> 4V ──> 5V ──> 6A ─┐
              1C ──┘                               3B ──┤                                    ├─> 6H ──> 6V ──> 7H ──> 7B ──┐
                                                  3C ──┤                                    │                              ├─> ✅
                                                  3D ──┘                               6B ──┘                         7C ──┘
```

Adjust ASCII alignment as needed but preserve the dependency edges:
- 0A–0E depend on nothing; all five unblocked at session start.
- 0V depends on all of 0A–0E.
- 1A, 1B, 1C all depend on 0V; 1V depends on all three.
- 2A → 2B → 2V is strictly sequential.
- 3A–3D depend on 2V; 3V depends on all four.
- 4A depends on 3V; 4V depends on 4A.
- 5V depends on 4V.
- 6A and 6B depend on 5V; 6H depends on both; 6V depends on 6H (and waits on store review).
- 7H depends on 6V; 7B and 7C depend on 7H.

---

## 7. Estimated effort table (use this verbatim in `00-README.md`)

| Phase | Total | Parallelizable? |
|---|---|---|
| Phase 0 (5 build + 1 verify) | 4–6 days | 0A + 0B + 0C + 0D + 0E in parallel; 0V serial |
| Phase 1 (3 build + 1 verify) | 2–3 days | 1A + 1B + 1C in parallel; 1V serial |
| Phase 2 (2 build + 1 verify) | 1–2 days | Sequential |
| Phase 3 (4 build + 1 verify) | 3–4 days | 3A first; 3B/3C/3D parallel after; 3V serial |
| Phase 4 (1 build + 1 verify) | 1 day | Sequential |
| Phase 5 (1 verify) | 0.5–1 day | — |
| Phase 6 (2 build + 1 human + 1 review-gate) | 1–2 days work + 1–2 weeks store review | 6A + 6B parallel; 6H + 6V serial |
| Phase 7 (1 human + 2 build) | 1 day + post-publish | 7B + 7C parallel after 7H |
| **Total** | **~3 weeks engineering + 1–2 weeks store review** | |

---

## 8. Batching strategy for execution

You have ~200k context. The total reading budget for this orientation + the 8 ground-truth files is ~25k tokens. Each prompt file you write is 250–600 lines (~5–12k tokens of output). Producing all 30 files in one session = ~200–300k tokens of output, which exceeds your single-session output budget and produces lower-quality prompts at the tail.

**Therefore: produce the files in 4 batches, in this order. Stop at the end of each batch and emit a one-paragraph summary of what was created and what's next. Wait for the operator to say "continue" before starting the next batch.**

### Batch 1 — Foundation + Phase 0 (8 files)

1. `BUILDER-ORIENTATION.md` (~25 lines, model on Guardrails version)
2. `00-README.md` (full index, dep graph, invariants, effort table)
3. `EXT-0A-cookie-endpoint-auth-prompt.md`
4. `EXT-0B-session-kind-extension-ttl-prompt.md`
5. `EXT-0C-extension-consent-endpoints-prompt.md`
6. `EXT-0D-rate-limiting-prompt.md`
7. `EXT-0E-cors-extension-allowlist-prompt.md`
8. `EXT-0V-phase0-verify-prompt.md`

After Batch 1, the operator can begin Phase 0 implementation in parallel with you producing later batches.

### Batch 2 — Phases 1 + 2 (7 files)

1. `EXT-1A-consent-page-prompt.md`
2. `EXT-1B-connected-extensions-page-prompt.md`
3. `EXT-1C-cookie-page-cta-prompt.md`
4. `EXT-1V-phase1-verify-prompt.md`
5. `EXT-2A-workspace-tooling-prompt.md`
6. `EXT-2B-production-manifest-prompt.md`
7. `EXT-2V-phase2-verify-prompt.md`

### Batch 3 — Phases 3 + 4 (7 files)

1. `EXT-3A-storage-shape-prompt.md`
2. `EXT-3B-background-worker-prompt.md`
3. `EXT-3C-sync-now-prompt.md`
4. `EXT-3D-cross-browser-shim-prompt.md`
5. `EXT-3V-phase3-verify-prompt.md`
6. `EXT-4A-popup-ui-prompt.md`
7. `EXT-4V-phase4-verify-prompt.md`

### Batch 4 — Phases 5–7 (8 files)

1. `EXT-5V-e2e-verify-prompt.md`
2. `EXT-6A-privacy-policy-prompt.md`
3. `EXT-6B-store-listings-prompt.md`
4. `EXT-6H-build-sign-submit-prompt.md`
5. `EXT-6V-store-review-gate-prompt.md`
6. `EXT-7H-pin-extension-ids-prompt.md`
7. `EXT-7B-update-cta-urls-prompt.md`
8. `EXT-7C-operational-runbook-prompt.md`

After Batch 4, your job is done. Final output: a one-paragraph summary listing all 30 files created and confirming the dependency graph in `00-README.md` matches the per-prompt `Preconditions` and `Next claimable` sections.

---

## 9. Quality bar for each prompt

A prompt passes the quality bar when **all five** of these hold:

1. **Standalone.** A builder reading only this prompt + the files it lists in `## Reference reading` (≤6 files) can complete the work without further questions.
2. **Diff-producing.** Implementation steps cite specific file paths and either a line range to modify or a `## File: <path>` block with the new file's full content. No "consider adding..." or "you may want to..." — every step is imperative.
3. **Independently verifiable.** Acceptance criteria can be ticked by running specific commands or doing specific UI actions. No "looks good" criteria.
4. **Scoped.** Out-of-scope section is non-empty and lists at least one item that belongs to a later EXT-* row (proves the boundary is real).
5. **Composer 2 fits.** A builder loading this prompt + the 6 reference files + the 1–2 source files those reference + Composer 2's tool overhead stays under 100k tokens. If a prompt would push past that, split it across two rows and mark them as `Parallel with` each other in the dep graph.

If any draft fails 1–5, rewrite before moving to the next file in the batch.

---

## 10. Things you must NOT do

- Do **not** write code that lives outside `docs/Airtable Drops/Extension/`.
- Do **not** read `src/`, `web/`, `prisma/`, or `extension/` source files. Cite the line numbers from `EXTENSION_BUILD_PLAN.md` and let the builder pull the actual code.
- Do **not** invent endpoints, env vars, or filenames that aren't in `EXTENSION_BUILD_PLAN.md`. If you find a gap in the plan, surface it in your batch summary as a "decomposer flagged this for the plan author" note — do not patch it in a prompt.
- Do **not** merge two work items because "they're small." The verification-gate cadence depends on the granularity. Conversely, do not split an item the plan treats as one (e.g. don't split `EXT-3B` into "worker scaffolding" + "alarms listener").
- Do **not** include Tier 2 work items, `relay_active_role` toggling, or anything from `AUTH_GUARDRAILS_TIER_1.md` §5 ("Out of scope — Tier 2 sweep"). The extension build is independent of that sweep.
- Do **not** reference Airtable IDs or attempt to create Airtable rows. The Production Ledger sync is the operator's job and happens after your output is reviewed. Each prompt's `## Handoff` section just needs to follow the Delta Out shape — not actually post anywhere.
- Do **not** add a CHANGELOG entry, PR template, or commit message guidance to any prompt. Those are repo-wide concerns.

---

## 11. When to stop and ask

Stop and surface a question to the operator if **any** of these occur:

1. `EXTENSION_BUILD_PLAN.md` cites a path that doesn't exist in the repo (verify with a single `Glob` or `Read` — do not branch into broad searches).
2. Two phases of the plan describe the same deliverable (would produce overlapping prompts).
3. The plan's "HUMAN ACTION REQUIRED" blocks total more or fewer than 7 (your `EXT-*H` row count must match).
4. You discover a Tier 0 invariant the plan would violate. Stop. Do not produce a prompt for that row. Surface the conflict.
5. You realize a prompt would exceed the Composer 2 quality bar in §9 even after splitting — stop and ask before producing a degraded prompt.

Use a single `Question:` block at the end of your batch summary. Do not pause mid-batch unless the issue would corrupt every subsequent file in the batch.

---

## 12. Begin

When you are ready, your first action is to read the 8 ground-truth files in §1, in order. Then begin **Batch 1**. End the batch with a summary of the 8 files created and the line "Awaiting `continue` to begin Batch 2."
