# Production Ledger ← Design Pages mapping

## What was done

Each row in **UI Planning — Design Pages** now has a matching row in **Production Ledger** (`tblDDAKjaaBBIBuPf`).

| Ledger convention | Value |
|-------------------|--------|
| **Work Title** | `Design page — {Page name}` |
| **Work Unit Kind** | `Slice Bundle` (one full page / screen in v0) |
| **Design page** | Link to the authoritative Design Pages record |
| **UI Element** | All Inventory rows linked from that design page (IA / density hints only) |
| **Queue Order** | `Roadmap Rank × 10` from Design Pages (gaps for insertions) |
| **Effective Complexity** | Heuristic 3–10 by position in the 22-page sequence (later pages tend lower unless you override) |
| **Status** | `Queued` |
| **Recommended v0 Model** | `Use plan default` |
| **Prompt Draft** | Attended-automation **core instructions** (status flow, v0 handoff, Cursor return) + **visual-only scope** + Design page notes + IA bullets + deliverable |
| **Supplemental Guidance** | Traceability (Design page record id) + reminders that Inventory links are not separate backend tickets |

**Vertical Slice** is intentionally left blank unless you later add `Primary Vertical Slice` on Inventory and roll up—design passes are page-centric here.

## Core instructions preserved

Every **Prompt Draft** includes:

1. Production Ledger **Status** path for attended automation.  
2. Explicit **visual / page scope** (no implicit feature delivery).  
3. **v0** paste + write-back of URLs and **v0 Copy Block**.  
4. **UI Element** list as **layout / IA coverage**, not an API checklist.

## Agent usage

- Filter **Production Ledger** where **Work Title** starts with `Design page —` and **Status** = `Queued`, sort by **Queue Order**.
- Open linked **Design page** for the short aesthetic brief; open **UI Element** for engineering context when needed.
- Run the existing attended Cursor runbook; replace “inventory-only” language mentally with “page bundle” where helpful—the schema already uses **Slice Bundle**.

## Inverse link

**Design Pages** now exposes **Production Ledger** (inverse of **Design page**) for navigation from a screen back to its queue row.
