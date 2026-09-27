import { MelodiError } from "../core/model.js";
import { planNoteEvents, tickAtAudioTime } from "./transport.js";

const LOOK_AHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;
const ACTIVATION_TIMEOUT_MS = 1500;

function fail(code) {
  throw new MelodiError(code);
}

export function createAudioPlayer({ getSong, onPosition = () => {}, onComplete = () => {}, onInterrupted = () => {}, onError = () => {}, audioContextFactory = null }) {
  let context = null;
  let masterGain = null;
  let timer = null;
  let playing = false;
  let generation = 0;
  let anchor = { audioTime: 0, tick: 0 };
  let tempo = 120;
  let loop = { enabled: false, startTick: 0, endTick: 1920 };
  let scheduled = new Map();
  const voices = new Map();
  let nextVoiceId = 0;

  function ensureContext() {
    if (context?.state === "closed") {
      context = null;
      masterGain = null;
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

  function clearTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  function cancelVoices() {
    if (!context) {
      voices.clear();
      return;
    }
    const now = context.currentTime;
    for (const voice of voices.values()) {
      if (voice.stopped) continue;
      voice.stopped = true;
      try {
        const parameter = voice.gain.gain;
        parameter.cancelScheduledValues(now);
        if (voice.startTime > now) {
          parameter.setValueAtTime(0, now);
          voice.oscillator.stop(now);
        } else {
          if (typeof parameter.cancelAndHoldAtTime === "function") parameter.cancelAndHoldAtTime(now);
          else parameter.setValueAtTime(Math.min(0.18, Math.max(0, parameter.value)), now);
          parameter.linearRampToValueAtTime(0, now + 0.01);
          voice.oscillator.stop(now + 0.012);
        }
      } catch {
        try { voice.oscillator.stop(); } catch {}
      }
    }
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
  }

  function scheduleVoice(event) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const duration = event.endTime - event.startTime;
    const attack = Math.min(0.012, duration * 0.2);
    const release = Math.min(0.035, duration * 0.25);
    const sustainAt = Math.max(event.startTime + attack, event.endTime - release);
    const note = event.note;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(440 * 2 ** ((note.pitch - 69) / 12), event.startTime);
    envelope.gain.setValueAtTime(0, event.startTime);
    envelope.gain.linearRampToValueAtTime(0.18, event.startTime + attack);
    envelope.gain.setValueAtTime(0.14, sustainAt);
    envelope.gain.linearRampToValueAtTime(0, event.endTime);
    oscillator.connect(envelope);
    envelope.connect(masterGain);

    const id = ++nextVoiceId;
    const voice = { oscillator, gain: envelope, startTime: event.startTime, stopped: false };
    voices.set(id, voice);
    oscillator.addEventListener("ended", () => {
      try { oscillator.disconnect(); } catch {}
      try { envelope.disconnect(); } catch {}
      voices.delete(id);
    }, { once: true });
    oscillator.start(event.startTime);
    oscillator.stop(event.endTime);
  }

  function currentCycle(tick) {
    if (!loop.enabled) return 0;
    return Math.max(0, Math.floor((tick - loop.startTick) / (loop.endTick - loop.startTick)));
  }

  function scheduleAhead(audioNow = context.currentTime) {
    const events = planNoteEvents(getSong(), {
      audioNow,
      anchorAudioTime: anchor.audioTime,
      anchorTick: anchor.tick,
      tempo,
      lookAheadSeconds: LOOK_AHEAD_SECONDS,
      loop,
      scheduledKeys: scheduled
    });
    for (const event of events) {
      try {
        scheduleVoice(event);
        scheduled.set(event.key, event.cycle);
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
      const song = getSong();
      const songEndTick = song.notes.reduce((end, note) => Math.max(end, note.startTick + note.durationTicks), 0);
      if (!loop.enabled && tick >= songEndTick) {
        halt(0);
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

  return Object.freeze({
    play,
    pause() { return halt(); },
    stop() { halt(0); return 0; },
    getPosition() { return positionAt(); },
    seek(tick, options) { reanchor(tick, options.tempo, options.loop, options.playing); },
    updateTempo(nextTempo, tick, shouldPlay) { reanchor(tick, nextTempo, loop, shouldPlay); },
    updateLoop(nextLoop, tick, shouldPlay) { reanchor(tick, tempo, nextLoop, shouldPlay); },
    songChanged(tick) { reanchor(tick, tempo, loop, playing); }
  });
}
