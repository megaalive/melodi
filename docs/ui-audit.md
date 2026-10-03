# Melodi UI Audit Baseline

Baseline commit: `57ab855` (`Complete proposed studio UI`), audited 2026-10-02.

This document records the UI before the round-2 cleanup. Control names and line
numbers refer to that commit. DOM controls that move at runtime are called out
separately from the static markup.

## Controls and duplicated responsibilities

| Location | Visible controls and purpose | Hooks | Duplicate or access note |
|---|---|---|---|
| Header / Project | New song, examples, browser library open/save/save-as, open/save file, share | `new-song`, `show-examples`, `show-browser-library`, `save-browser-direct`, `show-save-browser`, `open-project-file`, `save-project-file`, `share-song` | One Project disclosure; actions are menu-only. |
| Header / Studio | Command Palette, language, theme, undo, redo | `command-palette`, `language-switch`, `theme-switch`, `undo`, `redo` | Studio disclosure contains Settings disclosure; settings and palette are menu-only. Undo/Redo are duplicated only by keyboard/palette routes, not visible buttons. |
| Song strip | Read-only title, tempo, key/scale, meter | `song-title`, `tempo-value`, `key-value`, `time-signature-value` (`data-entity` hooks) | Tempo repeats as an editable field in Transport. Meter repeats in Piano Roll's `editor-meter` and Score's sticky context. Title has no edit command. |
| Transport | Play/Pause, Stop, tempo input, Loop toggle, Follow, status/current note, machine tick/section readouts | `play`, `pause`, `stop`, `set-tempo`, `set-tempo-direct`, `set-loop-enabled`, `set-follow-mode`; status entities `playback-status`, `current-note`, `current-tick`, `current-section` | One visible tempo input and one loop toggle. Play and Pause are separate buttons with only one visible at a time. Tick/section are machine details. Seek and loop-range inputs are inside Advanced. The `set-tempo`, `seek`, and `set-loop` action hooks also occur on their forms and submit buttons. |
| View navigation | Piano Roll, Drum Roll, Score, Lyrics; Guitar under More; Mixer/Chord/Generate panel buttons | `data-studio-view="piano-roll|drums|score|lyrics|guitar"`; `data-studio-panel="mixer|chords|generate"` | `#view-mode[data-action="set-view-mode"]` separately selects the same editor state, including `combined`. Guitar and three panels are only reached via More. |
| Piano Roll toolbar | Select/Draw, meter, snap, zoom, Copy, Paste, clear selection | `set-tool`, `set-snap`, `set-zoom`, `copy-selection`, `paste-notes`, `clear-selection` | Meter duplicates the Song strip. Selection actions stay visible when nothing is selected (disabled as appropriate). |
| Piano Roll chord tools | Progression, harmony snap, chord root/quality picker, suggest/add/clear chord | `suggest-harmony`, `set-chord-snap`, `set-chord-draw`, `add-chord`, `clear-harmony` | Occupies a permanent strip above the Roll; chord root/quality are inside a disclosure. |
| Score | Flow/Page layout, Split, Score help, selection summary | `set-score-layout`; `data-studio-view="combined"` | Key and meter appear in the sticky Score context as well as the Song strip / Roll meter. Help is a pane-local disclosure. |
| Expression | Bend/Volume/Pan/Vibrato modes, bend editor/reset, selected-note bend/vibrato controls, curve/note parameters | `set-expression-mode`, `expression-edit-bend`, `expression-reset-selected`, `set-selected-bend`, `set-selected-vibrato`, `expression-apply-vibrato`, `bend-add-point`, `bend-reset-curve`, `bend-apply-curve` | Expression panel is independently collapsible. Curve, vibrato parameters, and selected-note tools are disclosed/contextual. |
| Guitar | Tab/Fretboard layout, follow/status, tab/fretboard canvases | `set-guitar-layout`; `guitar-tab`, `guitar` entities | Entire view is selected through More or `#view-mode`; intended destination is the Edit inspector. |
| Drums | Groove preset, Select/Draw, snap, duplicate/delete/clear hit selection, hit-expression panel, velocity/pan, advanced timing/tuning/articulation | `apply-drum-groove`, `set-tool`, `set-snap`, `duplicate-selected-percussion-hits`, `delete-selected-percussion-hits`, `clear-percussion-selection`, `update-percussion-hit` | Hit actions show only for a selection; advanced hit fields use one disclosure. |
| Lyrics | Raw lyrics, save, auto-map, add syllable, syllable list | `set-lyrics`, `auto-map-lyrics`, `add-syllable` | Reachable through a dedicated mode tab. |
| Inspector / Chord | Mixer, harmony mute/volume/style, chord list/editor | `toggle-instrument-mute`, `set-instrument-volume`, `set-harmony-style`, `set-bass-style`, `save-chord`, `new-chord` | Chord panel is reachable through More; editor is a disclosure. |
| Inspector / Generate | Choose anchors, generation parameters, generate/regenerate/clear/accept/lock candidates | `mark-selected-anchors`, `use-selected-anchors`, `use-selection`, `use-generation-ticks`, `generate-gap`, `regenerate-gap`, `clear-generation`, `accept-candidate`, `lock-accepted-notes`, `audition-candidate`, `candidate-nav` | Parameters and shortcuts are disclosures. Generation is reached through More. |
| Inspector / Tools | Add note, select range | `add-note`, `select-range` | Tools disclosure contains two more disclosures. |
| Per-pane help | Piano Roll and Score help copy | `data-aria-copy` on each `?` summary | Separate pane-local popovers. |
| Song overview | Bar-position readout and timeline seek track | `timeline-overview`; seek action is handled by the overview control | The overview is a separate band above the canvas. |

Static IDs are unique. The repeated action hooks in the main chrome are the
form-and-submit pairs for tempo, seek, and loop range; the visible state-control
duplication is primarily the view tabs plus `#view-mode`, tempo readout plus
input, and repeated meter readouts.

## Chrome height and visible-control counts

“Fixed chrome” means the combined vertical footprint above the editable canvas:
page header, Song strip, transport, view toolbar, and the overview band when it
precedes the canvas. Heights are measured at the default Piano Roll view, with
menus closed except controls that are open by default. Percentages use the full
CSS viewport height. On portrait and short-landscape layouts, fixed controls
also occupy a bottom dock; the reported total adds the top and bottom bands.

