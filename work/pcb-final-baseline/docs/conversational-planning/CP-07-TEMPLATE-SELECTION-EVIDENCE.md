# CP-07 template-selection hash amendment evidence

**Status:** Bounded CP-07 repository amendment complete for root review. The change adds optional `selectedTemplateIds` only to create and AI-revision command identities. It makes no schema, route, context-loader, or database changes.

The runtime command validator accepts at most three distinct template IDs. Each must be a nonempty, already-trimmed string no longer than 160 characters. Exact command keys remain enforced. Manual revision and approve/cancel command variants do not accept this field.

Nonempty template selection arrays are included in the canonical version-1 request identity in their declared order. Omitted and empty selections omit the field from canonical command JSON, preserving the exact previous v1 digest. Existing AI `targetHandleRefs` normalization is unchanged.

The tests pin pre-amendment digests as literals: create hash `313b33abc6f3ec8f7faba6e06739bb44608855b6f570a56b7f7b141224ea000c` and AI-revision hash `7c9d1eb602ff2b7901b427f05db4c9fe678a3923945986ef2475da79d527c398`. They verify that both omitted and empty selection replay the existing command; that changed IDs and array reordering conflict; and that duplicate, over-count, whitespace-padded, overlong, and unknown command fields are rejected. Manual and review command shapes remain closed.

Focused tests:

```text
npx vitest run tests/conversational-planning/persistence.test.ts
25 tests passed
```

Direct strict TypeScript check of the test file:

```text
npx tsc --noEmit --strict --esModuleInterop --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --types node --types vitest/globals tests/conversational-planning/persistence.test.ts
passed
```

Backend build:

```text
npm run build
pending final run
```

No database connection or paid call was used for this amendment.
