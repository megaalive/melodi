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
