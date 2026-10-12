# Conversational Library editor provider

`runEditorIntent(session, message, provider, readTools, options?)` returns a validated `{ message, actions, usage? }` proposal. It never persists a cart. The authenticated route must revalidate ownership, preview the complete actions through the deterministic engine, and only then replace the current cart. Apply remains a separate explicit command. Read adapters must bind the authenticated creator and ignore any creator identity inside metadata.

The server uses native `fetch` against `https://api.openai.com/v1/responses`, `store:false`, strict read-tool arguments, and strict proposal output. Every response output item, including encrypted reasoning, is replayed in order when returning tool results. No user-provided URLs, API endpoints, or model aliases are accepted. No keyword intent parser or heuristic fallback exists: without configuration the conversational editor is disabled and the existing cart remains available.

The intent loop bounds each turn to four provider calls, twenty read operations, 24 inspected images, and 90 seconds including read operations. The deadline propagates `AbortSignal` and also races non-cooperating injected adapters. Model-generated schemas undergo deterministic validation before preview. This validation checks shape; authenticated preview must check ownership, complete reorder membership, naming invariants, and stale dependencies.

## Server environment

- `OPENAI_API_KEY`: server secret; never place in a browser variable or log it.
- `LIBRARY_EDITOR_MODEL`: explicit model identifier, default `gpt-6-astra` as requested. Account availability is not inferred or substituted.
- `LIBRARY_EDITOR_MODEL_PRICING_JSON`: map keyed by the exact configured model. Each value must provide positive numeric `inputUsdPerMillion` and `outputUsdPerMillion`. Image inspection also requires an integer `maxImageInputTokens` ceiling for that model and configured thumbnail/detail policy. There are no built-in prices; supply verified current rates. Synthetic test rates are not recommendations.

`responsesProviderFromEnv(budget, env?, fetch?)` constructs the provider. `createResponsesProvider({ apiKey, model, pricing, budget, phase, maxOutputTokens, fetch })` supports test injection and an explicit `development` or `heldout` budget partition. Never derive phase from model/user text.

`ProviderBudget.reserve({model, amountUsd, phase, signal})` must atomically reserve against a durable ledger before a network request; `settle(reservationId, actualUsd)` reconciles known usage. Null settlement means an uncertain charge and must retain the full reservation until reconciliation. Reservation must enforce $15 development, $10 heldout, and $25 total across workers and process restarts. A lost process must not automatically refund its reservations. HTTP failures, aborts, missing usage, and network ambiguity remain reserved. The transport does not retry automatically.

Reservations conservatively account for serialized UTF-8 text and structure, explicit image token ceilings, and the maximum output allowance. Base64 image transport bytes are excluded from the text count; the original image payload still reaches the provider. Recorded usage is reconciled after each request; configured ceiling overruns fail the proposal and must trigger operational pricing review. Image ceilings must be verified for the chosen model before enabling image calls. This is an injected coordination boundary: passing an in-memory counter does not satisfy production readiness.

## Read adapter

`EditorReadTools(name, args, {signal})` returns `{data, images?}`. The six allowed tools are `searchLibraryPosts`, `resolveLibraryPosts`, `expandLibraryFamily`, `readLibraryCollections`, `readLibraryMedia`, and `resolveLibraryImageReferences`. Search, family, and collection tools accept string cursors and limits up to 100. Null optional arguments are removed before invoking the adapter. `resolveLibraryPosts` accepts `postIds`; media tools accept `mediaIds`; family expansion accepts `kind` and `id`. Read services must enforce creator ownership and use one shared per-turn `LibraryReadBudget`.

Only `resolveLibraryImageReferences` can return images, as `{url, mediaId, postId?}`. The adapter must first authorize each media ID, retrieve only validated owned thumbnails, honor the abort signal, and return either a bounded data image or a short-lived authorized HTTPS URL. The intent code does not fetch arbitrary user URLs. Image IDs must match the requested IDs; HTTP, file URLs, credentials in URLs, and non-image data URLs are rejected. Descriptions, tags, tool data, and thumbnail content remain untrusted model input.

## Verification and evaluation

Run `npx vitest run --configLoader runner tests/gallery-editor-intent.test.ts tests/gallery-editor-evaluation.test.ts`. Mock cases cover full-family retrieval after pagination, reasoning replay, authoritative manual cart context, clarification output, invalid schemas, attempted commit tools, injected metadata, image provenance and limits, provider/read timeouts, four-call bounds, configured prices, reservations, and sanitized provider errors.

`tests/helpers/gallery-editor-evaluation.ts` consumes the fixed CE02 40 development / 20 heldout partitions with injected provider and read adapters. It returns execution records with `quality: unreviewed` and `semanticAccuracy: null`; expected labels never enter provider inputs. For an actual model evaluation, inject a provider using the matching durable budget partition and authenticated fixture adapters, supply real authorized image fixtures, and assess results separately against reviewed expectations. The corpus's symbolic image observations are not image evidence. Mock execution verifies plumbing only and is not evidence of model accuracy, rename semantics, or vision quality.

The sixty labeled fixtures validate against the action contracts and catalog, including complete manual-cart preservation. Actual Astra/Sol runs on October 12 exposed heldout oracle and adapter defects; shape validation alone does not establish semantic correctness. Original reports remain diagnostic. The independently reviewed CE02 v2 corpus retains the corrected development metadata cases, adds ten actual PNG tasks across the two partitions, and replaces the exposed heldout conversations. The procedural CC0 fixtures measure visible colors and shapes only. Run it with the canonical image map, verify inspection traces, and adjudicate semantics before claiming acceptance.

Official implementation references: [function calling](https://developers.openai.com/api/docs/guides/function-calling) and [reasoning item replay](https://developers.openai.com/api/docs/guides/reasoning). Reviewed October 11, 2026.

Operational metrics record request operation/status/duration, cart-revision requests, Apply failures, Undo requests, model-reported clarification/limitation disposition, bounded token usage, and actual known cost. They omit transcripts, images, action values, and target names. Clarification disposition is model-reported, not proof of semantic correctness.
