import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCanvasNavigation, boundedCanvasZoom } from '../src/ui/canvas-navigation.js';

function fixture() {
  const handlers = new Map(), timers = new Map(), calls = [];
  let zoom = 1, timerId = 0;
  const surface = {
    addEventListener: (name, handler) => handlers.set(name, handler),
    removeEventListener: name => handlers.delete(name),
    setPointerCapture: id => calls.push(['capture',id])
  };
  const scroll = { scrollLeft:100, scrollTop:100, getBoundingClientRect:()=>({left:0}),
    addEventListener:(name,handler)=>handlers.set(name,handler), removeEventListener:name=>handlers.delete(name) };
  const binding = bindCanvasNavigation(surface,scroll,{
    getZoom:()=>zoom,setZoom:value=>{ zoom=value; calls.push(['zoom',value]); },
    cancelEdit:event=>calls.push(['cancel',event.pointerId]),
    longPress:()=>()=>calls.push(['menu']),
    schedule:callback=>{ const id=++timerId; timers.set(id,callback); return id; },
    unschedule:id=>timers.delete(id)
  });
  function send(name,id,x=100,y=100,extra={}) {
    const event = { pointerType:'touch',pointerId:id,clientX:x,clientY:y,
      target:{closest:()=>null},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra };
    handlers.get(name)?.(event);
    return event;
  }
  return { send,calls,scroll,timers,binding,zoom:()=>zoom,
    flush(){const pending=[...timers.values()];timers.clear();pending.forEach(callback=>callback());} };
}

test('second finger cancels editing before pinch and suppresses commit/click until release',()=>{
  const f=fixture();
  assert.equal(f.send('pointerdown',1,100).stopped,undefined);
  assert.equal(f.send('pointerdown',2,200).stopped,true);
  assert.deepEqual(f.calls.slice(0,2),[['cancel',1],['cancel',2]]);
  f.send('pointermove',2,300);
  assert.equal(f.zoom(),2);
  assert.equal(f.scroll.scrollLeft,300);
  assert.equal(f.send('pointerup',1).stopped,true);
  assert.equal(f.send('pointerup',2).stopped,true);
  assert.equal(f.send('click',2).stopped,true);
  f.flush();
  assert.equal(f.send('click',2).stopped,undefined);
});

test('two-finger pan moves viewport without adding musical edits',()=>{
  const f=fixture();f.send('pointerdown',1,100,100);f.send('pointerdown',2,200,100);
  f.send('pointermove',1,120,120);f.send('pointermove',2,220,120);
  assert.equal(f.zoom(),1);assert.equal(f.scroll.scrollLeft,80);assert.equal(f.scroll.scrollTop,80);
  assert.equal(f.calls.filter(call=>call[0]==='cancel').length,2);
});

test('hold cancels pending edit and captures release before opening menu',()=>{
  const f=fixture();f.send('pointerdown',1);f.flush();
  assert.deepEqual(f.calls,[['cancel',1],['capture',1],['menu']]);
  assert.equal(f.send('pointerup',1).stopped,true);
});

test('movement, scrolling and another finger cancel the hold',()=>{
  for(const action of ['move','scroll','second']) {
    const f=fixture();f.send('pointerdown',1);
    if(action==='move')f.send('pointermove',1,110);
    if(action==='scroll')f.send('scroll',1);
    if(action==='second')f.send('pointerdown',2,200);
    f.flush();assert.equal(f.calls.some(call=>call[0]==='menu'),false);
  }
});

test('ordinary wheel stays native; Ctrl-wheel zoom is bounded and cancels pending edit',()=>{
  const f=fixture();assert.equal(f.send('wheel',1,100,100,{deltaY:100}).stopped,undefined);
  f.send('pointerdown',1);
  assert.equal(f.send('wheel',1,100,100,{deltaY:-10000,ctrlKey:true}).stopped,true);
  assert.equal(f.zoom(),4);assert.equal(f.calls[0][0],'cancel');
  assert.equal(boundedCanvasZoom(0.01),0.5);
  f.binding.destroy();assert.equal(f.timers.size,0);
});

test('Ctrl-wheel also cancels an in-progress mouse edit before changing geometry',()=>{
  const f=fixture();f.send('pointerdown',9,100,100,{pointerType:'mouse'});
  f.send('wheel',9,100,100,{deltaY:-100,ctrlKey:true});
  assert.deepEqual(f.calls[0],['cancel',9]);
  assert.equal(f.calls[1][0],'zoom');
});
