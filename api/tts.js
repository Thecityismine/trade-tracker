import { createHash, randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { verifyFirebaseToken } from './_auth.js';
import { adminApp } from './_ai/firestore.js';
import { NATURAL_VOICES, chunk } from '../src/utils/speech.js';

/**
 * POST /api/tts — natural read-aloud voice (Google Cloud Text-to-Speech,
 * Chirp 3 HD). Body: { text, voice } where text is already speech-ready
 * (toSpeech) and voice is one of NATURAL_VOICES. Answers { url } to an MP3.
 *
 * Each text+voice is synthesized once and kept in Firebase Storage under
 * tts/<uid>/<hash>.mp3; asking again returns the same file without calling
 * Google, so replays are free. GOOGLE_TTS_KEY stays on the server.
 */

const BUCKET = 'trade-tracker-fb893.firebasestorage.app';
const MAX_CHARS = 25_000; // ~25 min of audio; worst case ~$0.75 once past the free tier
const PIECE = 350;        // small pieces generated side by side start faster (Google takes up to 5,000 bytes)
const PARALLEL = 12;

const downloadUrl = (path, token) =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

async function synthesize(text, voice, key) {
  const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'en-US', name: `en-US-Chirp3-HD-${voice}` },
      audioConfig: { audioEncoding: 'MP3' },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || `Google answered ${response.status}.`);
  return Buffer.from(body.audioContent, 'base64');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let uid;
  try {
    ({ sub: uid } = await verifyFirebaseToken(req));
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const key = process.env.GOOGLE_TTS_KEY;
  if (!key) return res.status(503).json({ error: 'Natural voice is not configured (GOOGLE_TTS_KEY).' });

  const { text, voice } = req.body || {};
  if (!NATURAL_VOICES.some((v) => v.id === voice)) return res.status(400).json({ error: `Unknown voice "${voice}".` });
  const clean = String(text || '').trim();
  if (!clean) return res.status(400).json({ error: 'Nothing to read.' });
  if (clean.length > MAX_CHARS) return res.status(413).json({ error: `Too long for the natural voice (${clean.length} characters, max ${MAX_CHARS}).` });

  const hash = createHash('sha256').update(`chirp3-hd:${voice}:${clean}`).digest('hex').slice(0, 32);
  const path = `tts/${uid}/${hash}.mp3`;

  try {
    const file = getStorage(adminApp()).bucket(BUCKET).file(path);
    const [exists] = await file.exists();
    if (exists) {
      const [meta] = await file.getMetadata();
      const token = meta.metadata?.firebaseStorageDownloadTokens?.split(',')[0];
      if (token) return res.status(200).json({ url: downloadUrl(path, token), cached: true });
    }

    // Google's MP3 is bare frames (no ID3/Xing header), so pieces join into one file.
    const pieces = chunk(clean, PIECE);
    const audio = new Array(pieces.length);
    for (let i = 0; i < pieces.length; i += PARALLEL) {
      await Promise.all(pieces.slice(i, i + PARALLEL).map(async (piece, j) => {
        audio[i + j] = await synthesize(piece, voice, key);
      }));
    }

    const token = randomUUID();
    await file.save(Buffer.concat(audio), {
      contentType: 'audio/mpeg',
      resumable: false,
      metadata: { cacheControl: 'private, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } },
    });
    return res.status(200).json({ url: downloadUrl(path, token), cached: false });
  } catch (error) {
    console.error('tts failed', error);
    return res.status(502).json({ error: error.message || 'Natural voice failed.' });
  }
}
