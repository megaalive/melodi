import { midiToPitch } from "../core/model.js";

/*
 * Guitar view bukan timeline kedua. Pertanyaan yang dijawabnya hanya satu:
 * nada ini bisa dimainkan di gitar pada posisi mana, dan posisi mana yang paling
 * enak dimainkan. Tidak ada transport, tidak ada sumbu waktu, jadi tidak ada
 * yang harus disinkronkan dengan Piano Roll.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Tuning standar, string 6 (E rendah) sampai string 1 (e tinggi), sebagai MIDI pitch. */
export const STANDARD_TUNING = Object.freeze([40, 45, 50, 55, 59, 64]);
export const MAX_FRET = 24;

const STRING_NAMES = Object.freeze(["E", "A", "D", "G", "B", "e"]);
const INLAY_FRETS = Object.freeze([3, 5, 7, 9, 12, 15, 17, 19, 21]);
// Fret 12 ke atas adalah posisi dengan warna paling bersih dan resonansi paling
// lega. Menandainya memberi alasan musikal untuk memilih posisi, bukan hanya
// posisi mana pun yang bisa dijangkau.
const SWEET_SPOT_FRET = 12;

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
 * Semua posisi yang bisa memainkan satu MIDI pitch pada satu tuning.
 * String dinomori seperti pemain gitar: 6 adalah senar terendah.
 */
export function findGuitarPositions(midiPitch, { tuning = STANDARD_TUNING, maxFret = MAX_FRET } = {}) {
  if (!Number.isInteger(midiPitch) || midiPitch < 0 || midiPitch > 127) return [];
  const positions = [];
  tuning.forEach((openPitch, index) => {
    const fret = midiPitch - openPitch;
    if (fret >= 0 && fret <= maxFret) positions.push({ string: tuning.length - index, fret });
  });
  return positions;
}

export function createGuitarView(svg, { tuning = STANDARD_TUNING, maxFret = MAX_FRET } = {}) {
  function width() {
    return LABEL_WIDTH + (maxFret + 1) * FRET_WIDTH;
  }

  function height() {
    return 18 + ROW_HEIGHT * tuning.length + NUT_HEIGHT;
  }

  function fretX(fret) {
    return LABEL_WIDTH + (fret + 1) * FRET_WIDTH;
  }

  function stringY(index) {
    return 18 + index * ROW_HEIGHT + ROW_HEIGHT / 2;
  }

  function drawNeck() {
    svgElement("rect", { x: 0, y: 0, width: width(), height: height(), class: "neck-board" }, svg);
    svgElement("rect", { x: LABEL_WIDTH, y: 10, width: FRET_WIDTH, height: height() - 10, class: "neck-nut" }, svg);

    for (const fret of INLAY_FRETS) {
      if (fret > maxFret) continue;
      svgElement("circle", {
        cx: fretX(fret) - FRET_WIDTH / 2,
        cy: 18 + (ROW_HEIGHT * tuning.length) / 2,
        r: 4.5,
        class: "neck-inlay"
      }, svg);
    }

    for (let fret = 0; fret <= maxFret; fret += 1) {
      const x = fretX(fret);
      svgElement("line", {
        x1: x, y1: 10, x2: x, y2: height() - NUT_HEIGHT,
        class: fret === SWEET_SPOT_FRET ? "neck-fret neck-fret-sweet" : "neck-fret"
      }, svg);
      if (fret % 3 === 0 || fret === 1) {
        svgElement("text", { x: x - FRET_WIDTH / 2, y: 9, "text-anchor": "middle", class: "neck-fret-label" }, svg, String(fret));
      }
    }

    for (let index = 0; index < tuning.length; index += 1) {
      const y = stringY(index);
      svgElement("line", { x1: 0, y1: y, x2: width(), y2: y, class: "neck-string", "data-string": tuning.length - index }, svg);
      svgElement("text", { x: 4, y: y + 4, class: "neck-string-label" }, svg, STRING_NAMES[index]);
    }
  }

  function drawPositions(positions, noteId) {
    for (const position of positions) {
      const index = tuning.length - position.string;
      const x = fretX(position.fret) - FRET_WIDTH / 2;
      const group = svgElement("g", {
        "data-entity": "guitar-position",
        "data-note-id": noteId ?? "",
        "data-string": position.string,
        "data-fret": position.fret,
        role: "img",
        "aria-label": `String ${position.string}, fret ${position.fret}`
      }, svg);
      svgElement("circle", {
        cx: x, cy: stringY(index), r: 9,
        class: position.fret >= SWEET_SPOT_FRET ? "neck-hit neck-hit-sweet" : "neck-hit"
      }, group);
    }
  }

  return {
    render(state) {
      // Urutan fokus: note yang dipilih, note yang sedang berbunyi, lalu note
      // pertama. Tanpa fallback terakhir, view akan kosong setiap kali transport
      // berhenti dan tidak ada yang dipilih, padahal lagunya jelas berisi nada.
      const focusedId = state.selectedNoteIds[0] ?? state.playback.currentNoteId ?? null;
      const note = state.song.notes.find((item) => item.id === focusedId) ?? state.song.notes[0] ?? null;
      const positions = note ? findGuitarPositions(note.pitch, { tuning, maxFret }) : [];

      svg.setAttribute("viewBox", `0 0 ${width()} ${height()}`);
      svg.setAttribute("width", width());
      svg.setAttribute("height", height());
      svg.setAttribute("aria-label", note
        ? `Guitar neck, ${midiToPitch(note.pitch)}, ${positions.length} playable position(s)`
        : "Guitar neck, no note selected");
      svg.replaceChildren();

      drawNeck();
      if (positions.length > 0) drawPositions(positions, note.id);
      return { note, positions };
    }
  };
}
