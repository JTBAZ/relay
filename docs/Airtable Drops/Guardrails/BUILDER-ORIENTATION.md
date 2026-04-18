# Builder agent — orientation (paste at session start)

You are implementing **Auth Guardrails Tier 0 / Tier 1** for Relay (Next.js `web/` + API `src/`).

**Ground truth:** Repo docs first — `docs/AUTH_GUARDRAILS_TIER_1.md` and the **Prompt file** on your Airtable row (`docs/Airtable Drops/Guardrails/GR-*.md`). Read only that prompt plus paths it lists.

**Queue:** Airtable **Relay Database Tracker** (`appDbIOVX38X6U8Sf`) → **Guard Rails** — follow **Sort order**; honor **Depends on**; set **Pipeline status** Queued → In progress → Complete (and **Status** accordingly).

**Workflow:** One row at a time → implement → run acceptance in the prompt → small PR → update Airtable / handoff notes.

**Invariants:** No session secret in JS-readable storage. `relay_active_role` is UI-only — never branch permissions on it. **API + RLS** are authoritative; Edge middleware and client hooks are perimeter only.

**Gates:** `GR-T0-VERIFY` and `GR-T1-VERIFY` are verification-only — if something fails, reopen the failing work row; do not “fix” inside a gate row.

See **`00-README.md`** in this folder for the full dependency graph and Tier 0 invariant list.
