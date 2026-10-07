import { canonicalSongEndTick, barRangeAtTick, chordSnapTicks } from "./timeline.js?v=20261003.99";
import { cloneData, createBlankSong, createId, createSong, MelodiError, SUPPORTED_CHORD_QUALITIES } from "./model.js?v=20261003.99";
import { DEFAULT_EDITOR_TOOL, DEFAULT_ROLL_ZOOM, DEFAULT_SNAP, EDITOR_TOOLS, MAX_ROLL_ZOOM, MIN_ROLL_ZOOM, SNAP_TICKS } from "./editor.js";
import { createAgentSnapshot } from "./snapshot.js?v=20261003.99";
import { projectPlaybackState, validateLoop, validateTempo, validateTick, wrapLoopTick } from "../audio/transport.js?v=20261003.99";
import { createGenerationContext } from "../generation/context.js";
import { generateGap as generateGapCandidates } from "../generation/generator.js";
import { ideaDevelop } from "../generation/ideas.js?v=20261003.99";
import { nextSeed } from "../generation/random.js";
import { createExample, listExamples } from "../examples/catalog.js?v=20261003.99";
import { createInstrumentMix, percussionChannelId } from "../audio/mix.js?v=20261003.99";
import { suggestHarmony as inferHarmonyCandidates } from "../harmony/harmony.js?v=20261003.99";
import { generateHarmonyProgression as planHarmonyProgression } from "../harmony/progression.js?v=20261003.99";
import { findPercussionKit } from "../instruments/percussion.js?v=20261003.99";
import { syllabifyLyrics } from "./lyrics.js";

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

function validateVibratoPatch(value) {
  if (value === null) return;
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) fail("invalid-vibrato");
  if (Object.keys(value).sort().join(",") !== "delayPosition,depthSemitones,rateHz") fail("invalid-vibrato");
  if (typeof value.rateHz !== "number" || !Number.isFinite(value.rateHz)
    || value.rateHz < 0.5 || value.rateHz > 12) fail("invalid-vibrato");
  if (typeof value.depthSemitones !== "number" || !Number.isFinite(value.depthSemitones)
    || value.depthSemitones <= 0 || value.depthSemitones > 2) fail("invalid-vibrato");
  if (typeof value.delayPosition !== "number" || !Number.isFinite(value.delayPosition)
    || value.delayPosition < 0 || value.delayPosition > 1) fail("invalid-vibrato");
}

function validatePatch(patch) {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) fail("invalid-note");
  const keys = Object.keys(patch);
  const allowed = new Set(["pitch", "startTick", "durationTicks", "pitchBend", "volume", "pan", "vibrato"]);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) fail("invalid-note-patch");
  if (Object.hasOwn(patch, "pitchBend")) validatePitchBendPatch(patch.pitchBend);
  if (Object.hasOwn(patch, "vibrato")) validateVibratoPatch(patch.vibrato);
  if (Object.hasOwn(patch, "volume")
    && (typeof patch.volume !== "number" || !Number.isFinite(patch.volume) || patch.volume < 0 || patch.volume > 1)) {
    fail("invalid-note-volume");
  }
  if (Object.hasOwn(patch, "pan")
    && (typeof patch.pan !== "number" || !Number.isFinite(patch.pan) || patch.pan < -1 || patch.pan > 1)) {
    fail("invalid-note-pan");
  }
}

function applyNotePatch(note, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if ((key === "pitchBend" || key === "vibrato") && value === null) delete note[key];
    else note[key] = value;
  }
}

function reportUnobservedNotificationError(error) {
  console.error("Melodi notification failed after canonical state was committed.", error);
}

// Batas jumlah state yang disimpan. Cukup untuk satu sesi editing panjang tanpa
// menahan memori tanpa batas; lagian Melodi tidak menyimpan audio di dalam song.
const HISTORY_LIMIT = 100;
// Anggaran ukuran undo: 100 snapshot lagu 1 MB berarti 100 MB heap yang
// tidak perlu dipelihara. Snapshot tertua dibuang lebih dulu.
const HISTORY_BYTE_BUDGET = 24 * 1024 * 1024;

