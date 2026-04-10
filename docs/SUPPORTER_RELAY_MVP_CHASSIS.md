# Supporter Relay — MVP UX needs

**Purpose:** Describe **what supporters need** from the minimum fan-facing experience so design and engineering align on scope. This is not a feature list for its own sake—it states **problems to solve** and **outcomes** for people using Relay as patrons.

**Reads with:** [`road map.md`](../road%20map.md) (Part 3), [`docs/pattern-library.md`](pattern-library.md) (fan surface), [`.docs/anthropic/PRODUCT_UX_NORTH_STAR.md`](../.docs/anthropic/PRODUCT_UX_NORTH_STAR.md).

---

## Context

Supporters open Relay to **catch up on creators they care about**, **see what they’re allowed to see**, and **feel that their support matters**. If the profile is empty and the app is only a chronological feed, Relay feels like a **tool**. The MVP needs to meet **identity, trust, expression, and orientation** needs—without shipping every community idea at once.

---

## Core needs (what the MVP must satisfy)

### 1. Orientation — one place to start and catch up

- **Need:** See updates from supported creators in **one feed**, without guessing what’s locked or why.
- **Need:** **Discover** (or equivalent) is **separate** from the home feed, with clear rules about what appears there.
- **Implication:** Home and discovery are **two mental models**, not one mixed stream by default.

### 2. Trust — access matches reality

- **Need:** Understand **what tier / subscription state** applies **per creator** after Patreon changes (upgrade, downgrade, lapse).
- **Need:** **Sync or entitlement status** is visible enough that “why can’t I see this?” doesn’t feel arbitrary.
- **Implication:** Session and entitlement UX are **foundational**; polish elsewhere depends on this.

### 3. Identity — the profile isn’t an empty shell

- **Need:** A **supporter profile** that reflects **who they are as a fan** (not only an avatar), so returning feels worthwhile.
- **Need:** **Taste is visible**: saved work and named collections surface on the profile so it doesn’t read as a “lurker” page.
- **Implication:** **Favorites** and **patron collections** (Relay-native, distinct from artist Library collections per [`road map.md`](../road%20map.md)) are part of MVP depth, not a later luxury.

### 4. Relationships — a clear picture of who they support

- **Need:** See **who they follow**, **at what tier**, **active vs lapsed**, and **how long** they’ve supported where data allows.
- **Need:** A path for **creators they used to support** (re-subscribe / context) without hunting in email.
- **Implication:** Profile (or linked surfaces) carries a **network story**—relationships and entitlements, not vanity metrics.

### 5. Expression — talk attaches to work

- **Need:** **Comment** on content they’re entitled to see—not only a detached forum.
- **Need:** Where the product supports it, **anchors on media** (e.g. pin-style comments) so discussion stays tied to **specific pieces**.
- **Implication:** Threading and moderation depth can grow, but MVP must include **honest states** (e.g. visible moderation, report path as policy allows).

### 6. Forward motion — what to do next

- **Need:** **Commission Hub** (and similar) shows **open interests, bookmarks, or drafts** enough to **resume**, not only a marketing link.
- **Need:** **Notifications and preferences** (digest, discovery opt-in) live in **account / settings**, easy to find—not buried, but **not** the main story on the public profile.

### 7. Private mechanics — resources and allowances

- **Need:** If the product includes **Skips, Boosts, or other allowances** ([`docs/financial-atlas.md`](financial-atlas.md)), supporters need a **private** place to see **what’s left** and **what happened**—not mixed into public profile identity.

---

## Scope boundary (MVP vs later)

| MVP must cover | Defer (same direction, more depth) | Out of MVP scope |
|----------------|-------------------------------------|------------------|
| Feed, profile, favorites, collections | Theme jams (time-bound prompt + shared collection/thread) | A full second “fan gallery” competing with artists |
| Comments + media anchors as designed | Tagging initiatives (e.g. artist-opt-in catalog help) | Open remix / collab without clear consent and moderation |
| Follows + per-creator entitlement clarity | Journals tied to jams or collections first | A general-purpose social graph |
| Commission Hub entry + bookmarks from profile | Marketplace matching for collaborators | — |
| Baseline notification / preference controls | Richer digests and ranking controls | — |

---

## Build order (dependency, not hype)

1. **Session, entitlements, feed** — without this, other needs aren’t trustworthy.
2. **Favorites, then collections** — profile and identity stop feeling empty.
3. **Comments (+ pins where applicable)** — expression attaches to content.
4. **Profile as hub** — network story, former subscriptions, Commission Hub snapshot.
5. **Control / notification baseline** — orientation for return visits.
6. **Theme jams, tagging initiatives, deeper journals, marketplace collaboration** — only after the above; each should extend **curation and conversation**, not replace them.

