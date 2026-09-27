import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSong, createSong } from "../src/core/model.js";
import { createCommands } from "../src/core/commands.js";
import { deserializeProject, serializeProject } from "../src/core/serialization.js";
import { createDraftPersistence } from "../src/storage/draft.js";
import { generateGap } from "../src/generation/generator.js";
import { createGenerationContext } from "../src/generation/context.js";
import { rankCandidates, scoreCandidate, SCORING_WEIGHTS } from "../src/generation/scoring.js";
import {
  approachNote,
  directMove,
  isScalePitch,
  leapNote,
  leapResolution,
  neighborNote,
  repetition,
  scalePassingNote,
  scalePassingNotes,
  sequence
} from "../src/generation/primitives.js";

function fixture() {
  let next = 0;
  const song = createInitialSong(() => `entity-${++next}`);
  const left = { id: "anchor-left", pitch: 60, startTick: 0, durationTicks: 480, source: "user", anchor: true, locked: false };
  const right = { id: "anchor-right", pitch: 67, startTick: 1440, durationTicks: 480, source: "user", anchor: true, locked: false };
  return createSong({
    ...song,
    sections: [{ ...song.sections[0], phraseIds: ["phrase-main"] }],
    notes: [left, right],
    phrases: [{ id: "phrase-main", noteIds: [left.id, right.id] }]
  });
}

function request(overrides = {}) {
  return {
    startTick: 480,
    endTick: 1440,
    leftAnchorNoteId: "anchor-left",
    rightAnchorNoteId: "anchor-right",
    seed: 1947,
    ...overrides
  };
}

function expectGenerationCode(operation, code) {
  assert.throws(operation, (error) => error?.code === code);
}

function playerStub() {
  let preview;
  return {
    get preview() { return preview; },
    factory() {
      return {
        play: async () => true,
        pause: () => 0,
        stop: () => 0,
        seek() {},
        updateTempo() {},
        updateLoop() {},
        songChanged() {},
        playPreview: async (notes, options) => { preview = { notes: structuredClone(notes), onEnded: options.onEnded }; return true; },
        cancelPreview() { return true; }
      };
    }
  };
}

test("gap generation is deterministic for the same context and seed", () => {
  const song = fixture();
  const before = structuredClone(song);
  const first = generateGap(song, request());
  const second = generateGap(song, request());
  assert.deepEqual(first, second);
  assert.deepEqual(song, before);
  assert.equal(first.candidates.length, 6);
});

test("different seeds change candidate pitches or rhythms while retaining the gap", () => {
  const song = fixture();
  const first = generateGap(song, request({ seed: 1947 }));
  const second = generateGap(song, request({ seed: 1948 }));
  assert.notDeepEqual(first.candidates.map((candidate) => candidate.notes.map(({ pitch, startTick, durationTicks }) => [pitch, startTick, durationTicks])),
    second.candidates.map((candidate) => candidate.notes.map(({ pitch, startTick, durationTicks }) => [pitch, startTick, durationTicks])));
  for (const candidate of second.candidates) {
    assert.equal(candidate.notes[0].startTick, 480);
    assert.equal(candidate.notes.at(-1).startTick + candidate.notes.at(-1).durationTicks, 1440);
  }
});

test("all generated notes exactly fill the half-open gap on the allowed grid and in voice range", () => {
  const output = generateGap(fixture(), request({ voiceRange: { minPitch: 60, maxPitch: 72 } }));
  for (const candidate of output.candidates) {
    let cursor = 480;
    for (const note of candidate.notes) {
      assert.ok(Number.isSafeInteger(note.pitch));
      assert.ok(note.pitch >= 60 && note.pitch <= 72);
      assert.ok([120, 240, 480, 960].includes(note.durationTicks));
      assert.equal(note.startTick, cursor);
      assert.ok(note.startTick + note.durationTicks <= 1440);
      cursor += note.durationTicks;
    }
    assert.equal(cursor, 1440);
  }
});

test("gap validation rejects empty, inverted, occupied, stale-anchor, and cross-phrase gaps", () => {
  const song = fixture();
  expectGenerationCode(() => generateGap(song, request({ endTick: 480 })), "generation-empty-gap");
  expectGenerationCode(() => generateGap(song, request({ startTick: 1440, endTick: 480 })), "generation-empty-gap");
  expectGenerationCode(() => generateGap(createSong({
    ...song,
    notes: [...song.notes, { id: "locked-gap-note", pitch: 64, startTick: 720, durationTicks: 120, source: "user", anchor: false, locked: true }],
    phrases: [{ ...song.phrases[0], noteIds: [...song.phrases[0].noteIds, "locked-gap-note"] }]
  }), request()), "generation-protected-note");
  expectGenerationCode(() => generateGap(song, request({ leftAnchorNoteId: "missing" })), "generation-anchor-not-found");
  expectGenerationCode(() => generateGap(createSong({
    ...song,
    sections: [{ ...song.sections[0], phraseIds: ["phrase-left", "phrase-right"] }],
    phrases: [
      { id: "phrase-left", noteIds: ["anchor-left"] },
      { id: "phrase-right", noteIds: ["anchor-right"] }
    ]
  }), request()), "generation-cross-phrase");
});

