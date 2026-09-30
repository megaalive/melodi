import { projectSongToScore } from "./project.js";

function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function abcLength(ticks, ppq) {
  const base = ppq / 2; // L:1/8
  const divisor = gcd(ticks, base);
  const numerator = ticks / divisor;
  const denominator = base / divisor;
  if (numerator === denominator) return "";
  if (denominator === 1) return String(numerator);
  if (numerator === 1) return `/${denominator}`;
  return `${numerator}/${denominator}`;
}

function abcPitch(spelling) {
  const accidental = spelling.accidental === "##" ? "^^"
    : spelling.accidental === "#" ? "^"
      : spelling.accidental === "bb" ? "__"
        : spelling.accidental === "b" ? "_" : "";
  const octave = spelling.octave;
  const letter = octave >= 5 ? spelling.step.toLowerCase() : spelling.step.toUpperCase();
  const marks = octave >= 5 ? "'".repeat(Math.max(0, octave - 5)) : ",".repeat(Math.max(0, 4 - octave));
  return `${accidental}${letter}${marks}`;
}

function chordQualitySuffix(quality) {
  const normalized = String(quality ?? "").trim().toLowerCase();
  if (["major", "maj", "major triad"].includes(normalized)) return "";
  if (["minor", "min", "minor triad"].includes(normalized)) return "m";
  if (["diminished", "dim", "diminished triad"].includes(normalized)) return "dim";
  if (["dominant7", "dominant 7", "7"].includes(normalized)) return "7";
  if (["major7", "major 7", "maj7"].includes(normalized)) return "maj7";
  if (["minor7", "minor 7", "min7", "m7"].includes(normalized)) return "m7";
  return String(quality ?? "");
}

function escapeChord(value) {
  return String(value).replace(/"/g, "'");
}

function eventToken(event, projection, noteClassById, chordsByTick, includeChords) {
  const length = abcLength(event.durationTicks, projection.ppq);
  const chord = includeChords ? chordsByTick.get(event.startTick) : null;
  const chordPrefix = chord ? `"${escapeChord(chord.rootName + chordQualitySuffix(chord.quality))}"` : "";
  if (event.kind === "rest") return `${chordPrefix}z${length}`;

  const className = noteClassById.get(event.noteId);
  const classDecoration = className ? `!class=${className}!` : "";
  const tie = event.tieToNext ? "-" : "";
  return `${chordPrefix}${classDecoration}${abcPitch(event.spelling)}${length}${tie}`;
}

function makeClassMaps(song) {
  const ordered = [...song.notes].sort((left, right) =>
    left.startTick - right.startTick || left.pitch - right.pitch || left.id.localeCompare(right.id));
  const noteClassById = new Map();
  const noteIdByClass = new Map();
  ordered.forEach((note, index) => {
    const className = `melodi-note-${index}`;
    noteClassById.set(note.id, className);
    noteIdByClass.set(className, note.id);
  });
  return { noteClassById, noteIdByClass };
}

function measureEventsForLane(measure, laneIndex, projection) {
  const lane = measure.lanes.find((candidate) => candidate.index === laneIndex);
  if (lane?.renderable && lane.events.length) return lane.events;
  return [{
    kind: "rest",
    startTick: measure.startTick,
    durationTicks: projection.ticksPerMeasure,
    measureIndex: measure.index
  }];
}

/**
 * Membuat ABC hanya sebagai proyeksi engraving. Canonical state tetap song Melodi;
 * ABC tidak pernah menjadi sumber kebenaran untuk edit, bend, pan, atau volume.
 */
export function projectSongToAbc(song) {
  const projection = projectSongToScore(song);
  const { noteClassById, noteIdByClass } = makeClassMaps(song);
  const maxLaneCount = Math.max(1, ...projection.measures.map((measure) =>
    Math.max(1, ...measure.lanes.filter((lane) => lane.renderable).map((lane) => lane.index + 1))));
  const voiceIds = Array.from({ length: maxLaneCount }, (_, index) => String(index + 1));

  const header = [
    "X:1",
    `T:${String(song.title || "Melodi").replace(/[\r\n]+/g, " ")}`,
    `M:${projection.timeSignature.numerator}/${projection.timeSignature.denominator}`,
    "L:1/8",
    `Q:1/4=${Math.round(song.timing.tempo)}`,
    ...(voiceIds.length > 1 ? [`%%score (${voiceIds.join(" ")})`] : []),
    ...voiceIds.map((voiceId) => `V:${voiceId} clef=treble name=""`),
    `K:${projection.key}`
  ];

  const lines = voiceIds.map((voiceId, laneIndex) => {
    const tokens = [];
    for (const measure of projection.measures) {
      const chordsByTick = new Map(measure.chords.map((chord) => [chord.startTick, chord]));
      const events = measureEventsForLane(measure, laneIndex, projection);
      for (const event of events) {
        // Chord yang mulai di tengah note/rest tetap tampak pada tick yang tepat.
        // Pemecahan hanya proyeksi ABC; canonical note dan durasinya tidak berubah.
        const boundaries = laneIndex === 0 ? [...chordsByTick.keys()]
          .filter((tick) => tick > event.startTick && tick < event.startTick + event.durationTicks)
          .sort((left, right) => left - right) : [];
        const starts = [event.startTick, ...boundaries];
        for (let index = 0; index < starts.length; index += 1) {
          const endTick = starts[index + 1] ?? event.startTick + event.durationTicks;
          tokens.push(eventToken({ ...event, startTick: starts[index], durationTicks: endTick - starts[index],
            tieToNext: event.kind === "note" && (index < starts.length - 1 || event.tieToNext)
          }, projection, noteClassById, chordsByTick, laneIndex === 0));
        }
      }
      tokens.push("|");
    }
    return `[V:${voiceId}] ${tokens.join(" ")}`;
  });

  return {
    abc: [...header, ...lines].join("\n"),
    projection,
    noteClassById,
    noteIdByClass
  };
}

export function expressionSummary(note) {
  const parts = [];
  if (typeof note.volume === "number" && Math.abs(note.volume - 1) > 0.001) {
    parts.push(`V ${Math.round(note.volume * 100)}%`);
  }
  if (typeof note.pan === "number" && Math.abs(note.pan) > 0.001) {
    const amount = Math.round(Math.abs(note.pan) * 100);
    parts.push(note.pan < 0 ? `L ${amount}` : `R ${amount}`);
  }
  if (note.vibrato) {
    parts.push(`Vib ${Number(note.vibrato.rateHz.toFixed(1))}Hz ±${Number(note.vibrato.depthSemitones.toFixed(2))}`);
  }
  return parts.join(" · ");
}
