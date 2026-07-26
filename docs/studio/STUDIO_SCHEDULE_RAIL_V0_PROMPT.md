# v0 prompt — Studio Schedule Rail (PostBot month cue + sticky reminder toast)

> **Product surface:** persistent narrow schedule rail on Studio Library homepage (`/studio`), beside the existing filter sidebar — not a full calendar app.
> **Upstream loop:** Goals → Insights / Coach → user approves strategy → `PostbotTask` + scheduled variants land on this rail.
> **Companion:** browser-extension sticky toast (mock in this prototype; wire later).
> **Visual grounding:** `[studio-schedule-rail-v0-grounding.png](./studio-schedule-rail-v0-grounding.png)` — attach alongside the prompt in v0.

Copy everything inside the fenced block below into v0. Produce **one coherent interactive prototype with mock data** — no live API. We will wire to Relay afterward. Attach the grounding PNG so layout density and rail↔toast kinship match the mock.

---

```
You are building a persistent “Schedule Rail” for Relay Studio — a dark creator media-management studio. Creators approve PostBot / Coach engagement strategies (e.g. post art → pin comment 12h later → reply + repost day 2). Those planned steps appear as thin event slices on a vertical month rail in the Library homepage sidebar zone. Hovering a slice opens a compact popover to inspect / edit / complete the cue. When an event is due, a sticky in-browser toast (via browser extension, mocked here) reminds them on their active platform page with a link to the post.

ONE coherent implementation. Do NOT deliver alternate layouts. Do NOT build a full calendar app (no month grid, no drag-resize appointments, no Google Calendar sync).

## Brand & theme (must match — dark “studio” aesthetic)

- **Stage background:** near-black **#050706**.
- **Panel / rail surface:** **#0A0A0A** to **#101010**, 1px border **#1f1f1f** to **#2a2a2a**, rounded-2xl (16px) on outer chrome; rail itself may be tighter radius.
- **Primary accent (mint):** **#9bf0c4** for active states, tracker fill, primary links, “Remind me” on.
- **Muted text:** **#888** / **#aaa** / **#666**.
- **Danger:** red only on hover for Delete — never idle red.
- **Typography:** Display/serif **Fraunces** for the rail title only; body **DM Sans** everywhere else. Tabular numbers for counts and times.
- **Feel:** calm, premium, control-room — aesthetic density, not neon, not dashboard clutter.

## Composition (two-panel prototype)

### Panel A — Studio Library shell (primary)

Show a cropped Studio Library homepage so the rail reads as plugged into real Studio chrome:

- Top: thin sticky app nav pills (Library · Designer · Analytics · …) — decorative, non-functional except visual context.
- Below: Library top bar strip (creator identity placeholder, “Autopost” ghost button).
- Main row (left → right):
  1. **Schedule Rail** (NEW — ~72–88px wide collapsed visual axis; expands popover to the right without shoving layout)
  2. **Gallery filter sidebar** (~256px) — muted/simplified: search, Access chips, Tags — not the focus
  3. **Main library grid** — 6–8 dimmed post thumbnails (scrimmed slightly so the rail is the hero of this mock)

The Schedule Rail is ALWAYS visible as its own narrow column — NOT buried inside the filter sidebar scroll.

### Panel B — Extension sticky toast companion (secondary frame)

Beside or below Panel A, show a mock **X / Twitter** (or generic platform) page fragment with a **sticky bottom-right toast** (shadow-DOM style card). This is the reminder that fires when a rail event is due. Toast must NOT auto-dismiss.

---

## Schedule Rail — structure (top → bottom)

### 1. Header
- Eyebrow: “JULY” (or current mock month), small caps, letter-spaced, muted
- Title: “Schedule” in Fraunces (compact)
- Global notify toggle: mint switch + label “Remind me” (on by default in loaded state)
- Tiny “+” affordance for Add custom event (opens popover form: title, datetime, optional link/note, notify checkbox)

### 2. Ready strip (pinned ABOVE the month axis)
- Label: “Ready” muted
- Up to **3** compact chips for undated / when-ready work; if more, “+N more”
- Chip examples:
  - “Drop art assets when ready” (action: post)
  - “Frame: engagement optimization” (nudged draft)
- Chips are actionable (click → same popover pattern, time field shows “When ready”)

### 3. Compound tracker (quiet, under Ready)
- One compact compound meter, NOT two dashboards:
  - Thin cadence bar: “3 / 8 Relay posts” (mint fill)
  - Adjacent or stacked micro-copy: “PostBot 5 / 12 cued”
- Visually quiet — Spotify-density, not BI charts

### 4. Continuous vertical month axis
- Full calendar month as a continuous vertical strip with subtle day ticks / date markers (1 … 31)
- “Today” marker: thin mint hairline or glow tick
- Timed events = **thin horizontal slices** positioned by date (and rough time-of-day within the day band if space allows)
- Slice **color = action family** (not platform, not status-only):
  - post → mint/cream
  - schedule → soft blue
  - pin_comment → amber
  - repost → violet
  - custom → neutral gray/stone
- Slice **thickness** ≈ importance (e.g. initial post thicker than pin comment)
- Done slices: desaturated / lower opacity; keep on rail for month context
- Overdue pending: slightly brighter edge, still action-family color (no screaming red)

### 5. Density overflow
- If a day has many events: show a **cluster** + “+N” chip on that day band
- Clicking +N opens a small **day list** (not a full calendar day view) listing those events; picking one opens the event popover

---

## Event popover (anchored beside the slice — NOT centered modal, NOT right sheet)

On hover (desktop) or tap (touch): anchored popover to the right of the slice.

**Must show (PostBot-complete):**
- Title (e.g. “Pin comment — store CTA”)
- Rationale (1–2 lines from PostBot / Coach)
- Destination chip (e.g. X / Patreon / DeviantArt)
- Time (editable datetime) OR “When ready”
- Link row: “Open post” if URL present (external platform URL)
- Per-event notify override (inherits global; can mute this event)
- Light strategy one-liner when grouped: “Part of: Week engagement · 3 of 5”
- Actions: **Done** (primary mint) · **Edit** (time/title) · **Delete** (danger on hover only)

Do NOT dump full sibling step lists inside the popover. The one-liner is enough.

---

## Mock data (use this shape)

```json
{
  "month": "2026-07",
  "timezone": "America/New_York",
  "remind_me_global": true,
  "cadence": { "posted": 3, "target": 8 },
  "postbot": { "done": 5, "total": 12 },
  "ready": [
    {
      "id": "ready_1",
      "action": "post",
      "title": "Drop art assets when ready",
      "rationale": "Kick off the week engagement farm once assets are uploaded.",
      "destination": "x",
      "link": null,
      "notify": true,
      "plan_label": "Week engagement",
      "plan_index": 1,
      "plan_total": 5,
      "status": "pending"
    },
    {
      "id": "ready_2",
      "action": "post",
      "title": "Frame: engagement optimization",
      "rationale": "Nudged draft from Insights Action Hub.",
      "destination": null,
      "link": null,
      "notify": false,
      "plan_label": null,
      "status": "pending"
    }
  ],
  "events": [
    {
      "id": "evt_1",
      "action": "schedule",
      "title": "Publish character drop",
      "rationale": "PostBot suggests your usual 7pm window from posting history.",
      "destination": "x",
      "at": "2026-07-14T19:00:00-04:00",
      "link": "https://x.com/artist/status/1234567890",
      "notify": true,
      "plan_label": "Week engagement",
      "plan_index": 2,
      "plan_total": 5,
      "status": "done"
    },
    {
      "id": "evt_2",
      "action": "pin_comment",
      "title": "Pin comment — store CTA",
      "rationale": "12h after publish: pin a short follow-up with a clear call to action.",
      "destination": "x",
      "at": "2026-07-15T07:00:00-04:00",
      "link": "https://x.com/artist/status/1234567890",
      "notify": true,
      "plan_label": "Week engagement",
      "plan_index": 3,
      "plan_total": 5,
      "status": "pending"
    },
    {
      "id": "evt_3",
      "action": "repost",
      "title": "Repost / quote for reach",
      "rationale": "Day-2 reshare for followers who missed the drop.",
      "destination": "x",
      "at": "2026-07-16T18:00:00-04:00",
      "link": "https://x.com/artist/status/1234567890",
      "notify": true,
      "plan_label": "Week engagement",
      "plan_index": 4,
      "plan_total": 5,
      "status": "pending"
    },
    {
      "id": "evt_4",
      "action": "custom",
      "title": "Payday — set aside ad budget",
      "rationale": null,
      "destination": null,
      "at": "2026-07-18T09:00:00-04:00",
      "link": null,
      "notify": false,
      "plan_label": null,
      "status": "pending"
    },
    {
      "id": "evt_cluster_a",
      "action": "post",
      "title": "Teaser on Patreon",
      "at": "2026-07-20T12:00:00-04:00",
      "destination": "patreon",
      "notify": true,
      "status": "pending"
    },
    {
      "id": "evt_cluster_b",
      "action": "schedule",
      "title": "DA mirror upload",
      "at": "2026-07-20T14:00:00-04:00",
      "destination": "deviantart",
      "notify": true,
      "status": "pending"
    },
    {
      "id": "evt_cluster_c",
      "action": "pin_comment",
      "title": "Reply to top comment",
      "at": "2026-07-20T16:00:00-04:00",
      "destination": "x",
      "link": "https://x.com/artist/status/1234567890",
      "notify": true,
      "status": "pending"
    }
  ]
}
```

Use July 20 cluster to demonstrate **+N overflow** → day list → popover.

---

## Panel B — Sticky toast (must-dismiss)

Mock a dark platform page background with a fixed bottom-right toast card:

- Does **NOT** auto-dismiss; no progress-bar countdown
- Copy: **“Event — Retweet post”** (or match `evt_3` title)
- Secondary line: short rationale or destination
- Primary link button: **Open post** → the event `link` URL
- Actions: **Dismiss** (required to clear) · **Snooze** (e.g. 1h) · optional **Done**
- Visual kinship with Studio (dark surface, mint accent) but clearly an overlay on a foreign page
- Show this toast as if `evt_2` or `evt_3` just fired while Remind me is on

---

## Required interactive states (prototype)

1. **Loaded month** — Ready chips + slices + compound tracker + Remind me on
2. **Empty / sparse** — Quiet empty month axis, Ready empty message “Approve a Coach plan to cue steps”, tracker at 0 — do NOT invent filler events
3. **Hover / focus slice** — Anchored popover with full PostBot-complete fields
4. **Day overflow** — +N cluster → day list
5. **Toggle Remind me off** — global off; toast panel shows muted “Reminders paused” note
6. **Mark Done** from popover — slice desaturates; PostBot counter increments
7. **Add custom** — minimal create popover; new slice appears on axis
8. **Toast companion** — sticky until Dismiss / Snooze

---

## Explicitly out of scope

- Full month grid / week pager / drag-and-drop reschedule on the axis
- OS push notifications / browser Notification API
- Auto-publishing or clicking platform Publish
- Rebuilding Insights Action Hub, Coach Attack Review, or Distribution sheet inside the rail
- Recurring event rules, multi-attendee, Google Calendar sync
- Finance / ROI charts

## Motion (2–3 intentional only)

- Slice hover: slight brighten + popover fade/scale 150–200ms
- Mark done: opacity settle
- Toast: slide-up once on load of companion panel (not looping)

## Deliverable

A single self-contained interactive React prototype (Tailwind OK) with the mock JSON above, Panel A + Panel B, and the states listed. Prefer desktop-first; rail remains usable if the filter sidebar collapses on smaller widths.

```

---

## Locked FE IA (source of truth for this prompt)

| Decision | Choice |
|----------|--------|
| Time axis | Continuous vertical month strip |
| Slice encoding | Color = action family; thickness ≈ importance |
| Detail | Anchored popover; PostBot-complete fields + plan one-liner |
| Ready | Top of rail; ~3 + more |
| Tracker | Dual compound cadence + PostBot completion |
| Notify | Global + per-event override |
| Overflow | Cluster +N → day list |
| Toast in v0 | Companion frame with sticky must-dismiss toast |

## Wire-later notes (not for v0)

- Creator-scoped list of `PostbotTask` + variants in creator TZ month window
- Extension message channel for sticky toasts (extend post-link toast craft; no 15s auto-dismiss)
- Relative “+12h after post” → absolute `suggested_time` at approval or undated until link exists
```

