# CP-14a1b–d — Bounded semantic oracle amendment

**Root accepted for serial implementation, 2026-10-17.** Sol owns this document only. [EVALUATION-PLAN.md](EVALUATION-PLAN.md) and the conditionally accepted [CP-14a2-CASE-PLAN.md](CP-14a2-CASE-PLAN.md) govern the 48 cases and scoring denominators. The corpus remains unaccepted; case-plan acceptance is permission to author canonical fixtures, not evidence of feasibility or measured accuracy. No source, fixture, provider, schema, database, network, budget, heldout or runtime-routing change is authorized here.

Root has accepted the semantic design caps: at most **8 structural raw variants per case**, at most **6 intents / 720 request permutations**, and at most **256 attempted complete graph mappings**. On 2026-10-17 root clarified that each intent may additionally declare domains of **at most3 values each for only `source_ref`, `template_ref`, `enabled`, `timezone`**, without enumerating a Cartesian product. Every domain value must mean the same authoritative source/template/enabled state/frozen zone, not merely name an offered owned object. No other field equivalence or provenance shortcut is implied.

## Existing surface and exact ownership

The existing scorer exports `validateDevelopmentFixture`, `scoreRawInterpretation`, `scoreCompiledOutput`, `summarizeDevelopment`, and the frozen count constants. Its canonical mode uses complete strict request assertions and full compiled-root equality under generated-ID bindings; it intentionally leaves partial gold and compiler questions unscored. Preserve those exports and their strict behavior for offline canonical smoke proof. Do not silently change an omitted mode into semantic scoring or make missing application validation count as success.

Luna's three **serial** amendment slices each own only `scripts/conversational-planning-eval-scoring.mjs` and `tests/conversational-planning/evaluation-scoring.test.ts`. No production exports/private-validator changes, fixture edits or runner file edits occur in these slices. The later CP-14b runner supplies actual observations through the boundary below. Tests use small local synthetic records and real accepted public application imports; they do not rewrite the 48-case corpus or mistake scorer tests for case feasibility.

1. **14a1b:** first-pass observation helper, closed semantic gold validation, raw-equivalence scorer. Root accepts before c.
2. **14a1c:** complete graph oracle and scoped-reference comparison. Root accepts before d.
3. **14a1d:** complete behavior view and finite-question/human-review handling, plus fixed-denominator integration. Root accepts before runner integration/measurement.

CP-14a2 may first author complete **canonical** raw/compiled gold using the accepted case plan, without depending on semantic alternatives. It may not fill unknown oracle gaps with success. All three amendments, actual fixture feasibility, independent full gold, equivalence evidence and the reviewed runner must pass before corpus freeze or any CP-16 measurement. No worker concurrently edits the scorer/test pair.

## Minimal additive gold and result types

The following are documentation signatures, not implementation. Use the real imported `InterpretedRequest`, `RequestIntent`, `PlanSnapshot`, `PlanningModelContext`, `InterpretationResult`, compiler/context result unions and application schema validator. Do not define another production schema. A semantic overlay is optional during canonical authoring; absent/unsupported overlay produces **unscored**, never an inferred permissive default.

```ts
type OracleScore = Readonly<{
  correct: boolean | null;
  status: "scored" | "unscored" | "not_called" | "human_review_pending";
  reason: string | null; // closed exported oracle reason enum, below
}>;

type IntentDomain = Readonly<{
  intentIndex: number;
  source_ref?: readonly RequestIntent["source_ref"][];
  template_ref?: readonly RequestIntent["template_ref"][];
  enabled?: readonly (boolean | null)[];
  timezone?: readonly (string | null)[];
}>;
type RawVariant = Readonly<{
  id: string;                           // unique bounded fixture label
  expected: InterpretedRequest;          // complete strict canonical root
  requestOrder: "exact" | "independent";
  domains: readonly IntentDomain[];      // <=6 unique intentIndex entries
}>;
type CompiledGold = Readonly<{
  expected: CompleteCompilerResult;      // full new/revision result union
  nodeOrder: "exact" | "dag";
  unresolvedQuotes: readonly Readonly<{
    requestId: string;
    from: "latest_request" | "matched_intent_quote";
    intentIndex: number | null;
  }>[];                                // <=16, explicitly bound below
}>;
type SemanticGold = Readonly<{
  version: "cp-oracle.v1";
  rawVariants: readonly RawVariant[];     // 1..8; [] only context preflight
  compiled: CompiledGold | null;
  behavior: readonly BehaviorGold[];      // 1..2: canonical/terminal alternative
}>;
```

