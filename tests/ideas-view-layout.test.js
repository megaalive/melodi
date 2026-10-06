import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { measurePage, startAuditServer } from "../tools/ui-audit.mjs";

// D2: tab Ide hanya boleh menampilkan chrome Ide. Diperiksa di browser nyata
// pada 390x844 dan 1440x900 dalam tema terang dan gelap, karena beberapa aturan
// hanya terlihat setelah layout benar-benar dihitung.
const CASES = [
  { label: "hp-light", width: 390, height: 844, theme: "light", coarse: true },
  { label: "hp-dark", width: 390, height: 844, theme: "dark", coarse: true },
  { label: "desktop-light", width: 1440, height: 900, theme: "light", coarse: false },
  { label: "desktop-dark", width: 1440, height: 900, theme: "dark", coarse: false }
];

// Kontrol Edit yang tidak boleh muncul di tab Ide.
const EDIT_CHROME = [
  "#studio-core-controls",
  "#editor-toolbar",
  "#guitar-mode-toggle",
  "#studio-guitar-zone",
  ".studio-generation-quick-group",
  ".studio-quick-chord",
  ".studio-loop-seek-group",
  "#piano-roll-collapse"
];

async function readIdeChrome(page) {
  return page.evaluate((editChrome) => {
    const visible = element => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return !element.hidden && rect.width > 0 && rect.height > 0;
    };
    const editVisible = editChrome
      .filter(selector => visible(document.querySelector(selector)))
      .map(selector => selector);
    const inside = editChrome
      .filter(selector => document.querySelector("#ideas-section")?.contains(document.querySelector(selector)))
      .map(selector => selector);
    // Label tuts yang benar-benar tergambar: dua label yang saling menindih
    // membuat keyboard tidak terbaca di layar kecil.
    const labels = [...document.querySelectorAll(".ideas-keyboard .ideas-key-label, .ideas-keyboard .ideas-key-note")]
      .filter(label => getComputedStyle(label).display !== "none" && label.getBoundingClientRect().width > 0)
      .map(label => ({ pitch: label.closest("[data-pitch]")?.dataset.pitch ?? "?", ...label.getBoundingClientRect().toJSON() }));
    const labelOverlaps = [];
    for (let left = 0; left < labels.length; left += 1) {
      for (let right = left + 1; right < labels.length; right += 1) {
        const a = labels[left];
        const b = labels[right];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) {
          labelOverlaps.push([a.pitch, b.pitch]);
        }
      }
    }
    // Bar tab bawah: hanya lima item, dan tidak ada teks yang patah dua baris.
    const dock = document.querySelector("#mobile-workspace-dock");
    const dockVisible = visible(dock);
    const tabRow = dock?.querySelector(":scope > #studio-views") ?? document.querySelector("#studio-views");
    const tabs = [...(tabRow?.querySelectorAll(":scope > button") ?? [])].filter(visible);
    const textLines = tabs.map((tab) => {
      const range = document.createRange();
      range.selectNodeContents(tab);
      const style = getComputedStyle(tab);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      return {
        text: tab.textContent.trim(),
        lines: range.getBoundingClientRect().height / lineHeight
      };
    });
    const order = [...document.querySelectorAll("#studio-views [data-studio-workspace]")]
      .map(button => button.dataset.studioWorkspace);
    return {
      mode: document.body.dataset.viewMode,
      workspace: document.body.dataset.studioWorkspace,
      editVisible,
      inside,
      labelOverlaps,
      labelCount: labels.length,
      noteLabelCount: document.querySelectorAll(".ideas-keyboard .ideas-key-note").length,
      hotkeyLabelCount: document.querySelectorAll(".ideas-keyboard .ideas-key-label").length,
      dockVisible,
      dockChildren: dockVisible
        ? [...dock.children].filter(visible).map(child => child.id || child.className)
        : [],
      dockPanelTabs: dockVisible ? dock.querySelectorAll(".studio-panel-switches").length : 0,
      tabCount: tabs.length,
      tabOrder: order,
      textLines,
      // Aksi Proyek global tetap boleh terlihat di chrome.
      projectActionsVisible: visible(document.querySelector("#project-menu"))
        || [...document.querySelectorAll(".desktop-project-actions button")].some(visible)
    };
  }, EDIT_CHROME);
}

