# CP-04a — Pure contract implementation evidence

**Status:** Implementation evidence for architect review; this does not claim CP-04 acceptance or runtime readiness.

## Implemented boundary

`src/conversational-planning/contract.ts` defines finite v1 capabilities, destinations, social actions, review values, clarification reasons, authority kinds, and pointer slots. Its strict validators reject missing or unknown fields, malformed values, duplicate IDs, oversized snapshots, invalid dependencies, cycles, mismatched distribution groups, duplicate destination variants, invalid teaser prerequisites, unsupported title modes, and plan fields that copy execution status or publication evidence.

The pure shape validator checks a 32-step maximum, 16 clarification slots, a 64 KiB serialized snapshot limit, bounded display text, strict `PreviewTemplateConfigV1` keys plus `parsePreviewTemplateConfig`, UTC/local/timezone agreement for absolute times, and valid IANA timezone and local-time shapes for publication-relative steps. Unresolved requests remain inert and require matching blocking clarification slots. A missing template can leave the independent Patreon route executable while the preview request remains unresolved. Patreon distribution can exist without preview; X and DeviantArt teaser variants depend on a saved preview step in the same group.

`validatePlanWithContext` accepts trusted state supplied by its authenticated server caller. It checks creator and authority ownership, selected media relationships to the claimed post/work/series member, the source fingerprint, saved template identity and freshness, verified series-member part labels, destination connections for handoff steps, target-post ownership, and Autopost entitlement. It does not load or infer that state itself. An unavailable destination can keep its distribution variant reviewable when its handoff is disabled and has a blocking `unlinked_destination` clarification.

## Verification

- `npm test -- tests/conversational-planning/contract.test.ts` — passed, 14 tests.
- `npm run build` — passed, including Prisma client generation, backend TypeScript build, and asset copy.
- `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck --types node src/conversational-planning/contract.ts tests/conversational-planning/contract.test.ts` — passed.
- A full `npm run typecheck` was also attempted and reports existing diagnostics across extension, web alias resolution, and unrelated test files. The focused no-emit check above passes for both CP-04a files.

## Limits

This is a shape and trusted-context contract only. It does not query a database, materialize existing authorities, prove that a caller loaded trusted context correctly, persist plans or pointers, export preview media, perform handoffs, or establish publication evidence. Relative calendar-day resolution, DST policy execution, retries, restart recovery, and browser review remain later-ticket work. No API, migration, provider call, external write, or publication action was added.