Store this at additive `task.gold.oracle`; retain the existing `gold.raw`, full-root `gold.compiled` canonical assertion and existing `gold.humanQuestion` needed-fields record. `CompleteCompilerResult` means the current complete `CompileResult | CompileRevisionResult`, not `unknown`, a partial path map or arbitrary assertion language. Context preflight/terminal results belong to BehaviorGold, not a fake compiler object. Exactly one complete compiled expectation suffices for all proposal variants of these48 cases; A01/A02 can additionally accept their pre-frozen direct-question terminal alternative. Other outcomes or multiple incompatible compiled graphs require root review, not an unbounded alternative list.

Define and export the finite reason set used by the new functions: `invalid_output`, `application_rejected`, `missing_application_observation`, `observation_mismatch`, `invalid_oracle_gold`, `unsupported_oracle`, `missing_or_extra_intent`, `semantic_mismatch`, `ambiguous_intent_match`, `missing_compiled_gold`, `invalid_graph`, `graph_mismatch`, `ambiguous_graph_match`, `graph_mapping_limit`, `behavior_mismatch`, `missing_behavior_observation`, `question_missing`, `human_review_pending`, `human_review_rejected`, `human_review_unresolved`, and `context_preflight`. Keep existing public canonical reason values unchanged. Later reporting maps these to the frozen evaluation failure taxonomy; it cannot expose arbitrary exception text as a reason.

`correct:false` means a supported observed response contradicts gold or fails application validation. `correct:null` means absent/invalid gold, an unsupported comparison, an ambiguity/limit or pending required human judgment. Both remain non-successes in fixed denominators and block acceptance when unresolved. The scorer must not upgrade null to true because a guard prevented a write, a compiler returned a safe limitation, or another track passed. Actual provider calls/usage are separate from oracle-only mock calls.

## 14a1b — Raw interpretation equivalence

### Actual first-pass validation boundary

Add these narrow exports in the existing scoring module. The runtime dependency argument is mandatory, supplied only by trusted offline runner/test construction, never fixture/provider data; there is no boolean safety-checker option, default approval callback, private validator copy or new production export.

```ts
type ApplicationValidationRuntime = Readonly<{
  projectPlanningContext: typeof projectPlanningContext;
  interpretRequest: typeof interpretRequest;
}>;
type FirstPassObservation = Readonly<{
  version: "cp-first-pass.v1";
  responseDigest: string;
  requestDigest: string;
  contextDigest: string;
  validation: "first_pass_accepted" | "rejected";
  outcome: InterpretedRequest["outcome"] | null;
  attempts: number;
  repairs: number;
  mockCalls: number;                     // 0..2, never paid usage
}>;
async function observeFirstPassForEvaluation(input: {
  responseText: string; latestRequest: string; rawContext: unknown;
}, runtime: ApplicationValidationRuntime): Promise<FirstPassObservation>;

type RawSemanticScore = OracleScore & Readonly<{
  variantId: string | null;
  intentMap: readonly number[] | null;   // expected index -> actual index
  validatedResponse: InterpretedRequest | null;
}>;
function scoreRawSemantic(input: {
  task: EvaluationTask;
  responseText: string;
  observation: FirstPassObservation;
  schema: typeof INTERPRETED_REQUEST_SCHEMA;
  matchesSchema: typeof matchesSchema;
  humanReview: HumanReviewRecord | null; // null in14a1b; adjudication in14a1d
}): RawSemanticScore;
```

`EvaluationTask` is the existing closed test fixture task surface with its exact case input, canonical gold and optional semantic overlay; no new generic executor or provider configuration fields. Runtime function references in tests must be actual public imports for positive validation proof. Unit tests may inject a throwing dependency to test unavailability, but a fake always-accepted observation is not application-validation evidence.

`observeFirstPassForEvaluation` projects the supplied context using the actual projector, then calls actual public `interpretRequest` with a mock `PlanningProvider.respond` returning the **same supplied first-response text on every invocation**, known zero synthetic usage and stop finish reason. A repair invocation never supplies a corrected/gold answer. Accepted means `attempts===1`, `repairs===0`, no terminal error, and an eligible proposal/clarification/limitation/no_change result. Invalid context may give zero mock calls; malformed/invalid supplied response may give two. All are explicitly offline validation calls, zero API cost/ledger writes and excluded from model calls, repair rate and latency measurements. Never replace measured first raw text with the interpreter's repaired or sanitized returned text.

