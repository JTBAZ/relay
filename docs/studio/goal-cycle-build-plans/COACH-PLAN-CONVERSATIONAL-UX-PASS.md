# Coach Plan — Conversational UX Pass (deferred)

**Status:** Shape confirmed for a post–vertical-slice frontend pass. Not in-scope for VS9–VS10 worker batches.  
**When:** VS8 is Done; prefer after VS9 audit surface exists; execute before or alongside VS11 polish gates.  
**Product contract:** [`../GOAL_CYCLE_PRODUCT_CONTRACT.md`](../GOAL_CYCLE_PRODUCT_CONTRACT.md)  
**Current Dream acceptance:** [`../../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md`](../../qa/GOAL_CYCLE_DREAM_FLOW_ACCEPTANCE.md)  
**Program:** [`00-README.md`](00-README.md)

## Shape confirmation

The desired experience keeps the same spine as today’s Dream flow (goal → evidence → clarify → plan → confirm → materialize to rail). The polish pass should make that spine feel **conversational, checkpointed, and low-anxiety**, not replace Library-first planning with a freeform analytics chatbot.

| Desired beat | Maps to today | Polish intent |
|---|---|---|
| Warm greeting + positive last-month note | Launcher / goal entry | Tone + one metric takeaway |
| “What should the next goal be?” | Goal step | Keep selection; warmer framing |
| Scan analytics + trends | Research | Progress as coach narration, not dense dump |
| Findings + soft strategy ask before a Plan | Context + questions (thin today) | Soft recommendation + chat-style reply |
| LLM revises plan from chat (≤2) | Revisions | Chat transcript UX over form revision note |
| Itemized confirm list (posts + upkeep) | Plan + logistics + approval | Checklist / editable schedule preview |
| “You make art; drag into scheduler” | Approval + media-missing | Clear handoff copy + media affordance |
| List items animate onto Schedule Rail | Materialization receipt | Motion / color-coordinated rail handoff |

**Contract tension (resolve before build):** Product contract caps clarification at **two questions** and **two AI revisions**, and rejects freeform chatbot framing. Conversational polish must stay inside those bounds unless the contract is explicitly amended.

---

## Key points (from design debt)

1. **Discovery is too open-ended** — Topic / Niche / Notes ask creators to invent structure they do not have.
2. **Post-analysis is too dense** — Findings dump + Plan appear before cadence / strategy checkpoints feel earned.
3. **Missing soft confirmation before Plan** — Strategy shape (where teasers vs paid piece live, cadence) should be agreed before drafting slots.
4. **Clarification should feel like dialogue** — Captured answers become context; not a blank essay form.
5. **Checkpoints and takeaways** — Every step leaves one clear “what we learned / what we propose next.”
6. **Plan confirm is an itemized schedule** — Editable list of intended posts + upkeep events, aligned with the rail.
7. **Approval is a creative handoff** — AI shapes structure; creator focuses on art and media attach.
8. **Materialization should be watched** — List → rail animation, color-coordinated events.
9. **Current flow already rhymes** — Do not rebuild the program; re-skin and reorder presentation around the existing phases.

---

## Target order of operations (frontend narrative)

1. **Activate** — Warm greeting; optional positive note from last cycle / last month (fallback if metrics weak).
2. **Goal** — “What would you like your next goal to be?” → bounded goal (and break mode if needed).
3. **Scan** — Coach narrates analytics + trend scan (progress + evidence chips, not a wall of text).
4. **Soft strategy** — One recommendation paragraph + “Does that sound good, or edit?” before full Plan generation.
5. **Dialogue revise** — Creator replies in chat; LLM revises Plan (still max two AI revisions).
6. **Itemized confirm** — Checklist of scheduled posts + upkeep; inline edit destinations/times.
7. **Approve** — Confirm; coach states media can come later via drag-drop to scheduler.
8. **Handoff motion** — Checklist rows animate / highlight onto Schedule Rail as color-coordinated events.

---

## Frontend implementation methods

Work as presentation and interaction layers on existing APIs (`start`, research, questions, generate, revise, manual-edit, approve). Prefer extracting Coach presentation components (VS6 pattern) over new routes.

### A. Conversational discovery (replace open Topic/Niche/Notes)

**Key point:** Open fields feel like homework.

**Methods:**
- Replace free text trio with a **short coach transcript**: 1–2 prompt bubbles + reply chips / single text box.
- Map replies into existing `context` fields (`topic`, `niche`, `notes`) under the hood — no new backend fields required for v1 of this pass.
- Optional: one LLM “interview” turn that proposes the three fields from chat (still bounded text); fall back to chips if AI off/mock.
- Keep a “Show advanced context” disclosure for power users who want the raw fields.

**Done when:** A creator can reach research without inventing Topic/Niche/Notes labels themselves.

### B. Clear checkpoints and takeaways

**Key point:** Dense post-analysis lacks a single takeaway.

**Methods:**
- One **takeaway banner** per phase: title + one sentence + primary CTA.
- Collapse evidence into expandable “Sources & confidence”; default show strength/freshness only.
- Progress copy in first person coach voice (“I looked at…”) without chain-of-thought.

