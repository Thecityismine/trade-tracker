/**
 * Read-aloud, one reading at a time across the whole app, with two engines:
 *
 * - Natural (default): Google Chirp 3 HD voices via /api/tts, played as an MP3.
 *   Sounds like a narrator and keeps playing with the screen locked. Each
 *   text+voice is generated once and kept in Firebase Storage.
 * - Device: the browser's own speech engine (Web Speech API), free and offline.
 *   On iPhone, Safari only offers its basic voices to web pages. Also the
 *   fallback when the natural voice can't be reached.
 *
 * Device text is spoken in short chunks, one after another. Chrome silently
 * stops a single long utterance after ~15 s, and iOS is more reliable with
 * short ones. Pause is "stop and remember the chunk", because
 * speechSynthesis.pause() is unreliable on Android and some desktop browsers.
 */

export const speechSupported = () => typeof window !== 'undefined' && ('speechSynthesis' in window || 'Audio' in window);
const deviceSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

const RATE_KEY = 'tt:speech-rate';
// v2: the natural voice became the default; a device voice picked before then is not kept.
const VOICE_KEY = 'tt:speech-voice-v2';
export const RATES = [1, 1.25, 1.5];

/** Google Chirp 3 HD voices offered in the picker (id = the part after en-US-Chirp3-HD-). */
export const NATURAL_VOICES = [
  { id: 'Charon', label: 'Charon (male, calm)' },
  { id: 'Orus', label: 'Orus (male, firm)' },
  { id: 'Puck', label: 'Puck (male, upbeat)' },
  { id: 'Fenrir', label: 'Fenrir (male, lively)' },
  { id: 'Kore', label: 'Kore (female, firm)' },
  { id: 'Aoede', label: 'Aoede (female, easy)' },
  { id: 'Leda', label: 'Leda (female, youthful)' },
  { id: 'Zephyr', label: 'Zephyr (female, bright)' },
];
const NATURAL = 'natural:';
const DEFAULT_VOICE = `${NATURAL}Charon`;
export const naturalValue = (id) => `${NATURAL}${id}`;
const isNatural = (value) => typeof value === 'string' && value.startsWith(NATURAL);

