# Financial Atlas

**Canonical reference** for Relay's business model, revenue streams, unit economics, and financial projections at scale.

Use this document when:
- Updating `road map.md`, `monetization-scheme-infrastructure-plan.md`, or Part 3 workstream specs
- Making product decisions that affect pricing, payout rates, or tier structure
- Reviewing milestone sequencing against financial readiness
- Onboarding contributors who need business model context

Related docs:
- [monetization-scheme-infrastructure-plan.md](../monetization-scheme-infrastructure-plan.md) — infrastructure costs, COGS guardrails, hosting modes
- [monetization-discovery-premium-agent-prompt.md](monetization-discovery-premium-agent-prompt.md) — agent constraints for Premium, promo, and boost mechanics
- [road map.md](../road map.md) — Part 3 Workstreams K–N (patron identity, feed, discovery, audience monetization)

---

## The Platform in One Sentence

Relay is a **creator gallery, analytics suite, and patron discovery network** built on top of Patreon: artists get a better home for their work and data; fans get a unified feed and a curated way to discover and support artists they will love.

---

## User Segments and Pricing

| Segment | Monthly price | What they get |
|---------|--------------|---------------|
| **Artist (Creator)** | **$18/mo flat** | Library curation, gallery, analytics, backup sync, Exposure Feed inclusion, storefront, Promo Pool tools |
| **Free Fan** | $0 | Unified home feed for subscribed artists; daily Free Preview from algorithmically matched new artists |
| **Supporter (Fan)** | **$5/mo** | 5 Skips/mo, 1 Boost/mo, 14-day timed access windows |
| **Curator (Fan)** | **$14.99/mo** | 15 Skips/mo, 3–5 Boosts/mo, 30-day timed access windows, status badge |
| **Reload Pack** | **$5 / 10 skips** | Extra Skips on demand; ~$0.17/skip platform spread |

**Artist pricing is flat, not size-tiered.** The value proposition: "We do not tax your success. One flat fee — you keep everything you earn on Patreon."

---

## The Discovery Engine

### Two Feed Channels

**Home Feed** — subscribed content
- Aggregates posts from artists the patron already supports on Patreon
- Patreon entitlements enforced; tier access updates on OAuth/sync refresh
- Primary reason fans create a Relay account

**Exposure Feed** — algorithmic discovery
- Surfaces content from artists the user does not yet follow
- Sourced exclusively from each artist's **Promo Pool** (see below)
- Mix: majority subscribed content, minority discovery; proportion expands as catalog grows
- Both Free and Premium users see this feed; Premium users can act on it more

### The Promo Pool

Artists select 5–12 pieces from their Library as discovery fuel. Each piece is assigned a role:

| Role | What happens | Who sees it |
|------|-------------|-------------|
| **Free Preview** | Surfaced without paywall to algorithmically targeted warm leads | High-probability subscribers; matched by taste/behavior |
| **Skip-eligible** | Surfaced blurred or watermarked in Exposure Feed; unlocked with a Skip | Any user with available Skips |

Artists are guided (not forced) toward representative but non-exhaustive curation:
> *"Think of the Promo Pool as your storefront window — enough to show your range, not the whole collection."*

**Storefront protection:** Assets with an active storefront listing are excluded from the Skip queue by default. Artists may toggle "Discovery Preview" per item, which caps delivered resolution and embeds a purchase CTA inside the reveal modal.

### Access Windows (Timed, Not One-Time)

Skipped content remains accessible for the full window duration so fans can save, clip, and revisit without friction. One-time-only views were ruled out because they conflict with the platform's collecting and engagement UX.

| Tier | Skip access window | Free Preview window |
|------|--------------------|---------------------|
| **Supporter** | 14 days | 7 days |
| **Curator** | 30 days | 14 days |

**Fade mechanic (Curator):** Days 28–30 surface a visual "closing soon" indicator and notification. After expiry, content returns to blurred state with a "Skip again to re-open" prompt.

**Conversion hook:** Day 29 notification example:
> *"Your access to [Artist]'s work closes tomorrow. Subscribe from $7/mo for permanent access — plus 20% off your first month."*

**Re-Skip economy:** Popular pieces earn recurring tips every 30 days from fans who want continued access, creating repeating revenue for artists without requiring a formal subscription.

