import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { Brain, CheckSquare, Lightbulb, Search, Trash2 } from 'lucide-react';
import { db } from '../config/firebase';

const defaultChecklist = {
  followedPlan: false,
  waitedForConfirmation: false,
  respectedRisk: false,
  respectedStop: false
};

const defaultFormData = {
  title: '',
  type: 'post-trade',
  session: 'new-york',
  mood: 0,
  confidence: 5,
  discipline: 5,
  tags: '',
  reflection: '',
  actionItem: '',
  checklist: defaultChecklist
};

const entryTypes = [
  { value: 'pre-market', label: 'Pre-market Plan' },
  { value: 'post-trade', label: 'Post-trade Review' },
  { value: 'lesson', label: 'Lesson Learned' },
  { value: 'idea', label: 'Idea / Reminder' }
];

const sessions = [
  { value: 'asia', label: 'Asia' },
  { value: 'london', label: 'London' },
  { value: 'new-york', label: 'New York' },
  { value: 'all-day', label: 'All Day' }
];

const moodMeta = {
  '-2': { label: 'Frustrated', color: 'text-red-400' },
  '-1': { label: 'Cautious', color: 'text-orange-400' },
  '0': { label: 'Neutral', color: 'text-gray-300' },
  '1': { label: 'Focused', color: 'text-blue-400' },
  '2': { label: 'Confident', color: 'text-green-400' }
};

