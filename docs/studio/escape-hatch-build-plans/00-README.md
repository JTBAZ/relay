# Escape Hatch construction program

Escape Hatch is Relay's paid, one-time independence product: it turns a creator's extracted Patreon library, tier rules, and media into a creator-owned, deployable membership website. The creator receives source code, normalized data, copied media, deployment assets, and an ownership manifesto. Relay may sell optional services, but the delivered site must remain operable without them.

## Current state versus target

The existing [`packages/escape-hatch`](../../../packages/escape-hatch/README.md) package is a CLI test bed. It can generate a themed Next.js preview and zip, but its persona switcher is a soft gate and premium files are copied into `public/media`. It is not a production paywall.

The target is a complete Next.js TypeScript application with:

- server-enforced public, member, and tier access;
- creator-owned accounts, database, object storage, billing, hosting, domain, and credentials;
- an embedded admin for posts, media, tiers, patrons, branding, and deployment health;
- Patreon-to-independent-site continuity without forced dependence on Relay;
- a guided Relay Studio wizard that ends with a live, tested site and handoff packet.

## Locked product decisions

1. The purchase is a one-time independence package, not a percentage of creator revenue.
2. Creator funds flow directly through a billing account the creator owns.
3. Vercel + creator-owned Supabase + creator-owned R2 is the primary guided path.
4. A portable Docker/Postgres path and one policy-validated hosting recipe support lawful creators who cannot use the primary hosting path.
5. Stripe is supported only for eligible businesses. Billing is adapter-based; other lawful categories require an independently validated processor recipe.
6. Existing patrons may authenticate with Patreon; access is granted when either the mapped Patreon or independent billing entitlement is active.
7. Creators choose creator-owned Patreon OAuth or Relay-managed Patreon verification. The managed option is a separately billed monthly service and must be replaceable without rebuilding the site.
8. The visual chassis is one premium theme derived from Relay's patron gallery. Branding is controlled, not a general page builder.
9. Comments and favorites are out of scope. The product supports posts, media, attachments, tiers, accounts, and access; creators may link Discord for community.
10. The delivered package has a 90-day defect warranty. Ongoing package maintenance is paid; maintenance of Relay-managed OAuth is included only while that service remains active.

## Reading order

1. [`01-PRODUCT-NORTH-STAR.md`](01-PRODUCT-NORTH-STAR.md)
2. [`02-WIZARD-UX-CONTRACT.md`](02-WIZARD-UX-CONTRACT.md)
3. [`03-GENERATED-APPLICATION-CONTRACT.md`](03-GENERATED-APPLICATION-CONTRACT.md)
4. [`04-DATA-MIGRATION-AND-PARITY.md`](04-DATA-MIGRATION-AND-PARITY.md)
5. [`05-IDENTITY-ENTITLEMENTS-AND-PAYWALL.md`](05-IDENTITY-ENTITLEMENTS-AND-PAYWALL.md)
6. [`06-BILLING-AND-PROVIDER-POLICY.md`](06-BILLING-AND-PROVIDER-POLICY.md)
7. [`07-DEPLOYMENT-AND-OPERATIONS.md`](07-DEPLOYMENT-AND-OPERATIONS.md)
8. [`08-GENERATED-SITE-ADMIN.md`](08-GENERATED-SITE-ADMIN.md)
9. [`09-TESTING-AND-RELEASE-GATES.md`](09-TESTING-AND-RELEASE-GATES.md)
10. [`10-AGENT-ORCHESTRATION.md`](10-AGENT-ORCHESTRATION.md)
11. [`11-BUILD-BATTING-ORDER.md`](11-BUILD-BATTING-ORDER.md)
12. [`12-HUMAN-SIGNOFF-AND-OWNERSHIP-PACKET.md`](12-HUMAN-SIGNOFF-AND-OWNERSHIP-PACKET.md)
13. [`13-PROVIDER-POLICY-EVIDENCE.md`](13-PROVIDER-POLICY-EVIDENCE.md)

## Authority and reuse

- Product contract: this folder.
- Existing generator and prototype: [`packages/escape-hatch`](../../../packages/escape-hatch/).
- Canonical Patreon data: [`src/ingest`](../../../src/ingest/) and [`docs/patreon-ingest-canonical.md`](../../patreon-ingest-canonical.md).
- Clone and access semantics: [`src/clone`](../../../src/clone/).
- Media export and R2: [`src/export`](../../../src/export/) and [`src/storage`](../../../src/storage/).
- Part 2 strategy: [`road map.md`](../../../road%20map.md), Workstreams F, G, H, and J.
- Billing implementation canon: [`MONETIZATION_MASTER_MAP.md`](../../MONETIZATION_MASTER_MAP.md).

When contracts conflict, this program governs Escape Hatch product scope; existing security and origin-data rules remain non-negotiable.

## Program completion

Documentation completeness is not product completion. Escape Hatch is releasable only when the milestone gates in [`11-BUILD-BATTING-ORDER.md`](11-BUILD-BATTING-ORDER.md), automated suites in [`09-TESTING-AND-RELEASE-GATES.md`](09-TESTING-AND-RELEASE-GATES.md), and human signoff in [`12-HUMAN-SIGNOFF-AND-OWNERSHIP-PACKET.md`](12-HUMAN-SIGNOFF-AND-OWNERSHIP-PACKET.md) all pass.
