import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  getDocs
} from 'firebase/firestore';
import { Plus, Search, X, Pencil, Trash2, Pin, PinOff, Upload, BookOpen, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db, storage } from '../config/firebase';
import { useTrades } from '../context/TradesContext';
import { MAX_IMAGE_SIZE_BYTES, uploadImageWithFallback } from '../utils/imageUpload';

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'updated', label: 'Recently updated' },
  { id: 'pinned', label: 'Pinned first' },
  { id: 'most-used', label: 'Most used' },
  { id: 'best-winrate', label: 'Best win rate' }
];

const defaultStrategyForm = {
  name: '',
  description: '',
  whatWorked: '',
  lessonsLearned: '',
  tags: '',
  pinned: false
};

const defaultEntryForm = {
  title: '',
  content: ''
};

const toDate = (value) => {
  if (!value) return null;
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return 'N/A';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return 'N/A';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const toTagsString = (tags) => {
  if (!Array.isArray(tags)) return '';
  return tags.join(', ');
};

const parseTags = (value) => {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const getCreatedAtMs = (item) => toDate(item.createdAt)?.getTime() || 0;
const getUpdatedAtMs = (item) => toDate(item.updatedAt)?.getTime() || getCreatedAtMs(item);

const getImageUrls = (item) => {
  if (Array.isArray(item.imageUrls)) {
    return item.imageUrls.filter((url) => typeof url === 'string' && url.trim());
  }
  if (typeof item.imageUrl === 'string' && item.imageUrl.trim()) {
    return [item.imageUrl];
  }
  return [];
};

const cleanMarkdownLine = (line) => {
  return String(line || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^>\s?/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const getPreviewSnippet = (content, maxLength = 180, maxLines = 3) => {
  const rawLines = String(content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .map(cleanMarkdownLine)
    .filter(Boolean);

  if (rawLines.length === 0) return '';

  const previewLines = [];
  let totalChars = 0;
  let didTruncate = false;

  for (const line of rawLines) {
    if (previewLines.length >= maxLines) {
      didTruncate = true;
      break;
    }
    if (totalChars + line.length > maxLength) {
      const remaining = maxLength - totalChars;
      if (remaining > 0) previewLines.push(line.slice(0, remaining).trimEnd());
      didTruncate = true;
      break;
    }
    previewLines.push(line);
    totalChars += line.length;
  }

  return didTruncate ? `${previewLines.join(' ')}...` : previewLines.join(' ');
};

const markdownComponents = {
  h1: ({ node, ...props }) => <h1 className="text-2xl text-white font-bold mt-4 mb-2" {...props} />,
  h2: ({ node, ...props }) => <h2 className="text-xl text-white font-semibold mt-4 mb-2" {...props} />,
  h3: ({ node, ...props }) => <h3 className="text-lg text-white font-semibold mt-3 mb-2" {...props} />,
  p: ({ node, ...props }) => <p className="text-gray-200 leading-7 mb-3 whitespace-pre-wrap" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc ml-5 mb-3 text-gray-200 space-y-1" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal ml-5 mb-3 text-gray-200 space-y-1" {...props} />,
  li: ({ node, ...props }) => <li className="text-gray-200" {...props} />,
  blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-gray-600 pl-3 text-gray-300 italic mb-3" {...props} />,
  code: ({ inline, node, ...props }) => (
    inline
      ? <code className="bg-black/40 rounded px-1 py-0.5 text-blue-300 text-sm" {...props} />
      : <code className="block bg-black/50 border border-dark-border rounded p-3 text-blue-300 text-sm overflow-x-auto mb-3" {...props} />
  ),
  a: ({ node, ...props }) => <a className="text-blue-400 underline" target="_blank" rel="noreferrer" {...props} />
};

function Strategies() {
  const [strategies, setStrategies] = useState([]);
  const [entries, setEntries] = useState([]);
  const { trades } = useTrades();

  const [activeStrategy, setActiveStrategy] = useState(null);
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState(null);

  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  const [strategyForm, setStrategyForm] = useState(defaultStrategyForm);
  const [strategyImages, setStrategyImages] = useState([]);

  const [entryForm, setEntryForm] = useState(defaultEntryForm);
  const [entryImages, setEntryImages] = useState([]);

  const [expandedImage, setExpandedImage] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Subscribe to strategies
  useEffect(() => {
    const q = query(collection(db, 'strategies'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setStrategies(data);
      },
      (error) => {
        console.error('Error loading strategies:', error);
        setFormError('Could not load strategies.');
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to all strategy entries (cheap; same pattern as Notebook)
  useEffect(() => {
    const q = query(collection(db, 'strategyEntries'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEntries(data);
      },
      (error) => {
        console.error('Error loading strategy entries:', error);
      }
    );
    return () => unsubscribe();
  }, []);

  // Derive per-strategy stats from the shared trades list
  const tradeStats = useMemo(() => {
    const stats = {};
    trades.forEach((trade) => {
      const sid = trade.strategyId;
      if (!sid) return;
      if (!stats[sid]) {
        stats[sid] = { trades: 0, wins: 0, losses: 0, totalPnl: 0 };
      }
      stats[sid].trades += 1;
      if (trade.result === 'win') stats[sid].wins += 1;
      else if (trade.result === 'loss') stats[sid].losses += 1;
      stats[sid].totalPnl += Number(trade.gainLoss) || 0;
    });
    Object.keys(stats).forEach((sid) => {
      const s = stats[sid];
      const decided = s.wins + s.losses;
      s.winRate = decided > 0 ? (s.wins / decided) * 100 : 0;
    });
    return stats;
  }, [trades]);

  // Auto-clear status banner
  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeoutId = setTimeout(() => setStatusMessage(''), 4000);
    return () => clearTimeout(timeoutId);
  }, [statusMessage]);

  // Lock body scroll when modals or panel open
  useEffect(() => {
    if (!isStrategyModalOpen && !isEntryModalOpen && !activeStrategy && !expandedImage) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isStrategyModalOpen, isEntryModalOpen, activeStrategy, expandedImage]);

  // Keep activeStrategy in sync with latest snapshot
  useEffect(() => {
    if (!activeStrategy?.id) return;
    const latest = strategies.find((s) => s.id === activeStrategy.id);
    if (!latest) {
      setActiveStrategy(null);
      return;
    }
    setActiveStrategy(latest);
  }, [strategies, activeStrategy?.id]);

  const overallStats = useMemo(() => {
    const totalStrategies = strategies.length;
    let totalLinkedTrades = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalPnl = 0;
    Object.values(tradeStats).forEach((s) => {
      totalLinkedTrades += s.trades;
      totalWins += s.wins;
      totalLosses += s.losses;
      totalPnl += s.totalPnl;
    });
    const decided = totalWins + totalLosses;
    const winRate = decided > 0 ? (totalWins / decided) * 100 : 0;
    return { totalStrategies, totalLinkedTrades, totalWins, totalLosses, winRate, totalPnl };
  }, [strategies, tradeStats]);

  const filteredStrategies = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    const filtered = strategies.filter((s) => {
      if (!search) return true;
      const haystack = [
        s.name,
        s.description,
        s.whatWorked,
        s.lessonsLearned,
        ...(s.tags || [])
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'oldest') return getCreatedAtMs(a) - getCreatedAtMs(b);
      if (sortBy === 'updated') return getUpdatedAtMs(b) - getUpdatedAtMs(a);
      if (sortBy === 'pinned') {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return getCreatedAtMs(b) - getCreatedAtMs(a);
      }
      if (sortBy === 'most-used') {
        const aUsed = tradeStats[a.id]?.trades || 0;
        const bUsed = tradeStats[b.id]?.trades || 0;
        return bUsed - aUsed;
      }
      if (sortBy === 'best-winrate') {
        const aWr = tradeStats[a.id]?.winRate ?? -1;
        const bWr = tradeStats[b.id]?.winRate ?? -1;
        return bWr - aWr;
      }
      return getCreatedAtMs(b) - getCreatedAtMs(a);
    });

    return sorted;
  }, [strategies, searchTerm, sortBy, tradeStats]);

  const activeStrategyEntries = useMemo(() => {
    if (!activeStrategy?.id) return [];
    return entries
      .filter((e) => e.strategyId === activeStrategy.id)
      .sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));
  }, [entries, activeStrategy?.id]);

  // Strategy modal handlers
  const resetStrategyForm = () => {
    setEditingStrategy(null);
    setStrategyForm(defaultStrategyForm);
    setStrategyImages([]);
    setFormError('');
  };

  const openAddStrategy = () => {
    resetStrategyForm();
    setIsStrategyModalOpen(true);
  };

  const openEditStrategy = (strategy) => {
    setEditingStrategy(strategy);
    setStrategyForm({
      name: strategy.name || '',
      description: strategy.description || '',
      whatWorked: strategy.whatWorked || '',
      lessonsLearned: strategy.lessonsLearned || '',
      tags: toTagsString(strategy.tags),
      pinned: Boolean(strategy.pinned)
    });
    setStrategyImages(
      getImageUrls(strategy).map((url, i) => ({
        id: `existing-${i}-${url.slice(-8)}`,
        file: null,
        url,
        existing: true
      }))
    );
    setFormError('');
    setIsStrategyModalOpen(true);
  };

  const closeStrategyModal = () => {
    setIsStrategyModalOpen(false);
    resetStrategyForm();
  };

  const handleStrategyInput = (field, value) => {
    setStrategyForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleStrategyImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const tooLarge = files.find((file) => file.size > MAX_IMAGE_SIZE_BYTES);
    if (tooLarge) {
      setFormError('One or more images are too large. Max 10MB per image.');
      e.target.value = '';
      return;
    }

    setFormError('');
    const readPromises = files.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          url: reader.result,
          existing: false
        });
      };
      reader.onerror = () => reject(new Error('Could not read image.'));
      reader.readAsDataURL(file);
    }));

    Promise.all(readPromises)
      .then((newItems) => setStrategyImages((prev) => [...prev, ...newItems]))
      .catch(() => setFormError('Could not load selected image.'));

    e.target.value = '';
  };

  const removeStrategyImage = (itemId) => {
    setStrategyImages((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleSaveStrategy = async (e) => {
    e.preventDefault();
    setFormError('');
    setLoading(true);

    try {
      if (!strategyForm.name.trim()) throw new Error('Strategy name is required.');

      const uploadedImages = [];
      const imageSources = [];

      for (const item of strategyImages) {
        if (item.existing) {
          uploadedImages.push(item.url);
          continue;
        }
        if (!item.file) continue;

        const uploaded = await uploadImageWithFallback({
          file: item.file,
          storage,
          pathPrefix: 'strategies',
          storageTimeoutMs: 10000
        });

        if (uploaded.imageUrl) {
          uploadedImages.push(uploaded.imageUrl);
          imageSources.push(uploaded.imageSource || '');
        }
      }

      const payload = {
        name: strategyForm.name.trim(),
        description: strategyForm.description,
        whatWorked: strategyForm.whatWorked,
        lessonsLearned: strategyForm.lessonsLearned,
        tags: parseTags(strategyForm.tags),
        imageUrls: uploadedImages,
        imageSources,
        pinned: Boolean(strategyForm.pinned)
      };

      if (editingStrategy?.id) {
        await updateDoc(doc(db, 'strategies', editingStrategy.id), {
          ...payload,
          updatedAt: serverTimestamp()
        });

        // If the name changed, update strategyName on linked trades
        if (payload.name !== (editingStrategy.name || '')) {
          try {
            const tradesQ = query(
              collection(db, 'trades'),
              where('strategyId', '==', editingStrategy.id)
            );
            const snap = await getDocs(tradesQ);
            await Promise.all(
              snap.docs.map((d) =>
                updateDoc(doc(db, 'trades', d.id), { strategyName: payload.name })
              )
            );
          } catch (renameErr) {
            console.error('Error updating linked trades after rename:', renameErr);
          }
        }
      } else {
        await addDoc(collection(db, 'strategies'), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      setStatusMessage('Strategy saved.');
      closeStrategyModal();
    } catch (error) {
      console.error('Error saving strategy:', error);
      const message = error?.message || 'Error saving strategy.';
      setFormError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStrategy = async (strategyId) => {
    if (!window.confirm('Delete this strategy? Its examples will also be removed. Trades that referenced it will keep the link as a name only.')) {
      return;
    }
    try {
      // Delete entries first
      const entriesQ = query(
        collection(db, 'strategyEntries'),
        where('strategyId', '==', strategyId)
      );
      const entriesSnap = await getDocs(entriesQ);
      await Promise.all(
        entriesSnap.docs.map((d) => deleteDoc(doc(db, 'strategyEntries', d.id)))
      );

      await deleteDoc(doc(db, 'strategies', strategyId));
      if (activeStrategy?.id === strategyId) setActiveStrategy(null);
      setStatusMessage('Strategy deleted.');
    } catch (error) {
      console.error('Error deleting strategy:', error);
      alert('Error deleting strategy.');
    }
  };

  const togglePinned = async (strategy, event) => {
    if (event) event.stopPropagation();
    try {
      await updateDoc(doc(db, 'strategies', strategy.id), {
        pinned: !strategy.pinned,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error toggling pin:', error);
      alert('Error updating pin.');
    }
  };

  // Entry modal handlers
  const resetEntryForm = () => {
    setEditingEntry(null);
    setEntryForm(defaultEntryForm);
    setEntryImages([]);
    setFormError('');
  };

  const openAddEntry = () => {
    resetEntryForm();
    setIsEntryModalOpen(true);
  };

  const openEditEntry = (entry) => {
    setEditingEntry(entry);
    setEntryForm({
      title: entry.title || '',
      content: entry.content || ''
    });
    setEntryImages(
      getImageUrls(entry).map((url, i) => ({
        id: `existing-${i}-${url.slice(-8)}`,
        file: null,
        url,
        existing: true
      }))
    );
    setFormError('');
    setIsEntryModalOpen(true);
  };

  const closeEntryModal = () => {
    setIsEntryModalOpen(false);
    resetEntryForm();
  };

  const handleEntryInput = (field, value) => {
    setEntryForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEntryImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const tooLarge = files.find((file) => file.size > MAX_IMAGE_SIZE_BYTES);
    if (tooLarge) {
      setFormError('One or more images are too large. Max 10MB per image.');
      e.target.value = '';
      return;
    }

    setFormError('');
    const readPromises = files.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          url: reader.result,
          existing: false
        });
      };
      reader.onerror = () => reject(new Error('Could not read image.'));
      reader.readAsDataURL(file);
    }));

    Promise.all(readPromises)
      .then((newItems) => setEntryImages((prev) => [...prev, ...newItems]))
      .catch(() => setFormError('Could not load selected image.'));

    e.target.value = '';
  };

  const removeEntryImage = (itemId) => {
    setEntryImages((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleSaveEntry = async (e) => {
    e.preventDefault();
    setFormError('');
    setLoading(true);

    try {
      if (!activeStrategy?.id) throw new Error('No strategy selected.');
      if (!entryForm.title.trim()) throw new Error('Entry title is required.');

      const uploadedImages = [];
      const imageSources = [];

      for (const item of entryImages) {
        if (item.existing) {
          uploadedImages.push(item.url);
          continue;
        }
        if (!item.file) continue;

        const uploaded = await uploadImageWithFallback({
          file: item.file,
          storage,
          pathPrefix: 'strategy-entries',
          storageTimeoutMs: 10000
        });

        if (uploaded.imageUrl) {
          uploadedImages.push(uploaded.imageUrl);
          imageSources.push(uploaded.imageSource || '');
        }
      }

      const payload = {
        strategyId: activeStrategy.id,
        title: entryForm.title.trim(),
        content: entryForm.content,
        imageUrls: uploadedImages,
        imageSources
      };

      if (editingEntry?.id) {
        await updateDoc(doc(db, 'strategyEntries', editingEntry.id), {
          ...payload,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'strategyEntries'), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      setStatusMessage('Entry saved.');
      closeEntryModal();
    } catch (error) {
      console.error('Error saving entry:', error);
      const message = error?.message || 'Error saving entry.';
      setFormError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEntry = async (entryId) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await deleteDoc(doc(db, 'strategyEntries', entryId));
      setStatusMessage('Entry deleted.');
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Error deleting entry.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-white">Strategies</h2>
        <button
          onClick={openAddStrategy}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={18} />
          <span>New Strategy</span>
        </button>
      </div>

      {statusMessage && (
        <div className="bg-green-900/30 border border-green-700/40 text-green-300 rounded-lg px-4 py-3 text-sm">
          {statusMessage}
        </div>
      )}

      {/* Overall stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Strategies</p>
          <p className="text-white text-2xl font-bold mt-1">{overallStats.totalStrategies}</p>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Trades Linked</p>
          <p className="text-blue-400 text-2xl font-bold mt-1">{overallStats.totalLinkedTrades}</p>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Overall Win Rate</p>
          <p className={`text-2xl font-bold mt-1 ${overallStats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
            {overallStats.totalLinkedTrades > 0 ? `${overallStats.winRate.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Net P&L (linked)</p>
          <p className={`text-2xl font-bold mt-1 ${overallStats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {overallStats.totalPnl >= 0 ? '+' : '-'}${Math.abs(overallStats.totalPnl).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Search & sort */}
      <div className="bg-dark-card border border-dark-border rounded-lg p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
          <div className="relative w-full lg:max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search strategy, tag, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>

        {filteredStrategies.length === 0 && (
          <div className="bg-dark-bg border border-dark-border rounded-lg p-8 text-center text-gray-400">
            {strategies.length === 0
              ? 'No strategies yet. Create your first one to start tracking what works.'
              : 'No strategies match your search.'}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredStrategies.map((strategy) => {
            const stats = tradeStats[strategy.id] || { trades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0 };
            const tags = Array.isArray(strategy.tags) ? strategy.tags : [];
            const visibleTags = tags.slice(0, 3);
            const remainingTags = tags.length - visibleTags.length;
            const thumbnail = getImageUrls(strategy)[0];
            const decided = stats.wins + stats.losses;
            const winRateDisplay = decided > 0 ? `${stats.winRate.toFixed(0)}%` : '—';

            return (
              <div
                key={strategy.id}
                onClick={() => setActiveStrategy(strategy)}
                className="bg-dark-bg border border-dark-border rounded-lg p-4 space-y-3 cursor-pointer hover:border-gray-500 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-white text-lg font-semibold leading-tight truncate">
                    {strategy.name || 'Untitled'}
                  </h3>
                  <button
                    type="button"
                    onClick={(event) => togglePinned(strategy, event)}
                    className={`p-2 rounded-lg border transition-colors ${
                      strategy.pinned
                        ? 'bg-yellow-600/20 text-yellow-300 border-yellow-700/60 hover:border-yellow-500'
                        : 'bg-dark-card text-gray-400 border-dark-border hover:border-gray-500'
                    }`}
                    aria-label={strategy.pinned ? 'Unpin strategy' : 'Pin strategy'}
                  >
                    {strategy.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                  </button>
                </div>

                {thumbnail && (
                  <img
                    src={thumbnail}
                    alt="Strategy chart"
                    className="w-full h-28 object-cover rounded border border-dark-border"
                  />
                )}

                {strategy.description && (
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {getPreviewSnippet(strategy.description)}
                  </p>
                )}

                {/* Per-strategy stats row */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-dark-card rounded p-2">
                    <p className="text-[10px] text-gray-500 uppercase">Trades</p>
                    <p className="text-white font-semibold text-sm">{stats.trades}</p>
                  </div>
                  <div className="bg-dark-card rounded p-2">
                    <p className="text-[10px] text-gray-500 uppercase">Win Rate</p>
                    <p className={`font-semibold text-sm ${decided === 0 ? 'text-gray-400' : stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                      {winRateDisplay}
                    </p>
                  </div>
                  <div className="bg-dark-card rounded p-2">
                    <p className="text-[10px] text-gray-500 uppercase">P&L</p>
                    <p className={`font-semibold text-sm ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {stats.totalPnl >= 0 ? '+' : '-'}${Math.abs(stats.totalPnl).toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* W / L breakdown */}
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="text-green-400">{stats.wins}W</span>
                  <span className="text-red-400">{stats.losses}L</span>
                </div>

                {visibleTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {visibleTags.map((tag) => (
                      <span key={`${strategy.id}-${tag}`} className="bg-blue-600/20 text-blue-300 px-2 py-1 rounded text-xs">
                        {tag}
                      </span>
                    ))}
                    {remainingTags > 0 && (
                      <span className="bg-dark-card text-gray-300 px-2 py-1 rounded text-xs border border-dark-border">
                        +{remainingTags}
                      </span>
                    )}
                  </div>
                )}

                <div className="text-xs text-gray-500">
                  Updated {formatDate(strategy.updatedAt || strategy.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strategy modal */}
      {isStrategyModalOpen && (
        <div
          className="fixed inset-0 bg-black/75 z-[85] p-2 sm:p-4 overflow-y-auto flex items-center justify-center"
          onClick={closeStrategyModal}
        >
          <div
            className="bg-dark-card border border-dark-border rounded-lg w-full max-w-3xl max-h-[calc(100vh-1rem)] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={handleSaveStrategy} className="p-5 space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Strategy Name</label>
                <input
                  type="text"
                  value={strategyForm.name}
                  onChange={(e) => handleStrategyInput('name', e.target.value)}
                  placeholder="e.g., Liquidity Sweep Reversal"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Description</label>
                <textarea
                  rows="3"
                  value={strategyForm.description}
                  onChange={(e) => handleStrategyInput('description', e.target.value)}
                  placeholder="Quick summary of the strategy..."
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-white resize-y focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">What Worked (Markdown)</label>
                <textarea
                  rows="5"
                  value={strategyForm.whatWorked}
                  onChange={(e) => handleStrategyInput('whatWorked', e.target.value)}
                  placeholder="What conditions made this strategy work in the past..."
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-white resize-y focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Lessons Learned (Markdown)</label>
                <textarea
                  rows="5"
                  value={strategyForm.lessonsLearned}
                  onChange={(e) => handleStrategyInput('lessonsLearned', e.target.value)}
                  placeholder="Lessons, mistakes, and refinements..."
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-white resize-y focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Tags (comma separated)</label>
                <input
                  type="text"
                  value={strategyForm.tags}
                  onChange={(e) => handleStrategyInput('tags', e.target.value)}
                  placeholder="e.g., reversal, 1H, high-volume"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Reference Charts</label>
                <label className="flex items-center justify-center w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 cursor-pointer hover:border-gray-500 transition-colors">
                  <Upload size={18} className="mr-2 text-gray-400" />
                  <span className="text-gray-400">Add Images</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleStrategyImageUpload}
                    className="hidden"
                  />
                </label>

                {strategyImages.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {strategyImages.map((item) => (
                      <div key={item.id} className="relative border border-dark-border rounded-lg overflow-hidden">
                        <img src={item.url} alt="Strategy attachment" className="w-full h-24 object-cover" />
                        <button
                          type="button"
                          onClick={() => removeStrategyImage(item.id)}
                          className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white p-1 rounded-full"
                          aria-label="Remove image"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={Boolean(strategyForm.pinned)}
                  onChange={(e) => handleStrategyInput('pinned', e.target.checked)}
                  className="accent-blue-600"
                />
                Pin this strategy
              </label>

              {formError && <p className="text-sm text-red-400">{formError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeStrategyModal}
                  className="flex-1 bg-dark-bg border border-dark-border rounded-lg py-3 text-gray-300 hover:border-gray-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-lg py-3 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : editingStrategy ? 'Save Changes' : 'Save Strategy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active strategy detail panel */}
      {activeStrategy && (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-black/75" onClick={() => setActiveStrategy(null)} />
          <aside className="absolute right-0 top-0 h-full w-full sm:w-[600px] md:w-[760px] bg-dark-card border-l border-dark-border flex flex-col">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-dark-border">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveStrategy(null)}
                  className="sm:hidden flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-2"
                >
                  <ArrowLeft size={14} />
                  Back
                </button>
                <h3 className="text-xl text-white font-bold truncate">{activeStrategy.name || 'Untitled'}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Created {formatDateTime(activeStrategy.createdAt)} | Updated {formatDateTime(activeStrategy.updatedAt || activeStrategy.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveStrategy(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Stats strip */}
              {(() => {
                const stats = tradeStats[activeStrategy.id] || { trades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0 };
                const decided = stats.wins + stats.losses;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase">Trades</p>
                      <p className="text-white text-xl font-bold">{stats.trades}</p>
                    </div>
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase">Win Rate</p>
                      <p className={`text-xl font-bold ${decided === 0 ? 'text-gray-400' : stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                        {decided > 0 ? `${stats.winRate.toFixed(1)}%` : '—'}
                      </p>
                    </div>
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase">W / L</p>
                      <p className="text-white text-xl font-bold">
                        <span className="text-green-400">{stats.wins}</span>
                        <span className="text-gray-500 mx-1">/</span>
                        <span className="text-red-400">{stats.losses}</span>
                      </p>
                    </div>
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase">Net P&L</p>
                      <p className={`text-xl font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {stats.totalPnl >= 0 ? '+' : '-'}${Math.abs(stats.totalPnl).toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {Array.isArray(activeStrategy.tags) && activeStrategy.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activeStrategy.tags.map((tag) => (
                    <span key={`${activeStrategy.id}-${tag}`} className="bg-blue-600/20 text-blue-300 px-2 py-1 rounded text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {getImageUrls(activeStrategy).length > 0 && (
                <div>
                  <h4 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Reference Charts</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {getImageUrls(activeStrategy).map((url, index) => (
                      <button
                        key={`${activeStrategy.id}-image-${index}`}
                        type="button"
                        onClick={() => setExpandedImage({ url, title: activeStrategy.name || 'Strategy chart' })}
                        className="border border-dark-border rounded-lg overflow-hidden hover:border-gray-500 transition-colors"
                      >
                        <img src={url} alt={`Strategy chart ${index + 1}`} className="w-full h-24 object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeStrategy.description && (
                <div>
                  <h4 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Description</h4>
                  <div className="border border-dark-border rounded-lg bg-dark-bg p-4">
                    <p className="text-gray-200 whitespace-pre-wrap text-sm leading-7">{activeStrategy.description}</p>
                  </div>
                </div>
              )}

              {activeStrategy.whatWorked && (
                <div>
                  <h4 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">What Worked</h4>
                  <div className="border border-green-700/30 rounded-lg bg-green-900/10 p-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {activeStrategy.whatWorked}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {activeStrategy.lessonsLearned && (
                <div>
                  <h4 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Lessons Learned</h4>
                  <div className="border border-yellow-700/30 rounded-lg bg-yellow-900/10 p-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {activeStrategy.lessonsLearned}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Examples / Entries */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
                    Examples / Setups ({activeStrategyEntries.length})
                  </h4>
                  <button
                    type="button"
                    onClick={openAddEntry}
                    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs transition-colors"
                  >
                    <Plus size={12} />
                    Add Example
                  </button>
                </div>

                {activeStrategyEntries.length === 0 && (
                  <div className="bg-dark-bg border border-dark-border rounded-lg p-6 text-center text-gray-400 text-sm">
                    No examples yet. Add one to document a specific setup.
                  </div>
                )}

                <div className="space-y-3">
                  {activeStrategyEntries.map((entry) => {
                    const entryImagesUrls = getImageUrls(entry);
                    return (
                      <div key={entry.id} className="bg-dark-bg border border-dark-border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h5 className="text-white font-semibold leading-tight truncate">{entry.title || 'Untitled example'}</h5>
                            <p className="text-xs text-gray-500 mt-0.5">{formatDate(entry.createdAt)}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditEntry(entry)}
                              className="text-gray-400 hover:text-blue-400 p-1.5 rounded hover:bg-dark-card transition-colors"
                              aria-label="Edit example"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="text-gray-400 hover:text-red-400 p-1.5 rounded hover:bg-dark-card transition-colors"
                              aria-label="Delete example"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {entryImagesUrls.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {entryImagesUrls.map((url, idx) => (
                              <button
                                key={`${entry.id}-img-${idx}`}
                                type="button"
                                onClick={() => setExpandedImage({ url, title: entry.title || 'Example chart' })}
                                className="border border-dark-border rounded overflow-hidden hover:border-gray-500 transition-colors"
                              >
                                <img src={url} alt={`Example ${idx + 1}`} className="w-full h-24 object-cover" />
                              </button>
                            ))}
                          </div>
                        )}

                        {entry.content && (
                          <div className="border border-dark-border rounded bg-dark-card p-3">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                              {entry.content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {!activeStrategy.description &&
                !activeStrategy.whatWorked &&
                !activeStrategy.lessonsLearned &&
                getImageUrls(activeStrategy).length === 0 && (
                  <div className="text-gray-400 text-sm text-center py-6 border border-dashed border-dark-border rounded-lg">
                    <BookOpen size={24} className="mx-auto mb-2 text-gray-600" />
                    Add a description, lessons, or examples to start documenting this strategy.
                  </div>
                )}
            </div>

            <div className="p-4 border-t border-dark-border bg-dark-card flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openEditStrategy(activeStrategy)}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm transition-colors"
              >
                <Pencil size={14} />
                Edit Strategy
              </button>
              <button
                type="button"
                onClick={() => handleDeleteStrategy(activeStrategy.id)}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Entry modal */}
      {isEntryModalOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-[90] p-2 sm:p-4 overflow-y-auto flex items-center justify-center"
          onClick={closeEntryModal}
        >
          <div
            className="bg-dark-card border border-dark-border rounded-lg w-full max-w-2xl max-h-[calc(100vh-1rem)] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={handleSaveEntry} className="p-5 space-y-4">
              <h3 className="text-lg font-bold text-white">
                {editingEntry ? 'Edit Example' : 'New Example'}
                {activeStrategy && <span className="text-gray-400 text-sm font-normal ml-2">in {activeStrategy.name}</span>}
              </h3>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Title</label>
                <input
                  type="text"
                  value={entryForm.title}
                  onChange={(e) => handleEntryInput('title', e.target.value)}
                  placeholder="e.g., June 12 BTC 1H sweep"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Chart Images</label>
                <label className="flex items-center justify-center w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 cursor-pointer hover:border-gray-500 transition-colors">
                  <Upload size={18} className="mr-2 text-gray-400" />
                  <span className="text-gray-400">Add Images</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleEntryImageUpload}
                    className="hidden"
                  />
                </label>

                {entryImages.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {entryImages.map((item) => (
                      <div key={item.id} className="relative border border-dark-border rounded-lg overflow-hidden">
                        <img src={item.url} alt="Example attachment" className="w-full h-24 object-cover" />
                        <button
                          type="button"
                          onClick={() => removeEntryImage(item.id)}
                          className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white p-1 rounded-full"
                          aria-label="Remove image"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Notes (Markdown)</label>
                <textarea
                  rows="10"
                  value={entryForm.content}
                  onChange={(e) => handleEntryInput('content', e.target.value)}
                  placeholder="Setup details, what you saw, why this is a good example..."
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-white resize-y focus:outline-none focus:border-blue-500"
                />
              </div>

              {formError && <p className="text-sm text-red-400">{formError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEntryModal}
                  className="flex-1 bg-dark-bg border border-dark-border rounded-lg py-3 text-gray-300 hover:border-gray-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-lg py-3 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : editingEntry ? 'Save Changes' : 'Save Example'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 p-4 flex items-center justify-center"
          onClick={() => setExpandedImage(null)}
        >
          <button
            type="button"
            onClick={() => setExpandedImage(null)}
            className="absolute top-4 right-4 text-gray-300 hover:text-white transition-colors"
            aria-label="Close image viewer"
          >
            <X size={28} />
          </button>
          <img
            src={expandedImage.url}
            alt={expandedImage.title}
            className="max-w-full max-h-full object-contain rounded-lg border border-dark-border"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default Strategies;
