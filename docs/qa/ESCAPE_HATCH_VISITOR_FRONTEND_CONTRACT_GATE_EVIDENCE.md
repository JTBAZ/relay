# Escape Hatch visitor frontend contract gate evidence

**Status:** Accepted as a documentation and downstream acceptance gate  
**Completed:** 2026-07-23  
**Master planner/reviewer:** Sol  
**Contract:** `docs/studio/escape-hatch-build-plans/14-VISITOR-FRONTEND-PRODUCT-CONTRACT.md`  
**Current implementation slice:** EH-050  
**Next implementation slice:** EH-051  
**productionSafe:** `false` (unchanged)

## Gate scope

This gate locks the production patron frontend before EH-054 tier mapping and EH-060/EH-061 CMS work make route, content, and access decisions expensive to change.

It is documentation-first. It does not claim that the current generated kit implements the production route map, post schema, search state machine, tier catalog, players, downloads, legal surfaces, or final browser acceptance.

EH-051/EH-052/EH-053 may proceed because provider adapters and policy evidence are presentation-independent. EH-054 and EH-060/EH-061 cannot pass until their visitor-facing work conforms to the contract.

## Settled decisions

- Canonical Patreon-like site; posts are primary and may include inline media plus secure attachments.
- Strict patron/operator separation.
- Patron routes: `/`, `/posts/[slug]`, `/tiers`, `/login`, `/account`, and legal routes.
- `/preview` is operator-only; `/p/[slug]` is a compatibility redirect.
- One controlled cold-gallery chassis with a creator-published fixed scheme.
- Empty search state: creator-pinned feature mosaic plus reverse-chronological recent posts.
- Query or active media/tier/mature filter: one full eligible-gallery result set.
- Clearing query and filters restores creator curation exactly.
- Search parity includes title/tag/authorized body, media type, tier, My tier, and mature controls.
- Relay collections, random walk, comments, favorites, and discovery remain excluded.
- Sanitized HTML body plus structured media, embeds, and attachment records.
- Image stacks, authenticated video/audio players, and secure downloads.
- Locked default: title/date/access label and generic frame.
- Optional public cover must be a separate explicitly public object.
- One `/tiers` catalog: existing patrons connect Patreon; new patrons use independent checkout.
- Context-aware actions prevent duplicate billing for active Patreon or dual-source patrons.

## Current implementation evidence

The preview kit already provides:

- cold-gallery tokens and approved type pairings;
- media mosaic and PatronChrome;
- server-side entitlement evaluation;
- private media delivery;
- locked-card no-fetch behavior;
- account/login and paywall reason copy;
- Patreon OAuth and managed-verification choices;
- creator-fixed theme inputs.

These foundations are compatible with the contract and are preserved.

## Known implementation drift

| Contract | Current preview | Disposition |
|---|---|---|
| `/` is patron home | `template/app/page.tsx` redirects to `/library` | EH-060 route migration |
| `/posts/[slug]` | Gallery/admin links use `/p/[slug]` | Compatibility redirect + EH-060 canonical links |
| `/preview` operator-only | Current visitor demonstration lives at `/preview` | EH-060 preview boundary |
| Patron chrome has no operator links | `PatronChrome.tsx` links Hatch Console and Style dials | EH-060 chrome correction |
| Rich body and attachments | `ClonePostEntry` contains title/tags/access/media only | Versioned contract + EH-060 migration |
| Full search/filter gallery | Generated visitor gallery has no patron search state machine | EH-060 |
| Public `/tiers` | No generated visitor route | EH-054/EH-061 |
| Video/audio/download UI | Private delivery spine exists; players/download list do not | EH-060 |
| Fixed published appearance | Style dials are preview/session-oriented | EH-062 |
| Legal and SEO surfaces | Required routes are absent | EH-062/EH-070 |
| No public premium fallback | `public_legacy` remains an explicit residual mode | Must close before production |

No drift item is accepted as production-complete.

## Downstream obligations

### EH-051 Stripe eligible-business adapter

- Return provider-neutral checkout and portal results usable by `/tiers`, paywall actions, and `/account`.
- Keep webhook and entitlement truth server-side.
- Do not hardcode page layout or provider-specific claims into patron components.

### EH-054 tier and billing wizard

- Preview the unified public tier card fields.
- Route active Patreon and dual-source patrons away from duplicate checkout.
- Show provider-policy blocks and lawful alternatives.
- Record sandbox results for the same actions patrons will use.

### EH-060 posts/media

- Version the post contract with sanitized body, body text, feature position, public cover, media, embeds, and attachments.
- Canonicalize patron routes and isolate `/preview`.
- Implement pinned mosaic plus recent feed and the query/filter full-gallery mode.
- Implement authorized search visibility and exact curation restoration.
- Implement image stacks, authenticated video/audio, and secure downloads.
- Remove Hatch Console links from patron chrome.

### EH-061 tiers/patrons

- Implement public `/tiers`.
- Implement context-aware conversion actions.
- Expose access reasons and persona preview without trusting browser claims.

### EH-062 appearance/connections/health

- Publish one fixed scheme as versioned configuration.
- Provide feature/public-cover controls and both homepage preview modes.
- Add legal and provider-health editing surfaces required by the contract.

### EH-070/EH-071 deployment

- Prove canonical URLs, redirects, robots, sitemap, metadata, cache policy, and private-media behavior on deployed targets.

## Remaining human signoffs

The product decisions in this gate were explicitly settled. Later milestone acceptance still requires browser evidence for:

- final desktop and mobile composition;
- creator-specific feature order and optional public covers;
- creator tier benefit copy and checkout actions;
- real media/player behavior;
- accessibility and reduced-motion review;
- legal text and indexing choice;
- provider sandbox and deployed-origin behavior.

## Verification

Documentation consistency review covered:

- `00-README.md`
- `02-WIZARD-UX-CONTRACT.md`
- `03-GENERATED-APPLICATION-CONTRACT.md`
- `08-GENERATED-SITE-ADMIN.md`
- `09-TESTING-AND-RELEASE-GATES.md`
- `11-BUILD-BATTING-ORDER.md`
- `12-HUMAN-SIGNOFF-AND-OWNERSHIP-PACKET.md`
- `14-VISITOR-FRONTEND-PRODUCT-CONTRACT.md`

Searches confirmed that remaining `/preview`, `/p/[slug]`, Hatch Console, missing-body, attachment, and tier-route references are either explicit compatibility requirements or recorded implementation drift.

IDE documentation diagnostics reported no errors.

No runtime commands were required because this gate changes documentation and downstream acceptance only.