**Done when:** Each step answers “what did we decide?” in one glance.

### C. Soft strategy before Plan

**Key point:** Plan appears before cadence/strategy agreement.

**Methods:**
- Insert a **Strategy check** UI beat after research / before `generate`:
  - Show recommended cadence + destination roles (e.g. teaser destinations vs Patreon long-form).
  - Primary: “Sounds good — draft the Plan.”
  - Secondary: chat/edit reply that becomes the first clarification answer or revision note.
- Prefer using the existing **questions** slot for cadence (“How often this month?”) with 3–4 options — stays within the two-question cap.
- Do not call `planner/generate` until soft confirm or question answers are stored.

**Done when:** Generate never runs immediately after a dense research dump without an explicit strategy gate.

### D. Chat-shaped revisions (≤2)

**Key point:** Revision should feel like conversation, not a form note.

**Methods:**
- Present revise UI as a **thread**: coach summary of current Plan → user message → revised Plan card.
- Bind user message to existing `revision_note`; keep `ai_revision_count` / max 2.
- After two revisions, switch to manual itemized edit only (no silent third AI call).

**Done when:** Revision path is readable as a short dialogue and still hits the same revise API.

### E. Itemized confirm list (Plan + logistics + approval)

**Key point:** Confirm shape as a schedule checklist.

**Methods:**
- Unify Plan/Logistics/Approval into a **single confirm surface** with sections, or keep steps but share one `PlanChecklist` component:
  - row = slot title, local time, destinations, media state, upkeep vs new-post.
- Inline edit → existing `manual-edit` / logistics handlers.
- Approval CTA only after checklist is valid (linked destinations, ≤8 slots).

**Done when:** Creator can recite the month’s intended rail events from one list before Approve.

### F. Creative handoff copy + media

**Key point:** After approve, creator should know to make art and attach later.

**Methods:**
- Approval and receipt copy: “Relay shaped the schedule — drop media onto events when ready.”
- Keep media-missing states; link/focus the first rail event that needs media.

**Done when:** Receipt + rail focus make the next creative action obvious.

### G. List → rail motion

**Key point:** Materialization should be watched, not only toasted.

**Methods:**
- On receipt: animate checklist rows toward Schedule Rail (or staged highlight if cross-panel motion is too fragile).
- Color-coordinate event chrome with goal kind / destination tokens already used on the rail.
- Respect `prefers-reduced-motion` (instant focus/highlight fallback).
- Reuse VS7 `onMaterialized` → `refreshAndHighlight` as the source of truth; motion is presentation only.

**Done when:** DF rail handoff remains correct, with optional motion that degrades cleanly.

### H. Warm entry + positive metric note

**Key point:** Activation should feel encouraging.

**Methods:**
- Launcher / first panel: greeting + one **positive** last-month or last-cycle chip (views, engagement, streak).
- If no positive signal: neutral welcome — never fabricate metrics.
- Wire to existing posting-goal / analytics summary endpoints only; no new KPI invention.

**Done when:** Entry feels human without lying about performance.

---

## Suggested frontend pass batches

| Batch | Focus | Depends on |
|---|---|---|
| P0 | Takeaway banners + denser research collapse; strategy gate before generate; cadence as a question chip | After VS8 (Done) |
| P1 | Conversational context (chips/transcript → context fields); chat-shaped revise thread | P0 |
| P2 | Unified itemized confirm checklist; approval handoff copy | P0 |
| P3 | Rail handoff motion + color tokens; reduced-motion path | VS7 receipt stable |
| P4 | Warm entry + positive metric chip | Analytics/posting-goal summary available |

Do not start P1–P4 while VS9 contracts are still moving unless the change is presentation-only and fixture-safe.

---

## Explicit non-goals (unless contract amended)

- Freeform multi-turn analytics chatbot with unbounded questions.
- More than two AI revisions or more than two clarification questions.
- Autonomous publish (creator confirmation stays required).
- Live trend vendors as a UX dependency (fixture/history modes remain valid).
- Replacing Library + Schedule Rail with a Goals-first shell.

---

## Open product decisions (capture before P1)

1. Is **Strategy check** a new Dream phase, or only presentation wrapping research → questions?
2. May cadence/destination-role soft confirm consume **one of the two** clarification questions?
3. Should conversational context **require** AI, or must chip-only path work with `RELAY_AI_PROVIDER=mock`?
4. Any change to allowed linked destinations in copy examples (e.g. DeviantArt) must match real linked set — never promise unlinked destinations as Plan tasks.

---

## Traceability

| Debt theme | Primary UI surfaces | Primary APIs |
|---|---|---|
| Conversational discovery | Context / new transcript | start, checkpoint context |
| Soft strategy | Research → Questions gate | research status, questions, generate |
| Chat revisions | Revisions | revise (≤2) |
| Itemized confirm | Plan, Logistics, Approval | manual-edit, approve |
| Rail theater | Receipt + Schedule Rail | approve receipt, rail refresh |

When this pass is scheduled, add acceptance bullets under Dream DF-03–DF-08 as presentation criteria — do not weaken existing fail conditions.
