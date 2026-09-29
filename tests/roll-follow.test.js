import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { centeredScrollLeft, nearestScrollLeft, playbackFollowMode } from "../src/ui/roll-follow.js";

test("center follow leaves the start at zero and locks the playhead to the visible timeline midpoint", () => {
  const geometry = { viewportWidth: 800, gutterWidth: 56, contentWidth: 2400 };
  const midpoint = 56 + (800 - 56) / 2;

  assert.equal(centeredScrollLeft({ ...geometry, playheadX: midpoint - 80 }), 0);
  const scrollLeft = centeredScrollLeft({ ...geometry, playheadX: 720 });
  assert.equal(scrollLeft, 292);
  assert.equal(720 - scrollLeft, midpoint);
});

test("center follow clamps at the content end and accounts for a wider frozen gutter", () => {
  assert.equal(centeredScrollLeft({
    playheadX: 2500,
    viewportWidth: 800,
    gutterWidth: 160,
    contentWidth: 1000
  }), 200);
  assert.equal(centeredScrollLeft({
    playheadX: 600,
    viewportWidth: 800,
    gutterWidth: 160,
    contentWidth: 2400
  }), 120);
  assert.equal(600 - 120, 160 + (800 - 160) / 2);
});

test("small and invalid follow geometry stays finite and never scrolls negatively", () => {
  assert.equal(centeredScrollLeft({ playheadX: 10, viewportWidth: 0, gutterWidth: 56, contentWidth: 1000 }), 0);
  assert.equal(centeredScrollLeft({ playheadX: 10, viewportWidth: 800, gutterWidth: 56, contentWidth: 700 }), 0);
  assert.equal(centeredScrollLeft({ playheadX: Number.NaN, viewportWidth: 800, gutterWidth: 900, contentWidth: Number.NaN }), 0);
  assert.equal(nearestScrollLeft({ playheadX: 300, playheadWidth: 24, viewportWidth: 0, contentWidth: 800 }), 0);
  assert.ok(Number.isFinite(centeredScrollLeft({ playheadX: Number.POSITIVE_INFINITY, viewportWidth: 800, contentWidth: 0 })));
});

test("the app follow decision disables center lock for custom ranges without changing the range", () => {
  const loop = { enabled: true, startTick: 480, endTick: 1920 };
  const before = structuredClone(loop);
  assert.equal(playbackFollowMode(true, false), "center");
  assert.equal(playbackFollowMode(true, true), "nearest");
  assert.equal(playbackFollowMode(false, false), "none");
  assert.deepEqual(loop, before);
});

test("the app passes its canonical note-and-percussion range decision to both rolls", () => {
  const app = readFileSync(resolve("src/app.js"), "utf8");
  assert.match(app, /function canonicalSongEndTick\(song\)/);
  assert.match(app, /track\.kind !== "percussion"/);
  assert.match(app, /const customPlaybackRange = playback\.loop\.startTick !== 0 \|\| playback\.loop\.endTick !== songEndTick/);
  assert.match(app, /playbackFollowMode\(follow, customPlaybackRange\)/);
  assert.match(app, /rollView\?\.updatePlayback\(playback, \{ followMode, songEndTick \}\)/);
  assert.match(app, /drumGridView\?\.updatePlayback\(playback, \{[\s\S]*?followMode: state\.view\.mode === "drums" \? followMode : "none"/);
});
