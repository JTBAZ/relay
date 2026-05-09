# Pilot browser matrix (UX)

**Purpose:** P9-test-006 — which browsers we **try** for the pilot vs what **must** work before launch.

| Platform | Version guidance | Pilot expectation |
|----------|------------------|-------------------|
| **Chrome (desktop)** | Current stable | **Blocking** — primary dev + patron flows must work. |
| **Safari (iOS)** | Current iOS Safari | **Best effort** — file P0 bugs that block onboarding, login, or paywalled content; smaller visual glitches can ship with documented debt. |
| **Chrome (Android)** | Current stable | **Best effort** — same as Safari iOS; treat critical auth/session breakage as blocking.

## Sign-off

- **QA / product** check the boxes when spot-tested; note build or date.
- **Blocking** bug = cannot complete creator onboarding, patron login, or view entitled content without workaround.

Human sign-off: _________________  Date: _______
