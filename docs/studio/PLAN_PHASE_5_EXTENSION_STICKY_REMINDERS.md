# Phase 5 brief — Extension sticky reminders

**Status:** Implemented — verify sticky toast on a matching platform tab with extension grant  
**Master roadmap:** `[PLAN_STUDIO_RENOVATION_MASTER.md](./PLAN_STUDIO_RENOVATION_MASTER.md)`  
**Prior phases:** Phase 4 Schedule rail production data — `[PLAN_PHASE_4_SCHEDULE_RAIL_DATA.md](./PLAN_PHASE_4_SCHEDULE_RAIL_DATA.md)` (**hard dependency**). Phase 3 Linked Sets is **not** required.

---

## Goal

When a due PostBot / schedule step has Remind me effectively on, show a **must-dismiss sticky toast** on the creator’s active matching platform tab (Open · Done · Snooze · Dismiss), reusing post-link toast craft but **not** the 15s auto-dismiss lifecycle — so rail cues become real extension packets, not Studio-only stubs.

## Exit criteria

1. Due opted-in PostBot/schedule step → sticky toast on Relay web **or any** product social host (not destination-only).
2. Toast offers action-typed primary/secondary CTAs · Done · Snooze · Dismiss; **no** auto-dismiss / progress-bar timeout; hide primary Open when URL is null.
3. Global + per-event Remind me **persist** and gate firing; Done updates task status and survives refresh; Dismiss/Snooze do not re-fire until allowed.

---

## Frozen decisions (v1)

| Topic | Decision |
| ----- | -------- |
| **Scope atom** | Extension channel is **task-centric only**. `reminder_id` = `schedule_reminder:task:{task_id}`. Variant-only calendar rows without a `PostbotTask` do not fire sticky toasts. |
| **Due time** | Same as Phase 4 rail: `due_at = variant.scheduledFor ?? task.suggestedTime`. Eligible when `due_at <= now` and `status === "pending"`. |
| **Effective notify** | `CreatorPostingGoal.remindMeGlobal === true` **AND** per-event notify. Per-event: `PostbotTask.remindMe` if non-null, else `PostDistributionVariant.remindMe`. |
| **Toast actions** | **Open · Done · Snooze · Dismiss**. No auto-dismiss / progress bar. |
| **Done** | `PATCH /api/v1/creator/postbot-tasks/:task_id` `{ status: "done" }` with extension Bearer. Also set `reminderSentAt = now` on the task. |
| **Dismiss (toast)** | Consume only: `reminderSentAt = now`; clear toast. Does **not** set task `dismissed`. No re-fire until `due_at` moves or status leaves pending. Distinct from rail Delete (`status: "dismissed"`). |
| **Snooze** | Default **60** minutes. Set `snoozedUntil = now + N`; **clear `reminderSentAt`**. Eligible again after `snoozedUntil`. |
| **Show marker** | On first successful toast inject, set `reminderSentAt = now` so 5m polls do not re-spam. Snooze clears it; Dismiss leaves it set. |
| **Dual channels** | In-app `distribution-schedule-reminder-worker` keeps using **variant** `reminderSentAt`. Extension uses **task** fields. No coupling; do not delete the worker. |
| **Global persist** | `CreatorPostingGoal.remindMeGlobal` (default `true`). Rail toggle → posting-goal PATCH; schedule-rail reads it. |
| **Per-event persist** | When `task_id` present, write `PostbotTask.remindMe` and mirror `variant.remindMe`. Rail `notify` prefers task then variant. |
| **Auth** | `/api/v1/extension/schedule-reminders/*` require `SessionKind.extension`. Done reuses creator postbot PATCH (Bearer). |
| **Bluesky** | Include `bsky.app` in host map + toast labels. |
| **Queue** | At most one sticky visible; extra due packets wait in background memory until current clears. |

### Addendum — Action-typed CTAs + inject hosts

| Topic | Decision |
| ----- | -------- |
| **Inject surface** | Fire on **Relay web** (`localhost` / `127.0.0.1` / `relayapp.me`) **or any** product social host (`patreon.com`, `x.com`/`twitter.com`, `deviantart.com`, `bsky.app`). Do **not** require tab host to match `packet.destination`. Prefer the active tab when multiple match. |
| **Packet CTAs** | `primary_cta` / optional `secondary_cta` (`kind`, `url`, `label`) + `media_ready`. Keep `open_url` as external resolution; primary uses `primary_cta.url`. |
| **Hide dead Open** | Do not render the green primary when `primary_cta.url` is null. |

**CTA matrix**

