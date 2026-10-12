import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PPQ, createSong } from "../src/core/model.js";
import { projectSongToAbc } from "../src/notation/abc.js";

function example(meter, pitches) {
  const count = pitches.length;
  return createSong({
    id: "beam-browser",
    title: "Beam check",
    timing: { ppq: PPQ, tempo: 96, timeSignature: meter },
    key: "C",
    scale: { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
    sections: [],
    phrases: [],
    notes: pitches.map((pitch, i) => ({
      id: "n" + i, pitch, startTick: i * 240, durationTicks: 240,
      source: "user", anchor: false, locked: false
    })),
    lyrics: { rawText: "", syllables: [] },
    chords: []
  });
}

test("bundled abcjs renders actual SVG beams without losing note class identity", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="paper"></div>');
    await page.addScriptTag({ path: fileURLToPath(new URL("../vendor/abcjs/abcjs-basic-min.js", import.meta.url)) });
    for (const [meter, pitches, expectedBeams] of [
      [{ numerator: 4, denominator: 4 }, [60, 62, 64, 65, 67, 69, 71, 72], 4],
      [{ numerator: 6, denominator: 8 }, [60, 62, 64, 65, 67, 69], 2]
    ]) {
      const song = example(meter, pitches);
      const abc = projectSongToAbc(song).abc;
      const rendered = await page.evaluate(input => {
        window.ABCJS.renderAbc("paper", input, { add_classes: true, staffwidth: 900 });
        const root = document.getElementById("paper");
        return {
          beams: root.querySelectorAll(".abcjs-beam-elem").length,
          noteClasses: [...root.querySelectorAll(".abcjs-note")].map(node =>
            [...node.classList].filter(value => value.startsWith("melodi-note-"))).flat()
        };
      }, abc);
      assert.equal(rendered.beams, expectedBeams, `meter ${meter.numerator}/${meter.denominator}: expected connected beams`);
      for (let i = 0; i < pitches.length; i++) {
        assert.ok(rendered.noteClasses.includes("melodi-note-" + i), "score note class survives grouping");
      }
    }
  } finally {
    await browser.close();
  }
});
