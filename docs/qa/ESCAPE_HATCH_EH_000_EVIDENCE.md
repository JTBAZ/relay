# Escape Hatch EH-000 milestone evidence

**Status:** Accepted as a truthful prototype baseline only  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Composer 2.5 Fast  
**Slice:** EH-000 — Inventory and status  
**Next dependency:** EH-001 — Shared contracts

## Scope and ownership

EH-000 adds deterministic executable status output for the existing Escape Hatch
prototype. It does not implement production contracts, authentication, entitlement
evaluation, private media, billing, deployment, migration, admin, backup, or restore.

Builder-owned files:

- `packages/escape-hatch/src/cli.ts`
- `packages/escape-hatch/src/status.ts`
- `packages/escape-hatch/package.json`
- `packages/escape-hatch/tests/escape-hatch-status.test.ts`

The builder did not edit the pre-existing dirty `packages/escape-hatch/README.md` or
`packages/escape-hatch/IA.md`, the untracked program documents, templates, fixtures,
canonical Relay code, Prisma, environment files, or unrelated working-tree changes.

## Delivered behavior

`npm run status --prefix packages/escape-hatch` now prints a human-readable capability
inventory. `npx tsx packages/escape-hatch/src/cli.ts status --json` emits the same
inventory as deterministic JSON using schema `escape-hatch-status/1.0.0`.

Both forms:

- return exit code 0 as informational commands;
- set `productionSafe` to `false`;
- classify the deliverable as `prototype_preview_only`;
- identify 17 stable capabilities as preview-only, stub-only, not implemented, or
  reusable Relay source;
- identify exact repository-relative evidence paths;
- route outstanding capabilities to the documented EH batting order;
- identify EH-001 as the next slice;
- state that passing preview tests does not authorize deployment.

The output explicitly records that premium media is copied to `public/media`, persona
state is non-authoritative, package access semantics are simplified, and Relay Part 2
billing/deployment adapters are synthetic stubs.

## Skills and review roles

- No UI, Supabase/Postgres, Stripe, or Connect implementation skill applied to this
  CLI-only slice.
- The master loaded `web-design-guidelines` and fetched its current Vercel Web
  Interface Guidelines before browser review.
- A `browser-use` reviewer exercised the generated application. No security-review
  subagent was required because EH-000 changes no authorization or security boundary.

## Automated evidence

Commands were run from the repository root unless noted.

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck --prefix packages/escape-hatch` | 0 | TypeScript passed |
| `npm run escape-hatch:test` | 0 | 2 files, 23 tests passed |
| `npm run status --prefix packages/escape-hatch` | 0 | Human inventory printed |
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Parseable deterministic JSON |
| `npm run escape-hatch:fixture -- eh-000-review-20260722` | 0 | Clean review kit generated |
| `npm install --prefix packages/escape-hatch/.out/eh-000-review-20260722` | 0 | Install completed; npm reported 1 moderate and 1 high dependency vulnerability |
| `npm run build --prefix packages/escape-hatch/.out/eh-000-review-20260722` | 0 | Next.js production build passed; 7 pages generated |
| `npm run build` | 0 | Relay root Prisma generation and TypeScript build passed |
| Documented targeted Patreon/tier/clone/export/R2 regression command | 1 | 13 files passed; `pilot-ux-permission-parity.test.ts` failed PUX-004; 83 passed, 1 failed, 1 todo |
| `npx vitest run tests/pilot-ux-permission-parity.test.ts` | 1 | Reproduced PUX-004 alone; 9 passed, 1 failed |

The reproducible PUX-004 failure expected locked post
`pilot_post_ava_studio_archive` but received no locked posts. EH-000 changes only the
package-local status command and cannot alter the tested patron-feed behavior. The
failure is recorded rather than reported as passing; it blocks a broader PUX regression
claim, but not the narrow EH-000 fixture/status gate.

`map-patreon-post-to-ingest.test.ts` also retained its existing todo. No provider
integration, live R2, billing sandbox, deployment, restore, or security suite was run;
EH-000 does not claim those gates.

## Browser and network evidence

The generated app ran on port 3001. Browser review exercised Structure, Style, Preview,
the Public/Patron/Gold/Silver persona controls, a valid post detail route, and desktop
and approximately 390 px mobile layouts.

Corrected clean-fixture results:

- Structure: Public 1 (`Welcome (Public)`), Patrons 1
  (`Patrons-Only Sketch`), Gold 1 (`Gold Exclusive Piece`), Silver 0.
- Public persona: public post available; member and Gold posts visually locked.
- Patron persona: public and member posts available; Gold visually locked.
- Gold persona: all three posts available.
- `/p/welcome-public` renders the valid post detail and offers return navigation.
- `/p/does-not-exist` returns the prototype's custom missing-post surface with
  `Back to Preview`.
- Desktop and mobile layouts remained readable without observed horizontal overflow.

The first browser pass used stale local storage and incorrect URLs
(`/preview/p_welcome` and `/public/site.json`); those observations were rejected. A
corrected pass verified the clean fixture and valid route.

Independent HTTP evidence:

| Request | Status | Evidence |
|---|---:|---|
| `GET /site.json` | 200 | Full client-readable site JSON |
| `GET /media/m_gold.svg` | 200 | 485 bytes, `image/svg+xml`, no authentication |
| `GET /p/does-not-exist` | 200 | Custom missing-post page contains `Back to Preview` |

The unauthenticated Gold media response is a **known critical prototype security
failure**, not a passing paywall test. It is now stated in both status formats.

The browser harness became unstable during a final correction pass, and its screenshots
were not retained as repository artifacts. A final keyboard-only rerun and durable
screenshots are therefore not claimed. Loading, empty, and retry states are not present
in this prototype and were not run. These limitations do not convert EH-000 into a UI or
security milestone; they remain required for later UI slices and milestone journeys.

## Acceptance decision

EH-000 passes its applicable gate:

- the existing fixture/CLI remains reproducible;
- status output is executable and deterministic;
- preview-only versus production-safe state is unmistakable;
- public premium-media exposure is demonstrated and disclosed;
- no provider stub or mocked success is described as readiness.

This is **not** paywall, security, provider, accessibility, or production acceptance.
EH-001 must not inherit a claim that the generated site is safe to deploy.

## Risks and rollback

Known risks:

- premium bytes and site JSON are public;
- persona switching is client-only;
- contracts remain duplicated and unversioned;
- generated-site identity, private media, billing, deployment, admin, migration, and
  restore are incomplete;
- generated Next.js dependencies reported 1 moderate and 1 high audit finding;
- the unrelated PUX-004 regression remains red.

Rollback requires reverting the EH-000 commit. Generated review output under
`packages/escape-hatch/.out/eh-000-review-20260722` is disposable and gitignored. No
migration, provider mutation, credential write, or external state change occurred.
