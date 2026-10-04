import { harmonyChordSymbol, harmonyContextRange } from './harmony.js?v=20261003.82';

export function createProgressionWorkspace(commands, language, onError) {
  const host = document.getElementById('progression-workspace');
  let selected = 0, menu = null;
  const copy = (id,en) => language() === 'id' ? id : en;
  const button = (text,key,action) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text;
    node.dataset.progressionFocus = key; node.addEventListener('click',action); return node;
  };
  const invoke = action => { try { action(); } catch(error) { onError(error); } };
  function closeMenu(restore = false) {
    const trigger = menu?._trigger; menu?.remove(); menu = null;
    if (restore && trigger?.isConnected) trigger.focus({preventScroll:true});
  }
  document.addEventListener('pointerdown',event => { if (menu && !menu.contains(event.target)) closeMenu(); });
  function openMenu(trigger,index) {
    closeMenu(); selected = index;
    const preview = commands.getHarmonyProgression(), chord = preview?.chords[index];
    if (!chord || preview.status !== 'ready') return;
    menu = document.createElement('div'); menu.className = 'note-context-menu progression-context-menu';
    menu.setAttribute('role','menu'); menu.setAttribute('aria-label',copy('Ganti chord','Replace chord')); menu._trigger = trigger;
    const title = document.createElement('strong'); title.className = 'progression-menu-title';
    title.textContent = `${harmonyChordSymbol(chord,commands.getSong().key)} · ${copy('Birama','Bar')} ${Math.floor(chord.startTick/preview.barTicks)+1}`; menu.append(title);
    const addChoice = (rootPitchClass,quality,label) => {
      const item = button(label,`choice-${rootPitchClass}-${quality}`,() => {
        closeMenu(); invoke(() => commands.chooseHarmonyProgressionChord(index,rootPitchClass,quality));
        document.querySelector(`[data-progression-index="${index}"]`)?.focus({preventScroll:true});
      });
      item.setAttribute('role','menuitemradio'); item.setAttribute('aria-checked',String(chord.rootPitchClass === rootPitchClass && chord.quality === quality)); menu.append(item);
    };
    for (const alternative of chord.alternatives ?? []) addChoice(alternative.rootPitchClass,alternative.quality,harmonyChordSymbol(alternative,commands.getSong().key));
    const divider = document.createElement('div'); divider.className = 'context-separator'; divider.setAttribute('role','separator'); menu.append(divider);
    for (const [quality,id,en] of [['major','Mayor','Major'],['minor','Minor','Minor'],['diminished','Diminished','Diminished'],['augmented','Augmented','Augmented']]) {
      addChoice(chord.rootPitchClass,quality,`${harmonyChordSymbol({rootPitchClass:chord.rootPitchClass,quality},commands.getSong().key)} · ${copy(id,en)}`);
    }
    menu.addEventListener('keydown',event => {
      const items = [...menu.querySelectorAll('button')], current = items.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(true); }
      else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1 : (current+(event.key === 'ArrowDown' ? 1 : -1)+items.length)%items.length].focus();
      } else if (event.key === 'Tab') closeMenu();
    });
    document.body.append(menu);
    const bounds = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(8,Math.min(bounds.left,innerWidth-menu.offsetWidth-8))}px`;
    menu.style.top = `${Math.max(8,Math.min(bounds.bottom+4,innerHeight-menu.offsetHeight-8))}px`;
    menu.querySelector('button')?.focus();
  }
  function renderTimeline(svgRoot,geometry) {
    svgRoot.querySelector('[data-entity="progression-preview"]')?.remove();
    const preview = commands.getHarmonyProgression();
    if (!preview || preview.status !== 'ready') return;
    // Sembunyikan chord yang akan diganti; chord terkunci tetap terlihat di lane yang sama.
    for (const node of svgRoot.querySelectorAll('[data-entity="chord"]')) {
      const start = Number(node.dataset.startTick), end = start+Number(node.dataset.durationTicks);
      if (node.dataset.locked !== 'true' && start < preview.endTick && end > preview.startTick) {
        node.style.opacity = '.15'; node.style.pointerEvents = 'none'; node.setAttribute('tabindex','-1');
      }
    }
    const song = commands.getSong();
    const ns = 'http://www.w3.org/2000/svg';
    const make = (tag,attributes,parent,text) => { const node = document.createElementNS(ns,tag); for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,String(value)); if (text) node.textContent = text; parent.append(node); return node; };
    const layer = make('g',{'data-entity':'progression-preview','aria-label':copy('Preview progresi','Progression preview')},svgRoot);
    preview.chords.forEach((chord,index) => {
      const end = chord.startTick+chord.durationTicks;
      if (end <= geometry.startTick || chord.startTick >= geometry.endTick) return;
      const start = Math.max(chord.startTick,geometry.startTick), stop = Math.min(end,geometry.endTick);
      const x = geometry.labelWidth+(start-geometry.startTick)*geometry.pixelsPerQuarter/geometry.ppq;
      const width = (stop-start)*geometry.pixelsPerQuarter/geometry.ppq;
      const symbol = harmonyChordSymbol(chord,song.key);
      const group = make('g',{'data-progression-index':index,'data-progression-focus':`preview-${index}`,role:'button',tabindex:0,'aria-haspopup':'menu','aria-label':`${copy('Preview','Preview')} ${symbol} · ${Math.floor(start/preview.barTicks)+1}`,class:'progression-timeline-block'},layer);
      make('rect',{x,y:36,width:Math.max(1,width-1),height:40,rx:3},group);
      const label = make('svg',{x:x+7,y:36,width:Math.max(0,width-14),height:40,overflow:'hidden','pointer-events':'none'},group);
      make('text',{x:0,y:25},label,`${symbol} ···`);
      make('title',{},group,copy('Preview — klik untuk mengganti chord','Preview — click to replace chord'));
      group.addEventListener('pointerdown',event => event.stopPropagation());
      group.addEventListener('click',event => { event.stopPropagation(); openMenu(group,index); });
      group.addEventListener('contextmenu',event => { event.preventDefault(); event.stopPropagation(); openMenu(group,index); });
      group.addEventListener('keydown',event => {
        if (['Enter',' ','ContextMenu'].includes(event.key) || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); event.stopPropagation(); openMenu(group,index); }
      });
    });
  }
  function render() {
    closeMenu();
    const focus = document.activeElement?.dataset.progressionFocus;
    const presetValue = host.querySelector('[name=preset]')?.value ?? 'pop';
    const scopeValue = host.querySelector('[name=scope]')?.value ?? 'song';
    const preview = commands.getHarmonyProgression(); host.replaceChildren();
    const preset = document.createElement('select'); preset.name = 'preset'; preset.dataset.progressionFocus = 'preset'; preset.setAttribute('aria-label',copy('Gaya progresi','Progression style'));
    for (const [value,text] of [['pop','Pop'],['jazz','Jazz · ii–V–I'],['ballad','Ballad'],['fifths','Circle of Fifths']]) { const option = document.createElement('option'); option.value=value; option.textContent=text; preset.append(option); } preset.value=presetValue;
    const scope = document.createElement('select'); scope.name='scope'; scope.dataset.progressionFocus='scope'; scope.setAttribute('aria-label',copy('Bagian lagu','Song region'));
    for (const [value,text] of [['song',copy('Seluruh lagu','Whole song')],['selection',copy('Pilihan','Selection')]]) { const option=document.createElement('option'); option.value=value; option.textContent=text; scope.append(option); } scope.value=scopeValue;
    const generate = button(copy(preview ? 'Buat ulang' : 'Progresi',preview ? 'Regenerate' : 'Progression'),'generate',() => invoke(() => { selected=0; const range=scope.value === 'selection' ? harmonyContextRange(commands.getSong(),commands.getState()) : {}; commands.generateHarmonyProgression({preset:preset.value,...range}); }));
    host.append(preset,scope,generate);
    const help = document.createElement('details'); help.className='progression-help'; const summary=document.createElement('summary'); summary.textContent='?'; summary.setAttribute('aria-label',copy('Bantuan progresi','Progression help')); const text=document.createElement('p'); text.textContent=copy('Preview berada di lane chord. Klik blok untuk mengganti. Terapkan mengganti chord yang tidak terkunci dalam satu undo. Jazz menggunakan triad ii–V–I.','Preview appears in the chord lane. Click a block to replace it. Apply replaces unlocked chords in one undo. Jazz uses ii–V–I triads.'); help.append(summary,text); host.append(help);
    if (preview) {
      const status=document.createElement('span'); status.className='progression-status'; status.setAttribute('role','status'); status.textContent=preview.status==='stale' ? copy('Lagu berubah — buat ulang','Song changed — regenerate') : `${copy('Preview','Preview')} · ${preview.chords.length}`; host.append(status);
      const apply=button(copy('Terapkan','Apply'),'apply',() => invoke(() => commands.applyHarmonyProgression())); apply.disabled=preview.status!=='ready'||!preview.chords.length;
      const cancel=button('×','cancel',() => invoke(() => commands.clearHarmonyProgression())); cancel.className='secondary'; cancel.setAttribute('aria-label',copy('Batalkan preview','Discard preview')); host.append(apply,cancel);
    }
    if (focus) (host.querySelector(`[data-progression-focus="${focus}"]`) ?? generate).focus({preventScroll:true});
  }
  return {render,renderTimeline};
}
