import { useEffect, useMemo, useState } from 'react';
import { BookMarked, Eye, ListChecks, Plus, Search, Trash2, Upload } from 'lucide-react';
import { storage } from '../config/firebase';
import { useTrades } from '../context/TradesContext';
import { usePlaybook } from '../hooks/usePlaybook';
import {
  GRADES,
  PLAYBOOK_FIELDS,
  PLAYBOOK_SECTIONS,
  addSpottedTrade,
  addTradeToPlaybook,
  completedFieldCount,
  removeFromPlaybook,
  updatePlaybookEntry,
} from '../utils/playbook';
import { MAX_IMAGE_SIZE_BYTES, uploadImageWithFallback } from '../utils/imageUpload';
import Page, { PageSection } from '../components/ui/Page';
import Button, { Chip } from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import DateField from '../components/ui/DateField';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';

const toDate = (value) => {
  if (!value) return null;
  const date = value?.toDate?.() || new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) =>
  toDate(value)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || 'No date';

const formatDateForInput = (value) => {
  const date = toDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const parseLocalInputDate = (dateString) => {
  if (!dateString) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const money = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const gradeStyles = {
  'A+': 'bg-brand/20 text-brand border-brand/40',
  A: 'bg-profit/15 text-profit border-profit/40',
  B: 'bg-warn/15 text-warn border-warn/40',
  C: 'bg-caution/15 text-caution border-caution/40',
};

const TOTAL_FIELDS = PLAYBOOK_FIELDS.length;
const UNLABELED = 'Unlabeled setup';

/** The trade an entry describes: the live trade when it still exists, else the snapshot taken when it was added. */
const resolveTrade = (entry, tradesById) => (entry.tradeId && tradesById.get(entry.tradeId)) || entry.trade || null;

function Playbook() {
  const { trades } = useTrades();
  const { entries, tradeIds, loading, error } = usePlaybook();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [setupFilter, setSetupFilter] = useState('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(null); // an entry, or { isNew: true } for a spotted trade
  const [pendingOpenId, setPendingOpenId] = useState(null);

  const tradesById = useMemo(() => new Map(trades.map((t) => [t.id, t])), [trades]);

  // After adding a single trade from the picker, open its breakdown as soon as the entry arrives.
  useEffect(() => {
    if (!pendingOpenId) return;
    const entry = entries.find((e) => e.id === pendingOpenId);
    if (entry) {
      setEditing(entry);
      setPendingOpenId(null);
    }
  }, [entries, pendingOpenId]);

  const setupNames = useMemo(() => {
    const names = new Set();
    entries.forEach((e) => e.setupName?.trim() && names.add(e.setupName.trim()));
    trades.forEach((t) => {
      if (t.strategyName) names.add(t.strategyName);
      if (t.chartPattern) names.add(t.chartPattern);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [entries, trades]);

  // Per-setup results, measured only on the trades you actually took.
  const setupStats = useMemo(() => {
    const groups = new Map();
    entries.forEach((entry) => {
      const name = entry.setupName?.trim() || UNLABELED;
      const group = groups.get(name) || { name, entries: 0, aPlus: 0, taken: 0, wins: 0, net: 0 };
      group.entries += 1;
      if (entry.grade === 'A+') group.aPlus += 1;
      const trade = entry.tradeId ? resolveTrade(entry, tradesById) : null;
      if (trade) {
        group.taken += 1;
        if (trade.result === 'win') group.wins += 1;
        group.net += Number(trade.gainLoss) || 0;
      }
      groups.set(name, group);
    });
    return [...groups.values()].sort((a, b) => b.entries - a.entries || b.net - a.net);
  }, [entries, tradesById]);

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
      total: entries.length,
      setups: setupStats.filter((s) => s.name !== UNLABELED).length,
      thisWeek: entries.filter((e) => (toDate(e.createdAt)?.getTime() ?? Date.now()) >= weekAgo).length,
      complete: entries.filter((e) => completedFieldCount(e) === TOTAL_FIELDS).length,
    };
  }, [entries, setupStats]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
      if (setupFilter !== 'all' && (entry.setupName?.trim() || UNLABELED) !== setupFilter) return false;
      if (!term) return true;
      const trade = resolveTrade(entry, tradesById);
      const haystack = [entry.setupName, trade?.ticker, ...PLAYBOOK_FIELDS.map((f) => entry[f.id])]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [entries, search, sourceFilter, setupFilter, tradesById]);

  return (
    <Page
      actionsClassName="w-full flex-nowrap sm:w-auto sm:flex-shrink-0"
      actions={
        <>
          <Button variant="secondary" icon={Eye} onClick={() => setEditing({ isNew: true })} className="min-w-0 flex-1 sm:flex-none">
            <span className="sm:hidden">Spotted Trade</span>
            <span className="hidden sm:inline">Add Spotted Trade</span>
          </Button>
          <Button icon={Plus} onClick={() => setPickerOpen(true)} className="min-w-0 flex-1 sm:flex-none">
            <span className="sm:hidden">From My Trades</span>
            <span className="hidden sm:inline">Add From My Trades</span>
          </Button>
        </>
      }
    >
      {error && (
        <div className="rounded-card border border-loss/30 bg-loss/10 p-4 text-sm text-loss">
          Could not load the Playbook. Check your connection and refresh.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Playbook Trades" value={stats.total} />
        <StatTile label="Setups" value={stats.setups} />
        <StatTile label="Added This Week" value={stats.thisWeek} className="text-brand" />
        <StatTile label="Fully Broken Down" value={`${stats.complete}/${stats.total}`} className="text-profit" />
      </div>

      {setupStats.length > 0 && (
        <PageSection
          title="Your setups"
          description="Do more of what you trade best and drop what you don't. Results count only the playbook trades you took."
        >
          <div className="overflow-x-auto rounded-card bg-surface shadow-elev-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-content-muted">
                  <th className="px-4 py-3 font-medium">Setup</th>
                  <th className="px-4 py-3 text-right font-medium">Entries</th>
                  <th className="px-4 py-3 text-right font-medium">A+</th>
                  <th className="px-4 py-3 text-right font-medium">Taken</th>
                  <th className="px-4 py-3 text-right font-medium">Win Rate</th>
                  <th className="px-4 py-3 text-right font-medium">Net P&L</th>
                </tr>
              </thead>
              <tbody>
                {setupStats.map((s) => (
                  <tr
                    key={s.name}
                    onClick={() => setSetupFilter(setupFilter === s.name ? 'all' : s.name)}
                    className={`cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-surface-raised ${
                      setupFilter === s.name ? 'bg-brand/5' : ''
                    }`}
                  >
                    <td className={`px-4 py-3 font-medium ${s.name === UNLABELED ? 'text-content-muted' : 'text-content-primary'}`}>
                      {s.name}
                    </td>
                    <td className="px-4 py-3 text-right text-content-secondary">{s.entries}</td>
                    <td className="px-4 py-3 text-right text-content-secondary">{s.aPlus}</td>
                    <td className="px-4 py-3 text-right text-content-secondary">{s.taken}</td>
                    <td className="px-4 py-3 text-right text-content-primary">
                      {s.taken ? `${Math.round((s.wins / s.taken) * 100)}%` : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${s.taken ? (s.net >= 0 ? 'text-profit' : 'text-loss') : 'text-content-muted'}`}>
                      {s.taken ? money(s.net) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PageSection>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            placeholder="Search setups and breakdowns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-line-strong bg-surface-raised py-2 pl-9 pr-3 text-sm text-content-primary focus:border-brand focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'mine', label: 'My Trades' },
            { id: 'spotted', label: 'Spotted' },
          ].map((option) => (
            <Chip key={option.id} selected={sourceFilter === option.id} onClick={() => setSourceFilter(option.id)}>
              {option.label}
            </Chip>
          ))}
          {setupFilter !== 'all' && (
            <Chip selected onClick={() => setSetupFilter('all')}>
              {setupFilter} ✕
            </Chip>
          )}
        </div>
      </div>

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={BookMarked}
          title={entries.length === 0 ? 'Your Playbook is empty' : 'No playbook trades match'}
          description={
            entries.length === 0
              ? 'At the close, pick the trade that made the most sense — one you took or one you spotted — and break it down. Only trade what is in here.'
              : 'Try a different search or clear the filters.'
          }
          actionLabel={entries.length === 0 ? 'Add a trade from today' : undefined}
          onAction={entries.length === 0 ? () => setPickerOpen(true) : undefined}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((entry) => (
          <PlaybookCard
            key={entry.id}
            entry={entry}
            trade={resolveTrade(entry, tradesById)}
            onOpen={() => setEditing(entry)}
          />
        ))}
      </div>

      {pickerOpen && (
        <TradePicker
          trades={trades}
          tradeIds={tradeIds}
          onClose={() => setPickerOpen(false)}
          onAdded={(added) => {
            setPickerOpen(false);
            toast.success(added.length === 1 ? 'Added to your Playbook.' : `${added.length} trades added to your Playbook.`);
            if (added.length === 1) setPendingOpenId(added[0]);
          }}
        />
      )}

      {editing && (
        <PlaybookEditor
          entry={editing.isNew ? null : editing}
          trade={editing.isNew ? null : resolveTrade(editing, tradesById)}
          setupNames={setupNames}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  );
}

function StatTile({ label, value, className = 'text-content-primary' }) {
  return (
    <div className="rounded-card bg-surface p-4 shadow-elev-1">
      <p className="text-sm text-content-secondary">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${className}`}>{value}</p>
    </div>
  );
}

function DirectionLabel({ direction }) {
  const isLong = direction !== 'short';
  return <span className={isLong ? 'text-profit' : 'text-loss'}>{isLong ? 'Long' : 'Short'}</span>;
}

function PlaybookCard({ entry, trade, onOpen }) {
  const done = completedFieldCount(entry);
  const firstFilled = PLAYBOOK_FIELDS.find((f) => String(entry[f.id] || '').trim());
  const isMine = entry.source === 'mine';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col overflow-hidden rounded-card bg-surface text-left shadow-elev-1 transition-shadow hover:ring-1 hover:ring-brand/40"
    >
      {entry.imageUrl && (
        <div className="aspect-[16/9] w-full bg-black">
          <img src={entry.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className={`text-base font-semibold ${entry.setupName ? 'text-content-primary' : 'text-content-muted'}`}>
            {entry.setupName || 'Name this setup'}
          </h3>
          {entry.grade && (
            <span className={`flex-shrink-0 rounded border px-2 py-0.5 text-xs font-bold ${gradeStyles[entry.grade] || ''}`}>
              {entry.grade}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-content-secondary">
          <span className={`rounded-full px-2 py-0.5 font-medium ${isMine ? 'bg-brand/15 text-brand' : 'bg-surface-hover text-content-secondary'}`}>
            {isMine ? 'My trade' : 'Spotted'}
          </span>
          <span>{trade?.ticker || entry.ticker || 'BTC'}</span>
          <DirectionLabel direction={trade?.direction || entry.direction} />
          <span>{formatDate(trade?.tradeDate || entry.tradeDate || entry.createdAt)}</span>
          {isMine && trade?.gainLoss != null && (
            <span className={`font-medium ${trade.gainLoss >= 0 ? 'text-profit' : 'text-loss'}`}>{money(trade.gainLoss)}</span>
          )}
        </div>

        <p className="line-clamp-3 whitespace-pre-wrap text-sm text-content-secondary">
          {firstFilled ? (
            <>
              <span className="text-content-muted">{firstFilled.label}: </span>
              {entry[firstFilled.id]}
            </>
          ) : (
            <span className="italic text-content-muted">Not broken down yet — open to fill in the template.</span>
          )}
        </p>

        <div className="mt-auto">
          <div className="mb-1 flex justify-between text-[11px] text-content-muted">
            <span>Breakdown</span>
            <span>{done}/{TOTAL_FIELDS}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-surface-hover">
            <div
              className={`h-full rounded-full ${done === TOTAL_FIELDS ? 'bg-profit' : 'bg-brand'}`}
              style={{ width: `${(done / TOTAL_FIELDS) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </button>
  );
}

const PICKER_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 Days' },
  { id: 'all', label: 'All' },
];

/** Check off one or more closed trades to add them to the playbook. */
function TradePicker({ trades, tradeIds, onClose, onAdded }) {
  const [period, setPeriod] = useState('week');
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return trades.filter((trade) => {
      const date = toDate(trade.tradeDate);
      if (period === 'today') return date?.toDateString() === now.toDateString();
      if (period === 'week') return date && date >= weekAgo;
      return true;
    });
  }, [trades, period]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleAdd = async () => {
    setSaving(true);
    try {
      const ids = [...selected];
      await Promise.all(ids.map((id) => addTradeToPlaybook(trades.find((t) => t.id === id))));
      onAdded(ids);
    } catch (err) {
      console.error('Error adding trades to playbook:', err);
      alert('Could not add those trades. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title="Add From My Trades"
      description="Check off the trades that made the most sense to you."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon={ListChecks} onClick={handleAdd} disabled={selected.size === 0 || saving}>
            {saving ? 'Adding…' : selected.size ? `Add ${selected.size} to Playbook` : 'Add to Playbook'}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex gap-2">
        {PICKER_PERIODS.map((p) => (
          <Chip key={p.id} selected={period === p.id} onClick={() => setPeriod(p.id)}>
            {p.label}
          </Chip>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-content-muted">No closed trades in this period.</p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((trade) => {
            const inPlaybook = tradeIds.has(trade.id);
            const checked = inPlaybook || selected.has(trade.id);
            return (
              <li key={trade.id}>
                <label
                  className={`flex items-center gap-3 px-1 py-3 ${inPlaybook ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-surface-hover'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={inPlaybook}
                    onChange={() => toggle(trade.id)}
                    className="h-4 w-4 accent-brand"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="font-medium text-content-primary">{trade.ticker || 'BTC'}</span>
                      <DirectionLabel direction={trade.direction} />
                      <span className="text-content-muted">{formatDate(trade.tradeDate)}</span>
                    </div>
                    <div className="truncate text-xs text-content-muted">
                      {inPlaybook ? 'Already in your Playbook' : trade.strategyName || trade.chartPattern || trade.comment || 'No setup recorded'}
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${trade.gainLoss >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {money(trade.gainLoss)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

const textareaClass =
  'w-full resize-y rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-sm text-content-primary focus:border-brand focus:outline-none';
const inputClass =
  'w-full rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-sm text-content-primary focus:border-brand focus:outline-none';

/** The PlayBook template form. `entry` is null when logging a new spotted trade. */
function PlaybookEditor({ entry, trade, setupNames, onClose }) {
  const toast = useToast();
  const isNew = !entry;
  const isSpotted = isNew || entry.source === 'spotted';

  const [form, setForm] = useState(() => ({
    setupName: entry?.setupName || '',
    grade: entry?.grade || '',
    ticker: entry?.ticker || 'BTC',
    direction: entry?.direction || 'long',
    tradeDate: formatDateForInput(entry?.tradeDate) || formatDateForInput(new Date()),
    ...Object.fromEntries(PLAYBOOK_FIELDS.map((f) => [f.id, entry?.[f.id] || ''])),
  }));
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(entry?.imageUrl || '');
  const [saving, setSaving] = useState(false);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      alert('Image is too large. Please use an image under 10MB.');
      e.target.value = '';
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let imageUrl = entry?.imageUrl || '';
      if (imageFile) {
        const uploaded = await uploadImageWithFallback({ file: imageFile, storage, pathPrefix: 'playbook', storageTimeoutMs: 10000 });
        imageUrl = uploaded.imageUrl;
      }

      const data = {
        setupName: form.setupName.trim(),
        grade: form.grade,
        imageUrl,
        ...Object.fromEntries(PLAYBOOK_FIELDS.map((f) => [f.id, form[f.id]])),
      };
      if (isSpotted) {
        Object.assign(data, {
          ticker: form.ticker.trim().toUpperCase() || 'BTC',
          direction: form.direction,
          tradeDate: parseLocalInputDate(form.tradeDate),
        });
      }

      if (isNew) await addSpottedTrade(data);
      else await updatePlaybookEntry(entry.id, data);
      toast.success(isNew ? 'Spotted trade added to your Playbook.' : 'Playbook entry saved.');
      onClose();
    } catch (err) {
      console.error('Error saving playbook entry:', err);
      alert(err?.message || 'Could not save this entry.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Remove this trade from your Playbook? Its breakdown will be deleted.')) return;
    try {
      await removeFromPlaybook(entry.id);
      toast.success('Removed from your Playbook.');
      onClose();
    } catch (err) {
      console.error('Error removing playbook entry:', err);
      alert('Could not remove this entry.');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      closeOnBackdrop={false}
      title={isNew ? 'Add Spotted Trade' : form.setupName || 'Playbook Trade'}
      description={isSpotted ? 'A trade you saw work but were not in.' : 'Deconstruct the trade so you can repeat it.'}
      footer={
        <>
          {!isNew && (
            <Button variant="destructive" icon={Trash2} onClick={handleDelete} className="mr-auto">
              Remove
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!isSpotted && trade && (
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-raised p-3 text-sm sm:grid-cols-5">
            <TradeFact label="Trade" value={<>{trade.ticker || 'BTC'} <DirectionLabel direction={trade.direction} /></>} />
            <TradeFact label="Date" value={formatDate(trade.tradeDate)} />
            <TradeFact label="Entry → Exit" value={`${trade.entryPrice ?? '—'} → ${trade.exitPrice ?? '—'}`} />
            <TradeFact label="R:R" value={trade.rr != null ? Number(trade.rr).toFixed(2) : '—'} />
            <TradeFact
              label="P&L"
              value={<span className={trade.gainLoss >= 0 ? 'text-profit' : 'text-loss'}>{money(trade.gainLoss)}</span>}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-1.5 block text-sm text-content-secondary">Setup Name</label>
            <input
              list="playbook-setups"
              value={form.setupName}
              onChange={(e) => set('setupName', e.target.value)}
              placeholder="e.g. Asia range breakout, Liquidity sweep reclaim"
              className={inputClass}
            />
            <datalist id="playbook-setups">
              {setupNames.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-content-secondary">Grade</label>
            <div className="flex gap-1.5">
              {GRADES.map((g) => (
                <Chip key={g} selected={form.grade === g} onClick={() => set('grade', form.grade === g ? '' : g)}>
                  {g}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {isSpotted && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm text-content-secondary">Ticker</label>
              <input value={form.ticker} onChange={(e) => set('ticker', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-content-secondary">Direction</label>
              <Select
                value={form.direction}
                onChange={(v) => set('direction', v)}
                options={[{ value: 'long', label: 'Long' }, { value: 'short', label: 'Short' }]}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-content-secondary">Date</label>
              <DateField value={form.tradeDate} onChange={(v) => set('tradeDate', v)} />
            </div>
          </div>
        )}

        {PLAYBOOK_SECTIONS.map((section) => (
          <section key={section.title}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">{section.title}</h4>
            <div className="space-y-3">
              {section.fields.map((field) => (
                <div key={field.id}>
                  <label className="mb-1.5 block text-sm text-content-secondary">{field.label}</label>
                  <textarea
                    rows={2}
                    value={form[field.id]}
                    onChange={(e) => set(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    className={textareaClass}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}

        <div>
          <label className="mb-1.5 block text-sm text-content-secondary">Chart Screenshot</label>
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-line-strong bg-surface-raised px-4 py-3 text-sm text-content-secondary transition-colors hover:border-brand/50">
            <Upload size={16} className="mr-2" />
            {imageFile ? imageFile.name : imagePreview ? 'Replace screenshot' : 'Upload screenshot'}
            <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
          </label>
          {imagePreview && <img src={imagePreview} alt="Chart preview" className="mt-2 w-full rounded-lg" />}
        </div>
      </div>
    </Modal>
  );
}

function TradeFact({ label, value }) {
  return (
    <div>
      <div className="text-[11px] text-content-muted">{label}</div>
      <div className="font-medium text-content-primary">{value}</div>
    </div>
  );
}

export default Playbook;
