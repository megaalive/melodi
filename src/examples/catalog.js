import { createId, createInitialSong, createSong, MelodiError, PPQ } from "../core/model.js?v=20261001.42";
import { GM_STANDARD_KIT } from "../instruments/percussion.js?v=20261001.42";

const EXAMPLES = Object.freeze([
  Object.freeze({
    id: "starter-melody",
    titleKey: "exampleStarterTitle",
    descriptionKey: "exampleStarterDescription",
    kind: "melody",
    tags: Object.freeze(["melody", "6/8"]),
    factory: (idFactory) => {
      const song = createInitialSong(idFactory);
      song.title = "Melodi awal";
      return song;
    }
  }),
  Object.freeze({
    id: "punk-drums-fast-drive",
    titleKey: "examplePunkDrumsTitle",
    descriptionKey: "examplePunkDrumsDescription",
    kind: "drums",
    tags: Object.freeze(["drums", "punk", "straight"]),
    factory: (idFactory) => createPunkDrumsSong(idFactory)
  })
]);

function createPunkDrumsSong(idFactory) {
  const events = [];
  const add = (pieceId, startTick, velocity, articulation = "normal", durationTicks) => {
    events.push({
      id: idFactory(),
      pieceId,
      startTick,
      velocity,
      articulation,
      ...(durationTicks === undefined ? {} : { durationTicks })
    });
  };

  const beatTicks = PPQ;
  const barTicks = beatTicks * 4;
  const eighthTicks = beatTicks / 2;
  for (let bar = 0; bar < 8; bar += 1) {
    const barStart = bar * barTicks;
    // Leave space for the short beat-four pickup and the final half-bar fill.
    const hatCount = bar === 3 ? 6 : bar === 7 ? 4 : 8;
    for (let eighth = 0; eighth < hatCount; eighth += 1) {
      const open = (bar === 4 || bar === 6) && eighth === 7;
      add(open ? "open-hi-hat" : "closed-hi-hat", barStart + eighth * eighthTicks,
        eighth % 2 === 0 ? 86 + bar % 3 : 72 + bar % 5,
        eighth % 2 === 0 ? "accent" : "normal");
    }
    add("snare", barStart + beatTicks, 110 + bar % 3, "accent");
    add("snare", barStart + beatTicks * 3, 114 + bar % 3, "accent");
    const kickOffsets = bar === 7 ? [0, 240] : [0, 240, 960, 1200];
    if (bar === 1 || bar === 2 || bar === 5 || bar === 6) kickOffsets.push(1680);
    for (const offset of kickOffsets) {
      add("kick", barStart + offset, offset === 0 ? 108 : 92 + (bar * 3 + offset / 240) % 13);
    }
  }

  // Four straight sixteenths lead into the second phrase.
  const pickup = 3 * barTicks + 3 * beatTicks;
  add("low-tom", pickup, 96);
  add("mid-tom", pickup + 120, 100);
  add("high-tom", pickup + 240, 104, "accent");
  add("snare", pickup + 360, 112, "accent");
  add("crash", 4 * barTicks, 112, "accent");

  // The final half-bar resolves into a real Crash with a full beat of duration.
  const ending = 7 * barTicks + 2 * beatTicks;
  add("low-tom", ending, 100);
  add("mid-tom", ending + 120, 104);
  add("high-tom", ending + 240, 108, "accent");
  add("snare", ending + 360, 116, "accent");
  add("crash", 7 * barTicks + 3 * beatTicks, 116, "accent", beatTicks);

  return createSong({
    id: idFactory(),
    title: "Punk Drums — Fast Drive",
    timing: { ppq: PPQ, tempo: 184, timeSignature: { numerator: 4, denominator: 4 } },
    key: "C",
    scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    sections: [],
    phrases: [],
    notes: [],
    lyrics: { rawText: "", syllables: [] },
    chords: [],
    tracks: [{
      id: idFactory(),
      kind: "percussion",
      role: "rhythm",
      kitId: GM_STANDARD_KIT.id,
      events: events.sort((left, right) => left.startTick - right.startTick || left.pieceId.localeCompare(right.pieceId))
    }]
  });
}

export function listExamples() {
  return EXAMPLES.map(({ id, titleKey, descriptionKey, kind, tags }) => ({
    id, titleKey, descriptionKey, kind, tags: [...tags]
  }));
}

export function createExample(id, idFactory = createId) {
  const example = EXAMPLES.find((item) => item.id === id);
  if (!example) throw new MelodiError("example-not-found");
  return example.factory(idFactory);
}