Use Node's standard SHA-256 over exact response/request UTF-8 and a deterministic serialization of the actual projected context. The scorer verifies these bindings against its supplied task/context/text and validates observation key shape/counts/outcome before considering success. A rejected observation means failure; missing/mismatched observation is unscored. These digests bind an internal evaluation observation to its input, not a cryptographic proof of a remote trusted service. Observations originate in trusted runner code and cannot be read from model output or accepted as client testimony.

The scorer parses the original response once, applies the actual schema and requires observation acceptance. Invalid JSON, missing/unknown keys or application rejection is a first-pass miss. No stripping fences, coercion, partial salvage or semantic repair. The resulting complete strict object is compared with pre-frozen structural variants; raw IDs cannot contain `$generated:` placeholders.

### Exact equivalence rules

Each structural variant includes a complete root/intent list. At most8 variants cover genuinely different valid representations, notably A01/A02 partial proposal versus focused direct clarification. A direct clarification has zero requests and later requires human judgment; it cannot pass by pretending the compiler created slots. The other root fields and base revision remain exact to the actual contract. A root with different meaning does not qualify just because its question sounds reasonable.

For each potential intent pairing compare **all** keys/values, with only these exceptions:

- `request_quote` may be any nonempty exact contained span accepted by the actual interpreter observation, with exact requested title/time phrase containment. The scorer does not infer its meaning, weaken the supplied fields, compare only keywords or demand the canonical whole message.
- `changed_fields` is an exact set: same members, no duplicates; order alone is immaterial. No missing mask member or extra changed field qualifies.
- Only the four predeclared `IntentDomain` fields may use their explicit domain values. Source refs must resolve to the exact expected source, including the same selection/media/post relation; another offered owned post is not equivalent. Named/ID templates must identify the **same unique** owned template/config; duplicate names cannot become ID-equivalent. Enabled null/true is allowed only when they have the same effective state on that exact operation; never equate null to false or unchanged to enabled. Null/frozen zone alternatives are allowed only where the actual time shape and authority permit inheritance; an absolute-local shape still needs its valid explicit zone. No change to the exact copy/title mode, part provenance, action, day, target, time, anchor, command, handle or delivery intent is equivalent.
- Limitation root `question` may be null or a schema-valid bounded explanation, with zero requests and actual first-pass acceptance. This does not grade the prose's meaning or claim it was shown to the creator; the service discards it and returns unsupported_request. For clarification, question is scored only by the human path below. Proposal/no-change question follows the actual allowed canonical case behavior; this amendment grants no general ignore-question policy.

Every domain is a pre-frozen reviewed list, maximum3 distinct values; omitted domain means exact canonical value. No runtime expansion from all owned/offered IDs, substring/synonym dictionary, Cartesian enumeration or opportunistic equivalence inferred from matching compiler output. Across six intents there are at most24 domain entries. The eight structural-variant cap does not count direct field-domain membership checks; root explicitly approved that distinction. Counterfactual independent field-domain changes and mixed changes must undergo actual application validation plus the same full compiled/behavior oracle offline before acceptance. Four fields with at most2 noncanonical values each bound single-field checks at8 per intent/48 per six-intent variant. Test every noncanonical domain value alone, every pair of different declared fields on one intent (at most24 combinations per intent), and one all-declared-alternative mixed case across intents. Report exact authored counts. Interaction not established equivalent remains unsupported/unscored until root review; these bounded checks are not exhaustive Cartesian proof. If the independence claim cannot be justified from the actual validated fields/source/template relation, split into explicit structural variants within the cap or keep it unsupported.

For `requestOrder:"exact"`, pair by index. For independent order, enumerate at most6! complete bijections with cheap exact kind/command/handle/destination pruning, never match by fuzzy title. A full bijection must satisfy every field of every request; unmatched/extra/duplicated requests fail. More than one semantically distinct successful assignment is `ambiguous_intent_match`, not an arbitrary first match. Duplicate structural variants are invalid gold; explicitly identical successful outcomes with the identical full pairing may be deduplicated deterministically by variant label only after gold validation proves equivalence. Return the matched intentMap for graph quote bindings and later behavior; never cherry-pick raw success from one branch and terminal success from an incompatible branch.

