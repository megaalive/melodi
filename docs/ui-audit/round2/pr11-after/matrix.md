# UI audit matrix

Build: 20261003.77; generated: 2026-10-03T06:39:48.013Z; served from /melodi/.

Chrome is the distance from viewport top to the visible workspace plus any fixed bottom dock. Visible-control count excludes hidden and fully clipped controls, and includes disabled controls. Click-to-reveal is the strict total of matching common controls hidden behind closed disclosures, panels, hidden ancestors, CSS visibility rules, or inactive tabpanels. Closed disclosure/panel and inactive-tab columns explain the total; inactive tab content is included even though its tab remains visible. Control overlaps exclude parent/child controls and intersections across intentional overlay layers. Canvas-label overlaps compare visible controls against Piano Roll bar/pitch labels, excluding controls inside an open panel or menu overlay. Clipping includes viewport and overflow-ancestor clipping; unreachable clips are targets without a scrollable ancestor.

| Viewport | Theme | State | Screenshot | Chrome px (%) | Visible controls | Visible primary | Click-to-reveal | Closed disclosure/panel | Inactive tab targets | `<details>` | Control overlaps | Canvas label overlaps | Clipped controls | Unreachable clips |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1920×1080 | light | Edit (Piano Roll default) | [Screenshot](1920x1080-light-edit-default.png) | 125 (11.6%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | light | Edit + Guitar layer | — | 125 (11.6%) | 45 | 33 | 10 | 10 | 0 | 13 | 0 | 0 | 1 | 0 |
| 1920×1080 | light | Edit + Chord panel open | — | 125 (11.6%) | 44 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | light | Edit + Generate open with candidates | [Screenshot](1920x1080-light-edit-generate-candidates.png) | 125 (11.6%) | 52 | 30 | 13 | 0 | 13 | 19 | 0 | 0 | 0 | 0 |
| 1920×1080 | light | Edit + Mixer panel open | [Screenshot](1920x1080-light-edit-mixer-panel.png) | 125 (11.6%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | light | Not (Score) | — | 122.4 (11.3%) | 37 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | light | Not (Lyrics) | — | 167.2 (15.5%) | 38 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | light | Irama | — | 144.8 (13.4%) | 136 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | light | Project menu open | — | 125 (11.6%) | 46 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | light | Lainnya popover/sheet open | — | 125 (11.6%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Edit (Piano Roll default) | [Screenshot](1920x1080-dark-edit-default.png) | 125 (11.6%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Edit + Guitar layer | — | 125 (11.6%) | 45 | 33 | 10 | 10 | 0 | 13 | 0 | 0 | 1 | 0 |
| 1920×1080 | dark | Edit + Chord panel open | — | 125 (11.6%) | 44 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Edit + Generate open with candidates | [Screenshot](1920x1080-dark-edit-generate-candidates.png) | 125 (11.6%) | 52 | 30 | 13 | 0 | 13 | 19 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Edit + Mixer panel open | [Screenshot](1920x1080-dark-edit-mixer-panel.png) | 125 (11.6%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Not (Score) | — | 122.4 (11.3%) | 37 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Not (Lyrics) | — | 167.2 (15.5%) | 38 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Irama | — | 144.8 (13.4%) | 136 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Project menu open | — | 125 (11.6%) | 46 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1920×1080 | dark | Lainnya popover/sheet open | — | 125 (11.6%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Edit (Piano Roll default) | [Screenshot](1440x900-light-edit-default.png) | 119 (13.2%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Edit + Guitar layer | — | 119 (13.2%) | 42 | 33 | 10 | 10 | 0 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Edit + Chord panel open | — | 119 (13.2%) | 44 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Edit + Generate open with candidates | [Screenshot](1440x900-light-edit-generate-candidates.png) | 125 (13.9%) | 47 | 30 | 13 | 0 | 13 | 19 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Edit + Mixer panel open | [Screenshot](1440x900-light-edit-mixer-panel.png) | 119 (13.2%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Not (Score) | — | 122.4 (13.6%) | 37 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Not (Lyrics) | — | 167.2 (18.6%) | 38 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Irama | — | 144.8 (16.1%) | 136 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Project menu open | — | 119 (13.2%) | 46 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | light | Lainnya popover/sheet open | — | 119 (13.2%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Edit (Piano Roll default) | [Screenshot](1440x900-dark-edit-default.png) | 119 (13.2%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Edit + Guitar layer | — | 119 (13.2%) | 42 | 33 | 10 | 10 | 0 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Edit + Chord panel open | — | 119 (13.2%) | 44 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Edit + Generate open with candidates | [Screenshot](1440x900-dark-edit-generate-candidates.png) | 125 (13.9%) | 47 | 30 | 13 | 0 | 13 | 19 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Edit + Mixer panel open | [Screenshot](1440x900-dark-edit-mixer-panel.png) | 119 (13.2%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Not (Score) | — | 122.4 (13.6%) | 37 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Not (Lyrics) | — | 167.2 (18.6%) | 38 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Irama | — | 144.8 (16.1%) | 136 | 15 | 28 | 15 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Project menu open | — | 119 (13.2%) | 46 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1440×900 | dark | Lainnya popover/sheet open | — | 119 (13.2%) | 42 | 20 | 23 | 10 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1024×768 | light | Edit (Piano Roll default) | [Screenshot](1024x768-light-edit-default.png) | 143 (18.6%) | 33 | 11 | 32 | 19 | 13 | 13 | 0 | 0 | 2 | 0 |
| 1024×768 | light | Edit + Guitar layer | — | 143 (18.6%) | 32 | 24 | 19 | 19 | 0 | 13 | 0 | 0 | 2 | 0 |
| 1024×768 | light | Edit + Chord panel open | — | 143 (18.6%) | 33 | 11 | 32 | 19 | 13 | 13 | 0 | 0 | 2 | 0 |
| 1024×768 | light | Edit + Generate open with candidates | [Screenshot](1024x768-light-edit-generate-candidates.png) | 143 (18.6%) | 35 | 11 | 32 | 19 | 13 | 19 | 0 | 0 | 2 | 0 |
| 1024×768 | light | Edit + Mixer panel open | [Screenshot](1024x768-light-edit-mixer-panel.png) | 143 (18.6%) | 33 | 11 | 32 | 19 | 13 | 13 | 0 | 0 | 2 | 0 |
| 1024×768 | light | Not (Score) | — | 126.4 (16.5%) | 30 | 8 | 35 | 22 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1024×768 | light | Not (Lyrics) | — | 169.2 (22%) | 31 | 8 | 35 | 22 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1024×768 | light | Irama | — | 183.2 (23.9%) | 129 | 8 | 35 | 22 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1024×768 | light | Project menu open | — | 143 (18.6%) | 43 | 18 | 25 | 12 | 13 | 13 | 0 | 0 | 2 | 0 |
| 1024×768 | light | Lainnya popover/sheet open | — | 143 (18.6%) | 34 | 11 | 32 | 19 | 13 | 13 | 0 | 0 | 2 | 0 |
| 1024×768 | dark | Edit (Piano Roll default) | [Screenshot](1024x768-dark-edit-default.png) | 143 (18.6%) | 33 | 11 | 32 | 19 | 13 | 13 | 0 | 0 | 2 | 0 |
| 1024×768 | dark | Edit + Guitar layer | — | 143 (18.6%) | 32 | 24 | 19 | 19 | 0 | 13 | 0 | 0 | 2 | 0 |
| 1024×768 | dark | Edit + Chord panel open | — | 143 (18.6%) | 33 | 11 | 32 | 19 | 13 | 13 | 0 | 0 | 2 | 0 |
| 1024×768 | dark | Edit + Generate open with candidates | [Screenshot](1024x768-dark-edit-generate-candidates.png) | 143 (18.6%) | 35 | 11 | 32 | 19 | 13 | 19 | 0 | 0 | 2 | 0 |
| 1024×768 | dark | Edit + Mixer panel open | [Screenshot](1024x768-dark-edit-mixer-panel.png) | 143 (18.6%) | 33 | 11 | 32 | 19 | 13 | 13 | 0 | 0 | 2 | 0 |
| 1024×768 | dark | Not (Score) | — | 126.4 (16.5%) | 30 | 8 | 35 | 22 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1024×768 | dark | Not (Lyrics) | — | 169.2 (22%) | 31 | 8 | 35 | 22 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1024×768 | dark | Irama | — | 183.2 (23.9%) | 129 | 8 | 35 | 22 | 13 | 13 | 0 | 0 | 0 | 0 |
| 1024×768 | dark | Project menu open | — | 143 (18.6%) | 43 | 18 | 25 | 12 | 13 | 13 | 0 | 0 | 2 | 0 |
| 1024×768 | dark | Lainnya popover/sheet open | — | 143 (18.6%) | 34 | 11 | 32 | 19 | 13 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | light | Edit (Piano Roll default) | [Screenshot](390x844-light-edit-default.png) | 179 (21.2%) | 19 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | light | Edit + Guitar layer | — | 179 (21.2%) | 26 | 23 | 19 | 19 | 0 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | light | Edit + Chord panel open | — | 179 (21.2%) | 33 | 10 | 33 | 19 | 14 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | light | Edit + Generate open with candidates | [Screenshot](390x844-light-edit-generate-candidates.png) | 179 (21.2%) | 29 | 10 | 33 | 19 | 14 | 19 | 0 | 0 | 3 | 0 |
| 390×844 | light | Edit + Mixer panel open | [Screenshot](390x844-light-edit-mixer-panel.png) | 179 (21.2%) | 30 | 10 | 33 | 19 | 14 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | light | Not (Score) | — | 185.2 (21.9%) | 15 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | light | Not (Lyrics) | — | 192 (22.7%) | 17 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | light | Irama | — | 188.7 (22.4%) | 79 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 10 | 0 |
| 390×844 | light | Project menu open | — | 179 (21.2%) | 31 | 12 | 30 | 30 | 0 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | light | Lainnya popover/sheet open | — | 179 (21.2%) | 22 | 7 | 35 | 35 | 0 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | dark | Edit (Piano Roll default) | [Screenshot](390x844-dark-edit-default.png) | 179 (21.2%) | 19 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | dark | Edit + Guitar layer | — | 179 (21.2%) | 26 | 23 | 19 | 19 | 0 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | dark | Edit + Chord panel open | — | 179 (21.2%) | 33 | 10 | 33 | 19 | 14 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | dark | Edit + Generate open with candidates | [Screenshot](390x844-dark-edit-generate-candidates.png) | 179 (21.2%) | 29 | 10 | 33 | 19 | 14 | 19 | 0 | 0 | 3 | 0 |
| 390×844 | dark | Edit + Mixer panel open | [Screenshot](390x844-dark-edit-mixer-panel.png) | 179 (21.2%) | 30 | 10 | 33 | 19 | 14 | 13 | 0 | 0 | 3 | 0 |
| 390×844 | dark | Not (Score) | — | 185.2 (21.9%) | 15 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | dark | Not (Lyrics) | — | 192 (22.7%) | 17 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 0 | 0 |
| 390×844 | dark | Irama | — | 188.7 (22.4%) | 79 | 2 | 40 | 40 | 0 | 13 | 0 | 0 | 10 | 0 |
| 390×844 | dark | Project menu open | — | 179 (21.2%) | 31 | 12 | 30 | 30 | 0 | 13 | 0 | 0 | 2 | 0 |
| 390×844 | dark | Lainnya popover/sheet open | — | 179 (21.2%) | 22 | 7 | 35 | 35 | 0 | 13 | 0 | 0 | 2 | 0 |
| 844×390 | light | Edit (Piano Roll default) | [Screenshot](844x390-light-edit-default.png) | 97 (24.9%) | 16 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Edit + Guitar layer | — | 97 (24.9%) | 22 | 23 | 19 | 19 | 0 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Edit + Chord panel open | — | 97 (24.9%) | 29 | 10 | 33 | 19 | 14 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | light | Edit + Generate open with candidates | [Screenshot](844x390-light-edit-generate-candidates.png) | 97 (24.9%) | 24 | 10 | 33 | 19 | 14 | 19 | 0 | 0 | 1 | 0 |
| 844×390 | light | Edit + Mixer panel open | [Screenshot](844x390-light-edit-mixer-panel.png) | 97 (24.9%) | 25 | 10 | 33 | 19 | 14 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | light | Not (Score) | — | 88 (22.6%) | 16 | 3 | 39 | 39 | 0 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Not (Lyrics) | — | 88 (22.6%) | 16 | 3 | 39 | 39 | 0 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | light | Irama | — | 88 (22.6%) | 83 | 3 | 39 | 39 | 0 | 13 | 0 | 0 | 11 | 0 |
| 844×390 | light | Project menu open | — | 97 (24.9%) | 24 | 12 | 30 | 30 | 0 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | light | Lainnya popover/sheet open | — | 97 (24.9%) | 19 | 7 | 35 | 35 | 0 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Edit (Piano Roll default) | [Screenshot](844x390-dark-edit-default.png) | 97 (24.9%) | 16 | 5 | 37 | 37 | 0 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Edit + Guitar layer | — | 97 (24.9%) | 22 | 23 | 19 | 19 | 0 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Edit + Chord panel open | — | 97 (24.9%) | 29 | 10 | 33 | 19 | 14 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Edit + Generate open with candidates | [Screenshot](844x390-dark-edit-generate-candidates.png) | 97 (24.9%) | 24 | 10 | 33 | 19 | 14 | 19 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Edit + Mixer panel open | [Screenshot](844x390-dark-edit-mixer-panel.png) | 97 (24.9%) | 25 | 10 | 33 | 19 | 14 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Not (Score) | — | 88 (22.6%) | 16 | 3 | 39 | 39 | 0 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Not (Lyrics) | — | 88 (22.6%) | 16 | 3 | 39 | 39 | 0 | 13 | 0 | 0 | 0 | 0 |
| 844×390 | dark | Irama | — | 88 (22.6%) | 83 | 3 | 39 | 39 | 0 | 13 | 0 | 0 | 11 | 0 |
| 844×390 | dark | Project menu open | — | 97 (24.9%) | 24 | 12 | 30 | 30 | 0 | 13 | 0 | 0 | 1 | 0 |
| 844×390 | dark | Lainnya popover/sheet open | — | 97 (24.9%) | 19 | 7 | 35 | 35 | 0 | 13 | 0 | 0 | 0 | 0 |

Cell count: 100/100. Failures: 0.
