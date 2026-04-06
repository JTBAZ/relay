# Project tracker automation (attended)

Canonical home: **`Coding Projects/Rescue/Automation`** (this folder). Airtable + v0 + Cursor workflow docs and the **`ledger-to-v0`** script live here.

This folder documents the **ledger-first** workflow between **Airtable**, **v0.dev**, and **Cursor** for a **human-in-the-loop** first run.

## Is the loop sound?

**Yes**, with these grounded expectations:

| Step | Reality check |
|------|----------------|
| Pick current item | Airtable is source of truth; Cursor uses MCP `list_records` + `filterByFormula` on **`Production Ledger`**. |
| Build prompt | Agent reads **Inventory**, **Vertical Slice**, **Global Parameters** (or snapshots) and writes **`Prompt Draft`**. |
| Send to v0 | **Attended**: paste **`Prompt Draft`** in v0, **or** run the **`ledger-to-v0`** script (uses **`V0_API_KEY`**, writes **`v0 Chat URL`** / preview back to Airtable). |
| Receive element | You paste preview link / “copy block” from v0 into **`v0 Preview URL`** / **`v0 Copy Block`**, or summarize artifacts in **`Integrator Notes`**. |
| Cursor integrates | Agent applies code locally, runs checks, updates **`Integrator Notes`**, **`Cursor Branch`**, **`Cursor PR URL`**. |
| Ledger updates | Single-select **`Status`** + **`Error Log`** on failure + bump **`Attempt Count`**. |
| Next item | Filter next **`Queued`** row (or sort by **`Queue Order`**, then **Effective Complexity**). |

**Risk controls:** use **`Session Lock`** so two sessions don’t grab the same row; never store secrets in Airtable—only env *names* in **Global Parameters**.

## What was created in Airtable

In base **Project tracker** (`applW4dOjVNHoWBM9`):

| Artifact | Purpose |
|----------|---------|
| **Production Ledger** (`tblDDAKjaaBBIBuPf`) | One row per build unit. **Design-page mode**: rows titled `Design page — …` link **`Design page`** + multiple **UI Element** rows (Slice Bundle). Feature mode: single element + slice. |
| **UI Planning - Inventory → Primary Vertical Slice** | Link each inventory row to its slice for grouping and prompt context. |

Existing planning tables are unchanged: **UI Planning - Inventory**, **UI Planning - Vertical Slices**, **UI Planning - Global Parameters**.

### Design-only webpage list (v0 / visual scope)

- **UI Planning — Design Pages** (`tbliRw7EDiZBOLL2z`): **22 screens** (e.g. Login, Settings & account, Creator library), each with **Roadmap Rank**, **Audience**, and **Design notes** (aesthetic intent only).
- **UI Planning — Inventory** now has **Primary design page** (link): every feature row maps to the screen it primarily skins. See [`docs/DESIGN_PAGES.md`](docs/DESIGN_PAGES.md).

## Doc index

- [`docs/LEDGER_SCHEMA.md`](docs/LEDGER_SCHEMA.md) — Field dictionary and status meanings.
- [`docs/PRODUCTION_LEDGER_FROM_DESIGN_PAGES.md`](docs/PRODUCTION_LEDGER_FROM_DESIGN_PAGES.md) — How Design Pages map into Production Ledger rows.
- [`docs/ATTENDED_LOOP.md`](docs/ATTENDED_LOOP.md) — Step-by-step pulse for one ledger row.
- [`templates/cursor-session-prompt.md`](templates/cursor-session-prompt.md) — Paste-ready agent instruction.
- [`templates/v0-prompt-starter.md`](templates/v0-prompt-starter.md) — Structure for **`Prompt Draft`**, including **Strategy A** (v0 preview without mandatory `NEXT_PUBLIC_*`; **`ledger-to-v0`** appends the same block to every API create).

## v0 bridge script (optional)

