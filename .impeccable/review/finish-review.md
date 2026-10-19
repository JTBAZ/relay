disposition: recapture

## recapture

- `.impeccable/review/mobile-full.png` is invalid: its right crop cuts through the source card, release cards, Description controls, and Save recipe button. The matching `mobile.png` shows complete right edges and a different content width. Recapture the complete 390px mobile document with both content edges visible, or supply valid overlapping 390px viewport excerpts covering the document. Do not crop the full render to a narrower width inferred from the separate viewport render.
- `.impeccable/review/user-885-full.png` is invalid: its right crop removes the right page gutter and cuts through the fixed Save recipe button. The matching `user-885.png` retains that gutter and complete button. Recapture the complete 885px document with both content edges visible, or supply valid overlapping 885px viewport excerpts covering the document.

Reviewed scope: evidence validity of the six required captures only. `desktop.png`, `mobile.png`, `user-885.png`, and `desktop-full.png` pass this evidence check. No fidelity, behavior, accessibility, ceiling, or ship verdict is issued; the complete valid capture packet requires a fresh full review.
