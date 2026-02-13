import { useState } from 'react';
import { X, Pencil, Trash2 } from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import TradeModal from './TradeModal';

function TradeDetailsModal({ trade, onClose }) {
  const [isEditing, setIsEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!trade) return null;

  const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);

  const handleDeleteTrade = async () => {
    if (!trade.id || deleting) {
      return;
    }

    const shouldDelete = window.confirm('Delete this trade permanently?');
    if (!shouldDelete) {
      return;
    }

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
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4 overflow-y-auto">
        <div className="bg-dark-card border border-dark-border rounded-lg w-full max-w-2xl my-8">
          <div className="flex items-center justify-between p-6 border-b border-dark-border">
            <div>
              <h2 className="text-xl font-bold text-white">{trade.ticker || 'BTC'} Trade</h2>
              <p className="text-gray-400 text-sm mt-1">
                {tradeDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {trade.chartImageUrl && (
              <div>
                <h3 className="text-white font-medium mb-3">Trade Chart</h3>
                <img
                  src={trade.chartImageUrl}
                  alt="Trade chart"
                  className="w-full rounded-lg border border-dark-border"
                />
              </div>
            )}

            <div>
              <h3 className="text-white font-medium mb-3">Trade Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-dark-bg rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Direction</div>
                  <div className={`text-lg font-bold ${
                    trade.direction === 'long' ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {trade.direction === 'long' ? 'LONG' : 'SHORT'}
                  </div>
                </div>

                <div className="bg-dark-bg rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Result</div>
                  <div className={`text-lg font-bold capitalize ${
                    trade.result === 'win' ? 'text-green-500' :
                    trade.result === 'loss' ? 'text-red-500' : 'text-yellow-500'
                  }`}>
                    {trade.result}
                  </div>
                </div>

                <div className="bg-dark-bg rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Entry Price</div>
                  <div className="text-lg font-bold text-white">
                    ${trade.entryPrice?.toLocaleString()}
                  </div>
                </div>

                <div className="bg-dark-bg rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Exit Price</div>
                  <div className="text-lg font-bold text-white">
                    {trade.exitPrice ? `$${trade.exitPrice.toLocaleString()}` : 'Open'}
                  </div>
                </div>

                <div className="bg-dark-bg rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Leverage</div>
                  <div className="text-lg font-bold text-white">
                    {trade.leverage}x
                  </div>
                </div>

                <div className="bg-dark-bg rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Fee</div>
                  <div className="text-lg font-bold text-white">
                    ${trade.fee?.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-white font-medium mb-3">Performance</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-dark-bg rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">P&L %</div>
                  <div className={`text-2xl font-bold ${
                    trade.pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {trade.pnlPercent?.toFixed(2)}%
                  </div>
                </div>

                <div className="bg-dark-bg rounded-lg p-4">
                  <div className="text-gray-400 text-sm mb-1">Gain/Loss</div>
                  <div className={`text-2xl font-bold ${
                    trade.gainLoss >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}>
                    ${trade.gainLoss?.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {trade.comment && (
              <div>
                <h3 className="text-white font-medium mb-3">Comment</h3>
                <div className="bg-dark-bg rounded-lg p-4">
                  <p className="text-gray-300 whitespace-pre-wrap">{trade.comment}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteTrade}
                disabled={deleting}
                  aria-label={deleting ? 'Deleting trade' : 'Delete trade'}
                className="w-12 h-12 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Trash2 size={18} />
              </button>
              <button
                onClick={() => setIsEditing(true)}
                  aria-label="Edit trade"
                className="w-12 h-12 bg-dark-bg border border-dark-border hover:border-gray-500 rounded-lg text-white transition-colors flex items-center justify-center"
              >
                <Pencil size={18} />
              </button>
              </div>
              <button
                onClick={onClose}
                className="min-w-[120px] bg-blue-600 hover:bg-blue-700 rounded-lg py-3 px-4 text-white font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

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
