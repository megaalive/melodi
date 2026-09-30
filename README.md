# Melodi

Melodi is a static, vanilla JavaScript songwriting shell with a canonical song model, a Web Audio melody player, and a bounded melody gap generator. It has zero runtime dependencies and saves canonical project drafts in browser storage.

## Run

Use Node.js with native ES module and `node:test` support:

```sh
npm test
npm run check
```

Serve this directory with any static HTTP server and open its `index.html`. For example, `python -m http.server 8000` serves the local root at `http://localhost:8000/`.

## Canonical model

The project model is plain serializable data. `timing.ppq` is fixed at 480; note and chord positions are safe integer ticks, and durations are positive integer ticks. `note.pitch` is the only canonical pitch value and is an integer MIDI pitch from 0 through 127 (`C4 = 60`). Note names in the UI are derived from that value.

Each song, note, phrase, section, lyric syllable, and chord has a stable ID. IDs are independent of display order. Raw lyric text is stored separately from syllable mapping. A syllable's ordered `noteIds` can be empty or reference several notes for melisma. Deleting a note removes its references from phrases and lyric mappings as part of the same command.

## Browser automation contract

The page exposes a small frozen surface at `window.melodi`:
```js
window.melodi.getState()
window.melodi.commands.getSong()
window.melodi.commands.getSelection()
window.melodi.commands.addNote({ pitch: 60, startTick: 1920, durationTicks: 480 })
window.melodi.commands.updateNote(noteId, { pitch: 62 })
window.melodi.commands.deleteNote(noteId)
window.melodi.commands.setLyrics("raw lyric text")
window.melodi.commands.setAnchor(noteId, true)
window.melodi.commands.setLocked(noteId, true)
window.melodi.commands.selectRange(0, 1920)
window.melodi.commands.play()
window.melodi.commands.pause()
window.melodi.commands.stop()
window.melodi.commands.seek(480)
window.melodi.commands.setTempo(96)
window.melodi.commands.setLoop(0, 1920)
window.melodi.commands.setLoopEnabled(true)
window.melodi.commands.setViewMode("guitar")
window.melodi.commands.setZoom(2)
window.melodi.commands.setSnap("1/16")
window.melodi.commands.setTool("select") // "select" | "draw"
window.melodi.commands.undo()
window.melodi.commands.redo()
window.melodi.commands.canUndo()
window.melodi.commands.canRedo()
window.melodi.commands.generateGap({ startTick: 480, endTick: 1440, seed: 1 })
window.melodi.commands.getGenerationState()
window.melodi.commands.selectCandidate(candidateId)
await window.melodi.commands.auditionCandidate(candidateId)
window.melodi.commands.acceptCandidate(candidateId)
window.melodi.commands.lockAcceptedNotes()
window.melodi.commands.regenerateGap()
window.melodi.commands.clearGeneration()
```

`generateGap()` accepts an explicit half-open tick range and deterministic seed. The range must be bounded by two anchor notes in the same phrase, have a length and boundaries on the 120-tick grid, and contain no notes. Optional runtime settings are `voiceRange: { minPitch, maxPitch }`, `styleProfile`, and `lyricSyllableCount`; lyric counts are never inferred from raw text. Generation, selection, regeneration, and audition keep candidates in runtime state. Accept adds generated notes to the canonical Song and the owning phrase in one commit; `lockAcceptedNotes()` uses the normal user lock command.

`getState()` returns a detached snapshot with song identity and musical context, selection, anchor and locked note IDs, playback status, integer playhead tick, current note and section IDs, tempo, loop range, a bounded `generation` summary, edit `history` depths, and available commands. `getGenerationState()` includes the bounded candidate list with candidate IDs, note timing and pitches, score breakdown, and factual metadata. Candidate step and leap counts describe intervals between generated notes; `landingInterval` describes the final generated note to the right anchor. Candidate IDs are session identifiers; candidate-local note IDs are not canonical Song IDs. Song and snapshot reads return copies. Invalid commands throw a `MelodiError` with a stable `code` and leave canonical state unchanged. UI controls and browser automation use the same command layer. The public browser surface exposes bounded user commands only; it does not expose AudioContext or scheduler internals.

