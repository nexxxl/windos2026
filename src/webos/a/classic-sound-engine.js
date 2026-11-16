// Local procedural reference synth for NexlOS Windos2026. The user-supplied
// recipes inform these timbres; this is not a sample-identical historical
// recording. No audio files, network requests or object URLs are created.
const PREF_KEY = 'nexlos.window2026.sound.v1';
const DEFAULTS = { enabled: true, volume: .22 };
export const CLASSIC_SOUND_DURATIONS = Object.freeze({
  startup: 7, ding: .85, chord: .95, chimes: 1.5, tada: 2.4,
  logoff: 3.8, exclamation: .9, recycle: .7, click: .12,
});
export const CLASSIC_SOUND_NAMES = Object.freeze(Object.keys(CLASSIC_SOUND_DURATIONS));
const MAX_VOICES = 4;
// 统一增益：原来 master 只取 volume 的 60%，默认音量 0.22 时峰值约 -34 dBFS，
// 笔记本扬声器上几乎听不见。乘上 LOUDNESS 后落到 -16 dBFS 附近，再由 limiter 兜底。
const LOUDNESS = 2.4;
// WAV export is an explicit, cancellable background operation. On an
// oversubscribed machine even a native 7-second / 54-sine baseline took 57s;
// a 15s wall-clock deadline incorrectly rejected valid offline renders.
const OFFLINE_RENDER_TIMEOUT_MS = 180000;
let fallbackPreferences = Object.assign({}, DEFAULTS);
let preferenceWindow = null;
let live = null;
let epoch = 0;
let offlineJob = null;
let voiceId = 0;
const lastPlayed = new Map();

function classicVisible() {
  return typeof document !== 'undefined' && document.documentElement.dataset.appearance === 'win98' && document.visibilityState !== 'hidden';
}
function validName(name) { return typeof name === 'string' && Object.prototype.hasOwnProperty.call(CLASSIC_SOUND_DURATIONS, name); }
function notifyPreferences(prefs) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nexlos.classic-sound-preferences', { detail: Object.assign({}, prefs) }));
  }
}
function watchStorage() {
  if (typeof window === 'undefined' || preferenceWindow === window || typeof window.addEventListener !== 'function') return;
  preferenceWindow = window;
  window.addEventListener('storage', event => {
    if (event.key !== PREF_KEY && event.key !== null) return;
    const prefs = getClassicSoundPreferences();
    if (!prefs.enabled || !prefs.volume) stopClassicSounds();
    notifyPreferences(prefs);
  });
}
export function getClassicSoundPreferences() {
  watchStorage();
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
    if (raw && typeof raw.enabled === 'boolean' && Number.isFinite(raw.volume) && raw.volume >= 0 && raw.volume <= 1) {
      fallbackPreferences = { enabled: raw.enabled, volume: raw.volume };
    }
  } catch (e) { /* Memory fallback also works when storage is unavailable. */ }
  return Object.assign({}, fallbackPreferences);
}
export function setClassicSoundPreferences(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Invalid sound preferences');
  if ('enabled' in patch && typeof patch.enabled !== 'boolean') throw new TypeError('enabled must be boolean');
  if ('volume' in patch && (!Number.isFinite(patch.volume) || patch.volume < 0 || patch.volume > 1)) throw new RangeError('volume must be between 0 and 1');
  const previous = getClassicSoundPreferences();
  const prefs = {
    enabled: 'enabled' in patch ? patch.enabled : previous.enabled,
    volume: 'volume' in patch ? patch.volume : previous.volume,
  };
  fallbackPreferences = prefs;
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* Keep the local preference for this document. */ }
  if (!prefs.enabled || !prefs.volume) stopClassicSounds();
  else if (live && !live.closing) {
    const now = live.context.currentTime;
    for (const voice of live.voices.values()) {
      const gain = voice.graph.master.gain;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(prefs.volume * LOUDNESS, now, .025);
      if (voice.endsAt > now + .15) gain.setValueAtTime(prefs.volume * LOUDNESS, voice.endsAt - .15);
      gain.linearRampToValueAtTime(0, Math.max(now + .005, voice.endsAt));
    }
  }
  notifyPreferences(prefs);
  return Object.assign({}, prefs);
}

