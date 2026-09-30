import test from "node:test";
import assert from "node:assert/strict";

test("legacy unsupported chords are skipped without suppressing supported neighbors", () => {
  const source = song();
  const supported = structuredClone(source);
  for (const quality of ["maj7", "constructor", "toString", "__proto__"]) {
    source.chords = [supported.chords[0], { ...supported.chords[0], id: "legacy", quality, startTick: 960, durationTicks: 960 }, supported.chords[1]];
    for (const [planner, styles] of [[planHarmonyEvents, ["block", "arpeggio"]], [planBassEvents, ["root", "root-fifth"]]]) {
      for (const style of styles) {
        assert.deepEqual(planner(source, { style }), planner(supported, { style }));
        assert.deepEqual(planner({ ...source, chords: [source.chords[1]] }, { style }), []);
      }
    }
    assert.equal(source.chords[1].quality, quality);
  }
});
import { planHarmonyEvents, planBassEvents } from "../src/harmony/sketch.js";

function song(numerator = 4, denominator = 4) {
  return { timing: { ppq: 480, timeSignature: { numerator, denominator } }, notes: [{ pitch: 76, startTick: 0, durationTicks: 3840 }], chords: [{ id: "c", rootPitchClass: 0, quality: "major", startTick: 0, durationTicks: 1920 }, { id: "f", rootPitchClass: 5, quality: "minor", startTick: 1920, durationTicks: 1920 }] };
}

test("harmony block derives correct bounded triads without mutating source", () => {
  const source = song();
  const before = structuredClone(source);
  const events = planHarmonyEvents(source);
  assert.deepEqual(events.filter(event => event.chordId === "c").map(event => event.pitch % 12).sort((a,b) => a-b), [0,4,7]);
  assert.deepEqual(events.filter(event => event.chordId === "f").map(event => event.pitch % 12).sort((a,b) => a-b), [0,5,8]);
  assert.ok(events.every(event => event.pitch >= 48 && event.pitch <= 72 && event.channel === "harmony"));
  assert.deepEqual(events, planHarmonyEvents(source));
  assert.deepEqual(source, before);
  assert.equal(new Set(events.map(event => event.id)).size, events.length);
});

test("voicing selects minimum movement with stable inversions", () => {
  const events = planHarmonyEvents(song());
  const first = events.slice(0,3).map(event => event.pitch);
  const second = events.slice(3).map(event => event.pitch);
  const cost = pitches => pitches.reduce((sum,pitch,index) => sum + Math.abs(pitch-first[index]),0);
  const chosenCost = cost(second);
  for (let bottom = 48; bottom <= 64; bottom++) {
    if (![0,5,8].includes(bottom%12)) continue;
    const pitches = [bottom];
    while (pitches.length < 3) {
      let next = pitches.at(-1)+1;
      while (![0,5,8].includes(next%12)) next++;
      pitches.push(next);
    }
    if (pitches.at(-1)<=72) assert.ok(chosenCost<=cost(pitches));
  }
  assert.deepEqual(planHarmonyEvents(song(), {startTick:1920}),events.slice(3));
});

test("block clips held notes to middle-of-chord playback and end boundary", () => {
  const events = planHarmonyEvents(song(), {startTick:500,endTick:1000});
  assert.equal(events.length,3);
  assert.ok(events.every(event => event.startTick===500 && event.durationTicks===500));
});

test("arpeggio respects quarter timing in 4/4 and eighth grouping in 6/8", () => {
  const simple = song(); simple.chords = [simple.chords[0]];
  const compound = song(6,8); compound.chords = [{...compound.chords[0],durationTicks:1440}];
  assert.deepEqual(planHarmonyEvents(simple,{style:"arpeggio"}).map(event=>event.startTick),[0,480,960,1440]);
  const compoundEvents = planHarmonyEvents(compound,{style:"arpeggio"});
  assert.deepEqual(compoundEvents.map(event=>event.startTick),[0,240,480,720,960,1200]);
  const triad = planHarmonyEvents(compound).map(event=>event.pitch);
  assert.deepEqual(compoundEvents.map(event=>event.pitch),[triad[0],triad[1],triad[2],triad[1],triad[2],triad[0]]);
});

