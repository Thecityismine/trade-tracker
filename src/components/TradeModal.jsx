import { useState, useEffect } from 'react';
import { X, Upload } from 'lucide-react';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, updateDoc, doc } from 'firebase/firestore';
import { db, storage } from '../config/firebase';
import { MAX_IMAGE_SIZE_BYTES, uploadImageWithFallback } from '../utils/imageUpload';

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
    leverage: '25',
    gainLoss: '',
    fee: '',
    result: 'win',
    comment: '',
    tradeDate: formatDateForInput(new Date())
  });

  const [chartImage, setChartImage] = useState(null);
  const [chartPreview, setChartPreview] = useState(null);
  const [removeExistingChart, setRemoveExistingChart] = useState(false);
  const [lastTicker, setLastTicker] = useState('BTC');
  const [loading, setLoading] = useState(false);
  const [calculatedPnl, setCalculatedPnl] = useState(0);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadLastTicker();
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
      leverage: editTrade.leverage?.toString() || '25',
      gainLoss: editTrade.gainLoss?.toString() || '',
      fee: editTrade.fee?.toString() || '',
      result: normalizedResult,
      comment: editTrade.comment || '',
      tradeDate: formattedDate
    });
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

      if (pnl > 0) {
        setFormData((prev) => ({ ...prev, result: 'win' }));
      } else if (pnl < 0) {
        setFormData((prev) => ({ ...prev, result: 'loss' }));
      }
    } else {
      setCalculatedPnl(0);
    }
  }, [formData.entryPrice, formData.exitPrice, formData.direction, formData.leverage]);

  const loadLastTicker = async () => {
    try {
      const q = query(collection(db, 'trades'), orderBy('createdAt', 'desc'), limit(1));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const lastTrade = snapshot.docs[0].data();
        setLastTicker(lastTrade.ticker || 'BTC');
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
        entryPrice: parseFloat(formData.entryPrice),
        exitPrice: parseFloat(formData.exitPrice) || null,
        leverage: parseFloat(formData.leverage),
        gainLoss: parseFloat(formData.gainLoss),
        fee: parseFloat(formData.fee) || 0,
        pnlPercent: calculatedPnl,
        result: formData.result,
        comment: formData.comment,
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
          leverage: '25',
          gainLoss: '',
          fee: '',
          result: 'win',
          comment: '',
          tradeDate: formatDateForInput(new Date())
        });
      }
      setChartImage(null);
      setChartPreview(null);
      setRemoveExistingChart(false);
      setCalculatedPnl(0);

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
    <div className="fixed inset-0 bg-black bg-opacity-75 z-[70] p-2 sm:p-4 overflow-y-auto">
      <div className="min-h-full flex items-start sm:items-center justify-center">
        <div className="bg-dark-card border border-dark-border rounded-lg w-full max-w-lg my-2 sm:my-8 max-h-[calc(100vh-1rem)] overflow-y-auto">
          {editTrade ? (
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-dark-border">
              <h2 className="text-xl font-bold text-white">Edit Trade</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          ) : (
            <div className="flex justify-end px-4 sm:px-6 pt-4 sm:pt-6">
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={24} />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">Ticker</label>
              <div className="grid grid-cols-[minmax(0,1fr)_84px_84px] gap-2 items-center">
                <input
                  type="text"
                  name="ticker"
                  value={formData.ticker}
                  onChange={handleInputChange}
                  className="bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, result: 'win' }))}
                  className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                    formData.result === 'win'
                      ? 'bg-green-600 text-white'
                      : 'bg-dark-bg text-gray-400 border border-dark-border hover:border-gray-500'
                  }`}
                >
                  Win
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, result: 'loss' }))}
                  className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                    formData.result === 'loss'
                      ? 'bg-red-600 text-white'
                      : 'bg-dark-bg text-gray-400 border border-dark-border hover:border-gray-500'
                  }`}
                >
                  Loss
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Last: {lastTicker}</p>
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, direction: 'long' }))}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.direction === 'long'
                      ? 'bg-green-600 text-white'
                      : 'bg-dark-bg text-gray-400 border border-dark-border hover:border-gray-500'
                  }`}
                >
                  LONG
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, direction: 'short' }))}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.direction === 'short'
                      ? 'bg-red-600 text-white'
                      : 'bg-dark-bg text-gray-400 border border-dark-border hover:border-gray-500'
                  }`}
                >
                  SHORT
                </button>
              </div>
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Trade Date</label>
              <input
                type="date"
                name="tradeDate"
                value={formData.tradeDate}
                onChange={handleInputChange}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Entry Price</label>
                <input
                  type="number"
                  name="entryPrice"
                  value={formData.entryPrice}
                  onChange={handleInputChange}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Exit Price</label>
                <input
                  type="number"
                  name="exitPrice"
                  value={formData.exitPrice}
                  onChange={handleInputChange}
                  step="0.01"
                  placeholder="Optional"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Gain (USD)</label>
                <input
                  type="number"
                  name="gainLoss"
                  value={formData.gainLoss}
                  onChange={handleInputChange}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Fee (USD)</label>
                <input
                  type="number"
                  name="fee"
                  value={formData.fee}
                  onChange={handleInputChange}
                  step="0.01"
                  placeholder="0.00"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Leverage</label>
                <input
                  type="number"
                  name="leverage"
                  value={formData.leverage}
                  onChange={handleInputChange}
                  step="1"
                  placeholder="25"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Chart Image</label>
              <div className="space-y-2">
                <label className="flex items-center justify-center w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 cursor-pointer hover:border-gray-500 transition-colors">
                  <Upload size={18} className="mr-2 text-gray-400" />
                  <span className="text-gray-400">
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
                      className="w-full rounded-lg border border-dark-border"
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
                      className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full hover:bg-red-700"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Comment</label>
              <textarea
                name="comment"
                value={formData.comment}
                onChange={handleInputChange}
                rows="3"
                placeholder="Notes about the trade..."
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {formError && (
              <p className="text-sm text-red-400 pt-2">{formError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-dark-bg border border-dark-border rounded-lg py-3 text-gray-400 font-medium hover:border-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-lg py-3 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : (editTrade ? 'Save Changes' : 'Save Trade')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default TradeModal;
