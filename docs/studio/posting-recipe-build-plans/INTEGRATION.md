# Posting Rhythms integration

Implemented locally on 2026-10-19. The approved editor now lives at `/studio/rhythms`, reached from **Scheduler → Automations → Posting Rhythms**. The standalone demo remains a fictional-data design reference. This integration has not been deployed remotely.

## What is connected

- Creator-owned, versioned Rhythms and reusable description Drafts persist in PostgreSQL. Save does not enroll or publish a post. Default preselects; Always on enrolls matching future posts; Confirm plan selects an existing post or arms the next match once.
- Patreon source identity comes from the creator profile and campaign. AND filters use source text and links. Each enrollment freezes the source version, image revision, timing, account handles, descriptions and preview layout.
- Releases reuse `CreatorDistributionRule` and `CreatorDistributionRuleRun`, Schedule Rail events, and canonical distribution plans, variants, attempts and extension handoff. Each destination has an isolated action and plan. There is no second execution ledger or scheduler.
- The existing distribution-rules worker calls the Rhythm coordinator. Config edits and pause/resume create bounded discovery windows, preserving earlier backlog without enrolling publications made while paused. Discovery uses a bounded keyset cursor.
- Timing supports elapsed-day delays, optional local clock time, and first/last day of the current/following month. Dependent releases start from the matching destination's confirmed publication, not from package preparation or opening the handoff.
- Original media bypasses rendering. Teasers use real saved Previewizer layouts and the existing reviewed crop/export/upload flow. Media identity is checked again before packaging. Missing preview media never falls back to the original.
- Exact descriptions remain exact unless Coach is enabled. Coach uses the existing entitlement and Posting Assistant path. A failed generation blocks preparation.
- A creator-confirmed canonical `posted` attempt with an account-specific published URL supplies dependency evidence. The first accepted receipt is retained. Duplicate preparation and receipts are idempotent.
- Pause stops new enrollment and preparation. Archive cancels unstarted releases while retaining history. Existing receipts can still be recorded. Expired reviews can be renewed without replaying an uncertain handoff.

## Current capability boundaries

The implemented lane is one-image Patreon intake with creator-reviewed X and DeviantArt distribution. Account handles are explicitly confirmed for the signed-in extension account; they are not presented as OAuth-verified connections. Instagram, Bluesky image routing and Tumblr are unavailable in the production connection dialog. Email summaries are disabled. Existing Schedule Rail reminders remain available.

Saving, Default, Always on and Preview rhythm grant no external publishing authority. Preview rhythm is a mock-art flow inspection. Real teaser rendering and publication still require creator actions. Remote approval, cancellation-window publication, unattended rendering and additional API connectors remain later work.

The page retains the approved hierarchy, platform marks, destination-first accordions, compact timing, anchored preview choices, filled treatment toggles, Draft controls, motion and reduced-motion support. Its slate palette is scoped to `.posting-rhythms`; the surrounding Relay shell is unchanged.

## Code and schema

- UI: `web/app/studio/rhythms/`; client API: `web/lib/posting-rhythms-api.ts`.
- Authenticated API: `/api/v1/creator/posting-rhythms`, implemented in `src/posting-rhythms/` and registered in `src/server.ts` using the existing creator authorization and mutation checks.
- Canonical integration seams: `src/autopost/distribution-rule-service.ts`, `src/autopost/automation-reconcile-service.ts`, `src/distribution/{post-distribution-service,distribution-package,creator-schedule-event-service}.ts` and the existing distribution handoff component.
- Models: Rhythm configuration, discovery windows, immutable description Drafts and enrollment snapshots. Canonical rules, runs and plans carry nullable Rhythm ownership links. A source-version ingestion index supports discovery.
- Migrations: `20261019150000_posting_rhythms` and `20261019160000_posting_rhythm_windows`. Both were applied to the existing local `relay_dev` database. New private tables use RLS; no remote database was changed. An unrelated pending migration was left pending.

The deployment must run the existing distribution-rules worker and apply these two migrations through its normal migration process. Local split-worker settings were preserved; verification did not enable background publication.

## Verification

`npm run verify:posting-rhythms` creates a uniquely named disposable database on configured loopback PostgreSQL, installs the schema and Rhythm constraints, runs the feature tests and drops only that database. It never resets the application database.

Results on 2026-10-19:

- Backend build passed.
- Posting Rhythms: 18 tests passed, including real isolated PostgreSQL, authorization, ownership, optimistic versions, read-only GETs, activation windows, plan isolation, exact media, receipts, dependency progression, review renewal and UI save/preview behavior.
- Connected Automations and scheduling regressions: 53 tests passed.
- Scoped ESLint passed for all changed UI/client files.
- Browser smoke test: authenticated Dev Ava, Scheduler entry, account invitation, save, reload and saved-Rhythm reload. Desktop and 390px mobile layouts inspected. The saved fixture `Posting Rhythms integration check` is inactive for enrollment: Default, Always on and next-match arming are off. No external post or email was sent.
- Full web compilation succeeded before failing existing lint checks elsewhere. Full web lint/type checks remain blocked by unrelated Editor Bench and legacy fixture errors. The broader Automations suite also retains an existing `trigger-series.test.ts:262` failure. These were not changed to make this integration pass.

Real provider publication, external OAuth, live Coach generation, email delivery and remote deployment were not exercised. Verification details and scoped review are recorded in `.impeccable/review/posting-rhythms-integration.md`.
