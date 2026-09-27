# Melodi

Melodi R0 is a static, vanilla JavaScript shell for a canonical song model. It has no runtime dependencies, audio playback, generator, or persistence layer.

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
```

`getState()` returns a detached snapshot with song identity and musical context, selection, anchor and locked note IDs, and available R0 commands. Song and snapshot reads return copies. Invalid commands throw a `MelodiError` with a stable `code` and leave canonical state unchanged. UI controls and browser automation use the same command layer. The public browser surface exposes user commands only; actor selection stays inside the application boundary.

Successful commands commit canonical state before notifying the view. If `onChange` fails, the command still returns its success result and passes the view error to `onNotificationError` (the app logs it); notification errors do not roll back or masquerade as domain failures. Selection changes use the same notification behavior.

R0 has no section-switching command, so the snapshot reports the song's first section as current when one exists.

Important controls use stable `data-action` hooks. Rendered notes use `data-entity="note"` and `data-entity-id="<note-id>"`; automation should use these hooks rather than visual CSS classes or list position.

The UI defaults to Indonesian. Language switching is in-memory and supports Indonesian (`id`) and English (`en`).