| Viewport | Fixed chrome footprint | Viewport share | Rendered controls (all / primary chrome) |
|---|---:|---:|---:|
| 1440×900 | 124 px (top) | 13.8% | 28 / 14 |
| 390×844 | 80 px top + 88 px bottom = 168 px | 19.9% | 19 / 12 |
| 844×390 | 68 px top + 44 px bottom = 112 px | 28.7% | 15 / 15 |

Control counts are for the default Piano Roll view with menus and dialogs
closed. They count rendered interactive or keyboard-focusable elements with
nonzero geometry that intersects the viewport, omit visually hidden elements
and descendants of closed `<details>`, and include disabled controls when they
are rendered. The primary-chrome subset includes the visible shell controls:
header, transport, view/editor navigation, and mobile docks or rails. The
desktop header currently clips Undo/Redo, Command Palette, and Settings beyond
the 1440 px viewport; these clipped elements are excluded from its rendered
count. The short-landscape view rail is 52 px wide and 388 px tall.

Desktop top chrome ends at y=124 px. The 41 px page header and 83 px workspace
chrome include a 44 px transport row and 37 px toolbar. In portrait, the top
bands are 36 px header + 44 px transport; the bottom is 44 px editor tools +
44 px view navigation, leaving a 676 px editor area. In short landscape, the
top bands are 24 px header + 44 px transport, followed by the 44 px bottom
sheet and the left view rail.

All 36 baseline screenshots use the same persisted “Melodi awal” workspace,
captured in light and dark themes. Each view/theme combination is linked below.

### 1440×900 desktop

| View | Light | Dark |
|---|---|---|
| Piano Roll | [PNG](ui-audit/baseline/desktop/piano-roll__light__1440x900.png) | [PNG](ui-audit/baseline/desktop/piano-roll__dark__1440x900.png) |
| Drums | [PNG](ui-audit/baseline/desktop/drums__light__1440x900.png) | [PNG](ui-audit/baseline/desktop/drums__dark__1440x900.png) |
| Score | [PNG](ui-audit/baseline/desktop/score__light__1440x900.png) | [PNG](ui-audit/baseline/desktop/score__dark__1440x900.png) |
| Lyrics | [PNG](ui-audit/baseline/desktop/lyrics__light__1440x900.png) | [PNG](ui-audit/baseline/desktop/lyrics__dark__1440x900.png) |
| Guitar | [PNG](ui-audit/baseline/desktop/guitar__light__1440x900.png) | [PNG](ui-audit/baseline/desktop/guitar__dark__1440x900.png) |
| Combined | [PNG](ui-audit/baseline/desktop/combined__light__1440x900.png) | [PNG](ui-audit/baseline/desktop/combined__dark__1440x900.png) |

### 390×844 portrait

| View | Light | Dark |
|---|---|---|
| Piano Roll | [PNG](ui-audit/baseline/portrait/piano-roll-390x844-light.png) | [PNG](ui-audit/baseline/portrait/piano-roll-390x844-dark.png) |
| Drums | [PNG](ui-audit/baseline/portrait/drums-390x844-light.png) | [PNG](ui-audit/baseline/portrait/drums-390x844-dark.png) |
| Score | [PNG](ui-audit/baseline/portrait/score-390x844-light.png) | [PNG](ui-audit/baseline/portrait/score-390x844-dark.png) |
| Lyrics | [PNG](ui-audit/baseline/portrait/lyrics-390x844-light.png) | [PNG](ui-audit/baseline/portrait/lyrics-390x844-dark.png) |
| Guitar | [PNG](ui-audit/baseline/portrait/guitar-390x844-light.png) | [PNG](ui-audit/baseline/portrait/guitar-390x844-dark.png) |
| Combined | [PNG](ui-audit/baseline/portrait/combined-390x844-light.png) | [PNG](ui-audit/baseline/portrait/combined-390x844-dark.png) |

### 844×390 short landscape

| View | Light | Dark |
|---|---|---|
| Piano Roll | [PNG](ui-audit/baseline/landscape/landscape-piano-roll-light-844x390.png) | [PNG](ui-audit/baseline/landscape/landscape-piano-roll-dark-844x390.png) |
| Drums | [PNG](ui-audit/baseline/landscape/landscape-drums-light-844x390.png) | [PNG](ui-audit/baseline/landscape/landscape-drums-dark-844x390.png) |
| Score | [PNG](ui-audit/baseline/landscape/landscape-score-light-844x390.png) | [PNG](ui-audit/baseline/landscape/landscape-score-dark-844x390.png) |
| Lyrics | [PNG](ui-audit/baseline/landscape/landscape-lyrics-light-844x390.png) | [PNG](ui-audit/baseline/landscape/landscape-lyrics-dark-844x390.png) |
| Guitar | [PNG](ui-audit/baseline/landscape/landscape-guitar-light-844x390.png) | [PNG](ui-audit/baseline/landscape/landscape-guitar-dark-844x390.png) |
| Combined | [PNG](ui-audit/baseline/landscape/landscape-combined-light-844x390.png) | [PNG](ui-audit/baseline/landscape/landscape-combined-dark-844x390.png) |

## Nested disclosures, popovers, and menu-only controls

Baseline markup has 18 `<details>` elements; three are nested one level:

- `studio-menu` → `studio-settings` (language and theme).
- `sidebar-tools` → `utility-details` (Add Note and Select Range; two children).

Seven popover-class elements are present: Project, Studio, Settings, More,
two pane-help popovers, and generation advanced options. Settings is nested
inside the Studio popover; generation options are a disclosure-styled popover.

Menu-only actions: project/file/share actions; Command Palette; language/theme;
Guitar and Mixer/Chord/Generate; seek and manual loop range; chord draw
root/quality; selected-note details and expression editors; generation
parameters/shortcuts; Add Note and Select Range; pane help. Actions must remain
available through keyboard-operable controls after each menu is flattened.

## CSS baseline

`styles/app.css` is 200,708 bytes. It contains 59 `@media` blocks in 20
condition spellings. The source conditions and counts are:

