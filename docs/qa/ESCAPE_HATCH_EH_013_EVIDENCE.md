# Escape Hatch EH-013 milestone evidence

**Status:** Accepted as a preview-only Library truth audit baseline  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Slice:** EH-013 — Library truth wizard  
**Next dependency:** EH-020 — Generated repository

## Scope and ownership

EH-013 adds a creator-facing Library truth audit step (first Hatch Console tab) with
a versioned parity report, anomaly/exclude flow, soft access inspect, and a
fail-closed continue gate. It does not implement Relay Studio wizard steps 2–11,
visitor signed-URL delivery (EH-033), hard identity (EH-030), or production-safe
media serving.

Owned paths changed:

- `packages/escape-hatch/src/library-truth/**` (new)
- `packages/escape-hatch/src/cli.ts` (`library-truth` / `parity-report`)
- `packages/escape-hatch/src/status.ts` (slice EH-013 → next EH-020)
- `packages/escape-hatch/src/fill-template.ts` (embed rewrite + Hatch Console order)
- `packages/escape-hatch/src/import/validate.ts` (exclusion id preservation)
- `packages/escape-hatch/package.json` scripts
- Template: `/library`, `LibraryTruthView`, `ConsoleNav`, `api/library-truth`,
  `lib/library-truth/**`, `globals.css`, `app/page.tsx`
- Fixtures MATRIX/PROVENANCE honesty
- Tests: `escape-hatch-library-truth.test.ts` + status/fixtures/import updates
- `docs/qa/ESCAPE_HATCH_EH_013_EVIDENCE.md`

Pre-existing dirty `README.md` / `IA.md`, root Relay contracts, Prisma, web/, and
unrelated working-tree changes were not absorbed.

## Delivered behavior

- Versioned `library-parity-report/1.0.0` and `library-truth-state/1.0.0` under kit
  `data/` only; always `production_safe: false`.
- Every load / exclude / complete rebuilds parity from site.bundle + import +
  migration artifacts (never trusts a tampered on-disk report alone).
- Posts reconcile against live bundle inventory (silent extras fail closed).
- POST `/api/library-truth` requires `x-escape-hatch-local: 1` and loopback (or
  `ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW=1`) — local-prototype operator gating, not auth.
- Embedded kit modules strip NodeNext `.js` relative imports so Next bundler
  resolution works.
- Status advances to EH-013 with next slice EH-020; `productionSafe` remains false.

## Automated evidence

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 7 files, 173 tests passed |
| `npm run status --prefix packages/escape-hatch` | 0 | Slice EH-013; next EH-020; `productionSafe: false` |
| `import-relay-dump` → `migrate-media` → `library-truth` `eh-013-review-20260722` | 0 | accounted posts/media true; can_continue true |
| Kit `npm install` + `npm run build` | 0 | Independent Next.js build passed (after embed rewrite) |

## Security review

Scoped security review found three medium issues closed before acceptance:

1. Template/API trusted editable parity JSON — fixed by always rebuilding via
   shared `runLibraryTruthForKit` embedded into kits.
2. Post accounting ignored bundle vs import mismatch — fixed with live-inventory
   reconciliation mirroring media honesty.
3. Unauthenticated mutations — fixed with local-operator header + loopback guard.

Additional acceptance blocker (generated kit build): Node `.js` import suffixes in
embedded modules — fixed via `rewriteKitModuleImports` in fill-template.

## Browser evidence

Master browser-reviewed `http://localhost:3001/library` on kit `eh-013-review-20260722`:

- Library is first console tab; summary, access inspect (Public / All paid / Gold),
  and anomalies render with fixture-backed counts.
- Soft simulation labeled non-authoritative; `production_safe: false` visible.
- Access tab switch (Gold) updates post list.
- **Library truth complete** succeeds (status: complete; CTA disables).
- Mobile (~390px) usable; anomaly cards + exclude actions remain reachable.
  Console nav is dense on narrow width (non-blocking friction).

Non-blocking UX friction: summary tile can show posts as `4/3` when exclusions are
counted into the numerator against import `expected` — gate/CLI accounting remains
honest (`accounted=true`); polish deferred.

## Acceptance decision

EH-013 passes its applicable Milestone 1 library-truth gate:

- parity report is executable and rebuild-safe;
- anomalies support exclude-from-build without deleting export blobs;
- continue gate requires accounted inventory + no unresolved blockers;
- soft access inspect does not claim live entitlements;
- prototype remains explicitly not production-safe.

This is not EH-020 chassis, EH-033 private delivery, or release acceptance.

## Rollback

Revert the EH-013 commit and delete disposable `packages/escape-hatch/.out/eh-013-*`
directories. Stop any local kit `npm run dev`. No provider/credential mutation occurred.
