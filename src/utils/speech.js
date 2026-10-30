/**
 * Read-aloud with the browser's own speech engine (Web Speech API): free, no
 * server, no key. One reading at a time across the whole app.
 *
 * Text is spoken in short chunks, one after another. Chrome silently stops a
 * single long utterance after ~15 s, and iOS is more reliable with short ones.
 * Pause is "stop and remember the chunk", because speechSynthesis.pause() is
 * unreliable on Android and some desktop browsers.
 */

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

const RATE_KEY = 'tt:speech-rate';
const VOICE_KEY = 'tt:speech-voice';
export const RATES = [1, 1.25, 1.5];

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
  if (!speechSupported()) return [];
  return window.speechSynthesis.getVoices()
    .filter((v) => /^en(-|_|$)/i.test(v.lang) && !NOVELTY.test(v.name))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

export const voiceLabel = (v) => `${v.name}${tier(v) ? ` · ${tier(v)}` : ''} (${v.lang.replace('_', '-')})`;

/** The voice you picked (remembered on this device), else the best one installed. */
function pickVoice() {
  const voices = listVoices();
  return voices.find((v) => v.voiceURI === state.voiceURI) || voices[0] || null;
}

const readRate = () => {
  try { const r = Number(localStorage.getItem(RATE_KEY)); return RATES.includes(r) ? r : 1; } catch { return 1; }
};

const readVoice = () => {
  try { return localStorage.getItem(VOICE_KEY) || null; } catch { return null; }
};

let state = { id: null, status: 'idle', rate: speechSupported() ? readRate() : 1, voiceURI: speechSupported() ? readVoice() : null, voicesLoaded: 0 };
let chunks = [];
let index = 0;
let run = 0; // bumps on every start/stop so callbacks from an old utterance are ignored
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

/** Start reading `text` as reading `id`. Call from a click so iOS allows it. */
export function speak(id, text) {
  if (!speechSupported()) return;
  chunks = chunk(toSpeech(text));
  if (!chunks.length) return;
  set({ id, status: 'speaking' });
  speakFrom(0);
}

export function pause() {
  if (state.status !== 'speaking') return;
  run++;
  window.speechSynthesis.cancel();
  set({ status: 'paused' });
}

export function resume() {
  if (state.status !== 'paused') return;
  set({ status: 'speaking' });
  speakFrom(index);
}

export function stop(id) {
  if (!speechSupported() || (id && state.id !== id)) return;
  run++;
  window.speechSynthesis.cancel();
  chunks = []; index = 0;
  set({ id: null, status: 'idle' });
}

/** Next speed in RATES; restarts the current chunk at the new speed. */
export function cycleRate() {
  const rate = RATES[(RATES.indexOf(state.rate) + 1) % RATES.length];
  try { localStorage.setItem(RATE_KEY, String(rate)); } catch { /* private mode: not remembered */ }
  set({ rate });
  if (state.status === 'speaking') speakFrom(index);
}

/** Use this voice from now on (remembered on this device); restarts the current chunk with it. */
export function setVoice(voiceURI) {
  try { localStorage.setItem(VOICE_KEY, voiceURI); } catch { /* private mode: not remembered */ }
  set({ voiceURI });
  if (state.status === 'speaking') speakFrom(index);
}

/** The voice that will actually be used, for showing in the picker. */
export const currentVoiceURI = () => pickVoice()?.voiceURI || '';

// Voices load asynchronously (Chrome, and iOS after a voice download);
// asking early starts the load, and the change event refreshes the picker.
if (speechSupported()) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', () => set({ voicesLoaded: state.voicesLoaded + 1 }));
}
