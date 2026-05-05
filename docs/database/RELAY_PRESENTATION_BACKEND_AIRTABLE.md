# Batting Order — Relay presentation backend (`relay presentation backend`)

This document mirrors the **`PE Batting Order`** row methodology in **[`docs/database/BATTING_ORDER_AIRTABLE.md`](BATTING_ORDER_AIRTABLE.md)**: **one row = one work item**, **Sort order** = global queue (**1…n**), **Run** batches phases (**RP1**–**RP6**), **`Pipeline status`** = **Queued** → **In progress** → **Complete** (**Deferred** when parked). **Detail** carries expanded scope; **Notes** is for completion evidence / `BLOCKED-BY:` / PR links (`Patron_Experience_Reuse_Audit`-style prefixes where useful).

Operational source narrative for scopes and merges: **`docs/relay-artist-metadata.md`**, ingest append-only behavior in **`src/ingest/apply-batch.ts`**, directives in **`.cursor/rules/patreon-origin-relay-bedrock.mdc`**.

---

## Identifiers (automation)

| | Value |
|---|--------|
| **Workspace / base name** | Batting Order (`apprid6UGT9E1KlkN`) |
| **Table name** | relay presentation backend |
| **Table ID** | `tblhXKtCuKsYYDnxf` |

If duplicated, confirm Base ID via Airtable URL or API before scripting.

---

## Field dictionary (**same spirit as PE Batting Order**)

| Field | Type | Purpose |
|-------|------|---------|
| **Step ID** | Single line text | Stable id **`BO-RPB-01`** … **`BO-RPB-06`** (**RPB** = Relay presentation backend); do not collide with **`BO-P1-*`** PE steps. |
| **Title** | Single line text | Short grid label — mirrors **`Name`** ergonomics once migrated. |
| **Sort order** | Integer | Queue order **1…6**. |
| **Run** | Single line text | Batch label **`RP1`** … **`RP6`** (maps to phased plan sections). |
| **Lane** | Single line text | Leave empty unless partitioning (PE uses **PE-A** …); optional future lane. |
| **Work type** | Single line text | Typically **Backend**. |
| **Pipeline status** | Single select | **Queued**, **In progress**, **Complete**, **Deferred**. |
| **Doc reference** | URL | Canonical **GitHub blob `main`** link to **this file** (`RELAY_PRESENTATION_BACKEND_AIRTABLE.md`) once public; omit until then. Original Cursor plan slug: **`relay_presentation_backend_03b39335`**. |
| **Detail** | Long text | Acceptance bullets verbatim from phased plan below. |
| **Notes** | Long text | Agent/evidence appendix (files touched, MR/PR refs, skips). |

**Legacy columns** on this table (**Name**, **Status** Todo/In progress/Done, **Attachments**) remain for backwards compatibility until removed in Airtable; treat **`Pipeline status`** **Queued**/… as the workflow authority matching PE.

---

## Runs (batching)

| Run | Rough plan phase |
|-----|------------------|
| **RP1** | Schema / migrations (**PostPresentation** shape vs override columns; **`Comment.mediaId`** → **`MediaAsset`**) |
| **RP2** | Merge layer (**`effectivePostPresentation`**) + exported types + read-path wiring |
| **RP3** | Ingest/sync guards (never wipe overlays upstream; prune tests) |
| **RP4** | Creator HTTP APIs (**PATCH**/upload; auth parity with gallery mutations) |
| **RP5** | Comments polish ( **`mediaId` validation + HTTP filters**) |
| **RP6** | Verification (golden tests), **M10** parity tick, **`web/lib/relay-api.ts`** FE contract |

---

## Workflow (**agents**) — [**`BATTING_ORDER_AIRTABLE.md`**](BATTING_ORDER_AIRTABLE.md) §Workflow

1. Sort by **Sort order** ascending; filter **Pipeline status** = **Queued** (respect prior phases).
2. Set active rows to **In progress** when picking up.
3. Open **Detail** (+ linked repo refs); ingest remains append-only; Relay overlays merged at **read time** per **`relay-artist-metadata.md`**.
4. Verify; set **Pipeline status** = **Complete**; append **Notes** with evidence (**`npm run test`**, **`verify:m10`**, touched paths).

---

## Seeding

Initial rows seeded via **Cursor MCP** (`user-airtable`) **`create_record`** / **`update_records`** to align **`PE Batting Order`** semantics. To re-sync after edits, update **Detail**/`Title` via API or MCP; keep **Step IDs** stable.
