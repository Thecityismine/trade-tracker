import { useEffect, useState } from 'react';
import { ArrowRight, Check, ShieldCheck, SkipForward } from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useTrades } from '../context/TradesContext';
import { getTradeDate } from '../utils/accountMath';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { useToast } from './ui/Toast';
import { EmotionPicker, TagInput } from './TradeTagFields';
import { buildRules, checkTradeRules, compactTrade, useCoachSources } from '../utils/coach';
import { chartLabUrl } from '../utils/chartLab';

const VERDICTS = {
  fits: { label: 'Fits your rules', tone: 'text-profit', ring: 'border-profit/30 bg-profit-soft' },
  partial: { label: 'Partly fits', tone: 'text-warn', ring: 'border-warn/30 bg-warn-soft' },
  breaks: { label: 'Breaks your rules', tone: 'text-loss', ring: 'border-loss/30 bg-loss-soft' },
  no_match: { label: 'Matches none of your setups', tone: 'text-warn', ring: 'border-warn/30 bg-warn-soft' },
  no_rules: { label: 'No written rules apply', tone: 'text-content-secondary', ring: 'border-line bg-surface-raised' },
};

const money = (v) => `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(2)}`;

function Fact({ label, children, className = 'text-content-primary' }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-content-muted">{label}</p>
      <p className={`text-sm font-medium tabular-nums ${className}`}>{children}</p>
    </div>
  );
}

/**
 * Step through unreviewed trades one at a time: fill in emotion, tags and a
 * lesson, then "Save & next". Skip moves on without marking the trade
 * reviewed, so it stays in the queue for next time.
 *
 * `tradeIds` is fixed when the queue opens. Reviewed trades drop out of the
 * live queue as they are saved, and walking a snapshot keeps the position
 * steady instead of shifting under you.
 */
