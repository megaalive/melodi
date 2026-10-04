import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startAuditServer } from "../tools/ui-audit.mjs";

// I1 diuji seperti pengguna nyata: lagu kosong harus membuka tab Ide, keyboard
// harus utuh di viewport HP dan desktop, dan satu rekam -> Pakai harus menambah
// nada yang bisa di-undo dalam satu langkah.
const VIEWPORTS = [
  { width: 390, height: 844, label: "hp" },
  { width: 1440, height: 900, label: "desktop" }
];

function assertUsableTapTarget(items, label) {
  if (label === "hp") {
    assert.deepEqual(items, [], "hp: target sentuh di bawah minimumnya");
    return;
  }
  // Desktop memakai --control-h 32px, jadi hanya tinggi minimum control yang dicek.
  const tooSmall = items.filter(item => item.height < 28);
  assert.deepEqual(tooSmall, [], `${label}: control di bawah --control-h`);
}

async function pressKey(page, selector, holdMs) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `tombol ${selector} harus punya kotak`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
  await page.waitForTimeout(60);
}

const FOUR_NOTES = ["60", "62", "64", "67"];

async function recordFourNotes(page, pitches = FOUR_NOTES) {
  await page.locator("[data-action='ideas-count-in']").uncheck();
  await page.locator("#ideas-record").click();
  await page.waitForTimeout(120);
  for (const pitch of pitches) await pressKey(page, `[data-pitch='${pitch}']`, 240);
  await page.locator("#ideas-record").click();
  await page.waitForTimeout(200);
}

async function readIdeas(page) {
  return page.evaluate(() => {
    const section = document.querySelector("#ideas-section");
    const keys = [...document.querySelectorAll("[data-entity^='ideas-key-']")];
    const box = element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const rects = keys.map(box);
    const board = document.querySelector("[data-entity='ideas-keyboard']");
    const boardBox = board.getBoundingClientRect();
    const scroller = board.scrollWidth > board.clientWidth + 1;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const controls = [...document.querySelectorAll("#ideas-section button, #ideas-section select, #ideas-section input")]
      // Checkbox diukur lewat labelnya, bukan kotak aslinya yang kecil.
      .filter(element => element.type !== "checkbox");
    const smallTargets = controls
      .map(element => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        // Tombol hitam piano boleh lebih pendek dari 44px; tombol putih,
        // select, dan kontrol strip tetap harus 44px.
        const minimum = element.classList.contains("ideas-key-black") ? 28 : 44;
        return { id: element.id || element.dataset.action || element.dataset.pitch, black: element.classList.contains("ideas-key-black"), width: rect.width, height: rect.height, minimum };
      })
      .filter(Boolean)
      .filter(item => item.height < item.minimum);
    // Label tuts yang terlihat: dua label yang saling menindih berarti keyboard
    // tidak terbaca di layar kecil.
    const labels = [...document.querySelectorAll(".ideas-keyboard .ideas-key-label, .ideas-keyboard .ideas-key-note")]
      .filter(label => getComputedStyle(label).display !== "none" && label.getBoundingClientRect().width > 0)
      .map(label => ({ pitch: label.closest("[data-pitch]")?.dataset.pitch, ...box(label) }));
    const labelOverlaps = [];
    for (let left = 0; left < labels.length; left += 1) {
      for (let right = left + 1; right < labels.length; right += 1) {
        const a = labels[left];
        const b = labels[right];
        const overlap = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (overlap) labelOverlaps.push([a.pitch, b.pitch]);
      }
    }
    const strip = document.querySelector(".ideas-variations-strip");
    const stripColumns = strip
      ? getComputedStyle(strip).gridTemplateColumns.split(" ").filter(Boolean).length
      : 0;
    return {
      visible: section ? !section.hidden : false,
      mode: document.body.dataset.viewMode ?? null,
      navIdeas: document.querySelector('#studio-views [data-studio-workspace="ideas"]')?.getAttribute("aria-pressed") ?? null,
      navCount: document.querySelectorAll("#studio-views [data-studio-workspace]").length,
      navOrder: [...document.querySelectorAll("#studio-views [data-studio-workspace]")].map(button => button.dataset.studioWorkspace),
      keyCount: keys.length,
      whiteCount: document.querySelectorAll(".ideas-key-white").length,
      blackCount: document.querySelectorAll(".ideas-key-black").length,
      keyboardBase: board.dataset.base,
      keyboardLabels: board.dataset.labels,
      keyboardScrolls: scroller,
      keyboardWidthRatio: boardBox.width > 0 ? boardBox.width / section.getBoundingClientRect().width : 0,
      labelCount: labels.length,
      noteLabelCount: document.querySelectorAll(".ideas-keyboard .ideas-key-note").length,
      labelOverlaps,
      outsideViewport: rects.filter(rect => rect.left < boardBox.left - 1 || rect.top < -1 || rect.bottom > viewport.height + 1).length,
      clipped: rects.some(rect => rect.width < 8 || rect.height < 8),
      smallTargets,
      takeCount: document.querySelectorAll("[data-entity='ideas-take']").length,
      candidateCount: document.querySelectorAll("[data-entity='ideas-variation']").length,
      referenceCount: document.querySelectorAll("[data-entity='ideas-variation-reference']").length,
      contours: document.querySelectorAll(".ideas-contour polyline").length,
      status: document.querySelector("[data-entity='ideas-status']")?.textContent ?? "",
      keyboardHeight: rects[0]?.height ?? 0,
      stripColumns
    };
  });
}