function abortError(message = 'Sound operation cancelled') {
  const error = new Error(message); error.name = 'AbortError'; return error;
}
function stopGraph(graph) {
  for (const source of graph.sources) { try { source.stop(); } catch (e) { /* Already ended. */ } }
  for (const node of graph.nodes) { try { node.disconnect(); } catch (e) { /* Context may already be closed. */ } }
}
function clearVoices(record) {
  for (const voice of record.voices.values()) { clearTimeout(voice.timer); stopGraph(voice.graph); }
  record.voices.clear();
}
function closeLive(record) {
  if (!record || record.closing) return record && record.closing;
  if (record.cancelResume) record.cancelResume();
  clearVoices(record);
  // Retain the slot until close resolves: even a slow audio driver cannot
  // cause a second live AudioContext to accumulate behind it.
  record.closing = Promise.resolve().then(() => record.context.close()).then(() => {
    if (live === record) live = null;
  }).catch(() => {
    if (record.context.state === 'closed' && live === record) live = null;
  });
  return record.closing;
}
export function stopClassicSounds() { epoch += 1; lastPlayed.clear(); if (live) closeLive(live); }

function waitBounded(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Audio device timeout')), ms); })]).finally(() => clearTimeout(timer));
}
async function ensureLive() {
  if (live && live.closing) {
    try { await waitBounded(live.closing, 1200); } catch (e) { return null; }
    if (live) return null;
  }
  if (live) return live.opening;
  const Audio = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Audio) return null;
  let context;
  try { context = new Audio(); } catch (e) { return null; }
  const record = { context, voices: new Map(), opening: null, closing: null, cancelResume: null };
  live = record;
  record.opening = (async () => {
    let timer;
    try {
      if (context.state !== 'running') {
        // Start resume synchronously in the gesture's call stack. Both driver
        // hangs and explicit cancellation settle this bounded operation.
        const resumed = context.resume();
        await Promise.race([resumed, new Promise((resolve, reject) => {
          record.cancelResume = () => reject(abortError());
          timer = setTimeout(() => reject(new Error('Audio device timeout')), 1200);
        })]);
      }
      return record.closing || context.state === 'closed' ? null : record;
    } catch (e) { closeLive(record); return null; }
    finally { clearTimeout(timer); record.cancelResume = null; }
  })();
  return record.opening;
}

function seededNoise(seed) {
  let value = seed >>> 0;
  return () => { value = (1664525 * value + 1013904223) >>> 0; return value / 2147483648 - 1; };
}