function ReviewQueue({ isOpen, onClose, tradeIds }) {
  const { trades } = useTrades();
  const toast = useToast();
  const [cursor, setCursor] = useState(0);
  const [form, setForm] = useState({ emotion: '', tags: [], reviewNote: '' });
  const [saving, setSaving] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const sources = useCoachSources();
  // Rule-check results by trade id, so stepping back and forth keeps them.
  const [checks, setChecks] = useState({});

  const tradeId = tradeIds[cursor];
  const trade = trades.find((t) => t.id === tradeId) || null;
  const done = cursor >= tradeIds.length;

  // Load the form when the step changes — not on every live update to the
  // trade, which would wipe what you are typing.
  useEffect(() => {
    if (!trade) return;
    setForm({
      emotion: trade.emotion || '',
      tags: Array.isArray(trade.tags) ? trade.tags : [],
      reviewNote: trade.reviewNote || '',
    });
  }, [tradeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen) { setCursor(0); setReviewedCount(0); }
  }, [isOpen]);

  const next = () => setCursor((c) => c + 1);

  const runRuleCheck = async () => {
    if (!trade) return;
    const id = trade.id;
    setChecks((c) => ({ ...c, [id]: { loading: true } }));
    try {
      // Check with what's in the form now, saved or not.
      const snapshot = compactTrade({ ...trade, emotion: form.emotion, tags: form.tags, reviewNote: form.reviewNote }, 'this trade');
      const { result } = await checkTradeRules({ trade: snapshot, rules: buildRules(sources) });
      setChecks((c) => ({ ...c, [id]: { result } }));
    } catch (err) {
      setChecks((c) => ({ ...c, [id]: { error: err.message || 'The rule check failed.' } }));
    }
  };
  const check = trade ? checks[trade.id] : null;
  const verdict = check?.result ? VERDICTS[check.result.verdict] || VERDICTS.no_rules : null;

  const saveAndNext = async () => {
    if (!trade) return next();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'trades', trade.id), {
        emotion: form.emotion || null,
        tags: form.tags,
        reviewNote: form.reviewNote.trim() || null,
        reviewedAt: serverTimestamp(),
      });
      setReviewedCount((n) => n + 1);
      next();
    } catch (err) {
      console.error('Error saving review:', err);
      toast.error('Could not save the review. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const pnl = Number(trade?.gainLoss) || 0;
  const tone = pnl >= 0 ? 'text-profit' : 'text-loss';
  // Emotion is how you felt going in. If it was recorded at entry, it stays.
  const emotionLocked = Boolean(trade?.emotion && trade?.planLockedAt);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={done ? 'Review complete' : `Review trade ${cursor + 1} of ${tradeIds.length}`}
      description={done ? null : 'How you felt going in, what to tag it, and what you learned.'}
      footer={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" icon={SkipForward} onClick={next} disabled={saving}>Skip</Button>
            <Button icon={cursor === tradeIds.length - 1 ? Check : ArrowRight} onClick={saveAndNext} disabled={saving}>
              {saving ? 'Saving…' : cursor === tradeIds.length - 1 ? 'Save & finish' : 'Save & next'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="py-6 text-center">
          <p className="text-3xl">✓</p>
          <p className="mt-2 text-content-primary font-medium">
            {reviewedCount} trade{reviewedCount === 1 ? '' : 's'} reviewed
          </p>
          {reviewedCount < tradeIds.length && (
            <p className="mt-1 text-sm text-content-muted">
              {tradeIds.length - reviewedCount} skipped. They'll still be in the queue next time.
            </p>
          )}
        </div>
      ) : !trade ? (
        <p className="text-sm text-content-muted">This trade was deleted. Skip to the next one.</p>
      ) : (
        <div className="space-y-5">
          {/* Progress */}
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-1 rounded-full bg-brand transition-all" style={{ width: `${(cursor / tradeIds.length) * 100}%` }} />
          </div>

          {/* The trade */}
          <div className={`card-glow ${pnl >= 0 ? 'glow-profit' : 'glow-loss'} rounded-lg border border-line bg-surface-raised p-4`}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <p className="text-content-primary font-semibold">
                {trade.ticker || 'BTC'}{' '}
                <span className={trade.direction === 'short' ? 'text-loss' : 'text-profit'}>
                  {trade.direction === 'short' ? 'Short' : 'Long'}
                </span>
              </p>
              <p className="text-xs text-content-muted">
                {getTradeDate(trade).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              <Fact label="P&L" className={tone}>{money(pnl)}</Fact>
              <Fact label="P&L %" className={tone}>
                {Number.isFinite(Number(trade.pnlPercent)) ? `${Number(trade.pnlPercent).toFixed(1)}%` : '--'}
              </Fact>
              <Fact label="Fee">${(Number(trade.fee) || 0).toFixed(2)}</Fact>
              <Fact label="Entry">{trade.entryPrice ?? '--'}</Fact>
              <Fact label="Exit">{trade.exitPrice ?? '--'}</Fact>
              <Fact label="Stop">{trade.stopLoss ?? '--'}</Fact>
            </div>
            {(trade.entryReason || trade.comment) && (
              <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                {trade.entryReason && <p className="text-content-secondary"><span className="text-content-muted">Why I entered: </span>{trade.entryReason}</p>}
                {trade.comment && <p className="text-content-secondary"><span className="text-content-muted">Comment: </span>{trade.comment}</p>}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <a href={chartLabUrl(trade)} target="_blank" rel="noopener noreferrer" className="text-brand-hover hover:underline">
                Open in Chart Lab
              </a>
              {trade.chartImageUrl && (
                <a href={trade.chartImageUrl} target="_blank" rel="noreferrer" className="text-brand-hover hover:underline">
                  Open entry chart
                </a>
              )}
              {trade.exitChartImageUrl && (
                <a href={trade.exitChartImageUrl} target="_blank" rel="noreferrer" className="text-brand-hover hover:underline">
                  Open exit chart
                </a>
              )}
            </div>
          </div>

          <div>
            {!check?.result && (
              <button
                type="button"
                onClick={runRuleCheck}
                disabled={check?.loading}
                className="inline-flex items-center gap-2 rounded-control border border-line-strong bg-surface-raised px-3 py-2 text-sm text-content-secondary hover:border-brand/50 hover:text-content-primary disabled:opacity-60"
              >
                <ShieldCheck size={15} className={check?.loading ? 'animate-pulse text-brand' : 'text-brand'} />
                {check?.loading ? 'Checking against your rules…' : 'Check against my rules'}
              </button>
            )}
            {check?.error && <p className="mt-2 text-sm text-loss">{check.error}</p>}
            {check?.result && verdict && (
              <div className={`rounded-lg border p-4 ${verdict.ring}`}>
                <p className={`flex items-center gap-2 text-sm font-semibold ${verdict.tone}`}>
                  <ShieldCheck size={15} /> {verdict.label}
                  {check.result.matchedSetup && (
                    <span className="font-normal text-content-secondary">· {check.result.matchedSetup}</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-content-primary">{check.result.summary}</p>
                {check.result.violations.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {check.result.violations.map((v, i) => (
                      <li key={i} className="text-sm">
                        <span className="text-loss">✕ {v.rule}</span>
                        <span className="block text-content-secondary">{v.evidence}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {check.result.unverifiable.length > 0 && (
                  <p className="mt-2 text-xs text-content-muted">Couldn't check from the data: {check.result.unverifiable.join('; ')}</p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-content-secondary text-sm mb-2">Going in, I felt</label>
            <EmotionPicker
              value={form.emotion}
              locked={emotionLocked}
              onChange={(emotion) => setForm((f) => ({ ...f, emotion }))}
            />
          </div>

          <div>
            <label className="block text-content-secondary text-sm mb-2">Tags</label>
            <TagInput value={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
          </div>

          <div>
            <label htmlFor="review-note" className="block text-content-secondary text-sm mb-2">
              Lesson <span className="text-content-muted">(what would you do the same, or differently?)</span>
            </label>
            <textarea
              id="review-note"
              rows="3"
              value={form.reviewNote}
              onChange={(e) => setForm((f) => ({ ...f, reviewNote: e.target.value }))}
              placeholder="Entered before the 10m trigger confirmed. Wait for the close next time."
              className="w-full resize-none rounded-lg border border-line-strong bg-surface-raised px-4 py-2 text-content-primary focus:border-brand focus:outline-none"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

export default ReviewQueue;