test("tab Ide berada di depan Edit dan terbuka untuk lagu kosong", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    const state = await readIdeas(page);
    assert.equal(state.navOrder[0], "ideas", "Ide harus tab pertama");
    assert.deepEqual(state.navOrder.slice(1), ["edit", "notation", "rhythm"]);
    assert.equal(state.navIdeas, "true");
    assert.equal(state.mode, "ideas", "lagu kosong harus membuka Ide");
    assert.equal(state.visible, true);
    assert.equal(state.keyCount, 24, "dua oktaf penuh: empat belas putih dan sepuluh hitam");
    assert.equal(state.whiteCount, 14);
    assert.equal(state.blackCount, 10);
    assert.equal(state.keyboardBase, "60", "keyboard dibuka di C4");
    assert.equal(state.keyboardLabels, "qwerty", "desktop punya label QWERTY");
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("keyboard Ide muat utuh dan target sentuh minimal di HP dan desktop", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.label === "hp", isMobile: viewport.label === "hp" });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
      await page.waitForTimeout(200);
      const state = await readIdeas(page);
      assert.equal(state.visible, true, `${viewport.label}: Ide harus terlihat`);
      assert.equal(state.clipped, false, `${viewport.label}: tombol keyboard tidak boleh terpotong`);
      assert.ok(state.keyboardHeight >= 44, `${viewport.label}: tinggi tombol keyboard minimal 44px, dapat ${state.keyboardHeight}`);
      assertUsableTapTarget(state.smallTargets, viewport.label);
      assert.equal(state.keyCount, 24, `${viewport.label}: dua oktaf penuh`);
      assert.deepEqual(state.labelOverlaps, [], `${viewport.label}: label tuts tidak boleh menimpa label lain`);
      assert.equal(state.noteLabelCount, 24, `${viewport.label}: tiap tuts punya nama nada`);
      assert.ok(state.keyboardWidthRatio >= 0.9, `${viewport.label}: keyboard harus selebar kontainer`);
      if (viewport.label === "hp") {
        assert.equal(state.keyboardScrolls, true, "hp: dua oktaf digeser horizontal");
        assert.equal(state.keyboardLabels, "none", "hp: label QWERTY tidak tampil");
      } else {
        assert.equal(state.keyboardScrolls, false, "desktop: dua oktaf muat tanpa geser");
        assert.ok(state.labelCount > 24, "desktop: label QWERTY tetap tampil");
      }
      report.push({ ...viewport, ...state });
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  assert.equal(report.length, VIEWPORTS.length);
});

