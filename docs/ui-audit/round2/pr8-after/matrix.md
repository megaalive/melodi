# UI audit matrix

Build: 20261003.74; generated: 2026-10-03T02:47:51.130Z; served from /melodi/.

Chrome is the distance from viewport top to the visible workspace plus any fixed bottom dock. Visible-control count excludes hidden and fully clipped controls, and includes disabled controls. Control overlaps exclude parent/child controls and intersections across intentional overlay layers. Canvas-label overlaps compare visible controls against Piano Roll bar/pitch labels, excluding controls inside an open panel or menu overlay. Clipping includes viewport and overflow-ancestor clipping; unreachable clips are targets without a scrollable ancestor.

| Viewport | Theme | State | Screenshot | Chrome px (%) | Visible controls | `<details>` | Control overlaps | Canvas label overlaps | Clipped controls | Unreachable clips |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1440×900 | light | Edit (Piano Roll default) | [Screenshot](1440x900-light-edit-default.png) | 171 (19%) | 25 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Edit + Guitar layer | [Screenshot](1440x900-light-edit-guitar.png) | 171 (19%) | 28 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Edit + Chord panel open | [Screenshot](1440x900-light-edit-chord-panel.png) | 171 (19%) | 35 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Edit + Generate open with candidates | [Screenshot](1440x900-light-edit-generate-candidates.png) | 179.5 (19.9%) | 40 | 19 | 0 | 0 | 3 | 0 |
| 1440×900 | light | Edit + Mixer panel open | [Screenshot](1440x900-light-edit-mixer-panel.png) | 171 (19%) | 35 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Not (Score) | [Screenshot](1440x900-light-not-score.png) | 174.4 (19.4%) | 20 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Not (Lyrics) | [Screenshot](1440x900-light-not-lyrics.png) | 219.2 (24.4%) | 21 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Irama | [Screenshot](1440x900-light-irama.png) | 196.8 (21.9%) | 119 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Project menu open | [Screenshot](1440x900-light-project-menu-open.png) | 171 (19%) | 36 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Lainnya popover/sheet open | [Screenshot](1440x900-light-more-open.png) | 171 (19%) | 36 | 13 | 0 | 0 | 9 | 0 |
| 1440×900 | dark | Edit (Piano Roll default) | [Screenshot](1440x900-dark-edit-default.png) | 171 (19%) | 25 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Edit + Guitar layer | [Screenshot](1440x900-dark-edit-guitar.png) | 171 (19%) | 28 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Edit + Chord panel open | [Screenshot](1440x900-dark-edit-chord-panel.png) | 171 (19%) | 35 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Edit + Generate open with candidates | [Screenshot](1440x900-dark-edit-generate-candidates.png) | 179.5 (19.9%) | 40 | 19 | 0 | 0 | 3 | 0 |
| 1440×900 | dark | Edit + Mixer panel open | [Screenshot](1440x900-dark-edit-mixer-panel.png) | 171 (19%) | 35 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Not (Score) | [Screenshot](1440x900-dark-not-score.png) | 174.4 (19.4%) | 20 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Not (Lyrics) | [Screenshot](1440x900-dark-not-lyrics.png) | 219.2 (24.4%) | 21 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Irama | [Screenshot](1440x900-dark-irama.png) | 196.8 (21.9%) | 119 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Project menu open | [Screenshot](1440x900-dark-project-menu-open.png) | 171 (19%) | 36 | 13 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Lainnya popover/sheet open | [Screenshot](1440x900-dark-more-open.png) | 171 (19%) | 36 | 13 | 0 | 0 | 9 | 0 |
| 390×844 | light | Edit (Piano Roll default) | [Screenshot](390x844-light-edit-default.png) | 179 (21.2%) | 19 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | light | Edit + Guitar layer | [Screenshot](390x844-light-edit-guitar.png) | 179 (21.2%) | 25 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | light | Edit + Chord panel open | [Screenshot](390x844-light-edit-chord-panel.png) | 179 (21.2%) | 32 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | light | Edit + Generate open with candidates | [Screenshot](390x844-light-edit-generate-candidates.png) | 179 (21.2%) | 28 | 19 | 0 | 0 | 3 | 0 |
| 390×844 | light | Edit + Mixer panel open | [Screenshot](390x844-light-edit-mixer-panel.png) | 179 (21.2%) | 29 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | light | Not (Score) | [Screenshot](390x844-light-not-score.png) | 185.2 (21.9%) | 15 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | light | Not (Lyrics) | [Screenshot](390x844-light-not-lyrics.png) | 192 (22.7%) | 17 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | light | Irama | [Screenshot](390x844-light-irama.png) | 188.7 (22.4%) | 79 | 13 | 0 | 0 | 10 | 0 |
| 390×844 | light | Project menu open | [Screenshot](390x844-light-project-menu-open.png) | 179 (21.2%) | 31 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | light | Lainnya popover/sheet open | [Screenshot](390x844-light-more-open.png) | 179 (21.2%) | 29 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | dark | Edit (Piano Roll default) | [Screenshot](390x844-dark-edit-default.png) | 179 (21.2%) | 19 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | dark | Edit + Guitar layer | [Screenshot](390x844-dark-edit-guitar.png) | 179 (21.2%) | 25 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | dark | Edit + Chord panel open | [Screenshot](390x844-dark-edit-chord-panel.png) | 179 (21.2%) | 32 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | dark | Edit + Generate open with candidates | [Screenshot](390x844-dark-edit-generate-candidates.png) | 179 (21.2%) | 28 | 19 | 0 | 0 | 3 | 0 |
| 390×844 | dark | Edit + Mixer panel open | [Screenshot](390x844-dark-edit-mixer-panel.png) | 179 (21.2%) | 29 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | dark | Not (Score) | [Screenshot](390x844-dark-not-score.png) | 185.2 (21.9%) | 15 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | dark | Not (Lyrics) | [Screenshot](390x844-dark-not-lyrics.png) | 192 (22.7%) | 17 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | dark | Irama | [Screenshot](390x844-dark-irama.png) | 188.7 (22.4%) | 79 | 13 | 0 | 0 | 10 | 0 |
| 390×844 | dark | Project menu open | [Screenshot](390x844-dark-project-menu-open.png) | 179 (21.2%) | 31 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | dark | Lainnya popover/sheet open | [Screenshot](390x844-dark-more-open.png) | 179 (21.2%) | 29 | 13 | 0 | 0 | 3 | 0 |
| 844×390 | light | Edit (Piano Roll default) | [Screenshot](844x390-light-edit-default.png) | 97 (24.9%) | 16 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Edit + Guitar layer | [Screenshot](844x390-light-edit-guitar.png) | 97 (24.9%) | 22 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Edit + Chord panel open | [Screenshot](844x390-light-edit-chord-panel.png) | 97 (24.9%) | 28 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | light | Edit + Generate open with candidates | [Screenshot](844x390-light-edit-generate-candidates.png) | 97 (24.9%) | 23 | 19 | 0 | 0 | 1 | 0 |
| 844×390 | light | Edit + Mixer panel open | [Screenshot](844x390-light-edit-mixer-panel.png) | 97 (24.9%) | 24 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | light | Not (Score) | [Screenshot](844x390-light-not-score.png) | 88 (22.6%) | 16 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Not (Lyrics) | [Screenshot](844x390-light-not-lyrics.png) | 88 (22.6%) | 16 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Irama | [Screenshot](844x390-light-irama.png) | 88 (22.6%) | 83 | 13 | 0 | 0 | 11 | 0 |
| 844×390 | light | Project menu open | [Screenshot](844x390-light-project-menu-open.png) | 97 (24.9%) | 24 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | light | Lainnya popover/sheet open | [Screenshot](844x390-light-more-open.png) | 97 (24.9%) | 21 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Edit (Piano Roll default) | [Screenshot](844x390-dark-edit-default.png) | 97 (24.9%) | 16 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Edit + Guitar layer | [Screenshot](844x390-dark-edit-guitar.png) | 97 (24.9%) | 22 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Edit + Chord panel open | [Screenshot](844x390-dark-edit-chord-panel.png) | 97 (24.9%) | 28 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Edit + Generate open with candidates | [Screenshot](844x390-dark-edit-generate-candidates.png) | 97 (24.9%) | 23 | 19 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Edit + Mixer panel open | [Screenshot](844x390-dark-edit-mixer-panel.png) | 97 (24.9%) | 24 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Not (Score) | [Screenshot](844x390-dark-not-score.png) | 88 (22.6%) | 16 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Not (Lyrics) | [Screenshot](844x390-dark-not-lyrics.png) | 88 (22.6%) | 16 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Irama | [Screenshot](844x390-dark-irama.png) | 88 (22.6%) | 83 | 13 | 0 | 0 | 11 | 0 |
| 844×390 | dark | Project menu open | [Screenshot](844x390-dark-project-menu-open.png) | 97 (24.9%) | 24 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Lainnya popover/sheet open | [Screenshot](844x390-dark-more-open.png) | 97 (24.9%) | 21 | 13 | 0 | 0 | 1 | 0 |

Cell count: 60/60. Failures: 0.