### Required counterexamples and evidence

Prove valid whole/clause evidence spans, declared selection/exact same-post and unique-name/same-template ID alternatives, mask order and independent intent order pass; changed punctuation/title mode, wrong frozen zone/day/delivery, an extra mask field, another offered owned source/template, duplicate template-name ambiguity and unauthorized IDs do not pass. A malformed first response followed by the same malformed mock response fails even if a separate final UX repair later succeeds. Reject forged/missing digest observation, missing actual validation, nine structural variants, four domain values, duplicate intent indices or a seventh intent. A01/A02 direct clarification remains pending until reviewed; safe limitation explanations do not false-fail merely for being non-null. Strict canonical exports retain their old exact-field/order checks.

## 14a1c — Full compiled graph equality under a bounded bijection

Add one export; do not replace the canonical `scoreCompiledOutput` function:

```ts
function scoreCompiledSemantic(input: {
  task: EvaluationTask;
  compiled: CompleteCompilerResult;
  raw: RawSemanticScore;
  currentPlan: PlanSnapshot | null;
}): OracleScore & Readonly<{ mappingsTried: number }>;
```

No partial result/path assertions may enter this function. Missing complete gold, unsupported graph type or missing required raw match returns unscored. A raw miss cannot be rescued by a matching safe compiled result; report the graph comparison separately if useful, but overall task success still requires the appropriate raw/behavior tracks. This function compares typed values only; it never calls a compiler, calendar resolver, tool, authority service, provider or lookup.

### Identity, full fields and order

The actual application shape/context validation observation must already have accepted the compiler result in the runner. The oracle still independently checks complete expected-vs-actual key shapes, uniqueness, finite bounds and graph/reference integrity before matching; it does not implement application authorization or claim context validity from shape alone. Reject dangling references, duplicate IDs or cycles. It may compare all graph fields and edges; it must not resolve source ownership, compute time, substitute part text or construct a plan. Reusing existing public `validatePlanShape` via later runner validation is allowed; copying compiler/authorization semantics into the scorer is not.

Generated-ID symbols are recognized **only** in fixed identity/reference locations: plan_id; step_id and its dependency/source/preview/distribution/publication/anchor references; group_id and memberships; request_id/slot_id and their scoped affected/blocking references. Creator/media/post/work/member/template IDs, aliases, source fingerprints, titles, notes, dates, template config and all other strings remain exact data. `$generated:` in literal copy is literal text, not a wildcard. A typed ID namespace prevents a step/group/slot/request symbol from accidentally sharing one actual identity.

For revisions, every retained current-plan step/group/request/slot ID is an immutable identity binding. It cannot map to a different ID, collide with a new generated node or disappear unless the complete expected removal says so. plan_id/creator/source/created_at and unaffected values remain exact. Newly added IDs alone may bind generated symbols. For new plans, plan and all generated graph identities may map bijectively; one expected ID cannot map to two actual IDs or two expected IDs to one actual ID. External metadata references never map.

Compare **every root/node field**, exact CopyValue/provenance, note, enabled state, TimeSpec/zone/UTC/local fields, template ID/config, source/target/destination, review/revision/timestamps, requested-text evidence, all group members, all dependency edges, every unresolved request and every clarification field/reason/blocking/affected binding. No extra key or object can pass. Fixed compiler/context question text is represented by its finite coded-question view below; it is not arbitrarily ignored. Question wording is not used to choose a graph mapping.

When nodeOrder is exact, preserve complete array order. When `dag`, permit only independent-node presentation permutations not forbidden by gold: dependencies must still agree exactly, all retained revision nodes keep their original relative order, and any creator-specified order is an explicit expected edge/order constraint. The48-case plan uses no requested mutual X/DA sibling order. Treat `depends_on`, group destination membership and finite slot/request affected/blocking references as complete duplicate-free reference sets, not as “contains some expected references.” New independent groups/slots/requests may reorder only with a complete unique mapped identity; do not reorder arbitrary string/copy/media arrays. Source selected-media order and template config arrays stay exact.