| Source condition | Count |
|---|---:|
| `(max-width: 46rem)` | 17 |
| `(max-width: 68rem)` | 5 |
| `(max-width: 760px)` | 7 |
| `(orientation: landscape) and (max-height: 500px) and (min-width: 761px)` | 4 |
| `(max-width: 31rem)` | 3 |
| `(max-width: 32rem)` | 3 |
| `(pointer: coarse)` | 3 |
| `(min-width: 761px) and (min-height: 501px)` | 2 |
| `(min-width: 761px)` | 2 |
| `(min-width: 78rem)` | 2 |
| `(max-width: 760px)` (no spaces in source) | 2 |
| `(max-width: 380px)` | 1 |
| `(max-width: 72rem)` | 1 |
| `(min-width: 46.01rem) and (max-width: 68rem)` | 1 |
| `(min-width: 60rem)` | 1 |
| `(min-width: 68.01rem)` | 1 |
| `(min-width: 1100px)` | 1 |
| `(pointer: coarse), (max-width: 1024px)` | 1 |
| `(prefers-color-scheme: dark)` | 1 |
| `(prefers-reduced-motion: reduce)` | 1 |

Selector inventory (comma-separated lists split, whitespace normalized): 1,913
selector occurrences, 1,248 unique strings, 362 repeated strings (1,027
occurrences). There are 277 repeated selector/media-context groups (629
occurrences); this is a source-overlap count, not proof that every repeated
declaration is redundant.

Examples of repeated shell selectors include `.page-header` (six locations),
`.song-strip` (seven), `.transport-dock` (five), and
`.workspace-chrome .transport-dock` (six). Studio shell selectors repeat in
the base section and several compact/landscape passes: `.studio .page-header`,
`.studio .song-strip`, `.studio .transport-main`, `.studio-views`, and
`.studio .workspace-chrome .transport-dock`.

## View-mode compatibility map

| Existing `setViewMode()` value | Round-2 workspace destination |
|---|---|
| `piano-roll` | Edit tab, Piano Roll with chord lane |
| `guitar` | Edit tab, Guitar inspector layer |
| `score` | Not tab, Score view |
| `lyrics` | Not tab, Lyrics view |
| `drums` | Irama tab, Drum Roll |
| `combined` | Split Score + Piano Roll on desktop; Edit tab fallback on mobile |

`setViewMode()` and `getState().editor.view` keep these old values as the
compatibility API. Unknown values continue to throw the existing
`MelodiError("invalid-view-mode")` path. The visible navigation uses Edit, Not,
and Irama; Guitar and Split remain reachable as layers/layout controls.

## Contract and audit notes

`PLAN.md` contracts align with this cleanup: vanilla ES modules, Indonesian
default and English UI, i18n-managed copy, relative/subpath-safe assets, one
command layer for UI and browser automation, stable data hooks, keyboard access,
and truthful `availableActions`. Current layout-oriented tests pin details,
popover placement, Guitar-in-More, and one stylesheet; those assertions will be
updated only for the structures this brief explicitly changes. Command/state,
hook, model, theme, and audio-engine contracts remain covered unchanged.

Source audit of `src/app.js` and the 16 `src/ui` modules found these integration
constraints:

- `src/app.js` is the render/state hub. `getR3ViewMarkup()` currently requires
  `#view-mode`, `#follow-mode`, and all view regions together; it must accept the
  retained follow control/regions after the duplicate select is removed.
- `src/ui/studio.js` reparents existing controls across desktop, compact, and
  short-landscape layouts. Adapt that arrangement rather than adding duplicate
  controls. Keep its keyboard view navigation and focus restoration intact.
- Roll and Drum currently have parallel Select/Draw buttons and Snap selectors,
  both dispatching the same canonical editor state. The shared visible controls
  must keep `data-action="set-tool"` and `data-action="set-snap"` behavior.
- Piano Roll and Expression panels use button-based collapse with persisted
  preferences; those controls can remain without nesting disclosures.
- App Escape handling has an explicit details allowlist, and bend-editor code
  opens `#bend-editor-details` directly. Update those paths only if a wrapper is
  actually removed.
- Guitar TAB playback follow currently depends on `state.view.mode ===
  "guitar"`; when Guitar becomes an Edit inspector, the presentation state must
  still drive Guitar follow without changing the public old mode values.
- `VIEW_REGION_MODES` currently maps score/Piano Roll combined regions, Guitar
  and Lyrics individually, and Drum Roll individually. Preserve all stable
  `data-entity` hooks in the visual modules as containers move.

## Round 2 PR2 — flat menus and mobile sheets

The six after captures use the Piano Roll, the persisted “Melodi awal” sample,
and the same light/dark and viewport dimensions as PR1. The before captures are
the corresponding PR1 after captures.

| Metric | Before PR2 (PR1) | After PR2 |
|---|---:|---:|
| Fixed chrome, desktop 1440×900 | 123 px / 13.7% | 124 px / 13.8% |
| Fixed chrome, phone portrait 390×844 | 168 px / 19.9% | 168 px / 19.9% |
| Visible controls, desktop (all / primary) | 25 / 12 | 25 / 12 |
| Visible controls, phone portrait (all / primary) | 20 / 14 | 22 / 14 |
| Runtime `<details>` elements | 18 | 14 |
| `styles/app.css` bytes | 200,615 | 201,154 |
| `@media` blocks | 59 | 61 |

Additional after measurements: 844×390 landscape has 112 px / 28.7% fixed
chrome and 23 / 15 visible controls (all / primary). The fixed-chrome measure
uses the header, transport, view navigation, and phone docks/rails. Control
counts include interactive or focusable elements with visible geometry that
intersects the viewport; disabled controls count, and closed `<details>`
contents do not.

