# CE02 v2 independent fixture review

Reviewed 2026-10-12. Freeze status: ready.

Corpus: `tests/fixtures/gallery-editor-ce02-v2.json`

SHA256: `4BB2EB9053E4F29C3D64B6D331C141C24BB7864D9A2EA2F8BD23E7C4F3BB7DA7`

Implementation freeze supplied by the coordinator: `f86af8c`. This review did not change production code, invoke a model, or make paid API calls. It does not establish model accuracy. The reviewer inspected the corpus, validator, evaluation adapter, provider accounting change, and corresponding mocked provider test. Test execution was performed separately by the coordinator.

## Corpus composition and provenance

There are 40 development cases and 20 fresh heldout cases. Development cases 001–035 reuse the corrected current v1 metadata cases; independent structural comparison found no differences except case IDs and split. Development cases 036–040 use actual image fixtures. The fresh heldout partition contains 15 metadata cases and five image cases. Both partitions reuse the same two image assets; the heldout cases are fresh prompts, not unseen image assets.

The teaser posts use source title mode, consistent with their displayed preview suffixes. A whole-work rename is expected to convert source-mode members to work inheritance under the approved editor contract. The shoreline post remains custom, so its title is preserved by a work rename. These provenance repairs do not invalidate the reused development action expectations.

## Corrections verified before freeze

- Held012 explicitly requests independent work titles; held013 retains its title-mode clarification expectation.
- Held005 and held009 remove actual current collection members, eliminating their former absent/duplicate membership ambiguity.
- Dev039 and held020 request four descriptive tags, matching their reference actions.
- Dev037 explicitly targets media tagging and its reference action includes `mediaId: m-shore`; its prompt no longer supplies the expected placement.
- Teaser naming provenance is consistent with current titles; custom title exceptions remain custom.
- The validator resolves the image map and assets relative to the current checkout first.
- Dev016–018 explicitly supply the destination titles required by their expected rename actions. The earlier fixture snapshot omitted those titles; the frozen main-checkout corpus matches corrected v1.

## Image truth and evidence separation

The reviewer visually inspected the canonical 256×256 PNGs:

| Fixture | Asset | Pixel observations |
| --- | --- | --- |
| v-cover-1 | gallery-editor-visual/asset-a.png | Blue gradient, red square near the top-left corner |
| v-cover-2 | gallery-editor-visual/asset-b.png | Green gradient, orange horizontal bar centered in the image |

The expected visual facts agree with these pixels. Catalog image references contain identifiers and asset paths, without observation text or hidden answers. The reviewed evaluation adapter does not pass expected actions or visual fact labels to the provider. Expected fixture IDs are used for evidence-availability and inspection checks, not to supply answers. Semantic grading must require recorded inspection of the relevant image; a correct-looking guess without inspection is insufficient.

The provider's reservation calculation replaces image URL transport text with a placeholder only while counting bytes, then adds the configured per-image token allowance. The actual HTTP payload separately serializes the original body and preserves the complete image URL. The mocked regression test checks that a large base64 payload reaches fetch unchanged and does not count as text tokens in the reservation.

## Semantic adjudication rules

Judge the returned message and complete proposed cart together, including preservation of unrelated manual edits, correct targets and naming scopes, requested values, and limitations or clarifications where appropriate. Exact action matching is a diagnostic signal, not the semantic verdict. Equivalent descriptive tags, ordering of tag sets, and equivalent supported action representations may be acceptable when they meet the request.

Held012 asks for an A-then-B arrangement already represented by the catalog's series membership and independent titles. An accurate explanation that the requested arrangement already exists can be legitimate; omitting redundant link actions alone must not fail this case. Assess any proposed part labels or other actual changes separately.

No paid outputs were consulted to approve this fixture freeze. At report creation, `outputs/relay-astra-development-v2.json` was not yet available. Model-result adjudication is pending a separate review and should not change the frozen corpus or production implementation during the heldout comparison.
