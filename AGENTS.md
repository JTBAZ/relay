# Agent context (Rescue)

## Current execution policy

**Airtable queues are legacy and are no longer required for production work.** Ignore their queue, claim, Session Lock, status-update, and MCP-refresh requirements. This policy supersedes older Airtable instructions in this repository and linked documents. Historical tracker IDs and automation references below are retained for reference only.

**Escape Hatch remains deferred.** Do not start or resume its implementation, fixtures, tests, docs, deployment, or related backlog unless the user explicitly reactivates that work. Its agent boundary below applies if reactivated.

## Managed swarm (Claude Code / multi-agent)

**Start here for active work:** the user's current request and the applicable checked-in product contract or build plan. The `.docs/anthropic/` builder material is historical context where available; its ledger queue and Airtable load order are no longer prerequisites.

| Doc | Role |
|-----|------|
| **`.docs/anthropic/CURRENT_LEDGER_QUEUE.md`** | **Legacy:** Project tracker Production Ledger queue; ignore for production execution. |
| **`.docs/anthropic/SMART_BUILDER_SWARM.md`** | Canonical system prompt + YAML fragment (Relay terminology). |
| **`.docs/anthropic/AIRTABLE_LEDGER.md`** | **Legacy:** Project tracker Production Ledger documentation. |
| **`.docs/anthropic/ChiefArchitect.md`** | Orchestration, batching, session reports. |
| **`.docs/anthropic/FAIL_TO_HUMAN.md`** | Stop conditions (OAuth, secrets, unreachable env). |
| **`.docs/anthropic/PRODUCT_UX_NORTH_STAR.md`** | Artist Relay vs Fan Relay. |
| **`docs/UI_SPECIALIST_RELAY.md`** | Relay UI/UX scope: `web/`, patron mock, guardrails, verification. |
| **`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`** | Pass/fail UX expectations. |
| **`docs/studio/goal-cycle-build-plans/00-README.md`** | **Goal Cycle worker program:** Library-first Coach planning, credits, trend evidence, paid-support attribution, rail materialization, extension execution, outcomes, and rollout. Claim slices in dependency order and use its builder orientation. |
| **`docs/studio/escape-hatch-build-plans/00-README.md`** | **Deferred Escape Hatch worker program:** creator-owned Patreon-to-site wizard and ownership handoff; resume only on explicit user instruction. |
| **`docs/qa/HTTP_VERB_HYGIENE.md`** | GETs are side-effect-free; mutations use POST/PUT/PATCH/DELETE (logout is POST only). |
| **`.cursor/rules/airtable-execution-control-plane.mdc`** | **Legacy:** Airtable execution rules; superseded by the current execution policy above. |
| **`docs/pilot-two-stage-charter.md`** | **Canonical Stage 1 / Stage 2 split** — functionality exit vs monetization viability; Stage 2 blockers. |
| **`docs/pilot-build-plan.md`** | Stage 1 execution: Phases P0–P9, Airtable-style work items, v0 asset register (read charter first). |

**MCP:** **`user-airtable`** and the **Project tracker** base `applW4dOjVNHoWBM9` are legacy references; no Airtable access, queue read, claim, or Session Lock is required for production work. **`user-supabase`** — read-check migrations/tables/SQL against the linked Supabase project after Prisma or identity work when prudent (`.cursor/rules/supabase-mcp-read-check.mdc`); never paste secrets.

**Legacy Relay-native posts tracker (Batting Order):** base `apprid6UGT9E1KlkN`, **RN - Epics** `tbl925QBL3fvXCFid`, and **RN - Work items** `tblwwrxy7KYK04udR` are historical references. Production work does not require reading or updating these tables.

**Escape Hatch agent boundary (deferred; applies only after explicit reactivation):** Fable or Sol plans/reviews only. **Cursor Grok 4.5 High is the sole approved implementation builder** for auth, paywall/media, billing/OAuth, migration, deploy, recovery, security-critical work, wizard/generated-site UI, fixtures, tests, docs, and bounded integration. Do not recruit Composer 2.5 Fast for Escape Hatch work. The master browser-reviews every UI slice and complete milestone journey. Escape Hatch uses its docs + git + milestone reports for execution state. Full contract: [`docs/studio/escape-hatch-build-plans/10-AGENT-ORCHESTRATION.md`](docs/studio/escape-hatch-build-plans/10-AGENT-ORCHESTRATION.md).

---

## Repo map (quick)

| Area | Path | Notes |
|------|------|--------|
| Backend / API | `src/` | `npm run test`, `npm run build`, `npm start` from repo root (default port **8787**) |
| Web (Next.js) | `web/` | `npm run dev`, `npm run lint`, `npm run build` |
| Legacy automation | `Automation/` | Historical `ledger-to-v0`, Airtable docs, and attended loop; optional reference only |
| Relational DB (target) | `docs/database/` | PostgreSQL + Prisma direction and migration from `.relay-data/`; historical Airtable layout: [`docs/database/AIRTABLE_DB_PIPELINE.md`](docs/database/AIRTABLE_DB_PIPELINE.md) |