---

## UX principle for scope decisions

Prioritize work that improves **clarity of access**, **visible taste and relationships**, and **conversation on real work**. Everything else waits unless it clearly serves those needs.

---

## Supporter profile page — critical features & hierarchy

This section **crystallizes what belongs on the supporter’s own profile** (viewing **my** profile), in **priority order**, and ties each block to the **core needs** above. It completes Relay’s intent: patrons are **people with taste, relationships, and voice on work**—not anonymous feed consumers.

### How the profile completes the product story

| Core need | What the profile must make visible |
|-----------|-------------------------------------|
| **Identity (3)** | Taste isn’t abstract—**collections and favorites** appear here. |
| **Trust (2)** | Support isn’t vague—**tier and active/lapsed state per creator** read clearly. |
| **Relationships (4)** | Patronage isn’t invisible—**who you follow** and **former subs** have a home. |
| **Expression (5)** | Participation isn’t elsewhere only—**recent comments / pins** link back to pieces. |
| **Forward motion (6)** | Next steps aren’t orphaned—**Commission Hub** (and similar) show **resume-worthy** state. |
| **Orientation (1)** | The profile **orients** to Feed / Discover / Hub without replacing those routes. |

**Not on the profile hero:** full **notification digests**, **discovery ranking controls**, or **Skips/Boosts** balances—these satisfy needs 6–7 but belong in **settings / dashboard** ([§ Core needs 6–7](#6-forward-motion--what-to-do-next)).

---

### Hierarchy (highest → lowest on the page)

#### 1. Identity header (always first)

- **Avatar, display name, @handle** (and optional one-line bio if the product includes it).
- **Primary actions** scoped to “this is me”: e.g. **Edit profile**, **Share profile** (if public), **View as others see** (if applicable).
- **Completes:** Need **3** (identity)—establishes the person before any lists.

#### 2. Taste — collections & favorites (primary story)

- **Patron collections** (named, scannable: cover + title + count)—the main proof they’re not a lurker.
- **Favorites** as a **recent strip** or “latest saves” row feeding into the full list.
- **Empty state:** Prompt to **save first favorite** or **create first collection** (ties to [build order](#build-order-dependency-not-hype) step 2).
- **Completes:** Need **3** (identity + taste); supports the UX principle (**curation-forward**).

#### 3. Support network — who you back (trust + relationships)

- **Following / supported creators**: each row or card shows **creator**, **tier label**, **active vs lapsed**, **tenure** when available, link to **creator on Relay** (and **Patreon** where policy allows).
- Optional one-line **summary** (“2 active, 1 lapsed”) if it reduces scan cost.
- **Link out:** **Former subscriptions** (dedicated surface or section)—Need **4**.
- **Completes:** Needs **2** (trust) and **4** (relationships)—this is the “scoreboard of support,” not gamification fluff.

#### 4. Voice on work — recent expression

- **Recent comments** (and **media pins** when the feature exists), each **linking to the post/piece** so talk stays tied to **work**.
- Short list or “View all activity” to a full activity view if needed.
- **Completes:** Need **5** (expression)—proves they **participate**, not only consume.

#### 5. What’s next — hubs & resume (compact)

- **Commission Hub snapshot:** open **bookmarks**, **drafts**, or **stated interests**—enough to **continue**, not a full marketplace.
- Secondary **Discover** or **Feed** CTAs if the profile is a hub: “Catch up” / “Explore” with one line of context.
- **Completes:** Need **6** (forward motion) and reinforces **1** (orientation to other routes).

#### 6. Account & control (footer row or kebab — never the hero)

- **Notifications**, **preferences**, **settings**—single row of links; no long forms on profile.
- Copy can nod to **digest** and **discovery opt-in** without hosting those UIs here.
- **Completes:** Need **6** (findability of control room)—without crowding identity and taste.

---

### Visual priority rule of thumb

1. **Biggest surface:** Taste (collections + favorites).  
2. **Second:** Support network (creators + entitlements).  
3. **Third:** Recent expression (comments / pins).  
4. **Fourth:** Next-step hubs (Commission Hub, etc.).  
5. **Persistent small:** Account links.

If space is tight (mobile), **collapse 4–5** behind accordions or tabs before removing **2–3**—never strip **identity header + taste** from the first screen.

---

### One-line summary

The supporter profile is **the proof of the platform**: **who I am as a fan** (taste), **who I support and under what terms** (trust + relationships), **how I show up on the work** (expression), and **what I’m doing next** (hubs)—with **settings** one tap away, not in the spotlight.
