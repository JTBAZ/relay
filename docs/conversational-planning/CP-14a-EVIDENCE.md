# CP-14a development corpus and scorer evidence

Status: implementation slice is present; development-corpus acceptance remains blocked pending authored gold validation. This document does not claim a measured language score or that the 48-task corpus is frozen.

The development artifact has the required envelope counts (48 semantic task IDs, 12 in each U/C/A/S cohort, plus 24 separately listed guard definitions). Guard rows are declarative test requirements only; they do not demonstrate those protections at runtime. No heldout requests or gold are included.

The scorer parses raw JSON once and uses the application `INTERPRETED_REQUEST_SCHEMA` validator. Raw intent gold must specify every request field and marks each assertion exact; a key omission, extra intent, wrong source/target/copy/part/time, or incomplete gold fails closed. Context-preflight cases are recorded as `not_called`. Freeform clarification questions produce a bounded blinded review packet and remain unresolved until human review. Fixed denominators are retained and Wilson intervals are reported.

Compiled task scoring now requires one whole-result expected object for canonical offline self-tests. Existing path-fragment gold cannot establish absence of extra nodes, edges or actions, nor preservation of unmentioned fields, so those fixture rows remain `incomplete_gold`. A whole-object exact match is not yet a general measurement oracle: equivalent source/template representations or independent sibling-step ordering need a separately reviewed bounded-alternatives/DAG-order rule before using this scorer to reject a runtime result. Compiled clarification text also remains `incomplete_gold` until a bounded human-review projection is designed. Generated IDs in the canonical whole-result checks can be normalized only through the scorer's graph-preserving bijection.

The corpus is not ready for CP-14b acceptance or CP-16 measurement. Review found these remaining authoring and validation gaps:

- The cross-tag matrix is incomplete: multiple frozen coverage requirements currently have only one tagged task, and several tags no longer match their revised request/context after feasibility corrections.
- Revision/no-change cases still need a complete repository-validated starting snapshot and real derived creator/plan/revision/step handles. Placeholder handles and a null `currentPlan` cannot be used as valid revision examples.
- Every U/C case needs a real offline interpreter/context/compiler/calendar pass proving the raw gold and expected compiled outcome. In particular, C cases must remain genuinely compound, include exact source, action, destination, title, template and timing details, and preserve independent work. A draft-only request over already-posted attached media is not a valid draft-only success; teaser-only requests retain the actual compiler `contract_gap` outcome.
- Full compiled gold or finite complete clarification/limitation oracles have not yet been authored for all tasks. Partial snapshots are deliberately not scored.
- The guard definitions require CP-14b wiring to accepted runtime behavior before they can count as passing probes.

The fixture includes no image bytes, storage URLs or credentials. This slice made no provider, database or network calls and did not read or mutate a budget ledger.

The repository's existing Vitest configuration calls `dotenv.config()` when loaded; the focused test command therefore emitted its normal dotenv injection notice. Neither new CP-14a file imports dotenv, and the shared test configuration was not changed.

Validation:

- `npx vitest run tests/conversational-planning/evaluation-scoring.test.ts` — 13 tests passed after the final scorer changes.
- `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck --types node,vitest/globals tests/conversational-planning/evaluation-scoring.test.ts` — passed.
- Backend build — not run in this slice; CP-08b owns the coordinated build.

## CP-14a1b raw semantic infrastructure — root accepted 2026-10-17

The scorer adds `observeFirstPassForEvaluation`, `scoreRawSemantic` and the finite `ORACLE_REASONS`. It validates the exact response through the real public interpreter using zero-cost fixed mock text, binds response/request/projected context digests, and compares complete bounded variants. Quote spans and changed-field set order can vary; wrong source/media selection, title, delivery, date, template, enabled state or timezone cannot pass as equivalent. Source alternatives are deliberately conservative: sharing a parent post does not equate media selections, and uncertain mixed post/media selection aliases are not expanded.

Root independently passed 20 focused scorer tests after review corrections; worker strict targeted TypeScript passed. Canonical exports retain their strict behavior. These are scorer tests, not language accuracy or accepted corpus evidence. Per-case counterfactual application validation and complete independent compiled/behavior equivalence remain freeze gates. Graph scoring CP-14a1c is dispatched; behavior/human adjudication CP-14a1d remains separate. No fixture, runtime, provider call or ledger change occurred.


## CP-14a1c complete graph infrastructure — root accepted 2026-10-17

`scoreCompiledSemantic` compares complete closed compiler results under a typed generated-ID bijection, preserving retained revision identities and all literal metadata/config/copy/provenance/time fields. Normalization touches explicit graph paths only. Finite compiler slot questions retain reason/field/scope; arbitrary prose is not judged. Standalone revision clarification remains unsupported pending d. Exact mode preserves all array order; DAG mode permits only declared independent entity/set order and keeps retained revision collection order. Source/media/template identities never become generated aliases.

Root independently passed 28 focused scorer tests; worker strict targeted TypeScript passed. Counterexamples cover nested config/literal ID-like keys, wrong/missing/extra graph fields and references, scope/evidence bindings, retained identity/order, ambiguous/colliding maps, impossible buckets and limits. Search is bounded by 256 complete mappings and 32,768 visited partial states; hitting either bound remains unscored. This is offline scorer infrastructure, not corpus feasibility, application authorization, model accuracy or heldout evidence. CP-14a1d behavior/human/fixed-denominator integration is dispatched separately; no fixture, runtime, provider or ledger change.


## CP-14a1d behavior/metric infrastructure — root accepted 2026-10-17

Root independently passed 32 focused scorer tests after reviewing and correcting actual terminal/result shapes, raw-branch binding, complete semantic graph behavior comparison, human packet/requirement binding and pending/missing fixed-denominator accounting. Worker strict targeted TypeScript and node syntax checking passed. New exports buildBehaviorView, scoreBehavior and summarizeOracleDevelopment preserve first/final tracks and require all applicable components; correct context preflight alone can omit model/compiler calls only on its declared path. Freeform questions require the bounded packet-digest human ratings; no automatic prose judge was introduced.

Standalone revision compiler clarification remains unsupported without a frozen typed scope binding. Corpus feasibility, runner observation capture, independent gold/heldout custody and actual runtime measurement remain unaccepted. This slice made no paid/provider/database calls and no fixture/runtime/ledger change. Per the fixed delivery baseline, further optional evaluation/tooling expansion is deferred; the worker moved to the bounded approved-plan resume API needed by the artist flow.
