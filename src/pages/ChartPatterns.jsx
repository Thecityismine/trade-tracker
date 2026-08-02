import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Upload, Pencil, Trash2, ImageIcon, Check, Target } from 'lucide-react';
import { collection, addDoc, serverTimestamp, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db, storage } from '../config/firebase';
import { useTrades } from '../context/TradesContext';
import { MAX_IMAGE_SIZE_BYTES, uploadImageWithFallback } from '../utils/imageUpload';
import Page from '../components/ui/Page';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';

const TIMEFRAME_OPTIONS = [
  { value: '1min', label: '1min' },
  { value: '3min', label: '3min' },
  { value: '5min', label: '5min' },
  { value: '15min', label: '15min' },
  { value: '30min', label: '30min' },
  { value: '1hr', label: '1hr' },
  { value: '2hr', label: '2hr' },
  { value: '4hr', label: '4hr' },
  { value: 'D', label: 'D' },
  { value: '3D', label: '3D' },
  { value: 'W', label: 'W' },
  { value: '2W', label: '2W' },
  { value: 'M', label: 'M' },
];

const QUALITY_BADGE = {
  'A+': 'bg-brand/20 text-brand border border-brand/30',
  'B': 'bg-warn/20 text-warn border border-warn/30',
  'C': 'bg-surface-hover text-content-secondary border border-line-strong',
};