test("passing note is a scale tone between its structural pitches", () => {
  const context = { key: "C", scale: { intervals: [0, 2, 4, 5, 7, 9, 11] } };
  const passing = scalePassingNote(60, 64, context);
  assert.equal(passing, 62);
  assert.equal(isScalePitch(passing, "C", { intervals: [0, 2, 4, 5, 7, 9, 11] }), true);
  const path = [60, ...scalePassingNotes(60, 67, context), 67];
  assert.deepEqual(path, [60, 62, 64, 65, 67]);
});

test("neighbor move departs by one scale tone and returns", () => {
  const neighbor = neighborNote(60, { key: "C", scale: { intervals: [0, 2, 4, 5, 7, 9, 11] } }, 1);
  assert.deepEqual(neighbor.pitches, [62, 60]);
});

test("approach note resolves by scale step to target", () => {
  const context = { key: "C", scale: { intervals: [0, 2, 4, 5, 7, 9, 11] } };
  const approach = approachNote(67, 60, context);
  assert.equal(approach, 65);
  assert.equal(directMove(approach, 67, context).at(-1), 67);
});

test("leap is bounded and leap resolution steps in the opposite direction", () => {
  const context = { key: "C", scale: { intervals: [0, 2, 4, 5, 7, 9, 11] } };
  const leap = leapNote(60, 1, context, 4, 48, 84);
  const resolved = leapResolution(60, 1, context, 4, 48, 84);
  assert.ok(leap > 60 && leap <= 84);
  assert.ok(resolved.leapPitch > 60);
  assert.ok(resolved.resolutionPitch < resolved.leapPitch);
  assert.equal(isScalePitch(resolved.leapPitch, "C", context.scale), true);
  assert.equal(isScalePitch(resolved.resolutionPitch, "C", context.scale), true);
});

test("repetition and sequence remain bounded melodic operations", () => {
  assert.deepEqual(repetition(64, 3), [64, 64, 64]);
  const result = sequence(60, [1, -1], 4, { key: "C", scale: { intervals: [0, 2, 4, 5, 7, 9, 11] } }, 48, 84);
  assert.equal(result.length, 4);
  assert.ok(result.every((pitch) => pitch >= 48 && pitch <= 84 && isScalePitch(pitch, "C", { intervals: [0, 2, 4, 5, 7, 9, 11] })));
});

test("generation rejects invalid range, seed, and a range with no scale tone", () => {
  const song = fixture();
  expectGenerationCode(() => generateGap(song, request({ seed: -1 })), "generation-invalid-seed");
  expectGenerationCode(() => generateGap(song, request({ voiceRange: { minPitch: 61, maxPitch: 61 } })), "generation-invalid-voice-range");
  const pentatonic = createSong({ ...song, scale: { name: "pentatonic", intervals: [0, 2, 4, 7, 9] } });
  expectGenerationCode(() => generateGap(pentatonic, request({ voiceRange: { minPitch: 65, maxPitch: 66 } })), "generation-range-has-no-scale-tones");
});

function candidate(id, pitches, duration = 960 / pitches.length) {
  let startTick = 480;
  const notes = pitches.map((pitch, index) => {
    const note = { id: `${id}-note-${index}`, pitch, startTick, durationTicks: duration };
    startTick += duration;
    return note;
  });
  return { id, seed: 1, notes, generationIndex: 0, sourceMoves: ["direct"] };
}

test("scoring dimensions and overall score are normalized and explicit", () => {
  const context = createGenerationContext(fixture(), request());
  const result = scoreCandidate(candidate("smooth", [62, 65]), context, {
    voiceRange: { minPitch: 48, maxPitch: 84 },
    styleProfile: "balanced"
  });
  assert.deepEqual(Object.keys(result.scoreBreakdown).sort(), Object.keys(SCORING_WEIGHTS).sort());
  assert.ok(result.score >= 0 && result.score <= 1);
  assert.ok(Object.values(result.scoreBreakdown).every((value) => value >= 0 && value <= 1));
  assert.deepEqual(result.metadata, {
    noteCount: 2,
    range: { minPitch: 62, maxPitch: 65, label: "D4–F4" },
    stepCount: 1,
    leapCount: 0,
    landingInterval: -2,
    smoothLanding: true
  });
});

