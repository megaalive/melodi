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

The UI defaults to Indonesian. Language switching is in-memory and supports Indonesian (`id`) and English (`en`).

## Theme

Melodi uses a graphite base with two accents: petrol for structure and ember for decisions the user has made. Ember is used sparingly, only for anchor notes, locked notes, the playhead, and focus. Generated notes are always lower contrast than user notes, and that rule holds in every view.

The page follows the operating system by default. The `theme` select offers `system`, `light`, and `dark`; a manual choice is stored in `localStorage` under `melodi.theme` and survives reload, while language stays in-memory. Dark mode avoids pure black and pure white because pure black blooms on OLED and pure white text is harsh in a dark theme.

Every canvas colour is a CSS custom property, including the SVG `fill` and `stroke` values in the Piano Roll and score, so both modes restyle from one token set. Tokens are declared as flat values first and upgraded to `light-dark()` pairs behind `@supports`, so a browser without `light-dark()` still renders a complete light theme instead of dropping every colour. Motion is reduced to near-zero under `prefers-reduced-motion: reduce`; state colour changes are kept, because anchor and locked feedback must stay readable.

## Layout

Above 46rem the workspace chrome is a single sticky row: transport and edit history on the left, tempo, loop, and the Advanced disclosure in the middle, view mode and Follow Mode on the right. Below 46rem the same chrome becomes a fixed bottom bar with 44px touch targets, so the canvas starts at the top of the page and playback stays under the thumb.

The Advanced panel is an absolutely positioned popover rather than inline content. That keeps the sticky bar a constant height, which is why no rule needs to guess how tall the bar is when the panel is open. Regions are shown from `VIEW_REGION_MODES` in `core/runtime-state.js`; an unknown region name is hidden rather than shown.

## Views

`score`, `piano-roll`, `combined`, `lyrics`, and `guitar` are set with `setViewMode`. The piano roll draws the active generation candidate in the gap between the anchors, so auditioning happens where the music already is rather than in a separate panel.

The roll's zoom follows the panel width and has a lower bound only. There is deliberately no upper bound: capping it left hundreds of pixels of undrawn grid on the right for short songs. When the grid is wider than the panel the panel scrolls horizontally instead.

The grid window always starts at bar 1 while the whole song fits inside `MAX_ROLL_BARS`. The window only follows the focus when a song genuinely exceeds that cap, where the priority is keeping the playhead reachable and the DOM bounded. Anchoring the window to the focus at all times is what made bar 1 and 2 vanish once a note in a later bar was selected: they fell outside the window, were never drawn, and could not be scrolled to because there was nothing there.

Scrolling is not taken away from the user. Auto-scroll runs only when the focus target actually changes, that is a different selection, a new candidate, or playback moving the playhead. `focusTick` falls back to the playhead, so re-running auto-scroll on every render would snap the view back to wherever the transport is stopped on any unrelated edit.

The guitar view is not a second timeline. It answers one question: which positions on a standard-tuned neck can play the selected note, and which of those sound cleanest. `findGuitarPositions(pitch, { tuning, maxFret })` returns every position as `{ string, fret }` with strings numbered the way a player numbers them, 6 being lowest. Positions at fret 12 or above are marked, because that register has the cleanest tone and most open resonance. Focus falls back from the selected note to the playing note to the first note, so the view is never blank while the song has notes. Played notes render as `data-entity="guitar-position"` with `data-note-id`, `data-string`, and `data-fret`.

Fret numbers are printed for every fret currently in use, not only every third fret, because a marker on fret 14 with no number next to it reads as being on the wrong fret. String names are printed together with their numbers, since this view orders the rows opposite to a chord diagram. `fretCenterX` is the single source of truth for where a fret sits, used by the wires, the numbers, the markers, and the inlays, so they cannot drift apart. The playhead is a bar and beat readout plus a heavier marker on the sounding note's positions, refreshed through `updatePlayback` only when the sounding note changes.

VexFlow writes its colours as SVG presentation attributes and inherits the rest. Staff lines are `<path>` elements with no `stroke` attribute at all, so they inherit the hardcoded `stroke="black"` from the root svg. The override therefore has to sit on the root plus every `vf-` class and the nested `<svg>`, scoped so it never touches Melodi's own labels. A presentation attribute always loses to a CSS rule, so this beats the hardcoded values without writing literal colours into the DOM, and a theme change needs no re-render.

## Contract tests

`availableActions` is a promise to an agent, so two tests hold it honest: every advertised name must be a function on the command object, and every advertised name must be re-exported on `window.melodi.commands`. The second test reads the `publicCommands` block out of `app.js` as text, because `app.js` touches the DOM and cannot be imported under Node.