**Database integration (M10):** Verification checklist and human gates — [`docs/database/M10_VERIFICATION.md`](docs/database/M10_VERIFICATION.md). Per-domain cutover status — [`docs/database/migration-from-relay-data.md`](docs/database/migration-from-relay-data.md). Pooling + security — [`docs/database/operations-and-security.md`](docs/database/operations-and-security.md).

**Multi-tenant + cloud (Supabase target):** **Agent orientation** — [`docs/architecture/MULTI_TENANT_AGENT_ORIENTATION.md`](docs/architecture/MULTI_TENANT_AGENT_ORIENTATION.md); any legacy Airtable execution requirements are superseded by the current execution policy above. Runtime schema — [`docs/architecture/multi-tenant-cloud-runtime.md`](docs/architecture/multi-tenant-cloud-runtime.md); migration work items — [`docs/architecture/supabase-migration-work-items.md`](docs/architecture/supabase-migration-work-items.md); identity Option B — [`docs/architecture/multi-tenant-option-b.md`](docs/architecture/multi-tenant-option-b.md).

**Strategic narrative:** [`road map.md`](road%20map.md). **Goal Cycle product/build contract:** [`docs/studio/GOAL_CYCLE_PRODUCT_CONTRACT.md`](docs/studio/GOAL_CYCLE_PRODUCT_CONTRACT.md) and [`docs/studio/goal-cycle-build-plans/00-README.md`](docs/studio/goal-cycle-build-plans/00-README.md). **Schedule Rail Automations worker program:** [`docs/studio/automation-build-plans/00-README.md`](docs/studio/automation-build-plans/00-README.md) — connector-first composition of series, rules, drafts, rail/reminders, Previewizer, and human-confirmed distribution. **Business / unit economics:** **`docs/financial-atlas.md`**. **Monetization build plan (billing spine + Tip economy):** [`docs/MONETIZATION_MASTER_MAP.md`](docs/MONETIZATION_MASTER_MAP.md).

---

## Legacy Airtable + v0 attended workflow

Historical reference only; ignore this workflow for production execution. **`Automation/README.md`** and **`Automation/docs/`** describe scripts targeting base **`applW4dOjVNHoWBM9`** (Production Ledger **`tblDDAKjaaBBIBuPf`**).

**Bridge script:** **`Automation/scripts/ledger-to-v0.mjs`** — requires **`Automation/.env`** (`V0_API_KEY`, Airtable PAT). Node ≥ 22.

**Chat handoff / summary:** **`Automation/docs/CURSOR_HANDOFF.md`**

**Cursor project rules:** **`.cursor/rules/`** (`.mdc` files with frontmatter).

## Agent skills

### Coding and code review

Use **Ponytail** (`ponytail`) for coding work to produce the smallest complete implementation that meets the approved requirements. Read its `SKILL.md` before applying it. Preserve existing architecture, conventions, behavior outside the requested change, validation, security, accessibility, and necessary tests. Product requirements, explicit user instructions, Impeccable's applicable UI guidance, and required verification take precedence over minimizing code.

Before completing code changes, run **Ponytail Review** (`ponytail-review`) on the current task's changes and the connected code needed to assess them. Identify the task's diff explicitly so unrelated working-tree changes or earlier commits are not swept into the review. Inspect callers and dependencies as needed to verify correctness and compatibility; reading connected code does not authorize changing it.

- Fix defects introduced by the task and existing defects that must be corrected to meet its approved requirements. Include necessary caller, fixture, and test updates.
- Report unrelated defects and cleanup opportunities separately without implementing them. Review findings are recommendations, not authorization to expand the task.
- Do not refactor old code solely because it is nearby, duplicated, verbose, or flagged by a review. Broader refactoring, dependency replacement, and architecture changes require explicit user authorization.
- Keep simplifications within the approved scope and preserve required behavior and safeguards. Re-run the relevant checks after review fixes; report any remaining findings or verification limits before claiming completion.

### Copy and prose

Use **Humanizer** (`humanizer`) when writing or editing user-facing copy, including UI labels, onboarding, help text, errors, marketing copy, and documentation. Read its `SKILL.md` and apply its guidance before delivering the final text. Preserve the writer's voice, product meaning, factual claims, and technical identifiers; remove filler and AI writing patterns without inventing details.

### UI and UX

Use **Impeccable** (`impeccable`) and **Web Design Guidelines** (`web-design-guidelines`) for UI and UX design, development, refinement, and review.

- Apply Impeccable's context-loading workflow and relevant playbooks to planning, visual direction, implementation, and rendered verification. Preserve the product brief, established design system, and scope of the requested change.
- Fetch the current Web Design Guidelines as its skill instructs, use them during development, and review changed UI against them before completion. Check accessibility, keyboard and focus behavior, forms, navigation, responsive layouts, motion, and performance. Verify the rendered result at the device sizes the changed surface supports.
- For UI work that includes copy, also apply Humanizer. Product contracts and explicit user instructions take precedence over stylistic preferences in these skills.

Resolve each skill's `SKILL.md` from the available-skills catalog; global installations normally live at `~/.agents/skills/<skill-name>/SKILL.md`.

### Issue tracker

Follow the user's current request and applicable repository plans. Airtable queues are legacy; no replacement external tracker is configured by this setup. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: root `GLOSSARY.md` and `docs/adr/`, created lazily as terms and decisions are resolved. See `docs/agents/domain.md`.
