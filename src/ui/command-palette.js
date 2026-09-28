/*
 * Command palette.
 *
 * Tiga aturan yang dipegang supaya tidak jadi aksesori:
 *
 * 1. Native <dialog> dipakai, jadi Escape, focus trap, dan top layer datang
 *    gratis dari browser, bukan hasil tiruan.
 * 2. Setiap entri memanggil command layer yang sama dengan tombol biasa, lewat
 *    ctx.run / ctx.commands. Tidak ada aksi yang hanya hidup di palette.
 * 3. Katalog dan filter adalah fungsi murni tanpa DOM, jadi bisa diuji di Node.
 */

export const PALETTE_GROUPS = Object.freeze([
  "song", "transport", "view", "editor", "generation", "appearance"
]);

function entry(id, group, labelKey, keywords, perform) {
  return Object.freeze({ id, group, labelKey, keywords: Object.freeze(keywords), perform });
}

/**
 * Katalog aksi. `keywords` ditulis dalam dua bahasa supaya pencarian tetap
 * bekerja saat user mengetik istilah yang tidak sedang ditampilkan.
 * `perform` menerima ctx = { commands, byId, run, translate }.
 */
export function createPaletteCatalog() {
  return [
    entry("song.new", "song", "paletteNewIdea", { id: ["baru", "new", "ide", "idea"], en: ["new", "idea", "blank"] }, (ctx) => {
      ctx.byId("new-idea").click();
    }),
    entry("song.undo", "song", "paletteUndo", { id: ["batal", "undo", "kembali"], en: ["undo", "revert", "back"] }, (ctx) => {
      ctx.run(() => ctx.commands.undo(), "editUndone");
    }),
    entry("song.redo", "song", "paletteRedo", { id: ["ulang", "redo"], en: ["redo", "repeat"] }, (ctx) => {
      ctx.run(() => ctx.commands.redo(), "editRedone");
    }),

    entry("transport.play", "transport", "palettePlay", { id: ["main", "play", "putar"], en: ["play", "start"] }, (ctx) => {
      ctx.runAsync(() => ctx.commands.play(), "playbackStarted", (playback) => playback.status === "playing");
    }),
    entry("transport.pause", "transport", "palettePause", { id: ["jeda", "pause"], en: ["pause", "hold"] }, (ctx) => {
      ctx.run(() => ctx.commands.pause(), "playbackPaused");
    }),
    entry("transport.stop", "transport", "paletteStop", { id: ["stop", "berhenti", "akhir"], en: ["stop", "end", "reset"] }, (ctx) => {
      ctx.run(() => ctx.commands.stop(), "playbackStoppedMessage");
    }),
    entry("transport.toggleLoop", "transport", "paletteToggleLoop", { id: ["loop", "ulang", "putaran"], en: ["loop", "repeat", "cycle"] }, (ctx) => {
      const next = !ctx.commands.getState().playback.loop.enabled;
      ctx.run(() => ctx.commands.setLoopEnabled(next));
    }),

    entry("view.score", "view", "paletteViewScore", { id: ["score", "not", "balok"], en: ["score", "notation", "stave"] }, (ctx) => {
      ctx.run(() => ctx.commands.setViewMode("score"));
    }),
    entry("view.pianoRoll", "view", "paletteViewPianoRoll", { id: ["piano roll", "kanvas", "grid"], en: ["piano roll", "canvas", "grid"] }, (ctx) => {
      ctx.run(() => ctx.commands.setViewMode("piano-roll"));
    }),
    entry("view.combined", "view", "paletteViewCombined", { id: ["gabung", "split", "dua"], en: ["split", "combined", "both"] }, (ctx) => {
      ctx.run(() => ctx.commands.setViewMode("combined"));
    }),
    entry("view.lyrics", "view", "paletteViewLyrics", { id: ["lirik", "teks", "kata"], en: ["lyrics", "words", "text"] }, (ctx) => {
      ctx.run(() => ctx.commands.setViewMode("lyrics"));
    }),
    entry("view.guitar", "view", "paletteViewGuitar", { id: ["gitar", "senar", "fret"], en: ["guitar", "string", "fret", "neck"] }, (ctx) => {
      ctx.run(() => ctx.commands.setViewMode("guitar"));
    }),
    entry("view.follow", "view", "paletteToggleFollow", { id: ["ikuti", "follow", "gulir"], en: ["follow", "auto scroll"] }, (ctx) => {
      const next = !ctx.commands.getState().view.follow;
      ctx.run(() => ctx.commands.setFollowMode(next));
    }),

    entry("editor.selectAll", "editor", "paletteSelectAll", { id: ["pilih semua", "select all"], en: ["select all", "everything"] }, (ctx) => {
      ctx.run(() => ctx.commands.selectNotes(ctx.commands.getSong().notes.map((note) => note.id)));
    }),
    entry("editor.clearSelection", "editor", "paletteClearSelection", { id: ["hapus pilihan", "clear", "batal pilih"], en: ["clear selection", "deselect"] }, (ctx) => {
      ctx.run(() => ctx.commands.clearSelection(), "selectionCleared");
    }),
    entry("editor.copy", "editor", "paletteCopy", { id: ["salin", "copy", "clipboard"], en: ["copy", "clipboard"] }, (ctx) => {
      const count = ctx.run(() => ctx.commands.copySelection());
      if (count) ctx.announce("noteCopied", "success", { count });
    }),
    entry("editor.paste", "editor", "palettePaste", { id: ["tempel", "paste", "clipboard"], en: ["paste", "clipboard"] }, (ctx) => {
      const notes = ctx.run(() => ctx.commands.pasteNotes(ctx.commands.getState().playback.currentTick));
      if (notes?.length) ctx.announce("notePasted", "success", { count: notes.length });
    }),
    entry("editor.toolSelect", "editor", "paletteToolSelect", { id: ["tool pilih", "cursor", "select"], en: ["select tool", "cursor", "pointer"] }, (ctx) => {
      ctx.run(() => ctx.commands.setTool("select"));
    }),
    entry("editor.toolDraw", "editor", "paletteToolDraw", { id: ["tool gambar", "draw", "pensil"], en: ["draw tool", "pencil", "draw"] }, (ctx) => {
      ctx.run(() => ctx.commands.setTool("draw"));
    }),
    entry("editor.snapQuarter", "editor", "paletteSnapQuarter", { id: ["snap 1/4", "kasar"], en: ["snap 1/4", "coarse"] }, (ctx) => {
      ctx.run(() => ctx.commands.setSnap("1/4"));
    }),
    entry("editor.snapEighth", "editor", "paletteSnapEighth", { id: ["snap 1/8", "sedang"], en: ["snap 1/8", "medium"] }, (ctx) => {
      ctx.run(() => ctx.commands.setSnap("1/8"));
    }),
    entry("editor.snapSixteenth", "editor", "paletteSnapSixteenth", { id: ["snap 1/16", "halus", "rapat"], en: ["snap 1/16", "fine", "tight"] }, (ctx) => {
      ctx.run(() => ctx.commands.setSnap("1/16"));
    }),
    entry("editor.zoomIn", "editor", "paletteZoomIn", { id: ["zoom", "besar", "perbesar", "membesar"], en: ["zoom in", "bigger", "larger"] }, (ctx) => {
      ctx.run(() => ctx.commands.setZoom(Number((ctx.commands.getState().editor.zoom + 0.25).toFixed(2))));
    }),
    entry("editor.zoomOut", "editor", "paletteZoomOut", { id: ["zoom", "kecil", "perkecil", "mengecil"], en: ["zoom out", "smaller"] }, (ctx) => {
      ctx.run(() => ctx.commands.setZoom(Number((ctx.commands.getState().editor.zoom - 0.25).toFixed(2))));
    }),
    entry("editor.zoomReset", "editor", "paletteZoomReset", { id: ["zoom", "reset", "normal", "kembalikan"], en: ["zoom", "reset", "normal", "default"] }, (ctx) => {
      ctx.run(() => ctx.commands.setZoom(1));
    }),

    entry("generation.markAnchors", "generation", "paletteMarkAnchors", { id: ["anchor", "jangkar", "tandai"], en: ["anchor", "mark", "pin"] }, (ctx) => {
      for (const noteId of ctx.commands.getSelectedNoteIds()) {
        ctx.run(() => ctx.commands.setAnchor(noteId, true));
      }
    }),

    entry("appearance.themeSystem", "appearance", "paletteThemeSystem", { id: ["tema", "sistem", "otomatis"], en: ["theme", "system", "auto"] }, (ctx) => {
      ctx.setTheme("system");
    }),
    entry("appearance.themeLight", "appearance", "paletteThemeLight", { id: ["tema", "terang", "light"], en: ["theme", "light", "bright"] }, (ctx) => {
      ctx.setTheme("light");
    }),
    entry("appearance.themeDark", "appearance", "paletteThemeDark", { id: ["tema", "gelap", "dark", "malam"], en: ["theme", "dark", "night"] }, (ctx) => {
      ctx.setTheme("dark");
    }),
    entry("appearance.languageId", "appearance", "paletteLanguageId", { id: ["bahasa", "indonesia"], en: ["language", "indonesian"] }, (ctx) => {
      ctx.setLanguage("id");
    }),
    entry("appearance.languageEn", "appearance", "paletteLanguageEn", { id: ["bahasa", "inggris", "english"], en: ["language", "english"] }, (ctx) => {
      ctx.setLanguage("en");
    })
  ];
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Filter katalog. Yang dicocokkan adalah label yang benar-benar TERLIHAT, bukan
 * kunci internalnya: user mengetik kata yang dia baca di layar, jadi memakai
 * labelKey akan gagal untuk setiap frasa yang tidak ikut jadi nama key.
 * Kata kunci dari kedua bahasa selalu digabung supaya pencarian tetap jalan
 * walau user memakai istilah dari bahasa lain.
 */
export function filterPaletteEntries(entries, query, language, translate = (key) => key) {
  const needle = normalize(query ?? "");
  if (needle === "") return entries;
  const terms = needle.split(/\s+/);
  return entries.filter((item) => {
    const haystack = normalize([
      translate(item.labelKey),
      ...(item.keywords[language] ?? []),
      ...(item.keywords.id ?? []),
      ...(item.keywords.en ?? [])
    ].join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}

/** Ketersediaan entri, dibaca dari state supaya tidak pernah berbohong. */
export function isEntryAvailable(item, state) {
  switch (item.id) {
    case "song.undo": return state.history.canUndo;
    case "song.redo": return state.history.canRedo;
    case "transport.pause": return state.playback.status === "playing";
    case "editor.clearSelection": return state.selectedNoteIds.length > 0 || Boolean(state.selection);
    case "editor.copy": return state.selectedNoteIds.length > 0;
    case "editor.paste": return state.editor.canPaste;
    case "editor.selectAll": return state.song.notes.length > 0;
    case "generation.markAnchors": return state.selectedNoteIds.length > 0;
    default: return true;
  }
}
