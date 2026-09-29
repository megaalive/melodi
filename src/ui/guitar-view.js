import { midiToPitch } from "../core/model.js";

/*
 * Projection Fretboard menjawab posisi fisik satu note pada neck. Timeline dan
 * selection frase ada di guitar-tab.js; keduanya tetap berasal dari canonical
 * NoteEvent yang sama dan tidak menyimpan salinan musik sendiri.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Tuning standar, string 6 (E rendah) sampai string 1 (e tinggi), sebagai MIDI pitch. */
export const STANDARD_TUNING = Object.freeze([40, 45, 50, 55, 59, 64]);
export const MAX_FRET = 24;

const STRING_NAMES = Object.freeze(["E", "A", "D", "G", "B", "e"]);
const INLAY_FRETS = Object.freeze([3, 5, 7, 9, 12, 15, 17, 19, 21]);
// Fret 12 adalah batas oktaf: nada yang sama satu oktaf di atas. Ini landmark
// nyata pada neck, bukan penilaian kualitas. Earlier version menandai fret 12
// ke atas sebagai "paling bersih" dengan warna berbeda, dan itu menyesatkan:
// semua posisi yang ditampilkan tetap bisa dimainkan, jadi membedakannya dengan
// warna seolah-olah sebagian benar dan sebagian salah.
const OCTAVE_FRET = 12;

const LABEL_WIDTH = 34;
const FRET_WIDTH = 26;
const ROW_HEIGHT = 22;
const NUT_HEIGHT = 6;

function svgElement(name, attributes = {}, parent = null, text = null) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== null) element.textContent = text;
  parent?.append(element);
  return element;
}

/**
 * Titik tengah satu fret. Fungsi ini dipakai bersama oleh garis fret, angka
 * fret, titik posisi, dan inlay, jadi semuanya dijamin berada di ruang fret
 * yang sama. Sebelumnya masing-masing menghitung sendiri dan selisih satu fret
 * akan membuat titik terlihat salah tempat.
 */
export function fretCenterX(fret, { labelWidth = LABEL_WIDTH, fretWidth = FRET_WIDTH } = {}) {
  return labelWidth + (fret + 1) * fretWidth - fretWidth / 2;
}

/**
 * Semua posisi yang bisa memainkan satu MIDI pitch pada satu tuning.
 * String dinomori seperti pemain gitar: 6 adalah senar terendah.
 */
export function guitarBendLabel(note) {
  if (!Array.isArray(note?.pitchBend) || note.pitchBend.length < 2) return "";
  const semitones = note.pitchBend.map((point) => point.semitones);
  const max = Math.max(...semitones);
  const min = Math.min(...semitones);
  const release = Math.abs(semitones.at(-1) ?? 0) < 0.001;
  if (max > 0) {
    const amount = max === 1 ? "½" : Number((max / 2).toFixed(2));
    return `${amount}↑${release ? "↓" : ""}`;
  }
  if (min < 0) {
    const absolute = Math.abs(min);
    const amount = absolute === 1 ? "½" : Number((absolute / 2).toFixed(2));
    return `${amount}↓${release ? "↑" : ""}`;
  }
  return "";
}

export function findGuitarPositions(midiPitch, { tuning = STANDARD_TUNING, maxFret = MAX_FRET } = {}) {
  if (!Number.isInteger(midiPitch) || midiPitch < 0 || midiPitch > 127) return [];
  const positions = [];
  tuning.forEach((openPitch, index) => {
    const fret = midiPitch - openPitch;
    if (fret >= 0 && fret <= maxFret) positions.push({ string: tuning.length - index, fret });
  });
  return positions;
}


/**
 * Pilih satu jalur fingering yang stabil untuk seluruh frase. Posisi alternatif
 * tetap tersedia di UI, tetapi jalur utama meminimalkan lompatan fret/senar.
 * Bias fret 14 membuat frase lead default jatuh ke area G/B string yang natural
 * (14-17), bukan meloncat ke semua duplikasi pitch di sepanjang neck.
 */
