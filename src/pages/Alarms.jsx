import { useState, useEffect, useRef } from 'react';
import { Bell, BellOff, Plus, Trash2, Play, Pencil, Check, X } from 'lucide-react';

const SOUNDS = {
  short: {
    label: 'Short Beep',
    description: 'Single clean tone',
    play: (ctx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    }
  },
  double: {
    label: 'Double Beep',
    description: 'Two quick pulses',
    play: (ctx) => {
      [0, 0.35].forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.5, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.25);
      });
    }
  },
  alert: {
    label: 'Alert Tone',
    description: 'Rising alarm sequence',
    play: (ctx) => {
      [440, 554, 659, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.18);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.18);
      });
    }
  }
};

function playSound(soundKey) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  SOUNDS[soundKey].play(ctx);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime12(time24) {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function Alarms() {
  const [alarms, setAlarms] = useState(() => {
    try { return JSON.parse(localStorage.getItem('trade-alarms') || '[]'); }
    catch { return []; }
  });

  const [form, setForm] = useState({
    time: '',
    label: '',
    sound: 'short',
    days: [0, 1, 2, 3, 4, 5, 6]
  });

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const [ringing, setRinging] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const firedRef = useRef(new Set());

  useEffect(() => {
    localStorage.setItem('trade-alarms', JSON.stringify(alarms));
  }, [alarms]);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      const today = now.toISOString().split('T')[0];
      const dayOfWeek = now.getDay();

      alarms.forEach(alarm => {
        if (!alarm.enabled || alarm.time !== hhmm) return;
        if (!alarm.days.includes(dayOfWeek)) return;
        const key = `${alarm.id}-${today}-${hhmm}`;
        if (firedRef.current.has(key)) return;
        firedRef.current.add(key);
        playSound(alarm.sound);
        setRinging(alarm.id);
        setTimeout(() => setRinging(r => r === alarm.id ? null : r), 5000);
      });
    };

    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [alarms]);

  const addAlarm = () => {
    if (!form.time || form.days.length === 0) return;
    const alarm = {
      id: Date.now().toString(),
      time: form.time,
      label: form.label.trim() || 'Alarm',
      sound: form.sound,
      days: [...form.days].sort(),
      enabled: true
    };
    setAlarms(prev => [...prev, alarm].sort((a, b) => a.time.localeCompare(b.time)));
    setForm(f => ({ ...f, time: '', label: '' }));
  };

  const startEdit = (alarm) => {
    setEditingId(alarm.id);
    setEditForm({ time: alarm.time, label: alarm.label, sound: alarm.sound, days: [...alarm.days] });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = () => {
    if (!editForm.time || editForm.days.length === 0) return;
    setAlarms(prev =>
      prev.map(a =>
        a.id === editingId
          ? { ...a, time: editForm.time, label: editForm.label.trim() || 'Alarm', sound: editForm.sound, days: [...editForm.days].sort() }
          : a
      ).sort((a, b) => a.time.localeCompare(b.time))
    );
    cancelEdit();
  };

  const toggleEditDay = (day) => {
    setEditForm(f => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day]
    }));
  };

  const toggleAlarm = (id) => {
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const deleteAlarm = (id) => {
    setAlarms(prev => prev.filter(a => a.id !== id));
    if (editingId === id) cancelEdit();
  };

  const toggleDay = (day) => {
    setForm(f => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day]
    }));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Alarms</h2>
        <span className="text-gray-400 font-mono text-sm">{currentTime}</span>
      </div>

      {/* Sound Preview */}
      <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
        <h3 className="text-white font-semibold mb-4">Beep Options — Preview</h3>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(SOUNDS).map(([key, s]) => (
            <div key={key} className="bg-dark-bg rounded-xl p-4 border border-dark-border text-center flex flex-col items-center gap-2">
              <div className="text-white text-sm font-semibold">{s.label}</div>
              <div className="text-gray-500 text-xs">{s.description}</div>
              <button
                onClick={() => playSound(key)}
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
              >
                <Play size={12} /> Preview
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add Alarm */}
      <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
        <h3 className="text-white font-semibold mb-4">Add Alarm</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs block mb-1">Time</label>
              <input
                type="time"
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Market Open"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-2">Sound</label>
            <div className="flex gap-2">
              {Object.entries(SOUNDS).map(([key, s]) => (
                <button
                  key={key}
                  onClick={() => setForm(f => ({ ...f, sound: key }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    form.sound === key
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-dark-bg border-dark-border text-gray-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-2">Repeat on days</label>
            <div className="flex gap-1.5">
              {DAYS.map((day, i) => (
                <button
                  key={day}
                  onClick={() => toggleDay(i)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    form.days.includes(i)
                      ? 'bg-blue-600 text-white'
                      : 'bg-dark-bg text-gray-500 hover:text-gray-300 border border-dark-border'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={addAlarm}
            disabled={!form.time || form.days.length === 0}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Add Alarm
          </button>
        </div>
      </div>

      {/* Alarm List */}
      {alarms.length > 0 ? (
        <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
          <h3 className="text-white font-semibold mb-4">Scheduled Alarms</h3>
          <div className="space-y-2">
            {alarms.map(alarm => (
              <div
                key={alarm.id}
                className={`rounded-xl border transition-all ${
                  ringing === alarm.id
                    ? 'bg-blue-900/30 border-blue-500 shadow-[0_0_14px_rgba(59,130,246,0.35)]'
                    : editingId === alarm.id
                    ? 'bg-dark-bg border-blue-500/50'
                    : 'bg-dark-bg border-dark-border'
                }`}
              >
                {editingId === alarm.id ? (
                  /* ── Edit form ── */
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-gray-400 text-xs block mb-1">Time</label>
                        <input
                          type="time"
                          value={editForm.time}
                          onChange={e => setEditForm(f => ({ ...f, time: e.target.value }))}
                          className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-gray-400 text-xs block mb-1">Label</label>
                        <input
                          type="text"
                          value={editForm.label}
                          onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                          className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-gray-400 text-xs block mb-2">Sound</label>
                      <div className="flex gap-2">
                        {Object.entries(SOUNDS).map(([key, s]) => (
                          <button
                            key={key}
                            onClick={() => setEditForm(f => ({ ...f, sound: key }))}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                              editForm.sound === key
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-dark-card border-dark-border text-gray-400 hover:text-white'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-gray-400 text-xs block mb-2">Repeat on days</label>
                      <div className="flex gap-1.5">
                        {DAYS.map((day, i) => (
                          <button
                            key={day}
                            onClick={() => toggleEditDay(i)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              editForm.days.includes(i)
                                ? 'bg-blue-600 text-white'
                                : 'bg-dark-card text-gray-500 hover:text-gray-300 border border-dark-border'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={saveEdit}
                        disabled={!editForm.time || editForm.days.length === 0}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Check size={14} /> Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex-1 py-2 bg-dark-card border border-dark-border hover:border-gray-500 text-gray-400 hover:text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                      >
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── View row ── */
                  <div className="flex items-center gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <div className={`font-mono font-bold text-xl leading-none ${alarm.enabled ? 'text-white' : 'text-gray-600'}`}>
                        {formatTime12(alarm.time)}
                      </div>
                      <div className={`text-sm mt-0.5 ${alarm.enabled ? 'text-gray-300' : 'text-gray-600'}`}>
                        {alarm.label}
                      </div>
                      <div className="flex gap-1 mt-2">
                        {DAYS.map((d, i) => (
                          <span
                            key={d}
                            className={`text-[10px] font-medium ${
                              alarm.days.includes(i) && alarm.enabled ? 'text-blue-400' : 'text-gray-700'
                            }`}
                          >
                            {d[0]}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-gray-600 hidden sm:block">{SOUNDS[alarm.sound]?.label}</span>
                      {ringing === alarm.id && (
                        <span className="text-blue-400 text-xs font-semibold animate-pulse">Ringing</span>
                      )}
                      <button
                        onClick={() => startEdit(alarm)}
                        className="text-gray-500 hover:text-yellow-400 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => toggleAlarm(alarm.id)}
                        className={`transition-colors ${alarm.enabled ? 'text-blue-400 hover:text-blue-300' : 'text-gray-600 hover:text-gray-400'}`}
                        title={alarm.enabled ? 'Disable' : 'Enable'}
                      >
                        {alarm.enabled ? <Bell size={18} /> : <BellOff size={18} />}
                      </button>
                      <button
                        onClick={() => deleteAlarm(alarm.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-dark-card rounded-xl p-6 border border-dark-border text-center text-gray-500 text-sm">
          No alarms set. Add one above.
        </div>
      )}
    </div>
  );
}

export default Alarms;