| Viewport and theme | Before | After |
|---|---|---|
| Desktop light | [PR1 capture](ui-audit/after/pr1/desktop-light-1440x900.png) | [PR2 capture](ui-audit/after/pr2/desktop-light-1440x900.png) |
| Desktop dark | [PR1 capture](ui-audit/after/pr1/desktop-dark-1440x900.png) | [PR2 capture](ui-audit/after/pr2/desktop-dark-1440x900.png) |
| Portrait light | [PR1 capture](ui-audit/after/pr1/portrait-light-390x844.png) | [PR2 capture](ui-audit/after/pr2/portrait-light-390x844.png) |
| Portrait dark | [PR1 capture](ui-audit/after/pr1/portrait-dark-390x844.png) | [PR2 capture](ui-audit/after/pr2/portrait-dark-390x844.png) |
| Landscape light | [PR1 capture](ui-audit/after/pr1/landscape-light-844x390.png) | [PR2 capture](ui-audit/after/pr2/landscape-light-844x390.png) |
| Landscape dark | [PR1 capture](ui-audit/after/pr1/landscape-dark-844x390.png) | [PR2 capture](ui-audit/after/pr2/landscape-dark-844x390.png) |

## Round 2 PR3 — contextual toolbars and responsive CSS

The six after captures use the Piano Roll and “Melodi awal” in the same three
viewports and themes. The before captures are the matching PR2 screenshots.
Counts use the existing audit rule: rendered interactive or keyboard-focusable
controls with visible geometry intersecting the viewport, including disabled
controls and excluding content under closed disclosures. Primary controls are
the visible header, transport, view/editor navigation, and mobile docks or
rails.

| Metric | Before PR3 (PR2) | After PR3 |
|---|---:|---:|
| Fixed chrome, desktop 1440×900 | 124 px / 13.8% | 128 px / 14.2% |
| Fixed chrome, phone portrait 390×844 | 168 px / 19.9% | 168 px / 19.9% |
| Fixed chrome, short landscape 844×390 | 112 px / 28.7% | 112 px / 28.7% |
| Visible controls, desktop (all / primary) | 25 / 12 | 29 / 19 |
| Visible controls, phone portrait (all / primary) | 22 / 14 | 21 / 15 |
| Visible controls, short landscape (all / primary) | 23 / 15 | 22 / 16 |
| Runtime `<details>` elements | 14 | 14 |
| Active CSS bytes, uncompressed | 201,154 | 194,207 |
| `@media` blocks | 61 | 10 |

The active stylesheet tree is `app.css` importing `base.css`, `studio.css`,
and `responsive.css` in that order. The ten media blocks use the consolidated
`<=46rem`, `46–68rem`, and `>=68rem` width bands, with one short-landscape
rule; the remaining queries cover coarse pointers, color scheme, reduced
motion, and taller tablet/desktop layouts. The measured CSS reduction is 6,947
bytes (3.45%). It does **not** meet the requested 30% reduction (the ceiling
would be 140,807 bytes). CSSO/LightningCSS compression probes either failed to
preserve the current range-query behavior or remained above that limit, and the
source audit found no additional safe 8 KB of removable CSS. This target remains
unmet; the PR description reports the shortfall explicitly.

| Viewport and theme | Before | After |
|---|---|---|
| Desktop light | [PR2 capture](ui-audit/after/pr2/desktop-light-1440x900.png) | [PR3 capture](ui-audit/after/pr3/desktop__light__1440x900.png) |
| Desktop dark | [PR2 capture](ui-audit/after/pr2/desktop-dark-1440x900.png) | [PR3 capture](ui-audit/after/pr3/desktop__dark__1440x900.png) |
| Portrait light | [PR2 capture](ui-audit/after/pr2/portrait-light-390x844.png) | [PR3 capture](ui-audit/after/pr3/portrait__light__390x844.png) |
| Portrait dark | [PR2 capture](ui-audit/after/pr2/portrait-dark-390x844.png) | [PR3 capture](ui-audit/after/pr3/portrait__dark__390x844.png) |
| Landscape light | [PR2 capture](ui-audit/after/pr2/landscape-light-844x390.png) | [PR3 capture](ui-audit/after/pr3/landscape__light__844x390.png) |
| Landscape dark | [PR2 capture](ui-audit/after/pr2/landscape-dark-844x390.png) | [PR3 capture](ui-audit/after/pr3/landscape__dark__844x390.png) |

## Round 2 PR4 — single workspace navigation and phone dock

The six after captures use the Piano Roll and “Melodi awal” at the same three
viewport sizes and in light and dark themes. The before captures are the
matching PR3 screenshots. The desktop header now has three primary workspaces:
Edit, Not, and Irama. Phone layouts move those tabs below the transport dock;
short landscape hides the header and keeps the canvas visible above that dock.
The timeline overview remains inside the transport, so it adds no separate
band. Guitar stays available from the Edit workspace as an inspector layer
over the Piano Roll. Mixer, Chords, and Generate remain inspector panels. The old six
`setViewMode()` values remain supported; Combined uses the Not tab on desktop
and falls back to Edit on phone.

| Metric | Before PR4 (PR3) | After PR4 |
|---|---:|---:|
| Fixed chrome, desktop 1440×900 | 128 px / 14.2% | 134.25 px / 14.9% |
| Fixed chrome, phone portrait 390×844 | 168 px / 19.9% | 128 px / 15.2% |
| Fixed chrome, short landscape 844×390 | 112 px / 28.7% | 88 px / 22.6% |
| Visible controls, desktop (all / primary) | 29 / 19 | 25 / 14 |
| Visible controls, phone portrait (all / primary) | 21 / 15 | 15 / 8 |
| Visible controls, short landscape (all / primary) | 22 / 16 | 15 / 9 |
| Runtime `<details>` elements | 14 | 14 |
| Active CSS bytes, uncompressed | 194,207 | 206,386 |
| `@media` blocks | 10 | 10 |

Fixed chrome is measured as the vertical distance from the top of the viewport
to the editable canvas, plus any fixed bottom dock. Desktop top chrome includes
the page header, workspace transport/navigation, and editor toolbar. Portrait
uses a 40 px header plus an 88 px bottom dock containing 44 px transport and
44 px workspace navigation. Short landscape hides the header and uses that
same 88 px dock, leaving the canvas at the top of the screen. Both phone layouts
stay below the 25% fixed-chrome limit. The CSS tree grew by 12,179 bytes
(6.3%) from PR3 to fit the workspace tabs, compact transport, and responsive
layout rules; it remains at ten media blocks. The PR3 30% CSS reduction target
is still unmet as documented above.

