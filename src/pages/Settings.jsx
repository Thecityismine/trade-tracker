import { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, Timestamp, setDoc } from 'firebase/firestore';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { db } from '../config/firebase';
import { Trash2, Target, AlertTriangle } from 'lucide-react';

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
  const [goalAmount, setGoalAmount] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [maxRisk, setMaxRisk] = useState('');
  const [maxTradesPerDay, setMaxTradesPerDay] = useState('');
  const [maxDailyLoss, setMaxDailyLoss] = useState('');
  const [dailyPnlGoal, setDailyPnlGoal] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

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

  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'user'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGoalAmount(data.goalAmount?.toString() || '');
        setGoalDate(data.goalDate || '');
        setMaxRisk(data.maxRiskPercent?.toString() || '');
        setMaxTradesPerDay(data.maxTradesPerDay?.toString() || '');
        setMaxDailyLoss(data.maxDailyLossPercent?.toString() || '');
        setDailyPnlGoal(data.dailyPnlGoalPercent?.toString() || '');
      }
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

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    await setDoc(doc(db, 'settings', 'user'), {
      goalAmount: parseFloat(goalAmount) || null,
      goalDate: goalDate || null,
      maxRiskPercent: parseFloat(maxRisk) || null,
      maxTradesPerDay: parseInt(maxTradesPerDay) || null,
      maxDailyLossPercent: parseFloat(maxDailyLoss) || null,
      dailyPnlGoalPercent: parseFloat(dailyPnlGoal) || null
    }, { merge: true });
    setSavingSettings(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const equityChartData = (() => {
    const events = [];
    deposits.forEach(d => {
      const date = d.date?.toDate?.() || new Date(d.date);
      if (!Number.isNaN(date.getTime())) events.push({ date, delta: d.type === 'deposit' ? d.amount : -d.amount });
    });
    trades.forEach(t => {
      const date = t.tradeDate?.toDate?.() || new Date(t.tradeDate);
      if (!Number.isNaN(date.getTime()) && t.gainLoss != null) events.push({ date, delta: Number(t.gainLoss) || 0 });
    });
    events.sort((a, b) => a.date - b.date);
    let balance = 0;
    const points = [];
    events.forEach(e => {
      balance += e.delta;
      const label = e.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (points.length > 0 && points[points.length - 1].label === label) {
        points[points.length - 1].balance = +balance.toFixed(2);
      } else {
        points.push({ label, balance: +balance.toFixed(2) });
      }
    });
    return points;
  })();

  const goalAmt = parseFloat(goalAmount) || 0;
  const goalProgress = goalAmt > 0 ? Math.min(100, (currentBalance / goalAmt) * 100) : 0;
  const goalRemaining = Math.max(0, goalAmt - currentBalance);

  const goalPace = (() => {
    if (!goalAmt || !goalDate || currentBalance >= goalAmt) return null;
    const today = new Date();
    const target = new Date(goalDate + 'T00:00');
    const daysLeft = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return null;
    const requiredPerDay = goalRemaining / daysLeft;
    const firstDep = deposits
      .filter(d => d.type === 'deposit')
      .map(d => d.date?.toDate?.() || new Date(d.date))
      .reduce((earliest, d) => d < earliest ? d : earliest, new Date());
    const daysSinceStart = Math.max(1, Math.ceil((today - firstDep) / (1000 * 60 * 60 * 24)));
    const actualPerDay = totalPnl / daysSinceStart;
    return { daysLeft, requiredPerDay, actualPerDay, behind: actualPerDay < requiredPerDay };
  })();

  const riskEducation = (() => {
    const r = parseFloat(maxRisk);
    if (!r || r <= 0) return null;
    return { r, lossesToBlow: Math.floor(100 / r), isHigh: r > 3 };
  })();

  const riskStatus = (() => {
    const r = parseFloat(maxRisk);
    if (!r || r <= 0) return null;
    const violations = trades.filter(t => t.result === 'loss' && Math.abs(t.pnlPercent || 0) > r).length;
    if (violations === 0) return { level: 'green', label: '🟢 Within Rules', violations, bg: 'bg-green-900/20 border-green-800/30', text: 'text-green-400' };
    if (violations <= 3) return { level: 'yellow', label: '🟡 Warning', violations, bg: 'bg-yellow-900/20 border-yellow-800/30', text: 'text-yellow-400' };
    return { level: 'red', label: '🔴 System Violation', violations, bg: 'bg-red-900/20 border-red-800/30', text: 'text-red-400' };
  })();

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

      {goalAmt > 0 && (
        <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
          <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
            <Target size={16} className="text-blue-400" />
            Goal Progress
          </h3>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-bold text-white">${currentBalance.toFixed(2)}</span>
            <span className="text-gray-400 text-sm">/ ${goalAmt.toFixed(2)}</span>
            {goalDate && (
              <span className="text-gray-500 text-xs ml-auto">
                Target: {new Date(goalDate + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
          <div className="w-full bg-dark-bg rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-700 ${goalProgress >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{
                width: `${goalProgress}%`,
                boxShadow: goalProgress >= 100 ? '0 0 8px rgba(34,197,94,0.6)' : '0 0 8px rgba(59,130,246,0.6)'
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{goalProgress.toFixed(1)}% complete</span>
            {goalProgress >= 100
              ? <span className="text-green-400 font-medium">Goal reached!</span>
              : <span>${goalRemaining.toFixed(2)} remaining</span>
            }
          </div>
          {goalPace && (
            <div className="mt-4 pt-3 border-t border-dark-border grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-gray-500 text-xs">Required pace</p>
                <p className="text-white font-bold text-sm">${goalPace.requiredPerDay.toFixed(2)}/day</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Your pace</p>
                <p className={`font-bold text-sm ${goalPace.actualPerDay >= goalPace.requiredPerDay ? 'text-green-400' : 'text-red-400'}`}>
                  ${goalPace.actualPerDay.toFixed(2)}/day
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Status</p>
                <p className={`font-bold text-xs ${goalPace.behind ? 'text-red-400' : 'text-green-400'}`}>
                  {goalPace.behind ? 'Behind schedule' : 'On track'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {riskStatus && (
        <div className={`${riskStatus.bg} border rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-1">
            <p className={`font-bold text-sm ${riskStatus.text}`}>{riskStatus.label}</p>
            <span className="text-gray-500 text-xs">{riskStatus.violations} violation{riskStatus.violations !== 1 ? 's' : ''}</span>
          </div>
          {riskStatus.level === 'green' && (
            <p className="text-green-300/70 text-xs">All trades are within your {parseFloat(maxRisk)}% risk rule. Keep it up.</p>
          )}
          {riskStatus.level === 'yellow' && (
            <p className="text-yellow-300/70 text-xs">{riskStatus.violations} trades breached your limit. Reduce position size before this becomes a pattern.</p>
          )}
          {riskStatus.level === 'red' && (
            <div className="space-y-1">
              <p className="text-red-300 text-xs font-semibold">You are violating your own system.</p>
              <p className="text-red-300/70 text-xs">Reduce position size immediately. {riskStatus.violations} losses exceeded {parseFloat(maxRisk)}% risk.</p>
              <p className="text-red-300/70 text-xs">Trading should be limited until behavior improves.</p>
            </div>
          )}
        </div>
      )}

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

      {/* Goals & Risk Settings */}
      <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
        <h3 className="text-white font-semibold mb-4">Goals &amp; Risk Settings</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs block mb-1">Account Goal ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={goalAmount}
                onChange={e => setGoalAmount(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                placeholder="e.g. 10000"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Goal Target Date</label>
              <input
                type="date"
                value={goalDate}
                onChange={e => setGoalDate(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1">Max Risk Per Trade (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={maxRisk}
              onChange={e => setMaxRisk(e.target.value)}
              className={`w-full sm:w-40 bg-dark-bg border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 ${riskEducation?.isHigh ? 'border-red-700' : 'border-dark-border'}`}
              placeholder="e.g. 2"
            />
            <p className="text-gray-500 text-xs mt-1">Recommended: 1–3% per trade for sustainable trading.</p>
            {riskEducation && (
              <div className={`mt-2 rounded-lg px-3 py-2 text-xs space-y-0.5 ${riskEducation.isHigh ? 'bg-red-900/20 border border-red-800/30' : 'bg-green-900/20 border border-green-800/30'}`}>
                {riskEducation.isHigh ? (
                  <>
                    <p className="text-red-300 font-semibold">⚠ {riskEducation.r}% is not risk management — it's gambling.</p>
                    <p className="text-red-300/70">At {riskEducation.r}%, you need only {riskEducation.lossesToBlow} consecutive losses to blow up.</p>
                    <p className="text-green-400/80">At 2%, you can survive 50+ losses in a row.</p>
                  </>
                ) : (
                  <>
                    <p className="text-green-300 font-semibold">✓ {riskEducation.r}% is within professional range.</p>
                    <p className="text-green-300/70">You can survive {riskEducation.lossesToBlow}+ consecutive losses before blowing up.</p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs block mb-1">Max Trades Per Day</label>
              <input
                type="number"
                min="1"
                step="1"
                value={maxTradesPerDay}
                onChange={e => setMaxTradesPerDay(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                placeholder="e.g. 3"
              />
              <p className="text-gray-500 text-xs mt-1">Soft limit — dashboard will flag when exceeded.</p>
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Max Daily Loss (%)</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={maxDailyLoss}
                onChange={e => setMaxDailyLoss(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                placeholder="e.g. 5"
              />
              <p className="text-gray-500 text-xs mt-1">Stop trading when daily loss hits this %.</p>
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1">Daily P&amp;L Goal (%)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={dailyPnlGoal}
              onChange={e => setDailyPnlGoal(e.target.value)}
              className="w-full sm:w-40 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g. 25"
            />
            <p className="text-gray-500 text-xs mt-1">Target % gain on your account per trading day. Dashboard tracks your progress toward this each day.</p>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className={`w-full py-2.5 rounded-lg font-medium transition-all text-white ${
              settingsSaved ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
            } disabled:opacity-40`}
          >
            {savingSettings ? 'Saving...' : settingsSaved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Account Growth Chart */}
      {equityChartData.length >= 2 && (
        <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
          <h3 className="text-white font-semibold mb-4">Account Growth</h3>
          <div className="w-full h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityChartData}>
                <defs>
                  <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="label" stroke="#9ca3af" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis stroke="#9ca3af" tickFormatter={v => `$${v.toFixed(0)}`} width={55} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#f9fafb', fontWeight: 600 }}
                  formatter={v => [`$${Number(v).toFixed(2)}`, 'Balance']}
                />
                <Area type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} fill="url(#balanceGradient)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
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
