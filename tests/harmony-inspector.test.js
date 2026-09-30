import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harmonyContextRange, harmonyRangeLabel, renderHarmonyInspector, syncHarmonyRangeForm } from '../src/ui/harmony.js';
import { message } from '../src/i18n/messages.js';

const song = { timing:{ppq:480,timeSignature:{numerator:6,denominator:8}},key:'C',notes:[],chords:[] };
const state = {selectedNoteIds:[],selectedChordId:null,selection:null,playback:{currentTick:0},editor:{chordSnap:'bar'}};
const tr = (key,params) => message('en',key,params);
class Node {
  dataset={};children=[];attributes={};textContent='';
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(name,value){this.attributes[name]=value;}
}
function dom() {
  const nodes={};
  for(const id of ['harmony-style','bass-style','harmony-range-form','harmony-location','harmony-status','harmony-candidates','harmony-clear','harmony-selected-chord','harmony-chords','harmony-chord-form','harmony-edit-location','chord-snap']) nodes[id]=new Node();
  nodes['harmony-range-form'].elements={startTick:{value:0},endTick:{value:0}};
  nodes['harmony-chord-form'].elements={startTick:{value:0},durationTicks:{value:0},rootPitchClass:{value:0},quality:{value:'major'}};
  return {nodes,getElementById:id=>nodes[id],createElement:()=>new Node()};
}
function withDom(fn){const old=globalThis.document;const document=dom();globalThis.document=document;try{fn(document.nodes);}finally{globalThis.document=old;}}
const session={candidates:[],status:'idle',selectedCandidateId:null};

test('Harmony range derives meter and playhead bars for 6/8,4/4 and 5/4',()=>{
  assert.deepEqual(harmonyContextRange(song,state),{startTick:0,endTick:1440});
  assert.deepEqual(harmonyContextRange(song,{...state,playback:{currentTick:1500}}),{startTick:1440,endTick:2880});
  for(const [numerator,denominator,endTick] of [[4,4,1920],[5,4,2400]]) assert.deepEqual(harmonyContextRange({...song,timing:{ppq:480,timeSignature:{numerator,denominator}}},state),{startTick:0,endTick});
});
test('Harmony range prefers musical selection, then clicked range, then playhead',()=>{
  assert.deepEqual(harmonyContextRange(song,{...state,selection:{startTick:20,endTick:100},harmonyRange:{startTick:1440,endTick:2880}}),{startTick:20,endTick:100});
  assert.deepEqual(harmonyContextRange(song,{...state,harmonyRange:{startTick:1440,endTick:2880}}),{startTick:1440,endTick:2880});
});
test('Human range labels describe bars and half-open ends without ticks',()=>{
  assert.equal(harmonyRangeLabel(song,{startTick:0,endTick:1440},tr),'Bar 1');
  assert.equal(harmonyRangeLabel(song,{startTick:0,endTick:2880},tr),'Bars 1–2');
  assert.equal(harmonyRangeLabel(song,{startTick:1440,endTick:2880},tr),'Bar 2');
});
test('Pending range survives meter reconciliation while automatic defaults follow meter',()=>withDom(nodes=>{
  const form=nodes['harmony-range-form'];form.dataset.pending='true';form.elements.startTick.value=70;form.elements.endTick.value=250;
  assert.deepEqual(syncHarmonyRangeForm(song,state),{startTick:70,endTick:250});
  assert.equal(form.elements.endTick.value,250);
  form.dataset.pending='false';syncHarmonyRangeForm(song,state);assert.equal(form.elements.endTick.value,1440);
  syncHarmonyRangeForm({...song,timing:{ppq:480,timeSignature:{numerator:4,denominator:4}}},state);assert.equal(form.elements.endTick.value,1920);
}));
test('Inspector renders all chronological chords with selected/current context regardless of range',()=>withDom(nodes=>{
  const chords=[{id:'late',startTick:2880,durationTicks:1440,rootPitchClass:7,quality:'major',locked:true},{id:'first',startTick:0,durationTicks:1440,rootPitchClass:9,quality:'minor',locked:false}];
  renderHarmonyInspector({...song,chords},{...state,selectedChordId:'late'},session,tr);
  const rows=nodes['harmony-chords'].children;
  assert.deepEqual(rows.map(row=>row.dataset.entityId),['first','late']);
  assert.equal(rows[0].dataset.current,'true');assert.equal(rows[1].dataset.selected,'true');assert.equal(rows[1].dataset.overlapping,'false');
  assert.equal(rows[0].children[0].textContent,'Am · Bar 1');assert.equal(rows[1].children[0].textContent,'G · Bar 3 🔒');
  assert.equal(nodes['harmony-selected-chord'].hidden,false);assert.equal(nodes['harmony-selected-chord'].dataset.locked,'true');
  const actions=nodes['harmony-selected-chord'].children[1].children;
  assert.equal(actions[0].disabled,true);assert.equal(actions[1].disabled,false);assert.equal(actions[2].disabled,true);
}));
test('Inspector keeps pending compact chord changes and updates human current range',()=>withDom(nodes=>{
  const form=nodes['harmony-chord-form'];form.dataset.pending='true';form.elements.startTick.value=1440;form.elements.durationTicks.value=2880;form.elements.rootPitchClass.value=2;
  renderHarmonyInspector(song,state,session,tr);
  assert.equal(form.elements.rootPitchClass.value,2);assert.equal(nodes['harmony-edit-location'].textContent,'Bars 2–3');
  assert.equal(nodes['harmony-location'].textContent,'Bar 1');assert.equal(nodes['chord-snap'].value,'bar');
}));
test('Ordinary Harmony UI uses hidden internal ranges, musical snap and contextual timeline actions',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="harmony-timeline-tools"/);assert.match(html,/id="chord-context-menu"[^>]*role="menu"/);
  for(const name of ['startTick','endTick','durationTicks']) assert.match(html,new RegExp(`name="${name}" type="hidden"`));
  assert.doesNotMatch(html,/data-focus-key="(?:harmony-start|harmony-end|chord-start|chord-duration)"/);
  for(const unit of ['bar','half-bar','beat']) assert.match(html,new RegExp(`<option value="${unit}" data-copy="harmonySnap`));
  assert.match(html,/data-action="duplicate-chord"/);assert.match(html,/data-action="add-chord"/);
});
test('Harmony discoverability copy is short bilingual and explains actual chord coverage',()=>{
  assert.equal(message('en','harmonyHelp'),'Harmony and Bass play only where chord blocks exist.');
  assert.equal(message('id','harmonyHelp'),'Harmoni dan Bass berbunyi hanya pada bagian yang memiliki chord.');
  for(const language of ['id','en']) for(const key of ['harmonyLaneLabel','harmonyBar','harmonyBars','harmonySnap','harmonySnapBar','harmonySnapHalfBar','harmonySnapBeat','harmonyChange','harmonyDuplicate','harmonyAdd']) assert.notEqual(message(language,key),key);
});
