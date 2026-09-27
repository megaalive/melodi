import { cloneData, createId, createInitialSong, createSong, MelodiError } from "./model.js";
import { DEFAULT_SNAP, SNAP_TICKS } from "./editor.js";
import { createAgentSnapshot } from "./snapshot.js";
import { projectPlaybackState, validateLoop, validateTempo, validateTick, wrapLoopTick } from "../audio/transport.js";

function fail(code) {
  throw new MelodiError(code);
}

function validateActor(actor) {
  if (actor !== "user" && actor !== "generator") fail("invalid-actor");
}

function validatePatch(patch) {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) fail("invalid-note");
  const keys = Object.keys(patch);
  const allowed = new Set(["pitch", "startTick", "durationTicks"]);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) fail("invalid-note-patch");
}

function reportUnobservedNotificationError(error) {
  console.error("Melodi notification failed after canonical state was committed.", error);
}

export function createCommands(initialSong, {
  idFactory = createId,
  onChange = () => {},
  onEditorChange = () => {},
  onPlaybackChange = () => {},
  onPlaybackEvent = () => {},
  onNotificationError = reportUnobservedNotificationError,
  audioPlayerFactory = null
} = {}) {
  let song = createSong(initialSong);
  let selection = null;
  let selectedNoteIds = [];
  let snap = DEFAULT_SNAP;
  let viewMode = "combined";
  let followMode = true;
  let copiedNotes = null;
  const songEndTick = () => song.notes.reduce((end, note) => Math.max(end, note.startTick + note.durationTicks), 0);
  const playback = {
    status: "stopped",
    currentTick: 0,
    currentNoteId: null,
    currentSectionId: null,
    loop: { enabled: false, startTick: 0, endTick: Math.max(1, songEndTick()) }
  };
  let activeNoteSuppressed = true;
  let audioPlayer = null;
  let playRequest = 0;

  function notifyChange(kind = "song") {
    try {
      onChange({ kind });
    } catch (error) {
      try {
        onNotificationError(error);
      } catch (reportingError) {
        console.error("Melodi notification error handler failed after canonical state was committed.", reportingError, error);
      }
    }
  }

  function notifyEditorChange() {
    try {
      onEditorChange();
    } catch (error) {
      try { onNotificationError(error); } catch {}
    }
  }

  function notifyPlaybackChange() {
    try {
      onPlaybackChange();
    } catch (error) {
      try {
        onNotificationError(error);
      } catch (reportingError) {
        console.error("Melodi playback notification error handler failed.", reportingError, error);
      }
    }
  }

  function notifyPlaybackEvent(event, detail) {
    try {
      onPlaybackEvent(event, detail);
    } catch (error) {
      try { onNotificationError(error); } catch {}
    }
  }

  function setPlaybackPosition(tick) {
    playback.currentTick = tick;
    const projection = projectPlaybackState(song, tick, playback.status, playback.loop);
    playback.currentNoteId = projection.currentNoteId;
    playback.currentSectionId = projection.currentSectionId;
  }

  function readPlayback() {
    if (playback.status === "playing" && audioPlayer) {
      try { setPlaybackPosition(audioPlayer.getPosition()); } catch {}
    }
    const state = projectPlaybackState(song, playback.currentTick, playback.status, playback.loop);
    if (activeNoteSuppressed) state.currentNoteId = null;
    return state;
  }

  function handlePlayerError(error) {
    if (playback.status === "playing") playback.status = "paused";
    if (audioPlayer) {
      try { setPlaybackPosition(audioPlayer.getPosition()); } catch {}
    }
    notifyPlaybackChange();
    notifyPlaybackEvent("error", error);
    try { onNotificationError(error); } catch {}
  }

  function updatePlayerSafely(operation) {
    if (!audioPlayer) return;
    try {
      operation();
    } catch (error) {
      handlePlayerError(error);
    }
  }

  function commit(mutator, afterCommit = () => {}) {
    const candidate = cloneData(song);
    const result = mutator(candidate);
    const validated = createSong(candidate);
    song = validated;
    afterCommit();
    notifyChange("song");
    return result;
  }

  if (typeof audioPlayerFactory === "function") {
    audioPlayer = audioPlayerFactory({
      getSong: () => cloneData(song),
      onPosition(tick) {
        setPlaybackPosition(tick);
        notifyPlaybackChange();
      },
      onComplete() {
        playback.status = "stopped";
        activeNoteSuppressed = true;
        setPlaybackPosition(0);
        notifyPlaybackChange();
        notifyPlaybackEvent("ended");
      },
      onInterrupted(tick) {
        if (playback.status === "playing") playback.status = "paused";
        activeNoteSuppressed = false;
        setPlaybackPosition(tick);
        notifyPlaybackChange();
        notifyPlaybackEvent("interrupted");
      },
      onError: handlePlayerError
    });
  }

  const commands = {
    getSong() {
      return cloneData(song);
    },
    getSelection() {
      return cloneData(selection);
    },
    getSelectedNoteIds() {
      return cloneData(selectedNoteIds);
    },
    getState() {
      return createAgentSnapshot(song, selection, readPlayback(), {
        snap,
        canPaste: Boolean(copiedNotes),
        clipboardCount: copiedNotes?.notes.length ?? 0
      }, selectedNoteIds, { mode: viewMode, follow: followMode });
    },
    setViewMode(mode) {
      if (!["score", "piano-roll", "combined", "lyrics"].includes(mode)) fail("invalid-view-mode");
      viewMode = mode;
      notifyChange("view");
      return viewMode;
    },
    setFollowMode(enabled) {
      if (typeof enabled !== "boolean") fail("invalid-follow-mode");
      followMode = enabled;
      notifyChange("view");
      return followMode;
    },
    async play() {
      if (!audioPlayer) fail("audio-unavailable");
      if (playback.status === "playing") return readPlayback();
      const request = ++playRequest;
      let tick = playback.currentTick;
      if (!playback.loop.enabled && tick >= songEndTick()) tick = 0;
      const started = await audioPlayer.play(tick, { tempo: song.timing.tempo, loop: playback.loop });
      if (!started || request !== playRequest) return readPlayback();
      playback.status = "playing";
      activeNoteSuppressed = false;
      setPlaybackPosition(audioPlayer.getPosition());
      notifyPlaybackChange();
      return readPlayback();
    },
    pause() {
      playRequest += 1;
      const wasPlaying = playback.status === "playing";
      const tick = audioPlayer ? audioPlayer.pause() : playback.currentTick;
      if (wasPlaying) playback.status = "paused";
      if (wasPlaying) activeNoteSuppressed = false;
      setPlaybackPosition(wasPlaying ? tick : playback.currentTick);
      notifyPlaybackChange();
      return readPlayback();
    },
    stop() {
      playRequest += 1;
      if (audioPlayer) audioPlayer.stop();
      playback.status = "stopped";
      activeNoteSuppressed = true;
      setPlaybackPosition(0);
      notifyPlaybackChange();
      return readPlayback();
    },
    seek(tick) {
      validateTick(tick);
      const position = wrapLoopTick(tick, playback.loop);
      playRequest += 1;
      updatePlayerSafely(() => audioPlayer.seek(position, {
        tempo: song.timing.tempo,
        loop: playback.loop,
        playing: playback.status === "playing"
      }));
      activeNoteSuppressed = false;
      setPlaybackPosition(position);
      notifyPlaybackChange();
      return readPlayback();
    },
    setTempo(tempo) {
      validateTempo(tempo);
      commit((candidate) => { candidate.timing.tempo = tempo; }, () => {
        // Sample the old tempo clock and re-anchor before the view renders. Rendering
        // can take long enough for a pre-commit sample to become stale.
        let tick = playback.currentTick;
        if (playback.status === "playing" && audioPlayer) {
          try { tick = audioPlayer.getPosition(); } catch {}
        }
        playRequest += 1;
        updatePlayerSafely(() => audioPlayer?.updateTempo(tempo, tick, playback.status === "playing"));
        setPlaybackPosition(tick);
      });
      return tempo;
    },
    setLoop(startTick, endTick) {
      const nextLoop = validateLoop(startTick, endTick);
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      playback.loop = { ...playback.loop, ...nextLoop };
      const position = wrapLoopTick(tick, playback.loop);
      playRequest += 1;
      updatePlayerSafely(() => audioPlayer?.updateLoop(playback.loop, position, playback.status === "playing"));
      setPlaybackPosition(position);
      notifyPlaybackChange();
      return { ...playback.loop };
    },
    setLoopEnabled(enabled) {
      if (typeof enabled !== "boolean") fail("invalid-loop");
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      playback.loop = { ...playback.loop, enabled };
      const position = wrapLoopTick(tick, playback.loop);
      playRequest += 1;
      updatePlayerSafely(() => audioPlayer?.updateLoop(playback.loop, position, playback.status === "playing"));
      setPlaybackPosition(position);
      notifyPlaybackChange();
      return enabled;
    },
    addNote(input, { actor = "user" } = {}) {
      validateActor(actor);
      if (input === null || typeof input !== "object" || Array.isArray(input)) fail("invalid-note");
      const allowed = new Set(["pitch", "startTick", "durationTicks"]);
      if (Object.keys(input).some((key) => !allowed.has(key))) fail("invalid-note");
      const note = {
        id: idFactory(),
        pitch: input.pitch,
        startTick: input.startTick,
        durationTicks: input.durationTicks,
        source: actor === "generator" ? "generated" : "user",
        anchor: false,
        locked: false
      };
      commit((candidate) => candidate.notes.push(note));
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick));
      return cloneData(note);
    },
    updateNotes(updates, { actor = "user" } = {}) {
      validateActor(actor);
      if (!Array.isArray(updates) || updates.length === 0) fail("invalid-note-patch");
      const seen = new Set();
      const validated = updates.map((item) => {
        if (item === null || typeof item !== "object" || Array.isArray(item)) fail("invalid-note-patch");
        const { noteId, patch } = item;
        if (typeof noteId !== "string" || seen.has(noteId)) fail(seen.has(noteId) ? "duplicate-reference" : "note-not-found");
        seen.add(noteId);
        validatePatch(patch);
        const note = song.notes.find((candidate) => candidate.id === noteId);
        if (!note) fail("note-not-found");
        if (actor === "generator" && (note.anchor || note.locked)) fail("protected-note");
        return { noteId, patch: cloneData(patch) };
      });
      commit((candidate) => {
        for (const { noteId, patch } of validated) {
          Object.assign(candidate.notes.find((item) => item.id === noteId), patch);
        }
      });
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick));
      return validated.map(({ noteId }) => cloneData(song.notes.find((item) => item.id === noteId)));
    },
    updateNote(noteId, patch, { actor = "user" } = {}) {
      validateActor(actor);
      validatePatch(patch);
      const note = song.notes.find((item) => item.id === noteId);
      if (!note) fail("note-not-found");
      if (actor === "generator" && (note.anchor || note.locked)) fail("protected-note");
      commit((candidate) => {
        const target = candidate.notes.find((item) => item.id === noteId);
        Object.assign(target, patch);
      });
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick));
      return cloneData(song.notes.find((item) => item.id === noteId));
    },
    deleteNote(noteId, { actor = "user" } = {}) {
      validateActor(actor);
      const note = song.notes.find((item) => item.id === noteId);
      if (!note) fail("note-not-found");
      if (actor === "generator" && (note.anchor || note.locked)) fail("protected-note");
      commit((candidate) => {
        candidate.notes = candidate.notes.filter((item) => item.id !== noteId);
        candidate.phrases = candidate.phrases.map((phrase) => ({
          ...phrase,
          noteIds: phrase.noteIds.filter((id) => id !== noteId)
        }));
        candidate.lyrics.syllables = candidate.lyrics.syllables.map((syllable) => ({
          ...syllable,
          noteIds: syllable.noteIds.filter((id) => id !== noteId)
        }));
      }, () => {
        if (selection) selection = { ...selection, noteIds: selection.noteIds.filter((id) => id !== noteId) };
        selectedNoteIds = selectedNoteIds.filter((id) => id !== noteId);
      });
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick));
      return true;
    },
    setLyrics(rawText) {
      if (typeof rawText !== "string") fail("invalid-lyrics");
      commit((candidate) => { candidate.lyrics.rawText = rawText; });
      return rawText;
    },
    addLyricSyllable(text = "", index = song.lyrics.syllables.length) {
      if (typeof text !== "string") fail("invalid-lyrics");
      if (!Number.isSafeInteger(index) || index < 0 || index > song.lyrics.syllables.length) fail("invalid-syllable-index");
      const syllable = { id: idFactory(), text, noteIds: [] };
      commit((candidate) => candidate.lyrics.syllables.splice(index, 0, syllable));
      return cloneData(syllable);
    },
    updateLyricSyllable(syllableId, text) {
      if (typeof text !== "string") fail("invalid-lyrics");
      const index = song.lyrics.syllables.findIndex((item) => item.id === syllableId);
      if (index < 0) fail("syllable-not-found");
      commit((candidate) => { candidate.lyrics.syllables[index].text = text; });
      return cloneData(song.lyrics.syllables[index]);
    },
    deleteLyricSyllable(syllableId) {
      const index = song.lyrics.syllables.findIndex((item) => item.id === syllableId);
      if (index < 0) fail("syllable-not-found");
      commit((candidate) => candidate.lyrics.syllables.splice(index, 1));
      return true;
    },
    moveLyricSyllable(syllableId, targetIndex) {
      const sourceIndex = song.lyrics.syllables.findIndex((item) => item.id === syllableId);
      if (sourceIndex < 0) fail("syllable-not-found");
      if (!Number.isSafeInteger(targetIndex) || targetIndex < 0 || targetIndex >= song.lyrics.syllables.length) fail("invalid-syllable-index");
      commit((candidate) => {
        const [syllable] = candidate.lyrics.syllables.splice(sourceIndex, 1);
        candidate.lyrics.syllables.splice(targetIndex, 0, syllable);
      });
      return cloneData(song.lyrics.syllables[targetIndex]);
    },
    splitLyricSyllable(syllableId, { leftText, rightText, noteSplitIndex }) {
      if (typeof leftText !== "string" || typeof rightText !== "string") fail("invalid-lyrics");
      const index = song.lyrics.syllables.findIndex((item) => item.id === syllableId);
      if (index < 0) fail("syllable-not-found");
      const syllable = song.lyrics.syllables[index];
      if (!Number.isSafeInteger(noteSplitIndex) || noteSplitIndex < 0 || noteSplitIndex > syllable.noteIds.length) fail("invalid-syllable-split");
      const right = {
        id: idFactory(),
        text: rightText,
        noteIds: syllable.noteIds.slice(noteSplitIndex)
      };
      commit((candidate) => {
        const left = candidate.lyrics.syllables[index];
        left.text = leftText;
        left.noteIds = left.noteIds.slice(0, noteSplitIndex);
        candidate.lyrics.syllables.splice(index + 1, 0, right);
      });
      return { left: cloneData(song.lyrics.syllables[index]), right: cloneData(song.lyrics.syllables[index + 1]) };
    },
    mergeLyricSyllables(leftId, rightId) {
      const leftIndex = song.lyrics.syllables.findIndex((item) => item.id === leftId);
      const rightIndex = song.lyrics.syllables.findIndex((item) => item.id === rightId);
      if (leftIndex < 0 || rightIndex < 0) fail("syllable-not-found");
      if (rightIndex !== leftIndex + 1) fail("syllables-not-adjacent");
      commit((candidate) => {
        const left = candidate.lyrics.syllables[leftIndex];
        const right = candidate.lyrics.syllables[rightIndex];
        left.text += right.text;
        left.noteIds = [...new Set([...left.noteIds, ...right.noteIds])];
        candidate.lyrics.syllables.splice(rightIndex, 1);
      });
      return cloneData(song.lyrics.syllables[leftIndex]);
    },
    assignSyllableNotes(syllableId, noteIds) {
      if (!Array.isArray(noteIds)) fail("invalid-syllable");
      const index = song.lyrics.syllables.findIndex((item) => item.id === syllableId);
      if (index < 0) fail("syllable-not-found");
      const seen = new Set();
      for (const noteId of noteIds) {
        if (typeof noteId !== "string" || !song.notes.some((note) => note.id === noteId)) fail("invalid-reference");
        if (seen.has(noteId)) fail("duplicate-reference");
        seen.add(noteId);
      }
      commit((candidate) => { candidate.lyrics.syllables[index].noteIds = [...noteIds]; });
      return cloneData(song.lyrics.syllables[index]);
    },
    setAnchor(noteId, value, { actor = "user" } = {}) {
      validateActor(actor);
      if (typeof value !== "boolean") fail("invalid-note-flags");
      if (actor === "generator") fail("generator-flag-change");
      if (!song.notes.some((item) => item.id === noteId)) fail("note-not-found");
      commit((candidate) => { candidate.notes.find((item) => item.id === noteId).anchor = value; });
      return value;
    },
    setLocked(noteId, value, { actor = "user" } = {}) {
      validateActor(actor);
      if (typeof value !== "boolean") fail("invalid-note-flags");
      if (actor === "generator") fail("generator-flag-change");
      if (!song.notes.some((item) => item.id === noteId)) fail("note-not-found");
      commit((candidate) => { candidate.notes.find((item) => item.id === noteId).locked = value; });
      return value;
    },
    selectNotes(noteIds) {
      if (!Array.isArray(noteIds)) fail("invalid-note-selection");
      const seen = new Set();
      for (const noteId of noteIds) {
        if (typeof noteId !== "string" || !song.notes.some((note) => note.id === noteId)) fail("note-not-found");
        if (seen.has(noteId)) fail("duplicate-reference");
        seen.add(noteId);
      }
      selection = null;
      selectedNoteIds = [...noteIds];
      notifyChange("selection");
      return cloneData(selectedNoteIds);
    },
    clearSelection() {
      selection = null;
      selectedNoteIds = [];
      notifyChange("selection");
      return [];
    },
    copySelection() {
      const selected = new Set(selectedNoteIds);
      const notes = song.notes.filter((note) => selected.has(note.id));
      if (notes.length === 0) {
        copiedNotes = null;
        notifyEditorChange();
        return 0;
      }
      const first = [...notes].sort((left, right) => left.startTick - right.startTick || left.id.localeCompare(right.id))[0];
      const startTick = Math.min(...notes.map((note) => note.startTick));
      copiedNotes = {
        basePitch: first.pitch,
        notes: notes.map((note) => ({
          pitchOffset: note.pitch - first.pitch,
          startOffset: note.startTick - startTick,
          durationTicks: note.durationTicks
        }))
      };
      notifyEditorChange();
      return notes.length;
    },
    pasteNotes(targetTick = playback.currentTick, targetPitch = copiedNotes?.basePitch) {
      if (!copiedNotes) return [];
      if (!Number.isSafeInteger(targetTick) || targetTick < 0) fail("invalid-tick");
      if (!Number.isInteger(targetPitch) || targetPitch < 0 || targetPitch > 127) fail("invalid-pitch");
      const pasted = copiedNotes.notes.map((note) => ({
        id: idFactory(),
        pitch: targetPitch + note.pitchOffset,
        startTick: targetTick + note.startOffset,
        durationTicks: note.durationTicks,
        source: "user",
        anchor: false,
        locked: false
      }));
      // Validate the whole paste before committing so overflow or invalid pitches cannot partially apply.
      createSong({ ...cloneData(song), notes: [...song.notes, ...pasted] });
      commit((candidate) => candidate.notes.push(...pasted), () => {
        selection = null;
        selectedNoteIds = pasted.map((note) => note.id);
      });
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick));
      return cloneData(pasted);
    },
    setSnap(value) {
      if (!Object.hasOwn(SNAP_TICKS, value)) fail("invalid-snap");
      snap = value;
      notifyEditorChange();
      return snap;
    },
    newIdea() {
      const nextSong = createInitialSong(idFactory);
      playRequest += 1;
      updatePlayerSafely(() => audioPlayer?.stop());
      song = nextSong;
      selection = null;
      selectedNoteIds = [];
      copiedNotes = null;
      snap = DEFAULT_SNAP;
      playback.status = "stopped";
      activeNoteSuppressed = true;
      playback.loop = { enabled: false, startTick: 0, endTick: Math.max(1, songEndTick()) };
      setPlaybackPosition(0);
      notifyPlaybackChange();
      notifyChange("song");
      notifyEditorChange();
      return cloneData(song);
    },
    selectRange(startTick, endTick) {
      if (!Number.isSafeInteger(startTick) || startTick < 0 || !Number.isSafeInteger(endTick) || endTick < startTick) fail("invalid-range");
      const noteIds = song.notes
        .filter((note) => note.startTick < endTick && note.startTick + note.durationTicks > startTick)
        .map((note) => note.id);
      selection = { startTick, endTick, noteIds };
      selectedNoteIds = [...noteIds];
      notifyChange("selection");
      return cloneData(selection);
    }
  };
  return Object.freeze(commands);
}
