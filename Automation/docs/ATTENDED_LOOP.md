# Attended loop — one ledger row end-to-end

## 0. Preconditions

- **Inventory** rows have **`Primary Vertical Slice`** set where possible.
- **Production Ledger** row exists with **`UI Element`**, **`Vertical Slice`**, **`Queue Order`**, **`Effective Complexity`**, **`Status`** = `Queued`.
- Cursor has **Airtable MCP** enabled with access to base **Project tracker**.

## 1. Claim work (human or agent)

On the chosen ledger row:

1. Set **`Session Lock`** = checked (or verify no other operator is on it).
2. Set **`Status`** → `Prompt Drafting`.
3. Set **`Last Step Actor`** → `Cursor Agent` (if the agent starts) or `Human`.

## 2. Assemble context

Agent (or you) loads:

- Linked **UI Element**: Element/Page, job, priority, dependencies, data sources, states/errors, notes.
- Linked **Vertical Slice**: title, slug, includes, complexity, why boundary.
- **Global Parameters** (table or filtered subset): snapshot into **`Global Params Snapshot`** for a reproducible prompt.

Write **`Prompt Draft`** using [`../templates/v0-prompt-starter.md`](../templates/v0-prompt-starter.md).

Set **`Prompt Ready At`** (now).

Set **`Status`** → `Ready for v0`.

## 3. v0 (attended)

**One ledger row ⇔ one primary chat.** Running **`ledger-to-v0`** (or clearing **`v0 Chat URL`** and running it again) creates a **new** v0 chat each time—same brief, unrelated generations. That burns quota and produces “triplicate” explorations. Prefer **follow-up messages in the same chat** to refine; only start a **new** chat when you deliberately want a fresh pass.

1. Open v0; pick model implied by **`Recommended v0 Model`**.
2. Paste **`Prompt Draft`** (from [`v0-prompt-starter.md`](../templates/v0-prompt-starter.md) it includes **Strategy A**: no required `NEXT_PUBLIC_*` for the hosted preview—mocks/placeholders only). Runs of **`ledger-to-v0`** append the same block automatically. If v0 still asks for env vars, reply in-chat to remove mandatory `NEXT_PUBLIC_*` per Strategy A.
3. Iterate **in this chat** until the shell matches the brief.
4. Save **`v0 Chat URL`** and **`v0 Preview URL`**.
5. Copy export / code instructions into **`v0 Copy Block`** (or summarize paths/components).
6. Set **`v0 Completed At`**.
7. Set **`Status`** → `v0 Complete - Awaiting Integration`.
8. **`Last Step Actor`** → `Human` or `v0` as you prefer for auditing.

## 4. Integrate in Cursor

1. Set **`Status`** → `Integrating`.
2. Agent reads **`v0 Copy Block`** + preview; applies files under your repo conventions.
3. Run project checks (typecheck, lint, tests) — record command + result in **`Integrator Notes`** or **`Error Log`**.
4. On success: **`Status`** → `Integrated - Local OK`, **`Integration Completed At`**, clear **`Session Lock`**, increment success metrics as you like.
5. On failure: **`Status`** → `Failed`, fill **`Error Log`**, increment **`Attempt Count`**, clear **`Session Lock`** when done triaging.

## 5. Next item

Query **Production Ledger** for:

- `Status` = `Queued`
- `Session Lock` = unchecked (or empty)

Sort: **`Queue Order`** asc, then **`Effective Complexity`** desc (or the opposite—pick one team convention).

Repeat from step 1.

## Optional tightening later

- **Airtable Automations** for Slack/email on `Failed`.
- **n8n/Make** when you want v0 API + webhooks without opening Cursor.
- **Formula / rollup** fields for auto **`Effective Complexity`** from slice (reduces copy/paste).
