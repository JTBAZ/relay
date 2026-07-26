# v0 prompt — Goals Coach chat (conversational Dream UX, isolated)

> **Product surface:** App-nav **Goals** entry → large anchored chat popover. Not a full `/studio` rebuild. Not Schedule Rail / Library / Analytics.
> **Upstream intent:** Make the Coach Plan **Dream UX** tangible as a chat-shaped, chip-first experience (`[goal-cycle-build-plans/COACH-PLAN-CONVERSATIONAL-UX-PASS.md](./goal-cycle-build-plans/COACH-PLAN-CONVERSATIONAL-UX-PASS.md)`).
> **Scope lock:** Isolate **behavior + visuals of the chat itself**. Ignore connective tissue to the scheduler, rail handoff, media drag-drop, and current Studio page layout (those are changing).
> **Visual note:** Prefer calm dark Studio tokens with **airier** spacing — do not treat today’s Library chrome as sacred.

Copy everything inside the fenced block below into v0. Produce **one coherent interactive prototype with mock data** — no live API.

---

```
You are building an interactive prototype of Relay’s “Goals” coach chat — the conversational front door to monthly planning for creators.

Creators click a nav item labeled **Goals** (not “Coach”). A large, legible chat popover opens, anchored to that nav control. Inside, a warm coach guides them through a short, checkpointed flow using mostly selectable chips. Free-text is secondary and mainly used later to say “adjust the plan like this…”.

ONE coherent implementation. Do NOT deliver alternate layouts. Do NOT rebuild Studio Library, Schedule Rail, Analytics, Goals audit history, or a freeform analytics chatbot.

## Hard product bounds (do not violate)

- Bounded goals only: Engagement · Views · Paid support · Take a break
- If Take a break: expose exactly three modes — Complete silence · Social upkeep · Active rest
- At most TWO clarification moments (chip questions), not unbounded Q&A
- At most TWO AI-style plan revisions (after that, switch to checklist/manual edit only)
- Never invent fake metrics; if a positive note is missing, use a neutral welcome
- Never auto-publish; this prototype stops at a plan card / soft confirm — no rail animation

## Brand & theme (calm studio, visually lightweight)

Use a dark studio palette but keep the chat UI airy and light-feeling (whitespace, one takeaway at a time, minimal chrome):

- Stage / page backdrop: near-black #050706 (minimal — only enough to host the nav + popover)
- Popover surface: #0A0A0A → #121212, 1px border #1f1f1f → #2a2a2a, rounded-2xl, soft shadow
- Accent (mint): #9bf0c4 for primary CTAs, selected chips, progress accents
- Muted text: #888 / #aaa / #666
- Typography: Display/serif Fraunces for the coach greeting / takeaway titles only; body DM Sans everywhere else
- Feel: quiet coach, not neon chatbot, not BI dashboard, not dense form wizard
- Density: Spotify-calm. Prefer one clear question/takeaway per beat over multi-panel dumps

Do NOT recreate the current Library gallery, filter sidebar, or Schedule Rail. A thin fake top nav is enough host chrome.

## Composition (host is disposable)

### Minimal host shell (context only)

- Top sticky app nav pills: Library · Designer · Analytics · **Goals** (Goals is active / highlighted)
- Empty or lightly textured dark stage behind — no gallery grid required
- Clicking **Goals** opens/focuses the coach popover

### Goals coach popover (THE product)

- Anchored to the Goals nav control (prefer below/near the pill; if viewport collision, flip)
- LARGE for legibility: target ~420–480px wide, ~min(72vh, 640px) tall on desktop
- Header: small “Goals” label + quiet credit chip “1 plan credit” (decorative) + dismiss (X)
- Body: chat transcript (scrollable) + sticky composer footer
- Footer:
  - Chip row when the coach is asking something selectable
  - Optional single-line text input (placeholder: “Or type a reply…”) — mostly unused until revise
  - Primary CTA button when a beat requires explicit confirm (e.g. “Looks good — draft the Plan”)

Collapsed state when closed: only the Goals nav pill (icon optional + title “Goals”).

## Interaction spine (mock end-to-end — must work in order)

Implement this as a small client state machine. Each beat appends coach bubbles; user answers via chips (preferred) or rare free text.

### Beat 0 — Closed
Nav shows Goals. Popover closed.

### Beat 1 — Open / Activate
On Goals click:
- Popover opens with a short warm greeting (Fraunces title + one DM Sans sentence)
- Optional positive chip from “last month” — use this fixed mock only:
  - “Last month: +18% engagement on sketch drops”
- If you also show a “no data” path as a toggle in the prototype toolbar, swap to neutral: “Welcome back — ready when you are.”
- Primary chip CTA: “Plan this month”

### Beat 2 — Goal
Coach: “What should the next goal be?”
Selectable option chips (one selection):
- Grow engagement
- Grow views / impressions
- Paid support (Patreon)
- Take a break

If Take a break → second chip row for mode (Complete silence / Social upkeep / Active rest).
Show a one-line help under selection (what Relay can measure / what rest means). Do not frame rest as failure.

Primary continue chip: “Continue”

### Beat 3 — Context (conversational, not homework)
Do NOT show Topic / Niche / Notes form fields.
Coach asks 1 short question with reply chips, e.g.:
- “What’s the vibe this month?”
  Chips: Sketches · WIPs + process · Finished pieces · Mixed

Map the chip under the hood to mock context (topic/niche) — no advanced fields UI unless a tiny “Show advanced” disclosure (collapsed by default).

### Beat 4 — Scan (narrated progress, not a dump)
Coach narrates a short scan with staged progress (2–4 seconds total, skippable “Skip”):
- “Looking at your recent posts…”
- “Checking trends for sketches…”
- Evidence chips (compact): History · Trends · Confidence: medium · Fresh
Default: collapsed sources. Optional expand “Sources & confidence” with 2–3 quiet lines — never a wall of text.
End with ONE takeaway banner:
  Title: “What I noticed”
  Sentence: one clear finding from mock data
  Do not auto-jump to a full plan yet.

### Beat 5 — Soft strategy check (explicit checkpoint)
This is a clear pause BEFORE the plan card — not just another throwaway bubble.

Coach message shape (required copy pattern):
1. Lead: **“Here’s my recommended approach.”**
2. Approach body: 2–4 short sentences with **rationalization** (why this cadence / destination mix fits Ava’s sketches + linked destinations). Example tone: what to post where, how often, and why it’s light enough to keep drawing.
3. Close: **“Is there anything you’d like to adjust or add?”**

UI under that message:
- Takeaway banner title: “Recommended approach” (optional visual frame around the approach body — keep airy)
- Primary chip / CTA: **“Looks good — draft the Plan”** (no changes)
- Secondary path: chips for common adjustments (counts as clarification #1 if used), e.g.:
  - Lighter cadence · Heavier cadence · More Patreon · More X teasers
- Free-text allowed here as a short “adjust or add” reply (maps to clarification / strategy note in mock). If used, coach acknowledges in one line, then proceeds.
- Do NOT skip this beat. Do NOT show the plan checklist until the creator either confirms “Looks good” or finishes one adjust/add turn.

Only after confirm (or one adjust/add turn) proceed to Beat 6.

### Beat 6 — Plan card (itemized, lightweight)
Coach: “Here’s a draft plan.”
Render a compact checklist card (max 5–6 mock rows for the prototype; product max is 8):
Each row: title · local date/time · destination chip(s) · type (post vs upkeep)
Keep it scannable — not a spreadsheet.

Actions:
- Chip: “Looks good” (ends prototype happily with a calm success line: “When you’re ready, you’ll confirm and drop art onto the schedule.” — do NOT animate to a rail)
- Chip: “Adjust the plan…” → Beat 7

### Beat 7 — Revise (free-text allowed here)
Switch composer to emphasize free text:
- Placeholder: “Adjust the plan in the following way…”
- Send appends user bubble; coach returns a revised plan card (swap 1–2 row titles/times in mock)
- Track revision count 1/2 then 2/2
- After 2 revisions: disable AI revise; show “Edit the checklist directly” (allow toggling a row time or destination in-place as a stub)

Never a third AI revision.

## Selectable options (default interaction language)

Prefer chips / segmented choices for:
- goal + break mode
- vibe / context
- cadence / strategy edit
- Looks good vs Adjust

Free-text is decorative/optional in early beats. It becomes meaningful mainly for “Adjust the plan…”.

## Required interactive states

1. Closed → open from Goals nav
2. Greeting with positive chip
3. Goal selection (+ break mode branch)
4. Context chips (no Topic/Niche/Notes homework)
5. Scan progress → single takeaway
6. Soft strategy gate: “Here’s my recommended approach…” + rationalization + “adjust or add?” → Looks good / chip adjust / short free-text
7. Plan checklist card
8. One revise via free text → updated card; second revise then hard-stop to manual stub
9. Dismiss popover (X or click-away) and reopen preserving the current beat (in-memory resume)

Optional prototype toolbar (tiny, outside popover): toggle “weak metrics welcome” and “reset flow”.

## Explicitly out of scope

- Full /studio Library, gallery, filters, Schedule Rail, rail handoff motion
- Goals audit/history page, Analytics dashboards, credit purchase/top-up
- Live APIs, real LLM calls (mock copy only)
- Unbounded chatbot, third clarification, third AI revision
- Auto-publish, media upload, destination OAuth
- Locking layout to today’s Studio page structure

## Motion (2–3 intentional only)

- Popover open: short fade + slight scale (150–200ms)
- New coach bubble: gentle fade/slide
- Scan: progress bar or stepped status lines only
Respect prefers-reduced-motion: instant open, no bubble slide, scan jumps to takeaway.

## React / implementation preferences (for a clean handoff)

- One self-contained Next.js/React + Tailwind prototype
- Keep components local to the coach feature (GoalsNavEntry, CoachPopover, Transcript, ChipRow, TakeawayBanner, PlanChecklistCard) — avoid giant barrel exports
- Chip clicks and beat transitions should be cheap synchronous state updates; don’t over-memoize
- Mock data in one module (fixture creator “Ava”, July planning month)
- Desktop-first; popover must remain usable on ~390px width (full-width sheet fallback OK on small screens)

## Mock fixture (use these names)

Creator: Ava · Focus: sketch drops · Linked: Patreon + X/Twitter (only these appear as destinations)
Positive note: “Last month: +18% engagement on sketch drops”
Strategy recommendation example (Beat 5 body):
“Two sketch teasers on X mid-week keep discovery light; one longer Patreon process post Friday gives supporters something worth the pledge — still room to actually draw.”
Close with: “Is there anything you’d like to adjust or add?”
Plan rows (example):
1. X teaser — Wed 11:00 — X
2. X WIP reply thread cue — Wed evening — X (upkeep)
3. Patreon process post — Fri 17:00 — Patreon
4. X weekend sketch — Sat 12:00 — X

## Deliverable

A single interactive React prototype: minimal nav host + large Goals chat popover, mock-data spine Beats 0–7, chip-first UX, airy dark styling. No alternate concepts. No Studio rebuild.
```

