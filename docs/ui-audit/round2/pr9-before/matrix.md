# UI audit matrix

Build: 20261003.74; generated: 2026-10-03T03:51:29.183Z; served from /melodi/.

Chrome is the distance from viewport top to the visible workspace plus any fixed bottom dock. Visible-control count excludes hidden and fully clipped controls, and includes disabled controls. Click-to-reveal counts matching common controls hidden by closed disclosures, panels, hidden ancestors, or CSS visibility rules. Control overlaps exclude parent/child controls and intersections across intentional overlay layers. Canvas-label overlaps compare visible controls against Piano Roll bar/pitch labels, excluding controls inside an open panel or menu overlay. Clipping includes viewport and overflow-ancestor clipping; unreachable clips are targets without a scrollable ancestor.

| Viewport | Theme | State | Screenshot | Chrome px (%) | Visible controls | Visible primary | Click-to-reveal | `<details>` | Control overlaps | Canvas label overlaps | Clipped controls | Unreachable clips |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1920×1080 | light | Edit (Piano Roll default) | [Screenshot](1920x1080-light-edit-default.png) | 177.4 (16.4%) | 25 | 11 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1920×1080 | light | Edit + Guitar layer | — | 177.4 (16.4%) | 28 | 11 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1920×1080 | light | Edit + Chord panel open | — | 177.4 (16.4%) | 35 | 12 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1920×1080 | light | Edit + Generate open with candidates | [Screenshot](1920x1080-light-edit-generate-candidates.png) | 179.5 (16.6%) | 41 | 13 | 30 | 19 | 0 | 0 | 2 | 0 |
| 1920×1080 | light | Edit + Mixer panel open | [Screenshot](1920x1080-light-edit-mixer-panel.png) | 177.4 (16.4%) | 35 | 12 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1920×1080 | light | Not (Score) | — | 174.4 (16.1%) | 20 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | light | Not (Lyrics) | — | 219.2 (20.3%) | 21 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | light | Irama | — | 196.8 (18.2%) | 119 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | light | Project menu open | — | 177.4 (16.4%) | 36 | 18 | 24 | 13 | 0 | 0 | 2 | 0 |
| 1920×1080 | light | Lainnya popover/sheet open | — | 177.4 (16.4%) | 36 | 24 | 18 | 13 | 0 | 0 | 9 | 0 |
| 1920×1080 | dark | Edit (Piano Roll default) | [Screenshot](1920x1080-dark-edit-default.png) | 177.4 (16.4%) | 25 | 11 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1920×1080 | dark | Edit + Guitar layer | — | 177.4 (16.4%) | 28 | 11 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1920×1080 | dark | Edit + Chord panel open | — | 177.4 (16.4%) | 35 | 12 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1920×1080 | dark | Edit + Generate open with candidates | [Screenshot](1920x1080-dark-edit-generate-candidates.png) | 179.5 (16.6%) | 41 | 13 | 30 | 19 | 0 | 0 | 2 | 0 |
| 1920×1080 | dark | Edit + Mixer panel open | [Screenshot](1920x1080-dark-edit-mixer-panel.png) | 177.4 (16.4%) | 35 | 12 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1920×1080 | dark | Not (Score) | — | 174.4 (16.1%) | 20 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Not (Lyrics) | — | 219.2 (20.3%) | 21 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Irama | — | 196.8 (18.2%) | 119 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Project menu open | — | 177.4 (16.4%) | 36 | 18 | 24 | 13 | 0 | 0 | 2 | 0 |
| 1920×1080 | dark | Lainnya popover/sheet open | — | 177.4 (16.4%) | 36 | 24 | 18 | 13 | 0 | 0 | 9 | 0 |
| 1440×900 | light | Edit (Piano Roll default) | [Screenshot](1440x900-light-edit-default.png) | 171 (19%) | 25 | 11 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Edit + Guitar layer | — | 171 (19%) | 28 | 11 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Edit + Chord panel open | — | 171 (19%) | 35 | 12 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Edit + Generate open with candidates | [Screenshot](1440x900-light-edit-generate-candidates.png) | 179.5 (19.9%) | 40 | 13 | 30 | 19 | 0 | 0 | 3 | 0 |
| 1440×900 | light | Edit + Mixer panel open | [Screenshot](1440x900-light-edit-mixer-panel.png) | 171 (19%) | 35 | 12 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Not (Score) | — | 174.4 (19.4%) | 20 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Not (Lyrics) | — | 219.2 (24.4%) | 21 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Irama | — | 196.8 (21.9%) | 119 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Project menu open | — | 171 (19%) | 36 | 18 | 24 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Lainnya popover/sheet open | — | 171 (19%) | 36 | 24 | 18 | 13 | 0 | 0 | 9 | 0 |
| 1440×900 | dark | Edit (Piano Roll default) | [Screenshot](1440x900-dark-edit-default.png) | 171 (19%) | 25 | 11 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Edit + Guitar layer | — | 171 (19%) | 28 | 11 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Edit + Chord panel open | — | 171 (19%) | 35 | 12 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Edit + Generate open with candidates | [Screenshot](1440x900-dark-edit-generate-candidates.png) | 179.5 (19.9%) | 40 | 13 | 30 | 19 | 0 | 0 | 3 | 0 |
| 1440×900 | dark | Edit + Mixer panel open | [Screenshot](1440x900-dark-edit-mixer-panel.png) | 171 (19%) | 35 | 12 | 31 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Not (Score) | — | 174.4 (19.4%) | 20 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Not (Lyrics) | — | 219.2 (24.4%) | 21 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Irama | — | 196.8 (21.9%) | 119 | 6 | 36 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Project menu open | — | 171 (19%) | 36 | 18 | 24 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Lainnya popover/sheet open | — | 171 (19%) | 36 | 24 | 18 | 13 | 0 | 0 | 9 | 0 |
| 1024×768 | light | Edit (Piano Roll default) | [Screenshot](1024x768-light-edit-default.png) | 370.9 (48.3%) | 22 | 9 | 33 | 13 | 2 | 0 | 2 | 0 |
| 1024×768 | light | Edit + Guitar layer | — | 370.9 (48.3%) | 25 | 9 | 33 | 13 | 2 | 0 | 2 | 0 |
| 1024×768 | light | Edit + Chord panel open | — | 370.9 (48.3%) | 32 | 10 | 33 | 13 | 2 | 0 | 3 | 0 |
| 1024×768 | light | Edit + Generate open with candidates | [Screenshot](1024x768-light-edit-generate-candidates.png) | 370.9 (48.3%) | 27 | 11 | 32 | 19 | 2 | 0 | 2 | 0 |
| 1024×768 | light | Edit + Mixer panel open | [Screenshot](1024x768-light-edit-mixer-panel.png) | 370.9 (48.3%) | 29 | 10 | 33 | 13 | 2 | 0 | 3 | 0 |
| 1024×768 | light | Not (Score) | — | 354.3 (46.1%) | 19 | 6 | 36 | 13 | 2 | 0 | 0 | 0 |
| 1024×768 | light | Not (Lyrics) | — | 397 (51.7%) | 20 | 6 | 36 | 13 | 2 | 0 | 2 | 0 |
| 1024×768 | light | Irama | — | 393 (51.2%) | 96 | 6 | 36 | 13 | 2 | 0 | 11 | 0 |
| 1024×768 | light | Project menu open | — | 370.9 (48.3%) | 33 | 16 | 26 | 13 | 3 | 0 | 2 | 0 |
| 1024×768 | light | Lainnya popover/sheet open | — | 370.9 (48.3%) | 31 | 22 | 20 | 13 | 2 | 0 | 3 | 0 |
| 1024×768 | dark | Edit (Piano Roll default) | [Screenshot](1024x768-dark-edit-default.png) | 370.9 (48.3%) | 22 | 9 | 33 | 13 | 2 | 0 | 2 | 0 |
| 1024×768 | dark | Edit + Guitar layer | — | 370.9 (48.3%) | 25 | 9 | 33 | 13 | 2 | 0 | 2 | 0 |
| 1024×768 | dark | Edit + Chord panel open | — | 370.9 (48.3%) | 32 | 10 | 33 | 13 | 2 | 0 | 3 | 0 |
| 1024×768 | dark | Edit + Generate open with candidates | [Screenshot](1024x768-dark-edit-generate-candidates.png) | 370.9 (48.3%) | 27 | 11 | 32 | 19 | 2 | 0 | 2 | 0 |
| 1024×768 | dark | Edit + Mixer panel open | [Screenshot](1024x768-dark-edit-mixer-panel.png) | 370.9 (48.3%) | 29 | 10 | 33 | 13 | 2 | 0 | 3 | 0 |
| 1024×768 | dark | Not (Score) | — | 354.3 (46.1%) | 19 | 6 | 36 | 13 | 2 | 0 | 0 | 0 |
| 1024×768 | dark | Not (Lyrics) | — | 397 (51.7%) | 20 | 6 | 36 | 13 | 2 | 0 | 2 | 0 |
| 1024×768 | dark | Irama | — | 393 (51.2%) | 96 | 6 | 36 | 13 | 2 | 0 | 11 | 0 |
| 1024×768 | dark | Project menu open | — | 370.9 (48.3%) | 33 | 16 | 26 | 13 | 3 | 0 | 2 | 0 |
| 1024×768 | dark | Lainnya popover/sheet open | — | 370.9 (48.3%) | 31 | 22 | 20 | 13 | 2 | 0 | 3 | 0 |
| 390×844 | light | Edit (Piano Roll default) | [Screenshot](390x844-light-edit-default.png) | 179 (21.2%) | 19 | 5 | 37 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | light | Edit + Guitar layer | — | 179 (21.2%) | 25 | 8 | 34 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | light | Edit + Chord panel open | — | 179 (21.2%) | 32 | 9 | 34 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | light | Edit + Generate open with candidates | [Screenshot](390x844-light-edit-generate-candidates.png) | 179 (21.2%) | 28 | 10 | 33 | 19 | 0 | 0 | 3 | 0 |
| 390×844 | light | Edit + Mixer panel open | [Screenshot](390x844-light-edit-mixer-panel.png) | 179 (21.2%) | 29 | 9 | 34 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | light | Not (Score) | — | 185.2 (21.9%) | 15 | 2 | 40 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | light | Not (Lyrics) | — | 192 (22.7%) | 17 | 2 | 40 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | light | Irama | — | 188.7 (22.4%) | 79 | 2 | 40 | 13 | 0 | 0 | 10 | 0 |
| 390×844 | light | Project menu open | — | 179 (21.2%) | 31 | 12 | 30 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | light | Lainnya popover/sheet open | — | 179 (21.2%) | 29 | 21 | 21 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | dark | Edit (Piano Roll default) | [Screenshot](390x844-dark-edit-default.png) | 179 (21.2%) | 19 | 5 | 37 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | dark | Edit + Guitar layer | — | 179 (21.2%) | 25 | 8 | 34 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | dark | Edit + Chord panel open | — | 179 (21.2%) | 32 | 9 | 34 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | dark | Edit + Generate open with candidates | [Screenshot](390x844-dark-edit-generate-candidates.png) | 179 (21.2%) | 28 | 10 | 33 | 19 | 0 | 0 | 3 | 0 |
| 390×844 | dark | Edit + Mixer panel open | [Screenshot](390x844-dark-edit-mixer-panel.png) | 179 (21.2%) | 29 | 9 | 34 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | dark | Not (Score) | — | 185.2 (21.9%) | 15 | 2 | 40 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | dark | Not (Lyrics) | — | 192 (22.7%) | 17 | 2 | 40 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | dark | Irama | — | 188.7 (22.4%) | 79 | 2 | 40 | 13 | 0 | 0 | 10 | 0 |
| 390×844 | dark | Project menu open | — | 179 (21.2%) | 31 | 12 | 30 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | dark | Lainnya popover/sheet open | — | 179 (21.2%) | 29 | 21 | 21 | 13 | 0 | 0 | 3 | 0 |
| 844×390 | light | Edit (Piano Roll default) | [Screenshot](844x390-light-edit-default.png) | 97 (24.9%) | 16 | 5 | 37 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Edit + Guitar layer | — | 97 (24.9%) | 22 | 8 | 34 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Edit + Chord panel open | — | 97 (24.9%) | 28 | 9 | 34 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | light | Edit + Generate open with candidates | [Screenshot](844x390-light-edit-generate-candidates.png) | 97 (24.9%) | 23 | 10 | 33 | 19 | 0 | 0 | 1 | 0 |
| 844×390 | light | Edit + Mixer panel open | [Screenshot](844x390-light-edit-mixer-panel.png) | 97 (24.9%) | 24 | 9 | 34 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | light | Not (Score) | — | 88 (22.6%) | 16 | 3 | 39 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Not (Lyrics) | — | 88 (22.6%) | 16 | 3 | 39 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Irama | — | 88 (22.6%) | 83 | 3 | 39 | 13 | 0 | 0 | 11 | 0 |
| 844×390 | light | Project menu open | — | 97 (24.9%) | 24 | 12 | 30 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | light | Lainnya popover/sheet open | — | 97 (24.9%) | 21 | 21 | 21 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Edit (Piano Roll default) | [Screenshot](844x390-dark-edit-default.png) | 97 (24.9%) | 16 | 5 | 37 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Edit + Guitar layer | — | 97 (24.9%) | 22 | 8 | 34 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Edit + Chord panel open | — | 97 (24.9%) | 28 | 9 | 34 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Edit + Generate open with candidates | [Screenshot](844x390-dark-edit-generate-candidates.png) | 97 (24.9%) | 23 | 10 | 33 | 19 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Edit + Mixer panel open | [Screenshot](844x390-dark-edit-mixer-panel.png) | 97 (24.9%) | 24 | 9 | 34 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Not (Score) | — | 88 (22.6%) | 16 | 3 | 39 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Not (Lyrics) | — | 88 (22.6%) | 16 | 3 | 39 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Irama | — | 88 (22.6%) | 83 | 3 | 39 | 13 | 0 | 0 | 11 | 0 |
| 844×390 | dark | Project menu open | — | 97 (24.9%) | 24 | 12 | 30 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Lainnya popover/sheet open | — | 97 (24.9%) | 21 | 21 | 21 | 13 | 0 | 0 | 1 | 0 |

Cell count: 100/100. Failures: 0.
