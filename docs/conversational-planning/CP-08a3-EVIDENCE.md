# CP-08a3 read descriptor seam

`derivePlanningEditDescriptors(snapshot, authenticatedCreatorId)` is a pure, in-memory export for lifecycle GETs. It takes a repository-validated snapshot, uses the same revision-bound handle derivation and collision guard as the model context builder, and returns either bounded descriptors or a finite conflict. It does not load request context, inspect template catalogs, call a provider, or access Prisma.

The descriptor path supports the stored plan bound of 32 steps, independently of the model context's eight-node limit. It returns only the handle, capability, destination, title, and enabled state; raw step IDs and model-only fields are omitted. It does not apply prompt projection text limits to read descriptors.

Validation:

- `npx vitest run tests/conversational-planning/context.test.ts` — 12 tests passed.
- Direct strict TypeScript check of `tests/conversational-planning/context.test.ts` — passed.
- Backend build is handled by the CP-08b coordinated build.
