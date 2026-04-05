# v0 prompt starter (paste into **Prompt Draft**)

Use this skeleton; delete sections that do not apply.

---

## Context

- **Product**: **Relay** (artist + patron surfaces under one access model). [Expand only if **Global Parameters** define a legal/display variant.]
- **Vertical slice**: [Slice Title] · slug `[Slug from Airtable]`
- **Why this boundary matters**: [paste **Why boundary**]

## Brand identity (Relay) — copy from Global Parameters / Design notes

Keep this block **verbatim** across ledger rows once you finalize it in **UI Planning — Global Parameters** (add keys there if missing: app name, wordmark rules, primary/accent/neutral palette hex, type families, radius, icon style). Paste into **`Global Params Snapshot`** when you draft the row so every run sees the same source.

- **Name in UI**: Relay (not Patronize, Lumen, Fable, or other stand-ins).
- **Voice**: [e.g. calm, tool-native — from Global Parameters]
- **Color / type / density**: [paste token table or bullet list from Global Parameters]
- **Nav labels**: Use **creator vs patron** framing that matches **road map / Design page** vocabulary (e.g. Library, creator areas), not generic SaaS labels unless the brief says placeholders only.

## Single pass (no parallel concepts)

**Each v0 run should produce one coherent implementation, not alternates.**

- Use **one** visual system (colors, type, spacing) aligned with Global Parameters / design tokens.
- **Do not** invent a fictional product name, logo concept, or “example SaaS” framing unless the brief explicitly asks for placeholders.
- **Do not** deliver multiple layout paradigms (e.g. top nav vs sidebar) as competing options—pick the approach stated in this brief (or the Design page notes) and implement it.
- If something is underspecified, **make one reasonable assumption** and note it in the summary—not a second design direction.

## UI element to build

- **Name**: [Element / Page from Inventory]
- **User job**: [User job / need]
- **Priority**: [P0/P1… from Inventory]
- **Dependencies**: [Dependencies]
- **Data sources**: [Data sources]
- **States / empty / error**: [States / Empty / Error]
- **Notes**: [Notes]

## Stack & rules (from Global Parameters)

[Paste or summarize **Global Params Snapshot** — framework, styling, routing, i18n, a11y, etc.]

## v0 preview (no blocking env modals) — Strategy A

**Preview-friendly:** For the **v0 hosted preview only**, do **not** introduce **required** `NEXT_PUBLIC_*` variables (anything that triggers v0’s “Add Environment Variables” modal). Use **inline mock URLs**, **placeholder media**, or **local stub data** for browser-side API/media calls so the chat preview builds with zero env setup.

- Cursor integration will attach the real **`NEXT_PUBLIC_RELAY_API_URL`** and **`RELAY_API_BASE`** from `@/lib/relay-api` when merging into the Relay repo.
- If the brief references `@/lib/relay-api` or real prop contracts, keep **types and prop shapes** for handoff—only the **preview runtime** should stay free of mandatory new public env keys.

## Deliverable

- Framework: [e.g. Next.js App Router + React + Tailwind]
- **Scope**: Implement **only** this element (and minimal adjacent layout if required for demo).
- **Out of scope**: [list]
- **Acceptance**:
  - [ ] Matches states/empty/error described above
  - [ ] Uses tokens/constraints from Global Parameters
  - [ ] No secret values in code (env var names only)
  - [ ] **Strategy A:** v0 preview builds without required new `NEXT_PUBLIC_*` keys (mocks/placeholders only in generated preview)

## Output format requested from v0

Ask v0 to provide:

1. Summary of files created
2. Any install commands
3. Preview/share link
4. “Copy block” for Cursor (single message or ordered steps)

---

_(End of starter)_
