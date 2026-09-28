import { cloneData, createId, createInitialSong, createSong, MelodiError } from "./model.js";
import { DEFAULT_EDITOR_TOOL, DEFAULT_ROLL_ZOOM, DEFAULT_SNAP, EDITOR_TOOLS, MAX_ROLL_ZOOM, MIN_ROLL_ZOOM, SNAP_TICKS } from "./editor.js";
import { createAgentSnapshot } from "./snapshot.js";
import { projectPlaybackState, validateLoop, validateTempo, validateTick, wrapLoopTick } from "../audio/transport.js";
import { createGenerationContext } from "../generation/context.js";
import { generateGap as generateGapCandidates } from "../generation/generator.js";
import { nextSeed } from "../generation/random.js";

function fail(code) {
  throw new MelodiError(code);
}

function validateActor(actor) {
  if (actor !== "user" && actor !== "generator") fail("invalid-actor");
}

function validatePitchBendPatch(value) {
  if (value === null) return;
  if (!Array.isArray(value) || value.length < 2 || value.length > 16) fail("invalid-pitch-bend");
  let previousPosition = -1;
  for (const point of value) {
    if (point === null || typeof point !== "object" || Array.isArray(point)) fail("invalid-pitch-bend");
    if (Object.keys(point).sort().join(",") !== "position,semitones") fail("invalid-pitch-bend");
    if (typeof point.position !== "number" || !Number.isFinite(point.position)
      || point.position < 0 || point.position > 1 || point.position <= previousPosition) fail("invalid-pitch-bend");
    if (typeof point.semitones !== "number" || !Number.isFinite(point.semitones)
      || point.semitones < -12 || point.semitones > 12) fail("invalid-pitch-bend");
    previousPosition = point.position;
  }
  if (value[0].position !== 0) fail("invalid-pitch-bend");
}

function validatePatch(patch) {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) fail("invalid-note");
  const keys = Object.keys(patch);
  const allowed = new Set(["pitch", "startTick", "durationTicks", "pitchBend"]);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) fail("invalid-note-patch");
  if (Object.hasOwn(patch, "pitchBend")) validatePitchBendPatch(patch.pitchBend);
}

function applyNotePatch(note, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === "pitchBend" && value === null) delete note.pitchBend;
    else note[key] = value;
  }
}

function reportUnobservedNotificationError(error) {
  console.error("Melodi notification failed after canonical state was committed.", error);
}

