# v0 prompt — Supporter profile (pilot)

**Use:** Paste the block below into **v0** (or v0 API) to generate a **pilot UI** for the supporter’s **own** profile page. Ground truth for structure: [`SUPPORTER_RELAY_MVP_CHASSIS.md`](SUPPORTER_RELAY_MVP_CHASSIS.md) § *Supporter profile page — critical features & hierarchy*.

---

## Prompt (copy from here)

```
Build a single-page “My profile” UI for Relay. Dark, calm, premium: background ~#0A0A0A, borders ~#1A1A1A, body text muted gray, brand accent muted gold ~#C5B358, positive states soft green ~#40916C. Mobile-first responsive; max content width ~960px centered on desktop.

Page title context: this profile proves the patron is a person with taste and relationships—not an empty account.

SECTION ORDER (top to bottom—do not reorder):

1) IDENTITY HEADER
- Avatar (large), display name, @handle, optional one-line bio.
- Actions: Edit profile, Share profile (secondary/outline).

2) TASTE (largest section—hero of the page)
- Heading: “Collections” — horizontal scroll or 2–3 column grid of cards: cover thumbnail, collection title, item count.
- Sub-block: “Recent favorites” — a row of small square thumbnails with labels, “View all” link.
- Empty state variant: friendly copy + primary CTA “Save your first favorite” and secondary “Create a collection”.

3) SUPPORT NETWORK
- Heading: “Creators you support” — summary line e.g. “3 active · 1 lapsed”.
- List/cards: creator avatar, name, tier badge (pill), Active or Lapsed label, optional “since” tenure text, chevron to open.
- Text link: “Former subscriptions” (muted, below list).

4) VOICE ON WORK
- Heading: “Recent on posts” — list of 3–4 items: short quote of comment, line of context (post/creator title), timestamp, “Open” link. Optional tiny pin icon if pinned-on-media.

5) WHAT’S NEXT (compact card, not dominant)
- Heading: “Commission Hub” — 2–3 lines: bookmarked brief, draft inquiry, or “No open items” + CTA “Browse marketplace”.
- One row of small buttons/links: “Go to feed”, “Discover”.

6) FOOTER STRIP (small, not hero)
- Inline text links: Notifications · Preferences · Settings — no forms.

EXCLUDE from this page: Skips/Boosts balances, full notification digest UI, discovery algorithm controls, Patreon OAuth flows.

Use clear typography hierarchy, generous spacing, subtle cards, accessible contrast. Placeholder names and copy in English.
```

---

## Notes for humans

- Tweak **colors** if your v0 design system token names differ.
- Add **“public vs private profile”** only if product confirms—it’s omitted here for pilot scope.
- After v0 output, map components into **`web/`** patron routes per your integration plan.