export function createCommands(initialSong, {
  idFactory = createId,
  onChange = () => {},
  onEditorChange = () => {},
  onPlaybackChange = () => {},
  onPlaybackTick = null,
  onPlaybackEvent = () => {},
  onNotificationError = reportUnobservedNotificationError,
  audioPlayerFactory = null,
  browserLibrary = null,
  ideaBoard = null,
  perf = null
} = {}) {
  let song = createSong(initialSong);
  let selection = null;
  let selectedNoteIds = [];
  let selectedPercussionHitIds = [];
  let mix = createInstrumentMix(song);
  let snap = DEFAULT_SNAP;
  let chordSnap = "bar";
  let tool = DEFAULT_EDITOR_TOOL;
  let zoom = DEFAULT_ROLL_ZOOM;
  let viewMode = "piano-roll";
  let followMode = true;
  let copiedNotes = null;
  let canonicalRevision = 0;
  let undoStack = [];
  let redoStack = [];
  let undoStackBytes = 0;
  const historyBytes = [];
  let generationSession = null;
  let harmonySession = null;
  let harmonyProgressionSession = null;
  let generationAuditionToken = 0;
  let noteAuditionToken = 0;
  let lastAcceptedNoteIds = [];
  let selectedChordId = null;
  let harmonyRange = null;
  const songEndTick = () => canonicalSongEndTick(song);

  function effectiveHarmonyRange() {
    if (selection && selection.endTick > selection.startTick) {
      return { startTick: selection.startTick, endTick: selection.endTick };
    }
    const notes = song.notes.filter((note) => selectedNoteIds.includes(note.id));
    if (notes.length) return {
      startTick: Math.min(...notes.map((note) => note.startTick)),
      endTick: Math.max(...notes.map((note) => note.startTick + note.durationTicks))
    };
    return harmonyRange ? cloneData(harmonyRange) : barRangeAtTick(song, Math.max(0, Math.floor(playback.currentTick)));
  }

  function reconcileHarmonySelection({ reset = false } = {}) {
    if (reset) { selectedChordId = null; harmonyRange = null; return; }
    if (!selectedChordId) return;
    const chord = song.chords.find((item) => item.id === selectedChordId);
    if (!chord) { selectedChordId = null; harmonyRange = null; return; }
    harmonyRange = { startTick: chord.startTick, endTick: chord.startTick + chord.durationTicks };
  }

  /*
   * Note manual harus masuk ke phrase terdekat secara waktu. Baseline sekarang
   * punya beberapa phrase/bagian, jadi selalu memakai phrases[0] akan merusak
   * struktur section dan membuat note baru muncul di bagian yang salah.
   */
  function registerNoteInPhrase(targetSong, note) {
    if (!targetSong.phrases.length) {
      if (targetSong.notes.length !== 1) return;
      targetSong.phrases.push({ id: idFactory(), noteIds: [] });
    }
    const noteById = new Map(targetSong.notes.map((item) => [item.id, item]));
    const ranges = targetSong.phrases.map((phrase) => {
      const items = phrase.noteIds.map((id) => noteById.get(id)).filter(Boolean);
      if (!items.length) return { phrase, start: Number.POSITIVE_INFINITY, end: Number.POSITIVE_INFINITY };
      return {
        phrase,
        start: Math.min(...items.map((item) => item.startTick)),
        end: Math.max(...items.map((item) => item.startTick + item.durationTicks))
      };
    });
    const containing = ranges.find((range) => range.start <= note.startTick && note.startTick < range.end);
    const chosen = containing ?? ranges
      .filter((range) => Number.isFinite(range.start))
      .sort((left, right) => {
        const leftDistance = note.startTick < left.start ? left.start - note.startTick : note.startTick - left.end;
        const rightDistance = note.startTick < right.start ? right.start - note.startTick : note.startTick - right.end;
        return leftDistance - rightDistance || left.start - right.start;
      })[0] ?? ranges[0];

    const phrase = chosen.phrase;
    const tickOf = (noteId) => noteById.get(noteId)?.startTick ?? Number.POSITIVE_INFINITY;
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

  function readHarmonyState() {
    return cloneData(harmonySession ?? {
      status: "idle", range: null, candidates: [], selectedCandidateId: null
    });
  }

  function findChord(chordId) {
    const chord = song.chords.find((item) => item.id === chordId);
    if (!chord) fail("chord-not-found");
    return chord;
  }

  function overlappingChords({ startTick, durationTicks }, ignoreChordId = null) {
    const endTick = startTick + durationTicks;
    return song.chords.filter(chord => chord.id !== ignoreChordId
      && chord.startTick < endTick && chord.startTick + chord.durationTicks > startTick);
  }

  function assertChordPlacement(placement, ignoreChordId = null) {
    if (overlappingChords(placement, ignoreChordId).length) fail("chord-conflict");
  }

  function harmonyCandidate(candidateId) {
    if (!harmonySession) fail("harmony-session-missing");
    const candidate = harmonySession.candidates.find((item) => item.id === candidateId);
    if (!candidate) fail("harmony-candidate-not-found");
    return candidate;
  }

  function validateChordFields(input, partial = false) {
    const allowed = ["rootPitchClass", "quality", "startTick", "durationTicks"];
    if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-chord-patch");
    const keys = Object.keys(input);
    if (!keys.length || keys.some((key) => !allowed.includes(key))
      || (!partial && allowed.some((key) => !Object.hasOwn(input, key)))) fail("invalid-chord-patch");
    if (Object.hasOwn(input, "quality") && !SUPPORTED_CHORD_QUALITIES.includes(input.quality)) fail("unsupported-chord-quality");
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
  // Satu serialisasi dipakai untuk snapshot sekaligus untuk mengukur byte.
  function snapshotSong() {
    const serialized = JSON.stringify(song);
    return { song: JSON.parse(serialized), bytes: serialized.length };
  }

  function trimHistory() {
    while (undoStack.length > 1
      && (undoStack.length > HISTORY_LIMIT || undoStackBytes > HISTORY_BYTE_BUDGET)) {
      undoStackBytes -= historyBytes.shift() ?? 0;
      undoStack.shift();
    }
  }

  function pushHistory() {
    const snapshot = snapshotSong();
    undoStack.push(snapshot.song);
    historyBytes.push(snapshot.bytes);
    undoStackBytes += snapshot.bytes;
    trimHistory();
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
    harmonySession = null;
    generationAuditionToken += 1;
    generationSession = null;
    lastAcceptedNoteIds = [];
    try { audioPlayer?.cancelPreview?.(); } catch {}
    song = validated;
    reconcileHarmonySelection();
    mix = createInstrumentMix(song, mix);
    syncAutomaticLoopRange();
    selection = null;
    selectedNoteIds = [];
    selectedPercussionHitIds = [];
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
    reconcileHarmonySelection();
    mix = createInstrumentMix(song, mix);
    syncAutomaticLoopRange();
    canonicalRevision += 1;
    harmonySession = null;
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
      // P1: player hanya membaca, jadi dapat referensi. Song dan mix diganti
      // utuh saat commit; tidak ada mutasi dari sisi player.
      getSong: () => song,
      onPosition(tick) {
        setPlaybackPosition(tick);
        // P3: tick audio tidak menjalankan render DOM; view yang mau
        //olutnya (pause, seek, tempo) tetap lewat onPlaybackChange.
        if (onPlaybackTick) onPlaybackTick();
        else notifyPlaybackChange();
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
      onError: handlePlayerError,
      getMix: () => mix,
      perf
    });
  }

  function setInstrumentValue(channelId, flag, enabled) {
    if (typeof channelId !== "string" || !Object.hasOwn(mix.channels, channelId)) fail("instrument-channel-not-found");
    if (flag === "volume") {
      if (typeof enabled !== "number" || !Number.isFinite(enabled) || enabled < 0 || enabled > 1) fail("invalid-instrument-volume");
    } else if (typeof enabled !== "boolean") fail("invalid-instrument-state");
    if (mix.channels[channelId][flag] === enabled) return enabled;
    if (flag === "volume") {
      commit((candidate) => {
        if (channelId === "harmony" || channelId === "bass") {
          candidate.sketch[channelId].volume = enabled;
          return;
        }
        candidate.mix ??= { melody: 1, percussion: {} };
        if (channelId === "melody") candidate.mix.melody = enabled;
        else {
          for (const track of candidate.tracks) {
            const piece = findPercussionKit(track.kitId)?.pieces.find((item) => percussionChannelId(track.id, item.id) === channelId);
            if (!piece) continue;
            candidate.mix.percussion = { ...candidate.mix.percussion, [track.id]: { ...candidate.mix.percussion[track.id], [piece.id]: enabled } };
            break;
          }
        }
      }, refreshPlaybackMix);
      return enabled;
    }
    mix = { channels: { ...mix.channels, [channelId]: { ...mix.channels[channelId], [flag]: enabled } } };
    refreshPlaybackMix();
    notifyChange("mix");
    return enabled;
  }

  function refreshPlaybackSong() {
    if (playback.status === "playing" && audioPlayer) {
      let tick = playback.currentTick;
      try { tick = audioPlayer.getPosition(); } catch {}
      setPlaybackPosition(tick);
      updatePlayerSafely(() => audioPlayer.songChanged(tick, playback.loop));
    }
  }

  function setSketchStyle(channel, style) {
    const styles = channel === "harmony" ? ["block", "arpeggio"] : ["root", "root-fifth"];
    if (!styles.includes(style)) fail("invalid-sketch-style");
    if (song.sketch[channel].style === style) return style;
    commit((candidate) => { candidate.sketch[channel].style = style; }, refreshPlaybackSong);
    return style;
  }

  function refreshPlaybackMix() {
    if (playback.status === "playing" && audioPlayer) {
      let tick = playback.currentTick;
      try { tick = audioPlayer.getPosition(); } catch {}
      setPlaybackPosition(tick);
      updatePlayerSafely(() => audioPlayer.mixChanged(tick, playback.loop));
    }
  }

  function deleteNoteIds(noteIds, { actor = "user" } = {}) {
    validateActor(actor);
    if (!Array.isArray(noteIds) || noteIds.length === 0) fail("invalid-note-selection");
    const seen = new Set();
    const deleted = new Set();
    for (const noteId of noteIds) {
      if (typeof noteId !== "string" || seen.has(noteId)) fail(seen.has(noteId) ? "duplicate-reference" : "note-not-found");
      seen.add(noteId);
      const note = song.notes.find((item) => item.id === noteId);
      if (!note) fail("note-not-found");
      if (actor === "generator" && (note.anchor || note.locked)) fail("protected-note");
      deleted.add(noteId);
    }

    commit((candidate) => {
      candidate.notes = candidate.notes.filter((item) => !deleted.has(item.id));
      candidate.phrases = candidate.phrases.map((phrase) => ({
        ...phrase,
        noteIds: phrase.noteIds.filter((id) => !deleted.has(id))
      }));
      candidate.lyrics.syllables = candidate.lyrics.syllables.map((syllable) => ({
        ...syllable,
        noteIds: syllable.noteIds.filter((id) => !deleted.has(id))
      }));
    }, () => {
      if (selection) selection = { ...selection, noteIds: selection.noteIds.filter((id) => !deleted.has(id)) };
      selectedNoteIds = selectedNoteIds.filter((id) => !deleted.has(id));
    });
    const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
    updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
    return [...noteIds];
  }

  function replaceSong(input, { recordUndo = false, clearHistory = false } = {}) {
    const nextSong = createSong(input);
    harmonyProgressionSession = null;
    if (recordUndo) pushHistory();
    canonicalRevision += 1;
    harmonySession = null;
    generationAuditionToken += 1;
    generationSession = null;
    lastAcceptedNoteIds = [];
    playRequest += 1;
    updatePlayerSafely(() => audioPlayer?.stop());
    song = nextSong;
    reconcileHarmonySelection({ reset: true });
    mix = createInstrumentMix(song);
    selection = null;
    selectedNoteIds = [];
    selectedPercussionHitIds = [];
    copiedNotes = null;
    snap = DEFAULT_SNAP;
    chordSnap = "bar";
    tool = DEFAULT_EDITOR_TOOL;
    zoom = DEFAULT_ROLL_ZOOM;
    viewMode = "piano-roll";
    followMode = true;
    loopRangeMode = "auto";
    playback.status = "stopped";
    activeNoteSuppressed = true;
    playback.loop = { enabled: true, startTick: 0, endTick: Math.max(1, songEndTick()) };
    setPlaybackPosition(0);
    if (clearHistory) {
      undoStack = [];
      redoStack = [];
      undoStackBytes = 0;
      historyBytes.length = 0;
    }
    notifyPlaybackChange();
    notifyChange("song");
    notifyEditorChange();
    return cloneData(song);
  }

  function startNewSong(title = "Untitled") {
    return replaceSong(createBlankSong(idFactory, title), { recordUndo: true });
  }

  function loadSong(input) {
    return replaceSong(input, { clearHistory: true });
  }

  function changeSongTitle(title) {
    if (typeof title !== "string" || !title.trim()) fail("invalid-title");
    const nextTitle = title.trim();
    if (nextTitle === song.title) return song.title;
    commit((candidate) => { candidate.title = nextTitle; });
    return song.title;
  }

  const commands = {
    getSong() {
      return cloneData(song);
    },
    // P1: jalur panas playback hanya membaca. Song canonical diganti utuh
    // setiap commit, jadi referensinya stabil dan tidak pernah dimutasi di
    // tempat. Pemanggil yang mau mengubah tetap memakai getSong().
    peekSong() {
      return song;
    },
    peekMix() {
      return mix;
    },
    getSelection() {
      return cloneData(selection);
    },
    getSelectedNoteIds() {
      return cloneData(selectedNoteIds);
    },
    getSelectedPercussionHitIds() {
      return cloneData(selectedPercussionHitIds);
    },
    getMixState() {
      return cloneData(mix);
    },
    // P0: probe perf butuh kedalaman undo tanpa snapshot penuh.
    getHistoryState() {
      return readHistoryState();
    },
    // P1: hanya untuk render playback per tick. Tidak meng-clone lagu dan
    // tidak membuat agent snapshot; getState() tetap untuk agent dan render
    // yang butuh state lengkap.
    getPlaybackView() {
      return {
        playback: readPlayback(),
        view: { mode: viewMode, follow: followMode },
        history: readHistoryState(),
        selectedChordId,
        harmonyRange: effectiveHarmonyRange()
      };
    },
    // P3: pembacaan murah untuk Decide render mana yang perlu jalan lagi.
    getPlaybackTick() {
      return playback.currentTick;
    },
    getPlaybackStatus() {
      return playback.status;
    },
    getState() {
      return createAgentSnapshot(song, selection, readPlayback(), {
        snap,
        chordSnap,
        tool,
        zoom,
        canPaste: Boolean(copiedNotes),
        clipboardCount: copiedNotes?.notes.length ?? 0
      }, selectedNoteIds, { mode: viewMode, follow: followMode }, readGenerationState(), readHistoryState(), selectedPercussionHitIds, mix, readHarmonyState(), { selectedChordId, harmonyRange: effectiveHarmonyRange() });
    },
    selectChord(chordId) {
      const chord = findChord(chordId);
      selectedChordId = chordId;
      harmonyRange = { startTick: chord.startTick, endTick: chord.startTick + chord.durationTicks };
      selection = null;
      selectedNoteIds = [];
      selectedPercussionHitIds = [];
      harmonySession = null;
      notifyChange("selection");
      return cloneData(chord);
    },
    clearChordSelection() {
      selectedChordId = null;
      harmonyRange = null;
      harmonySession = null;
      notifyChange("selection");
      return null;
    },
    setHarmonyRange(startTick, endTick) {
      if (!Number.isSafeInteger(startTick) || startTick < 0 || !Number.isSafeInteger(endTick) || endTick <= startTick) fail("invalid-range");
      selectedChordId = null;
      harmonyRange = { startTick, endTick };
      selection = null;
      selectedNoteIds = [];
      selectedPercussionHitIds = [];
      harmonySession = null;
      notifyChange("selection");
      return cloneData(harmonyRange);
    },
    setInstrumentMute(channelId, enabled) {
      return setInstrumentValue(channelId, "mute", enabled);
    },
    setInstrumentSolo(channelId, enabled) {
      return setInstrumentValue(channelId, "solo", enabled);
    },
    setInstrumentVolume(channelId, volume) {
      return setInstrumentValue(channelId, "volume", volume);
    },
    setHarmonyStyle(style) {
      return setSketchStyle("harmony", style);
    },
    setBassStyle(style) {
      return setSketchStyle("bass", style);
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
      undoStackBytes -= historyBytes.pop() ?? 0;
      redoStack.push(cloneData(song));
      return restoreSong(previous);
    },
    redo() {
      if (redoStack.length === 0) fail("nothing-to-redo");
      const next = redoStack.pop();
      const snapshot = snapshotSong();
      undoStack.push(snapshot.song);
      historyBytes.push(snapshot.bytes);
      undoStackBytes += snapshot.bytes;
      trimHistory();
      return restoreSong(next);
    },
    getHarmonyState() {
      return readHarmonyState();
    },
    getHarmonyProgression() {
      if (!harmonyProgressionSession) return null;
      return cloneData({ ...harmonyProgressionSession,
        status: harmonyProgressionSession.revision === canonicalRevision ? "ready" : "stale" });
    },
    generateHarmonyProgression(request = {}) {
      harmonyProgressionSession = { ...planHarmonyProgression(song, request), revision: canonicalRevision };
      notifyChange("harmony");
      return commands.getHarmonyProgression();
    },
    chooseHarmonyProgressionChord(index, rootPitchClass, quality) {
      if (!harmonyProgressionSession) fail("harmony-session-missing");
      if (harmonyProgressionSession.revision !== canonicalRevision) fail("harmony-progression-stale");
      if (!Number.isSafeInteger(index)) fail("harmony-candidate-not-found");
      const chord = harmonyProgressionSession.chords[index];
      if (!chord) fail("harmony-candidate-not-found");
      validateChordFields({rootPitchClass, quality}, true);
      if (!Number.isSafeInteger(rootPitchClass) || rootPitchClass < 0 || rootPitchClass > 11) fail("invalid-chord");
      const alternative = chord.alternatives.find(item => item.rootPitchClass === rootPitchClass && item.quality === quality);
      Object.assign(chord, { rootPitchClass, quality, romanNumeral: alternative?.romanNumeral ?? null });
      notifyChange("harmony");
      return commands.getHarmonyProgression();
    },
    clearHarmonyProgression() {
      const changed = harmonyProgressionSession !== null;
      harmonyProgressionSession = null;
      if (changed) notifyChange("harmony");
      return changed;
    },
    applyHarmonyProgression() {
      if (!harmonyProgressionSession) fail("harmony-session-missing");
      if (harmonyProgressionSession.revision !== canonicalRevision) fail("harmony-progression-stale");
      const preview = harmonyProgressionSession;
      if (!preview.chords.length) return [];
      const newChords = preview.chords.map(({rootPitchClass,quality,startTick,durationTicks}) =>
        ({id:idFactory(),rootPitchClass,quality,startTick,durationTicks,locked:false}));
      commit(candidate => {
        const retained = [];
        for (const chord of candidate.chords) {
          const end = chord.startTick + chord.durationTicks;
          if (chord.locked || end <= preview.startTick || chord.startTick >= preview.endTick) {
            retained.push(chord);
            continue;
          }
          // Bagian chord di luar pilihan tetap utuh ketika progresi mengganti rentang tengah.
          if (chord.startTick < preview.startTick) retained.push({...chord,durationTicks:preview.startTick-chord.startTick});
          if (end > preview.endTick) retained.push({...chord,id:chord.startTick < preview.startTick ? idFactory() : chord.id,
            startTick:preview.endTick,durationTicks:end-preview.endTick});
        }
        for (const chord of newChords) {
          if (retained.some(item => item.startTick < chord.startTick + chord.durationTicks
            && item.startTick + item.durationTicks > chord.startTick)) fail("chord-conflict");
        }
        candidate.chords = [...retained,...newChords].sort((a,b) => a.startTick-b.startTick);
      }, () => { harmonyProgressionSession = null; refreshPlaybackSong(); });
      return cloneData(newChords);
    },
    suggestHarmony(request) {
      const candidates = inferHarmonyCandidates(song, request);
      harmonySession = {
        status: "ready", range: { startTick: request.startTick, endTick: request.endTick },
        candidates, selectedCandidateId: candidates[0]?.id ?? null
      };
      notifyChange("harmony");
      return readHarmonyState();
    },
    selectHarmonyCandidate(candidateId) {
      harmonyCandidate(candidateId);
      harmonySession.selectedCandidateId = candidateId;
      notifyChange("harmony");
      return readHarmonyState();
    },
    clearHarmonySuggestions() {
      const changed = harmonySession !== null;
      harmonySession = null;
      if (changed) notifyChange("harmony");
      return changed;
    },
    acceptHarmonyCandidate(candidateId = harmonySession?.selectedCandidateId) {
      const candidate = harmonyCandidate(candidateId);
      const overlaps = overlappingChords(candidate);
      if (overlaps.some((chord) => chord.locked)) fail("locked-chord");
      if (overlaps.length > 1 || overlaps.some((chord) => chord.startTick !== candidate.startTick
        || chord.durationTicks !== candidate.durationTicks)) fail("chord-conflict");
      const fields = { rootPitchClass: candidate.rootPitchClass, quality: candidate.quality,
        startTick: candidate.startTick, durationTicks: candidate.durationTicks };
      const chord = overlaps[0];
      assertChordPlacement(candidate, chord?.id);
      const result = chord ? commands.updateChord(chord.id, fields) : commands.addChord(fields);
      // Penerimaan yang identik tetap mengakhiri sesi tanpa menambah history.
      harmonySession = null;
      notifyChange("harmony");
      return result;
    },
    addChord(input) {
      validateChordFields(input);
      assertChordPlacement(input);
      const chord = { id: idFactory(), ...cloneData(input), locked: false };
      commit((candidate) => { candidate.chords.push(chord); }, refreshPlaybackSong);
      return cloneData(findChord(chord.id));
    },
    updateChord(chordId, patch) {
      const chord = findChord(chordId);
      if (chord.locked) fail("locked-chord");
      validateChordFields(patch, true);
      if (Object.entries(patch).every(([key, value]) => chord[key] === value)) return cloneData(chord);
      const proposed = { ...chord, ...patch };
      // Legacy overlap remains readable/editable; only a changed placement can introduce a new collision.
      if (proposed.startTick !== chord.startTick || proposed.durationTicks !== chord.durationTicks) {
        assertChordPlacement(proposed, chordId);
      }
      commit((candidate) => { Object.assign(candidate.chords.find((item) => item.id === chordId), cloneData(patch)); }, refreshPlaybackSong);
      return cloneData(findChord(chordId));
    },
    deleteChord(chordId) {
      const chord = findChord(chordId);
      if (chord.locked) fail("locked-chord");
      commit((candidate) => { candidate.chords = candidate.chords.filter((item) => item.id !== chordId); }, refreshPlaybackSong);
      return chordId;
    },
    setChordLocked(chordId, locked) {
      const chord = findChord(chordId);
      if (typeof locked !== "boolean") fail("invalid-chord-lock");
      if (chord.locked === locked) return cloneData(chord);
      commit((candidate) => { candidate.chords.find((item) => item.id === chordId).locked = locked; });
      return cloneData(findChord(chordId));
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
    cancelCandidateAudition() {
      return clearAuditionState();
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
        selectedPercussionHitIds = [];
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
      if (!["score", "piano-roll", "combined", "lyrics", "guitar", "drums", "ideas"].includes(mode)) fail("invalid-view-mode");
      viewMode = mode;
      // Masuk ke Drum Grid harus aman dari tool Gambar yang mungkin aktif di
      // Piano Roll. Satu klik pertama tidak boleh diam-diam membuat hit.
      if (mode === "drums") tool = "select";
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
    addPercussionHit(input) {
      if (input === null || typeof input !== "object" || Array.isArray(input)) fail("invalid-percussion-hit");
      const allowed = new Set(["trackId", "kitId", "pieceId", "startTick", "velocity", "articulation", "durationTicks", "pan", "tuning"]);
      if (Object.keys(input).some((key) => !allowed.has(key))) fail("invalid-percussion-hit");

      let track = typeof input.trackId === "string"
        ? song.tracks.find((candidate) => candidate.id === input.trackId && candidate.kind === "percussion")
        : null;
      if (input.trackId && !track) fail("track-not-found");
      if (!track) {
        track = song.tracks.find((candidate) => candidate.kind === "percussion"
          && (!input.kitId || candidate.kitId === input.kitId)) ?? null;
      }

      const trackId = track?.id ?? idFactory();
      const kitId = track?.kitId ?? input.kitId ?? "gm-standard";
      const hit = {
        id: idFactory(),
        pieceId: input.pieceId,
        startTick: input.startTick,
        velocity: input.velocity ?? 100,
        articulation: input.articulation ?? "normal",
        ...(Object.hasOwn(input, "durationTicks") ? { durationTicks: input.durationTicks } : {}),
        ...(Object.hasOwn(input, "pan") ? { pan: input.pan } : {}),
        ...(Object.hasOwn(input, "tuning") ? { tuning: input.tuning } : {})
      };

      commit((candidate) => {
        let target = candidate.tracks.find((item) => item.id === trackId);
        if (!target) {
          target = { id: trackId, kind: "percussion", role: "rhythm", kitId, events: [] };
          candidate.tracks.push(target);
        }
        target.events.push(hit);
        target.events.sort((left, right) => left.startTick - right.startTick || left.pieceId.localeCompare(right.pieceId));
      });
      syncAutomaticLoopRange();
      return { trackId, hit: cloneData(hit) };
    },
    applyDrumGroovePreset(presetId = "pop") {
      if (presetId !== "pop") fail("invalid-groove-preset");
      const { numerator, denominator } = song.timing.timeSignature;
      const beatTicks = song.timing.ppq * 4 / denominator;
      const barTicks = beatTicks * numerator;
      const startTick = playback.loop.enabled
        ? playback.loop.startTick
        : Math.floor(playback.currentTick / barTicks) * barTicks;
      const endTick = playback.loop.enabled ? playback.loop.endTick : startTick + barTicks;
      const barCount = Math.min(32, Math.ceil((endTick - startTick) / barTicks));
      const hatStep = denominator === 8 ? beatTicks : beatTicks / 2;
      const kickBeats = numerator === 6 && denominator === 8
        ? [0]
        : [0, Math.max(1, Math.floor(numerator / 2))];
      const snareBeats = numerator === 6 && denominator === 8
        ? [3]
        : [...new Set([Math.floor(numerator / 4), Math.floor((3 * numerator) / 4)])];
      const events = [];
      for (let bar = 0; bar < barCount; bar += 1) {
        const barStart = startTick + bar * barTicks;
        for (let tick = barStart; tick < Math.min(endTick, barStart + barTicks); tick += hatStep) {
          events.push({ pieceId: "closed-hi-hat", startTick: tick, velocity: tick === barStart ? 76 : 64 });
        }
        for (const beat of kickBeats) {
          const tick = barStart + beat * beatTicks;
          if (tick < endTick) events.push({ pieceId: "kick", startTick: tick, velocity: beat === 0 ? 108 : 96 });
        }
        for (const beat of snareBeats) {
          const tick = barStart + beat * beatTicks;
          if (tick < endTick) events.push({ pieceId: "snare", startTick: tick, velocity: 92 });
        }
      }
      const existingTrack = song.tracks.find((track) => track.kind === "percussion" && track.kitId === "gm-standard");
      const trackId = existingTrack?.id ?? idFactory();
      const missing = events.filter((event) => !existingTrack?.events.some((hit) =>
        hit.pieceId === event.pieceId && hit.startTick === event.startTick));
      if (!missing.length) return { presetId, trackId, addedCount: 0, totalCount: existingTrack?.events.length ?? 0 };
      const hits = missing.map((event) => ({
        id: idFactory(), pieceId: event.pieceId, startTick: event.startTick,
        velocity: event.velocity, articulation: "normal"
      }));
      commit((candidate) => {
        let track = candidate.tracks.find((item) => item.id === trackId);
        if (!track) {
          track = { id: trackId, kind: "percussion", role: "rhythm", kitId: "gm-standard", events: [] };
          candidate.tracks.push(track);
        }
        track.events.push(...hits);
        track.events.sort((left, right) => left.startTick - right.startTick || left.pieceId.localeCompare(right.pieceId));
      });
      syncAutomaticLoopRange();
      return { presetId, trackId, addedCount: hits.length, totalCount: (existingTrack?.events.length ?? 0) + hits.length };
    },
    updatePercussionHit(trackId, hitId, patch) {
      if (patch === null || typeof patch !== "object" || Array.isArray(patch)) fail("invalid-percussion-hit");
      const allowed = new Set(["pieceId", "startTick", "velocity", "articulation", "durationTicks", "pan", "tuning"]);
      if (Object.keys(patch).some((key) => !allowed.has(key))) fail("invalid-percussion-hit");
      const track = song.tracks.find((candidate) => candidate.id === trackId && candidate.kind === "percussion");
      if (!track) fail("track-not-found");
      if (!track.events.some((hit) => hit.id === hitId)) fail("percussion-hit-not-found");

      commit((candidate) => {
        const hit = candidate.tracks.find((item) => item.id === trackId).events.find((item) => item.id === hitId);
        for (const [key, value] of Object.entries(patch)) {
          if (["durationTicks", "pan", "tuning"].includes(key) && value === null) delete hit[key];
          else hit[key] = value;
        }
        candidate.tracks.find((item) => item.id === trackId).events
          .sort((left, right) => left.startTick - right.startTick || left.pieceId.localeCompare(right.pieceId));
      });
      syncAutomaticLoopRange();
      return cloneData(song.tracks.find((item) => item.id === trackId).events.find((item) => item.id === hitId));
    },
    deletePercussionHit(trackId, hitId) {
      const track = song.tracks.find((candidate) => candidate.id === trackId && candidate.kind === "percussion");
      if (!track) fail("track-not-found");
      const index = track.events.findIndex((hit) => hit.id === hitId);
      if (index < 0) fail("percussion-hit-not-found");
      commit((candidate) => {
        const target = candidate.tracks.find((item) => item.id === trackId);
        target.events.splice(target.events.findIndex((hit) => hit.id === hitId), 1);
      }, () => {
        selectedPercussionHitIds = selectedPercussionHitIds.filter((id) => id !== hitId);
      });
      syncAutomaticLoopRange();
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
      return true;
    },
    selectPercussionHits(hitIds) {
      if (!Array.isArray(hitIds)) fail("invalid-percussion-selection");
      const seen = new Set();
      const allHits = song.tracks.filter((track) => track.kind === "percussion")
        .flatMap((track) => track.events.map((hit) => hit.id));
      for (const hitId of hitIds) {
        if (typeof hitId !== "string" || !allHits.includes(hitId)) fail("percussion-hit-not-found");
        if (seen.has(hitId)) fail("duplicate-reference");
        seen.add(hitId);
      }
      selection = null;
      selectedNoteIds = [];
      selectedChordId = null;
      harmonySession = null;
      selectedPercussionHitIds = [...hitIds];
      notifyChange("selection");
      return cloneData(selectedPercussionHitIds);
    },
    clearPercussionSelection() {
      harmonySession = null;
      selectedPercussionHitIds = [];
      notifyChange("selection");
      return [];
    },
    deletePercussionHits(hitIds = selectedPercussionHitIds) {
      if (!Array.isArray(hitIds)) fail("invalid-percussion-selection");
      if (hitIds.length === 0) return [];
      const seen = new Set();
      const hitToTrack = new Map();
      for (const track of song.tracks) {
        if (track.kind !== "percussion") continue;
        for (const hit of track.events) hitToTrack.set(hit.id, track.id);
      }
      for (const hitId of hitIds) {
        if (typeof hitId !== "string" || !hitToTrack.has(hitId)) fail("percussion-hit-not-found");
        if (seen.has(hitId)) fail("duplicate-reference");
        seen.add(hitId);
      }
      const deleted = new Set(hitIds);
      commit((candidate) => {
        for (const track of candidate.tracks) {
          if (track.kind === "percussion") track.events = track.events.filter((hit) => !deleted.has(hit.id));
        }
      }, () => {
        selectedPercussionHitIds = selectedPercussionHitIds.filter((id) => !deleted.has(id));
      });
      syncAutomaticLoopRange();
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
      return [...hitIds];
    },
    duplicatePercussionHits(hitIds = selectedPercussionHitIds) {
      if (!Array.isArray(hitIds)) fail("invalid-percussion-selection");
      if (hitIds.length === 0) return [];
      const seen = new Set();
      const hitToTrack = new Map();
      for (const track of song.tracks) {
        if (track.kind !== "percussion") continue;
        for (const hit of track.events) hitToTrack.set(hit.id, { trackId: track.id, hit });
      }
      const selected = [];
      for (const hitId of hitIds) {
        if (typeof hitId !== "string") fail("percussion-hit-not-found");
        if (seen.has(hitId)) fail("duplicate-reference");
        seen.add(hitId);
        const entry = hitToTrack.get(hitId);
        if (!entry) fail("percussion-hit-not-found");
        selected.push(entry);
      }
      const minTick = Math.min(...selected.map(({ hit }) => hit.startTick));
      const maxTick = Math.max(...selected.map(({ hit }) => hit.startTick));
      const offset = maxTick - minTick + SNAP_TICKS[snap];
      const clones = selected.map(({ trackId, hit }) => ({
        trackId,
        hit: {
          id: idFactory(),
          pieceId: hit.pieceId,
          startTick: hit.startTick + offset,
          velocity: hit.velocity,
          articulation: hit.articulation,
          ...(Object.hasOwn(hit, "durationTicks") ? { durationTicks: hit.durationTicks } : {}),
          ...(Object.hasOwn(hit, "pan") ? { pan: hit.pan } : {}),
          ...(Object.hasOwn(hit, "tuning") ? { tuning: hit.tuning } : {})
        }
      }));
      const cloneIds = clones.map(({ hit }) => hit.id);
      commit((candidate) => {
        for (const { trackId, hit } of clones) {
          const track = candidate.tracks.find((item) => item.id === trackId);
          track.events.push(hit);
          track.events.sort((left, right) => left.startTick - right.startTick || left.pieceId.localeCompare(right.pieceId));
        }
      }, () => {
        selection = null;
        selectedNoteIds = [];
        selectedPercussionHitIds = cloneIds;
      });
      syncAutomaticLoopRange();
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
      return cloneData(clones.map(({ hit }) => hit));
    },
    addNote(input, { actor = "user" } = {}) {
      validateActor(actor);
      if (input === null || typeof input !== "object" || Array.isArray(input)) fail("invalid-note");
      const allowed = new Set(["pitch", "startTick", "durationTicks", "pitchBend", "volume", "pan", "vibrato"]);
      if (Object.keys(input).some((key) => !allowed.has(key))) fail("invalid-note");
      const note = {
        id: idFactory(),
        pitch: input.pitch,
        startTick: input.startTick,
        durationTicks: input.durationTicks,
        ...(input.pitchBend ? { pitchBend: cloneData(input.pitchBend) } : {}),
        ...(Object.hasOwn(input, "volume") ? { volume: input.volume } : {}),
        ...(Object.hasOwn(input, "pan") ? { pan: input.pan } : {}),
        ...(input.vibrato ? { vibrato: cloneData(input.vibrato) } : {}),
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
    // I1: satu take = satu langkah undo. insertAtTick default-nya akhir lagu
    // atau playhead, jadi agent bisa mengirim take tanpa menyebut posisi.
// I2: satu command untuk kedua arah pengembangan ide. Keduanya hanya
    // membaca lagu sehingga hasilnya selalu bisa dibandingkan sebelum satu
    // Terima, dan tidak ada satu pun yang menyentuh anchor atau locked.
    ideaDevelop({ kind = "variation", notes, count, seed, bars, target, intensity, chords, scope } = {}) {
      return cloneData(ideaDevelop({
        kind,
        notes,
        count,
        seed,
        bars,
        target,
        intensity,
        scope,
        chords: chords ?? song.chords ?? [],
        key: song.key,
        scale: song.scale,
        tempo: song.timing.tempo,
        timeSignature: song.timing.timeSignature
      }));
    },
    // developTake tetap ada sebagai jalan pintas ke arah variasi.
    developTake({ notes, count, seed, intensity, scope } = {}) {
      return commands.ideaDevelop({ kind: "variation", notes, count, seed, intensity, scope });
    },
    commitTake({ notes, insertAtTick = null } = {}) {
      if (!Array.isArray(notes) || notes.length === 0) fail("invalid-note");
      const allowed = new Set(["pitch", "startTick", "durationTicks", "volume", "pan"]);
      const normalized = notes.map((input) => {
        if (input === null || typeof input !== "object" || Array.isArray(input)
          || Object.keys(input).some((key) => !allowed.has(key))) fail("invalid-note");
        return {
          id: idFactory(),
          pitch: input.pitch,
          startTick: input.startTick,
          durationTicks: input.durationTicks,
          ...(Object.hasOwn(input, "volume") ? { volume: input.volume } : {}),
          ...(Object.hasOwn(input, "pan") ? { pan: input.pan } : {}),
          source: "user",
          anchor: false,
          locked: false
        };
      });
      const base = Number.isSafeInteger(insertAtTick) && insertAtTick >= 0
        ? insertAtTick
        : (playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick);
      const offset = base;
      const shifted = normalized.map((note) => ({ ...note, startTick: note.startTick + offset }));
      commit((candidate) => {
        for (const note of shifted) {
          candidate.notes.push(note);
          registerNoteInPhrase(candidate, note);
        }
      });
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
      return cloneData(shifted);
    },
    addNotes(inputs, { actor = "user" } = {}) {
      validateActor(actor);
      if (!Array.isArray(inputs) || inputs.length === 0) fail("invalid-note");
      const allowed = new Set(["pitch", "startTick", "durationTicks", "pitchBend", "volume", "pan", "vibrato"]);
      const notes = inputs.map((input) => {
        if (input === null || typeof input !== "object" || Array.isArray(input)
          || Object.keys(input).some((key) => !allowed.has(key))) fail("invalid-note");
        return {
          id: idFactory(),
          pitch: input.pitch,
          startTick: input.startTick,
          durationTicks: input.durationTicks,
          ...(input.pitchBend ? { pitchBend: cloneData(input.pitchBend) } : {}),
          ...(Object.hasOwn(input, "volume") ? { volume: input.volume } : {}),
          ...(Object.hasOwn(input, "pan") ? { pan: input.pan } : {}),
          ...(input.vibrato ? { vibrato: cloneData(input.vibrato) } : {}),
          source: actor === "generator" ? "generated" : "user",
          anchor: false,
          locked: false
        };
      });
      commit((candidate) => {
        for (const note of notes) {
          candidate.notes.push(note);
          registerNoteInPhrase(candidate, note);
        }
      });
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
      return cloneData(notes);
    },
    async auditionNote(pitch, durationTicks = 240) {
      if (!audioPlayer || typeof audioPlayer.playPreview !== "function") fail("audio-unavailable");
      if (!Number.isSafeInteger(pitch) || pitch < 0 || pitch > 127
        || !Number.isSafeInteger(durationTicks) || durationTicks <= 0) fail("invalid-note");
      if (playback.status === "playing") commands.pause();
      const token = ++noteAuditionToken;
      try { audioPlayer.cancelPreview?.(); } catch {}
      return Boolean(await audioPlayer.playPreview([{
        id: `note-preview-${token}`,
        pitch,
        startTick: 0,
        durationTicks
      }], { tempo: song.timing.tempo }));
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
    deleteNotes(noteIds, options = {}) {
      return cloneData(deleteNoteIds(noteIds, options));
    },
    deleteNote(noteId, options = {}) {
      deleteNoteIds([noteId], options);
      return true;
    },
    setLyrics(rawText) {
      if (typeof rawText !== "string") fail("invalid-lyrics");
      commit((candidate) => { candidate.lyrics.rawText = rawText; });
      return rawText;
    },
    mapLyricsToNotes(rawText = song.lyrics.rawText) {
      if (typeof rawText !== "string") fail("invalid-lyrics");
      const syllableTexts = syllabifyLyrics(rawText);
      if (!syllableTexts.length) fail("lyrics-empty");
      const range = selection && selection.endTick > selection.startTick
        ? selection
        : playback.loop.enabled ? playback.loop : null;
      const notes = song.notes
        .filter((note) => !range || note.startTick < range.endTick && note.startTick + note.durationTicks > range.startTick)
        .sort((left, right) => left.startTick - right.startTick || left.id.localeCompare(right.id));
      if (!notes.length) fail("lyrics-no-notes");
      if (syllableTexts.length > notes.length) fail("lyrics-too-many-syllables");
      const syllables = syllableTexts.map((text, index) => {
        const start = Math.floor(index * notes.length / syllableTexts.length);
        const end = Math.floor((index + 1) * notes.length / syllableTexts.length);
        const previous = song.lyrics.syllables[index];
        return {
          id: previous?.text === text ? previous.id : idFactory(),
          text,
          noteIds: notes.slice(start, end).map((note) => note.id)
        };
      });
      const unchanged = rawText === song.lyrics.rawText
        && JSON.stringify(syllables) === JSON.stringify(song.lyrics.syllables);
      if (!unchanged) commit((candidate) => {
        candidate.lyrics.rawText = rawText;
        candidate.lyrics.syllables = cloneData(syllables);
      });
      return { syllableCount: syllables.length, noteCount: notes.length, mappedCount: notes.length, unchanged };
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
      selectedChordId = null;
      harmonySession = null;
      selectedNoteIds = [...noteIds];
      selectedPercussionHitIds = [];
      notifyChange("selection");
      return cloneData(selectedNoteIds);
    },
    clearSelection() {
      harmonySession = null;
      selection = null;
      selectedNoteIds = [];
      selectedPercussionHitIds = [];
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
          ...(note.pitchBend ? { pitchBend: cloneData(note.pitchBend) } : {}),
          ...(Object.hasOwn(note, "volume") ? { volume: note.volume } : {}),
          ...(Object.hasOwn(note, "pan") ? { pan: note.pan } : {}),
          ...(note.vibrato ? { vibrato: cloneData(note.vibrato) } : {})
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
        ...(Object.hasOwn(note, "volume") ? { volume: note.volume } : {}),
        ...(Object.hasOwn(note, "pan") ? { pan: note.pan } : {}),
        ...(note.vibrato ? { vibrato: cloneData(note.vibrato) } : {}),
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
        selectedPercussionHitIds = [];
      });
      const tick = playback.status === "playing" && audioPlayer ? audioPlayer.getPosition() : playback.currentTick;
      updatePlayerSafely(() => audioPlayer?.songChanged(tick, playback.loop));
      return cloneData(pasted);
    },
    setChordSnap(value) {
      if (!["bar", "half-bar", "beat"].includes(value)) fail("invalid-chord-snap");
      chordSnapTicks(song, value);
      chordSnap = value;
      notifyEditorChange();
      return chordSnap;
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
    newSong(title = "Untitled") {
      return startNewSong(title);
    },
    newIdea() {
      return startNewSong();
    },
    listExamples() {
      return listExamples();
    },
    loadExample(id) {
      return loadSong(createExample(id, idFactory));
    },
    setSongTitle: changeSongTitle,
    loadSong(input) {
      return loadSong(input);
    },
    // I3: papan ide. Penyimpanan terpisah dari Song, jadi tidak ada undo dan
    // tidak menyentuh anchor, locked, lyric, atau chord.
    listIdeas() {
      return cloneData(ideaBoard?.list?.() ?? { version: 1, ideas: [] });
    },
saveIdea({ notes, title = null, source = "take" } = {}) {
      const saved = ideaBoard?.save?.({ notes, title, source });
      if (!saved) fail("idea-board-unavailable");
      return cloneData(saved);
    },
    renameIdea(ideaId, title) {
      if (typeof ideaId !== "string" || ideaId.length === 0) fail("idea-board-invalid-entry");
      const renamed = ideaBoard?.rename?.(ideaId, title);
      if (!renamed) fail("idea-board-invalid-entry");
      return cloneData(renamed);
    },
    deleteIdea(ideaId) {
      if (typeof ideaId !== "string" || ideaId.length === 0) fail("idea-board-invalid-entry");
      return cloneData(ideaBoard?.remove?.(ideaId) ?? null);
    },
    async listBrowserSongs() {
      return browserLibrary?.listBrowserSongs?.()
        ?? { ok: false, status: "unavailable", error: "unavailable", songs: [] };
    },
    async saveBrowserSong(titleInput = song.title) {
      if (!browserLibrary?.saveBrowserSong) return { ok: false, status: "unavailable", error: "unavailable" };
      const title = typeof titleInput === "string" ? titleInput : titleInput?.title;
      if (typeof title !== "string" || !title.trim()) return { ok: false, status: "invalid-title", error: "invalid-title" };
      const candidate = createSong({ ...cloneData(song), title: title.trim() });
      const result = await browserLibrary.saveBrowserSong(candidate);
      if (result?.ok && song.id === candidate.id) changeSongTitle(candidate.title);
      return result;
    },
    async openBrowserSong(id) {
      if (!browserLibrary?.openBrowserSong) return { ok: false, status: "unavailable", error: "unavailable" };
      const result = await browserLibrary.openBrowserSong(id);
      if (!result?.ok || !result.song) return result;
      const loaded = loadSong(result.song);
      return { ...result, song: loaded };
    },
    async deleteBrowserSong(id) {
      if (!browserLibrary?.deleteBrowserSong) return { ok: false, status: "unavailable", error: "unavailable" };
      return browserLibrary.deleteBrowserSong(id);
    },
    selectRange(startTick, endTick) {
      if (!Number.isSafeInteger(startTick) || startTick < 0 || !Number.isSafeInteger(endTick) || endTick < startTick) fail("invalid-range");
      const noteIds = song.notes
        .filter((note) => note.startTick < endTick && note.startTick + note.durationTicks > startTick)
        .map((note) => note.id);
      selectedChordId = null;
      harmonySession = null;
      selection = { startTick, endTick, noteIds };
      selectedNoteIds = [...noteIds];
      selectedPercussionHitIds = [];
      notifyChange("selection");
      return cloneData(selection);
    }
  };
  return Object.freeze(commands);
}
