# Feature map — Putaran 2, baseline build 20261003.78

This inventory records the default-state route to each implemented user feature before PR13. It is derived from `src/core/snapshot.js` (`AVAILABLE_ACTIONS`), UI `data-action` hooks, `README.md`, and `PLAN.md`. It is a baseline, so findings such as missing or misrouted controls are recorded rather than treated as the intended destination.

## Counting rules

- Workspace abbreviations: **Edit**, **Not**, **Irama**, and **Global**. A view change is one step from the default Edit workspace.
- Breakpoint bins are disjoint: `>=90rem`; `68rem..<90rem`; `46rem..<68rem`; `<=46rem`. At exactly 46rem the phone bin applies; at 68rem and 90rem the larger bin applies.
- A step is an action needed to make the actual usable control visible: opening a closed disclosure, menu, panel, tab, or sheet each costs one step. A visible labelled tab is an entry point, not the panel's hidden controls. A wrong sheet body is marked unreachable (`∞`) until its route is fixed. Scrolling a canvas is not counted as opening a control, but clipped or out-of-viewport targets are reported separately by the UI audit.
- Steps are from the fresh/default state unless noted. State-conditional controls (selection, anchors, generation session, selected drum hit) include their condition in the row. A primary workspace view requires one workspace-tab action from default Edit.
- **Core** means the actual operational control must be visible at 0 steps for `>=68rem` and at no more than 1 step for `<=46rem`. This is stricter than merely having a visible tab. PR13 onward must preserve this definition and expose compact controls outside the dock where the panel cap would otherwise hide them.
- “Text” reports a visible text label on the control itself; an icon with only an accessible name is still “No” here.

## Implemented user features

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

## Reachability baseline for core features

The core inventory contains Guitar TAB/Fretboard, Chord (timeline, picker, progression), Generate (anchors through candidate acceptance), Mixer, Snap/Zoom, Select/Draw, Add Note, Seek/Range/Loop, Undo/Redo, and each of the eight project actions. In `.78`, the main known failures are inactive dock content, Alat-only controls, menu-only project actions, and the Guitar sheet route. The feature-step test in PR13 will produce exact per-workspace and per-breakpoint counts; those measured counts will be appended here rather than inferred from a raw hidden-element total.

Conditional actions will be audited with seeded history for Undo/Redo, seeded anchors and a generation session for candidate controls, a selected note for expression, and a selected percussion hit for drum expression. On a fresh project those conditional actions do not exist yet; their parent feature access is what is counted in the default-state map.

## Relevance and scope notes

- Snap applies to note and chord editing in Edit and to percussion steps in Irama. Zoom is currently a horizontal Piano Roll control; Score uses Flow/Page layout and Irama has no drum-zoom command/control, so Score and Drum Zoom are not applicable in `.78` unless a corresponding existing control is found. Do not add new musical functionality to address that absence.
- Guitar TAB and Fretboard both project the canonical melody. Their target is Edit and Not, never Irama; `setViewMode("guitar")` remains a supported command and maps to the Edit workspace.
- Mixer controls are cross-workspace because the channels are project mix state, though their displayed instruments vary with the workspace.
- Meter and key are shown in the song strip but do not have UI setters in `.78`. Do not count a read-only display as an editing action.
- Plan items for MIDI/MusicXML/WAV import, guitar-WAV transcription, and later PWA work are not current controls. They are not added by PR13–16. No Idea workspace, MIDI input, generator, Song/Share schema, or audio-engine feature is introduced.

## Stage updates

PR13–16 will append test/audit counts, screenshot references, desktop/mobile chrome, overlap/clipping findings, and released CSS size here or link the matching `docs/ui-audit/round2/` report. Existing `.78` observations above remain the before-state for comparison.