test("arpeggio clips at chord and loop/range boundaries without restarting pattern", () => {
  const source = song(); source.chords = [{...source.chords[0],durationTicks:1100}];
  const events = planHarmonyEvents(source,{style:"arpeggio",startTick:600,endTick:1050});
  assert.deepEqual(events.map(event=>[event.startTick,event.durationTicks]),[[600,360],[960,90]]);
  assert.ok(planHarmonyEvents(source,{style:"arpeggio"}).every(event=>event.startTick+event.durationTicks<=1100));
});

test("bass root and root-fifth use safe registers and correct chord intervals", () => {
  const source = song();
  assert.deepEqual(planBassEvents(source).map(event=>[event.pitch,event.startTick,event.durationTicks]),[[36,0,1920],[41,1920,1920]]);
  const events = planBassEvents(source,{style:"root-fifth"});
  assert.deepEqual(events.slice(0,4).map(event=>event.pitch),[36,43,36,43]);
  assert.ok(events.every(event=>event.pitch>=36 && event.pitch<=54 && event.channel==="bass"));
  assert.deepEqual(events,planBassEvents(source,{style:"root-fifth"}));
  source.chords[0].quality="diminished";
  assert.deepEqual(planBassEvents(source,{style:"root-fifth"}).slice(0,2).map(event=>event.pitch),[36,42]);
});

test("bass root-fifth uses dotted-quarter compound groups and clips", () => {
  const source = song(6,8); source.chords=[{...source.chords[0],durationTicks:1440}];
  assert.deepEqual(planBassEvents(source,{style:"root-fifth"}).map(event=>[event.startTick,event.durationTicks]),[[0,720],[720,720]]);
  assert.deepEqual(planBassEvents(source,{style:"root-fifth",startTick:500,endTick:900}).map(event=>[event.pitch,event.startTick,event.durationTicks]),[[36,500,220],[43,720,180]]);
  assert.equal(planBassEvents(source,{startTick:500,endTick:900})[0].durationTicks,400);
});

test("planners default to canonical styles, accept overrides, reject invalid settings", () => {
  const source = song(); source.sketch={harmony:{style:"arpeggio",volume:0},bass:{style:"root-fifth",volume:0}};
  assert.equal(planHarmonyEvents(source).length,8);
  assert.equal(planBassEvents(source).length,8);
  assert.equal(planHarmonyEvents(source,{style:"block"}).length,6);
  for (const planner of [planHarmonyEvents,planBassEvents]) {
    assert.throws(()=>planner(source,{style:"invalid"}));
    assert.throws(()=>planner(source,{startTick:-1}));
    assert.throws(()=>planner(source,{endTick:0}));
    assert.deepEqual(planner({...source,chords:[]}),[]);
  }
});

test("all transpositions and diminished triads stay in safe registers", () => {
  for (let rootPitchClass=0;rootPitchClass<12;rootPitchClass++) {
    for (const [quality,intervals] of [["major",[0,4,7]],["minor",[0,3,7]],["diminished",[0,3,6]]]) {
      const source=song(); source.chords=[{...source.chords[0],rootPitchClass,quality}];
      const events=planHarmonyEvents(source);
      assert.deepEqual(events.map(event=>event.pitch%12).sort((a,b)=>a-b),intervals.map(interval=>(interval+rootPitchClass)%12).sort((a,b)=>a-b));
      assert.ok(events.every(event=>event.pitch>=48 && event.pitch<=72));
      assert.ok(planBassEvents(source,{style:"root-fifth"}).every(event=>event.pitch>=36 && event.pitch<=54));
    }
  }
});
