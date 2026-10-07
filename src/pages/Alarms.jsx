import { useState, useEffect, useRef } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { SOUNDS, playSound } from '../utils/alarmSounds';
import { Bell, BellOff, Plus, Trash2, Play, Pencil, Check, X, BellRing } from 'lucide-react';
import Page from '../components/ui/Page';
import Button, { Chip } from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { Card, Panel } from '../components/ui/Surface';
import { useToast } from '../components/ui/Toast';
import {
  getStoredDeviceId, isIOS, isStandalone, pushConfigured, pushSupported, registerAlarmDevice, sendTestAlarm
} from '../utils/alarmPush';

const notificationsSupported = typeof Notification !== 'undefined';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime12(time24) {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Turns on push so alarms reach this device while the app is closed. */
function PushCard({ permission, registered, busy, onEnable, onTest }) {
  let message;
  let action = null;

  if (registered) {
    message = 'Notifications are on for this device. Alarms pop up with your phone\'s notification sound, even when the app is closed.';
    action = <Button size="sm" variant="secondary" onClick={onTest} disabled={busy}>{busy ? 'Sending…' : 'Send test'}</Button>;
  } else if (isIOS() && !isStandalone()) {
    message = 'To get alarms on your iPhone when the app is closed, tap Share → Add to Home Screen, then open Trade Tracker from your Home Screen and turn notifications on here.';
  } else if (!pushSupported()) {
    message = 'This browser can\'t get notifications when the app is closed. Alarms will only sound while it is open.';
  } else if (!pushConfigured()) {
    message = 'Background notifications aren\'t set up yet (missing VITE_FIREBASE_VAPID_KEY). Alarms will only sound while the app is open.';
  } else if (permission === 'denied') {
    message = isIOS()
      ? 'Notifications are blocked. Turn them on in iPhone Settings → Notifications → Trade Tracker.'
      : 'Notifications are blocked. Turn them on in your browser\'s site settings.';
  } else {
    message = 'Turn on notifications so alarms pop up with sound even when the app is closed or your phone is locked.';
    action = <Button size="sm" onClick={onEnable} disabled={busy}>{busy ? 'Turning on…' : 'Turn on'}</Button>;
  }

  return (
    <div className="bg-surface rounded-card p-4 flex items-center justify-between gap-3 shadow-elev-1">
      <div className="flex items-center gap-2 text-sm text-content-secondary">
        <BellRing size={16} className={`shrink-0 ${registered ? 'text-profit' : 'text-brand'}`} />
        {message}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// alarms + ringing come from App.jsx so the ticker runs on every tab
function Alarms({ alarms = [], ringing }) {
  const [form, setForm] = useState({
    time: '',
    label: '',
    sound: 'short',
    days: [0, 1, 2, 3, 4, 5, 6]
  });

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [notifPermission, setNotifPermission] = useState(
    notificationsSupported ? Notification.permission : 'unsupported'
  );
  const [deviceId, setDeviceId] = useState(() => getStoredDeviceId());
  const [pushBusy, setPushBusy] = useState(false);
  const toast = useToast();

  const enablePush = async () => {
    setPushBusy(true);
    try {
      setDeviceId(await registerAlarmDevice());
      toast.success('This device will get alarm notifications.');
    } catch (err) {
      console.error('Alarm push registration failed:', err);
      toast.error(err.message || 'Could not turn on notifications.');
    } finally {
      if (notificationsSupported) setNotifPermission(Notification.permission);
      setPushBusy(false);
    }
  };

  const testPush = async () => {
    setPushBusy(true);
    try {
      await sendTestAlarm(deviceId);
      toast.success('Test sent — it should pop up in a few seconds.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPushBusy(false);
    }
  };

  // Push tokens rotate; re-saving on each visit keeps the server's copy (and
  // this device's time zone) current. Permission is already granted, so no prompt.
  useEffect(() => {
    if (!deviceId || !pushConfigured() || !pushSupported() || Notification.permission !== 'granted') return;
    registerAlarmDevice().then(setDeviceId).catch((err) => console.error('Alarm push refresh failed:', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = () => setCurrentTime(
      new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const addAlarm = async () => {
    if (!form.time || form.days.length === 0) return;
    await addDoc(collection(db, 'alarms'), {
      time: form.time,
      label: form.label.trim() || 'Alarm',
      sound: form.sound,
      days: [...form.days].sort(),
      enabled: true
    });
    setForm(f => ({ ...f, time: '', label: '' }));
  };

  const startEdit = (alarm) => {
    setEditingId(alarm.id);
    setEditForm({ time: alarm.time, label: alarm.label, sound: alarm.sound, days: [...alarm.days] });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  const saveEdit = async () => {
    if (!editForm.time || editForm.days.length === 0) return;
    await updateDoc(doc(db, 'alarms', editingId), {
      time: editForm.time,
      label: editForm.label.trim() || 'Alarm',
      sound: editForm.sound,
      days: [...editForm.days].sort()
    });
    cancelEdit();
  };

  const toggleAlarm = (alarm) => {
    updateDoc(doc(db, 'alarms', alarm.id), { enabled: !alarm.enabled });
  };

  const deleteAlarm = async (id) => {
    await deleteDoc(doc(db, 'alarms', id));
    if (editingId === id) cancelEdit();
  };

  const toggleDay = (day, isEdit = false) => {
    if (isEdit) {
      setEditForm(f => ({
        ...f,
        days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day]
      }));
    } else {
      setForm(f => ({
        ...f,
        days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day]
      }));
    }
  };

  return (
    <Page
      toolbar={<span className="tabular text-sm text-content-secondary">{currentTime}</span>}
    >
      <PushCard
        permission={notifPermission}
        registered={Boolean(deviceId) && notifPermission === 'granted'}
        busy={pushBusy}
        onEnable={enablePush}
        onTest={testPush}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-6">
      {/* Add Alarm */}
      <Card>
        <h3 className="mb-4 font-semibold text-content-primary">Add Alarm</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="text-content-secondary text-xs block mb-1">Time</label>
              <input
                type="time"
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                className="block h-[42px] w-full min-w-0 appearance-none bg-surface-raised border border-line-strong rounded-lg px-3 py-2 text-content-primary focus:outline-none focus:border-brand"
              />
            </div>
            <div className="min-w-0">
              <label className="text-content-secondary text-xs block mb-1">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Market Open"
                className="w-full bg-surface-raised border border-line-strong rounded-lg px-3 py-2 text-content-primary focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          <div>
            <label className="text-content-secondary text-xs block mb-2">Sound</label>
            <div className="flex gap-2">
              {Object.entries(SOUNDS).map(([key, s]) => (
                <button
                  key={key}
                  onClick={() => setForm(f => ({ ...f, sound: key }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    form.sound === key
                      ? 'bg-brand border-brand text-content-primary'
                      : 'bg-surface-raised border-line text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-content-secondary">Repeat on days</label>
              <div className="flex gap-2 text-[11px]">
                <button
                  onClick={() => setForm(f => ({ ...f, days: [0, 1, 2, 3, 4, 5, 6] }))}
                  className="text-content-muted transition-colors hover:text-brand"
                >
                  Every day
                </button>
                <button
                  onClick={() => setForm(f => ({ ...f, days: [1, 2, 3, 4, 5] }))}
                  className="text-content-muted transition-colors hover:text-brand"
                >
                  Weekdays
                </button>
                <button
                  onClick={() => setForm(f => ({ ...f, days: [] }))}
                  className="text-content-muted transition-colors hover:text-brand"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex gap-1.5">
              {DAYS.map((day, i) => (
                <Chip
                  key={day}
                  selected={form.days.includes(i)}
                  onClick={() => toggleDay(i)}
                  className="flex-1"
                >
                  {day}
                </Chip>
              ))}
            </div>
          </div>

          <Button
            icon={Plus}
            onClick={addAlarm}
            disabled={!form.time || form.days.length === 0}
            className="w-full"
          >
            Add Alarm
          </Button>
        </div>
      </Card>

      {/* Sound Preview */}
      <Card>
        <h3 className="mb-4 font-semibold text-content-primary">Beep Options — Preview</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Object.entries(SOUNDS).map(([key, s]) => (
            <Panel key={key} className="flex flex-col items-center gap-2 text-center">
              <div className="text-sm font-semibold text-content-primary">{s.label}</div>
              <div className="text-xs text-content-muted">{s.description}</div>
              <button
                onClick={() => playSound(key)}
                className="mt-1 flex items-center gap-1.5 text-xs text-brand transition-colors hover:text-brand-hover"
              >
                <Play size={12} /> Preview
              </button>
            </Panel>
          ))}
        </div>
      </Card>
      </div>

      {/* Alarm List */}
      {alarms.length > 0 ? (
        <Card>
          <h3 className="mb-4 font-semibold text-content-primary">Scheduled Alarms</h3>
          <div className="space-y-2">
            {alarms.map(alarm => (
              <div
                key={alarm.id}
                className={`rounded-xl border transition-all ${
                  ringing === alarm.id
                    ? 'bg-brand-muted border-brand shadow-[0_0_14px_rgba(59,130,246,0.35)]'
                    : editingId === alarm.id
                    ? 'bg-surface-raised border-brand/50'
                    : 'bg-surface-raised border-line'
                }`}
              >
                {editingId === alarm.id ? (
                  /* ── Edit form ── */
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-content-secondary text-xs block mb-1">Time</label>
                        <input
                          type="time"
                          value={editForm.time}
                          onChange={e => setEditForm(f => ({ ...f, time: e.target.value }))}
                          className="block h-[42px] w-full min-w-0 appearance-none bg-surface border border-line-strong rounded-lg px-3 py-2 text-content-primary focus:outline-none focus:border-brand"
                        />
                      </div>
                      <div>
                        <label className="text-content-secondary text-xs block mb-1">Label</label>
                        <input
                          type="text"
                          value={editForm.label}
                          onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                          className="w-full bg-surface border border-line-strong rounded-lg px-3 py-2 text-content-primary focus:outline-none focus:border-brand"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-content-secondary text-xs block mb-2">Sound</label>
                      <div className="flex gap-2">
                        {Object.entries(SOUNDS).map(([key, s]) => (
                          <button
                            key={key}
                            onClick={() => setEditForm(f => ({ ...f, sound: key }))}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                              editForm.sound === key
                                ? 'bg-brand border-brand text-content-primary'
                                : 'bg-surface border-line text-content-secondary hover:text-content-primary shadow-elev-1'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-content-secondary text-xs block mb-2">Repeat on days</label>
                      <div className="flex gap-1.5">
                        {DAYS.map((day, i) => (
                          <button
                            key={day}
                            onClick={() => toggleDay(i, true)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              editForm.days.includes(i)
                                ? 'bg-brand text-content-primary'
                                : 'bg-surface text-content-muted hover:text-content-primary shadow-elev-1'
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
                        className="flex-1 py-2 bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-content-primary rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Check size={14} /> Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex-1 py-2 bg-surface border border-line-strong hover:border-brand/50 text-content-secondary hover:text-content-primary rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                      >
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── View row ── */
                  <div className="flex items-center gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <div className={`font-mono font-bold text-xl leading-none ${alarm.enabled ? 'text-content-primary' : 'text-content-muted'}`}>
                        {formatTime12(alarm.time)}
                      </div>
                      <div className={`text-sm mt-0.5 ${alarm.enabled ? 'text-content-secondary' : 'text-content-muted'}`}>
                        {alarm.label}
                      </div>
                      <div className="flex gap-1 mt-2">
                        {DAYS.map((d, i) => (
                          <span
                            key={d}
                            className={`text-[10px] font-medium ${
                              alarm.days?.includes(i) && alarm.enabled ? 'text-brand' : 'text-content-muted'
                            }`}
                          >
                            {d[0]}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-content-muted hidden sm:block">{SOUNDS[alarm.sound]?.label}</span>
                      {ringing === alarm.id && (
                        <span className="text-brand text-xs font-semibold animate-pulse">Ringing</span>
                      )}
                      <button
                        onClick={() => startEdit(alarm)}
                        className="text-content-muted hover:text-warn transition-colors"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => toggleAlarm(alarm)}
                        className={`transition-colors ${alarm.enabled ? 'text-brand hover:text-brand-hover' : 'text-content-muted hover:text-content-secondary'}`}
                        title={alarm.enabled ? 'Disable' : 'Enable'}
                      >
                        {alarm.enabled ? <Bell size={18} /> : <BellOff size={18} />}
                      </button>
                      <button
                        onClick={() => deleteAlarm(alarm.id)}
                        className="text-content-muted hover:text-loss transition-colors"
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
        </Card>
      ) : (
        <EmptyState
          icon={BellOff}
          title="No alarms set"
          description="Add a time on the left and it will fire in any open tab — you don't have to stay on this page."
        />
      )}
      </div>

      <p className="pb-2 text-center text-xs text-content-muted">
        While the app is open, alarms play the sound you picked. When it's closed, devices with notifications on get a pop-up with the phone's notification sound.
      </p>
    </Page>
  );
}

export default Alarms;