## Project files

Use **Save file** to download the canonical project as `.melodi.json`, and **Open file** to load it back into Melodi. The file is versioned through `schemaVersion` and stores the canonical music project, including timing, key/scale, sections, phrases, notes, pitch bend, lyrics mappings, and chords. Playback/editor runtime state is intentionally not stored.

Browser agents can use:

```js
const text = window.melodi.commands.exportProject();
window.melodi.commands.importProject(text);
```

## Share URL

Melodi packages new share links in the query string, for example `?m=1.j....`. Query payloads survive external redirects and link wrappers more reliably than fragments. Existing `#m=...` links remain supported for backward compatibility.

The v1 share envelope is deliberately track-oriented. Today it carries the lead melody/lyrics track and a harmony/chord track; future readers can add guitar, bass, drums, automation, and other instrument tracks without changing old links. Canonical entity UUIDs are not embedded in the URL. Portable relationships use indexes and fresh IDs are generated when a shared project is opened.

Small projects use plain Base64URL (`1.j`) so opening a simple link does not depend on browser decompression support. Larger projects use native gzip `CompressionStream` (`1.g`) when available. Opening a share link is ephemeral: it does not overwrite the existing local autosave draft until the user explicitly chooses **Save draft**.

## Edit history

`undo()` and `redo()` restore canonical song snapshots. Every canonical mutation goes through one commit path, so history covers notes, lyrics, tempo, and `newIdea()`. Selection, clipboard, loop, snap, and view mode are not canonical and are deliberately excluded: undoing them would move state the user never chose to change.

`getState().history` exposes `canUndo`, `canRedo`, `undoDepth`, and `redoDepth` so a UI or an agent can read whether a step is available instead of guessing. `undo()` with an empty stack throws `nothing-to-undo`, and `redo()` with an empty stack throws `nothing-to-redo`. A new canonical change discards the redo branch. The stack is bounded at 100 entries.

Undoing discards any in-flight generation session rather than marking it stale, because a candidate references notes that the restored song may no longer contain. Undo returns a detached copy, and playback is re-anchored at the current tick rather than reset.

Keyboard: `Cmd/Ctrl+Z` undoes, `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y` redo. The shortcuts are global rather than scoped to an editor, but they stand down inside text inputs so native text undo still works while typing lyrics.

Successful commands commit canonical state before notifying the view. If `onChange` fails, the command still returns its success result and passes the view error to `onNotificationError` (the app logs it); notification errors do not roll back or masquerade as domain failures. Selection changes use the same notification behavior.

## Playback

Musical positions stay in integer ticks at PPQ 480. Tick conversion treats tempo as quarter notes per minute: `seconds = ticks * 60 / (480 * bpm)`. The Web Audio player creates its AudioContext on Play, anchors tick positions to `AudioContext.currentTime`, and schedules a 120 ms look-ahead window. A 25 ms JavaScript interval only wakes the scheduler; it does not advance the playhead.

Tempo commands accept finite BPM values from 20 through 300. Changing tempo during playback samples the current integer tick using the old tempo, cancels scheduled voices, and anchors future events at that tick using the new tempo. Pause keeps the current tick and does not suspend AudioContext. Stop and natural end reset to tick 0 and clear the active note. Seeking into a note retriggers its remaining duration. Stop has no active note; an explicit seek to a note's tick projects that note immediately.

The current note uses half-open note ranges `[startTick, startTick + durationTicks)`. When notes overlap, the latest onset wins, then the lexically smallest note ID. During a gap, currentNoteId is null. Current section follows section → phrase → note membership for an active note. In a gap, it is inferred from the first canonical section whose member-note span contains the tick; sections without member notes do not match.

Loop start and end use integer ticks and the end is exclusive. Loop times are derived from the same audio-time anchor and integer cycle offsets, so each cycle does not accumulate its predecessor's rounding error. Notes are cut at the loop boundary. If playback starts before loop start, notes before that point play once; notes spanning loop start retrigger there on later cycles. When loop is enabled, seeking to or beyond loop end maps the playhead to its corresponding position inside the range; positions before loop start remain exact so the intro can play once.

