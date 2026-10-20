## verdict

1. Resolved — Saved/Draft synchronization. All six new required captures show Draft for the unsaved example. The sampled hydration and name/Default/Always-on handlers synchronize the badge with saved state; the added regression test exercises all four transitions. The parent reports 12/12 behavioral tests passing; I inspected the test without rerunning it.
2. Resolved in source — keyboard access and fixed-bar clearance. The first body control is a focus-revealed skip link targeting focusable `main#editor-main`. Document scroll padding reserves 130px plus the bottom safe-area inset; body and fixed action bar use matching safe-area-aware bottom padding with a mobile override. The six valid recaptures retain the prior composition and complete content edges. Physical notched-device behavior remains source-reviewed only, as disclosed in the scoped guidelines report.
3. Resolved in source — browser/touch treatment. Theme-color matches the navy page field and button/summary touch-action uses manipulation. Neither change introduces a new visual treatment or alters recipe authority.

No regressions found within this additional batch. Exact scope: the Saved/Draft state fix, skip link and focusable main, scroll/safe-area padding, theme metadata and touch treatment in the standalone recipe prototype; the corresponding regression test and `code-and-guideline-review.md`; the same six desktop/mobile/885px captures reread after this batch. No browser, detector rerun, production integration assessment or new design hunt was performed. The initial full review remains in `finish-review-initial.md`, and the earlier validation/completion-focus verdict remains in `finish-review-fix-verdict.md`. This ship verdict covers the additional scoped fixes; it preserves the earlier scored verdict.

## remaining

Clear within the reviewed prototype scope.

disposition: ship
