# Relay onboarding — v0 asset package

> **Purpose:** hand this single document to v0 so it can beautify the
> recomposed `/onboarding` flow without changing the page's structure or
> any functional logic. The wiring is already in place; v0 only restyles.

---

## 1. v0 prompt (paste this verbatim)

> Beautify the attached Relay onboarding flow without touching its routing,
> state, props, imports, or any auth / Patreon / extension logic.
>
> Goals:
>
> 1. **Hero brand moment.** The path picker (Step 0) should feel like
>    landing in a small, confident gallery — generous whitespace, a single
>    crisp wordmark, two equally-weighted choice cards (Creator / Supporter),
>    and a quiet "Already signed up? Log in" line.
> 2. **Clear forecasting.** Once a path is chosen, every step should make
>    the next two visible (use the `RoadmapPreview` row + `ProgressStepper`).
>    A user should always know where they are and how close to done they are.
> 3. **One action per step.** Strip secondary CTAs that compete with the
>    primary "do this next" button. Skip links and footnote help live in
>    smaller, muted type.
> 4. **Calm, premium aesthetic.** Dark canvas, gold wordmark, deep-green
>    accent, generous radii (xl/2xl), soft glow on hover, no harsh shadows.
>
> Constraints — DO NOT:
>
> - Reorder or rename the components in `step-panels.tsx` /
>   `onboarding-wizard.tsx`.
> - Touch any function bodies inside `StudioSupabaseSignInPanel`,
>   `SupporterSignInPanel`, `InstallExtensionPrompt`, or
>   `StepConnectPatreonCreator/Supporter` (their network calls are wired).
> - Change props, state shape, URL handling, or `router.replace` calls.
> - Introduce new dependencies; stay on Tailwind + the `lucide-react` icons
>   already imported.
> - Use any color outside the `--relay-*` token set defined in
>   `web/app/globals.css` under `.onboarding-shell`.
>
> Allowed scope:
>
> - Class names, layout, spacing, typography, motion, hover/focus states.
> - Replace presentational SVG marks/decorations with cleaner versions.
> - Add `aria-*` polish and reduced-motion guards.
> - Reposition headings/eyebrows within an existing component.

---

## 2. Intended user journey (single source of truth)

```
/onboarding
  └─ Step 0  Path Picker .................. "Are you a Creator or a Supporter?"
       │     (Login link in header + below cards)
       ▼
  ┌─ CREATOR PATH ────────────────────────────┐   ┌─ SUPPORTER PATH ──────────────────┐
  │ Step 1  Sign Up                            │   │ Step 1  Sign Up                    │
  │   Email · Password · Verify Password       │   │   Email · Password · Verify        │
  │   → "Make My Gallery"                      │   │   → "Create My Account"            │
  │   (Supabase verify-email link sent)        │   │   (Supabase verify-email link)     │
  │                                            │   │                                    │
  │ Step 2  Connect Patreon                    │   │ Step 2  Connect Patreon            │
  │   OAuth → /patreon/callback → back here    │   │   OAuth → /patreon/patron/callback │
  │                                            │   │   → /patron/feed (auto)            │
  │                                            │   │                                    │
  │ Step 3  Claim Gallery URL                  │   │ Step 3  Open Feed                  │
  │   relay.so/<handle> (suggested from        │   │   "Your feed is ready"             │
  │   Patreon, editable)                       │   │   → /patron/feed                   │
  │   + Optional: Install Relay Extension      │   │                                    │
  │     (manual cookie fallback link)          │   │                                    │
  │   → "Take me to my gallery"                │   │                                    │
  └────────────────────────────────────────────┘   └────────────────────────────────────┘
```

Every step must:

- Show a small "Step N of 3" eyebrow.
- Show a one-line subtitle that previews the value.
- Show exactly **one** primary CTA in Relay green.
- Keep the path-roadmap row visible so future steps are forecasted.

---

## 3. Files in scope

These are the only files v0 should touch:

```
web/app/onboarding/page.tsx
web/app/components/onboarding/onboarding-wizard.tsx
web/app/components/onboarding/step-panels.tsx
web/app/components/onboarding/progress-stepper.tsx
```

