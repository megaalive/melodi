import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { configureState, startAuditServer } from "../tools/ui-audit.mjs";

async function withPage(viewport, run) {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    // Lagu kosong membuka tab Ide; tes ini menghitung chrome workspace Edit.
    await page.evaluate(() => window.melodi.commands.setViewMode('piano-roll'));
    await page.waitForTimeout(200);
    await run(page);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

const channelVolumeSelector = "[data-channel-volume]";

test("channel volume lives in the mixer dock, not in the toolbar chrome", async () => {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1200, height: 900 }, { width: 1024, height: 768 }]) {
    await withPage(viewport, async page => {
      const counts = await page.evaluate(selector => ({
        chrome: document.querySelectorAll(`#view-controls ${selector}, #studio-core-controls ${selector}`).length,
        mixer: document.querySelectorAll(`#studio-mixer-channels ${selector}`).length,
        total: document.querySelectorAll(selector).length,
      }), channelVolumeSelector);
      assert.equal(counts.chrome, 0, `${viewport.width}px: slider volume tidak boleh ada di chrome toolbar`);
      assert.ok(counts.mixer >= 3, `${viewport.width}px: Mixer dock tetap memuat slider volume channel, dapat ${JSON.stringify(counts)}`);
      assert.equal(counts.total, counts.mixer, `${viewport.width}px: tidak ada slider volume melayang di luar Mixer`);
    });
  }
});

test("seek and loop move as one unit with an inline label", async () => {
  await withPage({ width: 1024, height: 768 }, async page => {
    const unit = await page.evaluate(() => {
      const wrapper = document.querySelector(".studio-loop-seek-forms");
      const group = document.querySelector(".studio-loop-seek-group");
      const label = document.querySelector(".studio-loop-seek-label");
      if (!wrapper || !group || !label) return null;
      const forms = [...wrapper.querySelectorAll("form")];
      const labelRect = label.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const probe = document.createElement("span");
      probe.style.display = "none";
      document.body.append(probe);
      probe.style.color = "var(--text-muted)";
      const muted = getComputedStyle(probe).color;
      probe.remove();
      return {
        groupChildren: [...group.children].map(child => child.className),
        forms: forms.length,
        display: getComputedStyle(group).display,
        labelColor: getComputedStyle(label).color,
        labelWidth: Math.round(labelRect.width),
        muted,
        sameRow: Math.abs(labelRect.top - wrapperRect.top) < 2 || Math.abs(labelRect.bottom - wrapperRect.bottom) < 2,
        wrapperWrap: getComputedStyle(wrapper).flexWrap,
        groupWrap: getComputedStyle(group).flexWrap,
        overflow: forms.some(form => form.getBoundingClientRect().right > wrapperRect.right + 1),
      };
    });
    assert.ok(unit, "grup Loop/Seek harus ada");
    assert.deepEqual(unit.groupChildren, ["studio-loop-seek-label", "studio-loop-seek-forms"],
      "label dan dua form harus berada dalam satu grup");
    assert.equal(unit.forms, 2, "Seek dan Range/Terapkan jadi dua anak satu wrapper");
    assert.equal(unit.display, "flex", "grup Loop/Seek tetap baris flex");
    assert.ok(unit.labelWidth > 0, "label Loop/Seek tetap terbaca");
    assert.equal(unit.labelColor, unit.muted, "label Loop/Seek memakai token teks redup, bukan ukuran kecil murder");
    assert.equal(unit.sameRow, true, "label dan unit form duduk di baris yang sama saat ruang cukup");
    assert.equal(unit.wrapperWrap, "nowrap", "Seek dan Range/Terapkan tidak dipisah di dalam unit");
    assert.equal(unit.groupWrap, "wrap", "label dan unit boleh pindah baris sebagai satu kesatuan");
    assert.equal(unit.overflow, false, "tidak ada form yang meluber keluar unit");
  });
});