export function chooseGuitarFingering(notes, {
  tuning = STANDARD_TUNING,
  maxFret = MAX_FRET,
  targetFret = 14,
  stringChangeCost = 1.5
} = {}) {
  const ordered = [...(Array.isArray(notes) ? notes : [])]
    .filter((note) => note && typeof note.id === "string" && Number.isInteger(note.pitch))
    .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || left.id.localeCompare(right.id));
  const playable = ordered.map((note) => ({
    note,
    positions: findGuitarPositions(note.pitch, { tuning, maxFret })
  }));
  const route = new Map();
  if (!playable.length) return route;

  let previousCosts = [];
  let previousLinks = [];
  const costRows = [];
  const linkRows = [];

  for (let index = 0; index < playable.length; index += 1) {
    const positions = playable[index].positions;
    const costs = [];
    const links = [];
    for (let positionIndex = 0; positionIndex < positions.length; positionIndex += 1) {
      const position = positions[positionIndex];
      if (index === 0) {
        costs.push(Math.abs(position.fret - targetFret) * 0.3 + (position.fret === 0 ? 2 : 0));
        links.push(-1);
        continue;
      }
      const previousPositions = playable[index - 1].positions;
      if (!previousPositions.length) {
        costs.push(Math.abs(position.fret - targetFret) * 0.3);
        links.push(-1);
        continue;
      }
      let bestCost = Number.POSITIVE_INFINITY;
      let bestLink = -1;
      for (let previousIndex = 0; previousIndex < previousPositions.length; previousIndex += 1) {
        const previous = previousPositions[previousIndex];
        const highFretPenalty = position.fret > 19 ? (position.fret - 19) * 0.5 : 0;
        const cost = previousCosts[previousIndex]
          + Math.abs(position.fret - previous.fret)
          + Math.abs(position.string - previous.string) * stringChangeCost
          + highFretPenalty;
        if (cost < bestCost) {
          bestCost = cost;
          bestLink = previousIndex;
        }
      }
      costs.push(bestCost);
      links.push(bestLink);
    }
    costRows.push(costs);
    linkRows.push(links);
    previousCosts = costs;
    previousLinks = links;
  }

  let lastPlayableIndex = playable.length - 1;
  while (lastPlayableIndex >= 0 && playable[lastPlayableIndex].positions.length === 0) lastPlayableIndex -= 1;
  if (lastPlayableIndex < 0) return route;

  let positionIndex = costRows[lastPlayableIndex].reduce(
    (best, cost, index, values) => cost < values[best] ? index : best,
    0
  );
  for (let index = lastPlayableIndex; index >= 0; index -= 1) {
    const positions = playable[index].positions;
    if (!positions.length) continue;
    const selected = positions[positionIndex] ?? positions[0];
    route.set(playable[index].note.id, selected);
    const link = linkRows[index][positionIndex];
    positionIndex = link >= 0 ? link : 0;
  }
  return route;
}

