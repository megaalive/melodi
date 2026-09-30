import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankSong, createSong } from '../src/core/model.js';
import { createCommands } from '../src/core/commands.js';
import { serializeProject, deserializeProject } from '../src/core/serialization.js';
import { toPortableProject, fromPortableProject, encodeSharePayload, decodeSharePayload } from '../src/io/share.js';
import { planHarmonyEvents, planBassEvents } from '../src/harmony/sketch.js';

const fields={rootPitchClass:9,quality:'minor',startTick:0,durationTicks:1440};
function fixture(){let id=0;return createCommands(createBlankSong(),{idFactory:()=>`chord-${++id}`});}
function rejectUnchanged(c,operation,code='chord-conflict'){
  const before=c.getSong(),history=c.getState().history;
  assert.throws(operation,{code});
  assert.deepEqual(c.getSong(),before);assert.deepEqual(c.getState().history,history);
}

test('Chord add rejects half-open overlap but allows adjacent ranges without replacing neighbors',()=>{
  const c=fixture(); c.addChord(fields);
  for(const startTick of [0,240,1439]) rejectUnchanged(c,()=>c.addChord({...fields,startTick}));
  c.addChord({...fields,startTick:1440}); assert.equal(c.getSong().chords.length,2);
});
test('Chord move and resize collisions are atomic and add no Undo step; adjacent placement succeeds',()=>{
  const c=fixture(),a=c.addChord(fields); c.addChord({...fields,startTick:1440});
  rejectUnchanged(c,()=>c.updateChord(a.id,{startTick:1440}));
  rejectUnchanged(c,()=>c.updateChord(a.id,{durationTicks:1441}));
  c.updateChord(a.id,{startTick:2880}); c.updateChord(a.id,{durationTicks:2880});
  assert.equal(c.getSong().chords.find(chord=>chord.id===a.id).durationTicks,2880);
  c.undo(); assert.equal(c.getSong().chords.find(chord=>chord.id===a.id).durationTicks,1440);
});
test('Locked chord rejection precedes conflicting placement and duplicate cannot overwrite',()=>{
  const c=fixture(),a=c.addChord(fields); c.addChord({...fields,startTick:1440});
  c.setChordLocked(a.id,true);
  rejectUnchanged(c,()=>c.updateChord(a.id,{startTick:1440}),'locked-chord');
  rejectUnchanged(c,()=>c.addChord({...fields,startTick:a.startTick+a.durationTicks}));
});
test('Legacy overlapping data remains readable through model project and Share v7',async()=>{
  const song=createBlankSong();song.chords=[{...fields,id:'a',locked:false},{...fields,id:'b',rootPitchClass:2,startTick:720,locked:false}];
  const validated=createSong(song);
  assert.deepEqual(validated.chords,song.chords);
  assert.deepEqual(deserializeProject(serializeProject(validated)).chords,song.chords);
  assert.equal(toPortableProject(validated).version,7);
  assert.equal(fromPortableProject(toPortableProject(validated)).chords.length,2);
  const restored=await decodeSharePayload(await encodeSharePayload(validated,{CompressionStreamCtor:null}));
  assert.deepEqual(restored.chords.map(({id,...chord})=>chord),song.chords.map(({id,...chord})=>chord));
  const c=createCommands(validated);c.updateChord('a',{quality:'major'});
  rejectUnchanged(c,()=>c.updateChord('a',{durationTicks:1500}));
});
test('New command edits keep one chord per tick for Harmony and Bass planning',()=>{
  const c=fixture(); const a=c.addChord(fields);c.addChord({...fields,startTick:1440,rootPitchClass:2});
  rejectUnchanged(c,()=>c.updateChord(a.id,{durationTicks:2880}));
  const song=c.getSong();
  for(const tick of [0,720,1439,1440,2000,2879]) assert.equal(song.chords.filter(chord=>chord.startTick<=tick&&chord.startTick+chord.durationTicks>tick).length,1);
  for(const plan of [planHarmonyEvents,planBassEvents]) {
    const events=plan(song);
    assert.ok(events.length>0);
    for(const event of events) assert.ok(song.chords.some(chord=>event.startTick>=chord.startTick&&event.startTick+event.durationTicks<=chord.startTick+chord.durationTicks));
  }
});
