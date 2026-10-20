## verdict

1. Resolved — invalid Save entry. `fix-trigger.png` shows the open filter tray, visible “Enter the text to match.” recovery message and focused text field. The scored source now sends trigger errors to the visible source section and focuses source/text/link controls; regression tests cover all three invalid cases.
2. Resolved — Save/Confirm completion focus. `fix-save.png` and `fix-confirm.png` show the visible “Recipe saved” and “Plan confirmed” results with their former trays closed. The scored source gives `saved-result` tabindex=-1 and focuses it through the shared result helper; regression tests assert activeElement for both paths. Pointer modality explains the absent focus-visible ring in these captures.

No regressions found in the six reread required captures. Scoring scope: these two material fixes only, with the three named supplemental captures, changed interaction source and regression tests; no browser or detector rerun. The prior full review's exact scope and findings are preserved in `finish-review-initial.md`. Ship covers the scored fixes, not the whole surface.

## remaining

Clear.

disposition: ship
