import { MelodiError, PPQ } from "../core/model.js?v=20261001.42";
import { planNoteEvents, planPercussionEvents, tickAtAudioTime, validateTempo, wrapLoopTick } from "./transport.js?v=20261001.42";
import { percussionVoiceSpec } from "./percussion.js?v=20261001.42";
import { instrumentGain, percussionChannelId } from "./mix.js?v=20261001.42";
import { planHarmonyEvents, planBassEvents } from "../harmony/sketch.js?v=20261001.42";

const LOOK_AHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;
const ACTIVATION_TIMEOUT_MS = 1500;

export function pitchBendAt(points, position) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  const p = Math.max(0, Math.min(1, Number(position) || 0));
  if (p <= points[0].position) return points[0].semitones;
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    const left = points[index - 1];
    if (p > right.position) continue;
    const span = right.position - left.position;
    if (span <= 0) return right.semitones;
    const ratio = (p - left.position) / span;
    return left.semitones + (right.semitones - left.semitones) * ratio;
  }
  return points.at(-1).semitones;
}

function progressTime(event, position) {
  const start = event.noteProgressStart ?? 0;
  const end = event.noteProgressEnd ?? 1;
  if (end <= start) return event.startTime;
  const ratio = (position - start) / (end - start);
  return event.startTime + Math.max(0, Math.min(1, ratio)) * (event.endTime - event.startTime);
}


function fail(code) {
  throw new MelodiError(code);
}

