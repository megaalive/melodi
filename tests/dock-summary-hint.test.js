import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startAuditServer } from "../tools/ui-audit.mjs";

async function withPage(viewport, run) {
  const { server, url } = await startAuditServer({ basePath: "/melodi/", port: 0 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    await run(page);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

test("the mobile dock reads tempo and loop as two separate chips", async () => {
  for (const width of [360, 390, 430]) {
    await withPage({ width, height: 844 }, async page => {
      await page.evaluate(() => window.melodi.commands.setTempo(96));
      const chips = await page.evaluate(() => {
        const summary = document.querySelector("#mobile-transport-summary");
        const summaryStyle = getComputedStyle(summary);
        const parts = [...summary.querySelectorAll(".transport-summary-chip")].map(chip => {
          const rect = chip.getBoundingClientRect();
          const style = getComputedStyle(chip);
          return {
            name: chip.className,
            text: chip.textContent.replace(/\s+/g, " ").trim(),
            aria: chip.getAttribute("aria-label"),
            width: Math.round(rect.width),
            clipped: chip.scrollWidth > chip.clientWidth + 1,
            ellipsis: style.textOverflow === "ellipsis",
          };
        });
        return {
          role: summary.getAttribute("role"),
          ariaLabel: summary.getAttribute("aria-label"),
          overflow: summaryStyle.overflow,
          parts,
          loopEnabled: document.querySelector("#mobile-transport-loop").dataset.loopEnabled,
        };
      });
      assert.equal(chips.parts.length, 2, `${width}px: dock punya dua chip, dapat ${JSON.stringify(chips.parts)}`);
      assert.equal(chips.parts[0].text.replace(/\s+/g, ""), "96BPM", `${width}px: chip tempo menampilkan angka tempo dan satuan`);
      assert.match(chips.parts[0].aria ?? "", /96 BPM/, `${width}px: chip tempo punya nama yang terbaca`);
      assert.match(chips.parts[1].aria ?? "", /\S/, `${width}px: chip loop punya nama yang terbaca`);
      assert.equal(chips.parts[1].ellipsis, false, `${width}px: chip tidak pakai ellipsis`);
      assert.equal(chips.parts[1].clipped, false, `${width}px: chip loop tidak terpotong`);
      assert.equal(chips.parts[0].clipped, false, `${width}px: chip tempo tidak terpotong`);
      assert.ok(chips.parts.every(part => part.width > 0), `${width}px: kedua chip terlihat`);
      assert.match(chips.ariaLabel ?? "", /96/, `${width}px: aria-label dock menyebut tempo`);

      const toggled = await page.evaluate(() => {
        window.melodi.commands.setLoopEnabled(false);
        const chip = document.querySelector("#mobile-transport-loop");
        return {
          enabled: chip.dataset.loopEnabled,
          text: chip.querySelector("#mobile-transport-loop-state").textContent.trim(),
          aria: chip.getAttribute("aria-label"),
        };
      });
      assert.equal(toggled.enabled, "false", `${width}px: chip loop mengikuti state loop`);
      assert.notEqual(toggled.text, "aktif", `${width}px: chip loop menulis state baru`);
    });
  }
});

test("portrait drops the empty band between the app header and the ruler", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await withPage(viewport, async page => {
      const gap = await page.evaluate(() => {
        const heading = document.querySelector("#piano-roll-section .pane-heading");
        const surface = document.querySelector(".roll-surface").getBoundingClientRect();
        const header = document.querySelector(".page-header").getBoundingClientRect();
        const headingStyle = getComputedStyle(heading);
        return {
          headingVisible: headingStyle.display !== "none" && heading.getBoundingClientRect().height > 0,
          headerBottom: Math.round(header.bottom),
          surfaceTop: Math.round(surface.top),
        };
      });
      assert.equal(gap.headingVisible, false, `${viewport.width}px: judul pane piano roll tidak lagi menyisakan pita kosong`);
      assert.ok(gap.surfaceTop - gap.headerBottom <= 8,
        `${viewport.width}px: grid mulai tepat di bawah header, dapat ${gap.surfaceTop - gap.headerBottom}px`);
    });
  }
});

test("the empty-song hint is centred in the canvas, avoids pitch labels and click targets, and can be dismissed", async () => {
  await withPage({ width: 390, height: 844 }, async page => {
    // Lagu kosong membuka tab Ide; petunjuk roll diuji dari tab Edit.
    await page.evaluate(() => window.melodi.commands.setViewMode("piano-roll"));
    await page.waitForTimeout(150);
    const empty = await page.evaluate(() => {
      const hint = document.querySelector("#piano-roll-empty");
      const surface = document.querySelector(".roll-surface").getBoundingClientRect();
      const rect = hint.getBoundingClientRect();
      const labels = [...document.querySelectorAll(".roll-pitch-label")]
        .map(label => label.getBoundingClientRect())
        .filter(box => box.width > 0);
      const covered = labels.filter(box => box.right > rect.left && box.left < rect.right && box.bottom > rect.top && box.top < rect.bottom);
      return {
        visible: !hint.hidden,
        centred: Math.abs((rect.left + rect.right) / 2 - (surface.left + surface.right) / 2) < 2,
        top: Math.round(rect.top - surface.top),
        surfaceHeight: Math.round(surface.height),
        labelCount: labels.length,
        coveredLabels: covered.length,
        dismissLabel: document.querySelector(".roll-empty-dismiss").getAttribute("aria-label"),
      };
    });
    assert.equal(empty.visible, true, "petunjuk muncul saat lagu kosong");
    assert.ok(empty.labelCount > 0, "ada label pitch untuk diuji");
    assert.equal(empty.coveredLabels, 0, "petunjuk tidak menutupi label pitch");
    assert.equal(empty.centred, true, "petunjuk rata tengah di canvas");
    assert.ok(empty.top <= empty.surfaceHeight * 0.5,
      `petunjuk tidak masuk ke pita kontrol atas, dapat ${empty.top}px dari atas area ${empty.surfaceHeight}px`);
    const clickTargets = await page.evaluate(() => {
      const hint = document.querySelector("#piano-roll-empty").getBoundingClientRect();
      return [...document.querySelectorAll('#piano-roll-scroll [role="button"], #piano-roll-scroll [data-action]')]
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.bottom > hint.top && rect.top < hint.bottom && rect.right > hint.left && rect.left < hint.right;
        })
        .length;
    });
    assert.equal(clickTargets, 0, "petunjuk tidak menutupi target klik di dalam grid");
    assert.ok(empty.dismissLabel && empty.dismissLabel.length > 2, "tombol tutup punya nama yang terbaca");

    await page.locator(".roll-empty-dismiss").click();
    await page.waitForFunction(() => document.querySelector("#piano-roll-empty").hidden, null, { timeout: 3000 });
    await page.evaluate(() => window.melodi.commands.render?.());
    assert.equal(await page.locator("#piano-roll-empty").isVisible(), false, "petunjuk tetap tertutup setelah render berikutnya");

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.melodi?.commands), null, { timeout: 15000 });
    await page.evaluate(() => {
      const commands = window.melodi.commands;
      commands.newIdea();
      commands.addNote({ pitch: 64, startTick: 0, durationTicks: 480 });
    });
    await page.waitForFunction(() => document.querySelector("#piano-roll-empty").hidden, null, { timeout: 3000 });
    assert.equal(await page.locator("#piano-roll-empty").isVisible(), false, "petunjuk hilang begitu ada not pertama");
  });
});