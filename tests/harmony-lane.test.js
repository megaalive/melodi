import test from 'node:test';
import assert from 'node:assert/strict';
import { createPianoRollView, tickToX, chordSnapTicks, chordGesturePatch, chordDrawRange, PIANO_RULER_HEIGHT, HARMONY_LANE_HEIGHT } from '../src/ui/piano-roll.js';
import { createBlankSong } from '../src/core/model.js';
import { createCommands } from '../src/core/commands.js';
import { MESSAGES } from '../src/i18n/messages.js';

class Element {
  constructor(tag) { this.tagName=tag; this.children=[]; this.dataset={}; this.attrs={}; this.listeners={}; this.scrollLeft=0; this.scrollTop=0; this.clientWidth=900; this.clientHeight=600; }
  setAttribute(key,value) { this.attrs[key]=String(value); if(key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value); }
  getAttribute(key) { return this.attrs[key]??null; }
  append(child) { this.children.push(child); child.parentElement=this; }
  replaceChildren() { this.children=[]; }
  remove() { this.parentElement.children=this.parentElement.children.filter(child=>child!==this); }
  all() { return this.children.flatMap(child=>[child,...child.all()]); }
  matches(selector) { const match=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector); return match ? (match[2]===undefined ? this.attrs[match[1]]!==undefined : this.attrs[match[1]]===match[2]) : this.tagName===selector; }
  closest(selector) { return selector.split(',').some(part=>this.matches(part.trim())) ? this : this.parentElement?.closest(selector)??null; }
  querySelectorAll(selector) { return this.all().filter(child=>child.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]??null; }
  contains(node) { return node===this||this.all().includes(node); }
  addEventListener(type,handler) { (this.listeners[type]??=[]).push(handler); }
  dispatch(type,event={}) { for(const handler of this.listeners[type]??[]) handler({target:this,button:0,pointerId:1,clientX:0,clientY:50,preventDefault(){},stopPropagation(){},...event}); }
  getBoundingClientRect() { return {left:0,top:0,width:Number(this.attrs.width)||900,height:Number(this.attrs.height)||600}; }
  setPointerCapture() {}
  releasePointerCapture() {}
  focus(options) { this.focusOptions=options; this.focusCount=(this.focusCount??0)+1; }
}
globalThis.document={createElementNS:(_ns,tag)=>new Element(tag)};

function setup({chords=[],tool='select',zoom=1,numerator=6,denominator=8,translate=key=>key}={}) {
  const song={key:'Am',notes:[{id:'n',pitch:69,startTick:0,durationTicks:2880}],chords,tracks:[],timing:{ppq:480,timeSignature:{numerator,denominator}}};
  const state={selectedNoteIds:[],selectedChordId:null,editor:{tool,snap:'1/8',chordSnap:'bar',zoom},playback:{currentTick:0,status:'stopped'}};
  const calls=[]; const scroll=new Element('div'); const svg=new Element('svg'); scroll.append(svg);
  const commands={getSong:()=>song,getState:()=>state,getSelectedNoteIds:()=>[],selectChord:id=>{state.selectedChordId=id;calls.push(['select',id]);},setHarmonyRange:(start,end)=>{state.harmonyRange={startTick:start,endTick:end};calls.push(['range',start,end]);},addChord:input=>{const chord={...input,id:'new',locked:false};song.chords.push(chord);calls.push(['add',input]);return chord;},updateChord:(id,patch)=>{Object.assign(song.chords.find(chord=>chord.id===id),patch);calls.push(['update',id,patch]);}};
  const view=createPianoRollView(svg,commands,{onChordContextMenu:(chord,event)=>calls.push(['context',chord.id,event.clientX]),translate}); view.render(song,state);
  const dispatch=(type,target,x)=>svg.dispatch(type,{target,clientX:x,clientY:50});
  return {song,state,svg,scroll,view,calls,dispatch};
}
const chord=(id='c',startTick=0,durationTicks=1440,locked=false)=>({id,startTick,durationTicks,rootPitchClass:9,quality:'minor',locked});

