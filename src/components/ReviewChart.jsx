import { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { fetchChartData, TF_SECONDS, tradeTimes, windowEnd } from '../utils/chartData';

// Chart Lab's colours for the layers George already reads, so the two charts
// look the same; surfaces and text follow this app's theme.
const C = {
  bg: '#131316', grid: 'rgba(255,255,255,0.04)', text: '#8A8A93', border: 'rgba(255,255,255,0.07)',
  up: '#E4E4E7', down: '#3B82F6',
  ema200: '#E05252', ema400: '#3FB37F', ema5: '#A78BFA', ema13: '#F472B6', ema89: '#FB923C',
  bull: '#34D399', bear: '#F87171', liq: '#FBBF24',
  wt1: '#7FB8FF', wt2: '#2B5C99',
  entry: '#60A5FA', stop: '#F87171', target: '#34D399', win: '#34D399', loss: '#F472B6',
};

export const LAYERS = [
  { id: 'wt', label: 'WaveTrend', color: C.wt1 },
  { id: 'skyline', label: 'Skyline', color: C.bull },
  { id: 'nyliq', label: 'NY Liq Suite', color: C.liq },
  { id: 'ema', label: 'EMA 200/400', color: C.ema200 },
  { id: 'ribbon', label: 'EMA 5/13/89', color: C.ema5 },
];

const fmtTime = (t) => new Date(t * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function baseOptions(height) {
  return {
    height,
    autoSize: true,
    layout: { background: { color: C.bg }, textColor: C.text, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 },
    grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: C.border },
    timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false, rightOffset: 6 },
    localization: { timeFormatter: fmtTime },
  };
}

/** [[t, v]] pairs → line data on the candle times; gaps become whitespace. */
const toLine = (pairs) => (pairs || []).map(([time, value]) => (value === null || value === undefined ? { time } : { time, value }));

/** Index of the last candle that opened at or before `t`. */
function candleAt(candles, t) {
  let lo = 0, hi = candles.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid][0] <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/**
 * Where to put a marker whose time is only a guess: the nearest candle at or
 * before `before` whose range holds the price, ±0.1% (BingX candles against
 * fills on other exchanges). The trade feed's snapping rule.
 */
function snapByPrice(candles, price, before) {
  if (!price) return -1;
  const tol = price * 0.001;
  for (let i = candleAt(candles, before); i >= 0; i--) {
    const [, , h, l] = candles[i];
    if (l - tol <= price && price <= h + tol) return i;
  }
  return -1;
}

/**
 * The selected trade on Chart Lab's candles and indicators. Calls `onState`
 * with { status: 'loading' | 'ready' | 'error', error, data } so the page can
 * fall back to the screenshots when the data isn't there.
 */