/** Markdown / note text → plain sentences worth hearing. */
export function toSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')                     // code blocks
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')                // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')              // links → their text
    .replace(/https?:\/\/\S+/g, ' link ')                 // bare URLs
    .replace(/<[^>]+>/g, ' ')                             // html tags
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, ' ') // table separator rows
    // Table rows and "a | b | c" lines: cells read as a list.
    .replace(/^.*\|.*$/gm, (line) => line.split('|').map((c) => c.trim()).filter(Boolean).join(', '))
    .replace(/^\s*(\d+)[.)]\s+/gm, '$1: ')                // "1. Item" would read as a sentence of its own
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')                   // headings
    .replace(/^\s*>\s?/gm, '')                            // quotes
    .replace(/^\s*[-*+•]\s+(\[[ xX]\]\s*)?/gm, '')        // bullets and checkboxes
    .replace(/^\s*[-*_]{3,}\s*$/gm, ' ')                  // rules
    .replace(/[*_~`]+/g, '')                              // emphasis
    .replace(/\p{Extended_Pictographic}️?/gu, '')    // emoji (otherwise read out by name)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    // A line with no closing punctuation (heading, list item) still gets a pause.
    .map((line) => (/[.!?:;]$/.test(line) ? line : `${line}.`))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')                      // "lessons ." → "lessons."
    .replace(/[,;:]\./g, '.')
    .trim();
}

/** Sentences, merged up to ~220 characters; a longer sentence is split at commas, then spaces. */
export function chunk(text, max = 220) {
  const pieces = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (sentence.length <= max) { pieces.push(sentence); continue; }
    let rest = sentence;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(', ', max);
      if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
      if (cut < 1) cut = max;
      pieces.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) pieces.push(rest);
  }
  const out = [];
  for (const p of pieces) {
    if (out.length && (out[out.length - 1] + ' ' + p).length <= max) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out;
}

// Apple's novelty voices: robotic or sung, never what anyone wants read to them.
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)\b/i;
// Natural-sounding Apple / Microsoft / Google voices worth preferring.
const GOOD = /\b(ava|samantha|allison|evan|nathan|zoe|tom|susan|joelle|nicky|noelle|serena|daniel|karen|moira|tessa|aaron|siri|jenny|aria|guy|natural|neural|google)\b/i;

/** Quality tier from the voice's name and its id (iOS hides "premium" / "enhanced" in voiceURI). */
function tier(v) {
  const id = `${v.name} ${v.voiceURI}`;
  if (/premium/i.test(id)) return 'Premium';
  if (/enhanced/i.test(id)) return 'Enhanced';
  if (/natural|neural|online/i.test(id)) return 'Natural';
  return '';
}

function score(v) {
  let s = 0;
  const t = tier(v);
  if (t === 'Premium') s += 8; else if (t === 'Enhanced') s += 6; else if (t === 'Natural') s += 5;
  if (GOOD.test(v.name)) s += 2;
  if (/google/i.test(v.name)) s += 1;
  if (/en[-_]US/i.test(v.lang)) s += 1;
  if (v.default) s += 0.5;
  return s;
}

/** English voices, best first, with novelty voices left out. */
export function listVoices() {
  if (!deviceSupported()) return [];
  return window.speechSynthesis.getVoices()
    .filter((v) => /^en(-|_|$)/i.test(v.lang) && !NOVELTY.test(v.name))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

export const voiceLabel = (v) => `${v.name}${tier(v) ? ` · ${tier(v)}` : ''} (${v.lang.replace('_', '-')})`;

/** The device voice you picked (remembered on this device), else the best one installed. */
function pickVoice() {
  const voices = listVoices();
  return voices.find((v) => v.voiceURI === state.voiceURI) || voices[0] || null;
}

const readRate = () => {
  try { const r = Number(localStorage.getItem(RATE_KEY)); return RATES.includes(r) ? r : 1; } catch { return 1; }
};

const readVoice = () => {
  try { return localStorage.getItem(VOICE_KEY) || DEFAULT_VOICE; } catch { return DEFAULT_VOICE; }
};

// status: idle | loading (natural voice being generated) | speaking | paused.
// notice: one-line message for the reading in progress (e.g. fell back to the device voice).
let state = { id: null, status: 'idle', rate: speechSupported() ? readRate() : 1, voiceURI: speechSupported() ? readVoice() : DEFAULT_VOICE, notice: null, voicesLoaded: 0 };
let engine = 'device'; // which engine the current reading uses
let text = '';         // current reading, speech-ready, for switching voice mid-way
let chunks = [];
let index = 0;
let run = 0; // bumps on every start/stop so callbacks from an old reading are ignored
const listeners = new Set();

const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
export const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const getState = () => state;

function speakFrom(i) {
  const synth = window.speechSynthesis;
  const myRun = ++run;
  synth.cancel();
  index = i;
  if (index >= chunks.length) { set({ id: null, status: 'idle' }); return; }
  const u = new SpeechSynthesisUtterance(chunks[index]);
  const voice = pickVoice();
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  u.rate = state.rate;
  u.onend = () => { if (myRun === run) speakFrom(index + 1); };
  u.onerror = (e) => {
    if (myRun !== run) return;
    // 'interrupted' / 'canceled' come from our own cancel(); anything else ends the reading.
    if (e.error !== 'interrupted' && e.error !== 'canceled') set({ id: null, status: 'idle' });
  };
  synth.speak(u);
}

function startDevice(from = 0) {
  engine = 'device';
  if (!deviceSupported()) { set({ id: null, status: 'idle' }); return; }
  chunks = chunk(text);
  set({ status: 'speaking' });
  speakFrom(from);
}

// ── Natural voice ────────────────────────────────────────────────────────────

let audio = null;
const urls = new Map(); // voice+text → MP3 url, so a replay this session skips the server

const audioEl = () => {
  if (!audio) { audio = new Audio(); audio.preload = 'auto'; }
  return audio;
};

async function naturalUrl(clean, voice) {
  const key = `${voice}\n${clean}`;
  if (urls.has(key)) return urls.get(key);
  const { auth } = await import('../config/firebase');
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not signed in.');
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: clean, voice }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.url) throw new Error(body.error || `Natural voice failed (${response.status}).`);
  urls.set(key, body.url);
  return body.url;
}

async function startNatural() {
  engine = 'natural';
  const myRun = ++run;
  if (deviceSupported()) window.speechSynthesis.cancel();
  const a = audioEl();
  a.onended = null; a.onerror = null; a.onplaying = null;
  // iOS only lets audio start from a tap, and the MP3 arrives after a network
  // round trip. Playing a short silence now, inside the tap, unlocks this
  // element so the real audio may start later.
  a.src = '/silence.mp3';
  a.play().catch(() => {});
  set({ status: 'loading' });
  try {
    const url = await naturalUrl(text, state.voiceURI.slice(NATURAL.length));
    if (myRun !== run) return;
    a.src = url;
    a.defaultPlaybackRate = state.rate;
    a.playbackRate = state.rate;
    a.onplaying = () => { a.playbackRate = state.rate; };
    a.onended = () => { if (myRun === run) set({ id: null, status: 'idle' }); };
    a.onerror = () => { if (myRun === run) fallBack('the audio file could not play'); };
    await a.play();
    if (myRun === run) set({ status: 'speaking' });
  } catch (error) {
    if (myRun !== run) return;
    // Autoplay refused (the unlock didn't take): wait for a tap on Resume.
    if (error?.name === 'NotAllowedError') { set({ status: 'paused' }); return; }
    fallBack(error?.message);
  }
}

function fallBack(reason) {
  console.warn('Natural voice unavailable:', reason);
  if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); }
  set({ notice: 'Natural voice unavailable, using the device voice.' });
  startDevice(0);
}

// ── Controls ─────────────────────────────────────────────────────────────────

/** Start reading `text` as reading `id`. Call from a click so iOS allows it. */
export function speak(id, raw) {
  if (!speechSupported()) return;
  const clean = toSpeech(raw);
  if (!clean) return;
  stop();
  text = clean;
  set({ id, notice: null });
  if (isNatural(state.voiceURI)) startNatural();
  else startDevice(0);
}

export function pause() {
  if (state.status !== 'speaking') return;
  if (engine === 'natural') { audio?.pause(); set({ status: 'paused' }); return; }
  run++;
  window.speechSynthesis.cancel();
  set({ status: 'paused' });
}

export function resume() {
  if (state.status !== 'paused') return;
  if (engine === 'natural') {
    audio?.play().then(() => set({ status: 'speaking' })).catch((e) => fallBack(e?.message));
    return;
  }
  set({ status: 'speaking' });
  speakFrom(index);
}

export function stop(id) {
  if (!speechSupported() || (id && state.id !== id)) return;
  run++;
  if (deviceSupported()) window.speechSynthesis.cancel();
  if (audio) {
    audio.onended = null; audio.onerror = null; audio.onplaying = null;
    audio.pause(); audio.removeAttribute('src'); audio.load();
  }
  chunks = []; index = 0;
  if (state.id !== null || state.status !== 'idle') set({ id: null, status: 'idle', notice: null });
}

/** Next speed in RATES; applies straight away. */
export function cycleRate() {
  const rate = RATES[(RATES.indexOf(state.rate) + 1) % RATES.length];
  try { localStorage.setItem(RATE_KEY, String(rate)); } catch { /* private mode: not remembered */ }
  set({ rate });
  if (engine === 'natural') {
    if (audio) { audio.defaultPlaybackRate = rate; audio.playbackRate = rate; }
    return;
  }
  if (state.status === 'speaking') speakFrom(index);
}

/**
 * Use this voice from now on (remembered on this device). Swapping one device
 * voice for another carries on from the current chunk; switching to or from a
 * natural voice starts the reading again with it.
 */
export function setVoice(value) {
  try { localStorage.setItem(VOICE_KEY, value); } catch { /* private mode: not remembered */ }
  const wasNatural = engine === 'natural';
  set({ voiceURI: value, notice: null });
  if (!state.id || state.status === 'idle') return;
  if (isNatural(value)) startNatural();
  else if (wasNatural) {
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); }
    startDevice(0);
  } else if (state.status === 'speaking') speakFrom(index);
}

/** The voice that will actually be used, for showing in the picker. */
export const currentVoiceURI = () => (isNatural(state.voiceURI) ? state.voiceURI : pickVoice()?.voiceURI || '');

// Voices load asynchronously (Chrome, and iOS after a voice download);
// asking early starts the load, and the change event refreshes the picker.
if (deviceSupported()) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', () => set({ voicesLoaded: state.voicesLoaded + 1 }));
}
