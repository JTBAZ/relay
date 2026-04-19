# EXT-6V — Store review gate

## Context

You are running the **Phase 6 verification gate** for [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §6.D. This row **waits** on store review and handles **reviewer questions** using **`EXT-6B`** justifications — **no speculative code fixes** unless a reviewer identifies a real policy violation (then reopen the relevant build row). Mostly **human** coordination.

## Preconditions

- [ ] `EXT-6H-build-sign-submit-prompt.md` completed — all three stores show **in review** or beyond (not failed at upload).

## Tier 0 invariants (always apply)

All eight from [`00-README.md`](00-README.md) lines 87–94 plus extension add-on. If a reviewer demands a permission change, any manifest change must stay compliant with P-5, P-12, and §2.B minimal permissions.

## Goal

All three submissions reach **in review** without immediate rejection (§6.D); reviewer threads answered from `extension/store/**/justifications.md`; eventual **approval** or documented **rejection** with follow-up row.

## Reference reading

1. [`docs/EXTENSION_BUILD_PLAN.md`](../../EXTENSION_BUILD_PLAN.md) §6.D — Phase 6 verification gate.
2. [`extension/store/chrome/justifications.md`](../../../extension/store/chrome/justifications.md)
3. [`extension/store/firefox/justifications.md`](../../../extension/store/firefox/justifications.md)
4. **Handoff** from `EXT-6H` — dashboard links.

## Verification checklist

### A. Submission health

- [ ] **A1.** Chrome — status is **in review** or **published** (not “rejected” at intake).
- [ ] **A2.** AMO — same.
- [ ] **A3.** Edge — same.

### B. Reviewer Q&A

- [ ] **B1.** Any permission questions answered using **pre-written** justifications (extend if needed — update `justifications.md` in a **small** docs commit if team allows).
- [ ] **B2.** Privacy policy URL **`https://relayapp.me/legal/extension-privacy`** matches live site.

### C. Timeline expectations

- [ ] **C1.** Operator notes expected windows per plan: Chrome **1–3** business days typical; AMO **1–7** days; **`cookies`** may push Chrome to **1–2** weeks.

### D. Failure / rejection handling

- [ ] **D1.** If **rejected:** **Do not patch in this row** — Delta Out lists reviewer reason; open **`EXT-2B`** (manifest), **`EXT-6A`** (privacy), **`EXT-6B`** (copy), or new ad-hoc row per root cause.
- [ ] **D2.** After rejection fix merges, operator **resubmits** — this gate **re-runs** from A1.

### E. Documentation

- [ ] **E1.** Update [`00-README.md`](00-README.md) — **Phase 6 store gate: approved ✅ YYYY-MM-DD** or **in review as of …** (honest status).

## Failure handling

- **Intake rejection** → reopen **`EXT-6H`** packaging/listing prep.
- **Review rejection** → follow **D1** mapping; no code in this row.

## Acceptance criteria

- [ ] A–C satisfied for current submission wave; D/E updated honestly.
- [ ] No unrelated code churn in this row.

## Out of scope

- Production CORS / `NEXT_PUBLIC_RELAY_EXTENSION_IDS` (**`EXT-7H`**).
- Post-publish CTA updates (**`EXT-7B`**).

## Handoff

Delta Out:

- Store statuses (Chrome / AMO / Edge).
- Published **extension IDs** once live — **required input** for **`EXT-7H`**.
- Links to live store pages for **`EXT-7B`**.

When **published** on Chrome + Firefox (and Edge as applicable), next claimable: **`EXT-7H-pin-extension-ids-prompt.md`**.