Use capability/destination/source role/action/day/anchor and exact non-ID fields to prune candidate mappings. Verify entire referenced DAG/group/slot structure for each complete candidate. Cap at **256 attempted complete mappings**; if proving uniqueness would require more, return unscored `graph_mapping_limit` even if one provisional candidate matched. Exactly one complete valid mapping is required; zero matches fails, multiple indistinguishable mappings are unscored `ambiguous_graph_match` pending root review. No title similarity, array zip fallback or greedy partial success is allowed. Bound all collections to the existing32-step/16-slot/64KiB limits; unsupported larger values are not scoreable by silently truncating them.

### Evidence spans in unresolved requests

Valid raw clause quotes can change `UnresolvedRequest.requested_text_quote`, so exact whole-message text equality would reintroduce false failures. `unresolvedQuotes` is a closed list of at most16 bindings to expected unresolved IDs, not a generic path exemption. `latest_request` means exact latest request truncated to the current compiler's 2,000-character evidence cap. `matched_intent_quote` means the exact quote of the already semantically matched intentMap entry, under that same cap. The binding is pre-frozen from the actual output family; the scorer cannot choose whichever source happens to match. All48 planned requests are below2,000 characters, but the rule documents the actual bound. Duplicate/unmapped bindings or any other evidence field normalization are invalid gold. Compare the resulting exact bound text and all other unresolved fields; do not drop evidence because a slot code matched.

### Required counterexamples and evidence

Prove independent X/DA presentation order passes only with dag mode, while strict canonical mode rejects it. Exercise full new-plan mapping, retained revision IDs, two terminal removals and one newly added variant. Mutate each critical class: extra/missing node, wrong source/target, title/copy mismatch, part_source change, wrong time/anchor, lost manual note/time/title/disabled sibling, wrong template/config, group split/extra membership, missing/extra edge, dangling slot, wrong affected scope, new ID colliding with retained ID, shared generated identities and hidden extra keys. Each must fail. Symmetric ambiguous maps and a257th attempted complete mapping remain unscored/non-success; they do not fall through to matching a few paths. Test that a source ID or literal `$generated:` title cannot be normalized away, and that unresolved evidence bindings cannot point to a different request.

## 14a1d — Complete observed behavior and question handling

Use a small closed view of the **actual executed path**. This represents observations, not a second executor/compiler or a fictitious service response. The later runner selects the union arm from actual control flow and keeps original output for auditing. No `assumeCorrect`, arbitrary normalization callback or silent expected-result fallback exists.

```ts
type ContextQuestionCode = "ambiguous_source" | "narrow_selection" |
  "narrow_edit_scope";
type CompilerQuestionCode = Clarification["reason"] |
  "dependent_repair_required";
type CodedQuestion = Readonly<{
  kind: "coded";
  origin: "context" | "compiler";
  code: ContextQuestionCode | CompilerQuestionCode;
  fields: readonly ("time" | "timezone" | "source_post" | "template" |
    "title" | "social_action" | "target_destination" | "destination")[];
  affectedIds: readonly string[];       // complete scoped references, or empty
}>;
type HumanQuestion = Readonly<{
  kind: "human";
  packet: Readonly<{
    latestRequest: string;
    neededFields: readonly string[];
    affectedScope: readonly string[];
    question: string;
  }>;
}>;
type QuestionView = { kind: "none" } | CodedQuestion | HumanQuestion;
type BehaviorView =
  | { stage: "context_preflight"; compiler: "not_invoked";
      outcome: "clarification"; code: "ambiguous_source" |
        "narrow_selection" | "narrow_edit_scope";
      executableIntentCount: 0; question: CodedQuestion }
  | { stage: "interpreter_terminal"; compiler: "not_invoked";
      outcome: "clarification"; code: null;
      executableIntentCount: 0; question: HumanQuestion }
  | { stage: "interpreter_terminal"; compiler: "not_invoked";
      outcome: "limitation"; code: "unsupported_request";
      executableIntentCount: 0; question: { kind: "none" } }
  | { stage: "interpreter_terminal"; compiler: "not_invoked";
      outcome: "no_change"; code: null;
      planId: string | null; revision: number | null;
      executableIntentCount: 0; question: { kind: "none" } }
  | { stage: "compiler_result"; compiler: "invoked";
      result: CompleteCompilerResultView };

type BehaviorGold = Readonly<{
  rawVariantIds: readonly string[];       // empty only for preflight
  expected: CompleteBehaviorGoldView;
}>;
function buildBehaviorView(observation: ActualPathObservation):
  | { kind: "ok"; view: BehaviorView }
  | { kind: "unscored"; code: "unsupported_oracle" |
      "missing_behavior_observation" };
function scoreBehavior(input: {
  task: EvaluationTask; observed: BehaviorView;
  raw: RawSemanticScore | null; humanReview: HumanReviewRecord | null;
}): OracleScore;
```