### Boosts

Premium users receive monthly Boosts (Supporter: 1, Curator: 3–5). Applying a Boost to an artist's recent post pushes it into the Exposure Feeds of non-subscribed users with similar taste. Boosted posts carry a "Boosted by [Username]" badge — curating is a social signal. Platform funds the Boost economy through Premium subscriptions; no additional charge to artists.

---

## The Skip Economy — Unit Economics

**$0.33 per Skip goes to the artist.**

| Event | Artist gets | Platform net (after Stripe) |
|-------|------------|--------------------------|
| Curator Skip (15/mo, 85% use) | $4.21/user/mo | ~$10.05/user/mo |
| Supporter Skip (5/mo, 85% use) | $1.40/user/mo | ~$3.15/user/mo |
| Reload pack (10 skips, full use) | $3.30/pack | ~$1.25/pack |

**Why $0.33:** The marketing narrative is clean and defensible — *"$0.33 per preview: that is 100× better than YouTube RPM."* The $0.08 difference versus $0.25 buys a meaningfully stronger artist-facing pitch than the marginal platform gain from cutting the rate.

**Skip payouts flow through a ledger + payout threshold model** (Stripe Connect or equivalent). Artists accumulate balance; withdrawals require a minimum threshold ($20–$50) to make disbursement fees negligible. KYC, W-8BEN (international), and fee pass-through handled at payout time.

---

## Storefront Revenue

Artists run digital storefronts for one-off purchases (art packs, print-quality files, tutorials, commission slots).

| Transaction type | Avg transaction | Relay cut | Net to Relay (after processing) |
|-----------------|----------------|-----------|--------------------------------|
| Digital goods | ~$18 | 10% | ~$1.25 |
| Commission slots | ~$150 | 10% | ~$10.35 |

Stripe Connect passes processing costs through to the artist at payout. Relay's 10% is clean platform revenue.

**Storefront GMV at scale (moderate scenario: 2.5% digital purchase rate, 0.15% commission rate):**

| Scale | Monthly storefront net to Relay |
|-------|---------------------------------|
| 1,000 users | ~$46 |
| 10,000 users | ~$469 |
| 100,000 users | ~$4,700 |

At optimistic rates (4% digital, 0.25% commission), 100k users generates ~$7,630/mo from storefronts alone.

**Making storefront setup part of onboarding** directly impacts adoption rate and is worth prioritizing as a product milestone.

---

## Relay Credits (Referral Incentive)

When a user refers someone who converts to an artist's subscriber, they earn **bonus Skips** (not cash):
- Reward: 5 bonus Skips next month (~$1.65 in future skip payouts at cost)
- Avoids FTC affiliate disclosure requirements
- Avoids MLM optics
- Effective CAC: ~$1.65 in deferred artist payouts vs $14.99 subscription value acquired

---

## Financial Projections at Scale

All figures use: **$0.33 tip, 1% artist ratio, 2% Curator Premium, moderate storefront activity, 25% tax on positive EBITDA, $0.07/user infrastructure, fixed opex floor scaling by stage.**

### 1,000 Users
*(10 artists × $18, 20 Curators × $14.99)*

| Line | Amount |
|------|--------|
| Gross revenue | ~$555 |
| Costs (payouts, Stripe, infra, fixed opex $1,000) | ~$1,169 |
| **Net** | **~−$614/mo** |

Loss stage. Fixed opex floor dominates. Normal for early SaaS — plan for 12–18 months.

### 10,000 Users
*(100 artists × $18, 200 Curators × $14.99)*

| Line | Amount |
|------|--------|
| Gross revenue | ~$5,548 |
| Costs (payouts, Stripe, infra, fixed opex $1,500) | ~$3,183 |
| EBITDA | ~$2,365 |
| **Net (after 25% tax)** | **~$1,773/mo (~$21,280/yr)** |

Break-even zone is roughly **7,000–9,000 users.**

### 100,000 Users
*(1,000 artists × $18, 2,000 Curators × $14.99, moderate storefront)*

| Line | Amount |
|------|--------|
| Gross revenue (incl. storefront) | ~$55,480+ |
| Costs (payouts, Stripe, infra, fixed opex $4,000) | ~$20,835 |
| EBITDA | ~$34,645 |
| **Net (after 25% tax)** | **~$25,984/mo (~$312k/yr)** |