test("a disabled Generate states its reason and stays readable in both themes", async () => {
  for (const colorScheme of ["light", "dark"]) {
    await withPage({ width: 1440, height: 900 }, async page => {
      await page.emulateMedia({ colorScheme });
      const probe = await page.evaluate(() => {
        const button = document.querySelector("#generate-gap");
        const status = document.querySelector(`#${button.getAttribute("aria-describedby")}`);
        const style = getComputedStyle(button);
        const parse = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = rgb => {
          const [r, g, b] = rgb.map(channel => {
            const value = channel / 255;
            return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (foreground, background) => {
          const first = luminance(parse(foreground));
          const second = luminance(parse(background));
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        };
        let surfaceNode = button;
        while (surfaceNode && getComputedStyle(surfaceNode).backgroundColor === "rgba(0, 0, 0, 0)") surfaceNode = surfaceNode.parentElement;
        return {
          disabled: button.disabled,
          opacity: style.opacity,
          statusText: status?.textContent.trim() ?? "",
          title: button.title.trim(),
          contrast: ratio(style.color, getComputedStyle(surfaceNode).backgroundColor),
        };
      });
      assert.equal(probe.disabled, true, `${colorScheme}: Generate nonaktif tanpa dua note`);
      assert.ok(probe.statusText.length > 8, `${colorScheme}: aria-describedby menunjuk alasan yang terbaca`);
      assert.equal(probe.title, probe.statusText, `${colorScheme}: title memakai teks alasan yang sama`);
      assert.ok(probe.contrast >= 3, `${colorScheme}: teks tombol nonaktif ${probe.contrast.toFixed(2)}:1 di bawah 3:1`);
    });
  }
});

test("the chord form is a two-column grid and the dock body scrolls with edge shadows", async () => {
  await withPage({ width: 1440, height: 900 }, async page => {
    await configureState(page, "edit-chord-panel");
    const form = await page.evaluate(() => {
      const actions = document.querySelector("#harmony-range-form .harmony-actions");
      const picker = document.querySelector("#chord-draw-picker");
      const options = document.querySelector(".chord-draw-options");
      if (!actions || !picker || !options) {
        return { missing: [!actions && "actions", !picker && "picker", !options && "options"].filter(Boolean) };
      }
      const style = getComputedStyle(actions);
      const selects = [...options.querySelectorAll("select")].filter(select => select.getBoundingClientRect().width > 0);
      const widths = selects.map(select => Math.round(select.getBoundingClientRect().width));
      const heights = [...new Set(selects.map(select => Math.round(select.getBoundingClientRect().height)))];
      const probe = document.createElement("span");
      probe.style.display = "none";
      document.body.append(probe);
      probe.style.height = "var(--control-h)";
      const control = getComputedStyle(probe).height;
      probe.remove();
      return {
        display: style.display,
        columns: style.gridTemplateColumns.trim().split(/\s+/).length,
        pickerPosition: getComputedStyle(picker).position,
        optionsDisplay: getComputedStyle(options).display,
        optionsColumns: getComputedStyle(options).gridTemplateColumns.trim().split(/\s+/).length,
        equalWidths: new Set(widths).size === 1,
        heights,
        control,
      };
    });
    assert.deepEqual(form.missing ?? [], [], "baris chord harus lengkap: aksi, penyusun, opsi");
    assert.equal(form.display, "grid", "baris chord jadi grid, bukan popover mengambang");
    assert.equal(form.columns, 2, "baris chord dua kolom: identitas lalu aksi");
    assert.ok(!["absolute", "fixed"].includes(form.pickerPosition), "penyusun chord bukan popover absolut");
    assert.equal(form.optionsDisplay, "grid", "opsi chord dalam satu blok grid");
    assert.equal(form.optionsColumns, 2, "Root dan Kualitas dua kolom");
    assert.equal(form.equalWidths, true, "select Root dan Kualitas sama lebar");
    assert.deepEqual(form.heights, [Number.parseFloat(form.control)], "select chord setinggi --control-h");
  });

  await withPage({ width: 1440, height: 1080 }, async page => {
    const dock = await page.evaluate(() => {
      const body = document.querySelector(".studio-dock-slot-body");
      if (!body) return { missing: true };
      const style = getComputedStyle(body);
      return {
        overflowY: style.overflowY,
        layers: style.backgroundImage.split("gradient").length - 1,
        local: (style.backgroundAttachment || "").split(",").map(value => value.trim()),
      };
    });
    assert.equal(dock.missing ?? false, false, "dock harus punya badan yang bisa digulir");
    assert.equal(dock.overflowY, "auto", "badan dock menggulir sendiri");
    assert.ok(dock.layers >= 3, `dock punya bayangan tepi, dapat ${dock.layers} layer`);
    assert.ok(dock.local.includes("local") && dock.local.includes("scroll"),
      `bayangan tepi memakai campuran local dan scroll, dapat ${JSON.stringify(dock.local)}`);
  });
});