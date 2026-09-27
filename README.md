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

`getState()` returns a detached snapshot with song identity and musical context, selection, anchor and locked note IDs, playback status, integer playhead tick, current note and section IDs, tempo, loop range, a bounded `generation` summary, and available commands. `getGenerationState()` includes the bounded candidate list with candidate IDs, note timing and pitches, score breakdown, and factual metadata. Candidate step and leap counts describe intervals between generated notes; `landingInterval` describes the final generated note to the right anchor. Candidate IDs are session identifiers; candidate-local note IDs are not canonical Song IDs. Song and snapshot reads return copies. Invalid commands throw a `MelodiError` with a stable `code` and leave canonical state unchanged. UI controls and browser automation use the same command layer. The public browser surface exposes bounded user commands only; it does not expose AudioContext or scheduler internals.

Successful commands commit canonical state before notifying the view. If `onChange` fails, the command still returns its success result and passes the view error to `onNotificationError` (the app logs it); notification errors do not roll back or masquerade as domain failures. Selection changes use the same notification behavior.

## Playback

Musical positions stay in integer ticks at PPQ 480. Tick conversion treats tempo as quarter notes per minute: `seconds = ticks * 60 / (480 * bpm)`. The Web Audio player creates its AudioContext on Play, anchors tick positions to `AudioContext.currentTime`, and schedules a 120 ms look-ahead window. A 25 ms JavaScript interval only wakes the scheduler; it does not advance the playhead.

Tempo commands accept finite BPM values from 20 through 300. Changing tempo during playback samples the current integer tick using the old tempo, cancels scheduled voices, and anchors future events at that tick using the new tempo. Pause keeps the current tick and does not suspend AudioContext. Stop and natural end reset to tick 0 and clear the active note. Seeking into a note retriggers its remaining duration. Stop has no active note; an explicit seek to a note's tick projects that note immediately.

The current note uses half-open note ranges `[startTick, startTick + durationTicks)`. When notes overlap, the latest onset wins, then the lexically smallest note ID. During a gap, currentNoteId is null. Current section follows section → phrase → note membership for an active note. In a gap, it is inferred from the first canonical section whose member-note span contains the tick; sections without member notes do not match.

Loop start and end use integer ticks and the end is exclusive. Loop times are derived from the same audio-time anchor and integer cycle offsets, so each cycle does not accumulate its predecessor's rounding error. Notes are cut at the loop boundary. If playback starts before loop start, notes before that point play once; notes spanning loop start retrigger there on later cycles. When loop is enabled, seeking to or beyond loop end maps the playhead to its corresponding position inside the range; positions before loop start remain exact so the intro can play once.

Audio starts only from a trusted Play gesture when the browser requires activation. A rejected or still-suspended start returns a stable `MelodiError` and playback remains stopped or paused. The UI handles the Promise directly in the button event so browser activation is preserved.

Section state is no longer assumed to be the first section; it is projected from canonical membership and the current tick.

Important controls use stable `data-action` hooks. Rendered notes use `data-entity="note"` and `data-entity-id="<note-id>"`; candidates use `data-entity="melody-candidate"` and their candidate ID. Automation should use these hooks rather than visual CSS classes or list position.

The UI defaults to Indonesian. Language switching is in-memory and supports Indonesian (`id`) and English (`en`).
