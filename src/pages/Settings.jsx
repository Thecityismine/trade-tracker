import { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Trash2 } from 'lucide-react';

function Settings() {
  const [deposits, setDeposits] = useState([]);
  const [trades, setTrades] = useState([]);
  const [form, setForm] = useState({
    amount: '',
    type: 'deposit',
    date: new Date().toISOString().split('T')[0],
    note: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'deposits'), orderBy('date', 'desc'));
    return onSnapshot(q, (snap) => {
      setDeposits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, 'trades'), (snap) => {
      setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const totalFunded = deposits.reduce(
    (sum, d) => sum + (d.type === 'deposit' ? d.amount : -d.amount), 0
  );
  const totalPnl = trades.reduce((sum, t) => sum + (t.gainLoss || 0), 0);
  const currentBalance = totalFunded + totalPnl;

  const handleAdd = async () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return;
    setSaving(true);
    await addDoc(collection(db, 'deposits'), {
      amount,
      type: form.type,
      date: Timestamp.fromDate(new Date(form.date + 'T12:00:00')),
      note: form.note.trim()
    });
    setForm(f => ({ ...f, amount: '', note: '' }));
    setSaving(false);
  };

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, 'deposits', id));
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold text-white">Settings</h2>

      {/* Current Balance */}
      <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
        <div className="text-gray-400 text-sm mb-1">Current Account Balance</div>
        <div className={`text-3xl font-bold ${currentBalance >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          ${currentBalance.toFixed(2)}
        </div>
        <div className="mt-3 flex space-x-6 text-sm">
          <div>
            <span className="text-gray-500">Total Deposited</span>
            <div className="text-white font-medium">${totalFunded.toFixed(2)}</div>
          </div>
          <div>
            <span className="text-gray-500">All-time P&L</span>
            <div className={`font-medium ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Add Deposit / Withdrawal */}
      <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
        <h3 className="text-white font-semibold mb-4">Log Deposit / Withdrawal</h3>
        <div className="flex flex-wrap gap-3 items-end">

          {/* Type toggle */}
          <div>
            <label className="text-gray-400 text-xs block mb-1">Type</label>
            <div className="flex rounded-lg overflow-hidden border border-dark-border">
              <button
                onClick={() => setForm(f => ({ ...f, type: 'deposit' }))}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  form.type === 'deposit' ? 'bg-green-600 text-white' : 'bg-dark-bg text-gray-400 hover:text-white'
                }`}
              >
                Deposit
              </button>
              <button
                onClick={() => setForm(f => ({ ...f, type: 'withdrawal' }))}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  form.type === 'withdrawal' ? 'bg-red-600 text-white' : 'bg-dark-bg text-gray-400 hover:text-white'
                }`}
              >
                Withdrawal
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="text-gray-400 text-xs block mb-1">Amount</label>
            <div className="flex items-center bg-dark-bg border border-dark-border rounded-lg px-3 py-2 focus-within:border-blue-500">
              <span className="text-gray-400 mr-1">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="bg-transparent text-white w-28 focus:outline-none"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-gray-400 text-xs block mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Note */}
          <div className="flex-1 min-w-36">
            <label className="text-gray-400 text-xs block mb-1">Note (optional)</label>
            <input
              type="text"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white w-full focus:outline-none focus:border-blue-500"
              placeholder="e.g. Initial deposit"
            />
          </div>

          <button
            onClick={handleAdd}
            disabled={!form.amount || parseFloat(form.amount) <= 0 || saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-medium transition-colors"
          >
            {saving ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>

      {/* Funding History */}
      {deposits.length > 0 && (
        <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
          <h3 className="text-white font-semibold mb-4">Funding History</h3>
          <div className="space-y-1">
            {deposits.map(d => (
              <div
                key={d.id}
                className="flex items-center justify-between py-2 border-b border-dark-border last:border-0"
              >
                <div className="flex items-center space-x-4">
                  <span className="text-gray-400 text-sm w-28">
                    {d.date?.toDate?.().toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })}
                  </span>
                  <span className={`text-sm font-medium capitalize ${
                    d.type === 'deposit' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {d.type}
                  </span>
                  {d.note && <span className="text-gray-500 text-sm">{d.note}</span>}
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`font-medium ${d.type === 'deposit' ? 'text-green-400' : 'text-red-400'}`}>
                    {d.type === 'deposit' ? '+' : '-'}${d.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deposits.length === 0 && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg px-4 py-3 text-yellow-400 text-sm">
          Add your initial deposit above to enable accurate % gain tracking on the dashboard.
        </div>
      )}
    </div>
  );
}

export default Settings;
