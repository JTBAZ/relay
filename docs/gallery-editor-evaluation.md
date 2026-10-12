# CE02 / CE10 conversational editor evaluation

The runnable CE10 entry point is `scripts/evaluate-gallery-editor.mjs`. It reads the fixed CE02 fixture by default or an explicit `--corpus` path with schema `ce02.v1` or `ce02.v2`. Live mode uses the production `runEditorIntent` loop and Responses provider and writes a case-level JSON report. It does not apply proposed changes or contact Patreon. The default is a network-free dry run.

```powershell
node scripts/evaluate-gallery-editor.mjs --model YOUR_EXPLICIT_MODEL_ID --split development --corpus tests/fixtures/gallery-editor-ce02.json --family metadata --max-output-tokens 1000 --dry-run --out work/ce10-development-plan.json
```

The dry run validates the partition and lists planned cases. `--family metadata` selects all non-vision cases; `--family vision` selects vision cases. Other cases remain in the report as `family_filtered`, so the split total remains 40 development or 20 heldout. Vision cases without mapped image evidence are excluded separately. A dry run does not produce model output or accuracy claims.

Run `node scripts/evaluate-gallery-editor.mjs --self-test` to check the fixture adapter's provenance, search, pagination, collection, family, and image-status responses without loading a provider.

Before a paid run, verify that the exact model identifier is available to the account and check its current input, output, and image token pricing from the provider's official pricing information. Set `OPENAI_API_KEY`, `LIBRARY_EDITOR_MODEL_PRICING_JSON` with an entry keyed by that exact model identifier, and `LIBRARY_EDITOR_MODEL_PRICING_VERIFIED=1` as an operator attestation, either in the environment or the repository's local `.env`. The price entry needs positive `inputUsdPerMillion` and `outputUsdPerMillion`; image runs also need a conservative integer `maxImageInputTokens` allowance. Build the repository first so `dist/src/gallery-editor` exists. No model name or rate in this document asserts current availability or pricing.

```powershell
npm run build
node scripts/evaluate-gallery-editor.mjs --model YOUR_EXPLICIT_MODEL_ID --split development --corpus tests/fixtures/gallery-editor-ce02.json --family metadata --max-output-tokens 1000 --live --out work/ce10-development.json
node scripts/evaluate-gallery-editor.mjs --model YOUR_EXPLICIT_MODEL_ID --split heldout --corpus tests/fixtures/gallery-editor-ce02.json --family metadata --max-output-tokens 1000 --live --out work/ce10-heldout.json
```

By default the runner uses the same `.relay-data/gallery-editor-budget.json` ledger as the application, or the path under `RELAY_GALLERY_EDITOR_DATA_DIR` when that override is set. If `--ledger` is supplied, use the same path for both splits and every process sharing the approved budget. `FileProviderBudget` atomically reserves before each call, enforces $15 development, $10 heldout, and $25 total, and retains reservations when charges are unknown. Do not delete or reset the ledger between runs. The production intent loop caps each case at four provider calls, twenty reads, 24 images, and 90 seconds. The report records provider token usage, cost, and call count for completed cases, plus latency and errors. Failed cases can still consume budget; inspect the ledger for their reservations and charges.

`--max-output-tokens` is passed to the production Responses provider. It defaults to 4000 and accepts integers from 256 through 16000. Use the same explicit value, such as 1000, for each model in a comparison; smaller output limits conserve budget but can raise incomplete-proposal failures. The report records the configured model, output limit, split, low image detail, and `store:false` setting.

The runner stops the paid run after an infrastructure/provider configuration or budget failure and marks later cases excluded, preventing a repeated outage from consuming additional uncertain-charge reservations. Intent/schema failures remain individual evaluation results. The fourth model call has no read tools and must finalize a grounded cart or clarification within the existing bound.

The fixture adapter exposes creator-owned posts, works, series, collections, and media IDs from the repaired CE02 catalog with cursor pagination and a shared per-case read budget. Expected actions, outcomes, semantic labels, and symbolic vision observations do not enter model input. The report compares proposed actions to the fixture's action list after removing generated action IDs. `actionExactMatch` is a mechanical comparison, not semantic accuracy: a reviewer must inspect disposition, action scope, retained cart entries, naming inheritance, and fixture correctness. By default, the report records only the generated message's hash and length. For independent review of clarification and limitation wording on fictional fixtures, pass `--include-generated-messages`; this explicitly adds the generated reply text to the local report. `semanticAccuracy` remains `null` until a separate human adjudication process is completed.

Each report records SHA-256 hashes for the exact corpus and runner files and for the built production intent/provider modules used by a live run. A dry run records built-module hashes when those files exist. Mapped images appear only as SHA-256 digests keyed by fixture ID. Reports omit raw image bytes, API keys, and user messages. Raw generated reply text appears only with `--include-generated-messages`. Treat proposed actions, fixture labels, and opt-in replies as sensitive evaluation data.

Completed and failed cases list the names of requested read tools and the media IDs actually returned as images, with an image inspection count. Tool arguments, read results, and image content are omitted. A completed vision case is marked `visualEvidence: not_inspected` and `vision_evidence_missing` if the expected fixture image was never returned through the image resolver. Such a case cannot establish a vision pass even when its action list mechanically matches. The report counts inspected and uninspected vision cases separately.

The CE02 vision observations are symbolic and explicitly are not image ground truth. Without genuine image evidence, vision cases are excluded and have `real_image_evidence_unavailable` in the report. To include an image case, create a JSON map from CE02 vision fixture ID to a local PNG or JPEG file. For example:

```json
{
  "v-cover-1": "C:/approved-fixtures/rain-image.png",
  "v-cover-2": "C:/approved-fixtures/shore-image.jpg"
}
```

Pass `--images path/to/map.json`. The runner verifies image signatures and a 2 MB per-image bound, then passes only mapped media through the authorized image read tool as data URLs. A mapping is an operator assertion that the file is genuine and authorized; it cannot be inferred from the symbolic fixture text. Even with images, visual correctness requires human review against the actual pixels.

For the fresh visual partition, pass its reviewed `ce02.v2` corpus and image map explicitly, for example `--corpus tests/fixtures/FRESH-CORPUS.json --family vision --images tests/fixtures/gallery-editor-visual/images.json --max-output-tokens 1000`. The runner still reports all 40 or 20 cases in the selected split, with non-vision cases marked `family_filtered`.

The report's `expectedOutcome` and comparison are added only after a case completes; the provider receives current cart, conversation, and catalog reads. Keep heldout reports private until development decisions are frozen to preserve the partition.

October 12 first-run findings: development Astra matched 35 available action oracles; Sol had three runtime failures and two mechanical mismatches. Heldout results exposed missing loaded-page context, an adapter that omitted tag search, contradictory selected targets, and equivalent collection additions scored differently. These runs are diagnostic, not passing acceptance evidence. Current production context now distinguishes visible page posts from selection; search and final-call behavior were improved after this exposure. Do not relabel a reused heldout run as independent acceptance. A fresh reviewed partition and genuine visual tasks remain rollout gates; pilot defaults stay disabled.