Control counts use the existing audit rule: interactive or keyboard-focusable
elements with nonzero geometry that intersects the viewport, including
disabled controls and excluding visually hidden elements and closed
`<details>` contents. The primary count is the subset within the header,
transport, workspace tabs, editor toolbar, and phone docks or rails. The
runtime disclosure count remains 14.

| Viewport and theme | Before | After |
|---|---|---|
| Desktop light | [PR3 capture](ui-audit/after/pr3/desktop__light__1440x900.png) | [PR4 capture](ui-audit/after/pr4/desktop__light__1440x900.png) |
| Desktop dark | [PR3 capture](ui-audit/after/pr3/desktop__dark__1440x900.png) | [PR4 capture](ui-audit/after/pr4/desktop__dark__1440x900.png) |
| Portrait light | [PR3 capture](ui-audit/after/pr3/portrait__light__390x844.png) | [PR4 capture](ui-audit/after/pr4/portrait__light__390x844.png) |
| Portrait dark | [PR3 capture](ui-audit/after/pr3/portrait__dark__390x844.png) | [PR4 capture](ui-audit/after/pr4/portrait__dark__390x844.png) |
| Landscape light | [PR3 capture](ui-audit/after/pr3/landscape__light__844x390.png) | [PR4 capture](ui-audit/after/pr4/landscape__light__844x390.png) |
| Landscape dark | [PR3 capture](ui-audit/after/pr3/landscape__dark__844x390.png) | [PR4 capture](ui-audit/after/pr4/landscape__dark__844x390.png) |

## Putaran stabilisasi: matriks otomatis

PR5 memperluas audit menjadi 60 sel: tiga viewport (1440×900, 390×844,
844×390), tema light dan dark, serta sepuluh keadaan kerja. Setiap sel memuat
screenshot dan angka chrome, kontrol terlihat, `<details>`, tumpang tindih,
serta clipping. Runner memakai Chromium dan menyajikan aplikasi lewat
`/melodi/` lokal untuk menjaga pemeriksaan path subpath.

Jalankan `npm run ui-audit -- --out docs/ui-audit/round2/pr5-before` untuk
mengulang baseline sebelum perubahan PR5. Hasil terstruktur JSON/CSV dan tabel
tautan screenshot ada di [matriks baseline PR5](ui-audit/round2/pr5-before/matrix.md).
Kontrol yang terpotong oleh viewport atau ancestor `overflow` dihitung sebagai
clipped; pasangan induk-anak dan area yang sepenuhnya tertutup overlay tidak
dihitung sebagai overlap.

## Putaran 2 PR6–8 — stabilisasi, coverage, dan polish

| Tahap | Matriks dan build | Chrome default | Kontrol terlihat | CSS aktif / imported | Hasil utama |
|---|---|---:|---:|---:|---|
| PR6 | 60 sel, build `.72` | 171 px / 19.0% desktop; 193 px / 22.9% portrait; 97 px / 24.9% landscape | 25 / 19 / 10 | 223,810 B imported | 60/60 tanpa kegagalan; bukti ada di [matriks PR6](ui-audit/round2/pr6-after/matrix.md). |
| PR7 | 60 sel + 6 state dinamis | Sama dengan PR6 | 25 / 19 / 10 | 222,216 B aktif; 221,709 B imported | 1,228/1,819 aturan terpakai; 0 kandidat mati statis. Lihat [laporan PR7](ui-audit/round2/pr7-summary.md) dan [coverage](ui-audit/round2/pr7-css-coverage/report.md). |
| PR8 | 60 sel + 6 state dinamis | Maksimum 219.2 px / 24.4% desktop, 192 px / 22.7% portrait, 97 px / 24.9% landscape | 25 / 19 / 16 | 224,693 B aktif; 224,186 B imported | 1,248/1,836 aturan terpakai; 0 kandidat mati statis. Lihat [laporan PR8](ui-audit/round2/pr8-summary.md), [matriks](ui-audit/round2/pr8-after/matrix.md), dan [coverage](ui-audit/round2/pr8-css-coverage/report.md). |

PR6 merapikan putaran awal tanpa mengubah metrik utama; PR7 menambahkan audit
coverage Chromium dan guard ukuran serta menghapus CSS yang terbukti mati; PR8
memperbaiki pengukuran landscape, aksesibilitas, dan polish. Clipping di dalam
kanvas atau panel yang dapat digulir tetap dihitung sebagai clipping mentah,
namun seluruh tahap ini melaporkan nol klip yang tidak dapat dijangkau. Ringkasan
PR7 dan PR8 memuat daftar batas serta verifikasi masing-masing.

Metrik klik-untuk-terlihat baru ditambahkan pada PR9, jadi nilainya memang belum
tersedia untuk PR6–8. Pada keadaan Edit default PR6, ketiga viewport mencatat
overlap 0, `<details>` 13, clipping mentah 2/2/0 (desktop/portrait/landscape),
dan unreachable clip 0; [matriks PR6](ui-audit/round2/pr6-after/matrix.md) adalah
arsip rinci tahap yang belum memiliki ringkasan tersendiri. PR7 dan PR8 memiliki
ringkasan lengkap berisi angka clipping, media query, coverage, aksesibilitas,
dan tes pada tautan tabel di atas.

## Putaran 2 PR9 — kontrol rutin di header desktop

Build `.75` menampilkan tindakan proyek, bahasa, tema, Command Palette, Undo,
dan Redo langsung di header desktop serta merapatkan chrome desktop dan tablet.
Ringkasan metrik lima viewport, keterbatasan klik-untuk-terlihat yang tersisa,
hasil tes, dan angka CSS ada di [laporan PR9](ui-audit/round2/pr9-summary.md).
Matriks lengkap sebelum dan sesudah, termasuk screenshot default, Generate
dengan kandidat, dan Mixer pada dua tema, ada di [baseline PR9](ui-audit/round2/pr9-before/matrix.md)
dan [hasil PR9](ui-audit/round2/pr9-after/matrix.md).

## Putaran 2 PR10 — dock kanan dan tab Alat