Picks the next **Production Ledger** row where **`Status`** is in **`LEDGER_STATUSES`** (default: `Ready for v0`), **`Prompt Draft`** is non-empty, and **`v0 Chat URL`** is blank—sorted by **`Queue Order`**. It calls **`v0.chats.create`** (optional **`V0_RESPONSE_MODE`**; see below), then PATCHes Airtable with **`v0 Chat URL`**, optional **`v0 Preview URL`** (from the latest version `demoUrl`), **`Status`** = `v0 In Progress`, and **`Last Step Actor`** = `v0`.

**Setup**

1. Copy `.env.example` to `.env` and fill **`V0_API_KEY`** and **`AIRTABLE_API_KEY`** (PAT). Base and ledger table IDs default to this project’s **Project tracker** ledger.
2. **Node:** `v0-sdk` targets **Node ≥ 22** (see its `package.json` engines). On older Node, upgrade or run under a newer runtime.
3. From this folder:

   ```powershell
   # From the Rescue repo root (this folder is ./Automation):
   Set-Location Automation
   npm install
   npm run ledger-to-v0:dry
   npm run ledger-to-v0
   ```

**Flags / env**

- **`--dry-run`** — list the row that would run; print prompt preview; no v0 or Airtable writes.
- **`V0_SYSTEM_PROMPT`** / **`V0_PROJECT_ID`** — optional; passed through to the v0 API on **`ledger-to-v0`** creates. Use **`V0_SYSTEM_PROMPT`** for **invariants** that every automated chat must follow (e.g. *“You are generating UI for the product **Relay** only. Do not invent alternate product names, logos, or fictional companies. Obey brand tokens and naming given in the user message.”*) so identity stays consistent even when **`Prompt Draft`** is assembled by different sessions.
- **`LEDGER_STATUSES`** — e.g. `Ready for v0,Queued` (exact single-select labels).
- **`V0_RESPONSE_MODE`** — optional. If unset, the script omits `responseMode` (faster chat URL, generation may finish in the background). Set to `sync` only if you need the API to block until generation completes (can take many minutes with no console output).
- **`V0_CHAT_PRIVACY`** — optional. Default **`unlisted`** (personal keys cannot use **`team`**; that value returns HTTP 403 *“Privacy setting team is only allowed for team/enterprise accounts”*). Team/enterprise: set **`V0_CHAT_PRIVACY=team`** if you want team-scoped chats. **`private`** is scoped to the key’s v0 team; wrong team in the UI shows *Chat is Private / different team* — use the **team switcher** or **`unlisted`** / **`public`** per policy.

- **Relay brand automation (Airtable → v0 user message)** — By default the script **appends** rows from **UI Planning — Global Parameters** onto the **`Prompt Draft`** before **`chats.create`**, so **`RELAY_VISUAL_SYSTEM_V1`** / **`RELAY_COLOR_TOKEN_REF`** (or your own keys) reach v0 without pasting into **`Global Params Snapshot`** each time.
  - **`LEDGER_INJECT_RELAY_BRAND`** — default **on**; set **`0`**, **`false`**, **`no`**, or **`off`** to skip injection.
  - **`LEDGER_RELAY_PARAMETER_KEYS`** — comma-separated **`Parameter Key`** values; default **`RELAY_VISUAL_SYSTEM_V1,RELAY_COLOR_TOKEN_REF`**.
  - **`AIRTABLE_GLOBAL_PARAMS_TABLE_ID`** — optional; defaults to **`tblapjC9tNanrUCqG`** (this repo’s Project tracker). Use another table ID if your base differs.
  - If the Airtable fetch fails, the script **logs a warning** and sends **`Prompt Draft`** only (no fail-hard).
  - **`npm run ledger-to-v0:dry`** shows whether the appendix was applied and prints a longer message prefix for review.

## Pull **v0 Copy Block** from the API (no manual code-block pasting)