const withTimeout = (promise, ms, timeoutMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

// Parse legacy description text into structured fields
function parseDescriptionToChecklist(description) {
  if (!description) return { summary: '', checklist: [] };
  const lines = description.split('\n').map((s) => s.trim()).filter(Boolean);
  const checklist = [];
  let summary = '';
  for (const line of lines) {
    if (/^\d+\.\s+/.test(line)) {
      checklist.push(line.replace(/^\d+\.\s+/, ''));
    } else if (!summary) {
      summary = line;
    }
  }
  return { summary, checklist };
}

function getDisplayChecklist(pattern) {
  if (pattern.checklistItems?.length > 0) return pattern.checklistItems;
  return parseDescriptionToChecklist(pattern.description || '').checklist;
}

function getDisplayAvoidIf(pattern) {
  return pattern.avoidIf?.filter((s) => s.trim()) || [];
}

function getDisplaySummary(pattern) {
  if (pattern.summary) return pattern.summary;
  return parseDescriptionToChecklist(pattern.description || '').summary;
}

function ChartPatterns() {
  const [patterns, setPatterns] = useState([]);
  const { trades } = useTrades();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [editingPattern, setEditingPattern] = useState(null);
  const [tradeFilter, setTradeFilter] = useState('all');
  const [timeframeFilter, setTimeframeFilter] = useState('all');
  const [qualityFilter, setQualityFilter] = useState('all');
  const [checkedItems, setCheckedItems] = useState({});
  const [formData, setFormData] = useState({
    name: '',
    summary: '',
    description: '',
    tradeType: 'both',
    timeframe: '',
    setupQuality: '',
    checklistItems: [''],
    avoidIf: [''],
  });
  const [patternImage, setPatternImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [brokenImages, setBrokenImages] = useState({});

  useEffect(() => {
    const patternsQuery = query(collection(db, 'chartPatterns'), orderBy('dateAdded', 'desc'));
    return onSnapshot(patternsQuery, (snapshot) => {
      setPatterns(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error('Error loading patterns:', error);
      setFormError('Could not load patterns. Please refresh.');
    });
  }, []);

  useEffect(() => {
    if (!isModalOpen && !expandedImage) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isModalOpen, expandedImage]);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const id = setTimeout(() => setStatusMessage(''), 4000);
    return () => clearTimeout(id);
  }, [statusMessage]);

  // Per-pattern performance from trades
  const patternPerformance = useMemo(() => {
    const map = {};
    trades.forEach((trade) => {
      const name = trade.chartPattern;
      if (!name) return;
      if (!map[name]) map[name] = { count: 0, pnl: 0, wins: 0, lastUsed: null };
      const p = map[name];
      p.count++;
      p.pnl += trade.gainLoss || 0;
      if (trade.result === 'win') p.wins++;
      const d = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
      if (!p.lastUsed || d > p.lastUsed) p.lastUsed = d;
    });
    Object.values(map).forEach((p) => {
      p.winRate = p.count > 0 ? (p.wins / p.count) * 100 : 0;
    });
    return map;
  }, [trades]);

  const inferTradeType = (pattern) => {
    if (pattern.tradeType) return pattern.tradeType;
    const h = [pattern.name, pattern.description, ...(Array.isArray(pattern.tags) ? pattern.tags : [])].join(' ').toLowerCase();
    const hasLong = /\blong\b/.test(h);
    const hasShort = /\bshort\b/.test(h);
    if (hasLong && !hasShort) return 'long';
    if (hasShort && !hasLong) return 'short';
    return 'both';
  };

  const normalizeTimeframe = (rawValue = '') => {
    const value = String(rawValue).trim().toUpperCase().replace(/\s+/g, '');
    const map = {
      '1MIN': '1min', '1M': '1min', '1MN': '1min',
      '3MIN': '3min', '3M': '3min', '3MN': '3min',
      '5MIN': '5min', '5M': '5min', '5MN': '5min',
      '15MIN': '15min', '15M': '15min', '15MN': '15min',
      '30MIN': '30min', '30M': '30min', '30MN': '30min',
      '1H': '1hr', '1HR': '1hr', '1HOUR': '1hr',
      '2H': '2hr', '2HR': '2hr', '2HOUR': '2hr',
      '4H': '4hr', '4HR': '4hr', '4HOUR': '4hr',
      'D': 'D', '1D': 'D', 'DAY': 'D', 'DAILY': 'D',
      '3D': '3D', '3DAY': '3D', '3DAYS': '3D',
      'W': 'W', '1W': 'W', 'WEEK': 'W', 'WEEKLY': 'W',
      '2W': '2W', '2WEEK': '2W', '2WEEKS': '2W',
      'M': 'M', '1MO': 'M', '1MON': 'M', 'MONTH': 'M', 'MONTHLY': 'M',
    };
    return map[value] || '';
  };

  const inferTimeframe = (pattern) => {
    const stored = normalizeTimeframe(pattern.timeframe);
    if (stored) return stored;
    const h = [pattern.name, pattern.description, ...(Array.isArray(pattern.tags) ? pattern.tags : [])].join(' ').toUpperCase();
    if (/\b30\s*(MIN|MINS?|M)\b/.test(h)) return '30min';
    if (/\b15\s*(MIN|MINS?|M)\b/.test(h)) return '15min';
    if (/\b5\s*(MIN|MINS?|M)\b/.test(h)) return '5min';
    if (/\b3\s*(MIN|MINS?|M)\b/.test(h)) return '3min';
    if (/\b1\s*(MIN|MINS?)\b/.test(h)) return '1min';
    if (/\b4\s*(H|HR|HRS|HOUR)\b/.test(h)) return '4hr';
    if (/\b2\s*(H|HR|HRS|HOUR)\b/.test(h)) return '2hr';
    if (/\b1\s*(H|HR|HRS|HOUR)\b/.test(h)) return '1hr';
    if (/\bDAILY\b|\b1D\b/.test(h)) return 'D';
    if (/\bWEEKLY\b|\b1W\b/.test(h)) return 'W';
    if (/\bMONTHLY\b/.test(h)) return 'M';
    return '';
  };

  const inferPatternBias = (pattern) => {
    if (pattern.patternBias && pattern.patternBias !== 'neutral') return pattern.patternBias;
    const h = [pattern.name, pattern.description, ...(Array.isArray(pattern.tags) ? pattern.tags : [])].join(' ').toLowerCase();
    if (/\bbullish\b/.test(h) && !/\bbearish\b/.test(h)) return 'bullish';
    if (/\bbearish\b/.test(h) && !/\bbullish\b/.test(h)) return 'bearish';
    return 'neutral';
  };

  const filteredPatterns = useMemo(() => {
    return patterns.filter((pattern) => {
      const matchesTrade = tradeFilter === 'all' || inferTradeType(pattern) === 'both' || inferTradeType(pattern) === tradeFilter;
      const matchesTimeframe = timeframeFilter === 'all' || inferTimeframe(pattern) === timeframeFilter;
      const matchesQuality = qualityFilter === 'all' || pattern.setupQuality === qualityFilter;
      return matchesTrade && matchesTimeframe && matchesQuality;
    });
  }, [patterns, tradeFilter, timeframeFilter, qualityFilter]);

  // Checklist interaction
  const toggleCheck = (patternId, itemIdx) => {
    const key = `${patternId}:${itemIdx}`;
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const isChecked = (patternId, itemIdx) => !!checkedItems[`${patternId}:${itemIdx}`];
  const allChecked = (patternId, checklist) =>
    checklist.length > 0 && checklist.every((_, i) => isChecked(patternId, i));

  // Form list helpers
  const addListItem = (field) =>
    setFormData((prev) => ({ ...prev, [field]: [...prev[field], ''] }));
  const removeListItem = (field, idx) =>
    setFormData((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }));
  const updateListItem = (field, idx, value) =>
    setFormData((prev) => ({ ...prev, [field]: prev[field].map((item, i) => (i === idx ? value : item)) }));

  const resetForm = () => {
    setEditingPattern(null);
    setFormData({ name: '', summary: '', description: '', tradeType: 'both', timeframe: '', setupQuality: '', checklistItems: [''], avoidIf: [''] });
    setPatternImage(null);
    setImagePreview(null);
    setFormError('');
  };

  const closeModal = () => { setIsModalOpen(false); resetForm(); };

  const openAddModal = () => { resetForm(); setStatusMessage(''); setIsModalOpen(true); };

  const openEditModal = (pattern) => {
    setEditingPattern(pattern);
    setFormError('');
    setStatusMessage('');
    setPatternImage(null);
    setImagePreview(pattern.imageUrl || null);
    const parsed = parseDescriptionToChecklist(pattern.description || '');
    setFormData({
      name: pattern.name || '',
      summary: pattern.summary || parsed.summary || '',
      description: pattern.description || '',
      tradeType: pattern.tradeType || inferTradeType(pattern),
      timeframe: normalizeTimeframe(pattern.timeframe) || inferTimeframe(pattern),
      setupQuality: pattern.setupQuality || '',
      checklistItems: pattern.checklistItems?.length > 0 ? pattern.checklistItems : parsed.checklist.length > 0 ? parsed.checklist : [''],
      avoidIf: pattern.avoidIf?.length > 0 ? pattern.avoidIf : [''],
    });
    setIsModalOpen(true);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        alert('Image is too large. Please use an image under 10MB.');
        e.target.value = '';
        return;
      }
      setPatternImage(file);
      setStatusMessage('');
      setFormError('');
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setStatusMessage('');
    const isEditing = Boolean(editingPattern?.id);
    if (!isEditing && !patternImage) { setFormError('Please upload a chart image.'); return; }
    setLoading(true);
    try {
      let imageUrl = editingPattern?.imageUrl || '';
      let imageSource = editingPattern?.imageSource || '';
      if (patternImage) {
        const uploaded = await uploadImageWithFallback({ file: patternImage, storage, pathPrefix: 'patterns', storageTimeoutMs: 10000 });
        imageUrl = uploaded.imageUrl;
        imageSource = uploaded.imageSource;
      }
      if (!imageUrl) throw new Error('Please upload a chart image.');
      const payload = {
        name: formData.name,
        summary: formData.summary,
        description: formData.description,
        tags: Array.isArray(editingPattern?.tags) ? editingPattern.tags : [],
        tradeType: formData.tradeType,
        timeframe: formData.timeframe,
        setupQuality: formData.setupQuality,
        checklistItems: formData.checklistItems.filter((s) => s.trim()),
        avoidIf: formData.avoidIf.filter((s) => s.trim()),
        patternBias: editingPattern?.patternBias || inferPatternBias({ name: formData.name, description: formData.description, tags: [] }),
        imageUrl,
        imageSource,
      };
      if (isEditing) {
        await withTimeout(updateDoc(doc(db, 'chartPatterns', editingPattern.id), { ...payload, updatedAt: serverTimestamp() }), 15000, 'Update timed out.');
        setStatusMessage('Pattern updated.');
      } else {
        await withTimeout(addDoc(collection(db, 'chartPatterns'), { ...payload, dateAdded: serverTimestamp() }), 15000, 'Save timed out.');
        setStatusMessage('Pattern saved.');
      }
      closeModal();
    } catch (error) {
      console.error('Error saving pattern:', error);
      const message = error?.message || 'Error saving pattern. Please try again.';
      setFormError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (patternId) => {
    if (window.confirm('Are you sure you want to delete this pattern?')) {
      try {
        await deleteDoc(doc(db, 'chartPatterns', patternId));
      } catch (error) {
        console.error('Error deleting pattern:', error);
        alert('Error deleting pattern.');
      }
    }
  };

  return (
    <Page
      actions={
        <Button icon={Plus} onClick={openAddModal}>
          Add Pattern
        </Button>
      }
    >
      {statusMessage && (
        <div className="bg-profit/15 border border-profit/40 text-profit rounded-lg px-4 py-3 text-sm">
          {statusMessage}
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface rounded-card px-4 py-3 space-y-3 shadow-elev-1">
        {/* Direction filter */}
        <div className="flex gap-2">
          {[{ value: 'all', label: 'All' }, { value: 'long', label: 'Long Trades' }, { value: 'short', label: 'Short Trades' }].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTradeFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                tradeFilter === opt.value
                  ? 'bg-brand text-content-primary border-brand'
                  : 'bg-surface-raised text-content-secondary border-line-strong hover:border-brand/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Timeframe + Quality dropdowns */}
        <div className="flex gap-2">
          <select
            value={timeframeFilter}
            onChange={(e) => setTimeframeFilter(e.target.value)}
            className="flex-1 bg-surface-raised border border-line-strong rounded-lg px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
          >
            <option value="all">All Timeframes</option>
            {TIMEFRAME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value)}
            className="flex-1 bg-surface-raised border border-line-strong rounded-lg px-3 py-1.5 text-sm text-content-primary focus:outline-none focus:border-brand"
          >
            <option value="all">All Quality</option>
            <option value="A+">A+ Only</option>
            <option value="B">B Only</option>
            <option value="C">C Only</option>
          </select>
        </div>
      </div>

      {/* Patterns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPatterns.length > 0 ? (
          filteredPatterns.map((pattern) => {
            const dateAdded = pattern.dateAdded?.toDate?.() || new Date();
            const displayTimeframe = inferTimeframe(pattern);
            const displayTradeType = inferTradeType(pattern);
            const displayChecklist = getDisplayChecklist(pattern);
            const displayAvoidIf = getDisplayAvoidIf(pattern);
            const displaySummary = getDisplaySummary(pattern);
            const isAllChecked = allChecked(pattern.id, displayChecklist);
            const perf = patternPerformance[pattern.name];

            return (
              <div
                key={pattern.id}
                className="group bg-surface border border-line-strong rounded-lg overflow-hidden hover:border-brand/50 transition-colors"
              >
                {/* Image */}
                <div className="relative aspect-video bg-surface-raised">
                  {brokenImages[pattern.id] ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-content-muted gap-2">
                      <ImageIcon size={30} />
                      <span className="text-xs">Image unavailable</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpandedImage({ url: pattern.imageUrl, name: pattern.name })}
                      className="w-full h-full cursor-zoom-in"
                      aria-label={`Expand ${pattern.name}`}
                    >
                      <img
                        src={pattern.imageUrl}
                        alt={pattern.name}
                        className="w-full h-full object-cover"
                        onError={() => setBrokenImages((prev) => ({ ...prev, [pattern.id]: true }))}
                      />
                    </button>
                  )}

                  {/* Action buttons — top-right overlay */}
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(pattern); }}
                      className="bg-surface/85 hover:bg-surface text-content-secondary hover:text-content-primary p-1.5 rounded-card transition-all backdrop-blur-sm /50 shadow-elev-1"
                      aria-label="Edit pattern"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(pattern.id); }}
                      className="bg-loss/80 hover:bg-loss text-content-primary p-1.5 rounded-lg transition-all backdrop-blur-sm"
                      aria-label="Delete pattern"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  {/* Title row: badges then name */}
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      {displayTradeType !== 'both' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          displayTradeType === 'long'
                            ? 'bg-profit/15 text-profit'
                            : 'bg-loss/15 text-loss'
                        }`}>
                          {displayTradeType === 'long' ? 'Long' : 'Short'}
                        </span>
                      )}
                      {displayTimeframe && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-brand-muted text-brand-hover border border-brand/30">
                          {displayTimeframe}
                        </span>
                      )}
                      {pattern.setupQuality && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${QUALITY_BADGE[pattern.setupQuality] || ''}`}>
                          {pattern.setupQuality}
                        </span>
                      )}
                    </div>
                    <h3 className="text-content-primary font-bold text-base leading-snug">{pattern.name}</h3>
                    {displaySummary && (
                      <p className="text-content-muted text-xs mt-0.5">{displaySummary}</p>
                    )}
                  </div>

                  {/* Checklist */}
                  {displayChecklist.length > 0 && (
                    <div>
                      <div className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Checklist</div>
                      <div className="space-y-2">
                        {displayChecklist.map((item, i) => {
                          const checked = isChecked(pattern.id, i);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => toggleCheck(pattern.id, i)}
                              className="w-full text-left flex items-start gap-2 group/check"
                            >
                              <span className={`flex-shrink-0 w-4 h-4 rounded border mt-0.5 flex items-center justify-center transition-colors ${
                                checked ? 'bg-profit border-profit' : 'border-line-strong group-hover/check:border-line-strong'
                              }`}>
                                {checked && <Check size={10} className="text-content-primary" />}
                              </span>
                              <span className={`text-sm leading-snug transition-colors ${
                                checked ? 'line-through text-content-muted' : 'text-content-secondary'
                              }`}>
                                {item}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {isAllChecked && (
                        <div className="mt-2.5 text-center text-xs font-bold text-profit bg-profit/10 border border-profit/25 rounded-lg py-1.5 tracking-widest">
                          VALID SETUP
                        </div>
                      )}
                    </div>
                  )}

                  {/* Avoid If */}
                  {displayAvoidIf.length > 0 && (
                    <div>
                      <div className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Avoid If</div>
                      <div className="space-y-1">
                        {displayAvoidIf.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-content-secondary">
                            <span className="text-loss/60 flex-shrink-0 mt-0.5">•</span>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fallback: plain description for patterns without checklist */}
                  {displayChecklist.length === 0 && pattern.description && (
                    <p className="text-content-secondary text-sm whitespace-pre-wrap break-words">{pattern.description}</p>
                  )}

                  {/* Performance */}
                  {perf && perf.count > 0 && (
                    <div>
                      <div className="text-content-muted text-xs font-semibold uppercase tracking-wider mb-2">Performance</div>
                      <div className="flex items-center gap-4">
                        <span className="text-content-secondary text-xs">{perf.count} trade{perf.count !== 1 ? 's' : ''}</span>
                        <span className={`text-xs font-semibold ${perf.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {perf.pnl >= 0 ? '+$' : '-$'}{Math.abs(perf.pnl).toFixed(2)}
                        </span>
                        <span className="text-xs text-content-secondary">{perf.winRate.toFixed(0)}% WR</span>
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between text-xs text-content-muted pt-1 border-t border-line">
                    <span>Added {dateAdded.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {perf?.lastUsed && (
                      <span>Last used {perf.lastUsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            className="col-span-full"
            icon={Target}
            title="No chart patterns yet"
            description="Save the setups you actually trade. Once patterns are linked to trades, you'll see which ones carry your edge."
            actionLabel="Add your first pattern"
            onAction={openAddModal}
          />
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-[60] overflow-y-auto">
          <div className="flex min-h-full items-start justify-center p-4 py-8">
            <div className="bg-surface rounded-card w-full max-w-lg shadow-elev-1">
              <div className="flex items-center justify-between p-6 border-b border-line">
                <h3 className="text-xl font-bold text-content-primary">
                  {editingPattern ? 'Edit Pattern' : 'Add Pattern'}
                </h3>
                <button onClick={closeModal} className="text-content-secondary hover:text-content-primary transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-content-secondary text-sm mb-2">Pattern Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Bull Flag, 20MA Reclaim"
                    className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                    required
                  />
                </div>

                {/* Summary */}
                <div>
                  <label className="block text-content-secondary text-sm mb-2">
                    One-line Summary <span className="text-content-muted">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.summary}
                    onChange={(e) => setFormData((prev) => ({ ...prev, summary: e.target.value }))}
                    placeholder="e.g., Breakout + retest continuation"
                    className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                  />
                </div>

                {/* Trade side + Timeframe */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-content-secondary text-sm mb-2">Trade Side</label>
                    <select
                      value={formData.tradeType}
                      onChange={(e) => setFormData((prev) => ({ ...prev, tradeType: e.target.value }))}
                      className="w-full bg-surface-raised border border-line-strong rounded-lg px-3 py-2 text-content-primary focus:outline-none focus:border-brand"
                    >
                      <option value="both">Both / General</option>
                      <option value="long">Long Trades</option>
                      <option value="short">Short Trades</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-content-secondary text-sm mb-2">Timeframe</label>
                    <select
                      value={formData.timeframe}
                      onChange={(e) => setFormData((prev) => ({ ...prev, timeframe: e.target.value }))}
                      className="w-full bg-surface-raised border border-line-strong rounded-lg px-3 py-2 text-content-primary focus:outline-none focus:border-brand"
                      required
                    >
                      <option value="">Select timeframe</option>
                      {TIMEFRAME_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Setup Quality */}
                <div>
                  <label className="block text-content-secondary text-sm mb-2">
                    Setup Quality <span className="text-content-muted">(optional)</span>
                  </label>
                  <div className="flex gap-2">
                    {[
                      { value: '', label: 'None', active: 'bg-surface-raised border-line-strong text-content-secondary' },
                      { value: 'A+', label: 'A+', active: 'bg-brand border-brand text-content-primary' },
                      { value: 'B', label: 'B', active: 'bg-yellow-600 border-warn text-content-primary' },
                      { value: 'C', label: 'C', active: 'bg-surface-hover border-line-strong text-content-primary' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, setupQuality: opt.value }))}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          formData.setupQuality === opt.value
                            ? opt.active
                            : 'bg-surface-raised text-content-muted border-line-strong hover:border-brand/50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chart Image */}
                <div>
                  <label className="block text-content-secondary text-sm mb-2">Chart Image</label>
                  <label className="flex items-center justify-center w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-3 cursor-pointer hover:border-brand/50 transition-colors">
                    <Upload size={18} className="mr-2 text-content-secondary" />
                    <span className="text-content-secondary text-sm">
                      {patternImage ? patternImage.name : (editingPattern ? 'Replace Chart (optional)' : 'Upload Chart')}
                    </span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                  {imagePreview && (
                    <div className="mt-2">
                      <img src={imagePreview} alt="Preview" className="w-full rounded-lg" />
                    </div>
                  )}
                </div>

                {/* Checklist Items */}
                <div>
                  <label className="block text-content-secondary text-sm mb-2">
                    Entry Checklist <span className="text-content-muted">(one condition per field)</span>
                  </label>
                  <div className="space-y-2">
                    {formData.checklistItems.map((item, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => updateListItem('checklistItems', i, e.target.value)}
                          placeholder={`Condition ${i + 1}`}
                          className="flex-1 bg-surface-raised border border-line-strong rounded-lg px-3 py-2 text-content-primary text-sm focus:outline-none focus:border-brand"
                        />
                        {formData.checklistItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeListItem('checklistItems', i)}
                            className="text-content-muted hover:text-loss transition-colors px-1"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addListItem('checklistItems')}
                      className="text-brand hover:text-brand-hover text-xs flex items-center gap-1 transition-colors"
                    >
                      <Plus size={13} />
                      Add condition
                    </button>
                  </div>
                </div>

                {/* Avoid If */}
                <div>
                  <label className="block text-content-secondary text-sm mb-2">
                    Avoid If <span className="text-content-muted">(optional)</span>
                  </label>
                  <div className="space-y-2">
                    {formData.avoidIf.map((item, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={item}
                          onChange={(e) => updateListItem('avoidIf', i, e.target.value)}
                          placeholder="e.g., Choppy market, late entry"
                          className="flex-1 bg-surface-raised border border-line-strong rounded-lg px-3 py-2 text-content-primary text-sm focus:outline-none focus:border-brand"
                        />
                        {formData.avoidIf.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeListItem('avoidIf', i)}
                            className="text-content-muted hover:text-loss transition-colors px-1"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addListItem('avoidIf')}
                      className="text-brand hover:text-brand-hover text-xs flex items-center gap-1 transition-colors"
                    >
                      <Plus size={13} />
                      Add condition
                    </button>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-content-secondary text-sm mb-2">
                    Notes <span className="text-content-muted">(optional)</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    rows="3"
                    placeholder="Any additional context or background..."
                    className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand resize-none text-sm"
                  />
                </div>

                {formError && <p className="text-sm text-loss">{formError}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 bg-surface-raised border border-line-strong rounded-lg py-3 text-content-secondary font-medium hover:border-brand/50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-brand hover:bg-brand-hover rounded-lg py-3 text-content-primary font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Saving...' : (editingPattern ? 'Save Changes' : 'Add Pattern')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Image Viewer */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[80] bg-black p-4 flex items-center justify-center"
          onClick={() => setExpandedImage(null)}
        >
          <button
            type="button"
            onClick={() => setExpandedImage(null)}
            className="absolute top-4 right-4 text-content-secondary hover:text-content-primary transition-colors"
            aria-label="Close image viewer"
          >
            <X size={28} />
          </button>
          <img
            src={expandedImage.url}
            alt={expandedImage.name}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Page>
  );
}

export default ChartPatterns;