Build `.76` menambahkan dock desktop yang terbuka default dengan tab Mixer,
Chord, Generate, dan Alat serta memindahkan kontrol lanjutan ke tab Alat.
Ringkasan metrik, batas klik karena disclosure/tab, anggaran CSS, dan hasil
tes ada di [laporan PR10](ui-audit/round2/pr10-summary.md). Matriks 100 sel
dan 30 screenshot sesudah perubahan ada di [hasil PR10](ui-audit/round2/pr10-after/matrix.md);
[baseline sebelum PR10](ui-audit/round2/pr9-after/matrix.md) menjadi pembanding.

## Putaran 2 PR11 — Generate dan editor ekspresi

Build `.77` membuka opsi/pintasan Generate saat tab aktif pada desktop lebar,
membuka editor ekspresi dan gambar chord saat konteksnya aktif, serta mengubah
kartu kandidat menjadi grid pada dock mulai 68rem. Ringkasan metrik dan tautan
before/after per viewport dan tema ada di [laporan PR11](ui-audit/round2/pr11-summary.md).
Matriks 100 sel, data JSON/CSV, dan 30 screenshot sesudah perubahan ada di
[hasil PR11](ui-audit/round2/pr11-after/matrix.md); pembandingnya adalah
[hasil PR10](ui-audit/round2/pr10-after/matrix.md).

## Putaran 2 PR12 — CSS coverage dan diet

Build `.78` menghapus 78 aturan lama `.studio #piano-roll-content > .candidate-dock*`
(12,029 B) setelah runtime ditelusuri: dock kandidat hanya dipindahkan ke panel
Generate. Audit juga menghapus 11 salinan sebelumnya dari aturan responsive yang
identik selector, deklarasi, dan seluruh konteks `@media`-nya (807 B). Aturan
desktop untuk merapatkan toolbar kosong di tampilan Score/Lyrics/Irama ditambahkan
agar tinggi chrome tetap di bawah batas.

Audit CSS menjalankan 100 sel matriks dan 6 state dinamis. Ukuran pohon CSS impor
yang dinormalisasi LF adalah 223,329 B dengan guard 224,000 B; guard tidak
bergantung pada checkout CRLF Windows. Browser mengukur 229,065 B aktif dan
154,642 B terpakai (67.51%); ada 18 blok `@media` aktif (17 responsive, 1
studio). Target 165,000 B belum tercapai. Ada 514 aturan belum terpakai pada
skenario audit, tetapi tidak ada kandidat aman dari pemeriksaan token kelas statis; “tidak
terpakai” pada sampel ini sendiri tidak membuktikan sebuah aturan mati. Menghapus
aturan lain dari hasil sampel itu berisiko menghilangkan state, breakpoint, fokus,
atau styling runtime. Detail ada pada [laporan coverage sesudah](ui-audit/round2/pr12-css-coverage-after/report.md)
dan [laporan sebelum cleanup](ui-audit/round2/pr12-css-coverage-before-cleanup/report.md).

Audit UI build `.78` lulus 100/100 sel: nol kegagalan, overlap kontrol, overlap
label kanvas, dan klip tanpa ancestor scroll. Chrome maksimum per viewport:
1920×1080 125.2 px / 11.6%; 1440×900 125.2 px / 13.9%; 1024×768 183.2 px /
23.9%; 390×844 192 px / 22.7%; 844×390 97 px / 24.9%. Konten yang terpotong
pada area scroll tetap muncul dalam angka clipping mentah—maksimum 11 pada
landscape—dan dapat dicapai dengan scroll. Metrik klik-untuk-terlihat yang ketat
menghitung 23 target umum di desktop default (10 di disclosure tertutup dan 13
di tab dock lain); pada Generate aktif, 13 target tersisa berasal dari tab dock
lain, bukan disclosure Generate. Tes desktop memisahkan penyebab ini serta
memastikan kontrol header rutin terlihat.

| Viewport | Klik-untuk-terlihat default | Chrome maksimum | Klip mentah maksimum / tidak terjangkau | Overlap maksimum | `<details>` default |
|---|---:|---:|---:|---:|---:|
| 1920×1080 | 23 (10 + 13) | 125.2 px / 11.6% | 1 / 0 | 0 | 13 |
| 1440×900 | 23 (10 + 13) | 125.2 px / 13.9% | 0 / 0 | 0 | 13 |
| 1024×768 | 32 (19 + 13) | 183.2 px / 23.9% | 2 / 0 | 0 | 13 |
| 390×844 | 37 (37 + 0) | 192 px / 22.7% | 10 / 0 | 0 | 13 |
| 844×390 | 37 (37 + 0) | 97 px / 24.9% | 11 / 0 | 0 | 13 |

Matriks lengkap, JSON/CSV, dan 100 screenshot ada di
[hasil PR12](ui-audit/round2/pr12-after/matrix.md). Tabel screenshot before/after
30 pasangan default, Generate dengan kandidat, dan Mixer tersedia di
[ringkasan PR12](ui-audit/round2/pr12-summary.md). Laporan itu juga mencatat
`npm test`, `npm run check`, CI, dan bukti Pages untuk build `.78`.

## Putaran 2 PR13–16 — Guitar dock dan kontrol yang terjangkau

Build lokal `20261003.79` mencatat empat tahapan brief dalam satu hasil akhir.
Peta fitur mempertahankan baseline `.78` dan menambahkan rumah kontrol serta
cakupan operasi `.79`. Semua angka di bagian ini berasal dari verifikasi akhir
yang sama; tidak ada rekaman ukuran CSS atau metrik tata letak antara tiap tahap.

| Tahap brief | Perubahan yang diverifikasi pada `.79` | Bukti |
|---|---|---|
| PR13 | Inventaris fitur, tes 30 target operasi, dan sheet Guitar berisi TAB/Fretboard | [Peta fitur](feature-map.md), tes `core-reachability`, keadaan Guitar pada [matriks](ui-audit/round2/pr13-16-final-v79/matrix.md) |
| PR14 | Zona Guitar di bawah Edit/Not, toggle sinkron, splitter keyboard, state/tinggi tersimpan, dock tetap dipilih | Keadaan Edit/Not + Guitar dan Fretboard pada matriks; tes interaksi Studio/preferensi |
| PR15 | Tab sesuai workspace, dua slot dock pada layar lebar dan tinggi, ekspresi drum dengan hit terpilih, empat birama drum terlihat | Keadaan dual dock Edit/Not/Irama dan Irama + ekspresi pada matriks; tes Drum Grid |
| PR16 | Aksi proyek berlabel, semua delapan langsung pada `>=90rem`, empat utama + Proyek pada 68–90rem, dokumentasi Snap/Zoom | Keadaan proyek dan medium desktop; tes kontrol desktop; [README](../README.md) |