Audio starts only from a trusted Play gesture when the browser requires activation. A rejected or still-suspended start returns a stable `MelodiError` and playback remains stopped or paused. The UI handles the Promise directly in the button event so browser activation is preserved.

Section state is no longer assumed to be the first section; it is projected from canonical membership and the current tick.

Important controls use stable `data-action` hooks. Rendered notes use `data-entity="note"` and `data-entity-id="<note-id>"`; candidates use `data-entity="melody-candidate"` and their candidate ID. Automation should use these hooks rather than visual CSS classes or list position.

`undo` and `redo` are exposed both as buttons and as `data-action` hooks. Transpose and duration edits are available as `data-action="transpose-selected"` and `data-action="set-selected-duration"` in the Piano Roll toolbar, so no edit is reachable only through the note context menu. The context menu keeps its own `context-transpose` and `context-duration` hooks; both names run the same command path.

`setZoom(zoom)` sets horizontal roll zoom and `getState().editor.zoom` reads it back.

The UI defaults to Indonesian. Language switching is in-memory and supports Indonesian (`id`) and English (`en`).

## Theme

Melodi uses a graphite base with two accents: petrol for structure and ember for decisions the user has made. Ember is used sparingly, only for anchor notes, locked notes, the playhead, and focus. Generated notes are always lower contrast than user notes, and that rule holds in every view.

The page follows the operating system by default. The `theme` select offers `system`, `light`, and `dark`; a manual choice is stored in `localStorage` under `melodi.theme` and survives reload, while language stays in-memory. Dark mode avoids pure black and pure white because pure black blooms on OLED and pure white text is harsh in a dark theme.

Every canvas colour is a CSS custom property, including the SVG `fill` and `stroke` values in the Piano Roll and score, so both modes restyle from one token set. Tokens are declared as flat values first and upgraded to `light-dark()` pairs behind `@supports`, so a browser without `light-dark()` still renders a complete light theme instead of dropping every colour. Motion is reduced to near-zero under `prefers-reduced-motion: reduce`; state colour changes are kept, because anchor and locked feedback must stay readable.

## Type

All typography comes from six steps, `--text-2xs` through `--text-xl`. This replaced nineteen free-floating `font-size` values spread across the stylesheet, which was the single biggest reason the interface did not read as deliberate: no two parts of the UI could be sure they had chosen the same size on purpose. Glyph sizes such as the transport symbols are intentionally not on the scale, because those are icon sizes rather than typography.

## Layout

Above 46rem the workspace chrome is a single sticky row: transport and edit history on the left, tempo, loop, and the Advanced disclosure in the middle, view mode and Follow Mode on the right. Below 46rem the same chrome becomes a fixed bottom bar with 44px touch targets, so the canvas starts at the top of the page and playback stays under the thumb.

The Advanced panel is an absolutely positioned popover rather than inline content. That keeps the sticky bar a constant height, which is why no rule needs to guess how tall the bar is when the panel is open. Regions are shown from `VIEW_REGION_MODES` in `core/runtime-state.js`; an unknown region name is hidden rather than shown.

The song strip is deliberately not merged into the chrome, so there are still four bands rather than two. Measured below 46rem, the fixed bottom chrome is already 223px of a 780px viewport. Folding the 78px song strip into it would make the permanently visible chrome 301px, which is 39% of the screen, and would push the canvas down rather than reclaim space. The bands are cheap because the two of them that matter scroll away: the page header and the song strip are `static`, and only the chrome is fixed. The real cost on a small screen is the height of the fixed chrome, not the number of bands, and that is a progressive-disclosure problem rather than a band-counting one.


## Views

`score`, `piano-roll`, `combined`, `lyrics`, and `guitar` are set with `setViewMode`. The piano roll draws the active generation candidate in the gap between the anchors, so auditioning happens where the music already is rather than in a separate panel.

