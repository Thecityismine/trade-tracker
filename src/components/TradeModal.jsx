import { useState, useEffect } from 'react';
import { X, Upload } from 'lucide-react';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { db, storage } from '../config/firebase';
import { MAX_IMAGE_SIZE_BYTES, uploadImageWithFallback } from '../utils/imageUpload';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Select from './ui/Select';
import DateField from './ui/DateField';

// The submit button lives in the Modal footer, outside the <form>, so it binds
// back to it by id.
const FORM_ID = 'trade-form';

const formatDateForInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const mergeDateWithExistingTime = (dateString, existingDate) => {
  const merged = parseLocalDate(dateString);

  if (existingDate && !Number.isNaN(existingDate.getTime())) {
    merged.setHours(
      existingDate.getHours(),
      existingDate.getMinutes(),
      existingDate.getSeconds(),
      existingDate.getMilliseconds()
    );
  }

  return merged;
};

function TradeModal({ isOpen, onClose, editTrade = null, onSaved = null }) {
  const [formData, setFormData] = useState({
    ticker: 'BTC',
    direction: 'long',
    entryPrice: '',
    exitPrice: '',
    stopLoss: '',
    targetPrice: '',
    leverage: '25',
    gainLoss: '',
    fee: '',
    result: 'win',
    comment: '',
    entryReason: '',
    chartPattern: '',
    strategyId: '',
    executionScore: 5,
    tradeDate: formatDateForInput(new Date())
  });

  // 'open' hides every field that only exists once a trade resolves. New trades
  // default to closed so the existing log-it-after-the-fact flow is unchanged.
  const [tradeStatus, setTradeStatus] = useState('closed');
  const isOpenPosition = tradeStatus === 'open';
  const [plannedRR, setPlannedRR] = useState(null);
  const [chartImage, setChartImage] = useState(null);
  const [chartPreview, setChartPreview] = useState(null);
  const [removeExistingChart, setRemoveExistingChart] = useState(false);
  const [lastTicker, setLastTicker] = useState('BTC');
  const [loading, setLoading] = useState(false);
  const [calculatedPnl, setCalculatedPnl] = useState(0);
  const [formError, setFormError] = useState('');
  const [priceMovePercent, setPriceMovePercent] = useState(0);
  const [riskReward, setRiskReward] = useState(null);
  const [strategies, setStrategies] = useState([]);

  useEffect(() => {
    loadLastTicker();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'strategies'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setStrategies(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => {
        console.error('Error loading strategies for trade modal:', error);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!editTrade) {
      return;
    }

    const tradeDate = editTrade.tradeDate?.toDate?.() || new Date(editTrade.tradeDate);
    const formattedDate = Number.isNaN(tradeDate.getTime())
      ? formatDateForInput(new Date())
      : formatDateForInput(tradeDate);

    const normalizedResult = editTrade.result === 'loss' ? 'loss' : 'win';

    setFormData({
      ticker: editTrade.ticker || 'BTC',
      direction: editTrade.direction || 'long',
      entryPrice: editTrade.entryPrice?.toString() || '',
      exitPrice: editTrade.exitPrice?.toString() || '',
      stopLoss: editTrade.stopLoss?.toString() || '',
      targetPrice: editTrade.targetPrice?.toString() || '',
      leverage: editTrade.leverage?.toString() || '25',
      gainLoss: editTrade.gainLoss?.toString() || '',
      fee: editTrade.fee?.toString() || '',
      result: normalizedResult,
      comment: editTrade.comment || '',
      entryReason: editTrade.entryReason || '',
      chartPattern: editTrade.chartPattern || '',
      strategyId: editTrade.strategyId || '',
      executionScore: editTrade.executionScore || 5,
      tradeDate: formattedDate
    });
    setTradeStatus(editTrade.status === 'open' ? 'open' : 'closed');
    setChartImage(null);
    setChartPreview(editTrade.chartImageUrl || null);
    setRemoveExistingChart(false);
  }, [editTrade]);

  useEffect(() => {
    if (formData.entryPrice && formData.exitPrice) {
      const entry = parseFloat(formData.entryPrice);
      const exit = parseFloat(formData.exitPrice);
      const leverage = parseFloat(formData.leverage) || 1;

      let pnl = 0;
      if (formData.direction === 'long') {
        pnl = ((exit - entry) / entry) * 100 * leverage;
      } else {
        pnl = ((entry - exit) / entry) * 100 * leverage;
      }

      setCalculatedPnl(pnl);
    } else {
      setCalculatedPnl(0);
    }
  }, [formData.entryPrice, formData.exitPrice, formData.direction, formData.leverage]);

  useEffect(() => {
    const entry = parseFloat(formData.entryPrice);
    const exit = parseFloat(formData.exitPrice);
    const leverage = parseFloat(formData.leverage) || 1;

    if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0) {
      setPriceMovePercent(0);
      return;
    }

    const rawPercent = formData.direction === 'long'
      ? ((exit - entry) / entry) * 100
      : ((entry - exit) / entry) * 100;

    setPriceMovePercent(rawPercent * leverage);
  }, [formData.entryPrice, formData.exitPrice, formData.direction, formData.leverage]);

  useEffect(() => {
    const entry = parseFloat(formData.entryPrice);
    const stop = parseFloat(formData.stopLoss);
    const exit = parseFloat(formData.exitPrice);
    const leverage = parseFloat(formData.leverage) || 1;

    if (!Number.isFinite(entry) || !Number.isFinite(stop) || entry <= 0 || stop <= 0 || stop === entry) {
      setRiskReward(null);
      return;
    }

    const riskPercent = (Math.abs(entry - stop) / entry) * 100 * leverage;
    if (riskPercent <= 0) { setRiskReward(null); return; }

    if (Number.isFinite(exit) && exit > 0) {
      const gainPercent = formData.direction === 'long'
        ? ((exit - entry) / entry) * 100 * leverage
        : ((entry - exit) / entry) * 100 * leverage;
      setRiskReward(gainPercent / riskPercent);
    } else {
      setRiskReward(null);
    }
  }, [formData.entryPrice, formData.stopLoss, formData.exitPrice, formData.direction, formData.leverage]);

  // Planned R:R is knowable at entry from stop and target alone. Leverage
  // scales risk and reward equally, so it cancels out of the ratio.
  useEffect(() => {
    const entry = parseFloat(formData.entryPrice);
    const stop = parseFloat(formData.stopLoss);
    const target = parseFloat(formData.targetPrice);

    if (
      ![entry, stop, target].every((n) => Number.isFinite(n) && n > 0) ||
      stop === entry
    ) {
      setPlannedRR(null);
      return;
    }

    setPlannedRR(Math.abs(target - entry) / Math.abs(entry - stop));
  }, [formData.entryPrice, formData.stopLoss, formData.targetPrice]);

  const loadLastTicker = async () => {
    try {
      const q = query(collection(db, 'trades'), orderBy('createdAt', 'desc'), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const lastTrade = snapshot.docs[0].data();
        setLastTicker(lastTrade.ticker || 'BTC');
        if (!editTrade && lastTrade.leverage) {
          setFormData(prev => ({ ...prev, leverage: lastTrade.leverage.toString() }));
        }
      }
    } catch (error) {
      console.error('Error loading last ticker:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        setFormError('Image is too large. Please use an image under 10MB.');
        e.target.value = '';
        return;
      }

      setFormError('');
      setChartImage(file);
      setRemoveExistingChart(false);
      const reader = new FileReader();
      reader.onloadend = () => {
        setChartPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setLoading(true);

    try {
      let chartImageUrl = removeExistingChart ? null : (editTrade?.chartImageUrl || null);
      let chartImageSource = removeExistingChart ? null : (editTrade?.chartImageSource || null);

      if (chartImage) {
        const uploaded = await uploadImageWithFallback({
          file: chartImage,
          storage,
          pathPrefix: 'charts',
          storageTimeoutMs: 10000
        });
        chartImageUrl = uploaded.imageUrl;
        chartImageSource = uploaded.imageSource;
      }

      const tradeData = {
        ticker: formData.ticker,
        direction: formData.direction,
        status: tradeStatus,
        entryPrice: parseFloat(formData.entryPrice),
        stopLoss: parseFloat(formData.stopLoss) || null,
        targetPrice: parseFloat(formData.targetPrice) || null,
        plannedRR,
        leverage: parseFloat(formData.leverage),
        entryReason: formData.entryReason || null,
        // An open position has no result yet. Null these rather than writing
        // zeros — a 0 would read as a real break-even trade downstream.
        exitPrice: isOpenPosition ? null : (parseFloat(formData.exitPrice) || null),
        rr: isOpenPosition ? null : riskReward,
        gainLoss: isOpenPosition ? null : parseFloat(formData.gainLoss),
        fee: isOpenPosition ? null : (parseFloat(formData.fee) || 0),
        pnlPercent: isOpenPosition ? null : calculatedPnl,
        result: isOpenPosition ? null : formData.result,
        closedAt: isOpenPosition ? null : (editTrade?.closedAt || serverTimestamp()),
        comment: formData.comment,
        chartPattern: formData.chartPattern || null,
        strategyId: formData.strategyId || null,
        strategyName: formData.strategyId
          ? (strategies.find((s) => s.id === formData.strategyId)?.name || null)
          : null,
        executionScore: isOpenPosition ? null : Number(formData.executionScore),
        chartImageUrl,
        chartImageSource,
        tradeDate: mergeDateWithExistingTime(
          formData.tradeDate,
          editTrade ? (editTrade.tradeDate?.toDate?.() || new Date(editTrade.tradeDate)) : new Date()
        )
      };

      if (editTrade?.id) {
        await updateDoc(doc(db, 'trades', editTrade.id), {
          ...tradeData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'trades'), {
          ...tradeData,
          createdAt: serverTimestamp()
        });
      }

      if (!editTrade) {
        setFormData({
          ticker: formData.ticker,
          direction: formData.direction,
          entryPrice: '',
          exitPrice: '',
          stopLoss: '',
          targetPrice: '',
          leverage: formData.leverage,
          gainLoss: '',
          fee: '',
          result: 'win',
          comment: '',
          entryReason: '',
          chartPattern: '',
          strategyId: formData.strategyId,
          executionScore: 5,
          tradeDate: formatDateForInput(new Date())
        });
      }
      setChartImage(null);
      setChartPreview(null);
      setRemoveExistingChart(false);
      setCalculatedPnl(0);
      setRiskReward(null);
      setPlannedRR(null);
      setTradeStatus('closed');

      onSaved?.();
      onClose();
    } catch (error) {
      console.error('Error saving trade:', error);
      const message = error?.message || 'Error saving trade. Please try again.';
      setFormError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editTrade ? (isOpenPosition ? 'Edit Position' : 'Edit Trade') : (isOpenPosition ? 'New Position' : 'New Trade')}
      description={
        isOpenPosition
          ? 'Log a position you just opened'
          : editTrade?.status === 'open'
            ? 'Close out this position'
            : editTrade
              ? 'Update the details of this trade'
              : 'Log a closed trade'
      }
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={loading}>
            {loading
              ? 'Saving…'
              : editTrade?.status === 'open' && !isOpenPosition
                ? 'Close Trade'
                : editTrade
                  ? 'Save Changes'
                  : isOpenPosition
                    ? 'Open Position'
                    : 'Save Trade'}
          </Button>
        </>
      }
    >
          <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-content-secondary text-sm mb-2">Trade Status</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTradeStatus('open')}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                    isOpenPosition
                      ? 'bg-brand text-content-primary'
                      : 'bg-surface-raised text-content-secondary border border-line-strong hover:border-brand/50'
                  }`}
                >
                  Still open
                </button>
                <button
                  type="button"
                  onClick={() => setTradeStatus('closed')}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                    !isOpenPosition
                      ? 'bg-brand text-content-primary'
                      : 'bg-surface-raised text-content-secondary border border-line-strong hover:border-brand/50'
                  }`}
                >
                  Closed
                </button>
              </div>
              <p className="text-xs text-content-muted mt-1">
                {isOpenPosition
                  ? 'Logged as a live position — kept out of your stats until you close it.'
                  : 'Counts toward your P&L, win rate and coach review.'}
              </p>
            </div>

            <div>
              <label className="block text-content-secondary text-sm mb-2">Ticker</label>
              <div className={`grid gap-2 items-center ${isOpenPosition ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_84px_84px]'}`}>
                <input
                  type="text"
                  name="ticker"
                  value={formData.ticker}
                  onChange={handleInputChange}
                  className="bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                  required
                />
                {!isOpenPosition && (
                  <>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, result: 'win' }))}
                      className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                        formData.result === 'win'
                          ? 'bg-profit text-canvas'
                          : 'bg-surface-raised text-content-secondary border border-line-strong hover:border-brand/50'
                      }`}
                    >
                      Win
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, result: 'loss' }))}
                      className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                        formData.result === 'loss'
                          ? 'bg-loss text-canvas'
                          : 'bg-surface-raised text-content-secondary border border-line-strong hover:border-brand/50'
                      }`}
                    >
                      Loss
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-content-muted mt-1">Last: {lastTicker}</p>
            </div>

            <div>
              <label className="block text-content-secondary text-sm mb-2">Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, direction: 'long' }))}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.direction === 'long'
                      ? 'bg-profit text-canvas'
                      : 'bg-surface-raised text-content-secondary border border-line-strong hover:border-brand/50'
                  }`}
                >
                  LONG
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, direction: 'short' }))}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.direction === 'short'
                      ? 'bg-loss text-canvas'
                      : 'bg-surface-raised text-content-secondary border border-line-strong hover:border-brand/50'
                  }`}
                >
                  SHORT
                </button>
              </div>
            </div>

            <div>
              <label className="block text-content-secondary text-sm mb-2">
                {isOpenPosition ? 'Entry Date' : 'Trade Date'}
              </label>
              <DateField
                name="tradeDate"
                value={formData.tradeDate}
                onChange={(v) => handleInputChange({ target: { name: 'tradeDate', value: v } })}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-content-secondary text-sm mb-2">Entry Price</label>
                <input
                  type="number"
                  name="entryPrice"
                  value={formData.entryPrice}
                  onChange={handleInputChange}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                  required
                />
              </div>

              {!isOpenPosition && (
                <div>
                  <label className="block text-content-secondary text-sm mb-2">Exit Price</label>
                  <input
                    type="number"
                    name="exitPrice"
                    value={formData.exitPrice}
                    onChange={handleInputChange}
                    step="0.01"
                    placeholder="0.00"
                    className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                  />
                </div>
              )}

              <div>
                <label className="block text-content-secondary text-sm mb-2">Stop Loss</label>
                <input
                  type="number"
                  name="stopLoss"
                  value={formData.stopLoss}
                  onChange={handleInputChange}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                  required={isOpenPosition}
                />
              </div>

              <div>
                <label className="block text-content-secondary text-sm mb-2">
                  Target Price {!isOpenPosition && <span className="text-content-muted">(optional)</span>}
                </label>
                <input
                  type="number"
                  name="targetPrice"
                  value={formData.targetPrice}
                  onChange={handleInputChange}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {!isOpenPosition && (
                <div>
                  <label className="block text-content-secondary text-sm mb-2">% Gain</label>
                  <div
                    className={`w-full border border-line-strong rounded-control px-4 py-2 h-[42px] flex items-center font-medium ${
                      priceMovePercent >= 0 ? 'text-profit' : 'text-loss'
                    }`}
                  >
                    {Number.isFinite(priceMovePercent) ? `${priceMovePercent >= 0 ? '+' : ''}${priceMovePercent.toFixed(2)}%` : '--'}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-content-secondary text-sm mb-2">
                  {isOpenPosition ? 'Planned R:R' : 'R:R Ratio'}
                </label>
                <div
                  className={`w-full border border-line-strong rounded-control px-4 py-2 h-[42px] flex items-center font-medium ${
                    (isOpenPosition ? plannedRR : riskReward) === null
                      ? 'text-content-muted'
                      : (isOpenPosition ? plannedRR : riskReward) >= 1
                        ? 'text-profit'
                        : 'text-loss'
                  }`}
                >
                  {isOpenPosition
                    ? (plannedRR !== null ? `${plannedRR.toFixed(2)}R` : '--')
                    : (riskReward !== null ? `${riskReward.toFixed(2)}R` : '--')}
                </div>
              </div>

              {isOpenPosition && (
                <div>
                  <label className="block text-content-secondary text-sm mb-2">Risk if stopped</label>
                  <div className="w-full border border-line-strong rounded-control px-4 py-2 h-[42px] flex items-center font-medium text-loss">
                    {(() => {
                      const entry = parseFloat(formData.entryPrice);
                      const stop = parseFloat(formData.stopLoss);
                      const lev = parseFloat(formData.leverage) || 1;
                      if (!Number.isFinite(entry) || !Number.isFinite(stop) || entry <= 0) return '--';
                      return `-${((Math.abs(entry - stop) / entry) * 100 * lev).toFixed(2)}%`;
                    })()}
                  </div>
                </div>
              )}

              <div></div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {!isOpenPosition && (
                <div>
                  <label className="block text-content-secondary text-sm mb-2">Gain (USD)</label>
                  <input
                    type="number"
                    name="gainLoss"
                    value={formData.gainLoss}
                    onChange={handleInputChange}
                    step="0.01"
                    placeholder="0.00"
                    className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                    required
                  />
                </div>
              )}

              {!isOpenPosition && (
                <div>
                  <label className="block text-content-secondary text-sm mb-2">Fee (USD)</label>
                  <input
                    type="number"
                    name="fee"
                    value={formData.fee}
                    onChange={handleInputChange}
                    step="0.01"
                    placeholder="0.00"
                    className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                  />
                </div>
              )}

              <div>
                <label className="block text-content-secondary text-sm mb-2">Leverage</label>
                <input
                  type="number"
                  name="leverage"
                  value={formData.leverage}
                  onChange={handleInputChange}
                  step="1"
                  placeholder="25"
                  className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-content-secondary text-sm mb-2">Chart Image</label>
              <div className="space-y-2">
                <label className="flex items-center justify-center w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-3 cursor-pointer hover:border-brand/50 transition-colors">
                  <Upload size={18} className="mr-2 text-content-secondary" />
                  <span className="text-content-secondary">
                    {chartImage ? chartImage.name : 'Upload Chart'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {chartPreview && (
                  <div className="relative">
                    <img
                      src={chartPreview}
                      alt="Chart preview"
                      className="w-full rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setChartImage(null);
                        setChartPreview(null);
                        if (editTrade?.chartImageUrl) {
                          setRemoveExistingChart(true);
                        }
                      }}
                      className="absolute top-2 right-2 rounded-full bg-loss/90 p-1 text-canvas transition-colors hover:bg-loss"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {!isOpenPosition && (
              <div>
                <label className="block text-content-secondary text-sm mb-2">Execution Score: {formData.executionScore}/10</label>
                <input
                  type="range"
                  name="executionScore"
                  min="1"
                  max="10"
                  value={formData.executionScore}
                  onChange={handleInputChange}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-content-muted mt-1">
                  <span>Poor</span><span>Average</span><span>Perfect</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-content-secondary text-sm mb-2">Pattern Used <span className="text-content-muted">(optional)</span></label>
              <input
                type="text"
                name="chartPattern"
                value={formData.chartPattern}
                onChange={handleInputChange}
                placeholder="e.g. Bull Flag, Head & Shoulders"
                className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-content-secondary text-sm mb-2">Strategy <span className="text-content-muted">(optional)</span></label>
              <Select
                name="strategyId"
                value={formData.strategyId}
                onChange={(v) => handleInputChange({ target: { name: 'strategyId', value: v } })}
                placeholder="— No strategy —"
                options={[
                  { value: '', label: '— No strategy —' },
                  ...strategies.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
              {strategies.length === 0 && (
                <p className="text-xs text-content-muted mt-1">Create a strategy in the Strategies tab to link trades to it.</p>
              )}
            </div>

            <div>
              <label className="block text-content-secondary text-sm mb-2">
                Why I entered {isOpenPosition && <span className="text-content-muted">(write this now, before you know)</span>}
              </label>
              <textarea
                name="entryReason"
                value={formData.entryReason}
                onChange={handleInputChange}
                rows="3"
                placeholder="The setup, the trigger, what invalidates it..."
                className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand resize-none"
              />
            </div>

            <div>
              <label className="block text-content-secondary text-sm mb-2">
                {isOpenPosition ? 'Notes' : 'Comment'}
              </label>
              <textarea
                name="comment"
                value={formData.comment}
                onChange={handleInputChange}
                rows="3"
                placeholder="Notes about the trade..."
                className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand resize-none"
              />
            </div>

            {formError && (
              <p className="text-sm text-loss pt-2">{formError}</p>
            )}
          </form>
    </Modal>
  );
}

export default TradeModal;
