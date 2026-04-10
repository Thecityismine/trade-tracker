import { useState } from 'react';
import { Pencil, Trash2, ImageDown } from 'lucide-react';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import TradeModal from './TradeModal';
import { generatePnlImage, downloadCanvas } from '../utils/generatePnlImage';

const MISTAKE_TAGS = [
  { id: 'over-risk', label: 'Over-Risk' },
  { id: 'fomo', label: 'FOMO Entry' },
  { id: 'no-stop', label: 'No Stop Loss' },
  { id: 'revenge', label: 'Revenge Trade' },
];

function getVerdict(trade, maxRiskPercent, mistakeTags) {
  const isOverRisk = maxRiskPercent > 0 && trade.result === 'loss' &&
    Math.abs(trade.pnlPercent || 0) > maxRiskPercent;
  const score = trade.executionScore || 0;

  if (isOverRisk || mistakeTags.includes('over-risk')) {
    return {
      icon: '✗', label: 'BAD TRADE',
      desc: 'Over-risked position — exceeded your risk limit',
      color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20',
    };
  }
  if (mistakeTags.includes('revenge')) {
    return {
      icon: '✗', label: 'REVENGE TRADE',
      desc: 'Emotional decision, not part of your plan',
      color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20',
    };
  }
  if (mistakeTags.includes('fomo')) {
    return {
      icon: '!', label: 'FOMO ENTRY',
      desc: 'Chased the move — wait for your setup',
      color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20',
    };
  }
  if (trade.result === 'win' && score >= 8) {
    return {
      icon: '◎', label: 'A+ SETUP',
      desc: 'Excellent execution — this is your template',
      color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20',
    };
  }
  if (trade.result === 'win') {
    return {
      icon: '✓', label: 'GOOD TRADE',
      desc: 'Followed plan, positive outcome',
      color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20',
    };
  }
  if (trade.result === 'loss' && score >= 6) {
    return {
      icon: '!', label: 'MISSED EXECUTION',
      desc: 'Setup was valid — execution failed',
      color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20',
    };
  }
  return {
    icon: '✗', label: 'BAD TRADE',
    desc: 'Review your process before the next trade',
    color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20',
  };
}

function getWhatWentWrong(trade, maxRiskPercent, mistakeTags) {
  if (trade.result !== 'loss') return [];
  const issues = [];
  const isOverRisk = maxRiskPercent > 0 && Math.abs(trade.pnlPercent || 0) > maxRiskPercent;

  if (isOverRisk) issues.push(`Risk exceeded your ${maxRiskPercent}% limit`);
  if (mistakeTags.includes('fomo')) issues.push('FOMO entry — chased the move late');
  if (mistakeTags.includes('no-stop')) issues.push('No stop loss — undefined risk on this trade');
  if (mistakeTags.includes('revenge')) issues.push('Revenge trade — decision was emotional, not systematic');
  if (mistakeTags.includes('over-risk') && !isOverRisk) issues.push('Position size too large');
  if ((trade.executionScore || 0) > 0 && trade.executionScore < 4) {
    issues.push('Execution score below 4 — poor entry or exit timing');
  }
  if (!trade.stopLoss && !mistakeTags.includes('no-stop')) {
    issues.push('No stop loss recorded');
  }

  return issues;
}

function getNextFocus(trade, maxRiskPercent, mistakeTags) {
  const focuses = [];
  const isOverRisk = maxRiskPercent > 0 && trade.result === 'loss' &&
    Math.abs(trade.pnlPercent || 0) > maxRiskPercent;

  if (isOverRisk || mistakeTags.includes('over-risk')) {
    focuses.push(`Reduce risk to <${maxRiskPercent || 5}% per trade`);
  }
  if (mistakeTags.includes('fomo')) {
    focuses.push('Wait for confirmation — no chasing entries');
  }
  if (mistakeTags.includes('revenge')) {
    focuses.push('Step away after a loss — no revenge trades');
  }
  if (mistakeTags.includes('no-stop')) {
    focuses.push('Set your stop loss before entering every trade');
  }
  if (focuses.length === 0 && trade.result === 'loss') {
    focuses.push('Review your entry criteria before the next trade');
    focuses.push('Trust your system — no impulse decisions');
  }
  if (trade.result === 'win' && (trade.executionScore || 0) >= 8) {
    focuses.push('Repeat this exact setup — document what worked');
  }

  return focuses;
}