v0 stores generated **files per version**. **`ledger-pull-v0-copy-block`** loads the latest completed version (or falls back to concatenating assistant **messages** if files are not available yet), formats them as one markdown blob (path + fenced code per file), and PATCHes **`v0 Copy Block`** on a Production Ledger row. If the v0 API returns **`latestVersion.demoUrl`**, it also PATCHes **`v0 Preview URL`** on the same row.

```powershell
Set-Location Automation
# Preview only:
node scripts/ledger-pull-v0-copy-block.mjs recXXXXXXXXXXXXXX --dry-run
# Write Airtable:
npm run ledger-pull-v0-copy-block -- recXXXXXXXXXXXXXX
```

- **First argument:** Production Ledger **record id** (Airtable). **`v0 Chat URL`** on that row must match a chat this **`V0_API_KEY`** can read (or pass **`--chat=<chatId>`** from the URL path).
- **`COPY_BLOCK_MAX_CHARS`** — optional; default **95000**. If Airtable returns **422** for **`v0 Copy Block`**, lower this (e.g. **88000**) or use **`--write-file`** for the full export. Some bases/fields reject payloads near the nominal long-text limit.
- **`--write-file=./exports/full.md`** — writes the **untruncated** copy block to disk (after **`Automation/exports/`** in **`.gitignore`**). Run the same command without the flag (or with a lower **`COPY_BLOCK_MAX_CHARS`**) to PATCH Airtable with a shorter cell.
- Run **after** v0 generation has a **completed** version; if the API returns no files yet, use **`--dry-run`** or wait and retry.
- Optional workflow: `ledger-to-v0` → integrate in v0 until satisfied → **`ledger-pull-v0-copy-block`** → Cursor reads **`v0 Copy Block`** from Airtable.

**Auto-pull after `ledger-to-v0`:** set **`LEDGER_PULL_COPY_BLOCK=1`** in **`Automation/.env`**. After the script PATCHes **`v0 Chat URL`**, it fetches the chat’s latest version files (with optional polling) and writes **`v0 Copy Block`**. If the pull fails (e.g. generation still pending), the ledger run still succeeds; run **`ledger-pull-v0-copy-block`** manually later.

- **`LEDGER_COPY_BLOCK_POLL_MS`** — milliseconds between retries when polling for files (default **3000**).
- **`LEDGER_COPY_BLOCK_POLL_MAX_MS`** — max time to poll after create (default **90000**). Set **`0`** for a **single** fetch (no wait loop), e.g. when you always use **`V0_RESPONSE_MODE=sync`** and files are immediate.

**Cost discipline:** `ledger-to-v0` calls `chats.create` **once per successful run**. Re-running after clearing **`v0 Chat URL`**, or running the script multiple times on rows that still had an empty URL, yields **separate chats**—each a full new generation. Prefer **one chat + follow-up prompts** in v0 for iteration; use [`templates/v0-prompt-starter.md`](templates/v0-prompt-starter.md) **Single pass** section to reduce random rebranding and layout churn inside each run.

Keep API keys only in **`.env`** or your OS secret store—never in Airtable cells.

## Next actions for you

1. In **UI Planning - Inventory**, set **`Primary Vertical Slice`** for each element (or at least for the first slice you’re attacking).
2. In **Production Ledger**, create rows: link **UI Element** + **Vertical Slice**, set **`Work Title`**, **`Queue Order`**, copy **Complexity** into **`Effective Complexity`**, **`Status`** = `Queued`.
3. Add Airtable **views**: `Attended - Next Up`, `Failed`, `Blocked` (filters by `Status`).
4. Run one full cycle using [`templates/cursor-session-prompt.md`](templates/cursor-session-prompt.md).

## MCP quick reference

```text
Base:  applW4dOjVNHoWBM9  (Project tracker)
Ledger: tblDDAKjaaBBIBuPf (Production Ledger)
Inventory: tbluISu3XCKl3Berv
Slices: tbleD4y1ZbiaCDQ2V
Global params: tblapjC9tNanrUCqG
```