const formatDateTime = (value) => {
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const checklistLabelMap = {
  followedPlan: 'Followed my plan',
  waitedForConfirmation: 'Waited for confirmation',
  respectedRisk: 'Respected risk size',
  respectedStop: 'Respected stop loss'
};

function TradingMindset() {
  const [entries, setEntries] = useState([]);
  const [formData, setFormData] = useState(defaultFormData);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'mindsetEntries'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((entryDoc) => ({
          id: entryDoc.id,
          ...entryDoc.data()
        }));
        setEntries(docs);
      },
      (error) => {
        console.error('Error loading mindset entries:', error);
        setErrorMessage('Could not load mindset entries. Please refresh.');
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredEntries = useMemo(() => (
    entries.filter((entry) => {
      const searchableText = [
        entry.title,
        entry.reflection,
        entry.actionItem,
        ...(entry.tags || [])
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = searchableText.includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || entry.type === filterType;

      return matchesSearch && matchesType;
    })
  ), [entries, filterType, searchTerm]);

  const metrics = useMemo(() => {
    if (entries.length === 0) {
      return {
        total: 0,
        thisWeek: 0,
        avgConfidence: 0,
        avgDiscipline: 0
      };
    }

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const thisWeek = entries.filter((entry) => {
      const entryDate = entry.createdAt?.toDate?.() || new Date(entry.createdAt);
      return !Number.isNaN(entryDate.getTime()) && entryDate >= weekAgo;
    }).length;

    const totalConfidence = entries.reduce((sum, entry) => sum + (Number(entry.confidence) || 0), 0);
    const totalDiscipline = entries.reduce((sum, entry) => sum + (Number(entry.discipline) || 0), 0);

    return {
      total: entries.length,
      thisWeek,
      avgConfidence: totalConfidence / entries.length,
      avgDiscipline: totalDiscipline / entries.length
    };
  }, [entries]);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleChecklistToggle = (key) => {
    setFormData((prev) => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [key]: !prev.checklist[key]
      }
    }));
  };

  const handleSaveEntry = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!formData.title.trim() || !formData.reflection.trim()) {
      setErrorMessage('Title and reflection are required.');
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, 'mindsetEntries'), {
        title: formData.title.trim(),
        type: formData.type,
        session: formData.session,
        mood: Number(formData.mood),
        confidence: Number(formData.confidence),
        discipline: Number(formData.discipline),
        tags: formData.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        reflection: formData.reflection.trim(),
        actionItem: formData.actionItem.trim(),
        checklist: formData.checklist,
        createdAt: serverTimestamp()
      });

      setFormData(defaultFormData);
    } catch (error) {
      console.error('Error saving mindset entry:', error);
      setErrorMessage('Could not save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId) => {
    const shouldDelete = window.confirm('Delete this mindset entry?');
    if (!shouldDelete) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'mindsetEntries', entryId));
    } catch (error) {
      console.error('Error deleting mindset entry:', error);
      setErrorMessage('Could not delete entry. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-dark-card border border-dark-border rounded-lg p-6">
        <h2 className="text-2xl font-bold text-white">Trading Mindset</h2>
        <p className="text-gray-400 mt-2">
          Journal your thoughts, process quality, and next actions so you can improve your decision-making.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Entries</p>
          <p className="text-2xl font-bold text-white mt-1">{metrics.total}</p>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Last 7 Days</p>
          <p className="text-2xl font-bold text-white mt-1">{metrics.thisWeek}</p>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Avg Confidence</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{metrics.avgConfidence.toFixed(1)}/10</p>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Avg Discipline</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{metrics.avgDiscipline.toFixed(1)}/10</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-2 bg-dark-card border border-dark-border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="text-blue-400" size={18} />
            <h3 className="text-white text-lg font-semibold">New Mindset Entry</h3>
          </div>

          <form onSubmit={handleSaveEntry} className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                placeholder="What happened or what are you planning?"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Entry Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => handleFieldChange('type', e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {entryTypes.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-2">Session</label>
                <select
                  value={formData.session}
                  onChange={(e) => handleFieldChange('session', e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  {sessions.map((session) => (
                    <option key={session.value} value={session.value}>{session.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                <p className="text-gray-400 text-sm">Mood</p>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="1"
                  value={formData.mood}
                  onChange={(e) => handleFieldChange('mood', Number(e.target.value))}
                  className="w-full mt-2"
                />
                <p className={`text-sm font-medium mt-2 ${moodMeta[formData.mood]?.color || 'text-gray-300'}`}>
                  {moodMeta[formData.mood]?.label || 'Neutral'}
                </p>
              </div>
              <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                <p className="text-gray-400 text-sm">Confidence</p>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.confidence}
                  onChange={(e) => handleFieldChange('confidence', Number(e.target.value))}
                  className="w-full mt-2"
                />
                <p className="text-blue-400 text-sm font-medium mt-2">{formData.confidence}/10</p>
              </div>
              <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                <p className="text-gray-400 text-sm">Discipline</p>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.discipline}
                  onChange={(e) => handleFieldChange('discipline', Number(e.target.value))}
                  className="w-full mt-2"
                />
                <p className="text-green-400 text-sm font-medium mt-2">{formData.discipline}/10</p>
              </div>
            </div>

            <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckSquare className="text-gray-400" size={16} />
                <p className="text-white text-sm font-medium">Execution Checklist</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(checklistLabelMap).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleChecklistToggle(key)}
                    className={`text-left border rounded-lg px-3 py-2 text-sm transition-colors ${
                      formData.checklist[key]
                        ? 'border-green-600 bg-green-900/20 text-green-300'
                        : 'border-dark-border bg-dark-card text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {formData.checklist[key] ? 'x ' : ''}{label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Reflection</label>
              <textarea
                value={formData.reflection}
                onChange={(e) => handleFieldChange('reflection', e.target.value)}
                rows="5"
                placeholder="What did you do well? What was off? What should change next time?"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 resize-none"
                required
              />
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Next Action</label>
              <input
                type="text"
                value={formData.actionItem}
                onChange={(e) => handleFieldChange('actionItem', e.target.value)}
                placeholder="One concrete action for next session"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Tags (comma separated)</label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => handleFieldChange('tags', e.target.value)}
                placeholder="e.g., revenge-trading, patience, risk-control"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {errorMessage && <p className="text-red-400 text-sm">{errorMessage}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-700 rounded-lg py-3 text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Mindset Entry'}
            </button>
          </form>
        </div>

        <div className="xl:col-span-3 bg-dark-card border border-dark-border rounded-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="text-yellow-400" size={18} />
              <h3 className="text-white text-lg font-semibold">Mindset Log</h3>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search entries..."
                  className="w-full sm:w-56 bg-dark-bg border border-dark-border rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Types</option>
                {entryTypes.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 max-h-[1000px] overflow-y-auto pr-1">
            {filteredEntries.length === 0 && (
              <div className="bg-dark-bg border border-dark-border rounded-lg p-6 text-center">
                <p className="text-gray-400">No mindset entries yet. Add your first reflection.</p>
              </div>
            )}

            {filteredEntries.map((entry) => {
              const checklist = entry.checklist || defaultChecklist;
              const checklistScore = Object.values(checklist).filter(Boolean).length;
              return (
                <div key={entry.id} className="bg-dark-bg border border-dark-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-white font-semibold">{entry.title}</h4>
                      <p className="text-gray-500 text-xs mt-1">{formatDateTime(entry.createdAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                      aria-label="Delete entry"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="text-xs bg-blue-900/30 text-blue-300 border border-blue-700/40 px-2 py-1 rounded">
                      {entryTypes.find((type) => type.value === entry.type)?.label || entry.type}
                    </span>
                    <span className="text-xs bg-dark-card text-gray-300 border border-dark-border px-2 py-1 rounded">
                      {sessions.find((session) => session.value === entry.session)?.label || entry.session}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded border border-dark-border ${moodMeta[entry.mood]?.color || 'text-gray-300'}`}>
                      Mood: {moodMeta[entry.mood]?.label || 'Neutral'}
                    </span>
                  </div>

                  <p className="text-gray-200 text-sm mt-3 whitespace-pre-wrap">{entry.reflection}</p>

                  {entry.actionItem && (
                    <p className="text-green-300 text-sm mt-3">
                      Next: {entry.actionItem}
                    </p>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-xs">
                    <div className="bg-dark-card border border-dark-border rounded px-2 py-1 text-gray-300">
                      Confidence: <span className="text-white">{entry.confidence}/10</span>
                    </div>
                    <div className="bg-dark-card border border-dark-border rounded px-2 py-1 text-gray-300">
                      Discipline: <span className="text-white">{entry.discipline}/10</span>
                    </div>
                    <div className="bg-dark-card border border-dark-border rounded px-2 py-1 text-gray-300">
                      Checklist: <span className="text-white">{checklistScore}/4</span>
                    </div>
                    <div className="bg-dark-card border border-dark-border rounded px-2 py-1 text-gray-300">
                      Notes: <span className="text-white">{(entry.tags || []).length}</span>
                    </div>
                  </div>

                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {entry.tags.map((tag) => (
                        <span key={`${entry.id}-${tag}`} className="text-xs bg-dark-card border border-dark-border text-gray-300 px-2 py-1 rounded">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TradingMindset;
