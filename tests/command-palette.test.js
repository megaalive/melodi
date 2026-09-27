import test from "node:test";
import assert from "node:assert/strict";
import { createPaletteCatalog, filterPaletteEntries, isEntryAvailable, PALETTE_GROUPS } from "../src/ui/command-palette.js";

const catalog = createPaletteCatalog();

// Label yang benar-benar tampil di UI, dipakai untuk membuktikan filter
// mencocokkan teks yang dibaca user dan bukan kunci internalnya.
const LABELS = {
  paletteZoomIn: "Perbesar zoom piano roll",
  paletteZoomOut: "Perkecil zoom piano roll",
  paletteZoomReset: "Reset zoom piano roll",
  paletteViewGuitar: "Tampilkan Gitar",
  paletteUndo: "Undo perubahan terakhir"
};
const translate = (key) => LABELS[key] ?? key;

test("palette catalog has unique ids and unique label keys", () => {
  const ids = catalog.map((item) => item.id);
  const labels = catalog.map((item) => item.labelKey);
  assert.equal(new Set(ids).size, ids.length, "palette ids must be unique");
  assert.equal(new Set(labels).size, labels.length, "palette label keys must be unique");
});

test("every palette entry is usable: known group, perform callable, keywords in both languages", () => {
  for (const item of catalog) {
    assert.ok(PALETTE_GROUPS.includes(item.group), `${item.id} has unknown group ${item.group}`);
    assert.equal(typeof item.perform, "function", `${item.id} has no perform`);
    assert.ok(Array.isArray(item.keywords.id) && item.keywords.id.length > 0, `${item.id} missing Indonesian keywords`);
    assert.ok(Array.isArray(item.keywords.en) && item.keywords.en.length > 0, `${item.id} missing English keywords`);
  }
});

test("every palette perform runs against a stub context without throwing", () => {
  const clicked = [];
  const announced = [];
  const calls = [];
  const ctx = {
    commands: new Proxy({}, {
      get: (_target, prop) => (...args) => {
        calls.push([String(prop), ...args]);
        if (prop === "getState") {
          return { playback: { loop: { enabled: false }, status: "stopped", currentTick: 0 }, view: { follow: true }, editor: { zoom: 1 }, selectedNoteIds: [], song: { notes: [] } };
        }
        if (prop === "getSong") return { notes: [] };
        if (prop === "getSelectedNoteIds") return [];
        return true;
      }
    }),
    byId: (id) => ({ id, click: () => clicked.push(id) }),
    run: (operation) => operation(),
    runAsync: (operation) => operation(),
    announce: (key) => announced.push(key),
    translate: (key) => key,
    setTheme: (value) => calls.push(["setTheme", value]),
    setLanguage: (value) => calls.push(["setLanguage", value])
  };
  for (const item of catalog) {
    assert.doesNotThrow(() => item.perform(ctx), `${item.id} threw`);
  }
  assert.ok(clicked.includes("new-idea"), "new idea should go through the existing button");
  assert.ok(calls.some(([name]) => name === "setTheme"), "theme entries should reach setTheme");
  assert.ok(calls.some(([name]) => name === "setLanguage"), "language entries should reach setLanguage");
});

test("empty query returns everything in catalog order", () => {
  assert.deepEqual(filterPaletteEntries(catalog, "", "id", translate), catalog);
  assert.deepEqual(filterPaletteEntries(catalog, "   ", "id", translate), catalog);
  assert.deepEqual(filterPaletteEntries(catalog, null, "id", translate), catalog);
});

test("filter matches the visible language, and both languages as a fallback", () => {
  const byIndonesian = filterPaletteEntries(catalog, "gitar", "id", translate);
  assert.ok(byIndonesian.length > 0, "Indonesian keyword should match");
  assert.ok(byIndonesian.some((item) => item.id === "view.guitar"));

  // Kata kunci bahasa Inggris tetap bisa dipakai walau UI sedang Bahasa Indonesia.
  const byEnglishFallback = filterPaletteEntries(catalog, "fret", "id", translate);
  assert.ok(byEnglishFallback.some((item) => item.id === "view.guitar"));
});

test("filter is case, accent, and whitespace tolerant", () => {
  const a = filterPaletteEntries(catalog, "GITAR", "id", translate).map((item) => item.id);
  const b = filterPaletteEntries(catalog, "  gitar  ", "id", translate).map((item) => item.id);
  assert.deepEqual(a, b);
  assert.ok(a.includes("view.guitar"));
});

test("a word that only appears in the visible label still finds the entry", () => {
  // "piano" tidak ada di kunci internal paletteZoomIn, hanya di label yang dibaca
  // user. View Piano Roll ikut cocok karena kata kuncinya memang "piano roll".
  const hits = filterPaletteEntries(catalog, "piano", "en", translate).map((item) => item.id);
  assert.ok(hits.includes("editor.zoomIn"), "zoom entry must be found through its visible label");
  assert.ok(hits.includes("editor.zoomOut"));
  assert.ok(hits.includes("editor.zoomReset"));
  assert.ok(hits.includes("view.pianoRoll"));
});

test("every term must match, so extra words narrow the result", () => {
  const single = filterPaletteEntries(catalog, "zoom", "en", translate);
  const both = filterPaletteEntries(catalog, "zoom perkecil", "id", translate);
  assert.ok(single.length > both.length, "adding a term must narrow the result");
  assert.deepEqual(both.map((item) => item.id), ["editor.zoomOut"]);
});

test("a query that matches nothing returns an empty list", () => {
  assert.deepEqual(filterPaletteEntries(catalog, "zzzqqqxxx", "id", translate), []);
});

test("availability follows state instead of being hardcoded", () => {
  const item = (id) => catalog.find((entry) => entry.id === id);
  const base = {
    history: { canUndo: false, canRedo: false },
    playback: { status: "stopped" },
    selectedNoteIds: [],
    selection: null,
    editor: { canPaste: false },
    song: { notes: [] }
  };
  assert.equal(isEntryAvailable(item("song.undo"), base), false);
  assert.equal(isEntryAvailable(item("song.undo"), { ...base, history: { canUndo: true, canRedo: false } }), true);
  assert.equal(isEntryAvailable(item("song.redo"), { ...base, history: { canUndo: false, canRedo: true } }), true);
  assert.equal(isEntryAvailable(item("editor.paste"), base), false);
  assert.equal(isEntryAvailable(item("editor.paste"), { ...base, editor: { canPaste: true } }), true);
  assert.equal(isEntryAvailable(item("editor.selectAll"), base), false);
  assert.equal(isEntryAvailable(item("editor.selectAll"), { ...base, song: { notes: [{}] } }), true);
  assert.equal(isEntryAvailable(item("view.score"), base), true, "view entries are always available");
});
