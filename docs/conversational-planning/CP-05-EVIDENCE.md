# CP-05 implementation evidence

CP-05 adds a metadata-only interpretation boundary in `src/conversational-planning/intent.ts`. `projectPlanningContext` rebuilds the compact context from an allowlist and rejects over-cap selections or text before any provider call. Unknown adapter properties such as image bytes, base64, storage references, or transcript fields are never copied. It checks the 4,000-character latest request cap, 12-KiB context cap, and 16-KiB serialized provider payload cap, including the system instruction, request wrapper, strict schema, and output settings.

The provider schema has required fields and `additionalProperties: false` at every object. Runtime checks bind revisions to the current revision, edit/remove targets to server-issued handles, source and template references to projected metadata, timezones to trusted context, and quotes/title/time evidence to exact substrings of the latest user request. Absolute, weekday, publication-relative, and unresolved local time shapes remain distinct. It permits one machine-described repair for malformed or structurally invalid responses; a model-declared clarification is returned immediately. More than six intents and output truncation have explicit terminal codes.

`createPlanningProvider` requires an exact nonempty model ID, positive explicit input/output pricing, and Relay's existing `ProviderBudget` before it calls the `EditorProvider` construction seam. It does not create a second reservation layer; the existing provider owns reservation and settlement. The adapter passes an explicit model, strict schema, zero tools, and instructions that label metadata as untrusted data. `interpretRequest` enforces a shared 30-second deadline and a 3,000-token output cap, passes an abort signal, counts each attempted call, aggregates trustworthy usage, marks unknown usage as null, preserves the validated `base_revision`, and returns sanitized stable failure codes without provider error text. Partial follow-up intents retain known offsets/times and can leave action or target unresolved for compiler slots. Clarification and limitation outcomes retain a bounded plain-text question or a deterministic fallback.

Mocked evidence covers the four-intent Patreon/X draft-and-teaser reference shape, partial follow-ups, handle-bound revision and removal, absolute/qualified/unresolved time fields, one repair, no repair for clarification, image-field exclusion and pre-call limits, more-than-six and truncated output, abort/timeout/transport/usage/budget failures, accounting, question handling, exact model/pricing prechecks, and adapter payload instructions with zero tools. These checks establish schema and deterministic guard behavior only. They do not show that a model understands creator language, honors prompt-injection boundaries, or reports every intended action. No paid provider call was made, and this module is not wired into production routing.

Validation performed:

- `npx vitest run tests/conversational-planning/intent.test.ts` — 8 tests passed.
- Targeted TypeScript no-emit check for `intent.ts` and `intent.test.ts` — passed.
- `npm run build` — passed (exit code 0).

The earlier whole-project typecheck-clean claim is withdrawn; the wider worktree has 83 diagnostics, so this evidence records only the targeted no-emit check and backend build.