function guardedView(tool='select') {
  const song=createBlankSong();song.timing.timeSignature={numerator:6,denominator:8};
  let id=0;const commands=createCommands(song,{idFactory:()=>`guard-${++id}`});
  const fields={rootPitchClass:9,quality:'minor',startTick:0,durationTicks:1440};
  const first=commands.addChord(fields); commands.addChord({...fields,startTick:1440});
  commands.setTool(tool);commands.selectChord(first.id);
  const scroll=new Element('div'),svg=new Element('svg');scroll.append(svg);const errors=[];
  let drawDefault={rootPitchClass:5,quality:'major'};
  const view=createPianoRollView(svg,commands,{onError:error=>errors.push(error.code),getChordDrawDefaults:()=>drawDefault});
  const render=()=>view.render(commands.getSong(),commands.getState());render();
  return {commands,svg,view,errors,first,render,setDraw:value=>{drawDefault=value;},gesture(kind,from,to){
    render();const group=svg.querySelectorAll('[data-entity="chord"]').find(node=>node.dataset.entityId===first.id);
    const target=kind==='draw'?svg.querySelector('[data-entity="harmony-bar"]'):kind==='resize'?group.querySelector('[data-action="resize-chord"]'):group;
    for(const [type,x] of [['pointerdown',from],['pointermove',to],['pointerup',to]]) svg.dispatch(type,{target,clientX:x,clientY:50});
  }};
}

test('Real commands reject Draw move and resize collisions and renderer snaps back without history',()=>{
  for(const kind of ['draw','move','resize']) {
    const s=guardedView(kind==='draw'?'draw':'select'),g=s.view.getGeometry();
    const before=s.commands.getSong(),history=s.commands.getState().history;
    const start=kind==='resize'?1440:0;
    s.gesture(kind,tickToX(start,g)+2,tickToX(start+1440,g)+2);
    assert.deepEqual(s.errors,['chord-conflict']);assert.deepEqual(s.commands.getSong(),before);assert.deepEqual(s.commands.getState().history,history);
    const rendered=s.svg.querySelectorAll('[data-entity="chord"]').find(node=>node.dataset.entityId===s.first.id);
    assert.equal(rendered.dataset.startTick,'0');assert.equal(rendered.dataset.durationTicks,'1440');
  }
});
test('Adjacent move resize and visible draw defaults succeed through real canonical commands',()=>{
  const s=guardedView(),g=s.view.getGeometry();
  s.gesture('move',tickToX(0,g)+2,tickToX(2880,g)+2);
  assert.equal(s.commands.getSong().chords.find(c=>c.id===s.first.id).startTick,2880);
  s.gesture('resize',tickToX(4320,g)-2,tickToX(5760,g)-2);
  assert.equal(s.commands.getSong().chords.find(c=>c.id===s.first.id).durationTicks,2880);
  s.commands.setTool('draw');s.gesture('draw',tickToX(5760,g)+2,tickToX(5760,g)+2);
  assert.equal(s.commands.getSong().chords.at(-1).rootPitchClass,5);
  s.setDraw({rootPitchClass:2,quality:'minor'});s.gesture('draw',tickToX(7200,g)+2,tickToX(7200,g)+2);
  assert.equal(s.commands.getSong().chords.at(-1).rootPitchClass,2);assert.equal(s.commands.getSong().chords.at(-1).quality,'minor');
  assert.deepEqual(s.errors,[]);
});

