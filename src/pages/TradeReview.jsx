import { useEffect, useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ImageIcon, ShieldCheck, Sparkles } from 'lucide-react';
import { db } from '../config/firebase';
import Page from '../components/ui/Page';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import ReviewChart, { LAYERS } from '../components/ReviewChart';
import { useTrades } from '../context/TradesContext';
import { getTradeDate } from '../utils/accountMath';
import { rMultiple } from '../utils/rMultiple';
import { buildRules, checkTradeRules, compactTrade, useCoachSources } from '../utils/coach';
import { chartTf, fetchChartData, normalizeAsset, REVIEW_TFS, tradedAssets, tradeTimes } from '../utils/chartData';
import { exchangeLabel } from '../utils/tradeVenue';

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

/** Start of the period. Weeks start Monday, as on the dashboard. */
function periodStart(id, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (id === 'week') d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  if (id === 'month') d.setDate(1);
  return d;
}

const VERDICTS = {
  fits: { label: 'Fits your rules', tone: 'text-profit', ring: 'border-profit/30 bg-profit-soft' },
  partial: { label: 'Partly fits', tone: 'text-warn', ring: 'border-warn/30 bg-warn-soft' },
  breaks: { label: 'Breaks your rules', tone: 'text-loss', ring: 'border-loss/30 bg-loss-soft' },
  no_match: { label: 'Matches none of your setups', tone: 'text-warn', ring: 'border-warn/30 bg-warn-soft' },
  no_rules: { label: 'No written rules apply', tone: 'text-content-secondary', ring: 'border-line bg-surface-raised' },
};
const TONES = { bull: 'text-profit', bear: 'text-loss', warn: 'text-warn', muted: 'text-content-muted' };

const money = (v) => `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(2)}`;
const rText = (r) => (r === null ? '—' : `${r > 0 ? '+' : ''}${r.toFixed(2)}R`);
const toneOf = (v) => (v < 0 ? 'text-loss' : 'text-profit');
const price = (v) => (Number(v) > 0 ? Number(v).toLocaleString('en-US') : '—');
const isReviewed = (t) => Boolean(t.reviewNote || t.reviewedAt);
const against4H = (t) => {
  const regime = t.entryReadout?.readout?.skyline?.['4H']?.regime;
  if (!regime) return null;
  return (t.direction === 'short') === (regime === 'BULL');
};

function Card({ className = '', children, ...rest }) {
  return <section className={`rounded-card bg-surface shadow-elev-1 ${className}`} {...rest}>{children}</section>;
}