With moderate storefront added: **~$28,914/mo (~$347k/yr).**

### Revenue Lines Ranked (100k users)

| Stream | Monthly contribution |
|--------|---------------------|
| Artist SaaS (1,000 × $18) | $18,000 |
| Curator subscriptions (gross) | $29,980 |
| — Skip payouts to artists | −$8,415 |
| — Processing fees | −$1,460 |
| Storefront cut (moderate) | $4,700 |
| Reload packs (net) | ~$1,250 |
| Commissions + digital goods | ~$3,100 |
| Part 2 activation fee | Deferred (near 100% margin when live) |

---

## What Was Ruled Out

| Idea | Why not |
|------|---------|
| % of Patreon subscription revenue | Platform circumvention risk; threatens API access |
| Per-conversion finder's fee (Patreon phase) | Attribution impossible without owning checkout; passive ledger debits feel bad; penalizes top artists |
| Tiered artist pricing by patron count | Feels like a toll on success; flat fee is the differentiated value prop |
| Single $5 premium tier replacing Curator | Needs 3× conversion lift to break even; undermines Boost status signal |
| Cash affiliate payouts to users | FTC disclosure required; MLM optics; accounting complexity |
| One-time-only Skip views | Clashes with collection and saving UX; timed windows are better |
| Skip queue exposure for storefront assets (default) | Cannibalizes digital sales; excluded by default, opt-in with resolution cap and purchase CTA |

**Part 2 activation fee** (flat charge on first new subscriber processed through Relay checkout) is deferred until Relay owns the checkout. Attribution is then clean and the fee is transparent. Do not implement via ledger-debit against Patreon-connected artists.

---

## Market Sizing

| Definition | Creator count | At 2% Relay adoption |
|------------|--------------|----------------------|
| Tight SAM: drawing/painting (incl. adult) | ~25k–35k | **500–700 artists** |
| Loose SAM: + comics, photo, animation | ~45k–70k | **900–1,400 artists** |
| All Patreon (if product broadened) | ~286k | ~5,720 artists |

**SAM-implied ARR ceiling at 2% (tight visual art):** ~$400k–$670k gross ARR from artist SaaS alone, before fan-side revenue.

---

## GTM: The Pilot Flywheel

Relay's go-to-market is **artist-first, not user-first.** Artists are recruited directly; fans follow via their existing audiences.

**Pilot math:**
- Target artists: 1,200–5,000 Patreon patrons (top 5–10% of all Patreon creators)
- Patron → Relay free signup conversion: ~25%
- Audience overlap correction: ~20%
- **Unique users per recruited artist: ~400**

| Artists recruited | Estimated unique users |
|------------------|-----------------------|
| 10 | ~4,000 |
| 25 | **~10,000** (break-even range) |
| 100 | ~40,000 |
| 250 | ~100,000 |

**Each artist recruited is simultaneously:**
1. A paying SaaS customer ($18/mo)
2. A marketing channel (announces Relay to their audience)
3. A supply node (more Promo Pool content = better Exposure Feed = higher fan retention)

If recruiting artists feels expensive or slow, the model is stressed. If it is artist-driven and word-of-mouth, everything else compounds.

---

## Compliance Notes

- **No % of Patreon revenue** in any form — positions Relay as enhancement, not reseller
- **Processor-agnostic positioning** — SFW creators on mainstream rails (Stripe/PayPal); adult-segment creators on approved high-risk partners or BYO merchant; never promise "same-day Stripe" without content-category gates
- **Ledger + threshold payouts** — KYC, W-8BEN, and disbursement fees handled at withdrawal, not per-micro-tip
- **Relay Credits (not cash)** for user referrals — no FTC affiliate disclosure required
- **Skip payout transparency** — do not market "100% of skip value goes to artists" when platform keeps a spread; describe accurately as "artists earn $0.33 per preview"
- **Paid boost disclosure** — boosted placement must be labeled; audit logs required per Workstream N exit gates

---

*Last updated: April 2026. Update this file when pricing, payout rates, tier structure, or financial projections change materially. Cross-reference `monetization-scheme-infrastructure-plan.md` for infrastructure COGS detail and `road map.md` for workstream sequencing.*