Every row of the roll is labelled with its pitch, not just the C rows. With only the C rows labelled, reading a melody means counting semitones upwards from the nearest C, which is exactly the arithmetic a piano roll is supposed to remove. Black key labels use `--text-muted` so a full octave of twelve labels stays quiet and the white keys stay findable. The gutter is fixed at 56px, so `C#4` at `--text-xs` fits without clipping.

The roll also shows the candidates that are not selected, as a single faint layer behind the active one. Comparing options is the point of having six of them, and reading six score breakdown cards to work out which one goes higher is not comparison. The layer uses `opacity` on the wrapping `g` rather than `fill-opacity` on each rectangle: several candidates often land on the same pitch, and per-element alpha accumulates, so a stack of five ghosts at `0.16` composites to roughly `0.57` and competes with the active candidate it is meant to sit behind.

An empty song gets guidance instead of a blank grid: the roll explains that clicking adds a note and that the New button fills in C-E-G-A. It points at affordances that already exist instead of adding a command, and it is an absolutely positioned layer over the grid rather than a replacement for it, so the grid the user is being told to click stays visible.

The roll's zoom is centered on a 100% Fit view. Above 100%, the grid becomes wider than the panel and scrolls horizontally. Below 100%, the renderer extends the visible timeline with additional bars (up to the existing 64-bar safety cap), so zooming out exposes more musical context instead of shrinking the SVG and leaving dead space.

Horizontal zoom is a user multiplier from 0.5x to 4x in quarter steps, set with `setZoom(zoom)` and read from `getState().editor.zoom`. 1x remains the default and reset value; 75% and 50% are genuine zoom-out levels.

The Piano Roll has an explicit editor tool in `getState().editor.tool`. `select` is the safe default: blank clicks only clear selection, blank drags make a box selection, and note drags move or resize notes. `draw` must be chosen deliberately before blank pointer gestures create notes; clicking creates one snapped note and horizontal dragging sets its duration. Existing notes do not move while Draw is active. The toolbar, keyboard shortcuts (`V` Select, `D` Draw), Command Palette, and `setTool()` all use the same runtime state. Zoom is a multiplier rather than an absolute pixel value so it stays meaningful when the window is resized. `-`, `+`, and `0` step it from inside the editor only, deliberately leaving `Ctrl`+`Plus` and `Ctrl`+`Minus` to the browser for page zoom.

The grid window always starts at bar 1 while the whole song fits inside `MAX_ROLL_BARS`. The window only follows the focus when a song genuinely exceeds that cap, where the priority is keeping the playhead reachable and the DOM bounded. Anchoring the window to the focus at all times is what made bar 1 and 2 vanish once a note in a later bar was selected: they fell outside the window, were never drawn, and could not be scrolled to because there was nothing there.

Scrolling is not taken away from the user. Auto-scroll runs only when the focus target actually changes, that is a different selection, a new candidate, or playback moving the playhead. `focusTick` falls back to the playhead, so re-running auto-scroll on every render would snap the view back to wherever the transport is stopped on any unrelated edit.

The guitar view is not a second timeline. It answers one question: which positions on a standard-tuned neck can play the selected note. `findGuitarPositions(pitch, { tuning, maxFret })` returns every position as `{ string, fret }` with strings numbered the way a player numbers them, 6 being lowest. Focus falls back from the selected note to the playing note to the first note, so the view is never blank while the song has notes. Played notes render as `data-entity="guitar-position"` with `data-note-id`, `data-string`, and `data-fret`.

Every position is drawn in the same colour, because all of them are valid and a two-tone split reads as some being right and some being wrong. Only genuinely different techniques are marked: an open circle for an open string, and a heavier marker on the sounding note during playback. The orange line at fret 12 marks the octave boundary, where the same note reappears one octave up. Fret numbers are printed for every fret currently in use, not only every third fret, because a marker on fret 14 with no number next to it reads as being on the wrong fret. String names are printed together with their numbers, since this view orders the rows opposite to a chord diagram. `fretCenterX` is the single source of truth for where a fret sits, used by the wires, the numbers, the markers, and the inlays, so they cannot drift apart. The playhead is a bar and beat readout plus a heavier marker on the sounding note's positions, refreshed through `updatePlayback` only when the sounding note changes.

