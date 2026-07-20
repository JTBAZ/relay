# Relay Autopost — Build Plan

**Status:** WI-1 through WI-6 and WI-8 landed (including **WI-5** posting goals + nudge worker). WI-7 gap/trend enhancements not started.
**Scope:** A guided posting copilot that walks an artist from a bin of raw work-in-progress media to published, on-brand posts across their connected platforms — with opt-in growth enhancements gated by SaaS tier.
**Related:**

- Suite + tiering: canvas `autopost-suite-tiering.canvas.tsx`
- Feature scoring: canvas `ai-analytics-feature-review.canvas.tsx`
- Business model: `[financial-atlas.md](financial-atlas.md)`
- Cross-post precedent: `[EXTENSION_CROSS_POST_BUILD_PLAN.md](EXTENSION_CROSS_POST_BUILD_PLAN.md)`
- Goal Cycle multi-post planning/materialization: [`studio/goal-cycle-build-plans/00-README.md`](studio/goal-cycle-build-plans/00-README.md)

---

## North Star

One spine product, **Autopost**, that runs a weekly loop with the artist:

**Catch → Nudge → Pick → Draft → Enhance → Distribute**

1. **Catch** *(shipped)* — work-in-progress media auto-lands in the staging bin from Discord (`src/discord/discord-ingest.ts`) or direct upload, as `MediaAsset` rows with `primaryPostId: null`.
2. **Nudge** — a scheduled worker compares the artist's monthly Relay posting goal to Relay-native posts already published this month, then prompts them only when useful.
3. **Pick** — a frictionless grid of staged media; the artist clicks the piece(s) to post.
4. **Draft** — Relay writes copy in the artist's saved **Style Profile** voice, seeded by the Discord caption.
5. **Enhance** — toggleable, tier-gated boosts on the publish-preview (gap fit, trend timing, A/B, multilingual).
6. **Distribute** — the browser extension form-fills/posts to Relay + connected socials; the artist gives one confirm.

The LLM is the **last mile** (drafting, narrating, translating). All metrics and gap/trend signals are computed deterministically in SQL and passed in as facts.

---

## Tier mapping (Good / Better / Best)

Pricing and packaging detail live in the `autopost-suite-tiering` canvas; this plan implements it.


| Tier       | Product       | Price (proposed) | Autopost surface                                                                             |
| ---------- | ------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| **Good**   | Studio Core   | $18/mo flat      | Passive insight only (weekly gap/trend read-outs in the dashboard)                           |
| **Better** | Autopost      | $39/mo flat      | Full pipeline + Style Profile + Gap-fit/Trend-timing + cross-post to Relay/Patreon/X/Bluesky |
| **Best**   | Growth Engine | $79/mo flat      | + Multilingual/regional multi-account, A/B testing, advanced targeting                       |


All tiers are **flat per artist** — never size-tiered by patron count (preserves the financial-atlas "we do not tax your success" promise).

---

## Locked draft semantics (ADR — 2026-06-28)

Product decisions locked for WI-2 / WI-3 / WI-4 implementation:


