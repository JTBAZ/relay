# Agent prompt: Discovery promo, Premium viewers, and boost tokens

**Use this document** when you are asked to update `road map.md`, `monetization-scheme-infrastructure-plan.md`, `analytics-action-center-spec.md`, workstream traceability matrices, or implementation plans so that engineering milestones align with the product strategy below.

Copy everything from **“Instructions for the coding agent”** through **“Milestone alignment”** into a task prompt, or reference this file path in the agent context.

---

## Instructions for the coding agent

You are editing project documentation and/or planning implementation for **Relay**. Apply the following as **authoritative product constraints** unless the user explicitly overrides them in the current task.

1. **Preserve consistency** with existing roadmap structure: Part 3 (Patron Network), Workstream M (Discovery and creator-opt-in promos), Workstream N (audience monetization), Workstream O (patron engagement). When you add milestones, **tie them to these workstreams** or add clearly scoped sub-bullets.
2. **Do not contradict** the executive summary principle that audience-side monetization should be **non-extractive toward creator subscription revenue** where the roadmap already states it; frame Premium as **infrastructure + discovery + patronage-of-visibility**, not as redirecting the $5 to artists unless product explicitly changes.
3. **Call out new engineering surfaces** explicitly: event taxonomy, entitlement rules for “daily promo” views, ranking weights, premium flags, anti-abuse, and reporting APIs for the 30-day token outcome.
4. **Mark gaps** where financial plumbing is not yet specified (attribution, commission on cross-sell) as **roadmap placeholders** with suggested doc owners or follow-up workstreams—do not invent legal or payout percentages without user approval.
5. **Prefer testable exit gates** (opt-in enforcement, caps, audit logs, premium vs free behavior) over vague bullets.

---

## Strategic north star

- **Scale economics**: Expect a **high viewer-to-artist ratio** (order of magnitude ~1000:1). Platform revenue from **Premium viewers** must **scale with traffic and media delivery cost**, not only with creator count.
- **Creator value**: Promotional paywalled content is **opt-in marketing**: artists choose pieces and packaging (e.g. promo asset + **subscription discount**). Relay surfaces it in Browse/feed algorithms.
- **User value**: Free accounts get a **small, scarce** taste of high-quality paywalled work; Premium accounts get **more or higher-tier promo exposure** (volume/quality of promos—not “pay artists directly” unless product changes).
- **Fairness**: Discovery and promos stay **subordinate to entitlements and creator opt-in**; ranking and inserts remain **auditable** where the roadmap already requires it.

---

## Daily promotional slot (“paywalled promo”)

| Aspect | Specification |
|--------|----------------|
| **Frequency** | **One** promotional piece **per user per day** in the feed (DAU driver; bounded volume). |
| **Content** | Normally **paywalled** work, **artist-opt-in** only. Artist may **dress up** the slot (e.g. hero image + **x% subscription discount** or equivalent offer). |
| **Cannibalization** | Low risk by design: **one** peek/day across a **wide pool**; artists control promo terms. Roadmap should mention optional **time-boxed** access (e.g. 24h) if product later requires stricter limits—do not assume full permanent unlock unless specified. |
| **Presentation** | Artist option: **additional censoring** and/or **watermark** on the promo delivery path (separate from full subscriber asset where applicable). |
| **Eligibility pool** | **Diversity-first** selection within a **taste-bounded** pool: e.g. subscriptions, follows, and analytics-informed “artists you’ll like.” **Avoid repeats** (per-user per-artist **cooldown**, e.g. N days) to reduce annoyance and repeated free exposure to the same paywalled catalog. |
| **Pool edge cases** | If the eligible pool is **too small**, document fallback: adjacent taste clusters or slight relaxation of repeat rules—implementation must not dead-end the daily slot. |
| **Fairness to small creators** | Consider reserving a **slice** of promo inventory for **discovery / emerging** matches, not only established taste—document as open design parameter. |

**Engineering implications to reflect in milestones**

- Creator settings: opt-in, promo asset, discount metadata, censor/watermark flags, revocation.
- Feed/Browse builder: daily cap **per patron**, diversity + cooldown constraints, premium vs free **volume or tier** of promo.
- Delivery pipeline: variant media (watermarked/censored) vs entitled asset.
- Analytics: impressions, clicks, **attributed** subscription starts or discount redemptions (event schema TBD in analytics docs).

---

## Premium viewer product (~$5 / month, platform revenue)