VexFlow writes its colours as SVG presentation attributes and inherits the rest. Staff lines are `<path>` elements with no `stroke` attribute at all, so they inherit the hardcoded `stroke="black"` from the root svg. The override therefore has to sit on the root plus every `vf-` class and the nested `<svg>`, scoped so it never touches Melodi's own labels. A presentation attribute always loses to a CSS rule, so this beats the hardcoded values without writing literal colours into the DOM, and a theme change needs no re-render.

## Command palette

`Ctrl+K`, or the header button, opens the palette. It is a native `<dialog>`, so top layer, focus trap, and Escape come from the browser rather than being re-implemented. Arrow keys and `Home`/`End` move the selection, `Enter` runs it, and focus returns to whatever opened the palette.

The palette is a shortcut, never the only way in. Every entry calls the same command layer the visible buttons call, so nothing becomes palette-only. Entries that cannot run right now are shown dimmed with `aria-disabled` rather than hidden, which tells the user the action exists.

Filtering matches the label the user can actually read, not the internal message key, and accepts keywords from both languages so an Indonesian UI still answers to English terms. Matching is case, accent, and whitespace insensitive, and every whitespace-separated term must match so extra words narrow the result.

The opener is a real button, not only a shortcut. A hidden shortcut cannot be discovered, and on a touch device there is no Ctrl key at all.

`ui/command-palette.js` keeps the catalogue and the filter as pure functions with no DOM, so both are unit tested under Node: unique ids and label keys, every entry performing cleanly against a stub context, and availability derived from state instead of hardcoded.

## Contract tests

`availableActions` is a promise to an agent, so two tests hold it honest: every advertised name must be a function on the command object, and every advertised name must be re-exported on `window.melodi.commands`. The second test reads the `publicCommands` block out of `app.js` as text, because `app.js` touches the DOM and cannot be imported under Node.

## Module graph test

`npm test` did not import `src/i18n/messages.js` at all, so a missing comma in a message object shipped a blank application with all tests green. `npm run check` caught it, but only when someone remembered to run it. `tests/module-graph.test.js` closes that gap two ways: every module that does not need the DOM is genuinely imported, and every relative import specifier in every file under `src` is resolved to a real file. The second half works even for the DOM modules, so renaming a module without fixing its importers fails the suite instead of the browser.

Four files are listed in `DOM_TOUCHING` because they read the DOM at import time. A test asserts that list is still accurate, so a module that grows a DOM dependency cannot slip through by being quietly unlisted.

The piano roll is exercised through a small SVG stub, which keeps `tests/piano-roll-render.test.js` about what gets drawn rather than about pointer behaviour. Its generation fixture sets `status: "ready"` on purpose: `normalizeRuntimeState` drops every candidate when status is not ready, so a fixture that omits it would make each candidate test pass against an empty roll.

## Phrase membership

`addNote` and `pasteNotes` register the new note in `phrases[0].noteIds`, inserted in tick order. This is not bookkeeping for its own sake: `createGenerationContext` fails with `generation-cross-phrase` unless both anchors are in the same phrase, so a song built by clicking notes in the roll could never have a gap filled. Notes added by hand are exactly the ones a user wants to extend, which made the flagship generation flow unreachable for them. Order matters because `acceptCandidate` splices accepted notes in by indexing `noteIds` at the right anchor.


## Harmoni R5-A

Inspector Harmoni menawarkan beberapa triad dari range eksplisit `[startTick, endTick)`.
Keluarga fungsi dibatasi ke tonik (I/III/VI), predominan (II/IV), dan dominan
(V/VII) untuk mayor dan minor natural tujuh nada. Scale tujuh nada lain memakai
fungsi `other`; scale selain tujuh nada ditolak. Ini model sederhana, bukan kepastian teori.
Preview kandidat tetap visual; chord yang diterima berbunyi melalui guide synth Harmoni dan Bass R5-B.
Chord diterima langsung masuk Song dan Score. Kandidat runtime dibersihkan sesudah
edit canonical. Chord terkunci harus dibuka secara eksplisit sebelum edit/hapus;
range persis yang unlocked dapat diganti, overlap parsial ditolak.