function TradeDetailsModal({ trade, maxRiskPercent = 0, onClose }) {
  const [isEditing, setIsEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localMistakeTags, setLocalMistakeTags] = useState(trade.mistakeTags || []);
  const [savingTags, setSavingTags] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);

  const handleSharePnl = async () => {
    setGeneratingImage(true);
    try {
      const canvas = await generatePnlImage(trade);
      const ticker = (trade.ticker || 'BTC').toUpperCase();
      const date = (trade.tradeDate?.toDate?.() || new Date(trade.tradeDate))
        .toISOString().slice(0, 10);
      downloadCanvas(canvas, `${ticker}-pnl-${date}.png`);
    } catch (err) {
      console.error('Failed to generate PnL image:', err);
      alert('Failed to generate image. Please try again.');
    } finally {
      setGeneratingImage(false);
    }
  };

  if (!trade) return null;

  const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
  const isOverRisk = maxRiskPercent > 0 && trade.result === 'loss' &&
    Math.abs(trade.pnlPercent || 0) > maxRiskPercent;

  const verdict = getVerdict(trade, maxRiskPercent, localMistakeTags);
  const wrongPoints = getWhatWentWrong(trade, maxRiskPercent, localMistakeTags);
  const nextFocuses = getNextFocus(trade, maxRiskPercent, localMistakeTags);

  const absGain = Math.abs(trade.gainLoss || 0).toFixed(2);
  const gainPrefix = trade.gainLoss >= 0 ? '+$' : '-$';
  const rrDisplay = trade.rr != null ? trade.rr.toFixed(2) : '—';
  const riskUsed = trade.pnlPercent != null
    ? `${Math.abs(trade.pnlPercent).toFixed(1)}%${isOverRisk ? ' (exceeded)' : ''}`
    : '—';

  const toggleMistakeTag = async (tagId) => {
    const newTags = localMistakeTags.includes(tagId)
      ? localMistakeTags.filter((t) => t !== tagId)
      : [...localMistakeTags, tagId];
    const prev = localMistakeTags;
    setLocalMistakeTags(newTags);
    setSavingTags(true);
    try {
      await updateDoc(doc(db, 'trades', trade.id), { mistakeTags: newTags });
    } catch (err) {
      console.error('Error saving mistake tags:', err);
      setLocalMistakeTags(prev);
    } finally {
      setSavingTags(false);
    }
  };

  const handleDeleteTrade = async () => {
    if (!trade.id || deleting) return;
    const shouldDelete = window.confirm('Delete this trade permanently?');
    if (!shouldDelete) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'trades', trade.id));
      onClose();
    } catch (error) {
      console.error('Error deleting trade:', error);
      alert('Error deleting trade. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {!isEditing && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-[60] overflow-y-auto">
          <div className="flex min-h-full items-start justify-center p-4 py-8">
          <div className="bg-dark-card border border-dark-border rounded-xl w-full max-w-2xl">

            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-dark-border">
              <div>
                <h2 className="text-xl font-bold text-white">{trade.ticker || 'BTC'} Trade</h2>
                <p className="text-gray-500 text-sm mt-0.5">
                  {tradeDate.toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </p>
              </div>
              <button
                onClick={handleDeleteTrade}
                disabled={deleting}
                aria-label={deleting ? 'Deleting trade' : 'Delete trade'}
                className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-50 p-1 mt-0.5"
              >
                <Trash2 size={17} />
              </button>
            </div>

            <div className="p-6 space-y-5">

              {/* 1. VERDICT */}
              <div className={`rounded-lg p-4 border ${verdict.bg}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-black ${verdict.color}`}>{verdict.icon}</span>
                  <span className={`text-sm font-bold tracking-wide ${verdict.color}`}>{verdict.label}</span>
                </div>
                <p className="text-gray-400 text-sm mt-1">{verdict.desc}</p>
              </div>

              {/* 2. PERFORMANCE */}
              <div>
                <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Performance</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-lg p-4 border ${
                    trade.gainLoss >= 0
                      ? 'bg-green-500/5 border-green-500/15'
                      : 'bg-red-500/5 border-red-500/15'
                  }`}>
                    <div className="text-gray-500 text-xs mb-1">Gain / Loss</div>
                    <div className={`text-2xl font-bold ${trade.gainLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {gainPrefix}{absGain}
                    </div>
                  </div>

                  <div className="bg-dark-bg rounded-lg p-4">
                    <div className="text-gray-500 text-xs mb-1">Return</div>
                    <div className={`text-2xl font-bold ${trade.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.pnlPercent?.toFixed(2)}%
                    </div>
                  </div>

                  <div className={`rounded-lg p-4 ${
                    isOverRisk
                      ? 'bg-orange-500/10 border border-orange-500/20'
                      : 'bg-dark-bg'
                  }`}>
                    <div className="text-gray-500 text-xs mb-1">Risk Used</div>
                    <div className={`text-base font-bold ${isOverRisk ? 'text-orange-400' : 'text-white'}`}>
                      {riskUsed}
                      {isOverRisk && <span className="ml-1 text-orange-400 text-sm">⚠</span>}
                    </div>
                  </div>

                  <div className="bg-dark-bg rounded-lg p-4">
                    <div className="text-gray-500 text-xs mb-1">R:R Ratio</div>
                    <div className={`text-base font-bold ${
                      trade.rr != null
                        ? (trade.rr >= 1 ? 'text-green-400' : 'text-red-400')
                        : 'text-gray-500'
                    }`}>
                      {rrDisplay}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. EXECUTION */}
              {((trade.executionScore || 0) > 0 || trade.chartPattern) && (
                <div>
                  <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Execution</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {(trade.executionScore || 0) > 0 && (
                      <div className="bg-dark-bg rounded-lg p-4">
                        <div className="text-gray-500 text-xs mb-1">Execution Score</div>
                        <div className={`text-2xl font-bold ${
                          trade.executionScore >= 7 ? 'text-green-400' :
                          trade.executionScore >= 4 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {trade.executionScore}
                          <span className="text-gray-500 text-sm font-normal">/10</span>
                        </div>
                      </div>
                    )}
                    {trade.chartPattern && (
                      <div className="bg-dark-bg rounded-lg p-4">
                        <div className="text-gray-500 text-xs mb-1">Pattern</div>
                        <div className="text-white font-medium text-sm mt-1">{trade.chartPattern}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 4. WHAT WENT WRONG */}
              {wrongPoints.length > 0 && (
                <div>
                  <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">What Went Wrong</h3>
                  <div className="bg-red-500/5 border border-red-500/15 rounded-lg p-4 space-y-2">
                    {wrongPoints.map((point, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. MISTAKE TAGGING */}
              <div>
                <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Tag This Trade</h3>
                <div className="flex flex-wrap gap-2">
                  {MISTAKE_TAGS.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => toggleMistakeTag(tag.id)}
                      disabled={savingTags}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-60 ${
                        localMistakeTags.includes(tag.id)
                          ? 'bg-red-500/25 text-red-300 border border-red-500/50'
                          : 'bg-dark-bg text-gray-400 border border-dark-border hover:border-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. TRADE DETAILS */}
              <div>
                <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Trade Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-dark-bg rounded-lg p-4">
                    <div className="text-gray-500 text-xs mb-1">Direction</div>
                    <div className={`text-lg font-bold ${
                      trade.direction === 'long' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {trade.direction === 'long' ? 'LONG' : 'SHORT'}
                    </div>
                  </div>
                  <div className="bg-dark-bg rounded-lg p-4">
                    <div className="text-gray-500 text-xs mb-1">Result</div>
                    <div className={`text-lg font-bold capitalize ${
                      trade.result === 'win' ? 'text-green-400' :
                      trade.result === 'loss' ? 'text-red-400' : 'text-yellow-400'
                    }`}>
                      {trade.result}
                    </div>
                  </div>
                  <div className="bg-dark-bg rounded-lg p-4">
                    <div className="text-gray-500 text-xs mb-1">Entry Price</div>
                    <div className="text-lg font-bold text-white">
                      ${trade.entryPrice?.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-dark-bg rounded-lg p-4">
                    <div className="text-gray-500 text-xs mb-1">Exit Price</div>
                    <div className="text-lg font-bold text-white">
                      {trade.exitPrice ? `$${trade.exitPrice.toLocaleString()}` : 'Open'}
                    </div>
                  </div>
                  <div className="bg-dark-bg rounded-lg p-4">
                    <div className="text-gray-500 text-xs mb-1">Leverage</div>
                    <div className="text-lg font-bold text-white">{trade.leverage}x</div>
                  </div>
                  <div className="bg-dark-bg rounded-lg p-4">
                    <div className="text-gray-500 text-xs mb-1">Fee</div>
                    <div className="text-lg font-bold text-white">
                      ${trade.fee?.toFixed(2) || '0.00'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 7. CHART */}
              {trade.chartImageUrl && (
                <div>
                  <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Trade Chart</h3>
                  <img
                    src={trade.chartImageUrl}
                    alt="Trade chart"
                    className="w-full rounded-lg border border-dark-border"
                  />
                </div>
              )}

              {/* 8. NOTES */}
              {trade.comment && (
                <div>
                  <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Notes</h3>
                  <div className="bg-dark-bg rounded-lg p-4">
                    <p className="text-gray-300 whitespace-pre-wrap text-sm">{trade.comment}</p>
                  </div>
                </div>
              )}

              {/* 9. NEXT TRADE FOCUS */}
              {nextFocuses.length > 0 && (
                <div>
                  <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Next Trade Focus</h3>
                  <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg p-4 space-y-2">
                    {nextFocuses.map((focus, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-blue-400 mt-0.5 flex-shrink-0">•</span>
                        <span>{focus}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 10. ACTIONS */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => setIsEditing(true)}
                  aria-label="Edit trade"
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium py-3 px-4 rounded-lg transition-all"
                >
                  <Pencil size={15} />
                  Edit Trade
                </button>
                <button
                  onClick={handleSharePnl}
                  disabled={generatingImage}
                  aria-label="Share PnL image"
                  className="flex-1 flex items-center justify-center gap-2 bg-dark-bg hover:bg-dark-border border border-dark-border text-gray-300 hover:text-white font-medium py-3 px-4 rounded-lg transition-all disabled:opacity-50"
                >
                  <ImageDown size={15} />
                  {generatingImage ? 'Generating…' : 'Share PnL'}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-dark-bg hover:bg-dark-border border border-dark-border text-gray-300 hover:text-white font-medium py-3 px-4 rounded-lg transition-all"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
          </div>
        </div>
      )}

      {isEditing && (
        <TradeModal
          isOpen={isEditing}
          editTrade={trade}
          onSaved={() => {
            setIsEditing(false);
            onClose();
          }}
          onClose={() => setIsEditing(false)}
        />
      )}
    </>
  );
}

export default TradeDetailsModal;
