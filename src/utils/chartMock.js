/**
 * DEV ONLY. Contract-shaped sample data (CHART_DATA.md v1) for the local dev
 * server, which can't run /api/chart. Loaded with a dynamic import behind
 * import.meta.env.DEV, so it never ships in a build that calls Chart Lab.
 * The numbers are generated, not market data.
 */
import { TF_SECONDS, tradeTimes } from './chartData';

function rng(seed) {
  let a = 0;
  for (let i = 0; i < seed.length; i++) a = (a * 31 + seed.charCodeAt(i)) | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ema = (arr, n) => {
  const k = 2 / (n + 1); const out = []; let prev = arr[0];
  arr.forEach((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); out.push(prev); });
  return out;
};

export function mockSeries({ asset, tf, trade, to = Math.floor(Date.now() / 1000) }) {
  const step = TF_SECONDS[tf] || 600;
  const N = 720, SHOW = 320;
  const times = tradeTimes(trade || {});
  const entryT = times.entry || times.logged || to - step * 80;
  const exitT = times.exit || entryT + step * 30;
  const end = Math.floor(to / step) * step;
  const t0 = end - (N - 1) * step;
  const E = Math.max(10, Math.min(N - 5, Math.round((entryT - t0) / step)));
  const X = Math.max(E + 1, Math.min(N - 2, Math.round((exitT - t0) / step)));
  const entry = Number(trade?.entryPrice) || 80000, exit = Number(trade?.exitPrice) || entry;
  const anchors = [[0, entry * (exit > entry ? 0.985 : 1.012)], [E, entry], [X, exit], [N - 1, exit]];
  const base = (i) => {
    for (let j = 0; j < anchors.length - 1; j++) {
      const [a, pa] = anchors[j], [b, pb] = anchors[j + 1];
      if (i >= a && i <= b) return pa + (pb - pa) * ((i - a) / Math.max(1, b - a));
    }
    return exit;
  };
  const r = rng(`${asset}${tf}${trade?.id || ''}`);
  const amp = entry * 0.0012;
  const c = []; let prev = base(0), wave = 0;
  for (let i = 0; i < N; i++) {
    wave = wave * 0.82 + (r() - 0.5) * amp * 0.9;
    let close = base(i) + wave;
    if (i === E) close = entry; if (i === X) close = exit;
    const high = Math.max(prev, close) + r() * amp * 0.45, low = Math.min(prev, close) - r() * amp * 0.45;
    c.push([t0 + i * step, prev, high, low, close, Math.round(r() * 300)]); prev = close;
  }
  const closes = c.map((k) => k[4]);
  const e = { 5: ema(closes, 5), 13: ema(closes, 13), 89: ema(closes, 89), 200: ema(closes, 200), 400: ema(closes, 400) };
  const sky = c.map((k, i) => Math.min(...c.slice(Math.max(0, i - 24), i + 1).map((q) => q[3])));
  const ap = c.map((k) => (k[2] + k[3] + k[4]) / 3);
  const esa = ema(ap, 9);
  const d = ema(ap.map((v, i) => Math.abs(v - esa[i])), 9);
  const wt1 = ema(ap.map((v, i) => (v - esa[i]) / (0.015 * (d[i] || 1))), 12);
  const wt2 = wt1.map((v, i) => { const s = wt1.slice(Math.max(0, i - 3), i + 1); return s.reduce((x, y) => x + y, 0) / s.length; });

  const off = N - SHOW;
  const win = (arr) => arr.slice(off).map((v, i) => [c[off + i][0], Number(v.toFixed(2))]);
  const crosses = [];
  for (let i = off + 1; i < N; i++) {
    const a = wt1[i - 1] - wt2[i - 1], b = wt1[i] - wt2[i];
    if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) crosses.push({ t: c[i][0], dir: b > 0 ? 'up' : 'down', wt2: Number(wt2[i].toFixed(1)) });
  }
  const boxFrom = Math.max(off, E - 40), boxTo = Math.max(off + 5, E - 22);
  const boxC = c.slice(boxFrom, boxTo + 1);
  const hi = Math.max(...boxC.map((k) => k[2])), lo = Math.min(...boxC.map((k) => k[3]));

  // Same hours and colours as Chart Lab's luxsessions.py (UTC).
  const SESS = [['Tokyo', 0, 9, '#E91E63'], ['London', 7, 16, '#2157F3'], ['New York', 13.5, 20, '#FF5D00']];
  const shown = c.slice(off);
  const sessBoxes = [], takeouts = [];
  for (let day = Math.floor(shown[0][0] / 86400) * 86400; day <= shown[shown.length - 1][0]; day += 86400) {
    for (const [label, a, b, color] of SESS) {
      const start = day + a * 3600, end = day + b * 3600;
      const inside = shown.filter((k) => k[0] >= start && k[0] < end);
      if (!inside.length) continue;
      const high = Math.max(...inside.map((k) => k[2])), low = Math.min(...inside.map((k) => k[3]));
      const done = shown[shown.length - 1][0] >= end;
      sessBoxes.push({ label, start, end: inside[inside.length - 1][0], high, low, color, done });
      if (done) {
        const hit = shown.find((k) => k[0] >= end && (k[2] > high || k[3] < low));
        if (hit) takeouts.push({ t: hit[0], position: hit[2] > high ? 'above' : 'below', text: '×', color: '#F23645', label: `${label} ${hit[2] > high ? 'high' : 'low'} taken` });
      }
    }
  }

  return {
    version: 1, asset, symbol: `${asset}-USDT`, source: 'sample (dev)', verified: false, tf, tfSeconds: step,
    candles: c.slice(off).map((k) => k.map((v, j) => (j === 0 || j === 5 ? v : Number(v.toFixed(2))))),
    forming: null,
    layers: {
      ema: { ema200: win(e[200]), ema400: win(e[400]) },
      ribbon: { ema5: win(e[5]), ema13: win(e[13]), ema89: win(e[89]) },
      skyline: { line: win(sky), regime: c.slice(off).map((k, i) => [k[0], k[4] >= sky[off + i] * 1.001 ? 'BULL' : 'BEAR']), flips: [] },
      wt: { wt1: win(wt1), wt2: win(wt2), crosses, divergences: [], levels: { overbought: 53, oversold: -60 } },
      nyliq: {
        boxes: [{ label: '8pm range', start: c[boxFrom][0], end: c[boxTo][0], high: hi, low: lo }],
        lines: [{ label: '8pm H', price: hi, start: c[boxTo][0], end: null, style: 'dashed' }],
        markers: [],
      },
      sessions: { boxes: sessBoxes, lines: [], markers: takeouts.sort((a, b) => a.t - b.t) },
    },
  };
}

