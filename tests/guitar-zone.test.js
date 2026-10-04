import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startAuditServer } from "../tools/ui-audit.mjs";

/*
* Satu tes layout untuk zona Gitar yang sudah ditulis ulang: header dengan
* tombol Tutup selalu di akhir, info yang tidak pernah terpotong, tinggi
* kontrol seragam, padding dari token, dan diagram yang tidak terpotong.
*/
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];
const THEMES = ["light", "dark"];
const ALLOWED_SPACING = new Set([0, 2, 4, 8, 12, 16]);

async function openStudio(page, url, { width, height, theme }) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
  await page.evaluate(next => {
    const select = document.querySelector("#theme");
    select.value = next;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, theme);
  await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, theme, { timeout: 5000 });
  await page.waitForTimeout(300);
  const zoneVisible = () => page.evaluate(() => {
    const zone = document.querySelector("#studio-guitar-zone");
    if (!zone || zone.hidden) return false;
    const rect = zone.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (!(await zoneVisible())) {
    // Di HP zona hanya muncul lewat sheet Gitar, jadi buka lewat tombol Gitar
    // di toolbar Edit; di desktop cukup tombol Tutup/Buka di header zona.
    const openers = page.locator('[data-studio-view="guitar"]:visible, [data-studio-panel="guitar"]:visible');
    if (await openers.count()) await openers.first().click();
    else await page.locator("[data-studio-guitar-zone-toggle]").click();
  }
  await page.waitForFunction(() => {
    const zone = document.querySelector("#studio-guitar-zone");
    if (!zone || zone.hidden) return false;
    return zone.getBoundingClientRect().height > 0;
  }, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  // Chip playhead hanya terisi saat transport berjalan, dan teksnya ditulis
  // pada render penuh. Jadi putar dulu, lalu picu render lewat pilihan
  // layout supaya chip benar-benar ada saat tinggi kontrol dibandingkan.
  await page.locator("#play").click();
  await page.waitForFunction(() => window.melodi.getState().playback.status === "playing", null, { timeout: 10000 });
  await page.locator("#guitar-layout-fretboard").click();
  await page.waitForTimeout(200);
  await page.locator("#guitar-layout-tab").click();
  await page.waitForTimeout(300);
}

function channel(value) {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
}

function parseColor(value) {
  const match = /rgba?\(([^)]+)\)/.exec(value ?? "");
  if (!match) return null;
  const [r, g, b] = match[1].split(",").map(part => Number.parseFloat(part));
  return { r, g, b };
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function readZone(page) {
  return page.evaluate(() => {
    const zone = document.querySelector("#studio-guitar-zone");
    const header = zone.querySelector(".guitar-zone-header");
    const resizer = document.querySelector("#studio-guitar-resizer");
    const canvas = [...zone.querySelectorAll("#guitar-tab-scroll, #guitar-scroll")]
      .find(element => !element.hidden);
    const body = document.querySelector("#guitar-section");
    const svg = canvas.querySelector("svg");
    const box = element => element?.getBoundingClientRect() ?? null;
    const height = element => Math.round(element?.getBoundingClientRect().height ?? 0);
    const paddingOf = element => {
      const style = getComputedStyle(element);
      return ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft"]
        .map(property => Math.round(Number.parseFloat(style[property]) || 0));
    };
    const headerChildren = [...header.children].map(element => ({
      name: element.id || element.className,
      rect: box(element),
      height: height(element),
    }));
    const interactive = [...zone.querySelectorAll("button, [role='region'], [tabindex='0']")]
      .filter(element => element.getBoundingClientRect().width > 0)
      .map(element => ({ name: element.id || element.className, rect: box(element) }));
    const playhead = zone.querySelector("#guitar-playhead");
    // Chip playhead hanya terisi saat ada nada yang berbunyi (Fretboard) atau
    // transport berjalan (TAB). Isi dengan contoh posisi supaya tinggi dan
    // kontrasnya tetap bisa diukur di kedua layout.
    if (!playhead.textContent) playhead.textContent = "Bar 1 ketukan 1";
    const playheadStyle = getComputedStyle(playhead);
    return {
      headerRect: box(header),
      headerChildren,
      interactive,
      headerHeight: height(header),
      zonePadding: paddingOf(zone),
      infoPadding: paddingOf(zone.querySelector(".guitar-zone-info")),
      headerPadding: paddingOf(header),
      toggleIsLast: header.lastElementChild?.classList.contains("guitar-zone-toggle") ?? false,
      controlHeights: {
        segmented: height(zone.querySelector(".guitar-layout-group")),
        toggle: height(zone.querySelector(".guitar-zone-toggle")),
        playhead: height(playhead),
      },
      innerButtonHeights: [
        height(zone.querySelector("#guitar-layout-tab")),
        height(zone.querySelector("#guitar-layout-fretboard")),
      ],
      info: [...zone.querySelectorAll("#guitar-status, #guitar-legend")].map(element => ({
        id: element.id,
        client: element.clientWidth,
        scroll: element.scrollWidth,
        overflow: getComputedStyle(element).textOverflow,
        whiteSpace: getComputedStyle(element).whiteSpace,
        height: height(element),
      })),
      playheadColors: { color: playheadStyle.color, background: playheadStyle.backgroundColor },
      strings: {
        client: canvas.clientHeight,
        scroll: canvas.scrollHeight,
        svg: Math.round(svg.getBoundingClientRect().height),
        overflowY: getComputedStyle(canvas).overflowY,
      },
      minHeight: Number(resizer.getAttribute("aria-valuemin")),
      chromeHeight: height(header) + height(resizer)
        + height(zone.querySelector(".guitar-zone-info")),
      zonePaddingBlock: paddingOf(zone).filter((_, index) => index === 0 || index === 2),
      resizer: {
        top: Math.round(resizer.getBoundingClientRect().top),
        bottom: Math.round(resizer.getBoundingClientRect().bottom),
        height: height(resizer),
        lineWidth: getComputedStyle(resizer, "::after").height,
      },
      headerTop: Math.round(header.getBoundingClientRect().top),
      titleVisible: (() => {
        const title = zone.querySelector(".guitar-zone-header h2");
        return title ? getComputedStyle(title).display !== "none" : false;
      })(),
      fretboard: (() => {
        const scroller = zone.querySelector("#guitar-scroll");
        if (!scroller || scroller.hidden) return null;
        const board = scroller.querySelector("svg");
        const labels = [...board.querySelectorAll(".neck-string-label, .neck-string-number")];
        const strings = [...board.querySelectorAll(".neck-string")];
        const hits = labels.filter(label => strings.some(line => {
          const a = label.getBoundingClientRect();
          const b = line.getBoundingClientRect();
          return !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5);
        })).length;
        return {
          labelHits: hits,
          labelCount: labels.length,
          emptyBelow: Math.round(scroller.clientHeight - board.getBoundingClientRect().height),
          boardHeight: Math.round(board.getBoundingClientRect().height),
        };
      })(),
      toastOverlapsBody: (() => {
        const status = document.querySelector(".status");
        if (!status || !status.textContent) return false;
        const a = status.getBoundingClientRect();
        const b = body.getBoundingClientRect();
        return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      })(),
    };
  });
}

function overlaps(a, b) {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

// BOARD_TOP + MIN_ROW_HEIGHT * 6 senar + NUT_HEIGHT, sesuai guitar-view.js
const minimumDiagramHeight = 18 + 20 * 6 + 6;

test("zona Gitar rapi di empat breakpoint, dua layout, dan dua tema", async () => {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const page = await browser.newPage({ viewport });
        await openStudio(page, url, { ...viewport, theme });
        const where = `${viewport.width}x${viewport.height} ${theme}`;

        for (const layout of ["tab", "fretboard"]) {
          await page.locator(`#guitar-layout-${layout}`).click();
          await page.waitForTimeout(300);
          const state = await readZone(page);
          const at = `${where} ${layout}`;

          assert.equal(state.toggleIsLast, true, `${at}: tombol Tutup harus anak terakhir header`);

          const toggle = state.headerChildren.at(-1);
          assert.ok(state.headerRect && toggle?.rect, `${at}: header dan Tutup harus punya rect`);
          assert.ok(
            toggle.rect.left >= state.headerRect.left - 0.5 && toggle.rect.right <= state.headerRect.right + 0.5
              && toggle.rect.top >= state.headerRect.top - 0.5 && toggle.rect.bottom <= state.headerRect.bottom + 0.5,
            `${at}: Tutup harus sepenuhnya di dalam rect header`,
          );

          const heights = Object.entries(state.controlHeights);
          for (const [name, value] of heights) {
            assert.ok(Math.abs(value - state.controlHeights.toggle) <= 1,
              `${at}: tinggi kontrol ${name} ${value}px beda lebih dari 1px dari Tutup ${state.controlHeights.toggle}px`);
          }
          // Tombol segmented menyesuaikan tinggi grupnya, bukan 32px + padding.
          assert.ok(Math.abs(state.innerButtonHeights[0] - state.innerButtonHeights[1]) <= 1,
            `${at}: tombol TAB dan Fretboard harus sama tinggi`);
          for (const value of state.innerButtonHeights) {
            assert.ok(value <= state.controlHeights.segmented,
              `${at}: tombol segmented ${value}px tidak boleh lebih tinggi dari grupnya ${state.controlHeights.segmented}px`);
          }

          for (const row of state.info) {
            assert.notEqual(row.overflow, "ellipsis", `${at}: ${row.id} tidak boleh memakai ellipsis`);
            assert.ok(row.scroll <= row.client + 1,
              `${at}: ${row.id} terpotong horizontal (${row.scroll} > ${row.client})`);
          }

          assert.equal(state.strings.overflowY, "auto", `${at}: diagram harus bisa scroll vertikal`);
          if (viewport.width <= 46 * 16) {
            // C1d: 6 senar TAB harus muat tanpa scroll vertikal di HP.
            assert.ok(state.strings.client >= state.strings.svg,
              `${at}: 6 senar TAB harus terlihat tanpa scroll vertikal (${state.strings.client} < ${state.strings.svg})`);
          }
          if (viewport.width >= 1024) {
            assert.ok(state.strings.client >= state.strings.svg,
              `${at}: 6 senar harus terlihat tanpa scroll vertikal (${state.strings.client} < ${state.strings.svg})`);
          }

          for (const value of [...state.zonePadding, ...state.infoPadding, ...state.headerPadding]) {
            assert.ok(ALLOWED_SPACING.has(value), `${at}: padding/margin ${value}px di luar token`);
          }

          for (let i = 0; i < state.interactive.length; i += 1) {
            for (let j = i + 1; j < state.interactive.length; j += 1) {
              const first = state.interactive[i];
              const second = state.interactive[j];
              assert.equal(overlaps(first.rect, second.rect), false,
                `${at}: ${first.name} bertindih dengan ${second.name}`);
            }
          }

          const playhead = parseColor(state.playheadColors.color);
          const chip = parseColor(state.playheadColors.background);
          if (playhead && chip) {
            const ratio = contrastRatio(playhead, chip);
            assert.ok(ratio >= 4.5, `${at}: chip playhead kontrasnya ${ratio.toFixed(2)}:1`);
          }

          // Tinggi senar adaptsif: minimum splitter dihitung dari diagram
          // terkecil (BOARD_TOP 18 + MIN_ROW_HEIGHT 20 * 6 senar + NUT 6),
          // bukan dari tinggi yang sedang dirender, karena yang kedua akan
          // chasing sendiri saat zona mendapat ruang lebih.
          assert.ok(state.minHeight >= state.chromeHeight + minimumDiagramHeight,
            `${at}: minimum splitter ${state.minHeight}px harus memuat chrome dan diagram terkecil`);

          // C1a: resizer di tepi atas zona, garis 1px, area sentuh 8px.
          assert.equal(state.resizer.height, 8, `${at}: area sentuh resizer harus 8px`);
          assert.ok(state.resizer.bottom <= state.headerTop + 1,
            `${at}: resizer harus di atas header zona (resizer ${state.resizer.bottom}, header ${state.headerTop})`);
          assert.equal(state.resizer.lineWidth, "1px", `${at}: garis resizer harus 1px`);

          // C1d: judul sheet sudah menyebut Gitar, jadi h2 disembunyikan di HP.
          if (viewport.width <= 46 * 16) {
            assert.equal(state.titleVisible, false, `${at}: h2 Gitar harus disembunyikan di dalam sheet HP`);
          }

          // C1b/C1c: label senar tidak dicoret dan papan mengisi tinggi body.
          if (state.fretboard) {
            assert.equal(state.fretboard.labelHits, 0,
              `${at}: ${state.fretboard.labelHits} label senar masih beririsan dengan garis senar`);
            assert.equal(state.fretboard.labelCount, 12, `${at}: semua label senar harus diukur`);
            if (viewport.width === 1440) {
              // C1c: papan mengisi tinggi body pada 1440x900. Di 1920 badannya
              // lebih tinggi dari batas atas 32px per senar, jadi sisa kosongnya
              // memang ada dan tidak bolehInstead dipaksa.
              assert.ok(state.fretboard.emptyBelow <= 16,
                `${at}: ruang kosong di bawah papan fret ${state.fretboard.emptyBelow}px (maks 16px)`);
            }
          }

          // C1e: toast tidak menutupi diagram.
          assert.equal(state.toastOverlapsBody, false, `${at}: toast menutupi diagram`);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});