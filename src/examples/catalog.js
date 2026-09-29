import { createId, createInitialSong, createSong, MelodiError, PPQ } from "../core/model.js?v=20260930.18";
import { GM_STANDARD_KIT } from "../instruments/percussion.js?v=20260930.18";

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
    id: "jazz-drums-medium-swing",
    titleKey: "exampleJazzDrumsTitle",
    descriptionKey: "exampleJazzDrumsDescription",
    kind: "drums",
    tags: Object.freeze(["drums", "jazz", "swing"]),
    factory: (idFactory) => createJazzDrumsSong(idFactory)
  })
]);

function createJazzDrumsSong(idFactory) {
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
  for (let bar = 0; bar < 8; bar += 1) {
    const barStart = bar * barTicks;
    for (let beat = 0; beat < 4; beat += 1) {
      const beatStart = barStart + beat * beatTicks;
      add("ride", beatStart, beat === 0 || beat === 2 ? 82 : 69);
      add("ride", beatStart + Math.floor(beatTicks * 2 / 3), beat === 0 || beat === 2 ? 54 : 48, "ghost");
    }

    // Light foot/closes on beats two and four, leaving the swung Ride audible.
    add("closed-hi-hat", barStart + beatTicks, 56, "ghost");
    add("closed-hi-hat", barStart + beatTicks * 3, 61, "normal");

    // Feathered two-beat bass pulse with a little phrase variation.
    add("kick", barStart, bar % 4 === 0 ? 54 : 48, "ghost");
    add("kick", barStart + beatTicks * 2, bar % 2 === 0 ? 50 : 44, "ghost");

    // Syncopated low-velocity comping; selected accents move across the bar.
    add("snare", barStart + beatTicks + beatTicks / 2, 37, "ghost");
    add("snare", barStart + beatTicks * 3 + (bar % 2 ? 160 : 240), 42, "ghost");
    if (bar % 2 === 1) add("snare", barStart + beatTicks * 2, 69, "accent");
  }

  // Short tom pickups anticipate the two four-bar phrases. The final crash
  // lands on beat four of the last bar after its fill.
  for (const bar of [3, 7]) {
    const barStart = bar * barTicks;
    const fillStart = bar === 3 ? barStart + beatTicks * 3 : barStart + beatTicks * 2 + 160;
    add("low-tom", fillStart, 58, "normal");
    add("mid-tom", fillStart + 160, 64, "normal");
    add("high-tom", fillStart + 320, 72, "accent");
  }
  add("crash", 7 * barTicks + beatTicks * 3, 112, "accent");

  return createSong({
    id: idFactory(),
    title: "Jazz Drums — Medium Swing",
    timing: { ppq: PPQ, tempo: 132, timeSignature: { numerator: 4, denominator: 4 } },
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
