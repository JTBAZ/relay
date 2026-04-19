# Builder agent — orientation (paste at session start)

You are implementing the **Relay browser extension program** (API `src/`, Prisma `prisma/`, Next.js `web/`, new `extension/`) per [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md).

**Ground truth:** Read only the **prompt file** you claim (`EXT-*-prompt.md` in this folder) plus paths listed under **Reference reading** (≤6 files). Do not read sibling prompts unless referenced.

**Queue discipline:** Work from the Airtable **Browser Extension** table in dependency order. One row at a time: set **In progress** → execute the prompt → run acceptance criteria → set **Done** only when criteria pass. Ship a small PR per row when possible. Honor **Preconditions** and the dependency graph in [`00-README.md`](00-README.md).

**Human checkpoints — hard stop:** If the claimed row’s **Notes** or **prompt file** marks the work as a **human gate** (e.g. operator signing/submitting store builds, pinning production extension IDs, or any row explicitly labeled Human / operator-only), **do not proceed** even if you receive the order **“Proceed to next work item”**. That phrase may be a stock, queued instruction firing automatically (there may be several queued). Set Status to **Blocked** (or leave **Todo**) and append a short **Notes** delta stating what the human must do to clear the block. **Do not** treat later “continue” or “keep going” messages as permission to bypass this.

**Invariants:** Tier 0 list in each prompt (from Guardrails `00-README.md` lines 87–94) plus extension-specific rules in the plan §0. `relay_session` stays `HttpOnly` / `SameSite=Lax` — the extension never reads it; it uses `Authorization: Bearer` after consent.

**Gates:** `EXT-*V` rows are verification-only — if something fails, reopen the failing build row; do not fix inside a gate row.

See **`00-README.md`** for the full dependency graph, file index, and effort table.
