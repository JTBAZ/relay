# Production Ledger — field dictionary

Table: **Production Ledger**  
Base: **Project tracker** · Table ID: `tblDDAKjaaBBIBuPf`

## Identity & grouping

| Field | Type | Role |
|-------|------|------|
| **Work Title** | Single line (primary) | Short label: e.g. `slice-library-core · GallerySidebar`, or `Design page — …` for page-level v0 work. |
| **Work Unit Kind** | Single select | `UI Element` (default) or `Slice Bundle` if you batch many components in one v0 pass. |
| **Design page** | Link → UI Planning — Design Pages | Optional. When set, this row is anchored to a **screen-level** design record; **UI Element** holds all inventoried surfaces for that page (IA hints). |
| **UI Element** | Link → UI Planning - Inventory | The concrete screen/component row(s). For design-page rows, usually **many** links. |
| **Vertical Slice** | Link → UI Planning - Vertical Slices | Planning / boundary context. |
| **Queue Order** | Number | Integer sort for “what’s next” (lower = sooner). |
| **Effective Complexity** | Number | Denormalized rank (copy from slice **Complexity** or override per item). |
| **Recommended v0 Model** | Single select | `Use plan default` / `v0 fast` / `v0 balanced` / `v0 quality` — your attended cue when opening v0. |

## Workflow

| Field | Type | Role |
|-------|------|------|
| **Status** | Single select | See [Status values](#status-values). |
| **Session Lock** | Checkbox | You (or the agent) set while working the row to avoid duplicate pickup. |
| **Last Step Actor** | Single select | `Human` · `Cursor Agent` · `v0` · `n8n-future`. |
| **Attempt Count** | Number | Increment on each retry after **Failed**. |

## Prompt & context

| Field | Type | Role |
|-------|------|------|
| **Prompt Draft** | Long text | Full prompt to paste into v0 for this element. |
| **Supplemental Guidance** | Long text | Extra constraints not captured in Inventory (spacing, motion, edge cases). |
| **Global Params Snapshot** | Long text | Optional frozen copy of relevant **Global Parameters** at prompt time (Markdown or JSON). |

## v0 artifacts (attended)

| Field | Type | Role |
|-------|------|------|
| **v0 Chat URL** | URL | Link to the v0 chat for this unit. |
| **v0 Preview URL** | URL | Share/preview link from v0. |
| **v0 Copy Block** | Long text | CLI snippet, code dump, or “what to paste into repo” notes from v0. |
| **v0 Completed At** | Date/time | When you consider v0 output acceptable for integration. |

## Cursor / integration

| Field | Type | Role |
|-------|------|------|
| **Cursor Branch** | Single line | Git branch used for this unit. |
| **Cursor PR URL** | URL | Pull request, if any. |
| **Integrator Notes** | Long text | Files touched, API wiring, follow-ups. |
| **Error Log** | Long text | stderr, test failures, or blocker details. |
| **Integration Completed At** | Date/time | When **`Integrated - Local OK`**. |
| **Prompt Ready At** | Date/time | When **`Prompt Draft`** is ready for v0. |

## Status values

Use **exact** option text (automation-friendly):

1. **Queued** — Eligible to be picked up.
2. **Prompt Drafting** — Agent/human assembling **`Prompt Draft`**.
3. **Ready for v0** — Prompt ready; human pastes into v0 or continues there.
4. **v0 In Progress** — Work happening in v0.
5. **v0 Complete - Awaiting Integration** — Output captured in **`v0 Copy Block`** / URLs; ready for Cursor.
6. **Integrating** — Cursor applying code locally.
7. **Integrated - Local OK** — Tests/build passes in your definition of done.
8. **Failed** — See **`Error Log`**; usually increment **`Attempt Count`** and move back to **Prompt Drafting** or **Queued**.
9. **Blocked** — External dependency; describe in **`Error Log`** or Inventory **Notes**.
10. **Skipped** — Intentionally not doing this unit now.

## Related planning tables

| Table | Table ID | Notes |
|-------|-----------|------|
| UI Planning - Inventory | `tbluISu3XCKl3Berv` | Use new **`Primary Vertical Slice`** to tie elements to slices. |
| UI Planning - Vertical Slices | `tbleD4y1ZbiaCDQ2V` | **Complexity**, **Why boundary**, **Includes**. |
| UI Planning - Global Parameters | `tblapjC9tNanrUCqG` | Stack tokens, brand, API env var *names*. |

Airtable also created inverse **Production Ledger** link fields on **Inventory** and **Vertical Slices** automatically.
