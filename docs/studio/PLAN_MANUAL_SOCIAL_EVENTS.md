# Manual Social Events and Tiering

**Status:** Implemented (schema, service/API, rail merge, Create Event UI, extension packets, Core/Autopost docs)  
**Supersedes:** Phase 8’s post-only `+` scope in [PLAN_PHASE_8_EVENT_MEDIA_ATTACH.md](./PLAN_PHASE_8_EVENT_MEDIA_ATTACH.md) for the Create Event entry path. Media attach for publish-type events remains Phase 8 / PostbotTask-backed.

## Locked product decisions

- Manual scheduler events and basic one-off extension reminders belong to **Studio Core**.
- Existing/generated sequences, AI planning, smart timing, bulk actions, and future recurrence belong to **Autopost**.
- Pasted URLs may create a true standalone reminder (`CreatorScheduleEvent`); they do **not** require a fake Relay post.
- Selecting a Relay post reuses its destination-specific `PlatformInstance`; a missing link prompts for a validated URL and saves it through the platform-link service.
- Gate labor-saving automation, not event vocabulary: Core users may manually create any supported event type.
- **`custom` events are destination-free:** optional raw `http(s)` URL only (email webmail, personal site, Slack deep link, etc.). No platform picker. Strict published-post pattern checks apply only when linking a Library post’s platform instance.
- **Autopost bridge:** Post → New Relay draft (optional multi-platform) creates a nudged Autopost draft with `selected_destinations`, links it via `plan.sourceDraftId`, and surfaces `draft_id` on the rail. Reminders and event popover deep-link that draft so finish work (media, titles, cross-post) resumes in Autopost.
- **Post Create Event dialogue:** format → platforms → when → start (`Add media later` | `Use Library post`). Format is stored as `workspace.planned_format` / plan `assistantPlan.planned_format`; text posts skip `needs_media`. Pasted URL is not part of the Post dialogue. Library path remains a single-destination Core reminder (multi-dest Autopost from Library deferred).
- **Conversational date presets (Core):** Tomorrow / This weekend / End of month / Choose a date resolve to one absolute `due_at` (timezone-aware). Preset labels are not persisted.
- **Recurring routines (Autopost):** After a successful Post create, creators can opt into weekly/monthly series. The rail shows lightweight `recurrence_occurrence` placeholders for the current + next calendar month; only the next actionable occurrence owns an Autopost draft (completion trigger + 7-day lead). Manage at `/studio/autopost/routines`. Feature flag: `RELAY_FEATURE_SCHEDULE_SERIES`.
- **Follow-up social playbooks (Autopost):** After Make a Post (new Relay draft), creators can apply a locked template (Launch Boost, Community Vibe, New Product Update, Evergreen Resurface). Templates compose atomic actions (`reply_block`, `pin_cta_comment`, `repost`, `highlight_fan`, `cta_banner`, `follow_up_post`, `engagement_check`) that materialize as reminder `CreatorScheduleEvent` rows and/or Autopost drafts. Offsets resolve from the Make a Post `due_at`. Timeline preview + per-step toggles before confirm. Feature flag: `RELAY_FEATURE_SOCIAL_PLAYBOOKS`. Coach/LLM should select registry template keys + validated atom overrides only — the apply service remains authoritative.
- **Parked (2026-07-19):** Further playbook template/product expansion is paused until Goal Cycle **VS11** exits. Shipped v1 stays; do not open new playbook batches while VS11-T04…T06 run.
- **Distribution rules (Autopost):** “After a Patreon post is published, wait N days, then prepare previews for …” creates draft-only Autopost previews without mutating source media. Feature flag: `RELAY_FEATURE_DISTRIBUTION_RULES`.
- **Future (not now):** deepen custom reminders with first-party app integrations (Gmail, Slack, Discord, etc.) so Relay can “talk to” those surfaces beyond a plain URL. Leave the model open for an optional `integration_kind` later; v1 stays simple URL / open Relay.

## Persistence

- Model: `CreatorScheduleEvent` (`creator_schedule_events`)
- Exact types: `make_post` | `schedule_post` | `engage_comments` | `pin_comment` | `repost` | `custom`
- **Create Event picker** offers three umbrellas: **Make a Post** (`make_post`), **Manage Socials** (shared path for `engage_comments` / `pin_comment` / `repost`), and **Custom**. It does **not** offer `schedule_post` — same creator job as Make a Post; `schedule_post` remains in the stored taxonomy for Goal Cycle / legacy rail rows. Manage Socials action chips set the exact `event_type` + default title; the rail / EventPopover / extension still show the concrete action name.
- `destination` is **nullable** — null for `custom`
- Status: `pending` | `done` | `dismissed`
- `PostbotTask` remains the Coach / PostBot / Goal Cycle spine.

## Wire contracts

Frozen TypeScript contracts live in `src/distribution/creator-schedule-event-contract.ts`.

| Surface | Notes |
| ------- | ----- |
| Rail DTO | Adds `source` (`postbot_task` \| `manual_event` \| `recurrence_occurrence`) and exact `event_type` |
| Transport `action` | Four-value family + `custom` on rail; extension packets remain four-value |
| Reminder id | Tasks: `schedule_reminder:task:{id}`; manual: `schedule_reminder:manual:{id}` |
| Missing link | `error: "missing_platform_link"` with `post_id` + `destination` |

**Security:** `external_url` is data only — never include full URLs in logs or audit metadata.

## APIs

- `POST /api/v1/creator/schedule-rail/events` — create manual event (Studio Core)
- `PATCH /api/v1/creator/schedule-rail/events/:event_id` — update / complete / dismiss
- `GET /api/v1/creator/schedule-rail/library-posts` — picker rows with destination badges
- `POST /api/v1/creator/schedule-rail/scheduled-posts` — legacy `make_post` draft adapter (unchanged path)
- `GET/POST /api/v1/creator/autopost/schedule-series` — Autopost recurring routines
- `PATCH/DELETE /api/v1/creator/autopost/schedule-series/:series_id` — pause/resume/edit/delete-future
- `POST /api/v1/creator/autopost/schedule-series/:series_id/reconcile` — force horizon + JIT reconcile
- `POST /api/v1/creator/autopost/schedule-series/occurrences/:occurrence_id/materialize` — Prepare now
- `GET/POST /api/v1/creator/autopost/distribution-rules` — Patreon → delayed preview rules
- `GET /api/v1/creator/autopost/distribution-rules/:rule_id/runs` — run history

## Tiering

| Capability | Minimum |
| ---------- | ------- |
| Manual event CRUD, URL repair, one-off reminders, date presets | Studio Core |
| Recurring routines, distribution rules, follow-up social playbooks, Autopost draft bridge | Autopost |
| Coach / Goal Cycle sequences, AI posting assistant, smart timing / bulk | Autopost |
