import { MelodiError, PPQ } from "../core/model.js";

/**
 * I3: papan ide. Berbeda dari take dan variasi yang hidup di memori tab Ide,
 * papan ide bertahan di localStorage sehingga ide tidak hilang saat tab ditutup
 * atau browser ditutup. Papan ini bukan bagian dari Song: tidak ada anchor,
 * tidak ada lyric, tidak ada chord, dan tidak masuk undo.
 */
const STORAGE_KEY = "melodi.idea-board";
const BOARD_VERSION = 1;
export const IDEA_BOARD_LIMIT = 24;
const TITLE_LIMIT = 120;
const GRID = 120;
const MIN_PITCH = 0;
const MAX_PITCH = 127;
const MAX_NOTES = 64;
const MAX_DURATION_TICKS = PPQ * 64;
const SOURCES = new Set(["take", "variation", "continue"]);

/** Nama otomatis "Ide 3 - 14:05" supaya entri papan ide tidak pernah kosong. */
export function autoIdeaTitle(ordinal, timestamp) {
  const date = new Date(Number.isFinite(timestamp) ? timestamp : 0);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `Ide ${ordinal} - ${hours}:${minutes}`;
}

export function fail(code) {
  throw new MelodiError(code);
}

function normalizeNotes(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_NOTES) fail("idea-board-invalid-notes");
  const notes = value.map((note) => {
    if (note === null || typeof note !== "object" || Array.isArray(note)) fail("idea-board-invalid-notes");
    const { pitch, startTick, durationTicks } = note;
    if (!Number.isSafeInteger(pitch) || pitch < MIN_PITCH || pitch > MAX_PITCH) fail("idea-board-invalid-notes");
    if (!Number.isSafeInteger(startTick) || startTick < 0) fail("idea-board-invalid-notes");
    if (!Number.isSafeInteger(durationTicks) || durationTicks < 1 || durationTicks > MAX_DURATION_TICKS) fail("idea-board-invalid-notes");
    return { pitch, startTick, durationTicks };
  });
  for (let index = 1; index < notes.length; index += 1) {
    const previous = notes[index - 1];
    if (notes[index].startTick < previous.startTick + previous.durationTicks) fail("idea-board-overlap");
  }
  return notes;
}

function normalizeIdea(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("idea-board-invalid-entry");
  const notes = normalizeNotes(value.notes);
  const title = typeof value.title === "string" && value.title.trim().length > 0
    ? value.title.trim().slice(0, TITLE_LIMIT) : null;
  return {
    id: typeof value.id === "string" && value.id.length > 0 ? value.id : fail("idea-board-invalid-entry"),
    title,
    notes,
    key: typeof value.key === "string" ? value.key : null,
    tempo: Number.isSafeInteger(value.tempo) && value.tempo > 0 ? value.tempo : null,
    source: SOURCES.has(value.source) ? value.source : "take",
    createdAt: Number.isSafeInteger(value.createdAt) ? value.createdAt : 0,
    spanTicks: notes.reduce((max, note) => Math.max(max, note.startTick + note.durationTicks), 0)
  };
}

export function normalizeIdeaBoard(value) {
  const entries = Array.isArray(value?.ideas) ? value.ideas : [];
  const ideas = [];
  for (const entry of entries.slice(0, IDEA_BOARD_LIMIT)) {
    try {
      ideas.push(normalizeIdea(entry));
    } catch {
      // Satu entitas rusak tidak boleh membuang papan ide yang sudah tersimpan.
    }
  }
  return { version: BOARD_VERSION, ideas };
}

export function readIdeaBoard(storage) {
  try {
    const serialized = storage?.getItem(STORAGE_KEY);
    return serialized ? normalizeIdeaBoard(JSON.parse(serialized)) : normalizeIdeaBoard();
  } catch {
    return normalizeIdeaBoard();
  }
}

export function writeIdeaBoard(storage, board) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeIdeaBoard(board)));
    return Boolean(storage);
  } catch {
    return false;
  }
}

/** Grid pembulatan untuk daftar ide, dipakai saat menyimpan dari take. */
export function ideaSpanTicks(notes) {
  const end = normalizeNotes(notes).reduce((max, note) => Math.max(max, note.startTick + note.durationTicks), 0);
  return Math.max(GRID, Math.ceil(end / GRID) * GRID);
}

/**
 * Store papan ide yang dipakai commands: daftar ide hidup di memori, ditulis ke
 * storage setiap kali berubah, dan dibaca ulang sekali saat dibuat.
 */
export function createIdeaBoard({ storage, idFactory, now = () => Date.now(), limit = IDEA_BOARD_LIMIT } = {}) {
  let board = readIdeaBoard(storage);
  function flush() {
    return writeIdeaBoard(storage, board);
  }
  return {
    available() {
      return Boolean(storage);
    },
    list() {
      return board;
    },
    save({ notes, title = null, source = "take" } = {}) {
      const normalized = normalizeNotes(notes);
      const createdAt = now();
      const ordinal = Math.max(1, IDEA_BOARD_LIMIT - board.ideas.length);
      const entry = normalizeIdea({
        id: idFactory?.() ?? `idea-${createdAt}`,
        title: title ?? autoIdeaTitle(ordinal, createdAt),
        notes: normalized,
        key: null,
        tempo: null,
        source,
        createdAt
      });
      const ideas = [entry, ...board.ideas].slice(0, limit);
      board = { version: BOARD_VERSION, ideas };
      flush();
      return entry;
    },
    rename(ideaId, title) {
      if (typeof ideaId !== "string" || ideaId.length === 0) fail("idea-board-invalid-entry");
      if (typeof title !== "string") fail("idea-board-invalid-entry");
      const trimmed = title.trim().slice(0, TITLE_LIMIT);
      const existing = board.ideas.find(idea => idea.id === ideaId) ?? null;
      if (!existing) fail("idea-board-invalid-entry");
      const next = { ...existing, title: trimmed.length > 0 ? trimmed : autoIdeaTitle(1, existing.createdAt) };
      board = { version: BOARD_VERSION, ideas: board.ideas.map(idea => (idea.id === ideaId ? next : idea)) };
      flush();
      return next;
    },
    remove(ideaId) {
      const existing = board.ideas.find(idea => idea.id === ideaId) ?? null;
      if (!existing) return null;
      board = { version: BOARD_VERSION, ideas: board.ideas.filter(idea => idea.id !== ideaId) };
      flush();
      return existing;
    }
  };
}