function ReviewChart({ asset, tf, trade, layers, onState }) {
  const mainRef = useRef(null);
  const wtRef = useRef(null);
  const charts = useRef(null);
  const [data, setData] = useState(null);

  // Fetch the window for this trade.
  useEffect(() => {
    let cancelled = false;
    setData(null);
    onState?.({ status: 'loading' });
    const to = trade ? windowEnd(trade, tf) : undefined;
    fetchChartData('series', { asset, tf, to, bars: 320, layers: 'wt,skyline,nyliq,ema,ribbon' })
      .catch(async (error) => {
        // The local dev server has no /api functions; draw sample data so the
        // page can be worked on. Never used in a deployed build.
        if (import.meta.env.DEV) {
          const { mockSeries } = await import('../utils/chartMock');
          return mockSeries({ asset, tf, trade, to });
        }
        throw error;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        onState?.({ status: 'ready', data: d });
      })
      .catch((error) => { if (!cancelled) onState?.({ status: 'error', error: error.message }); });
    return () => { cancelled = true; };
  }, [asset, tf, trade?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build both charts once per data set.
  useEffect(() => {
    if (!data || !mainRef.current || !wtRef.current) return undefined;
    const candles = data.candles || [];
    const L = data.layers || {};

    const main = createChart(mainRef.current, baseOptions(420));
    const wt = createChart(wtRef.current, { ...baseOptions(140), timeScale: { ...baseOptions(140).timeScale, visible: false } });

    const line = (chart, color, extra = {}) => chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra });
    const groups = { ema: [], ribbon: [], skyline: [], nyliq: [] };

    // Draw order: context lines under the candles.
    if (L.ema) {
      groups.ema.push(line(main, C.ema200, { lineWidth: 2 }), line(main, C.ema400, { lineWidth: 2 }));
      groups.ema[0].setData(toLine(L.ema.ema200));
      groups.ema[1].setData(toLine(L.ema.ema400));
    }
    if (L.ribbon) {
      const [a, b, c] = [line(main, C.ema5), line(main, C.ema13), line(main, C.ema89, { lineWidth: 2 })];
      a.setData(toLine(L.ribbon.ema5)); b.setData(toLine(L.ribbon.ema13)); c.setData(toLine(L.ribbon.ema89));
      groups.ribbon.push(a, b, c);
    }
    if (L.skyline) {
      const regime = new Map((L.skyline.regime || []).map(([t, r]) => [t, r]));
      const s = line(main, C.bull, { lineWidth: 2 });
      s.setData((L.skyline.line || []).map(([time, value]) => (value === null
        ? { time }
        : { time, value, color: regime.get(time) === 'BEAR' ? C.bear : C.bull })));
      groups.skyline.push(s);
    }
    if (L.nyliq) {
      // Boxes as top and bottom edges over their span; lines run to their end
      // (or the right edge). Lightweight Charts has no filled rectangles.
      const times = candles.map((c) => c[0]);
      const span = (start, end, value) => times.map((time) => (time >= start && (end === null || time <= end) ? { time, value } : { time }));
      for (const box of (L.nyliq.boxes || []).slice(-8)) {
        const color = box.color || C.liq;
        const hi = line(main, color, { lineStyle: LineStyle.Solid });
        const lo = line(main, color, { lineStyle: LineStyle.Solid });
        hi.setData(span(box.start, box.end, box.high)); lo.setData(span(box.start, box.end, box.low));
        groups.nyliq.push(hi, lo);
      }
      for (const ln of (L.nyliq.lines || []).slice(-10)) {
        const s = line(main, ln.color || C.liq, { lineStyle: ln.style === 'dotted' ? LineStyle.Dotted : LineStyle.Dashed, title: ln.label || '' });
        s.setData(span(ln.start, ln.end, ln.price));
        groups.nyliq.push(s);
      }
    }

    const candleSeries = main.addCandlestickSeries({
      upColor: C.up, downColor: C.down, wickUpColor: C.up, wickDownColor: C.down, borderVisible: false,
    });
    candleSeries.setData(candles.map(([time, open, high, low, close]) => ({ time, open, high, low, close })));

    // Trade markers and levels. Markers are kept per layer so a toggle can
    // take a layer's markers off with its lines.
    const markers = { trade: [], skyline: [], nyliq: [] };
    let focus = null;
    if (trade) {
      const short = trade.direction === 'short';
      const { entry, entrySource, exit, exitSource, logged } = tradeTimes(trade);
      const guess = (src) => !src || ['unknown', 'logged', 'screenshot-unverified'].includes(src);
      const ei = entry && !guess(entrySource) ? candleAt(candles, entry) : snapByPrice(candles, trade.entryPrice, entry || logged || exit || Infinity);
      const xi = exit && !guess(exitSource) ? candleAt(candles, exit) : snapByPrice(candles, trade.exitPrice, logged || exit || Infinity);
      const loss = (Number(trade.gainLoss) || 0) < 0;
      if (ei >= 0) {
        markers.trade.push({ time: candles[ei][0], position: short ? 'aboveBar' : 'belowBar', shape: short ? 'arrowDown' : 'arrowUp', color: short ? C.loss : C.win, text: short ? 'my S' : 'my L' });
      }
      if (xi >= 0) {
        markers.trade.push({ time: candles[xi][0], position: short ? 'belowBar' : 'aboveBar', shape: 'square', color: loss ? C.loss : C.win, text: 'exit' });
      }
      const add = (price, title, color, lineStyle) => {
        if (Number(price) > 0) candleSeries.createPriceLine({ price: Number(price), title, color, lineWidth: 1, lineStyle, axisLabelVisible: true });
      };
      add(trade.entryPrice, 'entry', C.entry, LineStyle.Solid);
      add(trade.stopLoss, 'stop', C.stop, LineStyle.Dotted);
      add(trade.targetPrice, 'target', C.target, LineStyle.Dashed);
      add(trade.exitPrice, 'exit', loss ? C.loss : C.win, LineStyle.LargeDashed);
      if (ei >= 0 || xi >= 0) focus = [Math.max(0, (ei >= 0 ? ei : xi) - 70), Math.min(candles.length - 1, (xi >= 0 ? xi : ei) + 30)];
    }
    if (L.skyline?.flips) {
      for (const f of L.skyline.flips) markers.skyline.push({ time: f.t, position: f.to === 'BULL' ? 'belowBar' : 'aboveBar', shape: 'circle', color: f.to === 'BULL' ? C.bull : C.bear, size: 0.6 });
    }
    if (L.nyliq?.markers) {
      for (const m of L.nyliq.markers) markers.nyliq.push({ time: m.t, position: m.position === 'below' ? 'belowBar' : 'aboveBar', shape: 'circle', color: m.color || C.liq, text: m.text || '', size: 0.5 });
    }

    // WaveTrend panel: whitespace on every candle so both charts share bar indexes.
    const wtAxis = wt.addLineSeries({ visible: false });
    wtAxis.setData(candles.map(([time]) => ({ time })));
    let wt1 = null, wt2 = null;
    if (L.wt) {
      wt1 = line(wt, C.wt1, { lineWidth: 1.5 });
      wt2 = line(wt, C.wt2, { lineWidth: 1.5 });
      wt1.setData(toLine(L.wt.wt1)); wt2.setData(toLine(L.wt.wt2));
      const ob = L.wt.levels?.overbought ?? 53, os = L.wt.levels?.oversold ?? -60;
      [ob, 0, os].forEach((price) => wt2.createPriceLine({ price, color: price ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.22)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true }));
      wt2.setMarkers([
        ...(L.wt.crosses || []).map((x) => ({ time: x.t, position: 'inBar', shape: 'circle', color: x.dir === 'up' ? C.bull : C.loss, size: 0.6 })),
        ...(L.wt.divergences || []).map((d) => ({ time: d.t, position: d.kind?.includes('bear') ? 'aboveBar' : 'belowBar', shape: d.kind?.includes('bear') ? 'arrowDown' : 'arrowUp', color: d.kind?.includes('bear') ? C.loss : C.bull, text: d.label || 'Div' })),
      ].sort((a, b) => a.time - b.time));
    }

    // Keep the two time scales together.
    let syncing = false;
    const sync = (from, to) => (range) => {
      if (syncing || !range) return;
      syncing = true; to.timeScale().setVisibleLogicalRange(range); syncing = false;
    };
    main.timeScale().subscribeVisibleLogicalRangeChange(sync(main, wt));
    wt.timeScale().subscribeVisibleLogicalRangeChange(sync(wt, main));
    if (focus) main.timeScale().setVisibleLogicalRange({ from: focus[0], to: focus[1] });
    else main.timeScale().fitContent();

    charts.current = { main, wt, groups, candleSeries, markers };
    return () => { main.remove(); wt.remove(); charts.current = null; };
  }, [data, trade?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Layer toggles only change visibility; nothing is refetched.
  useEffect(() => {
    const ch = charts.current;
    if (!ch) return;
    for (const [id, series] of Object.entries(ch.groups)) series.forEach((s) => s.applyOptions({ visible: Boolean(layers[id]) }));
    const shown = [...ch.markers.trade, ...(layers.skyline ? ch.markers.skyline : []), ...(layers.nyliq ? ch.markers.nyliq : [])];
    ch.candleSeries.setMarkers(shown.sort((a, b) => a.time - b.time));
  }, [layers, data]);

  const t = TF_SECONDS[tf] ? tf : '10m';
  return (
    <div className="min-w-0">
      <div ref={mainRef} className="h-[420px] w-full" aria-label={`${asset} ${t} chart`} role="img" />
      <div className={`border-t border-line ${layers.wt ? '' : 'hidden'}`}>
        <p className="px-3 pt-1.5 text-[11px] text-content-muted">WaveTrend <span className="text-content-muted/70">(approx. Market Cipher)</span></p>
        <div ref={wtRef} className="h-[140px] w-full" />
      </div>
    </div>
  );
}

export default ReviewChart;
