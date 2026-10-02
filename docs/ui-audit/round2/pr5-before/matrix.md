# UI audit matrix

Build: 20261002.70; generated: 2026-10-02T23:04:38.740Z; served from /melodi/.

Chrome is the distance from viewport top to the visible workspace plus any fixed bottom dock. Visible-control count excludes hidden and fully clipped controls, and includes disabled controls. Control overlaps exclude parent/child controls and intersections across intentional overlay layers. Canvas-label overlaps compare visible controls against Piano Roll bar/pitch labels, excluding controls inside an open panel or menu overlay. Clipping includes viewport and overflow-ancestor clipping; unreachable clips are targets without a scrollable ancestor.

| Viewport | Theme | State | Screenshot | Chrome px (%) | Visible controls | `<details>` | Control overlaps | Canvas label overlaps | Clipped controls | Unreachable clips |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1440×900 | light | Edit (Piano Roll default) | [Screenshot](1440x900-light-edit-default.png) | 134.3 (14.9%) | 23 | 14 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Edit + Guitar layer | [Screenshot](1440x900-light-edit-guitar.png) | 129 (14.3%) | 26 | 14 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Edit + Chord panel open | [Screenshot](1440x900-light-edit-chord-panel.png) | 134.3 (14.9%) | 33 | 14 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Edit + Generate open with candidates | [Screenshot](1440x900-light-edit-generate-candidates.png) | 134.3 (14.9%) | 38 | 20 | 11 | 0 | 2 | 0 |
| 1440×900 | light | Edit + Mixer panel open | [Screenshot](1440x900-light-edit-mixer-panel.png) | 134.3 (14.9%) | 33 | 14 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Not (Score) | [Screenshot](1440x900-light-not-score.png) | 134.4 (14.9%) | 18 | 14 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Not (Lyrics) | [Screenshot](1440x900-light-not-lyrics.png) | 179.2 (19.9%) | 19 | 14 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Irama | [Screenshot](1440x900-light-irama.png) | 156.8 (17.4%) | 117 | 14 | 8 | 0 | 0 | 0 |
| 1440×900 | light | Project menu open | [Screenshot](1440x900-light-project-menu-open.png) | 134.3 (14.9%) | 34 | 14 | 0 | 0 | 2 | 0 |
| 1440×900 | light | Lainnya popover/sheet open | [Screenshot](1440x900-light-more-open.png) | 134.3 (14.9%) | 33 | 14 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Edit (Piano Roll default) | [Screenshot](1440x900-dark-edit-default.png) | 134.3 (14.9%) | 23 | 14 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Edit + Guitar layer | [Screenshot](1440x900-dark-edit-guitar.png) | 129 (14.3%) | 26 | 14 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Edit + Chord panel open | [Screenshot](1440x900-dark-edit-chord-panel.png) | 134.3 (14.9%) | 33 | 14 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Edit + Generate open with candidates | [Screenshot](1440x900-dark-edit-generate-candidates.png) | 134.3 (14.9%) | 38 | 20 | 11 | 0 | 2 | 0 |
| 1440×900 | dark | Edit + Mixer panel open | [Screenshot](1440x900-dark-edit-mixer-panel.png) | 134.3 (14.9%) | 33 | 14 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Not (Score) | [Screenshot](1440x900-dark-not-score.png) | 134.4 (14.9%) | 18 | 14 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Not (Lyrics) | [Screenshot](1440x900-dark-not-lyrics.png) | 179.2 (19.9%) | 19 | 14 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Irama | [Screenshot](1440x900-dark-irama.png) | 156.8 (17.4%) | 117 | 14 | 8 | 0 | 0 | 0 |
| 1440×900 | dark | Project menu open | [Screenshot](1440x900-dark-project-menu-open.png) | 134.3 (14.9%) | 34 | 14 | 0 | 0 | 2 | 0 |
| 1440×900 | dark | Lainnya popover/sheet open | [Screenshot](1440x900-dark-more-open.png) | 134.3 (14.9%) | 33 | 14 | 0 | 0 | 2 | 0 |
| 390×844 | light | Edit (Piano Roll default) | [Screenshot](390x844-light-edit-default.png) | 172 (20.4%) | 17 | 14 | 0 | 5 | 2 | 0 |
| 390×844 | light | Edit + Guitar layer | [Screenshot](390x844-light-edit-guitar.png) | 172 (20.4%) | 20 | 14 | 0 | 5 | 2 | 0 |
| 390×844 | light | Edit + Chord panel open | [Screenshot](390x844-light-edit-chord-panel.png) | 172 (20.4%) | 27 | 14 | 0 | 5 | 2 | 0 |
| 390×844 | light | Edit + Generate open with candidates | [Screenshot](390x844-light-edit-generate-candidates.png) | 172 (20.4%) | 30 | 20 | 8 | 0 | 4 | 0 |
| 390×844 | light | Edit + Mixer panel open | [Screenshot](390x844-light-edit-mixer-panel.png) | 172 (20.4%) | 24 | 14 | 0 | 5 | 2 | 0 |
| 390×844 | light | Not (Score) | [Screenshot](390x844-light-not-score.png) | 207.5 (24.6%) | 14 | 14 | 0 | 0 | 0 | 0 |
| 390×844 | light | Not (Lyrics) | [Screenshot](390x844-light-not-lyrics.png) | 249.4 (29.5%) | 15 | 14 | 0 | 0 | 0 | 0 |
| 390×844 | light | Irama | [Screenshot](390x844-light-irama.png) | 249.4 (29.5%) | 77 | 14 | 0 | 0 | 10 | 0 |
| 390×844 | light | Project menu open | [Screenshot](390x844-light-project-menu-open.png) | 172 (20.4%) | 29 | 14 | 0 | 5 | 2 | 0 |
| 390×844 | light | Lainnya popover/sheet open | [Screenshot](390x844-light-more-open.png) | 172 (20.4%) | 25 | 14 | 0 | 5 | 2 | 0 |
| 390×844 | dark | Edit (Piano Roll default) | [Screenshot](390x844-dark-edit-default.png) | 172 (20.4%) | 17 | 14 | 0 | 5 | 2 | 0 |
| 390×844 | dark | Edit + Guitar layer | [Screenshot](390x844-dark-edit-guitar.png) | 172 (20.4%) | 20 | 14 | 0 | 5 | 2 | 0 |
| 390×844 | dark | Edit + Chord panel open | [Screenshot](390x844-dark-edit-chord-panel.png) | 172 (20.4%) | 27 | 14 | 0 | 5 | 2 | 0 |
| 390×844 | dark | Edit + Generate open with candidates | [Screenshot](390x844-dark-edit-generate-candidates.png) | 172 (20.4%) | 30 | 20 | 8 | 0 | 4 | 0 |
| 390×844 | dark | Edit + Mixer panel open | [Screenshot](390x844-dark-edit-mixer-panel.png) | 172 (20.4%) | 24 | 14 | 0 | 5 | 2 | 0 |
| 390×844 | dark | Not (Score) | [Screenshot](390x844-dark-not-score.png) | 207.5 (24.6%) | 14 | 14 | 0 | 0 | 0 | 0 |
| 390×844 | dark | Not (Lyrics) | [Screenshot](390x844-dark-not-lyrics.png) | 249.4 (29.5%) | 15 | 14 | 0 | 0 | 0 | 0 |
| 390×844 | dark | Irama | [Screenshot](390x844-dark-irama.png) | 249.4 (29.5%) | 77 | 14 | 0 | 0 | 10 | 0 |
| 390×844 | dark | Project menu open | [Screenshot](390x844-dark-project-menu-open.png) | 172 (20.4%) | 29 | 14 | 0 | 5 | 2 | 0 |
| 390×844 | dark | Lainnya popover/sheet open | [Screenshot](390x844-dark-more-open.png) | 172 (20.4%) | 25 | 14 | 0 | 5 | 2 | 0 |
| 844×390 | light | Edit (Piano Roll default) | [Screenshot](844x390-light-edit-default.png) | 88 (22.6%) | 15 | 14 | 0 | 7 | 0 | 0 |
| 844×390 | light | Edit + Guitar layer | [Screenshot](844x390-light-edit-guitar.png) | 88 (22.6%) | 19 | 14 | 0 | 7 | 0 | 0 |
| 844×390 | light | Edit + Chord panel open | [Screenshot](844x390-light-edit-chord-panel.png) | 88 (22.6%) | 24 | 14 | 0 | 7 | 0 | 0 |
| 844×390 | light | Edit + Generate open with candidates | [Screenshot](844x390-light-edit-generate-candidates.png) | 88 (22.6%) | 25 | 20 | 9 | 7 | 2 | 0 |
| 844×390 | light | Edit + Mixer panel open | [Screenshot](844x390-light-edit-mixer-panel.png) | 88 (22.6%) | 20 | 14 | 0 | 7 | 1 | 0 |
| 844×390 | light | Not (Score) | [Screenshot](844x390-light-not-score.png) | 140.2 (35.9%) | 17 | 14 | 0 | 0 | 0 | 0 |
| 844×390 | light | Not (Lyrics) | [Screenshot](844x390-light-not-lyrics.png) | 167.9 (43.1%) | 14 | 14 | 1 | 0 | 1 | 1 |
| 844×390 | light | Irama | [Screenshot](844x390-light-irama.png) | 146.6 (37.6%) | 72 | 14 | 2 | 0 | 11 | 0 |
| 844×390 | light | Project menu open | [Screenshot](844x390-light-project-menu-open.png) | 88 (22.6%) | 24 | 14 | 1 | 7 | 0 | 0 |
| 844×390 | light | Lainnya popover/sheet open | [Screenshot](844x390-light-more-open.png) | 88 (22.6%) | 21 | 14 | 0 | 7 | 0 | 0 |
| 844×390 | dark | Edit (Piano Roll default) | [Screenshot](844x390-dark-edit-default.png) | 88 (22.6%) | 15 | 14 | 0 | 7 | 0 | 0 |
| 844×390 | dark | Edit + Guitar layer | [Screenshot](844x390-dark-edit-guitar.png) | 88 (22.6%) | 19 | 14 | 0 | 7 | 0 | 0 |
| 844×390 | dark | Edit + Chord panel open | [Screenshot](844x390-dark-edit-chord-panel.png) | 88 (22.6%) | 24 | 14 | 0 | 7 | 0 | 0 |
| 844×390 | dark | Edit + Generate open with candidates | [Screenshot](844x390-dark-edit-generate-candidates.png) | 88 (22.6%) | 25 | 20 | 9 | 7 | 2 | 0 |
| 844×390 | dark | Edit + Mixer panel open | [Screenshot](844x390-dark-edit-mixer-panel.png) | 88 (22.6%) | 20 | 14 | 0 | 7 | 1 | 0 |
| 844×390 | dark | Not (Score) | [Screenshot](844x390-dark-not-score.png) | 140.2 (35.9%) | 17 | 14 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Not (Lyrics) | [Screenshot](844x390-dark-not-lyrics.png) | 167.9 (43.1%) | 14 | 14 | 1 | 0 | 1 | 1 |
| 844×390 | dark | Irama | [Screenshot](844x390-dark-irama.png) | 146.6 (37.6%) | 72 | 14 | 2 | 0 | 11 | 0 |
| 844×390 | dark | Project menu open | [Screenshot](844x390-dark-project-menu-open.png) | 88 (22.6%) | 24 | 14 | 1 | 7 | 0 | 0 |
| 844×390 | dark | Lainnya popover/sheet open | [Screenshot](844x390-dark-more-open.png) | 88 (22.6%) | 21 | 14 | 0 | 7 | 0 | 0 |

Cell count: 60/60. Failures: 0.