### Matriks dan cara pengukuran

Audit UI selesai pada 2026-10-03 15:50:07 UTC: **200/200 sel**, seluruhnya build
`.79`, nol kegagalan. Lima viewport wajib menjalankan 17 keadaan pada tema
light/dark (170 sel). Tambahan 1280×900 menjalankan 10 keadaan pada dua tema
(20 sel), dan 1440×799 menjalankan lima keadaan pada dua tema (10 sel) untuk
memeriksa batas dua slot/tinggi Guitar. Terdapat 200 screenshot hasil matriks.
Data lengkap: [matriks](ui-audit/round2/pr13-16-final-v79/matrix.md),
[JSON](ui-audit/round2/pr13-16-final-v79/results.json), dan
[CSV](ui-audit/round2/pr13-16-final-v79/results.csv).

Semua field `pageErrors` kosong. Runner merekam event `pageerror`; console error
tidak menjadi sumber pengukuran field tersebut, sehingga hasil ini tidak
menyatakan seluruh pesan console telah diaudit.

Chrome pada audit ini diukur dari puncak viewport ke **shell kanvas workspace**,
ditambah dock bawah yang fixed. Alat khusus workspace di dalam shell dihitung
sebagai kontrol konten. Ini memperjelas batas pengukuran terhadap laporan lama
yang memakai awal area editor aktif; persentase historis tidak diperlakukan
sebagai perbandingan langsung dengan angka baru. Runner kini memeriksa batas
chrome 14% dari 68rem dan 25% pada phone/short landscape, serta menilai klip per
arah terhadap ancestor yang benar-benar dapat digulir. Tablet 1024×768 dicatat
tersendiri karena berada di bawah breakpoint desktop tersebut.

| Viewport | Sel | Kontrol terlihat, Edit default | Klik-untuk-terlihat default (disclosure + tab lain) | Chrome maksimum | Klip mentah maksimum / tidak terjangkau | Overlap kontrol / label maksimum |
|---|---:|---:|---:|---:|---:|---:|
| 1920×1080 | 34 | 75 | 8 (1 + 7) | 126 px / 11.67% | 1 / 0 | 0 / 0 |
| 1440×900 | 34 | 72 | 8 (1 + 7) | 126 px / 14.00% | 2 / 0 | 0 / 0 |
| 1280×900 | 20 | 60 | 17 (10 + 7) | 126 px / 14.00% | 4 / 0 | 0 / 0 |
| 1440×799 | 10 | 68 | 17 (10 + 7) | 108 px / 13.52% | 0 / 0 | 0 / 0 |
| 1024×768 | 34 | 39 | 24 (17 + 7) | 145 px / 18.88% | 10 / 0 | 0 / 0 |
| 390×844 | 34 | 19 | 36 (36 + 0) | 133 px / 15.76% | 10 / 0 | 0 / 0 |
| 844×390 | 34 | 22 | 32 (32 + 0) | 88 px / 22.56% | 24 / 0 | 0 / 0 |

Edit default mencatat 13 elemen `<details>` pada semua viewport. Seluruh sel
memiliki nol overlap kontrol, overlap label kanvas, klip tidak terjangkau, dan
pelanggaran batas chrome yang berlaku. Klip mentah tetap mencakup kanvas/panel
yang bisa digulir; maksimum 24 terjadi pada short landscape dan tidak disamakan
dengan kontrol yang hilang.

### Cakupan operasi dan payload

Tes reachability memeriksa **30 target operasi**, termasuk masing-masing kanal
Melody/Harmony/Bass, exact Seek/Loop, dan delapan aksi proyek. Pada 1600×900 semua
target memiliki nol aksi disclosure/menu. Pada 1200×900, 26 target memiliki nol
aksi tersebut dan empat aksi proyek sekunder memakai satu menu Proyek. Ini
mengikuti aturan header rinci pada brief dan tetap merupakan pengecualian terhadap
kalimat umum semua inti nol langkah. Pada 390×844 seluruh target memenuhi batas
maksimum satu reveal action. Tes menerima kontrol pada strip yang dapat digulir;
hasil ini tidak menyatakan semua kontrol detail terlihat serentak. Hitungan
klik-untuk-terlihat matriks adalah semua target umum pada panel/disclosure, sehingga
tetap lebih besar dari nol meski jalur operasi utama sudah tersedia.

Keadaan payload memeriksa isi yang benar, bukan hanya wrapper panel:

- Guitar TAB/Fretboard dan Not + Guitar: 32/32 keadaan mempunyai enam string
  dan representasi note melodi yang dipilih; mencakup phone dan short landscape.
- Irama + ekspresi: 10/10 keadaan mempunyai hit terpilih, tiga kontrol utama
  terlihat, serta ID hit, track, dan velocity form yang cocok dengan state.
- Dual dock Edit/Not/Irama: 12/12 keadaan pada viewport yang mendukungnya
  mempunyai dua body terlihat dan panel sekunder yang benar. Batas 1440×799
  serta 1280×900 mempertahankan satu panel.
- Irama 1440×900 light/dark: sel akhir birama keempat terlihat penuh pada 2/2
  keadaan. Horizon tampilan empat birama tidak memperpanjang durasi Song.

### CSS dan checks lokal

Pohon CSS impor adalah **223,856 B** setelah normalisasi LF: naik 527 B dari
223,329 B pada PR12 dan menyisakan 144 B di bawah guard 224,000 B. Target 165 KB
dilepas untuk PR13–16. Angka ini adalah perubahan gabungan `.78` ke `.79`, bukan
ukuran antara tiap tahap brief.

