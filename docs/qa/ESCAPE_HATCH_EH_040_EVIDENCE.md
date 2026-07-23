# Escape Hatch EH-040 milestone evidence

**Status:** Accepted as a preview-only creator-owned Patreon OAuth path  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High ([EH-040 builder](79e31b62-4019-412c-991a-5269f12c16c5))  
**Acceptance close-out:** Sol (contract + freeze gates + security disposition)  
**Slice:** EH-040 — Creator-owned Patreon OAuth  
**Next dependency:** EH-041 — Relay-managed verification service

## Scope and ownership

EH-040 ships a complete **creator_oauth** path in `packages/escape-hatch/`:

- Typed env names (`ESCAPE_HATCH_PATREON_MODE`, `PATREON_*`, token key, state secret).
- Kit modules under `template/lib/patreon/` (client, state+PKCE, AES-GCM crypto, identity, link, config, memory store).
- SQL `0005_patreon_oauth_{supabase,portable}.sql` (+ schema/docker-init mirrors) with RLS fail-closed on credential tables.
- Routes: `POST /api/patreon/oauth/start` (GET → 405), `GET /api/patreon/oauth/callback`.
- UX: `/account` Connect Patreon + honesty; `/admin/patreon` ops checklist.
- Adapter: `creator_oauth` when configured; stub otherwise; `relay_managed` deferred to EH-041.
- Status slice **EH-040** → next **EH-041**; `productionSafe` remains **`false`**.

It does **not** implement Relay-managed verification (**EH-041**), billing (**EH-050**), or flip `productionSafe`.

No live Patreon network in CI; tests use mocked `fetch` and sanitized fixtures.

## Automated evidence

Builder freeze + Sol acceptance re-run 2026-07-22:

| Command | Exit | Result |
|---|---:|---|
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-040**; next **EH-041**; `productionSafe: false` |
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 16 files, **295 tests** passed (incl. 19 in `escape-hatch-patreon-oauth.test.ts`) |

## Security review (mandatory gate)

Security review subagent ([Security Review](7b0c84ab-93ea-4895-9478-1ac162783693)) scoped to EH-040 uncommitted `packages/escape-hatch/` + this evidence file.

| Severity | Finding | Disposition |
|---|---|---|
| Medium (closed) | OAuth account-linking CSRF via GET start under SameSite=Lax | Closed: start is **POST-only** (GET → 405); same-origin Origin/Referer required |
| Medium (closed) | Tier grants for non-`active_patron` memberships | Closed: `extractCampaignMembership` fails closed unless `active_patron` |
| Residual | Preview in-memory link store until SQL-backed request path | Documented; under-grant not over-grant; keeps `productionSafe` false |
| Residual | Live Patreon browser OAuth | Blocked without inventing credentials; mocked fetch covers CI |

Controls confirmed:

- HMAC state + PKCE; account/site binding; expiry.
- Open-redirect protection (relative return paths only).
- Refresh tokens encrypted at rest; errors omit secrets.
- Campaign + **active_patron** binding fail-closed.
- Credential table RLS: owner/staff only.
- Fail-closed when misconfigured / placeholders.
- Soft persona honesty unchanged; premium bytes still require `evaluateAccess`.
- `productionSafe` stays **`false`**.

## Residual / human deferrals

- Live signed-in OAuth against real Patreon requires creator credentials (not invented in CI).
- Process-local memory store backs adapter preview upserts until SQL-backed store is wired in request path; SQL + RLS ship for Path A/B apply.
- Milestone 3 browser personas + broader security gate remains open → `productionSafe: false`.