function renderGraph(context, name, start, volume) {
  const nodes = [];
  const sources = [];
  const track = node => { nodes.push(node); return node; };
  const oscillator = (type, frequency, time, end, detune = 0) => {
    const node = track(context.createOscillator()); sources.push(node);
    node.type = type; node.frequency.setValueAtTime(frequency, time);
    if (node.detune) node.detune.setValueAtTime(detune, time);
    node.start(time); node.stop(end); return node;
  };
  const master = track(context.createGain());
  const limiter = track(context.createDynamicsCompressor());
  master.gain.setValueAtTime(volume * LOUDNESS, start);
  master.gain.setValueAtTime(volume * LOUDNESS, start + Math.max(.01, CLASSIC_SOUND_DURATIONS[name] - .15));
  master.gain.linearRampToValueAtTime(0, start + CLASSIC_SOUND_DURATIONS[name]);
  // 音量推上去之后 limiter 只负责削掉叠音的瞬时峰，不再当压缩器压整体响度。
  limiter.threshold.value = -3; limiter.knee.value = 6; limiter.ratio.value = 20;
  limiter.attack.value = .002; limiter.release.value = .1;
  master.connect(limiter); limiter.connect(context.destination);
  let reverb = null;
  if (['startup', 'tada', 'logoff'].includes(name)) {
    const seconds = name === 'startup' ? 3.8 : name === 'logoff' ? 2.2 : 1.5;
    const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const noise = seededNoise(0x4e4e4f53);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) data[index] = noise() * Math.pow(1 - index / data.length, 2.6);
    }
    reverb = track(context.createConvolver()); reverb.buffer = impulse;
    const wet = track(context.createGain()); wet.gain.value = .24;
    reverb.connect(wet); wet.connect(master);
  }
  const route = (envelope, pan = 0) => {
    let output = envelope;
    if (typeof context.createStereoPanner === 'function') {
      const panner = track(context.createStereoPanner()); panner.pan.value = Math.max(-1, Math.min(1, pan));
      envelope.connect(panner); output = panner;
    }
    output.connect(master); if (reverb) output.connect(reverb);
  };
  const envelope = (time, duration, peak, attack = .008) => {
    const gain = track(context.createGain());
    gain.gain.setValueAtTime(.0001, time);
    // Long swells keep their requested attack; reserve a short release rather
    // than forcing every envelope to peak within its first third.
    const release = Math.min(.05, duration / 3);
    gain.gain.linearRampToValueAtTime(peak, time + Math.min(attack, duration - release));
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    return gain;
  };
  const bell = (frequency, offset, duration, peak, pan, ratio = 3.5) => {
    const time = start + offset;
    const carrier = oscillator('sine', frequency, time, time + duration + .025);
    const modulator = oscillator('sine', frequency * ratio, time, time + duration + .025);
    const modulation = track(context.createGain());
    modulation.gain.setValueAtTime(frequency * 1.1, time);
    modulation.gain.exponentialRampToValueAtTime(.1, time + Math.min(.35, duration));
    const gain = envelope(time, duration, peak, .005);
    modulator.connect(modulation); modulation.connect(carrier.frequency); carrier.connect(gain); route(gain, pan);
  };
  const pad = (frequency, offset, duration, peak, pan, type = 'sawtooth', detune = 0, swell = false) => {
    const time = start + offset;
    const source = oscillator(type, frequency, time, time + duration + .025, detune);
    const filter = track(context.createBiquadFilter()); filter.type = 'lowpass';
    filter.frequency.setValueAtTime(swell ? 280 : 900, time);
    const opening = swell ? Math.min(1.9, duration * .9) : Math.min(.18, duration * .35);
    filter.frequency.exponentialRampToValueAtTime(swell ? 3400 : 4800, time + opening);
    if (!swell) filter.frequency.exponentialRampToValueAtTime(1100, time + duration);
    const gain = envelope(time, duration, peak, swell ? 1.8 : .06);
    source.connect(filter); filter.connect(gain); route(gain, pan);
  };
  // Startup's resolution has its own quiet, staggered envelope. The earlier
  // sparkle and swell stay untouched; other system sounds still use pad().
  const startupResolution = (frequency, peak, type, pan, offset) => {
    const time = start + offset;
    const tail = start + 6.73;
    const source = oscillator(type, frequency, time, start + 6.755);
    const filter = track(context.createBiquadFilter()); filter.type = 'lowpass';
    filter.Q.setValueAtTime(.55, time);
    filter.frequency.setValueAtTime(650, time);
    filter.frequency.exponentialRampToValueAtTime(1800, time + .75);
    filter.frequency.exponentialRampToValueAtTime(700, tail);
    const gain = track(context.createGain());
    gain.gain.setValueAtTime(.0001, time);
    gain.gain.linearRampToValueAtTime(peak, time + .35);
    gain.gain.exponentialRampToValueAtTime(peak * .72, time + 1.6);
    gain.gain.exponentialRampToValueAtTime(.0001, tail);
    source.connect(filter); filter.connect(gain); route(gain, pan);
  };
  if (name === 'startup') {
    const notes = [[659.25,.05,-.6],[783.99,.18,.5],[987.77,.32,-.4],[1046.5,.46,.6],[1174.66,.62,-.3],[1318.51,.78,.4],[1567.98,.96,-.5],[1174.66,1.18,.3],[1567.98,1.4,-.2],[2093,1.65,.5]];
    for (const [frequency, offset, pan] of notes) bell(frequency, offset, 1.1, .085, pan);
    [174.61,261.63,392,440,659.25].forEach((frequency, index) => {
      for (const detune of [-7,7]) pad(frequency,.1,2.35,.031/(index*.3+1),detune/20,'sawtooth',detune,true);
    });
    const voices = [[65.41,.044,'sine',0,2.08],[98,.024,'triangle',-.12,2.10],[130.81,.032,'sine',.12,2.12],[196,.018,'triangle',.22,2.14],[261.63,.012,'triangle',-.22,2.16],[329.63,.020,'sine',-.3,2.18],[293.66,.008,'sine',.28,2.20],[493.88,.012,'sine',.12,2.22]];
    for (const voice of voices) startupResolution(...voice);
  } else if (name === 'ding') bell(1567.98,0,.68,.34,0,2.414);
  else if (name === 'chord') [293.66,369.99,523.25,659.25].forEach((frequency,index) => bell(frequency,0,.72,.115,(index-1.5)*.18,2));
  else if (name === 'chimes') [1046.5,1318.5,1568,1975.5,2093,2637,3136].forEach((frequency,index) => bell(frequency,index*.042,.9,.105,index%2? .55:-.55));
  else if (name === 'tada') {
    for (const [offset,duration,peak,frequencies] of [[.02,.13,.2,[196,261.63,329.63,392]],[.18,1.5,.24,[130.81,196,261.63,329.63,523.25]]]) {
      for (const frequency of frequencies) for (const detune of [-8,0,8]) pad(frequency,offset,duration,peak/(frequencies.length*1.8),detune/24,'sawtooth',detune);
    }
  } else if (name === 'logoff') {
    [[783.99,.05,.65],[698.46,.38,.65],[523.25,.72,.85],[392,1.12,1.95]].forEach(([frequency,offset,duration],index) => bell(frequency,offset,duration,.15,index%2?.3:-.3,2));
    for (const frequency of [130.81,196,246.94,293.66,329.63]) pad(frequency,.7,2.45,.03,0);
  } else if (name === 'exclamation') {
    for (const [frequency,offset,duration] of [[880,0,.16],[659.25,.14,.52]]) {
      const time = start + offset; const gain = envelope(time,duration,.22,.005);
      oscillator('triangle',frequency,time,time+duration+.02).connect(gain); route(gain);
    }
  } else if (name === 'click') {
    const source = oscillator('sine',1450,start,start+.035);
    source.frequency.exponentialRampToValueAtTime(190,start+.028);
    const gain = envelope(start,.032,.27,.001); source.connect(gain); route(gain);
  } else if (name === 'recycle') {
    const noise = seededNoise(0x2026);
    for (const [offset,duration,frequency] of [[0,.09,1400],[.08,.11,2400],[.19,.08,1850],[.27,.13,2950],[.39,.16,1250]]) {
      const time = start + offset;
      const buffer = context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index=0;index<data.length;index+=1) data[index]=noise()*(Math.sin(index/data.length*Math.PI*6)*.5+.5);
      const source = track(context.createBufferSource()); sources.push(source); source.buffer=buffer;
      const filter = track(context.createBiquadFilter()); filter.type='bandpass'; filter.frequency.value=frequency; filter.Q.value=3.2;
      const gain = envelope(time,duration,.25,duration*.25);
      source.connect(filter); filter.connect(gain); route(gain); source.start(time); source.stop(time+duration+.01);
    }
  }
  return { nodes, sources, master };
}