test('empty chord lane shows localized hint and keeps meter bar geometry above pitches',()=>{
  for (const language of ['id','en']) {
    const {svg,view}=setup({translate:key=>MESSAGES[language][key]??key}); const g=view.getGeometry();
    assert.ok(svg.querySelector('[data-entity="harmony-lane"]'));
    const hint=svg.querySelector('[data-entity="chord-lane-empty-hint"]');
    assert.ok(hint);
    assert.equal(hint.textContent,MESSAGES[language].harmonyLaneEmptyHint);
    assert.equal(Number(hint.getAttribute('y')),PIANO_RULER_HEIGHT+27);
    const bars=svg.querySelectorAll('[data-entity="harmony-bar"]');
    assert.equal(bars[0].dataset.endTick,'1440');
    assert.equal(Number(bars[1].children[0].getAttribute('x')),tickToX(1440,g));
    assert.equal(g.top,PIANO_RULER_HEIGHT + HARMONY_LANE_HEIGHT);
    assert.equal(Number(svg.querySelector('[data-entity="timeline-ruler"]').getAttribute('height')),PIANO_RULER_HEIGHT);
  }
  const populated=setup({chords:[chord()]});
  assert.equal(populated.svg.querySelector('[data-entity="chord-lane-empty-hint"]'),null);
});

test('chord geometry, zoom, locked and selected hooks remain aligned during scroll',()=>{
  for(const zoom of [1,2]) {
    const s=setup({chords:[chord('c',1440,2880,true)],zoom}); s.state.selectedChordId='c';s.view.render(s.song,s.state);
    const group=s.svg.querySelector('[data-entity="chord"]');const shape=group.querySelector('[data-chord-shape]');const g=s.view.getGeometry();
    assert.equal(Number(shape.getAttribute('x')),tickToX(1440,g));
    assert.equal(Number(shape.getAttribute('width')),2880*g.pixelsPerQuarter/g.ppq);
    assert.equal(group.dataset.locked,'true');assert.equal(group.getAttribute('aria-pressed'),'true');assert.equal(Number(shape.getAttribute('height')),40);
    s.scroll.scrollLeft=100;s.scroll.dispatch('scroll');
    assert.equal(Number(shape.getAttribute('x')),tickToX(1440,g));
    assert.ok(g.endTick>=4320);
  }
});

test('Select lane clicks choose chord or bar without drawing notes or chords',()=>{
  const s=setup({chords:[chord()]});const group=s.svg.querySelector('[data-entity="chord"]');
  s.dispatch('pointerdown',group,80);s.dispatch('pointerup',group,80);s.dispatch('click',group,80);
  assert.equal(s.state.selectedChordId,'c');
  const bar=s.svg.querySelectorAll('[data-entity="harmony-bar"]')[1];s.dispatch('click',bar,300);
  assert.deepEqual(s.state.harmonyRange,{startTick:1440,endTick:2880});
  assert.equal(s.song.chords.length,1);
});

test('Draw click creates one meter bar; drag creates snapped range with one mutation',()=>{
  for(const [numerator,denominator,barTicks] of [[6,8,1440],[4,4,1920]]) {
    const s=setup({tool:'draw',numerator,denominator});const g=s.view.getGeometry(); const bar=s.svg.querySelector('[data-entity="harmony-bar"]');const x=tickToX(0,g)+10;
    s.dispatch('pointerdown',bar,x);s.dispatch('pointerup',bar,x);
    assert.equal(s.song.chords[0].durationTicks,barTicks);assert.equal(s.calls.filter(call=>call[0]==='add').length,1);
  }
  const s=setup({tool:'draw'});const g=s.view.getGeometry();const bar=s.svg.querySelector('[data-entity="harmony-bar"]');
  s.dispatch('pointerdown',bar,tickToX(0,g)+1);s.dispatch('pointermove',bar,tickToX(2880,g));s.dispatch('pointerup',bar,tickToX(2880,g));
  assert.equal(s.song.chords[0].durationTicks,2880);assert.equal(s.calls.filter(call=>call[0]==='add').length,1);
});