test("tab Ide tidak memuat kontrol Edit atau Gitar di HP dan desktop, terang dan gelap", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const testCase of CASES) {
      const context = await browser.newContext({
        viewport: { width: testCase.width, height: testCase.height },
        hasTouch: testCase.coarse,
        isMobile: testCase.coarse,
        colorScheme: testCase.theme,
        serviceWorkers: "block"
      });
      await context.addInitScript(theme => localStorage.setItem("melodi.theme", theme), testCase.theme);
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
      await page.waitForTimeout(250);
      const state = await readIdeChrome(page);
      assert.deepEqual(pageErrors, [], `${testCase.label}: tidak boleh ada error halaman`);
      assert.equal(state.mode, "ideas", `${testCase.label}: harus terbuka di Ide`);
      assert.equal(state.workspace, "ideas");
      assert.deepEqual(state.editVisible, [], `${testCase.label}: chrome Edit masih terlihat`);
      assert.deepEqual(state.inside, [], `${testCase.label}: panel Edit tidak boleh ada di dalam section Ide`);
      assert.deepEqual(state.labelOverlaps, [], `${testCase.label}: label tuts saling menimpa`);
      assert.equal(state.noteLabelCount, 24, `${testCase.label}: dua oktaf punya 24 label nama nada`);
      if (testCase.coarse) {
        assert.equal(state.hotkeyLabelCount, 14, `${testCase.label}: label QWERTY hanya di desktop`);
      } else {
        assert.equal(state.hotkeyLabelCount, 14, `${testCase.label}: label QWERTY tetap ada di desktop`);
      }
      assert.equal(state.projectActionsVisible, true, `${testCase.label}: aksi Proyek global tetap ada`);
      if (testCase.coarse) {
        assert.equal(state.dockVisible, true, `${testCase.label}: bar tab bawah harus ada`);
        assert.deepEqual(state.dockChildren, ["transport-dock", "studio-views"],
          `${testCase.label}: bar tab bawah hanya transport dan lima tab workspace`);
        assert.equal(state.dockPanelTabs, 0, `${testCase.label}: tab dock tidak boleh ikut ke bar tab bawah`);
        assert.equal(state.tabCount, 5, `${testCase.label}: bar tab bawah tepat lima item`);
        assert.deepEqual(state.tabOrder, ["ideas", "edit", "notation", "rhythm"],
          `${testCase.label}: urutan tab bawah Ide, Edit, Not, Irama`);
        for (const item of state.textLines) {
          assert.ok(item.lines <= 1.35, `${testCase.label}: tab "${item.text}" patah jadi ${item.lines.toFixed(2)} baris`);
        }
        const metrics = await measurePage(page);
        assert.ok(!metrics.chromeBudgetExceeded,
          `${testCase.label}: chrome ${metrics.chrome.totalPx}px (${metrics.chrome.percentExact.toFixed(1)}%) melewati anggaran ${metrics.chromeBudgetPercent}%`);
        assert.ok(metrics.chrome.percentExact <= 25,
          `${testCase.label}: chrome ${metrics.chrome.percentExact.toFixed(1)}% masih di atas 25%`);
      } else {
        assert.equal(state.dockVisible, false, `${testCase.label}: desktop tidak memakai bar tab bawah`);
      }
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("tab dock tetap terbuka lewat tombol Panel di HP", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block"
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    await page.waitForTimeout(250);
    await page.locator("[data-studio-panel-toggle]").click();
    await page.waitForTimeout(300);
    const panel = await page.evaluate(() => {
      const tabs = document.querySelector(".mobile-panel-peek-actions .studio-panel-switches");
      const rect = tabs?.getBoundingClientRect();
      return {
        host: tabs?.parentElement?.className ?? null,
        tabs: tabs ? tabs.querySelectorAll('[role="tab"]').length : 0,
        label: [...(tabs?.querySelectorAll('[role="tab"]') ?? [])].map(tab => tab.textContent.trim()),
        visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        inDock: Boolean(document.querySelector("#mobile-workspace-dock .studio-panel-switches")),
        panel: document.body.dataset.studioPanel
      };
    });
    assert.equal(panel.inDock, false, "tab dock tidak boleh tinggal di bar tab bawah");
    assert.equal(panel.host, "mobile-panel-peek-actions");
    assert.equal(panel.tabs, 5, "lima tab dock: Isi celah, Chord, Mixer, Alat, dan Ekspresi drum");
    assert.equal(panel.visible, true, "tab dock harus terlihat setelah Panel dibuka");
    assert.notEqual(panel.panel, "none");
    await page.close();
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("tata letak Ide desktop: keyboard selebar kontainer, kartu tiga kolom, papan ide kolom sendiri", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    await page.locator("[data-action='ideas-count-in']").uncheck();
    await page.locator("#ideas-record").click();
    await page.waitForTimeout(120);
    for (const pitch of ["60", "62", "64", "67"]) {
      const box = await page.locator(`[data-pitch='${pitch}']`).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(240);
      await page.mouse.up();
    }
    await page.locator("#ideas-record").click();
    await page.waitForTimeout(250);
    await page.locator("[data-action='ideas-develop']").first().click();
    await page.waitForTimeout(250);

    const layout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect() ?? null;
      const strip = document.querySelector(".ideas-variations-strip");
      const board = document.querySelector(".ideas-board");
      const panel = document.querySelector(".ideas-takes-panel");
      return {
        pane: rect("#ideas-section"),
        keyboard: rect("[data-entity='ideas-keyboard']"),
        takes: rect("[data-entity='ideas-takes']"),
        variations: rect("[data-entity='ideas-variations']"),
        boardList: rect("[data-entity='ideas-board']"),
        keyboardColumns: getComputedStyle(document.querySelector(".ideas-takes-panel")).gridTemplateColumns.split(" ").filter(Boolean).length,
        stripColumns: getComputedStyle(strip).gridTemplateColumns.split(" ").filter(Boolean).length,
        boardColumns: getComputedStyle(board).gridTemplateColumns.split(" ").filter(Boolean).length,
        emptyAreaRatio: 1 - (document.querySelector("#ideas-section").getBoundingClientRect().width
          * document.querySelector("#ideas-section").getBoundingClientRect().height
          / (board.getBoundingClientRect().width * board.getBoundingClientRect().height)),
        candidates: strip.children.length,
        panel: panel !== null
      };
    });
    assert.ok(layout.keyboard.width >= layout.pane.width * 0.95,
      `keyboard harus selebar pane: ${Math.round(layout.keyboard.width)} dari ${Math.round(layout.pane.width)}`);
    assert.equal(layout.boardColumns, 1, "board memakai satu kolom supaya keyboard tetap lebar penuh");
    assert.equal(layout.keyboardColumns, 2, "hasil kandidat dan papan ide jadi kolom sendiri");
    assert.ok(layout.stripColumns >= 3, `kartu kandidat hanya ${layout.stripColumns} kolom`);
    assert.ok(layout.variations.top >= layout.keyboard.bottom - 1, "kartu kandidat ada di bawah keyboard");
    assert.ok(layout.takes.top >= layout.keyboard.bottom - 1, "daftar take ada di bawah keyboard");
    assert.ok(layout.boardList.left >= layout.variations.right - 1,
      "papan ide adalah kolom terpisah di kanan, bukan tumpukan di bawah kartu");
    assert.ok(layout.emptyAreaRatio < 0.12,
      `area kosong di dalam pane terlalu besar: ${(layout.emptyAreaRatio * 100).toFixed(1)}%`);
    assert.ok(layout.candidates >= 5, "kartu Asli dan kandidat ikut memakai grid");
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("tata letak Ide HP: satu kolom dengan urutan strip, hasil, keyboard", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    await page.waitForTimeout(250);
    const order = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect() ?? null;
      const boardStyle = getComputedStyle(document.querySelector(".ideas-board"));
      return {
        strip: rect(".ideas-strip"),
        keyboard: rect("[data-entity='ideas-keyboard']"),
        results: rect(".ideas-takes-panel"),
        boardDisplay: boardStyle.display,
        boardDirection: boardStyle.flexDirection,
        takesColumns: getComputedStyle(document.querySelector(".ideas-takes-panel")).gridTemplateColumns.split(" ").filter(Boolean).length,
        paneWidth: rect("#ideas-section").width
      };
    });
    assert.equal(order.boardDisplay, "flex", "board kolom tunggal via flex di HP");
    assert.equal(order.boardDirection, "column", "board tersusun vertikal di HP");
    assert.equal(order.takesColumns, 1, "hasil satu kolom di HP");
    assert.ok(order.results.top >= order.strip.bottom - 1, "kartu take ada di bawah baris Tangkap");
    assert.ok(order.keyboard.top >= order.results.bottom - 1, "keyboard ada di bawah kartu hasil");
    assert.ok(order.keyboard.width >= order.paneWidth * 0.95, "keyboard selebar pane di HP");

    // C2 keyboard sentuh: tuts putih tetap >= 44px meski keyboard di-scroll
    // horizontal, tombol hitam tidak lagi menampilkan label nada yang tidak
    // terbaca, dan baris tab bawah tetap lima item.
    const touch = await page.evaluate(() => {
      const keyboard = document.querySelector(".ideas-keyboard");
      const whiteWidths = [...document.querySelectorAll(".ideas-key-white")].map((el) => el.getBoundingClientRect().width);
      const blackNotes = [...document.querySelectorAll(".ideas-key-black .ideas-key-note")].map((el) => getComputedStyle(el).display);
      const tabLabels = [...document.querySelectorAll(".studio-panel-switches [role='tab']")]
        .map((el) => (el.textContent ?? "").trim()).filter(Boolean);
      return {
        labels: keyboard.dataset.labels,
        overflowX: getComputedStyle(keyboard).overflowX,
        scrollWidth: keyboard.scrollWidth,
        clientWidth: keyboard.clientWidth,
        whiteCount: whiteWidths.length,
        minWhiteWidth: Math.min(...whiteWidths),
        blackNoteVisible: blackNotes.filter((display) => display !== "none").length,
        tabLabels
      };
    });
    assert.equal(touch.labels, "none", "data-labels ditulis none di pointer kasar");
    assert.equal(touch.overflowX, "auto", "keyboard boleh di-scroll horizontal di HP");
    assert.ok(touch.scrollWidth > touch.clientWidth, " keyboard lebih lebar dari wadahnya, jadi di-scroll");
    assert.ok(touch.whiteCount >= 14, `tuts putih ${touch.whiteCount}, minimal dua oktaf`);
    assert.ok(touch.minWhiteWidth >= 44, `tuts putih tersempit ${touch.minWhiteWidth}px, harus >= 44px`);
    assert.equal(touch.blackNoteVisible, 0, "label nada pada tombol hitam disembunyikan di layar sentuh");
    assert.equal(touch.tabLabels.length, 5, `baris tab bawah: ${touch.tabLabels.join(", ")}`);
    await page.close();
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});