| `action` | `media_ready` | `primary_cta` | `secondary_cta` |
| -------- | ------------- | ------------- | --------------- |
| `repost` / `pin_comment` | n/a | `external_post` + resolved URL; label `Open on {Dest}` / `Open post` | if null external → `relay_studio` `{RELAY_WEB}/studio` (`Open in Relay`) |
| `post` | false | `relay_studio` `{RELAY_WEB}/studio` (`Finish media in Studio`) | null |
| `post` | true | `relay_autopost` `{RELAY_WEB}/studio/distribution?event_id={task_id}` (`Review and send`) | external URL if known (`Open on {Dest}`) |
| `schedule` | n/a | `relay_studio` `{RELAY_WEB}/studio` (`Review in Relay`) | external if known |

**Scheduled-post review:** Due post tasks open `/studio/distribution` (not Autopost composer). Studio Core reviews exact authored text and hands off; Autopost may prepare platform variants only after an explicit action on that existing Rail plan. Incomplete posts recover to Studio. Legacy `?draft_id=` links for Rail-linked drafts redirect into the same review route.

---

## In scope

- Freeze `ScheduleReminderPacket` + effective-notify formula (global ∧ per-event)
- Schema: `PostbotTask.remindMe`, `reminderSentAt`, `snoozedUntil`; creator `remindMeGlobal` on `CreatorPostingGoal`
- Due query service + extension HTTP (`GET due`, snooze, dismiss-consume / presented)
- New sticky reminder content script (shadow-DOM kinship with post-link toast; separate lifecycle)
- Extension message types + `browser.alarms` poll (~5m)
- Tab host ↔ destination matching; idempotent `reminder_id` so polls do not duplicate
- Wire Done → existing task status PATCH (extension Bearer grant); Snooze / Dismiss → new endpoints
- Persist Schedule rail global Remind me + EventPopover per-event notify (complete Phase 4 deferrals)
- Open URL resolution: `PostbotTask.link` else latest attempt / `PlatformInstance.external_url`
- Keep existing in-app `distribution_schedule_reminder` worker (do not delete)

## Out of scope (do not build)

- Auto-click Publish on platform tabs
- Replacing or disabling the post-link confirmation toast (15s auto-dismiss stays)
- OS / desktop `Notification` API
- Google Calendar / life-OS sync
- Re-running Insights / Coach
- Linked Sets / hero packaging (**Phase 3 / 6**)
- Studio Library chrome polish / virtualization (**Phase 7**)
- Inventing a second schedule data spine apart from Phase 4 wire events
- Variant-only sticky toasts (no `PostbotTask`)

---

## Dependencies

| Dependency | Role |
| ---------- | ---- |
| Phase 4 schedule-rail wire | Stable `task_id`, `variant_id`, `post_id`, `destination`, `link`, `notify` / `remind_me` on rail events — `[PLAN_PHASE_4_SCHEDULE_RAIL_DATA.md](./PLAN_PHASE_4_SCHEDULE_RAIL_DATA.md)` |
| `[post-link-toast.ts](../../extension/src/content/post-link-toast.ts)` | Shadow-DOM craft / mint styling **only** — do not change auto-dismiss |
| Extension grant auth | Bearer from `storage.getGrant()` for due/snooze/done |
| `PATCH /api/v1/creator/postbot-tasks/:id` | Done status (extension Bearer via `requireAccountWithRole`) |
| Variant `remindMe` / `reminderSentAt` | Fallback per-event notify + in-app worker channel — `[distribution-schedule-reminder-worker.ts](../../src/distribution/distribution-schedule-reminder-worker.ts)` |
| IA / sticky UX | `[STUDIO_SCHEDULE_RAIL_V0_PROMPT.md](./STUDIO_SCHEDULE_RAIL_V0_PROMPT.md)`; `.tmp/schedule-rail-v0/components/relay/StickyToast.tsx` |

**Does not require:** Phase 3 Linked Sets, Phase 6 hero.

---

## Data contract

### Effective notify (must document in code comments too)

```
effective_notify =
  creator.remind_me_global === true
  AND per_event_notify === true
```

**Per-event notify source of truth (v1):**

1. Prefer `PostbotTask.remindMe` when the column is set (non-null).
2. Else fall back to linked `PostDistributionVariant.remindMe`.
3. Rail EventPopover + global toggle write these fields via APIs (not local-only).

**Due eligibility (task-centric):**

- `status === "pending"`
- `due_at = variant.scheduledFor ?? task.suggestedTime` and `due_at <= now`
- `effective_notify === true`
- `snoozedUntil` is null or ≤ now
- `reminderSentAt` is null (cleared on snooze; set on show / dismiss / done)