test('selected body move and resize each commit once; locked and cancel never mutate',()=>{
  for(const kind of ['move','resize']) {
    const s=setup({chords:[chord()]});s.state.selectedChordId='c';s.view.render(s.song,s.state);const g=s.view.getGeometry();
    const group=s.svg.querySelector('[data-entity="chord"]');const target=kind==='resize'?group.querySelector('[data-action="resize-chord"]'):group;
    const x=tickToX(kind==='resize'?1440:0,g);
    s.dispatch('pointerdown',target,x);s.dispatch('pointermove',target,x+g.barTicks*g.pixelsPerQuarter/g.ppq);s.dispatch('pointerup',target,x+g.barTicks*g.pixelsPerQuarter/g.ppq);
    assert.equal(s.calls.filter(call=>call[0]==='update').length,1);assert.equal(s.song.chords[0][kind==='resize'?'durationTicks':'startTick'],kind==='resize'?2880:1440);
  }
  for(const locked of [false,true]) {
    const s=setup({chords:[chord('c',0,1440,locked)]});s.state.selectedChordId='c';const group=s.svg.querySelector('[data-entity="chord"]');
    s.dispatch('pointerdown',group,80);s.dispatch('pointermove',group,500);s.dispatch('pointercancel',group,500);
    assert.equal(s.calls.filter(call=>call[0]==='update').length,0);
  }
});

test('musical snap helpers support bar half-bar and beat while preserving integer bounds',()=>{
  const g=setup().view.getGeometry();
  assert.deepEqual(['bar','half-bar','beat'].map(snap=>chordSnapTicks(g,snap)),[1440,720,240]);
  assert.equal(chordGesturePatch(chord(),-10000,g,'move').startTick,0);
  assert.equal(chordGesturePatch(chord(),-10000,g,'resize','beat').durationTicks,240);
  assert.deepEqual(chordDrawRange(tickToX(1440,g),tickToX(0,g),g),{startTick:0,durationTicks:1440});
});

test('playback marks the active canonical chord and clears it after boundary or stop',()=>{
  const s=setup({chords:[chord('first'),chord('second',1440)]});
  s.view.updatePlayback({status:'playing',currentTick:1440,currentNoteId:null});
  const groups=s.svg.querySelectorAll('[data-entity="chord"]');
  assert.deepEqual(groups.map(group=>group.dataset.current),['false','true']);
  s.view.updatePlayback({status:'stopped',currentTick:1440,currentNoteId:null});
  assert.ok(groups.every(group=>group.dataset.current==='false'));
  assert.equal(groups[0].dataset.focusKey,'chord-first');
});

test('Enter and Space select focusable chords and empty bar context',()=>{
  const s=setup({chords:[chord()]});
  const group=s.svg.querySelector('[data-entity="chord"]');
  s.svg.dispatch('keydown',{target:group,key:'Enter'});
  assert.equal(s.state.selectedChordId,'c');
  const bar=s.svg.querySelectorAll('[data-entity="harmony-bar"]')[1];
  s.svg.dispatch('keydown',{target:bar,key:' '});
  assert.deepEqual(s.state.harmonyRange,{startTick:1440,endTick:2880});
});

test('locked chord has no resize handle and right click uses chord context callback',()=>{
  const s=setup({chords:[chord('locked',0,1440,true)]});s.state.selectedChordId='locked';s.view.render(s.song,s.state);
  const group=s.svg.querySelector('[data-entity="chord"]');
  assert.equal(group.querySelector('[data-action="resize-chord"]'),null);
  s.svg.dispatch('contextmenu',{target:group,clientX:120});
  assert.deepEqual(s.calls.at(-1),['context','locked',120]);
  assert.equal(s.state.selectedChordId,'locked');
});

test('pointer keyboard and draw completion focus the stable musical editor without scrolling',()=>{
  const selected=setup({chords:[chord()]});const group=selected.svg.querySelector('[data-entity="chord"]');
  selected.dispatch('pointerdown',group,80);
  assert.deepEqual(selected.scroll.focusOptions,{preventScroll:true});
  const before=selected.scroll.focusCount;
  selected.svg.dispatch('keydown',{target:group,key:'Enter'});
  assert.equal(selected.scroll.focusCount,before+1);
  const drawn=setup({tool:'draw'});const bar=drawn.svg.querySelector('[data-entity="harmony-bar"]');
  drawn.dispatch('pointerdown',bar,80);drawn.dispatch('pointerup',bar,80);
  assert.ok(drawn.scroll.focusCount>=2);
  assert.deepEqual(drawn.scroll.focusOptions,{preventScroll:true});
});