Audit coverage CSS selesai pada 2026-10-03 15:51:19 UTC. Runner coverage mengukur
seluruh kombinasi tujuh viewport × 17 keadaan × dua tema, sehingga laporannya
memuat **238 sel + 6 state dinamis (244 skenario)**, berbeda dari subset 200 sel runner UI.
Chromium mencatat 229,433 B aktif dan 166,710 B terpakai (72.66%); 1,461 dari
1,933 aturan terpakai, 472 belum terpakai, dan nol kandidat aman untuk dihapus
dari pemeriksaan referensi statis. Ukuran browser dan ukuran source yang
dinormalisasi merupakan metrik berbeda. Aturan belum terpakai pada sampel tidak
otomatis menjadi CSS mati. Lihat [laporan coverage](ui-audit/round2/pr13-16-final-v79/css-coverage/report.md)
dan [JSON coverage](ui-audit/round2/pr13-16-final-v79/css-coverage/report.json).

`npm test` lulus **549/549**, tanpa gagal, skip, atau todo. `npm run check` selesai
dengan exit 0. Verifikasi ini menggunakan server lokal pada subpath `/melodi/`;
meta build setiap sel dan URL stylesheet pada rekaman coverage memakai
`20261003.79`.

### Screenshot sebelum / sesudah

Sebelum memakai arsip PR12 `.78`; sesudah memakai `.79`. Not sebelum belum
mempunyai Guitar, sehingga pembandingnya adalah Score. Kolom Irama sesudah
menampilkan ekspresi dengan hit terpilih. Keadaan Guitar sesudah memakai note
terpilih untuk membuktikan payload; pada phone/short landscape kolom tersebut
adalah sheet Guitar. Seluruh keadaan tambahan, termasuk Fretboard dan dual dock,
tersedia pada matriks lengkap di atas.

| Viewport | Tema | Edit default | Edit + Guitar / phone Guitar | Not + Guitar | Irama + ekspresi |
|---|---|---|---|---|---|
| 1920×1080 | light | [sebelum](ui-audit/round2/pr12-after/1920x1080-light-edit-default.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1920x1080-light-edit-default.png) | [sebelum](ui-audit/round2/pr12-after/1920x1080-light-edit-guitar.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1920x1080-light-edit-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1920x1080-light-not-score.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1920x1080-light-not-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1920x1080-light-irama.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1920x1080-light-irama-drum-expression.png) |
| 1920×1080 | dark | [sebelum](ui-audit/round2/pr12-after/1920x1080-dark-edit-default.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1920x1080-dark-edit-default.png) | [sebelum](ui-audit/round2/pr12-after/1920x1080-dark-edit-guitar.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1920x1080-dark-edit-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1920x1080-dark-not-score.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1920x1080-dark-not-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1920x1080-dark-irama.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1920x1080-dark-irama-drum-expression.png) |
| 1440×900 | light | [sebelum](ui-audit/round2/pr12-after/1440x900-light-edit-default.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1440x900-light-edit-default.png) | [sebelum](ui-audit/round2/pr12-after/1440x900-light-edit-guitar.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1440x900-light-edit-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1440x900-light-not-score.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1440x900-light-not-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1440x900-light-irama.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1440x900-light-irama-drum-expression.png) |
| 1440×900 | dark | [sebelum](ui-audit/round2/pr12-after/1440x900-dark-edit-default.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1440x900-dark-edit-default.png) | [sebelum](ui-audit/round2/pr12-after/1440x900-dark-edit-guitar.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1440x900-dark-edit-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1440x900-dark-not-score.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1440x900-dark-not-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1440x900-dark-irama.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1440x900-dark-irama-drum-expression.png) |
| 1024×768 | light | [sebelum](ui-audit/round2/pr12-after/1024x768-light-edit-default.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1024x768-light-edit-default.png) | [sebelum](ui-audit/round2/pr12-after/1024x768-light-edit-guitar.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1024x768-light-edit-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1024x768-light-not-score.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1024x768-light-not-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1024x768-light-irama.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1024x768-light-irama-drum-expression.png) |
| 1024×768 | dark | [sebelum](ui-audit/round2/pr12-after/1024x768-dark-edit-default.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1024x768-dark-edit-default.png) | [sebelum](ui-audit/round2/pr12-after/1024x768-dark-edit-guitar.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1024x768-dark-edit-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1024x768-dark-not-score.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1024x768-dark-not-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/1024x768-dark-irama.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/1024x768-dark-irama-drum-expression.png) |
| 390×844 | light | [sebelum](ui-audit/round2/pr12-after/390x844-light-edit-default.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/390x844-light-edit-default.png) | [sebelum](ui-audit/round2/pr12-after/390x844-light-edit-guitar.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/390x844-light-edit-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/390x844-light-not-score.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/390x844-light-not-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/390x844-light-irama.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/390x844-light-irama-drum-expression.png) |
| 390×844 | dark | [sebelum](ui-audit/round2/pr12-after/390x844-dark-edit-default.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/390x844-dark-edit-default.png) | [sebelum](ui-audit/round2/pr12-after/390x844-dark-edit-guitar.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/390x844-dark-edit-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/390x844-dark-not-score.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/390x844-dark-not-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/390x844-dark-irama.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/390x844-dark-irama-drum-expression.png) |
| 844×390 | light | [sebelum](ui-audit/round2/pr12-after/844x390-light-edit-default.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/844x390-light-edit-default.png) | [sebelum](ui-audit/round2/pr12-after/844x390-light-edit-guitar.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/844x390-light-edit-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/844x390-light-not-score.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/844x390-light-not-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/844x390-light-irama.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/844x390-light-irama-drum-expression.png) |
| 844×390 | dark | [sebelum](ui-audit/round2/pr12-after/844x390-dark-edit-default.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/844x390-dark-edit-default.png) | [sebelum](ui-audit/round2/pr12-after/844x390-dark-edit-guitar.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/844x390-dark-edit-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/844x390-dark-not-score.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/844x390-dark-not-guitar-zone-open.png) | [sebelum](ui-audit/round2/pr12-after/844x390-dark-irama.png) / [sesudah](ui-audit/round2/pr13-16-final-v79/844x390-dark-irama-drum-expression.png) |