test("smooth tonal phrase outranks an unresolved large leap on the relevant dimensions", () => {
  const context = createGenerationContext(fixture(), request());
  const options = { voiceRange: { minPitch: 48, maxPitch: 84 }, styleProfile: "balanced" };
  const smooth = scoreCandidate(candidate("smooth", [62, 65]), context, options);
  const unresolved = scoreCandidate(candidate("unresolved", [84, 60]), context, options);
  assert.ok(smooth.scoreBreakdown.leapResolution > unresolved.scoreBreakdown.leapResolution);
  assert.ok(smooth.scoreBreakdown.singability > unresolved.scoreBreakdown.singability);
});

test("anchor landing and requested syllable density affect only their scoring dimensions", () => {
  const context = createGenerationContext(fixture(), request());
  const near = scoreCandidate(candidate("near", [62, 65]), context, { voiceRange: { minPitch: 48, maxPitch: 84 } });
  const far = scoreCandidate(candidate("far", [62, 60]), context, { voiceRange: { minPitch: 48, maxPitch: 84 } });
  assert.ok(near.scoreBreakdown.anchorLanding > far.scoreBreakdown.anchorLanding);

  const sparse = scoreCandidate(candidate("sparse", [62]), context, { expectedSyllableCount: 3 });
  const aligned = scoreCandidate(candidate("aligned", [62, 64, 65]), context, { expectedSyllableCount: 3 });
  assert.ok(aligned.scoreBreakdown.lyricFit > sparse.scoreBreakdown.lyricFit);
});

test("deduplication and ranking are deterministic and keep objective score metadata", () => {
  const context = createGenerationContext(fixture(), request());
  const first = candidate("first-id", [62, 65]);
  const duplicate = { ...candidate("different-id", [62, 65]), sourceMoves: ["approach"] };
  const second = candidate("second-id", [64, 65]);
  const options = { voiceRange: { minPitch: 48, maxPitch: 84 }, candidateCount: 6 };
  const ranked = rankCandidates([second, duplicate, first], context, options);
  assert.equal(ranked.length, 2);
  assert.deepEqual(ranked, rankCandidates([second, duplicate, first], context, options));
  assert.equal(ranked.some((item) => item.metadata.range.label && Number.isFinite(item.score)), true);
  assert.deepEqual(ranked.find((item) => item.notes[0].pitch === 62).sourceMoves, ["approach", "direct"]);
});

test("style profile changes ranking score without rewriting candidate notes", () => {
  const context = createGenerationContext(fixture(), request());
  const source = candidate("style", [62, 64, 65]);
  const originalNotes = structuredClone(source.notes);
  const balanced = scoreCandidate(source, context, { styleProfile: "balanced" });
  const smooth = scoreCandidate(source, context, { styleProfile: "smooth" });
  assert.notEqual(balanced.scoreBreakdown.styleFit, smooth.scoreBreakdown.styleFit);
  assert.deepEqual(source.notes, originalNotes);
});

test("Generate, Select, Regenerate, and Audition keep the canonical Song unchanged", async () => {
  const song = fixture();
  const before = structuredClone(song);
  const changes = [];
  const audio = playerStub();
  let nextId = 0;
  const commands = createCommands(song, {
    idFactory: () => `new-${++nextId}`,
    onChange: (change) => changes.push(change.kind),
    audioPlayerFactory: audio.factory.bind(audio)
  });

  const generated = commands.generateGap(request());
  assert.deepEqual(commands.getSong(), before);
  assert.equal(generated.status, "ready");
  assert.equal(generated.candidates.length, 6);
  assert.deepEqual(commands.getState().generation.candidateIds, generated.candidateIds);
  generated.candidates[0].notes[0].pitch = 0;
  assert.notEqual(commands.getGenerationState().candidates[0].notes[0].pitch, 0);

  commands.selectCandidate(generated.candidateIds[0]);
  assert.deepEqual(commands.getSong(), before);
  await commands.auditionCandidate(generated.candidateIds[0]);
  assert.deepEqual(commands.getSong(), before);
  assert.equal(commands.getGenerationState().auditionCandidateId, generated.candidateIds[0]);
  assert.equal(audio.preview.notes.at(-1).id, "preview-" + generated.candidateIds[0] + "-right-anchor");
  audio.preview.onEnded();
  assert.equal(commands.getGenerationState().auditionCandidateId, null);

  const regenerated = commands.regenerateGap();
  assert.equal(regenerated.seed, generated.seed + 1);
  assert.deepEqual(commands.getSong(), before);
  assert.ok(changes.every((kind) => kind === "generation"));
});

