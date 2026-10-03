# UI audit matrix

Build: 20261003.79; generated: 2026-10-03T15:50:07.918Z; served from /melodi/.

Chrome is the distance from viewport top to the workspace canvas shell plus any fixed bottom dock; workspace-specific tools inside the shell are measured as controls. Desktop chrome budget is 14% from 68rem, compact and short-landscape budget is 25% through 500px height. Visible-control count excludes hidden and fully clipped controls, and includes disabled controls. Click-to-reveal is the strict total of matching common controls hidden behind closed disclosures, panels, hidden ancestors, CSS visibility rules, or inactive tabpanels. Closed disclosure/panel and inactive-tab columns explain the total; inactive tab content is included even though its tab remains visible. Control overlaps exclude parent/child controls and intersections across intentional overlay layers. Canvas-label overlaps compare visible controls against Piano Roll bar/pitch labels, excluding controls inside an open panel or menu overlay. Clipping includes viewport and overflow-ancestor clipping; unreachable clips are judged per clipped axis against an actually scrollable ancestor.

| Viewport | Theme | State | Screenshot | Chrome px (%) | Budget | Visible controls | Visible primary | Click-to-reveal | Closed disclosure/panel | Inactive tab targets | `<details>` | Control overlaps | Canvas label overlaps | Clipped controls | Unreachable clips | Guitar payload | Drum hits selected | Drum Expression controls | Hit identity | Dual dock bodies | Workspace panel | Drum bar 4 full |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | --- |
| 1920×1080 | light | Edit (Piano Roll default) | [Screenshot](1920x1080-light-edit-default.png) | 114 (10.56%) | 14% | 75 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Edit + Guitar layer | [Screenshot](1920x1080-light-edit-guitar.png) | 114 (10.56%) | 14% | 82 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Edit + Chord panel open | [Screenshot](1920x1080-light-edit-chord-panel.png) | 114 (10.56%) | 14% | 71 | 25 | 18 | 11 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Edit + Generate open with candidates | [Screenshot](1920x1080-light-edit-generate-candidates.png) | 114 (10.56%) | 14% | 83 | 35 | 8 | 1 | 7 | 19 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Edit + Mixer panel open | [Screenshot](1920x1080-light-edit-mixer-panel.png) | 114 (10.56%) | 14% | 70 | 25 | 18 | 11 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Not (Score) | [Screenshot](1920x1080-light-not-score.png) | 126 (11.67%) | 14% | 71 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Not (Lyrics) | [Screenshot](1920x1080-light-not-lyrics.png) | 126 (11.67%) | 14% | 72 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Irama | [Screenshot](1920x1080-light-irama.png) | 126 (11.67%) | 14% | 375 | 32 | 10 | 3 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | yes |
| 1920×1080 | light | Project menu open | [Screenshot](1920x1080-light-project-menu-open.png) | 114 (10.56%) | 14% | 75 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Lainnya popover/sheet open | [Screenshot](1920x1080-light-more-open.png) | 114 (10.56%) | 14% | 75 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Edit + Guitar zone open | [Screenshot](1920x1080-light-edit-guitar-zone-open.png) | 114 (10.56%) | 14% | 82 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Edit + Guitar fretboard | [Screenshot](1920x1080-light-edit-guitar-fretboard.png) | 114 (10.56%) | 14% | 82 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Not + Guitar zone open | [Screenshot](1920x1080-light-not-guitar-zone-open.png) | 126 (11.67%) | 14% | 72 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 1 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1920×1080 | light | Irama + Drum Expression | [Screenshot](1920x1080-light-irama-drum-expression.png) | 126 (11.67%) | 14% | 379 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 1 | 3 | yes | yes | — | yes |
| 1920×1080 | light | Dual dock (when viewport supports it) | [Screenshot](1920x1080-light-dual-dock.png) | 114 (10.56%) | 14% | 75 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | yes | no |
| 1920×1080 | light | Notation dual dock | [Screenshot](1920x1080-light-dual-dock-not.png) | 126 (11.67%) | 14% | 71 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | yes | yes | no |
| 1920×1080 | light | Rhythm dual dock | [Screenshot](1920x1080-light-dual-dock-irama.png) | 126 (11.67%) | 14% | 379 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 1 | 3 | yes | yes | yes | yes |
| 1920×1080 | dark | Edit (Piano Roll default) | [Screenshot](1920x1080-dark-edit-default.png) | 114 (10.56%) | 14% | 75 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Edit + Guitar layer | [Screenshot](1920x1080-dark-edit-guitar.png) | 114 (10.56%) | 14% | 82 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Edit + Chord panel open | [Screenshot](1920x1080-dark-edit-chord-panel.png) | 114 (10.56%) | 14% | 71 | 25 | 18 | 11 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Edit + Generate open with candidates | [Screenshot](1920x1080-dark-edit-generate-candidates.png) | 114 (10.56%) | 14% | 83 | 35 | 8 | 1 | 7 | 19 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Edit + Mixer panel open | [Screenshot](1920x1080-dark-edit-mixer-panel.png) | 114 (10.56%) | 14% | 70 | 25 | 18 | 11 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Not (Score) | [Screenshot](1920x1080-dark-not-score.png) | 126 (11.67%) | 14% | 71 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Not (Lyrics) | [Screenshot](1920x1080-dark-not-lyrics.png) | 126 (11.67%) | 14% | 72 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Irama | [Screenshot](1920x1080-dark-irama.png) | 126 (11.67%) | 14% | 375 | 32 | 10 | 3 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | yes |
| 1920×1080 | dark | Project menu open | [Screenshot](1920x1080-dark-project-menu-open.png) | 114 (10.56%) | 14% | 75 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Lainnya popover/sheet open | [Screenshot](1920x1080-dark-more-open.png) | 114 (10.56%) | 14% | 75 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Edit + Guitar zone open | [Screenshot](1920x1080-dark-edit-guitar-zone-open.png) | 114 (10.56%) | 14% | 82 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Edit + Guitar fretboard | [Screenshot](1920x1080-dark-edit-guitar-fretboard.png) | 114 (10.56%) | 14% | 82 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Not + Guitar zone open | [Screenshot](1920x1080-dark-not-guitar-zone-open.png) | 126 (11.67%) | 14% | 72 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 1 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1920×1080 | dark | Irama + Drum Expression | [Screenshot](1920x1080-dark-irama-drum-expression.png) | 126 (11.67%) | 14% | 379 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 1 | 3 | yes | yes | — | yes |
| 1920×1080 | dark | Dual dock (when viewport supports it) | [Screenshot](1920x1080-dark-dual-dock.png) | 114 (10.56%) | 14% | 75 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | yes | no |
| 1920×1080 | dark | Notation dual dock | [Screenshot](1920x1080-dark-dual-dock-not.png) | 126 (11.67%) | 14% | 71 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | yes | yes | no |
| 1920×1080 | dark | Rhythm dual dock | [Screenshot](1920x1080-dark-dual-dock-irama.png) | 126 (11.67%) | 14% | 379 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 1 | 3 | yes | yes | yes | yes |
| 1440×900 | light | Edit (Piano Roll default) | [Screenshot](1440x900-light-edit-default.png) | 114 (12.67%) | 14% | 72 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Edit + Guitar layer | [Screenshot](1440x900-light-edit-guitar.png) | 114 (12.67%) | 14% | 79 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Edit + Chord panel open | [Screenshot](1440x900-light-edit-chord-panel.png) | 114 (12.67%) | 14% | 70 | 25 | 18 | 11 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Edit + Generate open with candidates | [Screenshot](1440x900-light-edit-generate-candidates.png) | 114 (12.67%) | 14% | 77 | 35 | 8 | 1 | 7 | 19 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Edit + Mixer panel open | [Screenshot](1440x900-light-edit-mixer-panel.png) | 114 (12.67%) | 14% | 67 | 25 | 18 | 11 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Not (Score) | [Screenshot](1440x900-light-not-score.png) | 126 (14.00%) | 14% | 66 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Not (Lyrics) | [Screenshot](1440x900-light-not-lyrics.png) | 126 (14.00%) | 14% | 67 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Irama | [Screenshot](1440x900-light-irama.png) | 126 (14.00%) | 14% | 373 | 32 | 10 | 3 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | yes |
| 1440×900 | light | Project menu open | [Screenshot](1440x900-light-project-menu-open.png) | 114 (12.67%) | 14% | 72 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Lainnya popover/sheet open | [Screenshot](1440x900-light-more-open.png) | 114 (12.67%) | 14% | 72 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Edit + Guitar zone open | [Screenshot](1440x900-light-edit-guitar-zone-open.png) | 114 (12.67%) | 14% | 79 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Edit + Guitar fretboard | [Screenshot](1440x900-light-edit-guitar-fretboard.png) | 114 (12.67%) | 14% | 79 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Not + Guitar zone open | [Screenshot](1440x900-light-not-guitar-zone-open.png) | 126 (14.00%) | 14% | 67 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1440×900 | light | Irama + Drum Expression | [Screenshot](1440x900-light-irama-drum-expression.png) | 126 (14.00%) | 14% | 379 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 1 | 3 | yes | yes | — | yes |
| 1440×900 | light | Dual dock (when viewport supports it) | [Screenshot](1440x900-light-dual-dock.png) | 114 (12.67%) | 14% | 72 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | yes | no |
| 1440×900 | light | Notation dual dock | [Screenshot](1440x900-light-dual-dock-not.png) | 126 (14.00%) | 14% | 66 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | yes | no |
| 1440×900 | light | Rhythm dual dock | [Screenshot](1440x900-light-dual-dock-irama.png) | 126 (14.00%) | 14% | 379 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 1 | 3 | yes | yes | yes | yes |
| 1440×900 | dark | Edit (Piano Roll default) | [Screenshot](1440x900-dark-edit-default.png) | 114 (12.67%) | 14% | 72 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Edit + Guitar layer | [Screenshot](1440x900-dark-edit-guitar.png) | 114 (12.67%) | 14% | 79 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Edit + Chord panel open | [Screenshot](1440x900-dark-edit-chord-panel.png) | 114 (12.67%) | 14% | 70 | 25 | 18 | 11 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Edit + Generate open with candidates | [Screenshot](1440x900-dark-edit-generate-candidates.png) | 114 (12.67%) | 14% | 77 | 35 | 8 | 1 | 7 | 19 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Edit + Mixer panel open | [Screenshot](1440x900-dark-edit-mixer-panel.png) | 114 (12.67%) | 14% | 67 | 25 | 18 | 11 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Not (Score) | [Screenshot](1440x900-dark-not-score.png) | 126 (14.00%) | 14% | 66 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Not (Lyrics) | [Screenshot](1440x900-dark-not-lyrics.png) | 126 (14.00%) | 14% | 67 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Irama | [Screenshot](1440x900-dark-irama.png) | 126 (14.00%) | 14% | 373 | 32 | 10 | 3 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | yes |
| 1440×900 | dark | Project menu open | [Screenshot](1440x900-dark-project-menu-open.png) | 114 (12.67%) | 14% | 72 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Lainnya popover/sheet open | [Screenshot](1440x900-dark-more-open.png) | 114 (12.67%) | 14% | 72 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Edit + Guitar zone open | [Screenshot](1440x900-dark-edit-guitar-zone-open.png) | 114 (12.67%) | 14% | 79 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Edit + Guitar fretboard | [Screenshot](1440x900-dark-edit-guitar-fretboard.png) | 114 (12.67%) | 14% | 79 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Not + Guitar zone open | [Screenshot](1440x900-dark-not-guitar-zone-open.png) | 126 (14.00%) | 14% | 67 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | yes | — | no |
| 1440×900 | dark | Irama + Drum Expression | [Screenshot](1440x900-dark-irama-drum-expression.png) | 126 (14.00%) | 14% | 379 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 1 | 3 | yes | yes | — | yes |
| 1440×900 | dark | Dual dock (when viewport supports it) | [Screenshot](1440x900-dark-dual-dock.png) | 114 (12.67%) | 14% | 72 | 35 | 8 | 1 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | yes | no |
| 1440×900 | dark | Notation dual dock | [Screenshot](1440x900-dark-dual-dock-not.png) | 126 (14.00%) | 14% | 66 | 33 | 10 | 3 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | yes | yes | no |
| 1440×900 | dark | Rhythm dual dock | [Screenshot](1440x900-dark-dual-dock-irama.png) | 126 (14.00%) | 14% | 379 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 1 | 3 | yes | yes | yes | yes |
| 1280×900 | light | Edit (Piano Roll default) | [Screenshot](1280x900-light-edit-default.png) | 114 (12.67%) | 14% | 60 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 3 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | light | Edit + Chord panel open | [Screenshot](1280x900-light-edit-chord-panel.png) | 114 (12.67%) | 14% | 60 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 3 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | light | Edit + Generate open with candidates | [Screenshot](1280x900-light-edit-generate-candidates.png) | 114 (12.67%) | 14% | 60 | 36 | 7 | 0 | 7 | 19 | 0 | 0 | 4 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | light | Edit + Mixer panel open | [Screenshot](1280x900-light-edit-mixer-panel.png) | 114 (12.67%) | 14% | 59 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 3 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | light | Not (Score) | [Screenshot](1280x900-light-not-score.png) | 126 (14.00%) | 14% | 58 | 23 | 20 | 13 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | light | Not (Lyrics) | [Screenshot](1280x900-light-not-lyrics.png) | 126 (14.00%) | 14% | 59 | 23 | 20 | 13 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | light | Irama | [Screenshot](1280x900-light-irama.png) | 126 (14.00%) | 14% | 362 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | — | yes |
| 1280×900 | light | Dual dock (when viewport supports it) | [Screenshot](1280x900-light-dual-dock.png) | 114 (12.67%) | 14% | 60 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 3 | 0 | no | 0 | 0 | — | no | yes | no |
| 1280×900 | light | Notation dual dock | [Screenshot](1280x900-light-dual-dock-not.png) | 126 (14.00%) | 14% | 58 | 23 | 20 | 13 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | yes | no |
| 1280×900 | light | Rhythm dual dock | [Screenshot](1280x900-light-dual-dock-irama.png) | 126 (14.00%) | 14% | 370 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 1 | 0 | no | 1 | 3 | yes | no | yes | yes |
| 1280×900 | dark | Edit (Piano Roll default) | [Screenshot](1280x900-dark-edit-default.png) | 114 (12.67%) | 14% | 60 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 3 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | dark | Edit + Chord panel open | [Screenshot](1280x900-dark-edit-chord-panel.png) | 114 (12.67%) | 14% | 60 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 3 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | dark | Edit + Generate open with candidates | [Screenshot](1280x900-dark-edit-generate-candidates.png) | 114 (12.67%) | 14% | 60 | 36 | 7 | 0 | 7 | 19 | 0 | 0 | 4 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | dark | Edit + Mixer panel open | [Screenshot](1280x900-dark-edit-mixer-panel.png) | 114 (12.67%) | 14% | 59 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 3 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | dark | Not (Score) | [Screenshot](1280x900-dark-not-score.png) | 126 (14.00%) | 14% | 58 | 23 | 20 | 13 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | dark | Not (Lyrics) | [Screenshot](1280x900-dark-not-lyrics.png) | 126 (14.00%) | 14% | 59 | 23 | 20 | 13 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | — | no |
| 1280×900 | dark | Irama | [Screenshot](1280x900-dark-irama.png) | 126 (14.00%) | 14% | 362 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | — | yes |
| 1280×900 | dark | Dual dock (when viewport supports it) | [Screenshot](1280x900-dark-dual-dock.png) | 114 (12.67%) | 14% | 60 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 3 | 0 | no | 0 | 0 | — | no | yes | no |
| 1280×900 | dark | Notation dual dock | [Screenshot](1280x900-dark-dual-dock-not.png) | 126 (14.00%) | 14% | 58 | 23 | 20 | 13 | 7 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | yes | no |
| 1280×900 | dark | Rhythm dual dock | [Screenshot](1280x900-dark-dual-dock-irama.png) | 126 (14.00%) | 14% | 370 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 1 | 0 | no | 1 | 3 | yes | no | yes | yes |
| 1440×799 | light | Edit (Piano Roll default) | [Screenshot](1440x799-light-edit-default.png) | 108 (13.52%) | 14% | 68 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 1440×799 | light | Edit + Guitar zone open | [Screenshot](1440x799-light-edit-guitar-zone-open.png) | 108 (13.52%) | 14% | 75 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 1440×799 | light | Dual dock (when viewport supports it) | [Screenshot](1440x799-light-dual-dock.png) | 108 (13.52%) | 14% | 68 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | yes | no |
| 1440×799 | light | Notation dual dock | [Screenshot](1440x799-light-dual-dock-not.png) | 108 (13.52%) | 14% | 63 | 23 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | yes | no |
| 1440×799 | light | Rhythm dual dock | [Screenshot](1440x799-light-dual-dock-irama.png) | 108 (13.52%) | 14% | 375 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 1 | 3 | yes | no | yes | yes |
| 1440×799 | dark | Edit (Piano Roll default) | [Screenshot](1440x799-dark-edit-default.png) | 108 (13.52%) | 14% | 68 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 1440×799 | dark | Edit + Guitar zone open | [Screenshot](1440x799-dark-edit-guitar-zone-open.png) | 108 (13.52%) | 14% | 75 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 1440×799 | dark | Dual dock (when viewport supports it) | [Screenshot](1440x799-dark-dual-dock.png) | 108 (13.52%) | 14% | 68 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | yes | no |
| 1440×799 | dark | Notation dual dock | [Screenshot](1440x799-dark-dual-dock-not.png) | 108 (13.52%) | 14% | 63 | 23 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | yes | no |
| 1440×799 | dark | Rhythm dual dock | [Screenshot](1440x799-dark-dual-dock-irama.png) | 108 (13.52%) | 14% | 375 | 22 | 20 | 13 | 7 | 13 | 0 | 0 | 0 | 0 | no | 1 | 3 | yes | no | yes | yes |
| 1024×768 | light | Edit (Piano Roll default) | [Screenshot](1024x768-light-edit-default.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | light | Edit + Guitar layer | [Screenshot](1024x768-light-edit-guitar.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 1024×768 | light | Edit + Chord panel open | [Screenshot](1024x768-light-edit-chord-panel.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | light | Edit + Generate open with candidates | [Screenshot](1024x768-light-edit-generate-candidates.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 19 | 0 | 0 | 3 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | light | Edit + Mixer panel open | [Screenshot](1024x768-light-edit-mixer-panel.png) | 145 (18.88%) | — | 40 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | light | Not (Score) | [Screenshot](1024x768-light-not-score.png) | 138 (17.97%) | — | 37 | 16 | 27 | 20 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | light | Not (Lyrics) | [Screenshot](1024x768-light-not-lyrics.png) | 138 (17.97%) | — | 38 | 16 | 27 | 20 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | light | Irama | [Screenshot](1024x768-light-irama.png) | 138 (17.97%) | — | 152 | 15 | 27 | 20 | 7 | 13 | 0 | 0 | 10 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | light | Project menu open | [Screenshot](1024x768-light-project-menu-open.png) | 145 (18.88%) | — | 49 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | light | Lainnya popover/sheet open | [Screenshot](1024x768-light-more-open.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | light | Edit + Guitar zone open | [Screenshot](1024x768-light-edit-guitar-zone-open.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 1024×768 | light | Edit + Guitar fretboard | [Screenshot](1024x768-light-edit-guitar-fretboard.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 1024×768 | light | Not + Guitar zone open | [Screenshot](1024x768-light-not-guitar-zone-open.png) | 138 (17.97%) | — | 38 | 16 | 27 | 20 | 7 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 1024×768 | light | Irama + Drum Expression | [Screenshot](1024x768-light-irama-drum-expression.png) | 138 (17.97%) | — | 160 | 15 | 27 | 20 | 7 | 13 | 0 | 0 | 10 | 0 | no | 1 | 3 | yes | no | — | no |
| 1024×768 | light | Dual dock (when viewport supports it) | [Screenshot](1024x768-light-dual-dock.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | light | Notation dual dock | [Screenshot](1024x768-light-dual-dock-not.png) | 138 (17.97%) | — | 37 | 16 | 27 | 20 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | light | Rhythm dual dock | [Screenshot](1024x768-light-dual-dock-irama.png) | 138 (17.97%) | — | 160 | 15 | 27 | 20 | 7 | 13 | 0 | 0 | 10 | 0 | no | 1 | 3 | yes | no | — | no |
| 1024×768 | dark | Edit (Piano Roll default) | [Screenshot](1024x768-dark-edit-default.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Edit + Guitar layer | [Screenshot](1024x768-dark-edit-guitar.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Edit + Chord panel open | [Screenshot](1024x768-dark-edit-chord-panel.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Edit + Generate open with candidates | [Screenshot](1024x768-dark-edit-generate-candidates.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 19 | 0 | 0 | 3 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Edit + Mixer panel open | [Screenshot](1024x768-dark-edit-mixer-panel.png) | 145 (18.88%) | — | 40 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Not (Score) | [Screenshot](1024x768-dark-not-score.png) | 138 (17.97%) | — | 37 | 16 | 27 | 20 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Not (Lyrics) | [Screenshot](1024x768-dark-not-lyrics.png) | 138 (17.97%) | — | 38 | 16 | 27 | 20 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Irama | [Screenshot](1024x768-dark-irama.png) | 138 (17.97%) | — | 152 | 15 | 27 | 20 | 7 | 13 | 0 | 0 | 10 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Project menu open | [Screenshot](1024x768-dark-project-menu-open.png) | 145 (18.88%) | — | 49 | 26 | 17 | 10 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Lainnya popover/sheet open | [Screenshot](1024x768-dark-more-open.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Edit + Guitar zone open | [Screenshot](1024x768-dark-edit-guitar-zone-open.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Edit + Guitar fretboard | [Screenshot](1024x768-dark-edit-guitar-fretboard.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Not + Guitar zone open | [Screenshot](1024x768-dark-not-guitar-zone-open.png) | 138 (17.97%) | — | 38 | 16 | 27 | 20 | 7 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Irama + Drum Expression | [Screenshot](1024x768-dark-irama-drum-expression.png) | 138 (17.97%) | — | 160 | 15 | 27 | 20 | 7 | 13 | 0 | 0 | 10 | 0 | no | 1 | 3 | yes | no | — | no |
| 1024×768 | dark | Dual dock (when viewport supports it) | [Screenshot](1024x768-dark-dual-dock.png) | 145 (18.88%) | — | 39 | 19 | 24 | 17 | 7 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Notation dual dock | [Screenshot](1024x768-dark-dual-dock-not.png) | 138 (17.97%) | — | 37 | 16 | 27 | 20 | 7 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 1024×768 | dark | Rhythm dual dock | [Screenshot](1024x768-dark-dual-dock-irama.png) | 138 (17.97%) | — | 160 | 15 | 27 | 20 | 7 | 13 | 0 | 0 | 10 | 0 | no | 1 | 3 | yes | no | — | no |
| 390×844 | light | Edit (Piano Roll default) | [Screenshot](390x844-light-edit-default.png) | 133 (15.76%) | 25% | 19 | 6 | 36 | 36 | 0 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | light | Edit + Guitar layer | [Screenshot](390x844-light-edit-guitar.png) | 133 (15.76%) | 25% | 19 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 390×844 | light | Edit + Chord panel open | [Screenshot](390x844-light-edit-chord-panel.png) | 133 (15.76%) | 25% | 29 | 7 | 36 | 22 | 14 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | light | Edit + Generate open with candidates | [Screenshot](390x844-light-edit-generate-candidates.png) | 133 (15.76%) | 25% | 27 | 7 | 36 | 22 | 14 | 19 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | light | Edit + Mixer panel open | [Screenshot](390x844-light-edit-mixer-panel.png) | 133 (15.76%) | 25% | 26 | 7 | 36 | 22 | 14 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | light | Not (Score) | [Screenshot](390x844-light-not-score.png) | 133 (15.76%) | 25% | 18 | 4 | 38 | 38 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | light | Not (Lyrics) | [Screenshot](390x844-light-not-lyrics.png) | 133 (15.76%) | 25% | 20 | 4 | 38 | 38 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | light | Irama | [Screenshot](390x844-light-irama.png) | 133 (15.76%) | 25% | 83 | 4 | 38 | 38 | 0 | 13 | 0 | 0 | 10 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | light | Project menu open | [Screenshot](390x844-light-project-menu-open.png) | 133 (15.76%) | 25% | 31 | 13 | 29 | 29 | 0 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | light | Lainnya popover/sheet open | [Screenshot](390x844-light-more-open.png) | 133 (15.76%) | 25% | 24 | 8 | 34 | 34 | 0 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | light | Edit + Guitar zone open | [Screenshot](390x844-light-edit-guitar-zone-open.png) | 133 (15.76%) | 25% | 19 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 390×844 | light | Edit + Guitar fretboard | [Screenshot](390x844-light-edit-guitar-fretboard.png) | 133 (15.76%) | 25% | 19 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 390×844 | light | Not + Guitar zone open | [Screenshot](390x844-light-not-guitar-zone-open.png) | 133 (15.76%) | 25% | 21 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 390×844 | light | Irama + Drum Expression | [Screenshot](390x844-light-irama-drum-expression.png) | 133 (15.76%) | 25% | 92 | 4 | 38 | 24 | 14 | 13 | 0 | 0 | 10 | 0 | no | 1 | 3 | yes | no | — | no |
| 390×844 | light | Dual dock (when viewport supports it) | [Screenshot](390x844-light-dual-dock.png) | 133 (15.76%) | 25% | 19 | 6 | 36 | 36 | 0 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | light | Notation dual dock | [Screenshot](390x844-light-dual-dock-not.png) | 133 (15.76%) | 25% | 18 | 4 | 38 | 38 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | light | Rhythm dual dock | [Screenshot](390x844-light-dual-dock-irama.png) | 133 (15.76%) | 25% | 92 | 4 | 38 | 24 | 14 | 13 | 0 | 0 | 10 | 0 | no | 1 | 3 | yes | no | — | no |
| 390×844 | dark | Edit (Piano Roll default) | [Screenshot](390x844-dark-edit-default.png) | 133 (15.76%) | 25% | 19 | 6 | 36 | 36 | 0 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | dark | Edit + Guitar layer | [Screenshot](390x844-dark-edit-guitar.png) | 133 (15.76%) | 25% | 19 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 390×844 | dark | Edit + Chord panel open | [Screenshot](390x844-dark-edit-chord-panel.png) | 133 (15.76%) | 25% | 29 | 7 | 36 | 22 | 14 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | dark | Edit + Generate open with candidates | [Screenshot](390x844-dark-edit-generate-candidates.png) | 133 (15.76%) | 25% | 27 | 7 | 36 | 22 | 14 | 19 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | dark | Edit + Mixer panel open | [Screenshot](390x844-dark-edit-mixer-panel.png) | 133 (15.76%) | 25% | 26 | 7 | 36 | 22 | 14 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | dark | Not (Score) | [Screenshot](390x844-dark-not-score.png) | 133 (15.76%) | 25% | 18 | 4 | 38 | 38 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | dark | Not (Lyrics) | [Screenshot](390x844-dark-not-lyrics.png) | 133 (15.76%) | 25% | 20 | 4 | 38 | 38 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | dark | Irama | [Screenshot](390x844-dark-irama.png) | 133 (15.76%) | 25% | 83 | 4 | 38 | 38 | 0 | 13 | 0 | 0 | 10 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | dark | Project menu open | [Screenshot](390x844-dark-project-menu-open.png) | 133 (15.76%) | 25% | 31 | 13 | 29 | 29 | 0 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | dark | Lainnya popover/sheet open | [Screenshot](390x844-dark-more-open.png) | 133 (15.76%) | 25% | 24 | 8 | 34 | 34 | 0 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | dark | Edit + Guitar zone open | [Screenshot](390x844-dark-edit-guitar-zone-open.png) | 133 (15.76%) | 25% | 19 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 390×844 | dark | Edit + Guitar fretboard | [Screenshot](390x844-dark-edit-guitar-fretboard.png) | 133 (15.76%) | 25% | 19 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 2 | 0 | yes | 0 | 0 | — | no | — | no |
| 390×844 | dark | Not + Guitar zone open | [Screenshot](390x844-dark-not-guitar-zone-open.png) | 133 (15.76%) | 25% | 21 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 390×844 | dark | Irama + Drum Expression | [Screenshot](390x844-dark-irama-drum-expression.png) | 133 (15.76%) | 25% | 92 | 4 | 38 | 24 | 14 | 13 | 0 | 0 | 10 | 0 | no | 1 | 3 | yes | no | — | no |
| 390×844 | dark | Dual dock (when viewport supports it) | [Screenshot](390x844-dark-dual-dock.png) | 133 (15.76%) | 25% | 19 | 6 | 36 | 36 | 0 | 13 | 0 | 0 | 2 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | dark | Notation dual dock | [Screenshot](390x844-dark-dual-dock-not.png) | 133 (15.76%) | 25% | 18 | 4 | 38 | 38 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 390×844 | dark | Rhythm dual dock | [Screenshot](390x844-dark-dual-dock-irama.png) | 133 (15.76%) | 25% | 92 | 4 | 38 | 24 | 14 | 13 | 0 | 0 | 10 | 0 | no | 1 | 3 | yes | no | — | no |
| 844×390 | light | Edit (Piano Roll default) | [Screenshot](844x390-light-edit-default.png) | 88 (22.56%) | 25% | 22 | 10 | 32 | 32 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | light | Edit + Guitar layer | [Screenshot](844x390-light-edit-guitar.png) | 88 (22.56%) | 25% | 22 | 6 | 36 | 36 | 0 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 844×390 | light | Edit + Chord panel open | [Screenshot](844x390-light-edit-chord-panel.png) | 88 (22.56%) | 25% | 31 | 11 | 32 | 18 | 14 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | light | Edit + Generate open with candidates | [Screenshot](844x390-light-edit-generate-candidates.png) | 88 (22.56%) | 25% | 26 | 11 | 32 | 18 | 14 | 19 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | light | Edit + Mixer panel open | [Screenshot](844x390-light-edit-mixer-panel.png) | 88 (22.56%) | 25% | 28 | 11 | 32 | 18 | 14 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | light | Not (Score) | [Screenshot](844x390-light-not-score.png) | 88 (22.56%) | 25% | 19 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | light | Not (Lyrics) | [Screenshot](844x390-light-not-lyrics.png) | 88 (22.56%) | 25% | 19 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | light | Irama | [Screenshot](844x390-light-irama.png) | 88 (22.56%) | 25% | 129 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 24 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | light | Project menu open | [Screenshot](844x390-light-project-menu-open.png) | 88 (22.56%) | 25% | 30 | 17 | 25 | 25 | 0 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | light | Lainnya popover/sheet open | [Screenshot](844x390-light-more-open.png) | 88 (22.56%) | 25% | 25 | 11 | 31 | 31 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | light | Edit + Guitar zone open | [Screenshot](844x390-light-edit-guitar-zone-open.png) | 88 (22.56%) | 25% | 22 | 6 | 36 | 36 | 0 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 844×390 | light | Edit + Guitar fretboard | [Screenshot](844x390-light-edit-guitar-fretboard.png) | 88 (22.56%) | 25% | 22 | 6 | 36 | 36 | 0 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 844×390 | light | Not + Guitar zone open | [Screenshot](844x390-light-not-guitar-zone-open.png) | 88 (22.56%) | 25% | 22 | 3 | 39 | 39 | 0 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 844×390 | light | Irama + Drum Expression | [Screenshot](844x390-light-irama-drum-expression.png) | 88 (22.56%) | 25% | 120 | 5 | 37 | 23 | 14 | 13 | 0 | 0 | 23 | 0 | no | 1 | 3 | yes | no | — | no |
| 844×390 | light | Dual dock (when viewport supports it) | [Screenshot](844x390-light-dual-dock.png) | 88 (22.56%) | 25% | 22 | 10 | 32 | 32 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | light | Notation dual dock | [Screenshot](844x390-light-dual-dock-not.png) | 88 (22.56%) | 25% | 19 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | light | Rhythm dual dock | [Screenshot](844x390-light-dual-dock-irama.png) | 88 (22.56%) | 25% | 120 | 5 | 37 | 23 | 14 | 13 | 0 | 0 | 23 | 0 | no | 1 | 3 | yes | no | — | no |
| 844×390 | dark | Edit (Piano Roll default) | [Screenshot](844x390-dark-edit-default.png) | 88 (22.56%) | 25% | 22 | 10 | 32 | 32 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | dark | Edit + Guitar layer | [Screenshot](844x390-dark-edit-guitar.png) | 88 (22.56%) | 25% | 22 | 6 | 36 | 36 | 0 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 844×390 | dark | Edit + Chord panel open | [Screenshot](844x390-dark-edit-chord-panel.png) | 88 (22.56%) | 25% | 31 | 11 | 32 | 18 | 14 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | dark | Edit + Generate open with candidates | [Screenshot](844x390-dark-edit-generate-candidates.png) | 88 (22.56%) | 25% | 26 | 11 | 32 | 18 | 14 | 19 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | dark | Edit + Mixer panel open | [Screenshot](844x390-dark-edit-mixer-panel.png) | 88 (22.56%) | 25% | 28 | 11 | 32 | 18 | 14 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | dark | Not (Score) | [Screenshot](844x390-dark-not-score.png) | 88 (22.56%) | 25% | 19 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | dark | Not (Lyrics) | [Screenshot](844x390-dark-not-lyrics.png) | 88 (22.56%) | 25% | 19 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | dark | Irama | [Screenshot](844x390-dark-irama.png) | 88 (22.56%) | 25% | 129 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 24 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | dark | Project menu open | [Screenshot](844x390-dark-project-menu-open.png) | 88 (22.56%) | 25% | 30 | 17 | 25 | 25 | 0 | 13 | 0 | 0 | 1 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | dark | Lainnya popover/sheet open | [Screenshot](844x390-dark-more-open.png) | 88 (22.56%) | 25% | 25 | 11 | 31 | 31 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | dark | Edit + Guitar zone open | [Screenshot](844x390-dark-edit-guitar-zone-open.png) | 88 (22.56%) | 25% | 22 | 6 | 36 | 36 | 0 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 844×390 | dark | Edit + Guitar fretboard | [Screenshot](844x390-dark-edit-guitar-fretboard.png) | 88 (22.56%) | 25% | 22 | 6 | 36 | 36 | 0 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 844×390 | dark | Not + Guitar zone open | [Screenshot](844x390-dark-not-guitar-zone-open.png) | 88 (22.56%) | 25% | 22 | 3 | 39 | 39 | 0 | 13 | 0 | 0 | 0 | 0 | yes | 0 | 0 | — | no | — | no |
| 844×390 | dark | Irama + Drum Expression | [Screenshot](844x390-dark-irama-drum-expression.png) | 88 (22.56%) | 25% | 120 | 5 | 37 | 23 | 14 | 13 | 0 | 0 | 23 | 0 | no | 1 | 3 | yes | no | — | no |
| 844×390 | dark | Dual dock (when viewport supports it) | [Screenshot](844x390-dark-dual-dock.png) | 88 (22.56%) | 25% | 22 | 10 | 32 | 32 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | dark | Notation dual dock | [Screenshot](844x390-dark-dual-dock-not.png) | 88 (22.56%) | 25% | 19 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 0 | 0 | no | 0 | 0 | — | no | — | no |
| 844×390 | dark | Rhythm dual dock | [Screenshot](844x390-dark-dual-dock-irama.png) | 88 (22.56%) | 25% | 120 | 5 | 37 | 23 | 14 | 13 | 0 | 0 | 23 | 0 | no | 1 | 3 | yes | no | — | no |

Cell count: 200/200. Failures: 0.