/** True means scheduled; false means muted, blocked, limited or unavailable.
 * Only startup's caller may defer to a later gesture; short UI sounds never do.
 * preview:true is for an explicit audition and replaces current voices. */
export async function playClassicSound(name, options = {}) {
  if (!validName(name) || !classicVisible()) return false;
  const prefs = getClassicSoundPreferences();
  const volume = options.volume === undefined ? prefs.volume : options.volume;
  if (!prefs.enabled || !Number.isFinite(volume) || volume <= 0 || volume > 1) return false;
  const activation = typeof navigator !== 'undefined' && navigator.userActivation;
  if (activation && !activation.hasBeenActive && !activation.isActive) return false;
  const requestedAt = epoch;
  const record = await ensureLive();
  if (!record) return false;
  if (record.closing || requestedAt !== epoch || !classicVisible()) {
    if (!record.closing && !record.voices.size) closeLive(record);
    return false;
  }
  const current = getClassicSoundPreferences();
  if (!current.enabled || !current.volume) { closeLive(record); return false; }
  const now = Date.now();
  if (options.preview) clearVoices(record);
  else if (record.voices.size >= MAX_VOICES || [...record.voices.values()].some(voice => voice.name === name) || now-(lastPlayed.get(name)||0)<(name==='click'?70:160)) {
    if (!record.voices.size) closeLive(record);
    return false;
  }
  let graph;
  try { graph = renderGraph(record.context,name,record.context.currentTime+.01,volume); }
  catch (e) { closeLive(record); return false; }
  lastPlayed.set(name,now);
  const id = ++voiceId;
  const voice = { name, graph, timer: 0, endsAt: record.context.currentTime + .01 + CLASSIC_SOUND_DURATIONS[name] };
  record.voices.set(id,voice);
  voice.timer = setTimeout(() => {
    stopGraph(graph); record.voices.delete(id);
    if (!record.voices.size) closeLive(record);
  },Math.ceil(CLASSIC_SOUND_DURATIONS[name]*1000)+80);
  return true;
}