| Aspect | Specification |
|--------|----------------|
| **Revenue recipient** | Fee is to the **platform** (covers traffic, media delivery, operations). **Not** a direct tip to the artist unless product explicitly adds that later. |
| **Benefit 1** | **More** and/or **higher-value** paywalled promo pieces in algorithm vs free tier (exact parameters TBD; must be **disclosed** in UX and policy docs). |
| **Benefit 2** | **One boost token per billing period** (e.g. monthly) assignable to **one** artist the subscriber wants to support—effect is **algorithmic exposure**, not cash transfer. |
| **Messaging** | Premium sells **infrastructure + better discovery + meaningful visibility support**; avoid implying the $5 is paid to the creator unless payouts exist. |

---

## Boost token (monthly)

| Aspect | Specification |
|--------|----------------|
| **Cadence** | **Once per period** per Premium user (e.g. one token per month) to limit farming. |
| **Anti-abuse** | Monthly limit is a **deterrent**, not sufficient alone: still plan for **verified payment**, account quality signals, and **caps** on boost impact. |
| **Effect** | **Small**, **bounded** bump in ranking/insertion probability—not a permanent “winner takes all.” Prefer **diminishing returns** / **decay** over time (e.g. asymptotic or exponentially fading weight). |
| **Transparency** | **Giver-facing report** after ~**30 days**: e.g. incremental **views** or **attributed impressions** during the boost window—**honest definitions** required (“views” meaning, window, what’s included). Avoid unverifiable counterfactual claims unless modeling exists. |
| **Creator-facing** | Optional summary of boost-received reach (policy TBD). |

**Engineering implications**

- Store: token grants, consumption, target artist, time window, decay parameters (config/feature flags).
- Ranking: separate **boost signal** with caps; audit log of “why this appeared.”
- Reporting job: aggregate impressions/views attributed to boost; email or in-app report.

---

## Attribution and future financials

- **Required**: End-to-end **attribution** for promo → click → checkout → **new or upgraded subscription** (and discount codes if used). Event contracts belong in analytics / builder docs.
- **Optional phase 2**: **Platform commission** on **successful cross-sell** attributed to Relay promo flows—**not** required for initial Premium launch; document as **future workstream** with open questions: trials, refunds, multi-touch attribution, payout timing.
- If editing `monetization-scheme-infrastructure-plan.md`, add a short **“Audience Premium and promo attribution”** subsection that points to this strategy without inventing fee tables.

---

## Compliance and UX guardrails (documentation must mention)

- Disclose **promo** and **boosted** placement where applicable (align with existing Part 3 compliance bullets in `road map.md`).
- Avoid **misleading** 30-day reports; provide **methodology** copy or tooltips.
- Naming: prefer **“daily promo” / “curated preview”** over **“lootbox”** in user-facing copy unless legal approves gamification framing.
- Watermark/censor **consistency**: explain that appearance varies by **creator choice**.

---

## Milestone alignment (for roadmap edits)

When updating **Milestone Build Order** or Part 3 workstreams, preserve this **sequence**:

1. **Creator opt-in promo catalog** + delivery variants (watermark/censor) + daily **one-per-user** slot + diversity/cooldown rules + instrumentation.
2. **Premium subscription** (platform billing) + **free vs premium** promo volume/tier differences.
3. **Boost token** issuance, consumption, decaying rank effect, caps, abuse controls.
4. **30-day giver report** (and optional creator summary).
5. **Attribution** pipeline for promo-driven conversions; later optional **commission** on attributed sales.

**Regression gates** (documentation should list as exit criteria where relevant):

- Only opt-in content in promo surfaces; revocation immediate.
- Daily cap and cooldown invariants tested.
- Premium benefits cannot bypass paywall for non-promo entitled content.
- Boost effect **bounded** and **logged**; no hidden pay-to-win against creator economics without disclosed policy.

---

## File references (repo)

- [road map.md](../road%20map.md) — Part 3, Workstreams M, N, O; Milestone Build Order.
- [monetization-scheme-infrastructure-plan.md](../monetization-scheme-infrastructure-plan.md) — COGS, packaging, compliance cross-links.
- [analytics-action-center-spec.md](../analytics-action-center-spec.md) — events, recommendations, reporting.

---

## Short copy-paste block (minimal prompt)

```
Follow docs/monetization-discovery-premium-agent-prompt.md. Update the specified roadmap/plan files so milestones include: (1) daily one-per-user artist-opt-in paywalled promo with diversity+cooldown within taste pool, optional watermark/censor and promo deals; (2) Premium ~$5 to platform with more/better promos + one monthly boost token (visibility only, decaying bounded effect); (3) 30-day honest impact report for token givers; (4) attribution events for promo→conversion; (5) optional future commission on cross-sell as phase 2. Align with Workstreams M/N/O. Add testable exit gates. Do not imply artist revenue share from Premium unless explicitly added.
```
