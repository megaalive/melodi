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

async function readIdeas(page) {
  return page.evaluate(() => {
    const section = document.querySelector("#ideas-section");
    const keys = [...document.querySelectorAll("[data-entity^='ideas-key-']")];
    const box = key => {
      const rect = key.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const rects = keys.map(box);
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
    return {
      visible: section ? !section.hidden : false,
      mode: document.body.dataset.viewMode ?? null,
      navIdeas: document.querySelector('#studio-views [data-studio-workspace="ideas"]')?.getAttribute("aria-pressed") ?? null,
      navCount: document.querySelectorAll("#studio-views [data-studio-workspace]").length,
      navOrder: [...document.querySelectorAll("#studio-views [data-studio-workspace]")].map(button => button.dataset.studioWorkspace),
      keyCount: keys.length,
      whiteCount: document.querySelectorAll(".ideas-key-white").length,
      blackCount: document.querySelectorAll(".ideas-key-black").length,
      outsideViewport: rects.filter(rect => rect.left < -1 || rect.right > viewport.width + 1 || rect.top < -1).length,
      clipped: rects.some(rect => rect.width < 8 || rect.height < 8),
      smallTargets,
      takeCount: document.querySelectorAll("[data-entity='ideas-take']").length,
      status: document.querySelector("[data-entity='ideas-status']")?.textContent ?? "",
      keyboardHeight: rects[0]?.height ?? 0
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
    assert.equal(state.keyCount, 14, "sembilan tombol putih dan lima hitam");
    assert.equal(state.whiteCount, 9);
    assert.equal(state.blackCount, 5);
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
      assert.equal(state.outsideViewport, 0, `${viewport.label}: tombol keyboard boleh keluar viewport`);
      assert.equal(state.clipped, false, `${viewport.label}: tombol keyboard tidak boleh terpotong`);
assert.ok(state.keyboardHeight >= 44, `${viewport.label}: tinggi tombol keyboard minimal 44px, dapat ${state.keyboardHeight}`);
      assertUsableTapTarget(state.smallTargets, viewport.label);
      assert.equal(state.keyCount, 14, `${viewport.label}: sembilan tombol putih dan lima hitam`);
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
    await page.locator("[data-action='ideas-count-in']").uncheck();
    await page.locator("#ideas-record").click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#ideas-record").getAttribute("aria-pressed"), "true", "Rekam harus aktif");
    assert.equal(await page.locator("#ideas-section").getAttribute("data-recording"), "true");

    // Dua nada lewat sentuhan tombol keyboard, lalu berhenti merekam.
    await pressKey(page, "[data-pitch='72']", 240);
    await pressKey(page, "[data-pitch='76']", 240);
    await page.locator("#ideas-record").click();
    await page.waitForTimeout(200);

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

test("kembangkan satu take jadi variasi deterministik yang bisa dibandingkan", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    await page.locator("[data-action='ideas-count-in']").uncheck();
    await page.locator("#ideas-record").click();
    await pressKey(page, "[data-pitch='72']", 260);
    await pressKey(page, "[data-pitch='76']", 260);
    await page.locator("#ideas-record").click();
    await page.waitForTimeout(200);

    await page.locator("[data-action='ideas-develop']").first().click();
    await page.waitForTimeout(200);
    const variations = page.locator("[data-entity='ideas-variation']");
    assert.equal(await variations.count(), 3, "take harus berkembang jadi tiga variasi");
    assert.equal(await page.locator("[data-entity='ideas-variations']").getAttribute("data-open"), "true");
    const seed = await page.locator("[data-entity='ideas-variations']").getAttribute("data-seed");
    assert.ok(Number(seed) >= 0, "seed harus terlihat");
    const recorded = await page.locator("[data-entity='ideas-variation'][data-kind='as-recorded']").getAttribute("data-note-count");
    assert.equal(recorded, "2", "variasi Asli rekaman berisi dua nada");

    // Seed yang sama menghasilkan variasi yang sama: tombol Seed lain harus
    // mengubah seed, lalu kembali ke seed awal menghasilkan isi yang sama.
    const firstNotes = await page.locator("[data-entity='ideas-variation'][data-kind='passing']").getAttribute("data-note-count");
    await page.locator("[data-action='ideas-variation-use']").nth(1).click();
    await page.waitForTimeout(200);
    const afterAccept = await page.evaluate(() => window.melodi.commands.getSong().notes.length);
    assert.ok(afterAccept >= 2, "menerima variasi menambah nada ke lagu");
    assert.equal(await page.evaluate(() => window.melodi.getState().history.undoDepth), 1,
      "menerima satu variasi adalah satu langkah undo");
    assert.equal(await page.locator("[data-entity='ideas-variation'][data-kind='passing']").getAttribute("data-note-count"), firstNotes,
      "setelah menerima, variasi di layar tidak boleh berubah diam-diam");
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("alur akhir HP: rekam, kembangkan, terima, simpan tanpa membuka menu", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });

    // Empat nada seperti rencana tangkap ide.
    const overlaysBefore = await page.evaluate(() => document.querySelectorAll("dialog[open], .app-menu-popover.open, .studio-more-popover.open").length);
    await page.locator("[data-action='ideas-count-in']").uncheck();
    await page.locator("#ideas-record").click();
    for (const pitch of ["72", "74", "76", "79"]) await pressKey(page, `[data-pitch='${pitch}']`, 220);
    await page.locator("#ideas-record").click();
    await page.waitForTimeout(250);
    assert.equal(await page.locator("[data-entity='ideas-take']").first().getAttribute("data-note-count"), "4");

    // Kembangkan, dengar, lalu terima salah satu variasi ke lagu.
    await page.locator("[data-action='ideas-develop']").first().click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator("[data-entity='ideas-variation']").count(), 3);
    await page.locator("[data-action='ideas-variation-use']").nth(0).click();
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.melodi.commands.getSong().notes.length), 4);

    // Simpan ide tanpa membuka menu apa pun.
    await page.locator("[data-action='ideas-take-save']").first().click();
    await page.waitForTimeout(250);
    const board = await page.evaluate(() => window.melodi.commands.listIdeas());
    assert.equal(board.ideas.length, 1, "take harus tersimpan di papan ide");
    assert.equal(board.ideas[0].notes.length, 4);
    assert.equal(await page.locator("[data-entity='ideas-idea']").count(), 1);
    const openOverlays = await page.evaluate(() => document.querySelectorAll("dialog[open], .app-menu-popover.open, .studio-more-popover.open").length);
    assert.equal(openOverlays, overlaysBefore, "alur simpan tidak boleh membuka menu atau dialog");

    // Muat ide ke lagu lagi harus menjadi satu langkah undo tambahan.
    await page.locator("[data-action='ideas-idea-load']").first().click();
    await page.waitForTimeout(250);
    const afterLoad = await page.evaluate(() => ({
      notes: window.melodi.commands.getSong().notes.length,
      undoDepth: window.melodi.getState().history.undoDepth
    }));
    assert.equal(afterLoad.notes, 8);
    assert.equal(afterLoad.undoDepth, 2);

    // Papan ide bertahan setelah reload.
    await page.reload({ waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    await page.evaluate(() => window.melodi.commands.setViewMode("ideas"));
    await page.waitForTimeout(250);
    assert.equal(await page.locator("[data-entity='ideas-idea']").count(), 1, "ide harus bertahan setelah reload");
    await page.close();
    await context.close();
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
    assert.equal(afterOctaveDown, "1", "Z turun satu oktaf");

    await page.keyboard.down("a");
    await page.waitForTimeout(60);
    const activeWhileDown = await page.locator("#ideas-section").getAttribute("data-octave");
    assert.equal(activeWhileDown, "1");
    const readout = await page.locator("[data-entity='ideas-readout']").textContent();
    assert.equal(readout, "C4", "A harus membunyikan nada oktaf yang dipilih");
    await page.keyboard.up("a");

    // Fokus di input tempo yang selalu terlihat: huruf tidak boleh menggeser oktaf.
    await page.locator("#tempo-input").fill("100");
    await page.keyboard.press("a");
    const afterTyping = await page.locator("#ideas-section").getAttribute("data-octave");
    assert.equal(afterTyping, "1", "huruf saat fokus di input tidak boleh mengubah oktaf");
    assert.equal(await page.locator("#tempo-input").inputValue(), "100", "ketikan di input harus tetap utuh");

    // Di luar mode Ide, QWERTY tidak lagi tersedia.
    await page.evaluate(() => window.melodi.commands.setViewMode("piano-roll"));
    await page.waitForTimeout(120);
    await page.keyboard.press("x");
    const afterLeaving = await page.locator("#ideas-section").getAttribute("data-octave");
    assert.equal(afterLeaving, "1", "QWERTY harus mati di luar mode Ide");
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});