| #   | Decision                 | Locked choice                                                                                                                                                                                                                                       |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Draft storage**        | **Hybrid (C):** `AutopostDraft` is the preview workspace; **Publish** creates a real Relay `Post` via `createRelayPostTransaction`, then marks the draft `published`.                                                                               |
| 2   | **Visibility**           | **Creator-only.** Drafts never appear on patron feed, discover, or search. Studio/API only.                                                                                                                                                         |
| 3   | **Media reservation**    | **On draft save.** Staged bin media is reserved (`MediaAsset.autopostDraftId`) when the draft is saved; released on discard or after successful publish.                                                                                            |
| 4   | **Publish / distribute** | **Two confirms.** Publish feeds the standard Relay post flow first. Cross-post (Patreon today; X/Bluesky later) is a **separate** extension step. Package assembled from the **merged published post** at distribute time — not from the draft row. |
| 5   | **Access defaults**      | **Artist picks tiers every time** on publish (same as `POST /api/v1/relay/posts`). No Autopost-specific tier defaults.                                                                                                                              |
| 6   | **Scheduled publish**    | **Deferred.** No future `published_at` worker in this slice.                                                                                                                                                                                        |
| 7   | **Lifecycle**            | **One active draft** per creator (`nudged`                                                                                                                                                                                                          |


### Goal Cycle materialization boundary

The Library-first Goal Cycle is a separate bounded planner that reuses Autopost/distribution execution after approval. Its canonical contract is [`studio/GOAL_CYCLE_PRODUCT_CONTRACT.md`](studio/GOAL_CYCLE_PRODUCT_CONTRACT.md).

- Approval is allowed to create multiple **unpublished Relay-native post records**, one per Plan slot, plus post-level distribution plans, variants, PostBot tasks, and rail events.
- These planned records remain creator-only and do not satisfy posting-goal progress until explicit publish.
- The current `AutopostDraft` hybrid rule above remains authoritative for the existing single-post Autopost composer. Goal Cycle VS7 adds explicit `Post.publishState = draft | published` and nullable `PostVersion.publishedAt`; existing rows migrate to `published`. Goal Cycle planned posts use `source = RELAY`, creator-only access, `publishState = draft`, and `publishedAt = null` until creator confirmation. Workers must not use epoch/future timestamps or silently mark planned work published.
- Tier/access selection and cross-posting retain the existing human confirmation gates. Goal Cycle scheduling never authorizes a future worker or extension to click Publish autonomously.
- Media may be attached after materialization; missing media is a visible readiness state, not a fabricated completed draft.

### Style Profile (required before first Autopost draft)

- Artist must save a Style Profile (`PUT /api/v1/creator/style-profile`) before creating an Autopost draft.
- **Tone preset** (required): `none`  `friendly`  `professional`  `warm`  `playful`  `formal` — each ships with a sample paragraph in `GET …/style-profile/presets`.
- `**user_prompt`** (optional): general details or the artist's own wording; when tone ≠ `none`, the LLM cleans it up into post copy.
- `**none` tone:** no AI draft — artist writes body manually every time.
- **Empty title** allowed on draft save; publish uses `"Untitled"` if still blank.

### Posting Goal + Nudge Semantics (ADR — 2026-06-29)

Product decisions locked for WI-5 implementation:

| #   | Decision                    | Locked choice                                                                                                                                                              |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Goal shape**              | Count-only. Creator sets "How many times do you want to post on Relay each month?" No post-type templates, qualitative content detection, or category inference.             |
| 2   | **Onboarding default**      | Required during creator onboarding, default value **1 Relay post/month**. Most Patreon-style creator pages default to 1 main post/month, sometimes 2; start gently at 1.      |
| 3   | **Bonus nudges**            | Optional checkbox: "Suggest an extra post when I have unused media ready." Off unless the creator opts in.                                                                  |
| 4   | **Progress source**         | Count **Relay-native published posts only** for the creator in the current calendar month. Imported Patreon-origin posts do not satisfy the goal. This reinforces Relay as hub. |
| 5   | **Skip / snooze**           | Skip suppresses the goal nudge until the next creator-local calendar month. Snooze suppresses until an explicit timestamp.                                                  |
| 6   | **Nudge placement**         | Dashboard / Studio landing card first. A global banner/toast can follow later, but is not part of the first worker slice.                                                    |
| 7   | **Nudge tone**              | Permission-based: "You asked Relay to help you post..." Never judgmental, never "you failed."                                                                               |
| 8   | **Empty bin behavior**      | If behind pace and the staging bin is empty, offer a low-friction upload/drop modal from the nudge instead of sending the creator elsewhere.                                 |
| 9   | **Auto draft behavior**     | First version does not auto-create a context-free draft. It routes to Autopost when media exists; if no media exists, upload first. Drafting still uses Style Profile + captions. |

---

## Hard Boundaries

- **Human gate on publish.** Distribute always requires an explicit artist confirm. No dark automation, per `analytics-action-center-spec.md` and `growth-analytics-features.md`.
- **No invented numbers.** The LLM never computes metrics. Gap/trend facts are produced by `src/analytics/`* and `src/platform-metrics/`* and passed in as text; the model only narrates. (Enforced by convention in `src/ai/types.ts`.)
- **AI is off by default** and every feature degrades to deterministic copy when AI is disabled/unconfigured (the AI layer returns a `skipped` result, never throws).
- **Patreon-origin / Relay-bedrock.** Autopost composes Relay-owned posts and overlays; it must not mutate imported Patreon-origin snapshots. See `.cursor/rules/patreon-origin-relay-bedrock.mdc`.
- **Extension is a user-triggered form-filler**, not a bot. X/Bluesky distribution follows the same boundary as the Patreon bridge: Relay web sends only identifiers; the backend assembles the package; the artist publishes. See `EXTENSION_CROSS_POST_BUILD_PLAN.md`.
- **Tenant isolation.** All Autopost reads/writes are creator-scoped and pass existing auth guards (`requireAccountMatchesCreator` etc.). Cross-tenant/market signal (Best) is privacy-gated and audited like the operator metrics path.
- **Tier gating is server-side.** Enhancement availability is enforced at the API, not just hidden in the UI.

---

## Data Flow

```mermaid
sequenceDiagram
    participant Cron as NudgeWorker (BullMQ)
    participant API as RelayAPI
    participant Web as RelayWeb (Studio)
    participant AI as src/ai (model-abstraction)
    participant Ext as RelayExtension
    participant Soc as Patreon / X / Bluesky

    Cron->>API: Compare current-month Relay post count to creator posting goal
    API->>Web: Notify "You asked Relay to help you post N/month - want help?"
    Web->>API: Artist picks media_id(s)
    API->>AI: Draft copy (Style Profile + Discord caption facts)
    AI-->>API: Draft text (or skipped -> blank editable draft)
    API-->>Web: Draft + (tier-gated) Gap-fit / Trend-timing facts
    Web->>API: Artist confirms destinations + edits
    API->>Ext: Cross-post package(s) per destination
    Ext->>Soc: Form-fill / post; artist confirms publish
```



---

## Schema (`creator_style_profiles`, `autopost_drafts`, `creator_posting_goals`)

**Status:** migration `20260628120000_autopost_draft_style_profile` — apply through the normal Prisma + Supabase read-check process.

```prisma
/// Better — saved "voice" the AI drafts in. One active profile per creator (+ named variants).
model CreatorStyleProfile {
  id          String   @id @default(cuid())
  creatorId   String   @map("creator_id")
  label       String   @default("Default")
  isDefault   Boolean  @default(true) @map("is_default")
  /// Freeform artist-authored voice/script ("casual, playful, lots of emoji", do/don't, sample post).
  voiceScript String   @map("voice_script") @db.Text
  /// Optional structured knobs (tone, length, hashtags policy) for future UI.
  settings    Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@unique([creatorId, label])
  @@index([creatorId, isDefault])
  @@map("creator_style_profiles")
}

/// WI-5 — creator's simple monthly Relay posting goal.
model CreatorPostingGoal {
  creatorId          String   @id @map("creator_id")
  /// Required during creator onboarding. Default is intentionally gentle: 1 Relay-native post/month.
  monthlyPostTarget  Int      @default(1) @map("monthly_post_target")
  /// Optional: suggest one extra post when the goal is already met and staged media is available.
  bonusNudgesEnabled Boolean  @default(false) @map("bonus_nudges_enabled")
  /// IANA timezone for calendar-month windows. Default UTC until browser/profile timezone is available.
  timezone           String   @default("UTC")
  enabled            Boolean  @default(true)
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  @@map("creator_posting_goals")
}

/// WI-5 — one active/snoozed/skipped nudge per creator/month/type.
model CreatorPostingNudge {
  id          String   @id @default(cuid())
  creatorId   String   @map("creator_id")
  /// Creator-local month key, e.g. "2026-06".
  periodKey   String   @map("period_key")
  /// "posting_goal" | "bonus_post" (kept as string for forward compatibility).
  nudgeType   String   @default("posting_goal") @map("nudge_type")
  /// "active" | "snoozed" | "skipped" | "resolved".
  status      String   @default("active")
  snoozedUntil DateTime? @map("snoozed_until")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@unique([creatorId, periodKey, nudgeType])
  @@index([status, snoozedUntil])
  @@map("creator_posting_nudges")
}

/// Better — a draft assembled by Autopost, awaiting artist review before publish.
/// Complements the existing publish-only POST /api/v1/relay/posts path.
model AutopostDraft {
  id           String   @id @default(cuid())
  creatorId    String   @map("creator_id")
  mediaIds     String[] @default([]) @map("media_ids")
  title        String?
  bodyText     String?  @map("body_text") @db.Text
  /// "nudged" | "drafted" | "previewing" | "published" | "discarded"
  status       String   @default("drafted")
  styleProfileId String? @map("style_profile_id")
  /// Snapshot of enhancement toggles + their deterministic facts at preview time.
  enhancements Json     @default("{}")
  publishedPostId String? @map("published_post_id")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@index([creatorId, status])
  @@map("autopost_drafts")
}

/// Best — translated variants of a post's text. Cached; regenerated only on text change.
model PostTranslation {
  id          String   @id @default(cuid())
  postId      String   @map("post_id")
  /// BCP-47 (e.g. "es", "pt-BR", "ja").
  locale      String
  title       String?
  description String?  @db.Text
  /// "ai" | "human" | "ai_edited"
  source      String   @default("ai")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@unique([postId, locale])
  @@index([postId])
  @@map("post_translations")
}
```

Plus an additive entitlement signal (tier) on the creator/account record, or a dedicated `CreatorPlanEntitlement` table, to gate Better/Best server-side. Reuse existing entitlement plumbing if present before adding a new table.

---

## Work Items


| #   | ID                        | Tier / Dev phase           | Goal                                                                                                                                          | Key paths                                                               |
| --- | ------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | `ai-abstraction-layer`    | Enabler · **done**         | Provider-agnostic text generation; graceful skip; tier routing.                                                                               | `src/ai/`*, `tests/ai-service.test.ts`, `.env.example`                  |
| 2   | `draft-post-enablement`   | Better · Dev T1 · **done** | Hybrid `AutopostDraft` + media reservation; publish via standard Relay post flow.                                                             | `src/autopost/`*, migration, `src/server.ts`                            |
| 3   | `style-profile`           | Better · Dev T1 · **done** | Tone presets + required-before-draft gate.                                                                                                    | `src/autopost/style-profile-service.ts`                                 |
| 4   | `autopost-draft-service`  | Better · Dev T1 · **done** | Compose a draft from staged `media_ids` + Style Profile + Discord caption via `src/ai`; fall back to blank editable draft on `skipped`.       | `src/autopost/`* (new), `src/ai`, staging query                         |
| 5A  | `posting-goal-schema-api` | Better · Dev T1 · **done** | Persist creator monthly Relay post goal + bonus-nudge preference; expose read/write + status APIs.                                            | `prisma/schema.prisma`, migration, `src/autopost/`, `src/server.ts`     |
| 5B  | `posting-goal-onboarding` | Better · Dev T1 · **done** | Wire existing library-review posting cadence to `CreatorPostingGoal` API; add bonus-nudge checkbox; change default from 8 → 1.                  | `web/app/components/onboarding/CreatorLibraryReviewModal.tsx`, `web/lib/relay-api.ts`, `tests/web/creator-library-review-modal.test.tsx` |
| 5C  | `posting-goal-settings`   | Better · Dev T1 · **done** | Let creators adjust the same goal after onboarding in profile/settings.                                                                       | `web/app/studio/designer/profile/CreatorProfileClient.tsx`, API client  |
| 5D  | `posting-goal-status-card`| Better · Dev T1 · **done** | Show dashboard/Studio landing progress and first nudge surface with Start Autopost / upload / snooze / skip actions.                         | `web/app/studio/`*, `web/lib/relay-api.ts`                              |
| 5E  | `posting-goal-worker`     | Better · Dev T1 · **done** | Daily job counts Relay-native posts this month, creates one active nudge per creator/month/type, respects snooze/skip.                        | `src/jobs/`*, `src/autopost/`, `src/main.ts`, `src/worker.ts`           |
| 5F  | `nudge-upload-modal`      | Better · Dev T1 · **done** | If behind pace and bin is empty, allow low-friction upload/drop from the nudge, then route to Autopost.                                       | `web/app/studio/`*, native upload helpers                               |
| 6   | `autopost-compose-ux`     | Better · Dev T1 · **done** | Picker → Draft → Preview flow.                                                                                                                | `web/app/studio/autopost/`*, `web/lib/relay-api.ts`                     |
| 7   | `enhance-gap-trend`       | Better · Dev T1            | Gap-fit + Trend-timing facts on the preview, narrated via `src/ai`. Built on `recommendation-engine.ts` + `platform-metric-trend-service.ts`. | `src/analytics`, `src/platform-metrics`, `src/autopost`                 |
| 8   | `distribute-bluesky-x`    | Better · Dev T1 · **done** | Bluesky API publish + X extension form-fill; shared cross-post package builder.                                                               | `src/extension/cross-post-package.ts`, `extension/src/lib/cross-post-`* |
| 9   | `multilingual`            | Best · Dev T2              | `PostTranslation` store + locale negotiation at read path + cached translation job + per-locale distribution.                                 | schema, `src/gallery/effective-presentation.ts`, `src/ai`               |
| 10  | `ab-and-targeting`        | Best · Dev T2              | Variant generation + measurement; audience/market-trend signal (privacy-gated, audited).                                                      | `src/autopost`, `src/analytics`, `src/platform-metrics`                 |
| 11  | `datachat`                | Best · Dev T2              | Usage-metered "ask my data" via tool-use over creator APIs.                                                                                   | new service + metering/audit                                            |
| 12  | `tier-entitlement-gating` | All · Dev T1               | Server-side enforcement of Better/Best availability + usage metering hooks (`usage_events`).                                                  | entitlements, `src/server.ts`, `src/usage/*`                            |


---

## Suggested Build Order

```mermaid
flowchart TD
    ai["1 ai-abstraction-layer (done)"] --> draft["2 draft-post-enablement"]
    ai --> style["3 style-profile"]
    draft --> svc["4 autopost-draft-service"]
    style --> svc
    svc --> goal["5A-5F posting goals + nudge worker"]
    svc --> ux["6 autopost-compose-ux"]
    ux --> enhance["7 enhance-gap-trend"]
    ux --> distribute["8 distribute-bluesky-x"]
    gating["12 tier-entitlement-gating"] --> enhance
    gating --> distribute
    enhance --> ml["9 multilingual (T2)"]
    distribute --> ml
    ml --> ab["10 ab-and-targeting (T2)"]
    ab --> datachat["11 datachat (T2)"]
```



**Recommended vertical slice (already landed):** 2 → 3 → 4 → 6 → 8 (Relay + Patreon/X path). That ships a working "pick → draft → publish/cross-post" flow before adding the worker nudge and enhancements.

**WI-5 (landed):** 5A → 5F posting goals + nudge worker + Studio card + upload modal. Polish: nudges resolve when the monthly target is met (status read, worker, and Relay publish); Insights Action Hub hydrates live goal/status; onboarding no longer dual-writes `posting_cadence_per_month`.

**Next recommended vertical slice:** 7 (`enhance-gap-trend`), then Best-tier items (9–11) and entitlement gating (12) as needed.

---

## WI-5 Detailed Build Plan — Posting Goals + Nudge Worker

This section is written as a handoff for a Composer 2.5 build agent. Keep slices small; each should build, test, and leave the app in a usable state.

### Product Contract

- The creator goal is a **number of Relay-native posts per calendar month**.
- Default is **1 post/month**.
- Goal setup is **required** during creator onboarding.
- Goal can be adjusted later in creator profile/settings.
- Bonus nudges are optional and off by default.
- Nudge copy must be permission-based: "You asked Relay to help you post..."
- No content-type inference, title/body classification, tags, or qualitative filters.
- Skip applies only to the current creator-local calendar month.
- First nudge surface is the Studio/dashboard card; global toast/banner is a later enhancement.

### 5A — `posting-goal-schema-api`

**Goal:** Add durable posting-goal and nudge state APIs.

**Files to inspect first:**

- `prisma/schema.prisma`
- `src/server.ts`
- `src/creator/onboarding-service.ts`
- `src/autopost/autopost-draft-service.ts`
- Existing tests around creator-scoped routes and onboarding.

**Implement:**

- Prisma migration for `creator_posting_goals` and `creator_posting_nudges` per schema sketch above.
- Service module, suggested path: `src/autopost/posting-goal-service.ts`.
- API client contracts:
  - `GET /api/v1/creator/posting-goal`
  - `PUT /api/v1/creator/posting-goal`
  - `GET /api/v1/creator/posting-goal/status`
  - `POST /api/v1/creator/posting-goal/nudge/:nudge_id/snooze`
  - `POST /api/v1/creator/posting-goal/nudge/:nudge_id/skip`
- Validate `monthly_post_target` as integer `1..31`.
- Default `monthly_post_target` to `1`.
- Default `bonus_nudges_enabled` to `false`.
- Default timezone to `"UTC"` if none provided.
- Status API should count Relay-native published posts only for the current creator-local month.
- Status API should return staged-media count and active nudge state.

**Suggested status shape:**

```ts
type CreatorPostingGoalStatusWire = {
  goal: {
    monthly_post_target: number;
    bonus_nudges_enabled: boolean;
    timezone: string;
    enabled: boolean;
  };
  period: {
    key: string; // e.g. "2026-06"
    start: string;
    end: string;
  };
  posts_this_month: number;
  remaining: number;
  staged_media_count: number;
  pace_status: "on_track" | "behind" | "complete" | "bonus_available";
  active_nudge: null | {
    nudge_id: string;
    nudge_type: "posting_goal" | "bonus_post";
    status: "active" | "snoozed" | "skipped" | "resolved";
    snoozed_until: string | null;
  };
};
```

**Acceptance criteria:**

- `PUT` then `GET` round-trips the goal for the authenticated creator only.
- Missing goal reads as default `1/month` or creates a default row, consistently documented in service tests.
- Status counts only Relay-native published posts in the current month.
- Imported Patreon-origin snapshots do not satisfy the goal.
- Skip and snooze endpoints are idempotent for the creator's current active nudge.

### 5B — `posting-goal-onboarding`

**Goal:** Persist the monthly posting goal during creator onboarding without duplicating UI.

**Important — do not use `StepCreatorProfileBasics`:** Posting cadence is already captured in the Step 5 library review modal, not profile basics (step 4). That modal currently writes `posting_cadence_per_month` into `CreatorOnboardingState.metadata` with a default of **8**. WI-5 consolidates this into the durable `CreatorPostingGoal` table (5A) and aligns the default to **1**.

**Reuse existing code:**

- `web/app/components/onboarding/CreatorLibraryReviewModal.tsx`
  - Phase `"goal"` already has growth-goal selection and a "Planned posts per month" numeric field (`postsPerMonth`, validated 1–60).
  - `handleFinish` saves promo slots + metadata via `patchCreatorOnboarding`.
- `tests/web/creator-library-review-modal.test.tsx`
  - Already asserts `posting_cadence_per_month` in metadata — update to also assert `putCreatorPostingGoal`.
- `web/lib/relay-api.ts`
  - Add posting-goal API types/functions near the Autopost API helpers (depends on 5A).

**Implement:**

- Change `DEFAULT_POSTS_PER_MONTH` from `8` to `1`.
- Update the posting cadence section copy:
  - Label: "How many times do you want to post on Relay each month?"
  - Helper: "Most creators start with 1. Relay uses this only to help you stay on pace."
- Add optional checkbox (initially unchecked):
  - "Suggest an extra post when I have unused media ready."
- On modal open, hydrate from `fetchCreatorPostingGoal` when a row exists; otherwise fall back to `metadata.posting_cadence_per_month`, then default `1`.
- In `handleFinish`, call `putCreatorPostingGoal({ monthly_post_target, bonus_nudges_enabled, timezone })` **before** or alongside the existing onboarding metadata patch.
  - Goal of record is `CreatorPostingGoal` only (no `posting_cadence_per_month` dual-write). Legacy metadata may still be read as a hydrate fallback if no goal row exists.
  - Pass browser timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` when available.
- Require valid monthly target (1–31 per API; modal may keep 1–60 client cap but clamp on save) before finish enables.
- Do **not** add a second posting-goal field to `StepCreatorProfileBasics`.

**Acceptance criteria:**

- Creator cannot finish library review with an invalid post target.
- Default visible value is `1` (not 8).
- Bonus checkbox is optional and initially unchecked.
- Reloading the modal hydrates from `CreatorPostingGoal` when present, else metadata fallback.
- Failure to save goal shows a clear inline error and does not call `onComplete`.
- Existing promo-slot + growth-goal save behavior is preserved.

### 5C — `posting-goal-settings`

**Goal:** Make the onboarding answer adjustable later.

**Reuse existing code:**

- `web/app/studio/designer/profile/CreatorProfileClient.tsx`
- `getCreatorProfile` / `patchCreatorProfile` patterns in `web/lib/relay-api.ts`.

**Implement:**

- Add a "Posting rhythm" section to creator profile/settings.
- Load `fetchCreatorPostingGoal` with the profile.
- Save changes through `putCreatorPostingGoal`.
- Show saved / saving / error state without blocking unrelated profile fields.

**Acceptance criteria:**

- Creator can change monthly target and bonus-nudge checkbox after onboarding.
- Settings defaults to `1/month` if no row exists.
- Invalid values are rejected client-side and server-side.

### 5D — `posting-goal-status-card`

**Goal:** Give creators visible value before the worker exists.

**Likely placement:**

- Studio landing / Library shell around `web/app/studio/GalleryView.tsx`, near the existing onboarding/import surface.
- Keep the first version as a dashboard/landing card, not a global toast.

**Implement:**

- API client for `fetchCreatorPostingGoalStatus`.
- A compact card displaying `posts_this_month / monthly_post_target`.
- States:
  - Complete: "You're on pace: 1 / 1 Relay posts this month."
  - Behind with media: "You asked Relay to help you post 1 time this month. Want to turn something from your bin into a quick post?"
  - Behind without media: "Your bin is empty. Drop a WIP here and Relay will help turn it into a post."
  - Bonus available: "You've hit your monthly goal, and there's still unused media in your bin. Want to prep one extra post?"
- Actions:
  - `Start Autopost` -> `/studio/autopost`
  - `Upload media` -> open upload/drop modal or existing upload entry if modal is deferred to 5F
  - `Snooze`
  - `Skip this month`

**Acceptance criteria:**

- Card uses status API, not client-only counting.
- Copy is permission-based and non-judgmental.
- Snooze / skip update the card state without page reload.
- No global pop-up is introduced in this slice.

### 5E — `posting-goal-worker`

**Goal:** Create nudges in the background.

**Reuse existing job infrastructure:**

- `src/jobs/register-workers.ts`
- `src/jobs/schedule-bullmq-repeat.ts`
- `src/main.ts`
- `src/worker.ts`
- Existing BullMQ / memory backend patterns.

**Implement:**

- Daily repeat job, suggested queue/job id: `posting_goal_nudge`.
- For each enabled `CreatorPostingGoal`:
  - Calculate creator-local current month.
  - Count Relay-native published posts this month.
  - Count staged media.
  - If posts below target and no active/snoozed/skipped current-month `posting_goal` nudge exists, create active nudge.
  - If target met, `bonus_nudges_enabled` is true, staged media exists, and no current-month `bonus_post` nudge exists, create bonus nudge.
- Snoozed nudges should not re-open until `snoozed_until <= now`.
- Skipped nudges remain skipped until next month because uniqueness includes `period_key`.

**Acceptance criteria:**

- Worker is idempotent across repeated runs.
- One active/snoozed/skipped nudge per creator/month/type.
- Skip suppresses only current month.
- Bonus nudge is separate from required-goal nudge.
- Worker never creates or publishes posts.

### 5F — `nudge-upload-modal`

**Goal:** Reduce friction when the nudge fires but the bin is empty.

**Reuse existing upload helpers:**

- `relayNativeUploadInit`
- `putRelayNativeUpload`
- `relayNativeUploadCommit`
- Existing upload/import bay UI patterns in the Library.

**Implement:**

- From the status card's empty-bin state, open a lightweight upload/drop modal.
- Commit uploaded media into the same staging-bin path Autopost already reads.
- After successful upload, refresh status and offer `Start Autopost`.

**Acceptance criteria:**

- Upload from nudge creates staged media visible in Autopost picker.
- Creator can still snooze or skip without uploading.
- No separate media store or source-specific path is introduced.

### Suggested Test Plan

- Backend unit/service tests:
  - monthly window calculation
  - default goal creation/read
  - Relay-native post counting
  - nudge idempotency
  - skip/snooze state transitions
- API route tests:
  - creator scoping
  - validation failures
  - status shape
- Web tests where local patterns exist:
  - `CreatorLibraryReviewModal` field validation + `putCreatorPostingGoal` call
  - settings save
  - dashboard card state helpers
- Manual dev flow:
  - new creator onboarding defaults to 1/month
  - edit goal in profile settings
  - publish one Relay post and confirm status becomes complete
  - empty-bin behind state offers upload
  - skip hides current-month nudge and resets next month via service test

---

## AI layer usage (WI-1, landed)

```ts
import { generateText } from "../ai/ai-service.js";

const result = await generateText({
  tier: "cheap",
  system: "You draft a social post in the artist's saved voice. Use only the facts given. Do not invent numbers or links.",
  messages: [{ role: "user", content: JSON.stringify({ voice, caption, mediaSummary }) }]
});

if (result.ok) {
  // result.text is the draft
} else if (result.skipped) {
  // AI disabled/unconfigured — open a blank editable draft instead
} else {
  // result.error — log + show a non-blocking notice
}
```

Config via env (`RELAY_AI_ENABLED`, `RELAY_AI_PROVIDER`, `RELAY_AI_API_KEY`, `RELAY_AI_MODEL_CHEAP`, `RELAY_AI_MODEL_FLAGSHIP`, `RELAY_AI_MAX_OUTPUT_TOKENS`). See `.env.example`.

---

## Shipped — Insights ↔ Autopost / PostBot context cross-talk

**Status:** shipped. Spec + UX: [`docs/analytics/INSIGHTS_ACTION_HUB_UX.md`](analytics/INSIGHTS_ACTION_HUB_UX.md).

**Problem (was):** Coach propose builds a grounded `fact_pack` / findings report, and creators fill a brief (`PostingAssistantContext`) during Attack Review — but Autopost draft AI and PostBot did not systematically **reuse** Insights-mounted studio context.

**Behavior:**

1. Insights Hub mounts a durable **studio brief** + **latest report** (fact pack / findings).
2. Autopost LLM (`generateAutopostDraftCopy` via `loadStudioMountedContext`) and PostBot task rationales **read** that mounted context.
3. Routine Autopost / PostBot ticks **do not** re-run a full metrics search; refresh only on explicit **Review with AI** / **Frame next posts** / Coach propose.
4. Insights primary CTA: **Frame next posts** → nudged `AutopostDraft` frames (`intent`, optional `performance_goal_id`).

**Acceptance:**

- [x] Brief fields persist at creator scope and are available to Autopost compose without re-entering Transform & route.
- [x] Latest report (or `coach_review` checkpoint proposal) is addressable from Insights “Full report.”
- [x] Autopost draft generation includes brief + report-derived intent when present (`buildAutopostDraftAiFacts`).
- [x] Token/cost path: no automatic second `buildCoachFactPack` on every Autopost open (snippet-only from checkpoint).
- [x] Plan create / PostBot persist merge studio brief under thin `assistant_context` (request wins when set).

**Code:** `src/creator/studio-mounted-context.ts`, `src/autopost/autopost-draft-ai.ts`, `src/distribution/post-distribution-service.ts`, `src/distribution/postbot-task-service.ts`.

---

## Verification Commands

```bash
# AI layer (WI-1)
npx vitest run tests/ai-service.test.ts
npm run typecheck

# Full gates (run at vertical-slice boundaries)
npm run build
npm run test
npm run build --prefix web
```

---

## Return to (follow-ups before enabling in production)

- **Promote `@anthropic-ai/sdk` to a runtime dependency.** It is a devDependency today; the provider lazy-imports it and returns `skipped` if absent, so prod stays safe until promoted. (WI-1)
- **Provider data-handling terms.** Confirm the "no training on API data" posture and surface it in artist-facing copy (the trust wedge). Consider zero-retention tier.
- **Cost metering.** Wire `usage_events` for AI calls (especially Best/Datachat) before usage-metered pricing goes live. (WI-12)
- **Creator-scoped rollups.** Trend-timing (WI-7) and targeting (WI-10) want creator-scoped daily series; today only `system` scope is populated. Populate creator scope or rely on the on-demand windowed services first.
- **Draft semantics.** WI-2 must resolve `PostVersion.published_at` draft semantics that the publish-only guard deferred; coordinate with gallery visibility (`published_at <= now()`).

