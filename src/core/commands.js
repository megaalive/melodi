import { cloneData, createId, createSong, MelodiError } from "./model.js";
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
  onPlaybackChange = () => {},
  onPlaybackEvent = () => {},
  onNotificationError = reportUnobservedNotificationError,
  audioPlayerFactory = null
} = {}) {
  let song = createSong(initialSong);
  let selection = null;
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

  function notifyChange() {
    try {
      onChange();
    } catch (error) {
      try {
        onNotificationError(error);
      } catch (reportingError) {
        console.error("Melodi notification error handler failed after canonical state was committed.", reportingError, error);
      }
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
    notifyChange();
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
    getState() {
      return createAgentSnapshot(song, selection, readPlayback());
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
    selectRange(startTick, endTick) {
      if (!Number.isSafeInteger(startTick) || startTick < 0 || !Number.isSafeInteger(endTick) || endTick < startTick) fail("invalid-range");
      const noteIds = song.notes
        .filter((note) => note.startTick < endTick && note.startTick + note.durationTicks > startTick)
        .map((note) => note.id);
      selection = { startTick, endTick, noteIds };
      notifyChange();
      return cloneData(selection);
    }
  };
  return Object.freeze(commands);
}
