# Insights Action Hub UX (Coach + Autopost loop)

**Status:** shipped (Action Hub tranche) — shell + studio brief + checkpoint report mount + Frame/Review/Continue CTAs on `/studio/analytics`. Autopost / PostBot mounted-context cross-talk is **shipped** (brief + coach_review snippet on draft AI and plan finalize; no `buildCoachFactPack` on Autopost open). See [`AUTOPOST_BUILD_PLAN.md`](../AUTOPOST_BUILD_PLAN.md).

**Ops note:** `creator_studio_briefs` is live. Schema was applied via Supabase MCP (`apply_migration`); Prisma history rows were synced via MCP after local `prisma migrate` hit **P1001** to `db.*.supabase.co:5432`. Prefer MCP for DB ops when direct Postgres is unreachable.

**RLS:** `creator_studio_briefs`, `creator_feature_flags`, and `autopost_drafts` use the repo lockdown pattern (`ENABLE ROW LEVEL SECURITY`, no PostgREST policies). Relay API Prisma still bypasses RLS; Data API / `anon` / `authenticated` get implicit deny.

**Related:** [`../AUTOPOST_BUILD_PLAN.md`](../AUTOPOST_BUILD_PLAN.md) (cross-talk shipped), Autopost drafts checkpoint plan (docket), Coach Attack Review + `CoachFactPack`, nudged `AutopostDraft` plumbing. The broader multi-post, research-to-schedule experience is owned by the [`Goal Cycle worker program`](../studio/goal-cycle-build-plans/00-README.md); its primary entry is Library and its secondary `/studio/goals` route audits evidence/outcomes. Analytics supplies evidence and deep links rather than duplicating that planner.

---

## Hierarchy (Hero + Silver only)

| Zone | Width | Role |
|------|--------|------|
| **Hero** | ~70% | Relay Coach action surface: cadence line, findings summary, primary CTA |
| **Silver** | ~25–30% | **Recent posts** leaderboard — select focus post for report / framing |

No orbit of equal nodes. Tables / CSV / cohort detail stay in a demoted “Studio data” drawer (existing collapsible pattern).

### Bronze (not a third column)

Mount as a **quiet utility row** under the cadence line (text / ghost controls), not a peer panel:

- **Edit brief** — durable `PostingAssistantContext` (goals notes, locale, trend) for Autopost / Coach / PostBot
- **Review & goals** — open a modal to run/refresh the AI analytics review **and** update posting / performance goals

Keeping Bronze as utilities preserves: open page → useful findings → **Frame next posts**.

---

## Primary actions (copy)

| Control | When | Meaning |
|---------|------|---------|
| **Frame next posts** | Default Hero CTA | Create/open nudged Autopost draft frames from analytics + goals (`intent`, optional `performance_goal_id`). Not chatbot; not Autopost composer resume. |
| **Continue review** | Only if `coach_review` checkpoint exists | Resume Attack Review (findings → platform copy → Commit). |
| **Full report** | Secondary | Open latest grounded report (findings + fact_pack / checkpoint proposal). |
| **Plan next post** | Quiet tertiary (optional) | Deep-link Autopost with report-derived intent. |
| **Edit brief** | Bronze utility | Edit studio brief consumed by Autopost LLM + Coach + PostBot. |
| **Review & goals** | Bronze utility | Initiate AI analytics review refresh + goals editing in one modal. |

Do **not** use **Resume Coach** as the default Hero label — it reads as chat analytics or Autopost resume.

---

## Insights ↔ Autopost / PostBot cross-talk (shipped)

```
Insights mounts: studio brief + latest report (+ cadence)
        │
        ├─► Autopost LLM (draft copy / frame intent)  — READ, no fresh search
        ├─► Coach propose                              — uses brief; rebuilds fact_pack on explicit run
        └─► PostBot tasks                              — inherit finalized plan + brief; no re-propose
```

**Rule:** mounted context saves tokens; explicit **Review & goals** / **Frame next posts** / Coach propose refreshes.

**Implementation:** `src/creator/studio-mounted-context.ts` (brief + coach_review snippet), `autopost-draft-ai.ts` / `autopost-draft-service.ts` (prompt facts), `post-distribution-service.ts` + `postbot-task-service.ts` (merge brief on plan create / task persist).

---

## Concept mocks

| Asset | Notes |
|-------|--------|
| Cursor assets `insights-hub-hero-coach-posts-v2.png` | Early Hero + Recent posts |
| Cursor assets `insights-hub-hero-coach-report-brief-v3.png` | + Full report / Edit brief |
| Cursor assets `insights-hub-frame-next-posts-v4.png` | **Frame next posts** + Bronze utilities (**Edit brief**, **Review & goals**) + Full report |
| Cursor assets `insights-hub-frame-next-posts-v5.png` | Same hierarchy; findings as **vertical insight list** (icon + one-line cards), not carousel |

---

## Out of scope here

- Freeform chatbot analytics as the hero
- Auto-creating nudged drafts without user CTA
- Replacing Transform & route Attack Review UI
- Running the Goal Cycle modal, consuming Coach Plan credits, or materializing a multi-post Plan. See [`GOAL_CYCLE_PRODUCT_CONTRACT.md`](../studio/GOAL_CYCLE_PRODUCT_CONTRACT.md).
- Treating reach/clicks as paid-support conversions. Goal Cycle uses the deterministic/estimated/insufficient contract in [`CONVERSION_ATTRIBUTION.md`](CONVERSION_ATTRIBUTION.md).
