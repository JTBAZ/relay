# Escape Hatch EH-041 milestone evidence

**Status:** Accepted as a preview-only Relay-managed Patreon verification path  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High ([EH-041 builder](71aa521b-90c4-4641-aaa8-0449ce031990))  
**Acceptance close-out:** Sol (contract + freeze gates + security disposition)  
**Slice:** EH-041 — Relay-managed Patreon verification service  
**Next dependency:** EH-042 — Relay billing entitlement for connector  
**productionSafe:** `false` (unchanged)

## Scope and ownership

EH-041 ships the **Relay-managed** path (optional monthly service) beside EH-040 `creator_oauth`:

### Kit (`packages/escape-hatch/template`)
- `ESCAPE_HATCH_PATREON_MODE=relay_managed` + Relay env names (verify base URL, site id, audience, issuer, JWKS and/or static keys JSON, state secret, kill switch).
- Modules under `lib/patreon/relay-managed/` — start redirect (nonce/PKCE/state), EdDSA assertion verify (iss/aud/sig/kid/exp/nbf/nonce/observation), replay store, entitlement snapshot `source: patreon`.
- Routes: `POST /api/patreon/relay/start` (GET → 405), `GET /api/patreon/relay/callback`.
- `/account` honesty for `relay_managed`; `/admin/patreon` checklist + non-secret migration metadata export.
- Adapter: `relay_managed` when configured; `creator_oauth` preserved; stub otherwise.
- Kill switch `ESCAPE_HATCH_RELAY_VERIFY_ENABLED=0` fails closed.

### Relay service (`src/escape-hatch/managed-verify/`)
- In-memory site registry with allowlisted callback origins (open-redirect denial).
- Short-lived **EdDSA (Ed25519)** compact JWS assertions; key rotation with overlapping verification grace.
- Per-site revocation; migration metadata export (non-secret link ids only).
- Stub metrics for provider failure / token refresh hooks; honest health (`productionSafe: false`).
- HTTP routes under `/api/v1/escape-hatch/managed-verify/*` (mounted from `src/server.ts`).
- CI uses mocked membership via `POST .../complete` — no live Patreon credentials.

It does **not** implement EH-042 billing add-on, serve site media, hold site billing credentials, or become the site's account database.

## Automated evidence

Builder freeze + Sol acceptance re-run 2026-07-22:

| Command | Exit | Result |
|---|---:|---|
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Slice **EH-041**; next **EH-042**; `productionSafe: false` |
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 17 files, **301 tests** passed (incl. `escape-hatch-relay-managed.test.ts`) |
| `npx vitest run tests/escape-hatch-managed-verify.test.ts` | 0 | **9** Relay service tests passed |

## Security review (mandatory gate)

Security review subagent ([Security Review](98cbaa49-2cc5-4cdd-b818-c22c6497f682)) scoped to EH-041 uncommitted owned paths.

| Severity | Finding | Disposition |
|---|---|---|
| Critical (closed) | Unauthenticated Relay `/complete` + `/sites` could mint valid assertions | Closed: mutating HTTP routes require `ESCAPE_HATCH_RELAY_MANAGED_VERIFY_OPERATOR_TOKEN` (Bearer or `x-eh-managed-verify-token`); unset/placeholder → 503 fail closed |
| High (closed) | Unauthenticated site registry overwrite | Closed by same operator-token gate on `/sites`, revoke, rotate, export |
| Medium (closed) | Kit did not enforce `patron_status=active_patron` | Closed: kit + Relay `verifyManagedVerifyAssertion` / `verifyRelayAssertion` reject non-`active_patron` |
| Residual | Live Patreon OAuth inside Relay `/start` still mocked | Documented; production must replace body-chosen tiers with Patreon-proven membership |
| Residual | In-memory registry / keyring / replay | Documented; keeps `productionSafe` false |

Controls confirmed:

- EdDSA (Ed25519) assertions; iss/aud/kid/exp/nbf/nonce/observation/replay.
- Allowlisted callback origins; open-redirect negatives covered.
- Kit POST-only start + same-origin CSRF; session-bound callback.
- Kill switch fail-closed; no Relay secrets in browser bundle.
- `productionSafe` stays **false**.

## Residual / human deferrals

- In-memory Relay registry/keyring — not durable multi-tenant production storage.
- Live Patreon OAuth inside Relay `/start` is preview-only (complete via mocked `POST /complete`).
- Process-local kit replay + link stores until SQL-backed request path.
- Milestone 3 browser personas + broader security gate remains open → `productionSafe: false`.
- EH-042 owns billing entitlement / cancellation grace for the managed connector add-on.

## Privacy / data-processing (names only)

Relay may process: site id, allowlisted callback origin, opaque Patreon user id, mapped tier ids, entitlement observation timestamps, assertion jti. Must not retain site Stripe secrets, admin passwords, or premium media.
