# Build brief — orientation for managed agents

**Read this first** in a swarm session, then **`README.md`** (this folder) for load order.

---

## 1. What this repo is

**Relay** — creator and patron product around **Patreon-sourced** libraries, tier-aware access, and a **Next.js** web app plus a **Node** API/service (`src/`). Strategic narrative: **[`road map.md`](../../road%20map.md)** (phased Parts 1–3, MVP framing). Business and unit economics: **`docs/financial-atlas.md`**.

**Product UX intent:** **`PRODUCT_UX_NORTH_STAR.md`** — Artist Relay (library, curation, Designer) vs Fan Relay (feed, entitlements, browse).

---

## 2. Strategic narrative → **`road map.md`**

- Phases, workstreams, and dependency **story** live there in prose.
- The **operational queue** for build units is **not** only the roadmap file — see Airtable below.
- Deep dives: **`docs/pattern-library.md`**, **`docs/patreon-ingest-canonical.md`**, **`analytics-action-center-spec.md`**, **`Automation/docs/`** for ledger workflow.

Agents implement **vertical slices** mapped to **Airtable `Production Ledger`** rows (see **`AIRTABLE_LEDGER.md`**), not abstract “milestones” as a separate table name.

---

## 3. Codebase map → **`AGENTS.md`**

- Path → feature expectations and commands.
- **Backend / API:** repo root — `npm run test`, `npm run build`, `npm start`.
- **Web UI:** `web/` — `npm run dev`, `npm run lint`, `npm run build` (from **`web/`**).

Use **`AGENTS.md`** when touching files; use **this file** for **where to look first** strategically.

---

## 4. Execution queue → Airtable (**not** a generic “milestones” sheet)

| Concept | In this project |
|--------|------------------|
| **Build ledger** | **Project tracker** base — see **`AIRTABLE_LEDGER.md`**. |
| **Rows / work units** | Table **`Production Ledger`** — primary field **`Work Title`**, workflow **`Status`**, sort **`Queue Order`**, optional links to **Design page**, **UI Element**, **Vertical Slice**. |
| **Planning context** | **UI Planning — Design Pages**, **Inventory**, **Vertical Slices**, **Global Parameters** — not substitutes for ledger state. |

**There is no table named “Milestones”.** Swarm prompts should say **Production Ledger** (or “ledger rows”) to match the base.

**MCP:** server identifier **`user-airtable`** (see **`AGENTS.md`**). Confirm **`baseId`** with MCP **`list_bases`** if the base is duplicated or moved — do not guess IDs.

**Dependency rule:** This ledger does not use a **`Depends on`** link field like some roadmaps. Treat **Vertical Slice** links, **`Queue Order`**, **`Blocked`** status, and **`Error Log`** / **Integrator Notes** as the coordination signals; do not start work on a row that is **Blocked** without owner resolution.

---

## 5. Connectivity (what agents can and cannot assume)

| Layer | Expectation |
|-------|-------------|
| **Patreon / OAuth** | Redirect URIs, client IDs, and secrets require **owner** configuration — see **`FAIL_TO_HUMAN.md`**. |
| **v0** | **`ledger-to-v0`** and **`V0_API_KEY`** are **owner/CI** secrets; see **`Automation/README.md`**. |
| **Managed cloud agent** | May have **no outbound** to **localhost**, preview URLs, or private APIs. Do not burn credits retrying proofs that need network allowlists. See **`FAIL_TO_HUMAN.md`**. |
| **Proof of DB / Patreon live API** | Prefer **Vitest** and fixtures in-repo; live Patreon calls need tokens and environment — **fail-to-human** when unavailable. |

---

## 6. Testing stack (swarm contract)

| Layer | Command / tool |
|-------|----------------|
| **Backend unit** | From repo root: **`npm run test`** (Vitest), **`npm run build`** (tsc) |
| **Web lint / build** | From **`web/`**: **`npm run lint`**, **`npm run build`** |
| **E2E / Playwright** | Not wired at repo root in the default **`package.json`**; if added later, follow **`FAIL_TO_HUMAN.md`** for skip rules. |

**UX pass/fail:** **`docs/qa/UX_ACCEPTANCE_GUARDRAILS.md`**.

---

## 7. Stop conditions

**`FAIL_TO_HUMAN.md`** — new OAuth apps, production keys, first deploy, live Patreon verification, blocked headless env, etc.

---

## 8. One-line load order

**`BUILD_BRIEF.md` (this)** → **`README.md`** → **`SMART_BUILDER_SWARM.md`** / **`ChiefArchitect.md`** → **`AIRTABLE_LEDGER.md`** → **`road map.md`** / **`AGENTS.md`** → assigned **role** MD → slice work.