export function mockReadout({ asset, tf }) {
  return {
    version: 1, asset, tf, candleTime: null, basis: 'Sample readout from the dev server, not market data.', snapped: false,
    readout: { skyline: { [tf]: { regime: 'BULL', distancePct: 0.7, bars: 12 }, '4H': { regime: 'BULL', distancePct: 1.1, bars: 35 } }, wt: { wt1: 62.1, wt2: 55.3, zone: 'overbought', lastCross: { dir: 'up', barsAgo: 3 } }, divergence: null, ribbon: { trend: 'up', gapAtr: 1.1, barsSinceStart: 4 } },
    rows: [
      { label: `Skyline ${tf}`, value: 'BULL · +0.7% · 12 bars', tone: 'bull' },
      { label: 'Skyline 4H', value: 'BULL · +1.1% · 35 bars', tone: 'bull' },
      { label: 'WaveTrend', value: 'WT1 62.1 · WT2 55.3', tone: 'warn' },
      { label: 'Last WT cross', value: 'green · 3 bars ago', tone: 'bull' },
      { label: 'EMA 5/13/89', value: 'trend up · gap 1.1 ATR', tone: 'bull' },
      { label: 'NY Liq Suite', value: 'sample', tone: 'muted' },
      { label: 'Sessions', value: 'sample', tone: 'muted' },
    ],
  };
}