Out of scope (used as-is, do not edit):

```
web/app/components/studio/StudioSupabaseSignInPanel.tsx
web/app/components/auth/SupporterSignInPanel.tsx
web/app/components/InstallExtensionPrompt.tsx
web/lib/relay-api.ts
web/lib/patreon-patron-scopes.ts
web/lib/patron-patron-redirect-uri.ts
web/lib/patron-oauth-state.ts
web/lib/resolve-patreon-oauth-client-id.ts
```

---

## 4. Design tokens (use these only)

Defined in `web/app/globals.css` under `.onboarding-shell`. The
`/onboarding` page is rendered inside that shell, so all tokens are in
scope automatically.

| Token                       | Value     | Use                                    |
| --------------------------- | --------- | -------------------------------------- |
| `--relay-bg`                | `#0a0a0a` | Page canvas                            |
| `--relay-surface-1`         | `#111111` | Inset panels, inputs                   |
| `--relay-surface-2`         | `#1a1a1a` | Card / step container                  |
| `--relay-border`            | `#2a2a2a` | Hairline borders                       |
| `--relay-green-950`         | `#0d1f17` | Subtle accent backgrounds              |
| `--relay-green-800`         | `#1b4332` | Accent borders                         |
| `--relay-green-600`         | `#2d6a4f` | Primary CTA bg                         |
| `--relay-green-400`         | `#40916c` | Primary CTA hover, links               |
| `--relay-gold-500`          | `#c5b358` | Wordmark, premium accents              |
| `--relay-gold-400`          | `#d4af37` | Wordmark hover accent                  |
| `--relay-fg`                | `#f9fafb` | Primary text                           |
| `--relay-fg-muted`          | `#9ca3af` | Secondary text                         |

**Typography:** Use Tailwind defaults (system font already loaded by
`web/app/layout.tsx`). Headings range from `text-2xl` (step) to
`text-3xl/4xl` (path picker). Body copy `text-sm leading-relaxed`.

**Radius:** prefer `rounded-xl` for inputs/buttons, `rounded-2xl` for
cards / step panels. Avoid `rounded-md` in this flow — too sharp.

**Motion:** Reuse `onboarding-panel-animate` (already defined in
`globals.css`). Honor `prefers-reduced-motion`.

---

## 5. Component contract (do not change)

### `OnboardingWizard`

Props:

```ts
type Props = { initialPatronClientId: string };
```

Holds `path: "creator" | "supporter" | null` and
`currentStep: 1 | 2 | 3` in `useState`. Mirrors both into the URL via
`?path=…&step=…` using `router.replace`. Reads them back on mount.
Renders:

- `RelayWordmark` + `Login` link in the header.
- `PathPicker` when `path === null`.
- Otherwise `ProgressStepper` + `RoadmapPreview` + the active step panel
  + a back/path-switch button + a path-label.

### `step-panels.tsx` exports

```ts
export function RelayWordmark(props: { size?: "sm" | "md" | "lg" }): JSX.Element;
export function PathPicker(props: { onChoose: (path: OnboardingPath) => void }): JSX.Element;
export function RoadmapPreview(props: { path: OnboardingPath; currentStep: number }): JSX.Element;
export function StepSignUp(props: { path: OnboardingPath; onSignedIn?: () => void }): JSX.Element;
export function StepConnectPatreonCreator(props: { onSkip?: () => void }): JSX.Element;
export function StepConnectPatreonSupporter(props: { initialClientId: string }): JSX.Element;
export function StepClaimHandleAndGo(props: { onFinish?: () => void }): JSX.Element;
export function StepSupporterReady(): JSX.Element;
```

These signatures and the components they render (the embedded auth
panels, the Patreon redirect button, the install-extension prompt)
**must stay**. v0 may rewrite the surrounding markup.

### `ProgressStepper`

```ts
type Props = { steps: OnboardingStep[]; currentStep: number };
type OnboardingStep = { id: number; label: string; description: string };
```

Three steps for both paths; labels differ (`"Gallery"` vs `"Feed"` for
step 3).

---

## 6. Copy deck (canonical strings)