`ActualPathObservation` is an exact discriminated input union matching these stage arms: context preflight carries the **actual** `RequestContextResult`; interpreter terminal carries the actual `InterpretationResult` and current plan identity; compiler_result carries the actual compiler union plus raw match. Never accept mutually present terminal/compiler values, an unsupported stage or a desired outcome label detached from its actual result. Failed provider/error/unavailable turns are always task misses under the evaluation plan; this slice need not model every error string to score them as successes. Unsupported error views remain unscored/non-success with their actual failure recorded separately, not a new executable behavior.

`CompleteCompilerResultView` is the full application result with only question-bearing positions changed to CodedQuestion: compiler clarification's question, clarification_preview slots' questions, and PlanSnapshot clarification questions. Preserve all other keys/fields/arrays/references. `CompleteBehaviorGoldView` is that same closed union with a **human requirement** instead of a guessed arbitrary question string when gold requires clarification. This requirement points to existing gold.humanQuestion neededFields/affectedScope; it is not an exact-language answer. The constructors enforce actual application codes/reasons, never accept arbitrary strings from a model as a finite code and never infer fields by parsing a question. Compiler slots supply exact typed field/scope values. A plain compiler clarification supplies its actual code and the explicitly pre-frozen target binding from the matched request; it cannot gain an invented slot. Context results currently supply a finite code but no typed field/affected-node payload: their CodedQuestion has empty fields/affectedIds, and actual preflight fixtures/guard preconditions prove which bounded gate was exercised. Do not manufacture a template field from the arbitrary text of narrow_selection. The48 cases require only the finite code set above; another valid code unsupported by this view stays unscored pending root amendment. If no actual typed scope/field is available for an interpreter question, it goes to human review rather than being manufactured into a compiler slot.

A02's canonical compiler output has unknown_time/time and the existing broad date/time/zone question. Its coded view records that actual finite result; it cannot pretend the compiler asked only for timezone. The pre-frozen direct interpreter question alternative can ask just for the missing timezone and preserve the known2026-10-22/17:30; only human review determines its meaning. A plan with finite missing-template/action/target slots retains the complete independent clear graph under the full oracle. A generic whole-turn question cannot erase that graph and pass its compiled branch.

Limitation raw question/explanation is allowed by schema/application validation; the user-facing service limitation view has unsupported_request, zero executable intents and **no question**, because actual service control flow discards the explanation. It receives no automatic prose-meaning score and is not treated as displayed content. The view never fabricates a compiler invocation to obtain unsupported_request. For no_change, preserve actual current plan identity/revision; do not create a revision. Full compilers' limitation/conflict/unchanged outcomes retain their exact finite result, rather than being projected into a generic safe success.

### Human review state and fixed denominators

Use the existing frozen blinded rubric: two independent five-item yes/no/unclear ratings, at most one adjudicator, <=250-character rationale per non-yes item, no model identity/paired answer in the packet, no LLM judge/keyword parser/exact arbitrary wording match. `HumanReviewRecord` binds the exact packet digest to those complete rating arrays/rationales; the scorer derives pending/accepted/rejected/unresolved from that evidence. It does not accept a bare `accepted:true`, a record for another packet, missing primary ratings or unlimited adjudicator attempts. External custody/reviewer independence remains a process gate; an in-memory record is not proof of blinding.

Missing required question fails. Pending/incomplete human evidence yields null/pending, unanimous accepted rubric evidence can pass the question component, and rejection or unresolved final judgment is a miss. A genuinely ambiguous gold requirement fails both matched arms and requires root protocol review, never case deletion. Human verdict alone cannot override wrong intent/graph/outcome. Packet/ratings limits and counts remain exactly those in EVALUATION-PLAN; dedup identical packet text only with counted reuse. Nothing in this slice runs a review agent or asks the user for action.

In14a1b, raw clarification returns its matched variant/map and validated response with human_review_pending; the mandatory humanReview argument is null. In14a1d, the same scoring function may be re-evaluated with the exact packet-bound complete review evidence. It still rechecks raw shape/fields/application observation before resolving **that question's** pending state to accepted/rejected; behavior uses the identical packet evidence. This is completion of the specified human judgment, not an unrelated successful track overriding null or a failed intent.

