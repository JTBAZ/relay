# CP-05 provider budget error classification

The interpreter now distinguishes exhausted composition budget from temporary or invalid budget-ledger failures. Only `EditorError("BUDGET_EXHAUSTED", ...)` produces terminal reason `budget_failure`, preserving the existing exhaustion response. `BUDGET_LOCKED` and `BUDGET_INVALID` produce bounded `budget_unavailable`; the actual provider token allowance error `provider_budget_overrun` remains a generic `provider_failure`. No raw error message is returned, and all these errors remain terminal after one call with unknown usage accounting.

The production error names were verified in `src/gallery-editor/budget.ts` and `src/gallery-editor/provider.ts`. No retry, budget reservation/settlement, ledger, provider configuration, or shared error behavior changed.

Validation:

- `npx vitest run tests/conversational-planning/intent.test.ts` — 8 tests passed.
- Direct strict TypeScript check of `tests/conversational-planning/intent.test.ts` — passed.