/** Stereo, interleaved signed 16-bit PCM. Pure conversion, no downloads/URLs. */
export function classicAudioBufferToWav(buffer) {
  if (!buffer || buffer.numberOfChannels !== 2 || !Number.isInteger(buffer.length) || buffer.length < 0 || !Number.isFinite(buffer.sampleRate)) throw new TypeError('Expected a stereo AudioBuffer');
  const size=buffer.length*4;
  if (size>48000*8*4) throw new RangeError('Sound buffer exceeds export budget');
  const bytes=new ArrayBuffer(44+size); const view=new DataView(bytes);
  const text=(offset,value)=>{for(let i=0;i<value.length;i+=1)view.setUint8(offset+i,value.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+size,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,size,true);
  const channels=[buffer.getChannelData(0),buffer.getChannelData(1)];let offset=44;
  for(let frame=0;frame<buffer.length;frame+=1)for(const channel of channels){const raw=channel[frame];const sample=Number.isFinite(raw)?Math.max(-1,Math.min(1,raw)):0;view.setInt16(offset,Math.round(sample*(sample<0?32768:32767)),true);offset+=2;}
  return new Blob([bytes],{type:'audio/wav'});
}

/** One bounded offline render at a time. Abort rejects its result; browsers
 * without offline cancellation may finish that one render in the background.
 * The slot is retained until it settles, so cancellation cannot multiply jobs. */
export async function exportClassicSoundWav(name, options = {}) {
  if (!validName(name)) throw new TypeError('Unknown classic sound');
  if (options.signal && options.signal.aborted) throw abortError();
  if (offlineJob) throw new Error('A sound export is already rendering');
  const Offline=typeof window!=='undefined'&&(window.OfflineAudioContext||window.webkitOfflineAudioContext);
  if (!Offline) throw new Error('Offline audio is unavailable');
  const sampleRate=options.sampleRate===undefined?44100:options.sampleRate;
  if (![22050,44100,48000].includes(sampleRate)) throw new RangeError('Unsupported sample rate');
  const preferenceVolume=getClassicSoundPreferences().volume;
  const volume=options.volume===undefined?(preferenceVolume || DEFAULTS.volume):options.volume;
  if (!Number.isFinite(volume)||volume<0||volume>1) throw new RangeError('volume must be between 0 and 1');
  const context=new Offline(2,Math.ceil(sampleRate*CLASSIC_SOUND_DURATIONS[name]),sampleRate);
  const job={context,graph:null};offlineJob=job;
  let timer;let abort;let renderingStarted=false;
  try {
    job.graph=renderGraph(context,name,0,volume);
    const rendering=Promise.resolve(context.startRendering()).then(buffer=>buffer);
    renderingStarted=true;
    // Retain ownership even if the caller aborts before the renderer ends.
    rendering.then(()=>{if(offlineJob===job)offlineJob=null;},()=>{if(offlineJob===job)offlineJob=null;});
    const interruption=new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(new Error('Sound export timed out')),OFFLINE_RENDER_TIMEOUT_MS);
      abort=()=>reject(abortError());
      if(options.signal)options.signal.addEventListener('abort',abort,{once:true});
    });
    const buffer=await Promise.race([rendering,interruption]);
    if(options.signal&&options.signal.aborted)throw abortError();
    return classicAudioBufferToWav(buffer);
  } catch(error) {
    if(job.graph)stopGraph(job.graph);
    // OfflineAudioContext has no cross-browser close()/cancelRendering().
    // A failed graph construction, unlike a running renderer, releases now.
    if (!renderingStarted && offlineJob===job) offlineJob=null;
    throw error;
  } finally {
    clearTimeout(timer);
    if(options.signal&&abort)options.signal.removeEventListener('abort',abort);
    if(job.graph)stopGraph(job.graph);
  }
}
