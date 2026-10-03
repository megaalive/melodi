# Feature map — Putaran 2, baseline and PR13–16 build 20261003.79

The historical inventory below records the default-state route to each implemented user feature before PR13, at build 20261003.78. It is derived from `src/core/snapshot.js` (`AVAILABLE_ACTIONS`), UI `data-action` hooks, `README.md`, and `PLAN.md`. Missing or misrouted controls in that table are before-state findings. Current routes and verified operation budgets for build 20261003.79 follow the baseline; full local measurements are in the [PR13–16 audit](ui-audit.md#putaran-2-pr1316--guitar-dock-dan-kontrol-yang-terjangkau).

## Counting rules

- Workspace abbreviations: **Edit**, **Not**, **Irama**, and **Global**. A view change is one step from the default Edit workspace.
- Breakpoint bins are disjoint: `>=90rem`; `68rem..<90rem`; `46rem..<68rem`; `<=46rem`. At exactly 46rem the phone bin applies; at 68rem and 90rem the larger bin applies.
- A step is an action needed to make the actual usable control visible: opening a closed disclosure, menu, panel, tab, or sheet each costs one step. A visible labelled tab is an entry point, not the panel's hidden controls. A wrong sheet body is marked unreachable (`∞`) until its route is fixed. Scrolling a canvas is not counted as opening a control, but clipped or out-of-viewport targets are reported separately by the UI audit.
- Steps are from the fresh/default state unless noted. State-conditional controls (selection, anchors, generation session, selected drum hit) include their condition in the row. A primary workspace view requires one workspace-tab action from default Edit.
- **Core** means the actual operational control must be visible at 0 steps for `>=68rem` and at no more than 1 step for `<=46rem`. This is stricter than merely having a visible tab. PR13 onward must preserve this definition and expose compact controls outside the dock where the panel cap would otherwise hide them.
- “Text” reports a visible text label on the control itself; an icon with only an accessible name is still “No” here.

## Historical baseline: implemented user features in `.78`

`E / N / R` below indicates the workspace where the feature applies. Locations and counts describe build `.78`.

| Feature / actions | Workspace | `>=90rem` location; steps | `68–90rem` location; steps | `46–68rem` location; steps | `<=46rem` location; steps | Text label | Core |
|---|---|---|---|---|---|---|---|
| Piano Roll view and note timeline | E | Main canvas; 0 | Main canvas; 0 | Main canvas; 0 | Edit workspace in bottom navigation; 0 | Yes | Primary view |
| Select / Draw tool (`set-tool`) | E | Editor toolbar; 0 | Editor toolbar; 0 | Editor toolbar; 0 | Editor toolbar when visible; otherwise More; 0–1 | Yes | **Core** |
| Add note (`add-note`, blank-canvas draw) | E | Alat dock; 1 from default Mixer | Alat dock; 1 | Alat panel/sheet; 1–2 | Alat sheet; 2 from default (open Panel, choose Alat); canvas Draw is direct | Yes | **Core** |
| Select range (`select-range`, `selectRange`) | E | Alat dock or canvas gesture; 1 / 0 by route | Alat dock or canvas gesture; 1 / 0 | Alat panel/sheet or canvas gesture; 1–2 / 0 | Alat sheet or canvas gesture; 2 / 0 | Yes | **Core** |
| Snap (note and chord snap) | E | Editor toolbar; 0 | Editor toolbar; 0 | Editor toolbar; 0 | Editor toolbar / More; 0–1 | Yes | **Core** |
| Zoom (Piano Roll horizontal zoom) | E | Editor toolbar; 0 | Editor toolbar; 0 | Editor toolbar; 0 | Editor toolbar / More; 0–1 | Yes | **Core** |
| Note editing: move, resize, transpose, duration, velocity, copy/paste, delete, duplicate, anchor/lock | E | Canvas gestures; selection toolbar, with advanced items in More; 0–1 after selection | Same; 0–1 after selection | Canvas and contextual toolbar; 0–1 after selection | Canvas and contextual toolbar; 0–1 after selection | Mixed | Non-core |
| Note expression: pitch bend, curve presets, vibrato, expression mode/reset | E | Expression toolbar/panel; selection required, some controls in Alat; 1–2 | Same; 1–2 | Panel/sheet; 1–3 | Panel/sheet; 1–3 | Yes | Non-core |
| Guitar TAB | E; target also N | Toolbar toggle then Guitar content inside Alat; 1, and dock is forced to Alat | Same single-dock route; 1 | Guitar toggle / panel; 1–2 | “Gitar” sheet route shows Alat content, not TAB; `∞` for actual TAB | Yes on toggle; sheet body is wrong | **Core** |
| Guitar Fretboard | E; target also N | Toolbar toggle then Guitar content inside Alat; 1, and dock is forced to Alat | Same; 1 | Guitar toggle / panel; 1–2 | “Gitar” sheet route shows Alat content, not Fretboard; `∞` | Yes on toggle; sheet body is wrong | **Core** |
| Drum Roll view and percussion grid | R | Irama workspace, main canvas; 1 from default Edit | Same; 1 | Workspace/panel; 1–2 | Irama bottom-navigation item; 1 | Yes | Primary view |
| Drum hit select/add/edit/delete/duplicate/clear | R | Drum toolbar/canvas; 1 from default workspace | Same; 1 | Drum canvas; 1–2 | Drum canvas after switching workspace; 1 | Yes | Non-core |
| Drum snap/tool | R | Drum toolbar; 1 from default workspace | Same; 1 | Drum toolbar; 1–2 | Drum toolbar if shown; 1–2 | Yes | Snap **Core** (relevant to Irama); tool non-core |
| Drum groove and style presets | R | Alat content; 2 (Irama, then Alat) | Same; 2 | Alat panel; 2–3 | Alat sheet; 2–3 | Yes | Non-core |
| Drum expression (velocity, pan, tuning, articulation/choke for selected hits) | R | Alat content; 2 (Irama, then Alat) | Same; 2 | Alat panel; 2–3 | Alat sheet; 2–3 | Yes | Non-core |
| Score view; Flow, Page, Split layout | N | Not workspace; Score controls in view toolbar; 1 from default | Same; 1 | Not workspace and controls; 1–2 | Not bottom-navigation item and view control; 1–2 | Yes | Primary view |
| Score zoom | N | No dedicated Score zoom control; not applicable (Score is page/flow layout) | Same | Same | Same | N/A | Not applicable |
| Lyrics and syllable mapping (edit, add, split, merge, move, assign, melisma, auto-map) | N | Lyrics view; 1, then per-syllable editor when needed | Same; 1+ | Not workspace and lyrics editor; 1–2+ | Not bottom-navigation item then Lyrics; 1–2+ | Yes | Non-core |
| Chord timeline: draw/select/move/resize, edit/picker, duplicate/delete/lock | E | Chord lane is on canvas; picker/inspector in Chord dock; 1 for picker | Same; 1 | Chord lane plus dock/panel; 1–2 | Chord lane plus Chord sheet; 1–2 | Yes | **Core** |
| Chord progression presets (Pop, Jazz, Ballad, Circle of Fifths) | E | Chord panel; 1 from default Mixer | Chord tab; 1 | Chord tab/panel; 1–2 | Chord sheet; 2 from default panel | Yes | **Core** (part of Chord) |
| Harmony suggestions: range, candidates, accept/clear; harmony style | E/N | Chord/Generate and Mixer controls; 1–2 | Chord/Generate and Mixer controls; 1–2 | Panel; 1–3 | Panel sheet; 2–3 | Yes | Non-core |
| Generate anchors / anchor selection and use selection/ticks | E | Piano Roll anchors; selection bar or Generate panel; 0–1, state-dependent | Same; 0–1 | Editor plus panel; 0–2 | Editor plus one-tap panel route; 0–2 | Yes | **Core** |
| Generate gap, options, candidates, compare, audition, accept, lock, regenerate, navigation | E | Generate dock; 1 from default Mixer; candidate actions after generation | Same; 1 | Generate panel; 1–2 | Generate sheet; 2 from default; candidate actions after generation | Yes | **Core** |
| Mixer: Melody, Harmony, Bass, Drum volume/mute/solo; harmony/bass styles | Global; E/N/R context | Mixer dock; 0 by default | Mixer dock; 0 by default | Mixer panel; 0–1 | Mixer sheet; 1–2 from default | Yes | **Core** |
| Seek (overview, playhead seek) | Global | Song overview and transport; 0 | Same; 0 | Overview/transport; 0 | Overview/bottom transport; 0 | Yes | **Core** |
| Playback range / reset | Global | Alat dock; 1 from Mixer | Same; 1 | Alat panel; 1–2 | Alat sheet; 2 from default | Yes | **Core** |
| Loop set, enable, disable | Global | Alat dock; 1 from Mixer | Same; 1 | Alat panel; 1–2 | Loop transport control plus range in Alat; 0–2 | Yes | **Core** |
| Follow playback | Global; E/N/R | Header or Alat control; 0–1 | Same; 0–1 | Alat/panel; 1–2 | Alat sheet; 2 | Yes | Non-core |
| Play, pause, stop | Global | Transport; 0 | Transport; 0 | Transport; 0 | Fixed bottom dock; 0 | Yes | Non-core |
| Tempo | Global | Transport; 0 | Transport; 0 | Transport; 0 | Bottom transport; 0 | Yes | Core-adjacent |
| Meter and key display | Global; all | Song strip/header; 0 (read-only in `.78`) | Same; 0 | Song strip; 0–1 | Song strip; 0–1 | Yes | Read-only display; no corresponding setter in `AVAILABLE_ACTIONS` |
| Undo / Redo | Global | Header; 0 (buttons disabled when history empty) | Header; 0 | Header/transport; 0 | Fixed bottom dock; 0 | Yes | **Core** |
| Command Palette and keyboard shortcuts | Global; contextual | Header button / `Ctrl+K`; 0 | Header button / `Ctrl+K`; 0 | Palette button or shortcut; 0–1 | Project/settings sheet or `Ctrl+K`; 0–1 | Yes on button | Non-core |
| Language (id/en) | Global | Header controls; 0 | Header controls; 0 | Settings/menu; 0–1 | Project/settings sheet; 1 | Yes | Non-core |
| Theme (light/dark/system) | Global | Header controls; 0 | Header controls; 0 | Settings/menu; 0–1 | Project/settings sheet; 1 | Yes | Non-core |
| New project/song | Global | Direct project action; 0 | Direct project action; 0 | Project controls/menu; 0–1 | Project sheet; 1 | Icon-only at desktop in `.78` | **Core** |
| Examples | Global | “Aksi lain” popover; 1 | Project menu; 1 | Project menu; 1–2 | Project sheet; 1 | Icon-only/inside menu | **Core** |
| Open from browser library | Global | “Aksi lain” popover; 1 | Project menu; 1 | Project menu; 1–2 | Project sheet; 1 | Icon-only/inside menu | **Core** |
| Save to browser / Save draft | Global | Project menu; 1 | Project menu; 1 | Project controls/menu; 0–1 | Project sheet; 1 | Inside menu | **Core** |
| Save As / Save to browser library | Global | “Aksi lain” popover; 1 | Project menu; 1 | Project menu; 1–2 | Project sheet; 1 | Icon-only/inside menu | **Core** |
| Open project file | Global | Direct project action; 0 | Direct project action; 0 | Project controls/menu; 0–1 | Project sheet; 1 | Icon-only at desktop in `.78` | **Core** |
| Save project file | Global | Direct project action; 0 | Direct project action; 0 | Project controls/menu; 0–1 | Project sheet; 1 | Icon-only at desktop in `.78` | **Core** |
| Share project | Global | Direct project action; 0 | Direct project action; 0 | Project controls/menu; 0–1 | Project sheet; 1 | Icon-only at desktop in `.78` | **Core** |
| Project title; browser library save/open/delete | Global | Project header and project/library menus; 0–1 | Project header and menu; 0–1 | Project sheet/dialog; 1–2 | Project sheet/dialog; 1–2 | Yes | Non-core |
| Help | Global | Header/menu; 0–1 | Header/menu; 0–1 | Menu; 1 | Project/settings sheet; 1 | Yes | Non-core |

## Historical baseline: reachability of core features

The core inventory contains Guitar TAB/Fretboard, Chord (timeline, picker, progression), Generate (anchors through candidate acceptance), Mixer, Snap/Zoom, Select/Draw, Add Note, Seek/Range/Loop, Undo/Redo, and each of the eight project actions. In `.78`, the main known failures were inactive dock content, Alat-only controls, menu-only project actions, and the Guitar sheet route. Build `.79` operation coverage and its remaining menu routes are recorded below; raw hidden-element totals are a separate audit measure.

Conditional actions require history for Undo/Redo, anchors and a generation session for candidate controls, a selected note for expression, and a selected percussion hit for drum expression. On a fresh project those conditional actions do not exist yet; their parent feature access is what is counted in the default-state map.

## Historical baseline: relevance and scope notes

- Snap applies to note and chord editing in Edit and to percussion steps in Irama. Zoom is currently a horizontal Piano Roll control; Score uses Flow/Page layout and Irama has no drum-zoom command/control, so Score and Drum Zoom are not applicable in `.78` unless a corresponding existing control is found. Do not add new musical functionality to address that absence.
- Guitar TAB and Fretboard both project the canonical melody. Their target is Edit and Not, never Irama; `setViewMode("guitar")` remains a supported command and maps to the Edit workspace.
- Mixer controls are cross-workspace because the channels are project mix state, though their displayed instruments vary with the workspace.
- Meter and key are shown in the song strip but do not have UI setters in `.78`. Do not count a read-only display as an editing action.
- Plan items for MIDI/MusicXML/WAV import, guitar-WAV transcription, and later PWA work are not current controls. They are not added by PR13–16. No Idea workspace, MIDI input, generator, Song/Share schema, or audio-engine feature is introduced.

## Current implementation routes after PR13–16

The following table describes the implemented homes in the active workspace. It supplements the historical inventory rather than replacing its before-state measurements. A visible feature entry and every conditional operation within its panel are separate targets under the counting rules above. Local test coverage, layout measurements, and limits are recorded after the route table.

| Feature | `>=90rem` | `68–90rem` | `46–68rem` | `<=46rem` and short landscape | Text / context |
|---|---|---|---|---|---|
| Piano Roll, Select/Draw, Add note, Select range | Edit canvas; Select/Draw in compact core strip; exact forms in Alat | Same | Edit canvas and core strip; exact forms in Alat panel | Edit canvas; editor settings and exact forms in sheets; short landscape exposes the editor toolbar | Select/Draw labelled; Draw adds notes and Select supports canvas range selection |
| Edit Snap/Zoom | Core strip, using existing editor commands | Same | Core strip | Editor settings sheet; short landscape editor toolbar | Snap applies to note/chord editing; Zoom scales the roll |
| Guitar TAB/Fretboard | Dedicated lower zone in Edit and Not; labelled heading/toggle | Same zone with open/close control | Lower zone unless compact landscape applies | Visible Guitar entry opens dedicated TAB/Fretboard sheet in Edit or Not | Layout buttons choose TAB/Fretboard; available only for melody workspaces |
| Chord add/draw/timeline | Edit canvas lane and Add Chord in core strip; Chord panel in lower dock by default | Edit canvas and Add Chord strip control; Chord tab | Canvas and Add Chord strip control; Chord panel | Chord sheet from its visible panel entry | Chord inspector/picker follows selected chord context |
| Chord picker/progression, harmony suggestions | Chord panel; detailed conditional controls remain there | Chord tab/panel | Chord panel | Chord sheet | Text labels; selection/range requirements still apply |
| Generate anchors and gap generation | Direct actions in Edit core strip; full form in upper Generate slot | Direct actions in Edit core strip; full form in Generate tab | Direct actions in Edit core strip; Generate panel | Generate sheet from its visible entry in Edit | Anchor actions and Generate run the existing command path |
| Generate options, candidates, compare, audition, accept, lock, regenerate | Upper Generate slot with its own scroll area | Generate tab/panel | Generate panel | Generate sheet | Candidate actions require an anchor-bounded generation session |
| Melody/Harmony/Bass volume, mute, solo | Compact core mix group and full Mixer panel | Same | Same | Mixer sheet | Each channel has its own labelled control group |
| Harmony/Bass style and pattern controls | Mixer panel | Mixer tab/panel | Mixer panel | Mixer sheet | Existing pattern/style choices |
| Drum Roll and percussion editing | Irama canvas and drum toolbar | Same | Same | Irama canvas and toolbar/sheets | Four-bar display horizon; no change to canonical playback duration |
| Drum mix controls | Per-piece controls on Irama grid rows; Mixer panel where applicable | Same | Same | Scrollable percussion rows and Mixer sheet | Controls depend on the percussion pieces present in the project |
| Drum groove/presets and expression | Pop groove in Irama toolbar; drum expression in lower dock by default | Pop groove in toolbar; drum-expression tab | Pop groove in toolbar; drum-expression panel | Pop groove in toolbar; drum-expression sheet | Expression requires selected percussion hits |
| Drum Snap/Zoom | Drum snap in Irama toolbar; Zoom uses shared editor multiplier | Same | Same | Drum toolbar/settings; short landscape toolbar | Drum Roll reads shared `editor.zoom` and `editor.snap`; its Snap control mirrors the same editor preference |
| Score Flow/Page/Split, lyrics/mapping | Not canvas and its relevant view/layout controls | Same | Same | Not workspace and writing/layout controls | Detailed syllable mapping stays in each syllable chip |
| Seek, loop range, loop enable, Follow | Exact Seek/Loop range forms in strip; loop/Follow in transport; reset/options in Alat | Exact Seek/Loop range forms, loop toggle, and Follow in core strip | Exact Seek/Loop range forms in core strip; reset/options in Alat | Transport controls and Seek/Loop range forms in Alat sheet; overview where shown | Existing seek and loop commands; exact tick forms retain labels/accessible names |
| Undo/Redo, tempo, play/pause/stop | Header/transport controls | Header or core strip/transport controls | Transport controls | Fixed transport dock | History buttons can be disabled when no corresponding action exists |
| New, Open file, Save file, Share | Labelled direct Proyek group buttons | Labelled direct header buttons | Proyek menu | Proyek sheet | Stable project `data-action` hooks retained |
| Examples, Open browser library, Save, Save As | Labelled direct Proyek group buttons | Proyek menu | Proyek menu | Proyek sheet | Extra project popover removed at `>=90rem` |
| Command Palette, shortcuts, language, theme, Help | Header controls or relevant panel/help entries | Header/menu controls | Existing menu/panel controls | Existing project/settings and panel sheets | Icon controls have accessible names; shortcut behavior is unchanged |
| Note editing/expression, project title/library management, meter/key display | Existing canvas, contextual controls, Alat/Chord/project dialogs | Same homes with one dock tab at a time | Existing panel/dialog routes | Existing sheets/dialogs | Conditional selection controls and read-only meter/key retain their baseline meaning |

### Dock availability and saved state

| Active workspace | Single-panel tabs | Default secondary panel at `>=90rem`, height `>=800px` |
|---|---|---|
| Edit | Generate, Chord, Mixer, Alat | Chord |
| Not | Mixer, Alat | Mixer |
| Irama | Drum pattern/expression, Mixer, Alat | Drum pattern/expression |

Wide tall layouts place Generate in the upper slot in every workspace and the selected relevant panel in the lower slot. The upper Generate tab is omitted from the secondary tablist. Each slot collapses and scrolls independently; open slot count, slot state, and selected panel per workspace use the existing UI preference storage. At other sizes the dock or sheet shows a single selected panel. Phone panel entries have selected-tab styling, and the Guitar sheet contains only Guitar content.

The existing `data-studio-panel` values remain available as hooks. Requests to open a panel irrelevant to the active workspace are ignored by the UI router, preserving the current workspace and panel. Note expression continues to route through Alat. This routing policy does not add a public command or change `window.melodi.commands`.

### Guitar state and relevance

On desktop/tablet, Guitar is a separate zone below the Edit or Not canvas, with one open state shared by the toolbar toggle and zone control. Opening it retains the selected dock panel and the current Edit/Not workspace. Without a saved override it starts open at `>=90rem` and viewport height `>=800px`; its heading stays visible when collapsed on desktop/tablet. Open state and a height bounded to 120–480px persist in the existing preference store. The splitter supports pointer dragging, Arrow Up/Down, Shift for larger steps, and Home/End. Phone and short landscape layouts expose a Guitar trigger and move the same TAB/Fretboard content into a dedicated sheet. Irama has no Guitar entry.

The compatibility command `setViewMode("guitar")` remains accepted and selects Edit with Guitar open. Opening Guitar through its Not control instead preserves Not. TAB/Fretboard continue to project canonical melody notes.

Score has no independent scale/snap command: its notation uses Flow/Page/Split layout choices. Shared melody Snap/Zoom preferences remain relevant to the Piano Roll in Split. Drum Roll consumes the existing shared `editor.zoom` value through `setZoom()`, with 1x as its minimum displayed zoom; its Snap control also uses the shared `editor.snap` value through `setSnap()`. The four-bar view horizon extends only display space; no extra bars are added to the Song or transport duration.

### Verified operation coverage in `.79`

`tests/core-reachability.test.js` checks 30 operational targets: Guitar entry, Add Chord, two anchor actions and Generate, the three named mix channels, Snap/Zoom, Select/Draw and their Add Note/Select Range routes, exact Seek/Loop controls, Undo/Redo, and all eight project actions. These are operation targets, not a count of every feature row or every conditional action inside a panel.

| Breakpoint sample | Verified reveal budget for these 30 targets | Remaining route |
|---|---|---|
| `>=90rem`, 1600×900 | 30 targets require no disclosure/menu action | Horizontal scrolling of the visible compact strip is accepted where needed |
| `68–90rem`, 1200×900 | 26 targets require no disclosure/menu action; 4 project actions allow one | Examples, browser library, Save, and Save As use Proyek, as specified by the detailed header layout |
| `<=46rem`, 390×844 | All 30 targets meet a maximum of one reveal action | Detailed controls use their directly reachable sheet or editor-settings entry |

The test distinguishes operation controls from tabs, checks accessible labels and reachable reveal triggers, and requires compact controls outside the dock on desktop. It accepts a target reachable through an actually scrollable container. Therefore the zero-disclosure result is not a claim that every control is fully onscreen simultaneously. The detailed header rule's four medium-desktop menu actions remain an explicit exception to the brief's blanket zero-step wording. No separate per-target zero/one histogram is emitted for the phone sample.

The broader UI matrix checks 200 cells across seven viewport sizes and both themes. Guitar content with six strings and the selected melody note is verified in 32/32 explicit TAB/Fretboard/Not states; selected drum-expression controls and matching hit/track/velocity are verified in 10/10 states. Supported dual-dock states pass 12/12 checks, and the fourth drum bar is fully visible in both 1440×900 Irama theme samples. All cells have zero control/label overlaps and zero unreachable clips. Detailed panel controls retain their routes, so the matrix's strict common-control reveal total remains nonzero: default Edit is 8 at 1920×1080 and 1440×900, 17 at 1280×900, 24 at 1024×768, 36 at 390×844, and 32 at 844×390.

`npm test` passes 549/549 and `npm run check` passes. The CSS guard measures 223,856 normalized LF bytes, 527 B above PR12 and 144 B below the 224,000 B limit; the former 165 KB target is released. Evidence: [UI matrix](ui-audit/round2/pr13-16-final-v79/matrix.md), [JSON](ui-audit/round2/pr13-16-final-v79/results.json), [CSV](ui-audit/round2/pr13-16-final-v79/results.csv), [CSS coverage](ui-audit/round2/pr13-16-final-v79/css-coverage/report.md), and [full report with before/after screenshots](ui-audit.md#putaran-2-pr1316--guitar-dock-dan-kontrol-yang-terjangkau). These records describe local verification of `.79`.
