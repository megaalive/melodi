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

  function drawPositions(positions, noteId, isCurrent) {
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
      const classes = ["neck-hit"];
      // Yang ditandai hanya teknik yang memang berbeda: senar terbuka, dan nada
      // yang sedang berbunyi. Tidak ada lagi dua warna yang menyiratkan posisi
      // yang benar dan yang salah.
      if (position.fret === 0) classes.push("neck-hit-open");
      if (isCurrent) classes.push("neck-hit-current");
      svgElement("circle", { cx: x, cy: stringY(index), r: 9, class: classes.join(" ") }, group);
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
      // Playhead: posisi yang sedang berbunyi ditandai penuh, dan fret yang
      // dipakai ikut diberi label serta garis tebal. Tanpa ini neck terlihat
      // diam dan tidak ada yang menghubungkan posisi gitar dengan transport.
      const playingNoteId = state.playback.currentNoteId ?? null;
      const isPlaying = state.playback.status === "playing" || state.playback.status === "paused";
      const sounding = isPlaying && playingNoteId === note?.id;
      const hitFrets = new Set(positions.map((position) => position.fret));
      const currentFrets = sounding ? hitFrets : new Set();

      svg.setAttribute("viewBox", `0 0 ${width()} ${height()}`);
      svg.setAttribute("width", width());
      svg.setAttribute("height", height());
      svg.setAttribute("aria-label", note
        ? `Guitar neck, ${midiToPitch(note.pitch)}, ${positions.length} playable position(s)`
        : "Guitar neck, no note selected");
      svg.replaceChildren();

      drawNeck(hitFrets, currentFrets);
      if (positions.length > 0) drawPositions(positions, note.id, sounding);
      lastSoundingKey = `${note?.id ?? ""}:${sounding}`;
      return { note, positions, sounding, playheadTick: state.playback.currentTick };
    },

    /**
     * Dipanggil tiap tick playback. Build ulang hanya kalau nada yang berbunyi
     * benar-benar berubah, supaya transport yang berjalan 25 ms sekali tidak
     * membuat ulang seluruh neck.
     */
    updatePlayback(state) {
      const focusedId = state.selectedNoteIds[0] ?? state.playback.currentNoteId ?? null;
      const note = state.song.notes.find((item) => item.id === focusedId) ?? state.song.notes[0] ?? null;
      const isPlaying = state.playback.status === "playing" || state.playback.status === "paused";
      const sounding = isPlaying && (state.playback.currentNoteId ?? null) === note?.id;
      const key = `${note?.id ?? ""}:${sounding}`;
      if (key === lastSoundingKey) return false;
      this.render(state);
      return true;
    }
  };
}