export function createGuitarView(svg, { tuning = STANDARD_TUNING, maxFret = MAX_FRET } = {}) {
  let lastSoundingKey = null;

  function width() {
    return LABEL_WIDTH + (maxFret + 1) * FRET_WIDTH;
  }

  function height() {
    return 18 + ROW_HEIGHT * tuning.length + NUT_HEIGHT;
  }

  function fretX(fret) {
    return LABEL_WIDTH + (fret + 1) * FRET_WIDTH;
  }

  function centerX(fret) {
    return fretCenterX(fret);
  }

  function stringY(index) {
    return 18 + index * ROW_HEIGHT + ROW_HEIGHT / 2;
  }

  function drawNeck(hitFrets, currentFrets) {
    svgElement("rect", { x: 0, y: 0, width: width(), height: height(), class: "neck-board" }, svg);
    svgElement("rect", { x: LABEL_WIDTH, y: 10, width: FRET_WIDTH, height: height() - 10, class: "neck-nut" }, svg);

    for (const fret of INLAY_FRETS) {
      if (fret > maxFret) continue;
      svgElement("circle", {
        cx: centerX(fret),
        // Inlay di antara senar D dan G, bukan tepat di senar D.
        cy: 18 + (ROW_HEIGHT * tuning.length) * 0.375,
        r: 4.5,
        class: "neck-inlay"
      }, svg);
    }

    for (let fret = 0; fret <= maxFret; fret += 1) {
      const x = fretX(fret);
      const isCurrent = currentFrets.has(fret);
      svgElement("line", {
        x1: x, y1: 10, x2: x, y2: height() - NUT_HEIGHT,
        class: isCurrent ? "neck-fret neck-fret-current" : (fret === OCTAVE_FRET ? "neck-fret neck-fret-octave" : "neck-fret")
      });
      // Angka dicetak untuk setiap fret yang sedang dipakai, bukan hanya
      // setiap tiga fret. Tanpa itu, titik di fret 5 atau 14 terlihat salah
      // tempat karena tidak ada angka yang bisa dipakai sebagai acuan.
      if (fret % 3 === 0 || fret === 1 || hitFrets.has(fret)) {
        const marked = hitFrets.has(fret);
        svgElement("text", {
          x: centerX(fret), y: 9, "text-anchor": "middle",
          class: isCurrent ? "neck-fret-label neck-fret-label-current" : (marked ? "neck-fret-label neck-fret-label-marked" : "neck-fret-label")
        }, svg, String(fret));
      }
    }

    for (let index = 0; index < tuning.length; index += 1) {
      const y = stringY(index);
      const stringNumber = tuning.length - index;
      svgElement("line", { x1: 0, y1: y, x2: width(), y2: y, class: "neck-string", "data-string": stringNumber }, svg);
      svgElement("text", { x: 4, y: y + 4, class: "neck-string-label" }, svg, STRING_NAMES[index]);
      // Nomor senar ikut dicetak supaya tidak ada ambiguitas senar mana yang
      // dimaksud, karena urutan baris di view ini dibalik dari diagram chord.
      svgElement("text", { x: LABEL_WIDTH - 8, y: y + 4, "text-anchor": "end", class: "neck-string-number" }, svg, String(stringNumber));
    }
  }

  function drawFocusedExpression(note, primaryPosition) {
    if (!note || !primaryPosition) return;
    const index = tuning.length - primaryPosition.string;
    const x = centerX(primaryPosition.fret);
    const y = stringY(index);
    const bend = guitarBendLabel(note);

    if (bend) {
      const group = svgElement("g", {
        class: "neck-expression neck-bend-expression",
        "data-entity": "guitar-bend",
        "data-note-id": note.id
      }, svg);
      svgElement("path", {
        d: `M ${x + 5} ${y - 5} Q ${x + 15} ${y - 18} ${x + 25} ${y - 19}`,
        class: "neck-bend-arc"
      }, group);
      svgElement("circle", {
        cx: x + 25, cy: y - 19, r: 3.3,
        class: "neck-bend-target"
      }, group);
      svgElement("text", {
        x: x + 29, y: y - 16,
        class: "neck-expression-label"
      }, group, bend);
    }

    if (note.vibrato) {
      const group = svgElement("g", {
        class: "neck-expression neck-vibrato-expression",
        "data-entity": "guitar-vibrato",
        "data-note-id": note.id
      }, svg);
      svgElement("path", {
        d: `M ${x - 18} ${y + 14} q 4 -5 8 0 t 8 0 t 8 0`,
        class: "neck-vibrato-wave"
      }, group);
      svgElement("text", {
        x: x + 13, y: y + 18,
        class: "neck-expression-label"
      }, group, `±${Number(note.vibrato.depthSemitones.toFixed(2))}`);
    }
  }

  function drawPositions(positions, primaryPosition, noteId, isCurrent) {
    for (const position of positions) {
      const index = tuning.length - position.string;
      const x = centerX(position.fret);
      const group = svgElement("g", {
        "data-entity": "guitar-position",
        "data-note-id": noteId ?? "",
        "data-string": position.string,
        "data-fret": position.fret,
        role: "img",
        "aria-label": `String ${position.string}, fret ${position.fret}`
      }, svg);
      const primary = Boolean(primaryPosition
        && primaryPosition.string === position.string
        && primaryPosition.fret === position.fret);
      const classes = ["neck-hit", primary ? "neck-hit-primary" : "neck-hit-alternative"];
      if (position.fret === 0) classes.push("neck-hit-open");
      if (isCurrent && primary) classes.push("neck-hit-current");
      group.setAttribute("data-primary", String(primary));
      group.setAttribute("aria-label", `String ${position.string}, fret ${position.fret}${primary ? ", recommended" : ", alternative"}`);
      svgElement("circle", {
        cx: x,
        cy: stringY(index),
        r: primary ? 9 : 5.5,
        class: classes.join(" ")
      }, group);
    }
  }

  return {
    render(state) {
      // Urutan fokus: note yang dipilih, note yang sedang berbunyi, lalu note
      // pertama. Tanpa fallback terakhir, view akan kosong setiap kali transport
      // berhenti dan tidak ada yang dipilih, padahal lagunya jelas berisi nada.
      const playingNoteId = state.playback.currentNoteId ?? null;
      const isPlaying = state.playback.status === "playing" || state.playback.status === "paused";
      const followPlayback = state.view?.follow !== false;
      const focusedId = isPlaying && followPlayback && playingNoteId
        ? playingNoteId
        : state.selectedNoteIds[0] ?? playingNoteId ?? null;
      const note = state.song.notes.find((item) => item.id === focusedId) ?? state.song.notes[0] ?? null;
      const positions = note ? findGuitarPositions(note.pitch, { tuning, maxFret }) : [];
      const fingering = chooseGuitarFingering(state.song.notes, { tuning, maxFret });
      const primaryPosition = note ? fingering.get(note.id) ?? positions[0] ?? null : null;
      const sounding = isPlaying && playingNoteId === note?.id;
      const hitFrets = new Set(positions.map((position) => position.fret));
      const currentFrets = sounding && primaryPosition ? new Set([primaryPosition.fret]) : new Set();

      svg.setAttribute("viewBox", `0 0 ${width()} ${height()}`);
      svg.setAttribute("width", width());
      svg.setAttribute("height", height());
      svg.setAttribute("aria-label", note
        ? `Guitar neck, ${midiToPitch(note.pitch)}, ${positions.length} playable position(s)`
        : "Guitar neck, no note selected");
      svg.replaceChildren();

      drawNeck(hitFrets, currentFrets);
      if (positions.length > 0) {
        drawPositions(positions, primaryPosition, note.id, sounding);
        drawFocusedExpression(note, primaryPosition);
      }
      lastSoundingKey = `${note?.id ?? ""}:${sounding}`;
      return { note, positions, primaryPosition, sounding, playheadTick: state.playback.currentTick };
    },

    /**
     * Dipanggil tiap tick playback. Build ulang hanya kalau nada yang berbunyi
     * benar-benar berubah, supaya transport yang berjalan 25 ms sekali tidak
     * membuat ulang seluruh neck.
     */
    updatePlayback(state) {
      const playingNoteId = state.playback.currentNoteId ?? null;
      const isPlaying = state.playback.status === "playing" || state.playback.status === "paused";
      const followPlayback = state.view?.follow !== false;
      const focusedId = isPlaying && followPlayback && playingNoteId
        ? playingNoteId
        : state.selectedNoteIds[0] ?? playingNoteId ?? null;
      const note = state.song.notes.find((item) => item.id === focusedId) ?? state.song.notes[0] ?? null;
      const sounding = isPlaying && (state.playback.currentNoteId ?? null) === note?.id;
      const key = `${note?.id ?? ""}:${sounding}`;
      if (key === lastSoundingKey) return false;
      this.render(state);
      return true;
    }
  };
}
