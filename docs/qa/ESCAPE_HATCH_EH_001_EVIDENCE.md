# Escape Hatch EH-001 milestone evidence

**Status:** Accepted as a versioned preview-contract baseline  
**Completed:** 2026-07-22  
**Master planner/reviewer:** Sol  
**Implementation builder:** Cursor Grok 4.5 High  
**Slice:** EH-001 — Shared contracts  
**Next dependency:** EH-010 — Sanitized golden fixtures

## Scope and ownership

EH-001 adds one portable contract and preview-access implementation for the Escape
Hatch package and generated application. It does not add production authentication,
server entitlements, private media, billing, provider setup, deployment, migration, or
recovery.

The slice changed only package contract, adapter, generated-template, status, test, and
focus-style files. Pre-existing changes in `packages/escape-hatch/README.md` and
`packages/escape-hatch/IA.md`, root Relay contracts, fixtures, Prisma, environment files,
and unrelated working-tree changes were not absorbed.

## Delivered behavior

- `SiteBundle` serializes as `site-bundle/1.0.0`.
- `CloneSiteModelInput` serializes as `clone-site-model/1.0.0`.
- Legacy unversioned sample and clone fixtures normalize through an explicit v0
  compatibility path; unsupported current/future versions fail closed.
- Package and generated app use a byte-identical, self-contained contract module.
- `data/site.json` is runtime-validated before generated pages trust it.
- Validation reports field paths without payload or secret values.
- IDs, slugs, media paths, timestamps, duplicate keys, tier references, and media-count
  integrity are validated before filesystem use.
- Clone provenance retains the input `generated_at` value.
- Preview access matches Relay paid/free and tier-ordering behavior when tier floors are
  available; legacy fixtures without floors retain exact-ID tier gates.
- The executable status advances to EH-010 while retaining
  `productionSafe: false`.
- Generated controls now have a high-contrast `:focus-visible` double ring, including an
  inset treatment for clipped cards.

This remains a client-side soft gate. Persona tier IDs are not authoritative, and
premium media remains public.

## Automated evidence

Commands ran from the repository root unless noted.

| Command | Exit | Result |
|---|---:|---|
| `npm run build` | 0 | Prisma generation and Relay TypeScript build passed |
| `npm run typecheck --prefix packages/escape-hatch` | 0 | Package TypeScript passed |
| `npm run escape-hatch:test` | 0 | 3 files, 92 tests passed |
| `npm run status --prefix packages/escape-hatch` | 0 | Human status reports EH-001 and EH-010 next |
| `npx tsx packages/escape-hatch/src/cli.ts status --json` | 0 | Deterministic parseable JSON; `productionSafe: false` |
| Targeted Patreon/tier/clone/access/media Vitest command | 0 | 8 files; 41 passed, 1 pre-existing todo |
| Generate/install/build `eh-001-review-20260722` | 0 | Independent Next.js build passed; 7 pages generated |
| Generate/install/build `eh-001-focus-master` | 0 | Focus-corrected Next.js build passed; 7 pages generated |

The remaining todo is the pre-existing lazy-loaded `data-src` image extraction case in
`map-patreon-post-to-ingest.test.ts`.

Generated npm installation reported 1 moderate and 1 high dependency advisory. No audit
fix was applied because that would exceed the slice and may require breaking upgrades.

## Security review

The scoped security review found no medium, high, or critical issue in EH-001. It
confirmed fail-closed versioning, fresh-object normalization, own-property reads,
prototype-pollution guards, media/output path containment, secret-safe errors, portable
generated contracts, and honest prototype warnings.

Informational follow-up belongs to later slices:

- validate export-index `relative_blob_path` before EH-011 importer use;
- apply equivalent slug/ID containment to legacy zip/from-relay local CLI paths;
- replace public media and soft personas with hard identity and private delivery in
  EH-030/EH-033.

## Browser evidence

The clean generated app ran on port 3001 and was reviewed at desktop and approximately
390 px mobile widths.

- Structure showed Public 1, Patrons 1, Gold 1, and Silver 0.
- Public could view only the public post.
- Patron could view public and member posts but not Gold.
- Gold could view all three posts.
- Silver did not unlock Gold under legacy no-floor exact-ID compatibility.
- `/p/welcome-public` rendered and returned to Preview.
- `/p/does-not-exist` showed `Post not found.` and `Back to Preview`.
- Mobile Structure and Preview had no observed horizontal overflow or clipping.
- `GET /site.json` returned 200 with
  `contract_version: site-bundle/1.0.0`.
- Unauthenticated `GET /media/m_gold.svg` returned 200 with SVG bytes.

The Gold response is a **known critical prototype security failure**, not paywall
acceptance.

The first browser pass found no visible keyboard focus. Grok added a high-contrast
`:focus-visible` double ring and removed the search input's `outline: none`. Generated
CSS and package regression tests verify the rule is present. The Cursor browser
harnesses could focus elements programmatically but could not establish native keyboard
modality, so they could not visually activate the `:focus-visible` pseudo-class.
Manual visual keyboard confirmation remains required before a later UI/release gate;
this limitation is not reported as a browser pass.

Malformed-contract failure was exercised by automated runtime tests, not by mutating the
review server's `data/site.json`.

## Acceptance decision

EH-001 passes the Milestone 0 shared-contract gate:

- existing fixtures and CLI behavior remain reproducible;
- current output is explicitly versioned and runtime-validated;
- generated apps receive the canonical portable contract;
- preview access semantics have executable parity evidence;
- malformed, unsafe, and unsupported data fail closed;
- the prototype still makes no production-security claim.

This is not authentication, private-media, provider, deployment, migration, or release
acceptance. EH-010 must add sanitized real-shape fixture coverage without weakening
contract validation or introducing patron PII.

## Rollback

Revert the EH-001 commit and delete disposable `packages/escape-hatch/.out/eh-001-*`
directories. No database, provider, credential, or external state mutation occurred.
