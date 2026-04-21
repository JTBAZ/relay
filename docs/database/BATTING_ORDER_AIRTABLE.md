# Batting Order — Airtable base (Patron Experience)

This document is the **single reference** for the **Batting Order** Airtable workspace base that tracks [`Patron_Experience_Batting_Order.md`](../Patron_Experience_Batting_Order.md), following the same **row model** as [`AIRTABLE_DB_PIPELINE.md`](AIRTABLE_DB_PIPELINE.md): **one row = one work item**, with **runs** (P1–P4, Meta, Dual-path) as a **grouping field** shared by many rows (like **Doc reference** batching integration runs).

---

## Identifiers (automation)

| | Value |
|---|--------|
| **Workspace** | Batting Order (user-created) |
| **Base name** | Batting Order |
| **Base ID** | `apprid6UGT9E1KlkN` |
| **Table name** | PE Batting Order |
| **Table ID** | `tblVgh6TuzhlKZN3D` |

If the base is duplicated, confirm **Base ID** in the Airtable URL or API before scripting.

---

## Relationship to Relay Database Tracker

| Tracker | Role |
|---------|------|
| **Relay Database Tracker** (`AIRTABLE_DB_PIPELINE.md`) | Postgres / Prisma **integration** steps (`1.1.1`, run-NN.md). |
| **Batting Order** (this base) | **Patron Experience** product schedule — PE lanes, P1–P4 execution order, dual-path checklist. **Do not** mix DB step IDs here. |

---

## Field dictionary (PE Batting Order)

Same spirit as **DB Integration Pipeline**: agents filter **Queued**, use **Sort order**, append **Notes** on complete.

| Field | Type | Purpose |
|-------|------|---------|
| **Step ID** | Single line text (primary) | Stable id: `BO-LANE-PE-A`, `BO-P1-01`, `BO-DP-R01`, … |
| **Title** | Single line text | Short label for grid views. |
| **Sort order** | Integer | Global queue **1…n** — “what’s next.” |
| **Run** | Single line text | Batch: **`P1`**, **`P2`**, **`P3`**, **`P4`**, **`Meta`**, **`Dual-path`**. |
| **Lane** | Single line text | **`PE-A`** … **`PE-K`** when applicable; empty for meta rows. |
| **Work type** | Single line text | **Backend**, **Skeletal UI**, **v0**, **Definition**, **Lane catalog**, **Monday**, **Shipped**, **Remaining**, **Non-goals**, **Conflict** |
| **Pipeline status** | Single select | **Queued** → **In progress** → **Complete** |
| **Doc reference** | URL | Canonical markdown (GitHub `main` link to `Patron_Experience_Batting_Order.md` or, for `BO-SKIP-*` / `BO-CONF-*` rows, `Patron_Experience_Reuse_Audit.md`). |
| **Detail** | Long text | Verbatim / expanded bullet from the doc. |
| **Notes** | Long text | **Annotation cheat-sheet** prefixes for backend rows (`REUSE:`, `EXTEND:`, `NEW:`, `CONFLICT (resolved):`, `BLOCKED-BY:` per `Patron_Experience_Reuse_Audit.md` §3). Also: completion evidence, PR links, blockers. |

---

## Runs (batching)

**Runs** are **not** separate tables. All rows in **Run = P1** share the same **Doc reference** and represent **one phase** of the batting order (open §3 **P1 — Foundation** in the doc as the shared “prompt” for that batch).

| Run | Doc section | Typical row Step ID prefix |
|-----|-------------|------------------------------|
| **Meta** | §1 Lanes, §2 Definitions | `BO-LANE-*`, `BO-DEF-*` |
| **P1** | §3 P1 | `BO-P1-01` … `BO-P1-09` |
| **P2** | §3 P2 | `BO-P2-01` … `BO-P2-06` |
| **P3** | §3 P3 | `BO-P3-01` … `BO-P3-05` |
| **P4** | §3 P4 | `BO-P4-01` … `BO-P4-05` |
| **Meta** | §4 Monday | `BO-MON-01` … `BO-MON-06` |
| **Dual-path** | §5 | `BO-DP-S*` (shipped), `BO-DP-R*` (remaining) |
| **Meta** | §6 | `BO-NF-*` |
| **Meta** | [`Patron_Experience_Reuse_Audit.md`](../Patron_Experience_Reuse_Audit.md) §4 | `BO-SKIP-01` … `BO-SKIP-09` (already-shipped items pulled out of PE-A/D/H/I) |
| **Meta** | [`Patron_Experience_Reuse_Audit.md`](../Patron_Experience_Reuse_Audit.md) §0 | `BO-CONF-C1` … `BO-CONF-C7` (cross-cutting conflict decisions) |

**Operational rule:** Finishing **Run P1** means every **`BO-P1-*`** row is **Complete** (after verification), with **Notes** updated.

**Reading order before picking up a P1/P2 backend row:**

1. Open the row's **Notes** — it carries the `REUSE:` / `EXTEND:` / `NEW:` / `CONFLICT (resolved):` / `BLOCKED-BY:` annotations.
2. Follow any `BLOCKED-BY: BO-CONF-C*` to the corresponding **Conflict** row (Run = Meta) for the resolution.
3. Cross-check against the `BO-SKIP-*` rows — anything listed there is **already shipped**; do not re-cut.

---

## Workflow (agents)

1. Sort by **Sort order** ascending; filter **Pipeline status** = **Queued** (and respect product dependencies — e.g. P1 before P2).
2. Set active rows to **In progress**; one assignee if you add that field later.
3. Open **Doc reference** → read the matching section in `Patron_Experience_Batting_Order.md`.
4. After verification, set **Pipeline status** to **Complete**, append **Notes** (summary + key file paths), and adjust **Title** / **Work type** when a row moves from “remaining” or “queued” to actually shipped so the grid stays truthful.

---

## Seeding

Initial rows were created via **Cursor MCP** (`user-airtable`) to match the markdown at seed time. To **re-seed** or **sync** after doc edits, prefer updating **Detail** / **Title** in place or re-running a small script against the Airtable API with `AIRTABLE_PAT`.

---

## Related docs

- [`Patron_Experience_Batting_Order.md`](../Patron_Experience_Batting_Order.md) — source of truth for content.
- [`AIRTABLE_DB_PIPELINE.md`](AIRTABLE_DB_PIPELINE.md) — DB tracker pattern this base mirrors.
