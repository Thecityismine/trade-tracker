import { useState, useEffect } from 'react';
import { X, Upload, RefreshCw } from 'lucide-react';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';

function TradeModal({ isOpen, onClose, editTrade = null }) {
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
    tradeDate: new Date().toISOString().split('T')[0]
  });
  
  const [chartImage, setChartImage] = useState(null);
  const [chartPreview, setChartPreview] = useState(null);
  const [lastTicker, setLastTicker] = useState('BTC');
  const [loading, setLoading] = useState(false);
  const [calculatedPnl, setCalculatedPnl] = useState(0);

  // Load last ticker on mount
  useEffect(() => {
    loadLastTicker();
  }, []);

  // Calculate P&L% when prices change
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
      
      // Auto-set result based on P&L
      if (pnl > 0) {
        setFormData(prev => ({ ...prev, result: 'win' }));
      } else if (pnl < 0) {
        setFormData(prev => ({ ...prev, result: 'loss' }));
      }
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
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setChartImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setChartPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const useLastTicker = () => {
    setFormData(prev => ({ ...prev, ticker: lastTicker }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let chartImageUrl = null;

      // Upload chart image if provided
      if (chartImage) {
        const imageRef = ref(storage, `charts/${Date.now()}_${chartImage.name}`);
        await uploadBytes(imageRef, chartImage);
        chartImageUrl = await getDownloadURL(imageRef);
      }

      // Prepare trade data
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
        tradeDate: new Date(formData.tradeDate),
        createdAt: serverTimestamp()
      };

      // Add to Firestore
      await addDoc(collection(db, 'trades'), tradeData);

      // Reset form
      setFormData({
        ticker: formData.ticker, // Keep ticker
        direction: formData.direction, // Keep direction
        entryPrice: '',
        exitPrice: '',
        leverage: '25',
        gainLoss: '',
        fee: '',
        result: 'win',
        comment: '',
        tradeDate: new Date().toISOString().split('T')[0]
      });
      setChartImage(null);
      setChartPreview(null);
      setCalculatedPnl(0);
      
      onClose();
    } catch (error) {
      console.error('Error saving trade:', error);
      alert('Error saving trade. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-dark-card border border-dark-border rounded-lg w-full max-w-lg my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-border">
          <h2 className="text-xl font-bold text-white">New Trade</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Ticker */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">Ticker</label>
            <div className="flex gap-2">
              <input
                type="text"
                name="ticker"
                value={formData.ticker}
                onChange={handleInputChange}
                className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
              <button
                type="button"
                onClick={useLastTicker}
                className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                title="Use last ticker"
              >
                <RefreshCw size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Last: {lastTicker}</p>
          </div>

          {/* Direction */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">Direction</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, direction: 'long' }))}
                className={`py-3 rounded-lg font-medium transition-colors ${
                  formData.direction === 'long'
                    ? 'bg-green-600 text-white'
                    : 'bg-dark-bg text-gray-400 border border-dark-border hover:border-gray-500'
                }`}
              >
                🟢 LONG
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, direction: 'short' }))}
                className={`py-3 rounded-lg font-medium transition-colors ${
                  formData.direction === 'short'
                    ? 'bg-red-600 text-white'
                    : 'bg-dark-bg text-gray-400 border border-dark-border hover:border-gray-500'
                }`}
              >
                🔴 SHORT
              </button>
            </div>
          </div>

          {/* Trade Date */}
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

          {/* Entry Price */}
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

          {/* Exit Price */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">Exit Price</label>
            <input
              type="number"
              name="exitPrice"
              value={formData.exitPrice}
              onChange={handleInputChange}
              step="0.01"
              placeholder="Leave empty if opening"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Leverage */}
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

          {/* Gain/Loss */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">Gain/Loss (USD)</label>
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

          {/* Fee */}
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

          {/* Status */}
          <div>
            <label className="block text-gray-400 text-sm mb-2">Status</label>
            <div className="flex gap-4">
              {['win', 'loss', 'open'].map((status) => (
                <label key={status} className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="result"
                    value={status}
                    checked={formData.result === status}
                    onChange={handleInputChange}
                    className="mr-2"
                  />
                  <span className="text-white capitalize">{status}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Chart Image */}
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
                    }}
                    className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full hover:bg-red-700"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Comment */}
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

          {/* Calculated P&L% */}
          <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
            <div className="text-gray-400 text-sm mb-1">Calculated P&L%</div>
            <div className={`text-2xl font-bold ${
              calculatedPnl >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {calculatedPnl.toFixed(2)}%
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
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
              {loading ? 'Saving...' : 'Save Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TradeModal;