| Surface                      | Copy                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Path picker headline         | **Welcome to Relay**                                                                                    |
| Path picker subhead          | Are you here to share your work, or to support the artists you love?                                    |
| Creator card title           | I'm a Creator                                                                                           |
| Creator card body            | Build a beautiful gallery for your art and reach your patrons.                                          |
| Supporter card title         | I'm a Supporter                                                                                         |
| Supporter card body          | Find and follow the creators who make work you love.                                                    |
| Step 1 (creator) headline    | **Make your gallery**                                                                                   |
| Step 1 (creator) subhead     | Spin up your Relay creator account in seconds. We'll send a quick email to verify it's really you.      |
| Step 1 (supporter) headline  | **Create your account**                                                                                 |
| Step 1 (supporter) subhead   | Get a verified Relay supporter account so you can follow your favorite creators.                        |
| Step 2 headline (both)       | **Connect your Patreon**                                                                                |
| Step 2 subhead (creator)     | Authorize Relay to import your posts so we can stream your art straight into your gallery.              |
| Step 2 subhead (supporter)   | Sign in with Patreon so we can show you the creators and tiers you support.                             |
| Step 2 footnote              | We'll bounce you to Patreon to authorize, then bring you right back to finish setting up.               |
| Step 2 skip (creator only)   | Skip for now — I'll connect later                                                                       |
| Step 3 (creator) headline    | **Claim your gallery URL**                                                                              |
| Step 3 (creator) subhead     | This is where patrons will discover your work. We pulled a suggestion from your Patreon — feel free to edit. |
| Step 3 (creator) field label | Your gallery URL                                                                                        |
| Step 3 (creator) prefix      | `relay.so/`                                                                                             |
| Step 3 (creator) extension   | Recommended — install the Relay browser extension                                                       |
| Step 3 (creator) manual      | Prefer to do it manually? Walk through the cookie steps — about 60 seconds.                             |
| Step 3 (creator) primary CTA | Take me to my gallery                                                                                   |
| Step 3 (supporter) headline  | **Your feed is ready**                                                                                  |
| Step 3 (supporter) subhead   | Everything you support — in one beautiful, scrollable gallery. Open it up and start exploring.          |
| Step 3 (supporter) CTA       | Open my feed                                                                                            |
| Header login link            | Log in                                                                                                  |
| Footer help                  | Need help? Contact support                                                                              |

---

## 7. Open follow-ups (NOT for v0 — flag in PR)

These are the small wiring tasks deliberately left out of this front-end
pass so v0 can focus on visuals:

1. **Confirm-password field.** UI strings reference "Email, Password,
   Verify Password" but `StudioSupabaseSignInPanel` /
   `SupporterSignInPanel` only render two fields today. Adding a
   client-side match check is a small follow-up — see
   `docs/qa/SUPPORTER_CREATOR_SIGNUP_FLOW_INCREMENTAL_PLAN.md` § Phase 4.
2. **Creator callback → return to onboarding step 3.** Today
   `/patreon/callback` redirects to `/`. To make Step 3 reachable
   in-flow, the callback should redirect to
   `/onboarding?path=creator&step=3` when it detects an in-progress
   onboarding session.
3. **Persist claimed handle.** `StepClaimHandleAndGo` is presentational
   only — wire its submit to the handle-claim API once it exists.

---

## 8. Quick verification checklist

After v0's pass, the following should still hold:

- [ ] `/onboarding` renders the path picker on first visit.
- [ ] Choosing Creator pushes `?path=creator&step=1` and shows
      `StudioSupabaseSignInPanel`.
- [ ] Choosing Supporter pushes `?path=supporter&step=1` and shows
      `SupporterSignInPanel`.
- [ ] `?path=creator&step=2` deep-link lands on the creator Patreon step.
- [ ] `?path=supporter&step=2` deep-link lands on the supporter Patreon
      step (requires `NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID` or
      `?campaign=…`).
- [ ] Header `Log in` link routes to `/login`.
- [ ] No new dependencies added to `web/package.json`.
- [ ] No edits inside the auth / Patreon / extension components listed
      in §3 "Out of scope".