### Packet

```ts
type ScheduleReminderPacket = {
  reminder_id: string; // `schedule_reminder:task:{task_id}`
  task_id: string;
  variant_id: string | null;
  post_id: string;
  destination: "patreon" | "x" | "deviantart" | "bluesky";
  action: "post" | "schedule" | "pin_comment" | "repost";
  title: string;
  open_url: string | null;
  due_at: string; // ISO
  plan_label: string | null;
  plan_index?: number;
  plan_total?: number;
};
```

### Action semantics

| Toast action | Effect |
| ------------ | ------ |
| **Open post** | `window.open(open_url)` when non-null; if null, show muted “No link yet” (still allow Dismiss/Snooze/Done) |
| **Done** | `PATCH .../postbot-tasks/:task_id` `{ status: "done" }`; set `reminderSentAt = now`; clear toast |
| **Dismiss** | Consume reminder (`reminderSentAt = now`) **without** completing the task; clear toast; no re-fire this due cycle |
| **Snooze** | `POST .../snooze` `{ snooze_minutes }` (default **60**); set `snoozedUntil`; clear `reminderSentAt`; clear toast |

Rail **Delete** (Phase 4) remains `status: "dismissed"` on the task — distinct from toast **Dismiss** (reminder consume only).

### Schema (extend existing — no LinkedSet/calendar table)

| Field | Model | Notes |
| ----- | ----- | ----- |
| `remindMeGlobal` | `CreatorPostingGoal` | Default `true` to match rail IA; maps to wire `remind_me_global` |
| `remindMe` | `PostbotTask` | Nullable bool; null → fall back to variant |
| `reminderSentAt` | `PostbotTask` | Idempotency for extension channel |
| `snoozedUntil` | `PostbotTask` | Snooze gate |

In-app worker keeps using variant `reminderSentAt` only.

### Extension HTTP

```http
GET  /api/v1/extension/schedule-reminders/due
POST /api/v1/extension/schedule-reminders/:reminder_id/dismiss
POST /api/v1/extension/schedule-reminders/:reminder_id/snooze
Body: { "snooze_minutes": 60 }
POST /api/v1/extension/schedule-reminders/:reminder_id/presented
```

`presented` sets `reminderSentAt = now` (same consume as dismiss for show-marker; dismiss is explicit user action).

Done may reuse:

```http
PATCH /api/v1/creator/postbot-tasks/:task_id
Body: { "status": "done" }
```

**Auth:** extension Bearer + `SessionKind.extension` on extension routes; Done uses creator postbot PATCH with Bearer.

**Response for due:** `{ reminders: ScheduleReminderPacket[] }` — typically 0–few; client shows one sticky at a time (queue locally if multiple).

### Open URL resolution order

1. `PostbotTask.link` if non-empty  
2. Latest successful distribution attempt `external_url` for `(post_id, destination)`  
3. `PlatformInstance.external_url` for that pair  
4. `null`

### Tab matching

| `destination` | Host match (examples) |
| ------------- | --------------------- |
| `x` | `x.com`, `twitter.com` |
| `patreon` | `patreon.com` |
| `deviantart` | `deviantart.com` |
| `bluesky` | `bsky.app` |

Inject only when an open tab matches; if no matching tab, skip inject (next poll retries) — do not fall back to OS notifications.

---

## File touch list