test("grid kandidat punya minimal tiga kolom di desktop dan satu di HP", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.label === "hp", isMobile: viewport.label === "hp" });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
      await recordFourNotes(page);
      await page.locator("[data-action='ideas-develop']").first().click();
      await page.waitForTimeout(200);
      const columns = await page.evaluate(() => getComputedStyle(document.querySelector(".ideas-variations-strip")).gridTemplateColumns.split(" ").filter(Boolean).length);
      if (viewport.label === "hp") assert.equal(columns, 1, "hp: satu kolom");
      else assert.ok(columns >= 3, `desktop: ${columns} kolom kandidat, minimal tiga`);
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("rekam satu take, pakai, dan undo dalam satu langkah", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });

    // Hitung masuk satu birama harus terlihat sebelum rekaman benar-benar mulai.
    await page.locator("#ideas-record").click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#ideas-section").getAttribute("data-count-in"), "true", "harus masuk hitung masuk");
    assert.match(await page.locator("[data-entity='ideas-status']").textContent(), /Hitung masuk/);
    await page.locator("#ideas-record").click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("[data-entity='ideas-take']").count(), 0, "batal di hitung masuk tidak membuat take");

    // Count-in dimatikan supaya pencatatan mudah diperiksa.
    await recordFourNotes(page, ["60", "64"]);

    const takeCount = await page.locator("[data-entity='ideas-take']").count();
    assert.equal(takeCount, 1, "harus ada satu take di daftar");
    const noteCount = Number(await page.locator("[data-entity='ideas-take']").first().getAttribute("data-note-count"));
    assert.equal(noteCount, 2, "take harus berisi dua nada");

    await page.locator("[data-action='ideas-use']").first().click();
    await page.waitForTimeout(200);
    const afterUse = await page.evaluate(() => {
      const song = window.melodi.commands.getSong();
      const state = window.melodi.getState();
      return { notes: song.notes.length, undoDepth: state.history.undoDepth, mode: state.view.mode };
    });
    assert.equal(afterUse.notes, 2, "Pakai harus menambah dua nada ke lagu");
    assert.equal(afterUse.undoDepth, 1, "satu take harus satu langkah undo");
    assert.equal(afterUse.mode, "ideas", "Pakai tidak boleh memaksa pindah tab");

    await page.locator("#ideas-section [data-action='undo']").click();
    await page.waitForTimeout(200);
    const afterUndo = await page.evaluate(() => window.melodi.commands.getSong().notes.length);
    assert.equal(afterUndo, 0, "satu Undo harus mengembalikan take utuh");
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("kembangkan satu take jadi empat variasi dengan mini-kontur dan kartu referensi", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    await recordFourNotes(page);

    await page.locator("[data-action='ideas-develop']").first().click();
    await page.waitForTimeout(250);
    assert.equal(await page.locator("[data-entity='ideas-variations']").getAttribute("data-open"), "true");
    const seed = await page.locator("[data-entity='ideas-variations']").getAttribute("data-seed");
    assert.ok(Number(seed) >= 0, "seed harus terlihat");
    const variations = page.locator("[data-entity='ideas-variation']");
    assert.ok(await variations.count() >= 3, "take minimal tiga variasi");
    assert.equal(await variations.first().getAttribute("data-slot"), "1", "kartu pertama punya tombol angka 1");
    assert.equal(await page.locator("[data-entity='ideas-variation-reference']").count(), 1, "kartu Asli tetap ada sebagai referensi");
    assert.equal(await page.locator("[data-entity='ideas-variation'] [data-action='ideas-compare-pick']").count() >= 3, true);
    const contours = await page.locator("[data-entity='ideas-variation'] .ideas-contour polyline").count();
    assert.equal(contours, await variations.count(), "tiap kandidat punya mini-kontur");
    assert.equal(await page.locator("[data-entity='ideas-variation'][data-kind='as-recorded']").count(), 0,
      "as-recorded bukan lagi kandidat");

    // Seed lain mengubah seluruh jenis kandidat berbasis seed.
    const before = await page.evaluate(() => [...document.querySelectorAll("[data-entity='ideas-variation']")]
      .map(card => card.dataset.kind).join("|"));
    const notesBefore = await page.locator("[data-entity='ideas-variation']").first().getAttribute("data-note-count");
    await page.locator("[data-action='ideas-variation-reseed']").click();
    await page.waitForTimeout(250);
    const reseed = await page.locator("[data-entity='ideas-variations']").getAttribute("data-seed");
    assert.notEqual(reseed, seed, "Seed lain mengubah seed");
    assert.equal(await page.locator("[data-entity='ideas-variation']").first().getAttribute("data-note-count"), notesBefore,
      "setelah Seed lain, kartu di layar tidak boleh berubah diam-diam");
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("[data-entity='ideas-variation']")]
      .map(card => card.dataset.kind).join("|")), before, "jenis kandidat tetap empat");

    // Tombol angka 1 meng-audisi kartu pertama, Enter menerimanya.
    await page.locator("[data-entity='ideas-keyboard']").focus();
    await page.keyboard.press("1");
    await page.waitForTimeout(150);
    assert.equal(await page.locator("[data-entity='ideas-variation']").first().getAttribute("data-active"), "true");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    const afterAccept = await page.evaluate(() => ({
      notes: window.melodi.commands.getSong().notes.length,
      undoDepth: window.melodi.getState().history.undoDepth
    }));
    assert.ok(afterAccept.notes >= 4, "Enter menerima satu kandidat ke lagu");
    assert.equal(afterAccept.undoDepth, 1, "menerima satu kandidat adalah satu langkah undo");
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("Bandingkan A/B memutar A lalu B, berganti, dan berhenti tanpa node bocor", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    // Osilator pratinjau nada selalu triangle dengan frekuensi 440 * 2^((n-69)/12),
    // jadi rekam nada yang benar-benar terdengar tanpa menyentuh API publik.
    await page.addInitScript(() => {
      window.__played = [];
      const original = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function patched() {
        const oscillator = original.call(this);
        const start = oscillator.start.bind(oscillator);
        oscillator.start = (...args) => {
          try {
            const frequency = oscillator.frequency.value;
            if (frequency > 0) window.__played.push(Math.round(69 + 12 * Math.log2(frequency / 440)));
          } catch {}
          return start(...args);
        };
        return oscillator;
      };
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    await recordFourNotes(page);
    await page.locator("[data-action='ideas-develop']").first().click();
    await page.waitForTimeout(250);

    const nodesBefore = await page.evaluate(() => document.querySelectorAll("#ideas-section *").length);
    assert.equal(await page.locator("[data-action='ideas-compare']").isDisabled(), true, "belum ada dua kartu");
    await page.locator("[data-action='ideas-compare-pick']").nth(0).click();
    await page.waitForTimeout(120);
    await page.locator("[data-action='ideas-compare-pick']").nth(1).click();
    await page.waitForTimeout(120);
    assert.equal(await page.locator("[data-entity='ideas-variation'][data-compare='a']").count(), 1);
    assert.equal(await page.locator("[data-entity='ideas-variation'][data-compare='b']").count(), 1);
    assert.equal(await page.locator("[data-action='ideas-compare']").isDisabled(), false, "dua kartu siap dibandingkan");
    const lenA = Number(await page.locator("[data-entity='ideas-variation'][data-compare='a']").getAttribute("data-note-count"));
    const lenB = Number(await page.locator("[data-entity='ideas-variation'][data-compare='b']").getAttribute("data-note-count"));
    assert.ok(lenA > 0 && lenB > 0);

    await page.evaluate(() => { window.__played.length = 0; });
    await page.locator("[data-action='ideas-compare']").click();
    const period = lenA + lenB;
    await page.waitForFunction(limit => window.__played.length >= limit, period + 2, { timeout: 20000 });
    const running = await page.evaluate(() => ({
      compare: document.querySelector("#ideas-section").dataset.compare,
      played: [...window.__played]
    }));
    assert.equal(running.compare, "true", "perbandingan berjalan");
    assert.ok(running.played.length >= period + 2, `perbandingan harus mengulang loop, terputar ${running.played.length} nada`);
    const head = running.played.slice(0, period);
    assert.notDeepEqual(head.slice(0, lenA), head.slice(lenA), "A dan B harus dua kandidat berbeda");
    const aligned = running.played.slice(0, running.played.length - period);
    for (let index = 0; index < aligned.length; index += 1) {
      assert.equal(aligned[index], running.played[index + period],
        `nada ke-${index} harus sama pada putaran berikutnya, jadi urutannya benar-benar A lalu B`);
    }

    await page.locator("[data-action='ideas-compare-stop']").click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#ideas-section").getAttribute("data-compare"), "false", "berhenti bersih");
    const playedAtStop = await page.evaluate(() => window.__played.length);
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => window.__played.length), playedAtStop, "tidak ada preview yang lanjut setelah berhenti");

    // Terima saat perbandingan berjalan juga harus berhenti bersih.
    await page.locator("[data-action='ideas-compare']").click();
    await page.waitForTimeout(400);
    await page.locator("[data-action='ideas-variation-use']").first().click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator("#ideas-section").getAttribute("data-compare"), "false", "Terima menghentikan perbandingan");
    const afterAccept = await page.evaluate(() => ({
      notes: window.melodi.commands.getSong().notes.length,
      undoDepth: window.melodi.getState().history.undoDepth,
      nodes: document.querySelectorAll("#ideas-section *").length
    }));
    assert.equal(afterAccept.undoDepth, 1);
    assert.ok(afterAccept.nodes <= nodesBefore, "Menerima tidak boleh menambah node DOM");
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("alur akhir HP: rekam, lanjutkan, bandingkan dua hasil, terima, simpan tanpa membuka menu", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });

    const overlaysBefore = await page.evaluate(() => document.querySelectorAll("dialog[open], .app-menu-popover.open, .studio-more-popover.open").length);
    await recordFourNotes(page);
    assert.equal(await page.locator("[data-entity='ideas-take']").first().getAttribute("data-note-count"), "4");

    // Lanjutkan: kandidat lanjutan bisa diaudisi, dibandingkan, dan diterima.
    await page.locator("[data-action='ideas-continue']").first().click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#ideas-section").getAttribute("data-develop-kind"), "continue");
    const candidates = page.locator("[data-entity='ideas-variation']");
    assert.equal(await candidates.count(), 6, "enam kandidat lanjutan");
    assert.equal(await page.locator("[data-action='ideas-variation-use']").first().textContent(), "Terima");

    await page.locator("[data-action='ideas-variation-play']").first().click();
    await page.waitForTimeout(200);
    await page.locator("[data-action='ideas-compare-pick']").nth(0).click();
    await page.locator("[data-action='ideas-compare-pick']").nth(1).click();
    await page.waitForTimeout(120);
    assert.equal(await page.locator("[data-action='ideas-compare']").isDisabled(), false);
    await page.locator("[data-action='ideas-compare']").click();
    await page.waitForTimeout(500);
    await page.locator("[data-action='ideas-compare-stop']").click();
    await page.waitForTimeout(200);

    await page.locator("[data-action='ideas-variation-use']").first().click();
    await page.waitForTimeout(300);
    const accepted = await page.evaluate(() => ({
      notes: window.melodi.commands.getSong().notes.length,
      undoDepth: window.melodi.getState().history.undoDepth
    }));
    assert.ok(accepted.notes > 4, "Terima kandidat lanjutan menambah take dan lanjutan");
    assert.equal(accepted.undoDepth, 1, "take dan lanjutan satu langkah undo");
    await page.locator("#ideas-section [data-action='undo']").click();
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.melodi.commands.getSong().notes.length), 0);

    // Simpan ide tanpa membuka menu apa pun, lalu ganti namanya.
    await page.locator("[data-action='ideas-take-save']").first().click();
    await page.waitForTimeout(250);
    const board = await page.evaluate(() => window.melodi.commands.listIdeas());
    assert.equal(board.ideas.length, 1, "take harus tersimpan di papan ide");
    assert.match(board.ideas[0].title, /^Ide \d+ - \d{2}:\d{2}$/, "nama otomatis");
    assert.equal(await page.locator("[data-entity='ideas-idea']").count(), 1);
    const rename = page.locator("[data-action='ideas-idea-rename']").first();
    await rename.fill(" chorus dua ");
    await rename.press("Enter");
    await page.waitForTimeout(250);
    assert.equal((await page.evaluate(() => window.melodi.commands.listIdeas())).ideas[0].title, "chorus dua");
    const openOverlays = await page.evaluate(() => document.querySelectorAll("dialog[open], .app-menu-popover.open, .studio-more-popover.open").length);
    assert.equal(openOverlays, overlaysBefore, "alur simpan tidak boleh membuka menu atau dialog");

    // Muat ide ke lagu lagi harus menjadi satu langkah undo tambahan.
    await page.locator("[data-action='ideas-idea-load']").first().click();
    await page.waitForTimeout(250);
    const afterLoad = await page.evaluate(() => ({
      notes: window.melodi.commands.getSong().notes.length,
      undoDepth: window.melodi.getState().history.undoDepth
    }));
    assert.equal(afterLoad.notes, 4);
    assert.equal(afterLoad.undoDepth, 1);

    // Papan ide bertahan setelah reload.
    await page.reload({ waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    await page.evaluate(() => window.melodi.commands.setViewMode("ideas"));
    await page.waitForTimeout(250);
    assert.equal(await page.locator("[data-entity='ideas-idea']").count(), 1, "ide harus bertahan setelah reload");
    assert.equal(await page.locator("[data-action='ideas-idea-rename']").first().inputValue(), "chorus dua");
    await page.close();
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("keadaan kosong Ide memberi satu petunjuk dan catatan satu nada sekali tampil", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    const hint = page.locator("[data-entity='ideas-empty-hint']");
    assert.equal(await hint.isVisible(), true, "petunjuk tampil saat papan take masih kosong");
    assert.match((await hint.textContent()).trim(), /^Tekan Rekam, mainkan 4 nada, lalu Kembangkan atau Lanjutkan\.$/);
    assert.equal(await page.locator("[data-entity='ideas-mono-hint']").isVisible(), false);

    // Dua tuts ditekan bersamaan saat merekam: take tetap satu nada.
    await page.locator("[data-action='ideas-count-in']").uncheck();
    await page.locator("[data-entity='ideas-keyboard']").focus();
    await page.locator("#ideas-record").click();
    await page.waitForTimeout(120);
    await page.keyboard.down("a");
    await page.waitForTimeout(180);
    await page.keyboard.down("w");
    await page.waitForTimeout(180);
    await page.keyboard.up("w");
    await page.keyboard.up("a");
    await page.waitForTimeout(120);
    await page.locator("#ideas-record").click();
    await page.waitForTimeout(250);
    assert.equal(await page.locator("#ideas-section").getAttribute("data-multi-note"), "true",
      "dua tuts ditekan bersamaan harus tercatat");
    assert.equal(await page.locator("[data-entity='ideas-mono-hint']").isVisible(), true, "UI menjelaskan satu nada sekali");
    const takeNotes = await page.evaluate(() => window.melodi.commands.getSong().notes);
    assert.equal(await page.locator("[data-entity='ideas-take']").first().getAttribute("data-note-count"), "2",
      "take tetap monofonik: dua nada berurutan, bukan dua nada bertumpuk");
    assert.equal(takeNotes.length, 0, "belum ada nada di lagu");
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("QWERTY hanya bunyi di mode Ide dan mati saat fokus di input", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });

    await page.keyboard.press("z");
    const afterOctaveDown = await page.locator("#ideas-section").getAttribute("data-octave");
    assert.equal(afterOctaveDown, "0", "Z turun satu oktaf");
    assert.equal(await page.locator("[data-entity='ideas-keyboard']").getAttribute("data-base"), "48");

    await page.keyboard.down("a");
    await page.waitForTimeout(60);
    const readout = await page.locator("[data-entity='ideas-readout']").textContent();
    assert.equal(readout, "C3", "A harus membunyikan nada oktaf yang dipilih");
    await page.keyboard.up("a");

    // Tombol oktaf di panel mengembalikan keyboard ke C4-B5.
    await page.locator("[data-action='ideas-octave-up']").click();
    await page.waitForTimeout(120);
    assert.equal(await page.locator("[data-entity='ideas-keyboard']").getAttribute("data-base"), "60");
    assert.equal(await page.locator("[data-entity='ideas-octave']").textContent(), "C4");

    // Fokus di input tempo yang selalu terlihat: huruf tidak boleh menggeser oktaf.
    await page.locator("#tempo-input").fill("100");
    await page.keyboard.press("a");
    assert.equal(await page.locator("[data-entity='ideas-keyboard']").getAttribute("data-base"), "60",
      "huruf saat fokus di input tidak boleh mengubah oktaf");
    assert.equal(await page.locator("#tempo-input").inputValue(), "100", "ketikan di input harus tetap utuh");

    // Di luar mode Ide, QWERTY tidak lagi tersedia.
    await page.evaluate(() => window.melodi.commands.setViewMode("piano-roll"));
    await page.waitForTimeout(120);
    await page.keyboard.press("x");
    assert.equal(await page.locator("[data-entity='ideas-keyboard']").getAttribute("data-base"), "60",
      "QWERTY harus mati di luar mode Ide");
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});