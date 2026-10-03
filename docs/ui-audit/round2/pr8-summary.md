# PR8: Deployment, accessibility and polish

## Deployment

GitHub Pages is configured to publish the repository root from `main` using GitHub's built-in branch deployment. There is no custom Pages workflow; `.github/workflows` contains CI only. The site URL is <https://megaalive.github.io/melodi/>. `index.html`, CSS imports, and JavaScript module URLs use build/cache token `20261003.74`; there is no service worker registration.

Post-merge Pages run and live build verification will be recorded here after GitHub publishes `main`.

## Viewport comparison

Counts below are for the default Edit workspace. “Primary” means directly visible workspace tabs, core transport/history controls, Guitar and Select/Draw in Edit, plus direct Mixer/Chord/Generate controls on desktop or the Panel entry on compact screens. Tempo and Loop remain one step away through Lanjutan on compact screens, with their current values/status in the dock.

| Viewport | Chrome, PR7 → PR8 | All visible controls, PR7 → PR8 | Primary controls, PR7 → PR8 | `<details>` | Overlaps | Imported CSS bytes, PR7 → PR8 | `@media` blocks, PR7 → PR8 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1440×900 desktop | 171 px (19.0%) → 171 px (19.0%) | 25 → 25 | 15 → 15 | 13 → 13 | 0 → 0 | 221,709 → 224,186 | 10 → 10 |
| 390×844 portrait | 193 px (22.9%) → 179 px (21.2%) | 19 → 19 | 11 → 11 | 13 → 13 | 0 → 0 | 221,709 → 224,186 | 10 → 10 |
| 844×390 landscape | 97 px (24.9%) → 97 px (24.9%) | 16 → 16 | 11 → 11 | 13 → 13 | 0 → 0 | 221,709 → 224,186 | 10 → 10 |

The PR7 landscape screenshot already shows all 16 controls, but its matrix reported 10 because the audit clipped the fixed toolbar against a `display: contents` ancestor with `backdrop-filter`. PR8 corrects that audit calculation; its landscape default cell now records 16. Primary counts are derived from the same explicit control set in both versions. The per-cell matrix is [pr8-after/matrix.md](pr8-after/matrix.md).

The complete PR8 matrix covers 60 viewport/theme/state cells and reports zero failures, page errors, control overlaps, Piano Roll label overlaps, horizontal page overflow, or unreachable clipped controls. The most chrome in any cell is 219.2 px / 24.4% on desktop, 192 px / 22.7% in portrait, and 97 px / 24.9% in landscape. `<details>` count is 13 normally and 19 with Generate open; none are nested.

## CSS coverage and budget

The CSS audit covers all 60 matrix cells and six dynamic states (note selection, phone panel sheet, drum selection, lyrics content, Command Palette, and reduced motion). Chromium measured 224,693 active CSS bytes, 138,618 bytes used (61.69%), and 1,248 of 1,836 rules used. The 588 uncovered rules produced zero safe static-removal candidates. The imported stylesheet tree is 224,186 bytes, under the 225,000-byte test guard by 814 bytes. The 165,000-byte cleanup target remains unmet because sampled non-use does not prove those selectors are dead; removing them risks valid focus, state, viewport, or runtime styling. There are 10 `@media` blocks across the active stylesheets (9 in `responsive.css`, 1 in `studio.css`), within the requested limit.

Details: [CSS coverage report](pr8-css-coverage/report.md), [CSS audit JSON](pr8-css-coverage/report.json), [UI results](pr8-after/results.json).

## Accessibility and interaction

- Mobile interactive targets meet the 44 px minimum. Scroll-contained partial clipping remains reachable by scrolling; the matrix reports zero unreachable clips. Piano Roll, chord, and drum editing grids remain spatial controls with keyboard alternatives.
- Contrast checks: body text is 6.38:1 in light and 5.01:1 in dark; selected-note text is 5.42:1 and 5.67:1; focus outlines are 5.22:1 and 6.21:1, respectively.
- Visible UI labels and accessible names use the Indonesian/English message catalog. Escape closes popovers and sheets, focus returns to the invoking control, Tab order remains sequential, and no interaction traps focus. The workspace tablist supports arrow keys and Home/End.
- The README's Studio workspace and Layout sections describe the three workspaces, direct panel controls, compact Panel sheet, dock, and split CSS files.

## Existing-feature reachability

- [x] Piano Roll
- [x] Drum Roll
- [x] Score
- [x] Lyrics
- [x] Guitar layer
- [x] Chord editing
- [x] Progression
- [x] Mixer
- [x] Generate
- [x] Share URL
- [x] Save/Open file
- [x] Undo/Redo
- [x] Command Palette

No new music feature, Song/Share schema, or audio-engine behavior was added in PR8.

## Verification

- `npm test`: 507 passed, 0 failed.
- `npm run check`: passed.
- `git diff --check`: passed.
- `npm run ui-audit -- --out docs/ui-audit/round2/pr8-after`: 60/60 cells passed.
- `npm run css-audit -- --out docs/ui-audit/round2/pr8-css-coverage`: 66 scenarios completed.