| Path | Action |
| ---- | ------ |
| `[prisma/schema.prisma](../../prisma/schema.prisma)` | **Edit** — task remind/snooze fields; `CreatorPostingGoal.remindMeGlobal` |
| Prisma migration | **Create** |
| `src/distribution/schedule-reminder-extension-api.ts` (new) | **Create** — due query, dismiss, snooze, presented, open_url resolve |
| `[src/distribution/postbot-task-service.ts](../../src/distribution/postbot-task-service.ts)` | **Edit** — remind field updates on done; patch remindMe |
| `[src/autopost/posting-goal-service.ts](../../src/autopost/posting-goal-service.ts)` | **Edit** — read/write `remindMeGlobal` |
| `[src/distribution/schedule-rail-service.ts](../../src/distribution/schedule-rail-service.ts)` | **Edit** — live `remind_me_global`; task-prefer `notify` |
| `[src/server.ts](../../src/server.ts)` | **Edit** — extension due/dismiss/snooze/presented; posting-goal remind field |
| `[extension/src/content/schedule-reminder-toast.ts](../../extension/src/content/schedule-reminder-toast.ts)` (new) | **Create** — sticky UI; no `AUTO_DISMISS_MS` |
| `extension/src/lib/schedule-reminder-types.ts` (new) | **Create** — packet + helpers |
| `extension/src/lib/schedule-reminder-listener.ts` (new) | **Create** — poll result → tab match → inject |
| `[extension/src/lib/messages.ts](../../extension/src/lib/messages.ts)` | **Edit** — `MSG_SCHEDULE_REMINDER_*` |
| `[extension/src/background.ts](../../extension/src/background.ts)` | **Edit** — alarm, fetch due, handlers |
| Extension build (`build.mjs` / vite content config) | **Edit** — bundle new content script |
| `[web/app/components/schedule-rail/StudioScheduleRail.tsx](../../web/app/components/schedule-rail/StudioScheduleRail.tsx)` | **Edit** — persist global remind |
| `[web/app/components/schedule-rail/EventPopover.tsx](../../web/app/components/schedule-rail/EventPopover.tsx)` / ScheduleRail | **Edit** — persist per-event notify via task |
| `[web/lib/relay-api.ts](../../web/lib/relay-api.ts)` | **Edit** — client helpers for global/per-event remind |
| Tests | **Create** — due filter, effective notify, snooze, idempotency |

**Do not edit:** post-link confirm semantics (`MSG_POST_LINK_*`, 15s dismiss); Insights / Coach UI; Active Posts Phase 2/3 cards; in-app worker deletion.

---

## Ordered todos (builder)

1. **Freeze packet + notify model** — Codify in this pack (done above).
2. **Schema + migration** — Add task remind/snooze + `remindMeGlobal`; regenerate client.
3. **Due query service** — Creator-scoped due list + open_url + `reminder_id`; unit tests.
4. **Extension HTTP** — `GET due`, dismiss, snooze, presented; 401 without extension grant.
5. **Message types** — `MSG_SCHEDULE_REMINDER_*` between content ↔ background.
6. **Sticky toast UI** — Open / Done / Snooze / Dismiss; no progress bar; no auto-dismiss.
7. **Tab match + poll** — `browser.alarms` (~5m); fetch due; match host; inject; queue one sticky.
8. **Wire Done / Snooze / Dismiss** — Background APIs with grant; clear toast.
9. **Persist rail Remind me** — Global → `remindMeGlobal`; notify → task/variant `remindMe`.
10. **Verify** — Checklist below; stop (no Phase 6).

---

## Verify checklist

- Due + effective notify on → sticky toast on Relay or any social host (prefer active tab)
- CTA matrix: repost/pin → platform; post empty → Finish media in Studio; post ready → Review and send (`/studio/distribution?event_id=…`); schedule → Review in Relay
- No auto-dismiss; primary uses `primary_cta.url`; no green Open when URL is null
- Dismiss does not re-fire on next poll; Snooze defers; Done marks task done and survives refresh
- Global off **or** per-event mute → no toast
- Post-link confirmation toast still auto-dismisses at 15s and still confirms links
- In-app `distribution_schedule_reminder` notifications still function for variant schedule path
- No OS notifications; no Publish auto-click
- Multiple due items: at most one sticky visible; others wait without spamming

---

## Do-not-do list

- Do not replace or disable the post-link toast
- Do not ship toast stubs without real Done / Snooze / Dismiss APIs
- Do not fire when effective Remind me is off
- Do not require Phase 3 or Phase 6
- Do not invent a second schedule data spine apart from Phase 4 wire events
- Do not hard-delete tasks from the toast (Done / dismiss-consume only)
- Do not use OS Notification API as a substitute for the sticky toast
- Do not auto-click Publish

---

## Reference assets

- Master Phase 5 stub + dependency `Phase4 → Phase5`
- IA companion: `[STUDIO_SCHEDULE_RAIL_V0_PROMPT.md](./STUDIO_SCHEDULE_RAIL_V0_PROMPT.md)`
- v0 sticky UX: `.tmp/schedule-rail-v0/components/relay/StickyToast.tsx` (**reference only**)
- Craft kinship: `[extension/src/content/post-link-toast.ts](../../extension/src/content/post-link-toast.ts)`
- In-app precursor: `[distribution-schedule-reminder-worker.ts](../../src/distribution/distribution-schedule-reminder-worker.ts)`
- Phase 4 handoff fields: `[PLAN_PHASE_4_SCHEDULE_RAIL_DATA.md](./PLAN_PHASE_4_SCHEDULE_RAIL_DATA.md)` § Handoff to Phase 5