```js
const api = window.melodi.commands;
const session = api.suggestHarmony({ startTick: 0, endTick: 1920 });
api.selectHarmonyCandidate(session.candidates[0].id);
const chord = api.acceptHarmonyCandidate(session.candidates[0].id);
api.setChordLocked(chord.id, true);
api.getHarmonyState();
api.setChordLocked(chord.id, false);
api.updateChord(chord.id, { rootPitchClass: 5, quality: "major" });
api.deleteChord(chord.id);
api.addChord({ rootPitchClass: 0, quality: "minor", startTick: 0, durationTicks: 1920 });
api.clearHarmonySuggestions();
```

Lane Chord di atas pitch Piano Roll menjadi editor utama: Pilih untuk memilih,
Gambar untuk membuat blok. Snap chord menyediakan birama, setengah birama, dan beat.
Geser blok terpilih untuk memindahkan, atau handle kanan untuk mengubah durasi; satu gesture satu Undo. Klik kanan/tekan lama membuka Ubah, Kunci, Duplikat, dan Hapus. Root/kualitas memakai form ringkas; range ditampilkan sebagai birama. Lane tetap terlihat saat kosong, dan daftar samping memuat semua chord secara kronologis. Seleksi note/range atau birama yang diklik menjadi konteks usulan. Default mengikuti meter (6/8: satu birama 1440 tick internal). Agent tetap memakai addChord/updateChord dan suggestHarmony dengan tick; selectChord, clearChordSelection, setHarmonyRange, dan setChordSnap tersedia sebagai state runtime, tidak diserialisasi. Semua edit memakai command canonical undo/redo.


Skor deterministik memakai durasi overlap dikali bobot onset: awal birama 2,
awal beat 1.5, posisi lain 1. Skor adalah `100 × weightedCoverage - 20 ×
penaltyWeight / totalWeight + 2 × matchedChordToneCount`. Penalti hanya untuk
non-chord tone pada posisi kuat yang overlap setidaknya 240 tick. Maksimal empat
kandidat diurutkan menurut skor, lalu degree; ID kandidat hanya identitas runtime.
Metadata menyertakan bobot, cakupan, durasi cocok/tidak cocok, dan pitch class triad.

Project schema v4 menyimpan `locked` secara eksplisit; v1–v3 dibaca sebagai
unlocked. Share v6 memakai bit 0 flag chord; v1–v5 tetap dibaca unlocked dan
semantik volume v5 tetap dipertahankan. Sesi kandidat, selection, serta M/S tidak
disimpan sebagai keputusan harmoni.

## Sketch accompaniment R5-B

Chord canonical menjadi sumber playback Harmoni dan Bass; event turunan tidak
ditambahkan ke `song.notes`. Harmoni memakai triad blok dengan voice leading
inversi terbatas, atau arpeggio quarter di 4/4 dan eighth berkelompok di 6/8.
Bass memakai root rendah atau root/fifth (pulse dotted-quarter untuk 6/8).
Guide synth internal berbagi clock/scheduler Web Audio yang sama dengan Melody
dan Drums. Range, boundary chord, dan loop membatasi event.

Inspector Harmoni menyediakan Mute, Volume 0–100%, dan pilihan pola per channel.
Style/volume `song.sketch` persistent dan undoable; Mute runtime-only. Perubahan
mix/pola saat playback menjadwalkan ulang dari posisi sekarang. Project schema v5
dan Share v7 menyimpan pengaturan; format lama tetap dibaca dengan default
block/root dan unity. Lock chord serta volume Melody/percussion tetap dipertahankan.

```js
api.setHarmonyStyle("arpeggio");
api.setBassStyle("root-fifth");
api.setInstrumentVolume("harmony", 0.65);
api.setInstrumentMute("bass", true);
```

Tidak ada groove generator, mode playback final, atau R5-C dalam tahap ini.