---

## Locked decisions (from grilling)


| Decision      | Choice                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Nav entry     | App nav pill titled **Goals** (not Coach)                                                          |
| Expand        | Large anchored popover from Goals                                                                  |
| Depth         | Greeting → goal → context chips → scan → soft strategy → plan card → revise; stop before scheduler |
| Host chrome   | Disposable / minimal — don’t lock current Studio visuals                                           |
| Free text     | Mostly optional; real for “adjust the plan…”                                                       |
| Visual weight | Same dark tokens, airier / lightweight chat                                                        |
| Soft strategy | Explicit checkpoint: recommended approach + rationalization + “adjust or add?” before plan         |
| Deliverable   | One interactive mock prototype                                                                     |


## #6 rephrased (for the record)

After the scan finishes, should the user hit a clear pause — “Here’s my recommended approach — sound good?” with Accept / Edit — **before** any plan checklist appears?

**Prompt default:** Yes — explicit checkpoint. Copy pattern: “Here’s my recommended approach.” → approach + rationalization → “Is there anything you’d like to adjust or add?” Then Looks good / chips / short free-text before the plan card.

## Wire-later notes (not for v0)

- Bind chips → existing Goal Cycle APIs (`start`, research, questions, generate, revise ≤2, approve)
- Map vibe chips → `context.topic` / niche / notes under the hood
- Resume from active cycle; credit ledger real status
- Only after this chat shape stabilizes: Library host + Schedule Rail handoff motion