function Toggle({ on, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-8 rounded-control px-2.5 text-xs transition-colors ${on ? 'bg-surface-hover font-semibold text-content-primary' : 'text-content-secondary hover:text-content-primary'} ${className}`}
    >
      {children}
    </button>
  );
}

function Summary({ title, list }) {
  const wins = list.filter((t) => t.outcome === 'win').length;
  const losses = list.filter((t) => t.outcome === 'loss').length;
  const scratch = list.length - wins - losses;
  const net = list.reduce((s, t) => s + (Number(t.gainLoss) || 0), 0);
  const fees = list.reduce((s, t) => s + (Number(t.fee) || 0), 0);
  const rs = list.map(rMultiple).filter((r) => r !== null);
  const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  const followed = { yes: 0, partial: 0, no: 0 };
  list.forEach((t) => { if (followed[t.followedPlan] !== undefined) followed[t.followedPlan] += 1; });
  const withReadout = list.filter((t) => against4H(t) !== null);
  const against = withReadout.filter((t) => against4H(t)).length;

  const Row = ({ label, children, className = '' }) => (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-content-secondary">{label}</span>
      <span className={`tabular-nums ${className}`}>{children}</span>
    </div>
  );

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold text-content-primary">{title}</h2>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-control bg-profit-soft p-2.5"><p className="text-[11px] text-content-secondary">Wins</p><p className="text-xl font-bold text-profit">{wins}</p></div>
        <div className="rounded-control bg-loss-soft p-2.5"><p className="text-[11px] text-content-secondary">Losses</p><p className="text-xl font-bold text-loss">{losses}</p></div>
        <div className="rounded-control bg-surface-raised p-2.5"><p className="text-[11px] text-content-secondary">Scratch</p><p className="text-xl font-bold text-content-primary">{scratch}</p></div>
      </div>
      <div className="space-y-1.5">
        <Row label="Net P&L" className={toneOf(net)}>{money(net)}</Row>
        <Row label="Fees" className="text-loss">{money(-fees)}</Row>
        <Row label="Average R">{avgR === null ? '—' : rText(avgR)}</Row>
      </div>
      <div className="space-y-1.5 border-t border-line pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">Rules</p>
        <Row label="Followed plan">{followed.yes + followed.partial + followed.no ? `${followed.yes} yes · ${followed.partial} partly · ${followed.no} no` : '—'}</Row>
        <Row label="Against 4H Skyline" className={against ? 'text-warn' : ''}>{withReadout.length ? `${against} of ${withReadout.length}` : '—'}</Row>
        <Row label="Reviewed">{`${list.filter(isReviewed).length} of ${list.length}`}</Row>
      </div>
    </Card>
  );
}

function TradeReview() {
  const { trades, loading } = useTrades();
  const toast = useToast();
  const sources = useCoachSources();
  const [period, setPeriod] = useState('week');
  const [selectedId, setSelectedId] = useState(null);
  const [assetOverride, setAssetOverride] = useState(null);
  const [tfOverride, setTfOverride] = useState(null);
  // The page opens on candles, your trade and WaveTrend; every other layer
  // starts off and you turn on what you want to check.
  const [layers, setLayers] = useState({ wt: true, skyline: false, nyliq: false, sessions: false, ema: false, ribbon: false });
  const [chartState, setChartState] = useState({ status: 'loading' });
  const [readout, setReadout] = useState({ status: 'idle' });
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [ai, setAi] = useState({ status: 'idle' });

  const list = useMemo(() => {
    const since = periodStart(period);
    return trades
      .filter((t) => { const d = getTradeDate(t); return !Number.isNaN(d.getTime()) && d >= since; })
      .sort((a, b) => getTradeDate(b) - getTradeDate(a));
  }, [trades, period]);

  const selected = list.find((t) => t.id === selectedId) || list[0] || null;
  const assets = useMemo(() => tradedAssets([...trades].sort((a, b) => getTradeDate(b) - getTradeDate(a))), [trades]);
  const tradeAsset = selected ? normalizeAsset(selected.ticker) : 'BTC';
  const asset = assetOverride || tradeAsset;
  const tf = tfOverride || chartTf(selected?.timeframe);
  const chartTrade = asset === tradeAsset ? selected : null;

  // A new selection resets the view to that trade's own coin and timeframe.
  useEffect(() => {
    setAssetOverride(null);
    setTfOverride(null);
    setNote(selected?.reviewNote || '');
    setAi(selected?.aiReview ? { status: 'done', result: selected.aiReview } : { status: 'idle' });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The indicator readout at entry: stored on the trade once fetched, since a
  // closed candle never changes (phase 3 of TRADE_FEED.md).
  const readoutTf = chartTf(selected?.timeframe);
  useEffect(() => {
    if (!selected) return undefined;
    const stored = selected.entryReadout;
    if (stored?.tf === readoutTf) { setReadout({ status: 'ready', data: stored }); return undefined; }
    let cancelled = false;
    setReadout({ status: 'loading' });
    const { entry, logged } = tradeTimes(selected);
    const params = { asset: tradeAsset, tf: readoutTf, t: entry || logged, price: selected.entryPrice };
    fetchChartData('readout', params)
      .catch(async (error) => {
        if (import.meta.env.DEV) return { ...(await import('../utils/chartMock')).mockReadout(params), sample: true };
        throw error;
      })
      .then(async (d) => {
        if (cancelled) return;
        const data = { tf: readoutTf, candleTime: d.candleTime ?? null, snapped: Boolean(d.snapped), readout: d.readout, rows: d.rows || [], fetchedAt: new Date().toISOString() };
        setReadout({ status: 'ready', data, sample: d.sample });
        if (!d.sample) await updateDoc(doc(db, 'trades', selected.id), { entryReadout: data }).catch(() => {});
      })
      .catch((error) => { if (!cancelled) setReadout({ status: 'error', error: error.message }); });
    return () => { cancelled = true; };
  }, [selected?.id, readoutTf]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNote = async () => {
    if (!selected) return;
    setSavingNote(true);
    try {
      await updateDoc(doc(db, 'trades', selected.id), { reviewNote: note.trim() || null, reviewedAt: serverTimestamp() });
      toast.success('Review saved.');
    } catch (err) {
      console.error('Error saving review:', err);
      toast.error('Could not save the review. Check your connection and try again.');
    } finally {
      setSavingNote(false);
    }
  };

  const runAi = async () => {
    if (!selected) return;
    setAi({ status: 'loading' });
    try {
      const withReadout = readout.status === 'ready' && !readout.sample ? { ...selected, entryReadout: readout.data } : selected;
      const snapshot = compactTrade({ ...withReadout, reviewNote: note }, 'this trade');
      const { result } = await checkTradeRules({ trade: snapshot, rules: buildRules(sources) });
      const saved = { ...result, at: new Date().toISOString(), withIndicators: Boolean(snapshot.indicatorsAtEntry) };
      setAi({ status: 'done', result: saved });
      await updateDoc(doc(db, 'trades', selected.id), { aiReview: saved }).catch(() => {});
    } catch (err) {
      setAi({ status: 'error', error: err.message || 'The AI review failed.' });
    }
  };

  if (!loading && trades.length === 0) {
    return <Page><EmptyState title="No trades yet" description="Log a trade and it will show up here to review on the chart." /></Page>;
  }

  const r = selected ? rMultiple(selected) : null;
  const pnl = Number(selected?.gainLoss) || 0;
  const short = selected?.direction === 'short';
  const verdict = ai.result ? VERDICTS[ai.result.verdict] || VERDICTS.no_rules : null;
  const sampleData = chartState.data?.source?.startsWith('sample');
  const index = selected ? list.findIndex((t) => t.id === selected.id) : -1;

  return (
    <Page>
      <div className="flex flex-col gap-4 lg:gap-5 min-[1400px]:flex-row min-[1400px]:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4 lg:gap-5">

          {/* Chart */}
          <Card className="min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
              <div className="flex rounded-control bg-surface-raised p-0.5" role="group" aria-label="Asset">
                {(assets.includes(asset) ? assets : [asset, ...assets]).slice(0, 6).map((a) => (
                  <Toggle key={a} on={a === asset} onClick={() => setAssetOverride(a === tradeAsset ? null : a)}>{a}</Toggle>
                ))}
              </div>
              <div className="flex flex-wrap font-mono" role="group" aria-label="Timeframe">
                {REVIEW_TFS.map((x) => (
                  <Toggle key={x} on={x === tf} onClick={() => setTfOverride(x === chartTf(selected?.timeframe) ? null : x)}>{x}</Toggle>
                ))}
              </div>
              <div className="flex-1" />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Indicator layers">
                {LAYERS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={layers[l.id]}
                    onClick={() => setLayers((s) => ({ ...s, [l.id]: !s[l.id] }))}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-xs transition-colors ${layers[l.id] ? 'border-brand/45 bg-brand-muted text-content-primary' : 'border-line-strong text-content-secondary hover:text-content-primary'}`}
                  >
                    <span className="h-2 w-2 rounded-full border" style={{ borderColor: l.color, background: layers[l.id] ? l.color : 'transparent' }} />
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* The chart stays mounted even when it fails, so picking another
                trade (or the trades finishing loading) retries it. */}
            {chartState.status === 'error' && (
              <div className="space-y-3 p-4">
                <p className="text-sm text-content-secondary">
                  The chart isn't available: {chartState.error}. Showing the screenshots instead. Reviews and notes still work.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {[selected?.chartImageUrl, selected?.exitChartImageUrl].filter(Boolean).map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Trade screenshot" className="w-full rounded-lg" /></a>
                  ))}
                </div>
              </div>
            )}
            <div className={`relative ${chartState.status === 'error' ? 'hidden' : ''}`}>
              <div className="pointer-events-none absolute left-3 top-2 z-10 flex flex-wrap items-baseline gap-x-3 font-mono text-xs text-content-secondary">
                <span className="font-semibold text-content-primary">{asset} · {tf}</span>
                {chartTrade && <span>{getTradeDate(chartTrade).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>}
                {chartState.data && !chartState.data.verified && !sampleData && <span className="text-warn">indicators not yet checked against TradingView for {asset}</span>}
                {sampleData && <span className="text-warn">sample data (dev server)</span>}
                {chartState.status === 'loading' && <span>Loading Chart Lab data…</span>}
              </div>
              <ReviewChart asset={asset} tf={tf} trade={chartTrade} layers={layers} onState={setChartState} />
            </div>
          </Card>

          <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
            {/* Trade list */}
            <Card className="min-w-0 flex-[2] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-content-primary">Trades</h2>
                <div className="flex rounded-control bg-surface-raised p-0.5" role="tablist" aria-label="Period">
                  {PERIODS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-selected={period === p.id}
                      onClick={() => { setPeriod(p.id); setSelectedId(null); }}
                      className={`h-8 rounded-chip px-3.5 text-sm font-medium transition-colors ${period === p.id ? 'bg-brand text-content-primary' : 'text-content-secondary hover:text-content-primary'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {list.length === 0 ? (
                <p className="py-8 text-center text-sm text-content-muted">
                  {period === 'today' ? 'No trades today yet. Pick Week or Month to review earlier ones.' : 'No trades in this period.'}
                </p>
              ) : (
                <ol className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                  {list.map((t, i) => {
                    const on = t.id === selected?.id;
                    const tr = rMultiple(t);
                    const g = Number(t.gainLoss) || 0;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(t.id)}
                          aria-current={on ? 'true' : undefined}
                          className={`flex min-h-[44px] w-full items-center gap-3 rounded-control border px-3 py-1.5 text-left transition-colors ${on ? 'border-brand/45 bg-brand-muted' : 'border-transparent bg-surface-raised hover:bg-surface-hover'}`}
                        >
                          <span className="w-5 font-mono text-xs text-content-muted">{i + 1}</span>
                          <span className="w-20 text-sm text-content-secondary">{getTradeDate(t).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })}</span>
                          <span className="w-24 text-sm font-semibold text-content-primary">
                            {normalizeAsset(t.ticker)} <span className={t.direction === 'short' ? 'text-loss' : 'text-profit'}>{t.direction === 'short' ? 'Short' : 'Long'}</span>
                          </span>
                          <span className="hidden min-w-0 flex-1 truncate text-sm text-content-secondary sm:block">{t.strategyName || '—'}</span>
                          <span className={`ml-auto w-16 text-right font-mono text-sm tabular-nums sm:ml-0 ${tr === null ? 'text-content-muted' : toneOf(tr)}`}>{rText(tr)}</span>
                          <span className={`w-20 text-right font-mono text-sm tabular-nums ${toneOf(g)}`}>{money(g)}</span>
                          <span className={`hidden w-20 rounded-full py-0.5 text-center text-[11px] md:block ${isReviewed(t) ? 'bg-profit-soft text-profit' : 'bg-warn-soft text-warn'}`}>
                            {isReviewed(t) ? 'Reviewed' : 'To review'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>

            <div className="lg:w-[300px] lg:flex-none">
              <Summary title={PERIODS.find((p) => p.id === period).label === 'Month' ? new Date().toLocaleString(undefined, { month: 'long' }) : `This ${period === 'today' ? 'day' : 'week'}`} list={list} />
            </div>
          </div>
        </div>

        {/* Selected trade */}
        {selected && (
          <Card className="flex flex-col gap-4 p-4 md:p-5 min-[1400px]:sticky min-[1400px]:top-4 min-[1400px]:w-[400px] min-[1400px]:flex-none" aria-label="Selected trade">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">Trade {index + 1} of {list.length}</p>
                <h2 className="mt-1 text-lg font-bold text-content-primary">
                  {tradeAsset} <span className={short ? 'text-loss' : 'text-profit'}>{short ? 'Short' : 'Long'}</span>
                </h2>
                <p className="text-sm text-content-secondary">
                  {getTradeDate(selected).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {selected.strategyName ? ` · ${selected.strategyName}` : ''}
                </p>
              </div>
              <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-semibold ${pnl < 0 ? 'bg-loss-soft text-loss' : 'bg-profit-soft text-profit'}`}>
                {pnl < 0 ? 'Loss' : 'Win'} · {rText(r)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                ['Entry', price(selected.entryPrice)], ['Exit', price(selected.exitPrice)], ['Stop', price(selected.stopLoss)],
                ['Target', price(selected.targetPrice)], ['P&L', money(pnl), toneOf(pnl)], ['R', rText(r), r === null ? '' : toneOf(r)],
                ['Fee', `$${(Number(selected.fee) || 0).toFixed(2)}`], ['Leverage', selected.leverage ? `${selected.leverage}x` : '—'],
                ['Followed plan', selected.followedPlan ? { yes: 'Yes', partial: 'Partly', no: 'No' }[selected.followedPlan] || selected.followedPlan : '—'],
                ...(selected.timeframe || selected.exchange ? [['Timeframe', selected.timeframe || '—'], ['Exchange', exchangeLabel(selected.exchange) || '—']] : []),
              ].map(([label, value, tone = '']) => (
                <div key={label} className="rounded-control bg-surface-raised px-2.5 py-2">
                  <p className="text-[11px] text-content-muted">{label}</p>
                  <p className={`truncate font-mono text-sm font-semibold tabular-nums ${tone || 'text-content-primary'}`}>{value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                Indicators at entry <span className="font-normal normal-case tracking-normal">· {readoutTf}</span>
                {readout.data?.snapped && <span className="font-normal normal-case tracking-normal"> · placed by price</span>}
              </p>
              {readout.status === 'loading' && <p className="text-sm text-content-muted">Reading the chart at entry…</p>}
              {readout.status === 'error' && <p className="text-sm text-content-muted">Not available: {readout.error}</p>}
              {readout.status === 'ready' && (
                <div className="grid grid-cols-2 gap-1.5">
                  {readout.data.rows.map((row) => (
                    <div key={row.label} className="rounded-control bg-surface-raised px-2.5 py-2">
                      <p className="text-[11px] text-content-muted">{row.label}</p>
                      <p className={`font-mono text-xs ${TONES[row.tone] || 'text-content-primary'}`}>{row.value}</p>
                    </div>
                  ))}
                  {readout.sample && <p className="col-span-2 text-[11px] text-warn">Sample readout (dev server)</p>}
                </div>
              )}
            </div>

            {(selected.entryReason || selected.comment) && (
              <div className="space-y-1.5 text-sm leading-relaxed">
                {selected.entryReason && <p className="text-content-primary"><span className="text-content-muted">Why I entered: </span>{selected.entryReason}</p>}
                {selected.comment && <p className="text-content-primary"><span className="text-content-muted">Comment: </span>{selected.comment}</p>}
              </div>
            )}

            {(selected.chartImageUrl || selected.exitChartImageUrl) && (
              <div className="grid grid-cols-2 gap-2">
                {[['Entry screenshot', selected.chartImageUrl], ['Exit screenshot', selected.exitChartImageUrl]].map(([label, url]) => (url ? (
                  <a key={label} href={url} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-control border border-line">
                    <img src={url} alt={label} className="h-20 w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-content-primary">{label}</span>
                  </a>
                ) : (
                  <div key={label} className="flex h-20 items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong text-xs text-content-muted">
                    <ImageIcon size={13} /> No {label.toLowerCase()}
                  </div>
                )))}
              </div>
            )}

            <div className="space-y-2 border-t border-line pt-4">
              <label htmlFor="trade-review-note" className="block text-sm font-semibold text-content-primary">
                Your review <span className="font-normal text-content-muted">what went right or wrong</span>
              </label>
              <textarea
                id="trade-review-note"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Shorted into a 4H BULL. Wait for the red WT cross next time."
                className="w-full resize-y rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-sm text-content-primary focus:border-brand focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveNote} disabled={savingNote}>{savingNote ? 'Saving…' : 'Save review'}</Button>
                <Button variant="secondary" icon={Sparkles} onClick={runAi} disabled={ai.status === 'loading'}>
                  {ai.status === 'loading' ? 'Reviewing…' : ai.result ? 'Review again' : 'AI review against indicators'}
                </Button>
              </div>
            </div>

            {ai.status === 'error' && <p className="text-sm text-loss">{ai.error}</p>}
            {ai.result && verdict && (
              <div className={`space-y-2 rounded-lg border p-3.5 ${verdict.ring}`}>
                <p className={`flex items-center gap-2 text-sm font-semibold ${verdict.tone}`}>
                  <ShieldCheck size={15} /> {verdict.label}
                  {ai.result.matchedSetup && <span className="font-normal text-content-secondary">· {ai.result.matchedSetup}</span>}
                </p>
                <p className="text-sm text-content-primary">{ai.result.summary}</p>
                {ai.result.violations?.length > 0 && (
                  <ul className="space-y-1.5">
                    {ai.result.violations.map((v, i) => (
                      <li key={i} className="text-sm"><span className="text-loss">✕ {v.rule}</span><span className="block text-content-secondary">{v.evidence}</span></li>
                    ))}
                  </ul>
                )}
                {ai.result.nextTime && <p className="text-sm text-content-primary"><span className="text-content-muted">Next time: </span>{ai.result.nextTime}</p>}
                <p className="text-[11px] text-content-muted">
                  {ai.result.withIndicators ? 'Checked against your rules and the indicators at entry.' : 'Checked against your rules only (no indicator readout yet).'}
                  {ai.result.at ? ` ${new Date(ai.result.at).toLocaleDateString()}.` : ''}
                </p>
              </div>
            )}
          </Card>
        )}
      </div>
    </Page>
  );
}

export default TradeReview;
