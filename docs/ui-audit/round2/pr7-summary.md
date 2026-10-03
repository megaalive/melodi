# PR7 CSS audit and cleanup

## Results

- The UI audit passed all 60 viewport, theme, and UI-state cells. It found no failures, page errors, overlaps, canvas-label overlaps, unreachable clipping, or horizontal overflow. Nested `<details>` peaked at 0; the Piano Roll bottom gap peaked at 1 px.
- Comparing PR6 and PR7 screenshots found 59 pixel-identical images. The desktop light Edit image differed at one pixel, with a maximum channel delta of 1.
- Representative Edit-default viewport measurements stayed unchanged:

| Viewport | Chrome | Visible controls | `<details>` (open / nested) | Overlaps | Clipped / unreachable |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1440×900 desktop | 171 px / 19.0% | 25 | 13 (0 / 0) | 0 | 2 / 0 |
| 390×844 portrait | 193 px / 22.9% | 19 | 13 (0 / 0) | 0 | 2 / 0 |
| 844×390 landscape | 97 px / 24.9% | 10 | 13 (0 / 0) | 0 | 0 / 0 |

Across the full matrix, the maximum chrome was 97 px / 24.9% in the 844×390 “More open” state. The responsive stylesheet still contains 10 `@media` blocks.

## CSS coverage and byte budget

The Chromium rule-usage audit covered 60 matrix cells and six dynamic states: note selection, the phone panel sheet, drum selection, populated lyrics, the dark Command Palette, and reduced motion. It measured 222,216 active browser CSS bytes, of which 135,818 bytes (61.12%) were used; 1,228 of 1,819 rules were used. The report lists all 591 uncovered rules with selectors and source offsets. A simple static class-token scan found zero additional candidates, but this scan is not exhaustive: it cannot prove compound-selector reachability, and the CDP scenarios do not exercise every hover, focus, keyboard, or rare viewport state.

The imported stylesheet tree is 221,709 bytes, down 2,101 bytes from the PR6 baseline of 223,810 bytes. The 165,000-byte target is not supported by current evidence: the remaining uncovered rules are not proven dead, and deleting them based on sampled usage alone could remove valid state, pseudo-class, or viewport styling. The budget test therefore keeps a 223,000-byte guard, about 1,291 bytes above the current imported CSS, while retaining 165,000 bytes as the cleanup target.

The cleanup removed empty CSS rules and selectors made obsolete by current markup or runtime behavior. It also added the Chromium coverage audit and a byte-budget test. CSS cache tokens are consistently `20261003.73` across HTML, JS imports, and CSS imports.

Detailed evidence: [CSS coverage report](pr7-css-coverage/report.md), [UI matrix](pr7-after/matrix.md), [UI results](pr7-after/results.json).