`summarizeDevelopment` keeps48 overall,24 U+C,12 compound,12 A and12 S denominators. Add explicit first-pass/raw, compiled, behavior and final component summaries through a new closed `summarizeOracleDevelopment` export rather than changing existing canonical score aggregation semantics. A task passes final only when its matched raw/context branch and every required graph/behavior/human component is true; absent/null is non-success and separately counted unscored/pending. Correct zero-call preflight can pass overall/A while raw remains not_called; no new denominator exclusions. Invalid output and failed first-pass raw remain misses even if final permitted model repair produces a correct UX; preserve separate first/final tracks.

```ts
type TaskOracleScores = Readonly<{
  rawFirst: RawSemanticScore;
  compiledFirst: OracleScore | null;      // null only compiler_not_invoked
  behaviorFirst: OracleScore;
  rawFinal: RawSemanticScore;
  compiledFinal: OracleScore | null;
  behaviorFinal: OracleScore;
}>;
function summarizeOracleDevelopment(
  fixture: DevelopmentFixture,
  scores: ReadonlyMap<string, TaskOracleScores>,
  schema: typeof INTERPRETED_REQUEST_SCHEMA
): OracleDevelopmentSummary;
```

`OracleDevelopmentSummary` is the existing fixed-denominator/rate/Wilson shape repeated for the explicitly named rawFirst, compiledFirst, behaviorFirst and finalTask components, plus unscored/pending/not_called reason counts; no arbitrary metric registry. Raw U+C accuracy uses rawFirst, compound exact-plan uses compiledFirst together with its first-pass raw/behavior prerequisites, overall/A/S final task use the final triple. If a permitted model repair occurred, score the captured final response separately through the offline validation/oracle path; never substitute it into rawFirst or its observation. When no repair occurred, first/final records may reuse the same evidence without another model call. A null compiled score qualifies as an intentional absence only when the complete matching behavior view explicitly says compiler_not_invoked; otherwise it is missing evidence. Unexpected zero-call U/C preflight is a miss in its fixed eligible denominator. Usage/calls/latency remain those of the actual measured delivery, not the offline revalidation.

### Required counterexamples and evidence

Prove compiler finite-code clarification scores without exact question prose, while a different missing field/affected node fails. Prove freeform direct questions create blinded pending packets and cannot pass via wording equality, guessed keywords, a bare acceptance flag or a mismatched review record. Test accepted/rejected/unclear/disagreement/adjudicator-limit/missing-question paths and fixed denominators. Prove limitation null/non-null explanation produces the same finite user-facing view without claiming prose accuracy. Reject a fabricated compiler result attached to interpreter-terminal/preflight, a terminal branch paired with another raw variant, hidden extra behavior keys and no_change with wrong revision. Preserve A02's known date/time in human requirements and characterize the compiler's generic time slot accurately.

## Review evidence and stop points

Each slice reports exact changed scorer/test files, focused tests, strict test-file TypeScript evidence where applicable, newly exported signatures/gold keys, counterexamples, compatibility with canonical exports and remaining unsupported cases. No fixture rewrite to make a test pass. Because this is a bounded offline mjs/test amendment, run the focused scorer suite; broaden/build only if imports/type changes justify it and accurately retain known wider repository limitations.

Root reviews and accepts b before c, c before d, then the actual runner/scorer boundary before CP-14b integration. Root separately accepts all48 canonical case feasibility and complete independent semantic gold/equivalence evidence. Unknown scope, mixed-domain interactions, ambiguity or unsupported typed output returns to root with case/reason; it never becomes an automatic pass or a second parser/compiler. No heldout generation/scoring or CP-16 provider dispatch follows from these amendments alone.


### Root implementation refinement — 2026-10-17

Graph search additionally caps visited partial assignment states at 32,768, alongside the original 256 complete mappings. Static candidate-bucket cardinality checks reject impossible assignments before search. Reaching either cap returns unscored graph_mapping_limit, never provisional success. Normalization visits explicit typed graph paths only; template config and literal payloads are opaque/exact. Exact order preserves every array; DAG mode permits only declared entity/set presentation order and retains prior revision order across steps, groups, unresolved requests and clarification slots. Root independently accepted b/c infrastructure with 28 focused tests after review corrections; d is separately dispatched. Corpus and measurement gates remain unchanged.