export function createAudioPlayer({ getSong, getMix = () => ({ channels: {} }), onPosition = () => {}, onComplete = () => {}, onInterrupted = () => {}, onError = () => {}, audioContextFactory = null }) {
  let context = null;
  let masterGain = null;
  let noiseBuffer = null;
  let timer = null;
  let playing = false;
  let generation = 0;
  let anchor = { audioTime: 0, tick: 0 };
  let tempo = 120;
  let loop = { enabled: false, startTick: 0, endTick: 1920 };
  let scheduled = new Map();
  const voices = new Map();
  const chokeVoices = new Map();
  let nextVoiceId = 0;
  let previewTimer = null;
  let previewGeneration = 0;
  let previewState = null;

  function ensureContext() {
    if (context?.state === "closed") {
      context = null;
      masterGain = null;
      noiseBuffer = null;
    }
    if (context) return context;

    try {
      if (typeof audioContextFactory === "function") context = audioContextFactory();
      else {
        const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        if (typeof Context !== "function") fail("audio-unavailable");
        context = new Context();
      }
      masterGain = context.createGain();
      masterGain.gain.value = 0.22;
      masterGain.connect(context.destination);
      context.addEventListener?.("statechange", onContextStateChange);
      return context;
    } catch {
      context = null;
      masterGain = null;
      fail("audio-unavailable");
    }
  }

  function positionAt(audioTime = context?.currentTime ?? anchor.audioTime) {
    return tickAtAudioTime(audioTime, anchor, tempo, loop);
  }

  function finishPreview(preview) {
    if (previewState?.id !== preview.id) return;
    if (previewTimer !== null) clearTimeout(previewTimer);
    previewTimer = null;
    previewState = null;
    try { preview.onEnded(); } catch {}
  }

  function schedulePreviewEnd(preview = previewState) {
    if (!preview || previewState?.id !== preview.id || !context) return;
    if (previewTimer !== null) clearTimeout(previewTimer);
    previewTimer = null;
    if (context.state !== "running") return;
    const remainingMs = (preview.endAudioTime - context.currentTime) * 1000;
    if (remainingMs <= 0) {
      finishPreview(preview);
      return;
    }
    previewTimer = setTimeout(() => {
      previewTimer = null;
      if (previewState?.id !== preview.id || !context || context.state !== "running") return;
      if (context.currentTime >= preview.endAudioTime) finishPreview(preview);
      else schedulePreviewEnd(preview);
    }, Math.max(10, Math.ceil(remainingMs)));
  }

  function clearTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    const sampleRate = context.sampleRate || 44100;
    const buffer = context.createBuffer(1, sampleRate * 2, sampleRate);
    const data = buffer.getChannelData(0);
    let state = 0x6d2b79f5;
    for (let index = 0; index < data.length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      data[index] = (state >>> 0) / 0x80000000 - 1;
    }
    noiseBuffer = buffer;
    return noiseBuffer;
  }

  function cancelVoices() {
    if (previewTimer !== null) clearTimeout(previewTimer);
    previewTimer = null;
    previewGeneration += 1;
    previewState = null;
    if (!context) {
      voices.clear();
      return;
    }
    const now = context.currentTime;
    for (const voice of voices.values()) {
      if (voice.stopped) continue;
      voice.stopped = true;
      for (const modulator of voice.modulators ?? []) {
        try { modulator.oscillator.stop(now); } catch {}
        try { modulator.oscillator.disconnect(); } catch {}
        try { modulator.gain.disconnect(); } catch {}
      }
      const oscillators = voice.sources ?? voice.oscillators ?? (voice.oscillator ? [voice.oscillator] : []);
      try {
        const parameter = voice.gain.gain;
        parameter.cancelScheduledValues(now);
        if (voice.startTime > now) {
          parameter.setValueAtTime(0, now);
          for (const oscillator of oscillators) oscillator.stop(now);
        } else {
          if (typeof parameter.cancelAndHoldAtTime === "function") parameter.cancelAndHoldAtTime(now);
          else parameter.setValueAtTime(Math.min(0.42, Math.max(0, parameter.value)), now);
          parameter.linearRampToValueAtTime(0, now + 0.01);
          for (const oscillator of oscillators) oscillator.stop(now + 0.012);
        }
      } catch {
        for (const oscillator of oscillators) {
          try { oscillator.stop(); } catch {}
        }
      }
    }
    chokeVoices.clear();
    scheduled.clear();
  }

  function halt(tick = positionAt()) {
    generation += 1;
    clearTimer();
    cancelVoices();
    playing = false;
    anchor = { audioTime: context?.currentTime ?? anchor.audioTime, tick };
    return tick;
  }

  function onContextStateChange() {
    if (playing && context && context.state !== "running") {
      const tick = positionAt();
      halt(tick);
      onInterrupted(tick);
    }
    if (previewState && context?.state === "closed") {
      const preview = previewState;
      cancelVoices();
      try { preview.onEnded(); } catch {}
    } else if (previewState && context?.state !== "running") {
      if (previewTimer !== null) clearTimeout(previewTimer);
      previewTimer = null;
    } else if (previewState) {
      schedulePreviewEnd();
    }
  }

  function scheduleVoice(event, channelGain = 1) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    const duration = event.endTime - event.startTime;
    const attack = Math.min(0.012, duration * 0.2);
    const release = Math.min(0.035, duration * 0.25);
    const sustainAt = Math.max(event.startTime + attack, event.endTime - release);
    const note = event.note;

    oscillator.type = "triangle";
    const baseFrequency = 440 * 2 ** ((note.pitch - 69) / 12);
    oscillator.frequency.setValueAtTime(baseFrequency, event.startTime);

    // Bend dijadwalkan di detune (cents), bukan frequency. Dengan begitu garis
    // lurus di model berarti interval pitch yang lurus, dan vibrato bisa ditambah
    // secara aditif tanpa menimpa automation bend.
    const progressStart = event.noteProgressStart ?? 0;
    const progressEnd = event.noteProgressEnd ?? 1;
    const bend = Array.isArray(note.pitchBend) && note.pitchBend.length > 1 ? note.pitchBend : null;
    if (oscillator.detune) {
      const initialDetune = pitchBendAt(bend, progressStart) * 100;
      oscillator.detune.setValueAtTime(initialDetune, event.startTime);
      if (bend) {
        let lastScheduledPosition = progressStart;
        for (const point of bend) {
          if (point.position <= progressStart || point.position > progressEnd) continue;
          oscillator.detune.linearRampToValueAtTime(
            point.semitones * 100,
            Math.min(event.endTime, progressTime(event, point.position))
          );
          lastScheduledPosition = point.position;
        }
        if (progressEnd > lastScheduledPosition + 1e-9) {
          oscillator.detune.linearRampToValueAtTime(
            pitchBendAt(bend, progressEnd) * 100,
            event.endTime
          );
        }
      }
    }

    const modulators = [];
    if (note.vibrato && oscillator.detune) {
      const startProgress = Math.max(progressStart, note.vibrato.delayPosition);
      if (startProgress < progressEnd) {
        const vibratoOscillator = context.createOscillator();
        const vibratoGain = context.createGain();
        const vibratoStart = progressTime(event, startProgress);
        vibratoOscillator.type = "sine";
        vibratoOscillator.frequency.setValueAtTime(note.vibrato.rateHz, vibratoStart);
        vibratoGain.gain.setValueAtTime(note.vibrato.depthSemitones * 100, vibratoStart);
        vibratoOscillator.connect(vibratoGain);
        vibratoGain.connect(oscillator.detune);
        vibratoOscillator.start(vibratoStart);
        vibratoOscillator.stop(event.endTime);
        modulators.push({ oscillator: vibratoOscillator, gain: vibratoGain });
      }
    }
    const noteVolume = (note.volume ?? 1) * channelGain;
    envelope.gain.setValueAtTime(0, event.startTime);
    envelope.gain.linearRampToValueAtTime(0.18 * noteVolume, event.startTime + attack);
    envelope.gain.setValueAtTime(0.14 * noteVolume, sustainAt);
    envelope.gain.linearRampToValueAtTime(0, event.endTime);
    oscillator.connect(envelope);
    if (panner) {
      const pan = Math.max(-1, Math.min(1, note.pan ?? 0));
      if (typeof panner.pan?.setValueAtTime === "function") panner.pan.setValueAtTime(pan, event.startTime);
      else if (panner.pan) panner.pan.value = pan;
      envelope.connect(panner);
      panner.connect(masterGain);
    } else {
      envelope.connect(masterGain);
    }

    const id = ++nextVoiceId;
    const voice = {
      oscillator,
      oscillators: [oscillator],
      gain: envelope,
      panner,
      modulators,
      startTime: event.startTime,
      endTime: event.endTime,
      stopped: false
    };
    voices.set(id, voice);
    oscillator.addEventListener("ended", () => {
      try { oscillator.disconnect(); } catch {}
      try { envelope.disconnect(); } catch {}
      try { panner?.disconnect(); } catch {}
      for (const modulator of modulators) {
        try { modulator.oscillator.disconnect(); } catch {}
        try { modulator.gain.disconnect(); } catch {}
      }
      voices.delete(id);
    }, { once: true });
    oscillator.start(event.startTime);
    oscillator.stop(event.endTime);
  }

  function scheduleSketchVoice(event, channelGain) {
    const bass = event.note.channel === "bass";
    const envelope = context.createGain();
    const sources = [];
    const componentGains = [];
    const duration = event.endTime - event.startTime;
    const attack = Math.min(bass ? 0.018 : 0.008, duration * 0.2);
    const release = Math.min(0.06, duration * 0.25);
    const peak = (bass ? 0.16 : 0.075) * channelGain;
    const sustainAt = Math.max(event.startTime + attack, event.endTime - release);
    envelope.gain.setValueAtTime(0, event.startTime);
    envelope.gain.linearRampToValueAtTime(peak, event.startTime + attack);
    envelope.gain.linearRampToValueAtTime(peak * (bass ? 0.75 : 0.45), sustainAt);
    envelope.gain.linearRampToValueAtTime(0, event.endTime);
    envelope.connect(masterGain);
    const frequency = 440 * 2 ** ((event.note.pitch - 69) / 12);
    const id = ++nextVoiceId;
    const voice = { sources, gain: envelope, startTime: event.startTime, endTime: event.endTime, stopped: false };
    voices.set(id, voice);
    let remaining = 2;
    for (const component of [{ type: "sine", ratio: 1, gain: 0.8 }, { type: "triangle", ratio: bass ? 1 : 2, gain: 0.2 }]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      sources.push(oscillator);
      componentGains.push(gain);
      oscillator.type = component.type;
      oscillator.frequency.setValueAtTime(frequency * component.ratio, event.startTime);
      gain.gain.setValueAtTime(component.gain, event.startTime);
      oscillator.connect(gain);
      gain.connect(envelope);
      oscillator.addEventListener("ended", () => {
        remaining -= 1;
        if (remaining !== 0) return;
        for (const source of sources) { try { source.disconnect(); } catch {} }
        for (const componentGain of componentGains) { try { componentGain.disconnect(); } catch {} }
        try { envelope.disconnect(); } catch {}
        voices.delete(id);
      }, { once: true });
      oscillator.start(event.startTime);
      oscillator.stop(event.endTime);
    }
  }

  function chokePercussionGroup(group, atTime) {
    if (!group) return;
    for (const id of chokeVoices.get(group) ?? []) {
      const voice = voices.get(id);
      if (!voice || voice.stopped || voice.endTime <= atTime || (voice.chokeStopTime ?? Infinity) <= atTime) continue;
      const stopAt = atTime + 0.012;
      voice.chokeStopTime = stopAt;
      try {
        const parameter = voice.gain.gain;
        if (typeof parameter.cancelAndHoldAtTime === "function") parameter.cancelAndHoldAtTime(atTime);
        else {
          parameter.cancelScheduledValues(atTime);
          parameter.setValueAtTime(Math.max(0, parameter.value), atTime);
        }
        parameter.linearRampToValueAtTime(0, atTime + 0.009);
      } catch {}
      for (const oscillator of voice.sources ?? voice.oscillators ?? []) {
        try { oscillator.stop(stopAt); } catch {}
      }
    }
  }

  function schedulePercussionVoice(event, channelGain = 1) {
    const spec = percussionVoiceSpec(event.track.kitId, event.hit);
    if (!spec.oscillators.length) return;

    chokePercussionGroup(spec.chokeGroup, event.startTime);

    const envelope = context.createGain();
    const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    const startTime = event.startTime;
    const endTime = startTime + spec.duration;
    const peak = 0.42 * spec.amplitude * spec.outputGain * channelGain;
    envelope.gain.setValueAtTime(0, startTime);
    envelope.gain.linearRampToValueAtTime(peak, startTime + Math.min(0.004, spec.duration * 0.08));
    envelope.gain.linearRampToValueAtTime(0, endTime);

    if (panner) {
      if (typeof panner.pan?.setValueAtTime === "function") panner.pan.setValueAtTime(spec.pan, startTime);
      else if (panner.pan) panner.pan.value = spec.pan;
      envelope.connect(panner);
      panner.connect(masterGain);
    } else {
      envelope.connect(masterGain);
    }

    const sources = [];
    const oscillators = [];
    const filters = [];
    const sourceGains = [];
    const id = ++nextVoiceId;
    const voice = {
      sources,
      oscillators,
      gain: envelope,
      panner,
      filters,
      sourceGains,
      modulators: [],
      startTime,
      endTime,
      chokeGroup: spec.chokeGroup,
      stopped: false
    };
    voices.set(id, voice);
    const disconnectVoice = () => {
      if (voice.cleaned) return;
      voice.cleaned = true;
      for (const source of sources) { try { source.disconnect(); } catch {} }
      for (const filter of filters) { try { filter.disconnect(); } catch {} }
      for (const sourceGain of sourceGains) { try { sourceGain.disconnect(); } catch {} }
      try { envelope.disconnect(); } catch {}
      try { panner?.disconnect(); } catch {}
      voices.delete(id);
      if (spec.chokeGroup) {
        const ids = chokeVoices.get(spec.chokeGroup);
        ids?.delete(id);
        if (ids?.size === 0) chokeVoices.delete(spec.chokeGroup);
      }
    };

    try {
      for (const component of spec.oscillators) {
        const oscillator = context.createOscillator();
        const sourceGain = context.createGain();
        sources.push(oscillator);
        oscillators.push(oscillator);
        sourceGains.push(sourceGain);
        oscillator.type = component.type;
        oscillator.frequency.setValueAtTime(component.frequency, startTime);
        if (component.endFrequency) oscillator.frequency.linearRampToValueAtTime(component.endFrequency, endTime);
        sourceGain.gain.setValueAtTime(component.gain, startTime);
        oscillator.connect(sourceGain);
        sourceGain.connect(envelope);
      }

      for (const component of spec.noise) {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const sourceGain = context.createGain();
        const noiseEnd = Math.min(endTime, startTime + component.duration);
        const noiseAttackEnd = Math.min(noiseEnd, startTime + component.attack);
        const noiseReleaseStart = Math.max(noiseAttackEnd, noiseEnd - component.release);
        sources.push(source);
        filters.push(filter);
        sourceGains.push(sourceGain);
        source.buffer = getNoiseBuffer();
        filter.type = component.filterType;
        filter.frequency.setValueAtTime(component.frequency, startTime);
        filter.Q.setValueAtTime(component.q, startTime);
        sourceGain.gain.setValueAtTime(0, startTime);
        sourceGain.gain.linearRampToValueAtTime(component.gain, noiseAttackEnd);
        sourceGain.gain.setValueAtTime(component.gain, noiseReleaseStart);
        sourceGain.gain.linearRampToValueAtTime(0, noiseEnd);
        source.connect(filter);
        filter.connect(sourceGain);
        sourceGain.connect(envelope);
      }

      if (sources.length === 0) {
        disconnectVoice();
        return;
      }
      if (spec.chokeGroup) {
        const ids = chokeVoices.get(spec.chokeGroup) ?? new Set();
        ids.add(id);
        chokeVoices.set(spec.chokeGroup, ids);
      }

      let remaining = sources.length;
      for (const source of sources) {
        source.addEventListener("ended", () => {
          remaining -= 1;
          if (remaining <= 0) disconnectVoice();
        }, { once: true });
      }
      for (const oscillator of oscillators) {
        oscillator.start(startTime);
        oscillator.stop(endTime);
      }
      for (let index = oscillators.length; index < sources.length; index += 1) {
        const source = sources[index];
        const component = spec.noise[index - oscillators.length];
        const noiseEnd = Math.min(endTime, startTime + component.duration);
        source.start(startTime);
        source.stop(noiseEnd);
      }
    } catch (error) {
      for (const source of sources) { try { source.stop(context.currentTime); } catch {} }
      disconnectVoice();
      throw error;
    }
  }

  function currentCycle(tick) {
    if (!loop.enabled) return 0;
    return Math.max(0, Math.floor((tick - loop.startTick) / (loop.endTick - loop.startTick)));
  }

  function scheduleAhead(audioNow = context.currentTime) {
    const song = getSong();
    const options = {
      audioNow,
      anchorAudioTime: anchor.audioTime,
      anchorTick: anchor.tick,
      tempo,
      lookAheadSeconds: LOOK_AHEAD_SECONDS,
      loop,
      scheduledKeys: scheduled
    };
    const noteEvents = planNoteEvents(song, options);
    const percussionEvents = planPercussionEvents(song, options);
    // Derived notes share transport clipping, rehydration, cycle keys and clock
    // with melody; they never enter canonical Song.notes.
    const sketchEvents = planNoteEvents({ notes: [...planHarmonyEvents(song), ...planBassEvents(song)] }, {
      ...options,
      scheduledKeys: { has: (key) => scheduled.has(`sketch:${key}`) }
    });
    const mix = getMix();

    for (const event of noteEvents) {
      const gain = instrumentGain(mix, "melody");
      if (gain === 0) continue;
      try {
        scheduleVoice(event, gain);
        scheduled.set(event.key, event.cycle);
      } catch {
        fail("audio-scheduling-failed");
      }
    }
    for (const event of percussionEvents) {
      const gain = instrumentGain(mix, percussionChannelId(event.track.id, event.hit.pieceId));
      if (gain === 0) continue;
      try {
        schedulePercussionVoice(event, gain);
        scheduled.set(event.key, event.cycle);
      } catch {
        fail("audio-scheduling-failed");
      }
    }
    for (const event of sketchEvents) {
      const gain = instrumentGain(mix, event.note.channel);
      if (gain === 0) continue;
      try {
        scheduleSketchVoice(event, gain);
        scheduled.set(`sketch:${event.key}`, event.cycle);
      } catch {
        fail("audio-scheduling-failed");
      }
    }
  }

  function wake() {
    if (!playing || !context || context.state !== "running") return;
    try {
      const now = context.currentTime;
      const tick = positionAt(now);
      if (!loop.enabled && tick >= loop.endTick) {
        halt(loop.startTick);
        onComplete();
        return;
      }
      const cycle = currentCycle(anchor.tick + Math.max(0, now - anchor.audioTime) * tempo * 480 / 60);
      for (const [key, eventCycle] of scheduled) {
        if (loop.enabled && eventCycle < cycle - 1) scheduled.delete(key);
      }
      scheduleAhead(now);
      onPosition(tick);
    } catch (error) {
      const tick = positionAt();
      halt(tick);
      onError(error);
    }
  }

  function reanchor(tick, nextTempo = tempo, nextLoop = loop, shouldPlay = playing) {
    generation += 1;
    clearTimer();
    cancelVoices();
    tempo = nextTempo;
    loop = { enabled: nextLoop.enabled, startTick: nextLoop.startTick, endTick: nextLoop.endTick };
    playing = Boolean(shouldPlay && context?.state === "running");
    anchor = { audioTime: context?.currentTime ?? anchor.audioTime, tick };
    if (playing) {
      try {
        scheduleAhead(anchor.audioTime);
        timer = setInterval(wake, SCHEDULER_INTERVAL_MS);
      } catch (error) {
        halt(tick);
        onError(error);
      }
    }
  }

  async function play(tick, options) {
    if (playing) return true;
    const token = ++generation;
    tempo = options.tempo;
    loop = { enabled: options.loop.enabled, startTick: options.loop.startTick, endTick: options.loop.endTick };
    const audioContext = ensureContext();

    if (audioContext.state !== "running") {
      if (globalThis.navigator?.userActivation && !globalThis.navigator.userActivation.isActive) {
        fail("audio-activation-required");
      }
      let timeoutId;
      try {
        await Promise.race([
          audioContext.resume(),
          new Promise((_resolve, reject) => {
            timeoutId = setTimeout(() => reject(new MelodiError("audio-activation-required")), ACTIVATION_TIMEOUT_MS);
          })
        ]);
      } catch (error) {
        if (error?.code) throw error;
        fail("audio-activation-required");
      } finally {
        clearTimeout(timeoutId);
      }
    }
    if (token !== generation) return false;
    if (audioContext.state !== "running") fail("audio-activation-required");

    clearTimer();
    cancelVoices();
    anchor = { audioTime: audioContext.currentTime, tick };
    playing = true;
    try {
      scheduleAhead(anchor.audioTime);
    } catch (error) {
      halt(tick);
      throw error;
    }
    timer = setInterval(wake, SCHEDULER_INTERVAL_MS);
    return true;
  }

  async function playPreview(notes, { tempo = 120, onEnded = () => {} } = {}) {
    if (playing) fail("audio-preview-transport-playing");
    validateTempo(tempo);
    if (!Array.isArray(notes) || notes.length === 0 || notes.length > 16) fail("invalid-audio-preview");
    for (const note of notes) {
      if (!Number.isInteger(note?.pitch) || note.pitch < 0 || note.pitch > 127
        || !Number.isSafeInteger(note.startTick) || note.startTick < 0
        || !Number.isSafeInteger(note.durationTicks) || note.durationTicks <= 0) fail("invalid-audio-preview");
    }

    const token = ++generation;
    cancelVoices();
    const audioContext = ensureContext();
    if (audioContext.state !== "running") {
      if (globalThis.navigator?.userActivation && !globalThis.navigator.userActivation.isActive) {
        fail("audio-activation-required");
      }
      let timeoutId;
      try {
        await Promise.race([
          audioContext.resume(),
          new Promise((_resolve, reject) => {
            timeoutId = setTimeout(() => reject(new MelodiError("audio-activation-required")), ACTIVATION_TIMEOUT_MS);
          })
        ]);
      } catch (error) {
        if (error?.code) throw error;
        fail("audio-activation-required");
      } finally {
        clearTimeout(timeoutId);
      }
    }
    if (token !== generation) return false;
    if (audioContext.state !== "running") fail("audio-activation-required");

    clearTimer();
    const previewId = ++previewGeneration;
    const ordered = [...notes].sort((left, right) => left.startTick - right.startTick
      || (String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0));
    const baseTick = ordered[0].startTick;
    const firstAudioTime = audioContext.currentTime + 0.04;
    const secondsPerTick = 60 / (PPQ * tempo);
    try {
      for (const note of ordered) {
        const startTime = firstAudioTime + (note.startTick - baseTick) * secondsPerTick;
        const endTime = startTime + note.durationTicks * secondsPerTick;
        scheduleVoice({ note, startTime, endTime });
      }
    } catch {
      cancelVoices();
      fail("audio-scheduling-failed");
    }
    const last = ordered.at(-1);
    const endAudioTime = firstAudioTime + (last.startTick + last.durationTicks - baseTick) * secondsPerTick + 0.12;
    previewState = { id: previewId, endAudioTime, onEnded };
    schedulePreviewEnd(previewState);
    return true;
  }

  return Object.freeze({
    play,
    pause() { return halt(); },
    stop() { halt(0); return 0; },
    getPosition() { return positionAt(); },
    seek(tick, options) { reanchor(tick, options.tempo, options.loop, options.playing); },
    updateTempo(nextTempo, tick, shouldPlay) { reanchor(tick, nextTempo, loop, shouldPlay); },
    updateLoop(nextLoop, tick, shouldPlay) { reanchor(tick, tempo, nextLoop, shouldPlay); },
    songChanged(tick, nextLoop = loop) { reanchor(wrapLoopTick(tick, nextLoop), tempo, nextLoop, playing); },
    mixChanged(tick, nextLoop = loop) { reanchor(wrapLoopTick(tick, nextLoop), tempo, nextLoop, playing); },
    playPreview,
    cancelPreview() {
      if (playing) return false;
      generation += 1;
      clearTimer();
      cancelVoices();
      return true;
    }
  });
}