// Batas jumlah state yang disimpan. Cukup untuk satu sesi editing panjang tanpa
// menahan memori tanpa batas; lagian Melodi tidak menyimpan audio di dalam song.
const HISTORY_LIMIT = 100;

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
  let tool = DEFAULT_EDITOR_TOOL;
  let zoom = DEFAULT_ROLL_ZOOM;
  let viewMode = "piano-roll";
  let followMode = true;
  let copiedNotes = null;
  let canonicalRevision = 0;
  let undoStack = [];
  let redoStack = [];
  let generationSession = null;
  let generationAuditionToken = 0;
  let lastAcceptedNoteIds = [];
  const songEndTick = () => song.notes.reduce((end, note) => Math.max(end, note.startTick + note.durationTicks), 0);

  /*
   * Note yang dibuat manual harus masuk ke phrase, kalau tidak phrase berhenti
   * mencerminkan song. Akibatnya generateGap selalu gagal dengan
   * "generation-cross-phrase", karena kedua anchor tidak pernah berada di phrase
   * yang sama. Urutan phrase mengikuti tick, karena acceptCandidate menyisipkan
   * note baru tepat sebelum anchor kanan dengan cara mengindex noteIds.
   */
  function registerNoteInPhrase(targetSong, note) {
    const phrase = targetSong.phrases[0];
    if (!phrase) return;
    const tickOf = (noteId) => targetSong.notes.find((item) => item.id === noteId)?.startTick ?? Number.POSITIVE_INFINITY;
    const index = phrase.noteIds.findIndex((noteId) => tickOf(noteId) > note.startTick);
    if (index < 0) phrase.noteIds.push(note.id);
    else phrase.noteIds.splice(index, 0, note.id);
  }
  const playback = {
    status: "stopped",
    currentTick: 0,
    currentNoteId: null,
    currentSectionId: null,
    loop: { enabled: true, startTick: 0, endTick: Math.max(1, songEndTick()) }
  };
  let loopRangeMode = "auto";
  let activeNoteSuppressed = true;
  let audioPlayer = null;
  let playRequest = 0;

  function syncAutomaticLoopRange() {
    if (loopRangeMode !== "auto") return false;
    const nextStartTick = 0;
    const nextEndTick = Math.max(1, songEndTick());
    if (playback.loop.startTick === nextStartTick && playback.loop.endTick === nextEndTick) return false;
    playback.loop = { ...playback.loop, startTick: nextStartTick, endTick: nextEndTick };
    return true;
  }

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

  function clearAuditionState({ notify = true } = {}) {
    if (!generationSession?.auditionCandidateId) return false;
    generationAuditionToken += 1;
    generationSession.auditionCandidateId = null;
    try { audioPlayer?.cancelPreview?.(); } catch {}
    if (notify) notifyChange("generation");
    return true;
  }

  function readGenerationState() {
    if (!generationSession) {
      return {
        status: "idle",
        stale: false,
        gap: null,
        seed: null,
        candidateIds: [],
        activeCandidateId: null,
        auditionCandidateId: null,
        candidates: [],
        acceptedNoteIds: [...lastAcceptedNoteIds]
      };
    }
    const candidates = generationSession.candidates.map((candidate) => ({
      id: candidate.id,
      seed: candidate.seed,
      score: candidate.score,
      scoreBreakdown: cloneData(candidate.scoreBreakdown),
      metadata: cloneData(candidate.metadata),
      notes: candidate.notes.map(({ id, pitch, startTick, durationTicks }) => ({ id, pitch, startTick, durationTicks })),
      sourceMoves: [...candidate.sourceMoves]
    }));
    return {
      status: "ready",
      stale: generationSession.revision !== canonicalRevision,
      gap: cloneData(generationSession.gap),
      seed: generationSession.seed,
      styleProfile: generationSession.styleProfile,
      voiceRange: cloneData(generationSession.voiceRange),
      expectedSyllableCount: generationSession.expectedSyllableCount,
      candidateIds: candidates.map((candidate) => candidate.id),
      activeCandidateId: generationSession.activeCandidateId,
      auditionCandidateId: generationSession.auditionCandidateId,
      candidates,
      acceptedNoteIds: [...lastAcceptedNoteIds]
    };
  }

  function findGenerationCandidate(candidateId) {
    if (!generationSession) fail("generation-session-missing");
    const candidate = generationSession.candidates.find((item) => item.id === candidateId);
    if (!candidate) fail("generation-candidate-not-found");
    return candidate;
  }

  // Hanya state canonical yang masuk history. Selection, posisi playback, dan
  // sesi kandidat bukan keputusan editorial user, jadi undo tidak pernah
  // mengubahnya secara tak terduga; kandidat otomatis jadi tidak berlaku karena
  // revision membesar.
  function pushHistory() {
    undoStack.push(cloneData(song));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
  }

  function readHistoryState() {
    return {
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      undoDepth: undoStack.length,
      redoDepth: redoStack.length
    };
  }

  function restoreSong(nextSong) {
    const validated = createSong(nextSong);
    canonicalRevision += 1;
    generationAuditionToken += 1;
    generationSession = null;
    lastAcceptedNoteIds = [];
    try { audioPlayer?.cancelPreview?.(); } catch {}
    song = validated;
    syncAutomaticLoopRange();
    selection = null;
    selectedNoteIds = [];
    let tick = playback.currentTick;
    if (playback.status === "playing" && audioPlayer) {
      try { tick = audioPlayer.getPosition(); } catch {}
    }
    updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
    notifyChange("song");
    return cloneData(song);
  }

  function commit(mutator, afterCommit = () => {}) {
    const candidate = cloneData(song);
    const result = mutator(candidate);
    const validated = createSong(candidate);
    pushHistory();
    song = validated;
    syncAutomaticLoopRange();
    canonicalRevision += 1;
    if (generationSession?.auditionCandidateId) {
      generationSession.auditionCandidateId = null;
      generationAuditionToken += 1;
      try { audioPlayer?.cancelPreview?.(); } catch {}
    }
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
        setPlaybackPosition(playback.loop.startTick);
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
        tool,
        zoom,
        canPaste: Boolean(copiedNotes),
        clipboardCount: copiedNotes?.notes.length ?? 0
      }, selectedNoteIds, { mode: viewMode, follow: followMode }, readGenerationState(), readHistoryState());
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
    undo() {
      if (undoStack.length === 0) fail("nothing-to-undo");
      const previous = undoStack.pop();
      redoStack.push(cloneData(song));
      return restoreSong(previous);
    },
    redo() {
      if (redoStack.length === 0) fail("nothing-to-redo");
      const next = redoStack.pop();
      undoStack.push(cloneData(song));
      return restoreSong(next);
    },
    generateGap(request) {
      clearAuditionState({ notify: false });
      const context = createGenerationContext(song, request);
      const generated = generateGapCandidates(song, request);
      generationSession = {
        ...generated,
        request: cloneData(request),
        revision: canonicalRevision,
        phraseId: context.phraseId,
        activeCandidateId: null,
        auditionCandidateId: null
      };
      notifyChange("generation");
      return readGenerationState();
    },
    getGenerationState() {
      return readGenerationState();
    },
    selectCandidate(candidateId) {
      const candidate = findGenerationCandidate(candidateId);
      if (generationSession.auditionCandidateId && generationSession.auditionCandidateId !== candidateId) {
        clearAuditionState({ notify: false });
      }
      generationSession.activeCandidateId = candidate.id;
      notifyChange("generation");
      return readGenerationState();
    },
    async auditionCandidate(candidateId) {
      if (!audioPlayer || typeof audioPlayer.playPreview !== "function") fail("audio-unavailable");
      const candidate = findGenerationCandidate(candidateId);
      if (generationSession.revision !== canonicalRevision) fail("generation-stale");
      const currentContext = createGenerationContext(song, generationSession.request);
      if (currentContext.phraseId !== generationSession.phraseId) fail("generation-stale");
      if (playback.status === "playing") commands.pause();
      clearAuditionState({ notify: false });
      const token = ++generationAuditionToken;
      generationSession.activeCandidateId = candidate.id;
      generationSession.auditionCandidateId = candidate.id;
      const previewNotes = [
        ...candidate.notes,
        {
          id: `preview-${candidate.id}-right-anchor`,
          pitch: currentContext.rightAnchor.pitch,
          startTick: generationSession.gap.endTick,
          durationTicks: Math.min(currentContext.rightAnchor.durationTicks, 480)
        }
      ];
      notifyChange("generation");
      try {
        const started = await audioPlayer.playPreview(previewNotes, {
          tempo: song.timing.tempo,
          onEnded() {
            if (generationAuditionToken !== token || generationSession?.auditionCandidateId !== candidate.id) return;
            generationSession.auditionCandidateId = null;
            notifyChange("generation");
          }
        });
        if (!started && generationAuditionToken === token && generationSession?.auditionCandidateId === candidate.id) {
          generationSession.auditionCandidateId = null;
          notifyChange("generation");
        }
      } catch (error) {
        if (generationAuditionToken === token && generationSession?.auditionCandidateId === candidate.id) {
          generationSession.auditionCandidateId = null;
          notifyChange("generation");
        }
        throw error;
      }
      return readGenerationState();
    },
    acceptCandidate(candidateId = generationSession?.activeCandidateId) {
      if (!generationSession) fail("generation-session-missing");
      if (generationSession.revision !== canonicalRevision) fail("generation-stale");
      const candidate = findGenerationCandidate(candidateId);
      const context = createGenerationContext(song, generationSession.request);
      if (context.phraseId !== generationSession.phraseId) fail("generation-stale");
      const acceptedNotes = candidate.notes.map((note) => ({
        id: idFactory(),
        pitch: note.pitch,
        startTick: note.startTick,
        durationTicks: note.durationTicks,
        source: "generated",
        anchor: false,
        locked: false
      }));
      const acceptedIds = acceptedNotes.map((note) => note.id);
      return commit((nextSong) => {
        nextSong.notes.push(...acceptedNotes);
        const phrase = nextSong.phrases.find((item) => item.id === context.phraseId);
        const rightIndex = phrase?.noteIds.indexOf(context.gap.rightAnchorNoteId) ?? -1;
        if (!phrase || rightIndex < 0) fail("generation-stale");
        phrase.noteIds.splice(rightIndex, 0, ...acceptedIds);
        return acceptedNotes;
      }, () => {
        generationAuditionToken += 1;
        generationSession = null;
        try { audioPlayer?.cancelPreview?.(); } catch {}
        selection = null;
        selectedNoteIds = [...acceptedIds];
        lastAcceptedNoteIds = [...acceptedIds];
        let tick = playback.currentTick;
        if (playback.status === "playing" && audioPlayer) {
          try { tick = audioPlayer.getPosition(); } catch {}
        }
        updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
      }).map((note) => cloneData(note));
    },
    clearGeneration() {
      if (!generationSession && lastAcceptedNoteIds.length === 0) return false;
      generationAuditionToken += 1;
      generationSession = null;
      lastAcceptedNoteIds = [];
      try { audioPlayer?.cancelPreview?.(); } catch {}
      notifyChange("generation");
      return true;
    },
    lockAcceptedNotes() {
      const noteIds = [...lastAcceptedNoteIds];
      if (noteIds.length === 0) fail("generation-no-accepted-notes");
      const notes = noteIds.map((noteId) => song.notes.find((note) => note.id === noteId));
      if (notes.some((note) => !note || note.source !== "generated")) fail("generation-accepted-notes-missing");
      commit((nextSong) => {
        for (const noteId of noteIds) nextSong.notes.find((note) => note.id === noteId).locked = true;
      }, () => { lastAcceptedNoteIds = []; });
      return noteIds;
    },
    regenerateGap() {
      if (!generationSession) fail("generation-session-missing");
      const request = { ...generationSession.request, seed: nextSeed(generationSession.seed) };
      return commands.generateGap(request);
    },
    setViewMode(mode) {
      if (!["score", "piano-roll", "combined", "lyrics", "guitar"].includes(mode)) fail("invalid-view-mode");
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
      clearAuditionState();
      const request = ++playRequest;
      let tick = playback.currentTick;
      if (tick < playback.loop.startTick || tick >= playback.loop.endTick) tick = playback.loop.startTick;
      const started = await audioPlayer.play(tick, { tempo: song.timing.tempo, loop: playback.loop });
      if (!started || request !== playRequest) return readPlayback();
      playback.status = "playing";
      activeNoteSuppressed = false;
      setPlaybackPosition(audioPlayer.getPosition());
      notifyPlaybackChange();
      return readPlayback();
    },
    pause() {
      clearAuditionState();
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
      clearAuditionState();
      playRequest += 1;
      if (audioPlayer) audioPlayer.stop();
      loopRangeMode = "auto";
      playback.loop = {
        ...playback.loop,
        startTick: 0,
        endTick: Math.max(1, songEndTick())
      };
      playback.status = "stopped";
      activeNoteSuppressed = true;
      setPlaybackPosition(0);
      notifyPlaybackChange();
      return readPlayback();
    },
    seek(tick) {
      validateTick(tick);
      clearAuditionState();
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
      clearAuditionState();
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
      clearAuditionState();
      loopRangeMode = "manual";
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      playback.loop = { ...playback.loop, ...nextLoop };
      const position = wrapLoopTick(tick, playback.loop);
      playRequest += 1;
      updatePlayerSafely(() => audioPlayer?.updateLoop(playback.loop, position, playback.status === "playing"));
      setPlaybackPosition(position);
      notifyPlaybackChange();
      return { ...playback.loop };
    },
    resetLoopRange() {
      clearAuditionState();
      loopRangeMode = "auto";
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      playback.loop = {
        ...playback.loop,
        startTick: 0,
        endTick: Math.max(1, songEndTick())
      };
      const position = tick >= playback.loop.endTick ? playback.loop.startTick : Math.max(playback.loop.startTick, tick);
      playRequest += 1;
      updatePlayerSafely(() => audioPlayer?.updateLoop(playback.loop, position, playback.status === "playing"));
      setPlaybackPosition(position);
      notifyPlaybackChange();
      return { ...playback.loop };
    },
    setLoopEnabled(enabled) {
      if (typeof enabled !== "boolean") fail("invalid-loop");
      clearAuditionState();
      if (enabled) syncAutomaticLoopRange();
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
      const allowed = new Set(["pitch", "startTick", "durationTicks", "pitchBend"]);
      if (Object.keys(input).some((key) => !allowed.has(key))) fail("invalid-note");
      const note = {
        id: idFactory(),
        pitch: input.pitch,
        startTick: input.startTick,
        durationTicks: input.durationTicks,
        ...(input.pitchBend ? { pitchBend: cloneData(input.pitchBend) } : {}),
        source: actor === "generator" ? "generated" : "user",
        anchor: false,
        locked: false
      };
      commit((candidate) => {
        candidate.notes.push(note);
        registerNoteInPhrase(candidate, note);
      });
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
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
          applyNotePatch(candidate.notes.find((item) => item.id === noteId), patch);
        }
      });
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
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
        applyNotePatch(target, patch);
      });
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
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
      updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
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
          durationTicks: note.durationTicks,
          ...(note.pitchBend ? { pitchBend: cloneData(note.pitchBend) } : {})
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
        ...(note.pitchBend ? { pitchBend: cloneData(note.pitchBend) } : {}),
        source: "user",
        anchor: false,
        locked: false
      }));
      // Validate the whole paste before committing so overflow or invalid pitches cannot partially apply.
      createSong({ ...cloneData(song), notes: [...song.notes, ...pasted] });
      commit((candidate) => {
        candidate.notes.push(...pasted);
        for (const note of pasted) registerNoteInPhrase(candidate, note);
      }, () => {
        selection = null;
        selectedNoteIds = pasted.map((note) => note.id);
      });
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
      return cloneData(pasted);
    },
    setSnap(value) {
      if (!Object.hasOwn(SNAP_TICKS, value)) fail("invalid-snap");
      snap = value;
      notifyEditorChange();
      return snap;
    },
    setTool(value) {
      if (!EDITOR_TOOLS.includes(value)) fail("invalid-editor-tool");
      if (value === tool) return tool;
      tool = value;
      notifyEditorChange();
      return tool;
    },
    setZoom(value) {
      if (!Number.isFinite(value) || value < MIN_ROLL_ZOOM || value > MAX_ROLL_ZOOM) fail("invalid-zoom");
      if (value === zoom) return zoom;
      zoom = value;
      notifyEditorChange();
      return zoom;
    },
    newIdea() {
      const nextSong = createInitialSong(idFactory);
      pushHistory();
      canonicalRevision += 1;
      generationAuditionToken += 1;
      generationSession = null;
      lastAcceptedNoteIds = [];
      playRequest += 1;
      updatePlayerSafely(() => audioPlayer?.stop());
      song = nextSong;
      selection = null;
      selectedNoteIds = [];
      copiedNotes = null;
      snap = DEFAULT_SNAP;
      tool = DEFAULT_EDITOR_TOOL;
      loopRangeMode = "auto";
      playback.status = "stopped";
      activeNoteSuppressed = true;
      playback.loop = { enabled: true, startTick: 0, endTick: Math.max(1, songEndTick()) };
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
