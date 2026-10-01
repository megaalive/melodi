export function boundedCanvasZoom(value, minimum = 0.5) {
  return Math.min(4, Math.max(minimum, Number(value.toFixed(3))));
}

export function bindCanvasNavigation(surface, scroll, {
  getZoom, setZoom, cancelEdit, contentInset = () => 0, longPress = () => null, minimumZoom = 0.5,
  schedule = setTimeout, unschedule = clearTimeout
}) {
  const pointers = new Map();
  const listeners = [];
  let gesture = null;
  let blocked = false;
  let holdTimer = null;
  let releaseTimer = null;
  let activePointer = null;
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const clearHold = () => { if (holdTimer !== null) unschedule(holdTimer); holdTimer = null; };
  const pair = () => {
    const [a,b] = [...pointers.values()];
    return { x:(a.x+b.x)/2, y:(a.y+b.y)/2, distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)) };
  };
  const cancelPointers = () => { for (const pointer of pointers.values()) cancelEdit(pointer.event); };
  const capturePointers = () => {
    for (const id of pointers.keys()) try { surface.setPointerCapture?.(id); } catch {}
  };
  function down(event) {
    activePointer = event;
    if (event.pointerType !== 'touch' || event.target.closest?.('input, select, textarea, .drum-row-mix-button')) return;
    unschedule(releaseTimer); releaseTimer = null;
    pointers.set(event.pointerId,{ x:event.clientX,y:event.clientY,event });
    if (pointers.size === 1 && !blocked) {
      const show = longPress(event);
      if (show) holdTimer = schedule(() => {
        holdTimer = null; cancelPointers(); capturePointers(); blocked = true; show();
      },550);
      return;
    }
    clearHold(); cancelPointers(); blocked = true;
    capturePointers();
    gesture = null;
    if (pointers.size === 2) {
      const start = pair(), bounds = scroll.getBoundingClientRect();
      gesture = { ...start, zoom:getZoom(), left:scroll.scrollLeft, top:scroll.scrollTop,
        localX:start.x-bounds.left, inset:contentInset() };
    }
    stop(event);
  }
  function move(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    if (Math.hypot(event.clientX-pointer.event.clientX,event.clientY-pointer.event.clientY) > 8) clearHold();
    pointer.x = event.clientX; pointer.y = event.clientY;
    if (!blocked) return;
    stop(event);
    if (!gesture || pointers.size !== 2) return;
    const current = pair();
    const zoom = boundedCanvasZoom(gesture.zoom * current.distance / gesture.distance, minimumZoom);
    if (zoom !== getZoom()) setZoom(zoom);
    const scale = zoom / gesture.zoom;
    scroll.scrollLeft = Math.max(0,(gesture.left+gesture.localX-gesture.inset)*scale
      +gesture.inset-gesture.localX-(current.x-gesture.x));
    scroll.scrollTop = Math.max(0,gesture.top-(current.y-gesture.y));
  }
  function up(event) {
    if (activePointer?.pointerId === event.pointerId) activePointer = null;
    if (!pointers.has(event.pointerId)) return;
    clearHold();
    if (blocked) stop(event);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) gesture = null;
    if (!pointers.size && blocked) releaseTimer = schedule(() => { blocked = false; releaseTimer = null; },400);
  }
  function click(event) { if (blocked) stop(event); }
  function wheel(event) {
    if (!event.ctrlKey || !Number.isFinite(event.deltaY)) return;
    stop(event); clearHold(); cancelPointers();
    if (activePointer && activePointer.pointerType !== 'touch') cancelEdit(activePointer);
    if (pointers.size) blocked = true;
    const before = getZoom(), next = boundedCanvasZoom(before * Math.exp(-event.deltaY * 0.002), minimumZoom);
    const x = event.clientX-scroll.getBoundingClientRect().left, inset = contentInset();
    const anchor = scroll.scrollLeft+x-inset;
    setZoom(next);
    scroll.scrollLeft = Math.max(0,anchor*next/before+inset-x);
  }
  for (const [name,handler] of [['pointerdown',down],['pointermove',move],['pointerup',up],
    ['pointercancel',up],['click',click],['wheel',wheel]]) {
    surface.addEventListener(name,handler,{capture:true,passive:false}); listeners.push([name,handler]);
  }
  scroll.addEventListener('scroll',clearHold,{passive:true});
  return { destroy() {
    clearHold(); unschedule(releaseTimer);
    for (const [name,handler] of listeners) surface.removeEventListener(name,handler,true);
    scroll.removeEventListener('scroll',clearHold);
  } };
}