test("Accept commits generated notes and phrase membership once, then serializes validly", () => {
  const song = fixture();
  const originalAnchors = song.notes.map((note) => structuredClone(note));
  const changes = [];
  let nextId = 0;
  const commands = createCommands(song, {
    idFactory: () => `accepted-${++nextId}`,
    onChange: (change) => changes.push(change.kind),
    audioPlayerFactory: playerStub().factory.bind(playerStub())
  });
  const generated = commands.generateGap(request());
  const chosen = generated.candidates[0];
  const accepted = commands.acceptCandidate(chosen.id);
  const canonical = commands.getSong();
  assert.equal(accepted.length, chosen.notes.length);
  assert.deepEqual(canonical.notes.slice(0, 2), originalAnchors);
  assert.deepEqual(accepted.map(({ pitch, startTick, durationTicks }) => ({ pitch, startTick, durationTicks })),
    chosen.notes.map(({ pitch, startTick, durationTicks }) => ({ pitch, startTick, durationTicks })));
  assert.ok(accepted.every((note) => note.source === "generated" && !note.anchor && !note.locked));
  assert.deepEqual(canonical.phrases[0].noteIds,
    ["anchor-left", ...accepted.map((note) => note.id), "anchor-right"]);
  assert.deepEqual(canonical.lyrics, song.lyrics);
  assert.deepEqual(canonical.chords, song.chords);
  assert.equal(changes.filter((kind) => kind === "song").length, 1);
  assert.equal(commands.getGenerationState().status, "idle");
  assert.equal(deserializeProject(serializeProject(canonical)).notes.length, canonical.notes.length);
});

test("Accept rejects a candidate after any canonical context change", () => {
  let nextId = 0;
  const commands = createCommands(fixture(), {
    idFactory: () => `stale-${++nextId}`,
    audioPlayerFactory: playerStub().factory.bind(playerStub())
  });
  const generated = commands.generateGap(request());
  commands.updateNote("anchor-left", { pitch: 62 });
  const changedSong = commands.getSong();
  expectGenerationCode(() => commands.acceptCandidate(generated.candidates[0].id), "generation-stale");
  assert.deepEqual(commands.getSong(), changedSong);
  assert.equal(commands.getGenerationState().status, "ready");
});

test("accepted notes can be locked through an explicit user command", () => {
  let nextId = 0;
  const commands = createCommands(fixture(), {
    idFactory: () => `locked-${++nextId}`,
    audioPlayerFactory: playerStub().factory.bind(playerStub())
  });
  const generated = commands.generateGap(request());
  commands.acceptCandidate(generated.candidates[0].id);
  const lockedIds = commands.lockAcceptedNotes();
  assert.ok(lockedIds.length > 0);
  assert.ok(commands.getSong().notes.filter((note) => lockedIds.includes(note.id)).every((note) => note.locked && note.source === "generated"));
  assert.deepEqual(commands.getGenerationState().acceptedNoteIds, []);
});

test("New Idea clears candidate runtime state", () => {
  let nextId = 0;
  const commands = createCommands(fixture(), {
    idFactory: () => `new-idea-${++nextId}`,
    audioPlayerFactory: playerStub().factory.bind(playerStub())
  });
  commands.generateGap(request());
  assert.equal(commands.getGenerationState().status, "ready");
  commands.newIdea();
  assert.equal(commands.getGenerationState().status, "idle");
  assert.deepEqual(commands.getGenerationState().candidateIds, []);
});

test("candidate runtime state does not autosave; Accept schedules only canonical Song data", async () => {
  const storage = new Map();
  let timerCallback = null;
  let nextTimer = 0;
  const persistence = createDraftPersistence({
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    setTimer: (callback) => { timerCallback = callback; return ++nextTimer; },
    clearTimer: () => { timerCallback = null; }
  });
  let commands;
  let nextId = 0;
  const audio = playerStub();
  commands = createCommands(fixture(), {
    idFactory: () => `saved-${++nextId}`,
    onChange(change) {
      if (change.kind === "song") persistence.schedule(commands.getSong());
    },
    audioPlayerFactory: audio.factory.bind(audio)
  });

  const generated = commands.generateGap(request());
  commands.selectCandidate(generated.candidates[0].id);
  await commands.auditionCandidate(generated.candidates[0].id);
  commands.regenerateGap();
  assert.equal(persistence.flush(), false);
  assert.equal(storage.size, 0);

  const chosen = commands.getGenerationState().candidates[0];
  commands.acceptCandidate(chosen.id);
  assert.equal(typeof timerCallback, "function");
  assert.equal(persistence.flush(), true);
  const saved = [...storage.values()][0];
  assert.equal(saved.includes("generation"), false);
  assert.equal(deserializeProject(saved).notes.length, fixture().notes.length + chosen.notes.length);
});
