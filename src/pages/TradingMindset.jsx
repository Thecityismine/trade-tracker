import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { Brain, CheckSquare, Lightbulb, Search, Trash2 } from 'lucide-react';
import { db } from '../config/firebase';
import Page from '../components/ui/Page';
import Select from '../components/ui/Select';

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
  '-2': { label: 'Frustrated', color: 'text-loss' },
  '-1': { label: 'Cautious', color: 'text-caution' },
  '0': { label: 'Neutral', color: 'text-content-secondary' },
  '1': { label: 'Focused', color: 'text-brand' },
  '2': { label: 'Confident', color: 'text-profit' }
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
    <Page>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-card p-4 shadow-elev-1">
          <p className="text-content-secondary text-sm">Total Entries</p>
          <p className="text-2xl font-bold text-content-primary mt-1">{metrics.total}</p>
        </div>
        <div className="bg-surface rounded-card p-4 shadow-elev-1">
          <p className="text-content-secondary text-sm">Last 7 Days</p>
          <p className="text-2xl font-bold text-content-primary mt-1">{metrics.thisWeek}</p>
        </div>
        <div className="bg-surface rounded-card p-4 shadow-elev-1">
          <p className="text-content-secondary text-sm">Avg Confidence</p>
          <p className="text-2xl font-bold text-brand mt-1">{metrics.avgConfidence.toFixed(1)}/10</p>
        </div>
        <div className="bg-surface rounded-card p-4 shadow-elev-1">
          <p className="text-content-secondary text-sm">Avg Discipline</p>
          <p className="text-2xl font-bold text-profit mt-1">{metrics.avgDiscipline.toFixed(1)}/10</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-2 bg-surface rounded-card p-6 shadow-elev-1">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="text-brand" size={18} />
            <h3 className="text-content-primary text-lg font-semibold">New Mindset Entry</h3>
          </div>

          <form onSubmit={handleSaveEntry} className="space-y-4">
            <div>
              <label className="block text-content-secondary text-sm mb-2">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                placeholder="What happened or what are you planning?"
                className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-content-secondary text-sm mb-2">Entry Type</label>
                <Select
                  value={formData.type}
                  onChange={(v) => handleFieldChange('type', v)}
                  options={entryTypes.map((t) => ({ value: t.value, label: t.label }))}
                />
              </div>
              <div>
                <label className="block text-content-secondary text-sm mb-2">Session</label>
                <Select
                  value={formData.session}
                  onChange={(v) => handleFieldChange('session', v)}
                  options={sessions.map((s) => ({ value: s.value, label: s.label }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-surface-raised rounded-control p-3">
                <p className="text-content-secondary text-sm">Mood</p>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="1"
                  value={formData.mood}
                  onChange={(e) => handleFieldChange('mood', Number(e.target.value))}
                  className="w-full mt-2"
                />
                <p className={`text-sm font-medium mt-2 ${moodMeta[formData.mood]?.color || 'text-content-secondary'}`}>
                  {moodMeta[formData.mood]?.label || 'Neutral'}
                </p>
              </div>
              <div className="bg-surface-raised rounded-control p-3">
                <p className="text-content-secondary text-sm">Confidence</p>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.confidence}
                  onChange={(e) => handleFieldChange('confidence', Number(e.target.value))}
                  className="w-full mt-2"
                />
                <p className="text-brand text-sm font-medium mt-2">{formData.confidence}/10</p>
              </div>
              <div className="bg-surface-raised rounded-control p-3">
                <p className="text-content-secondary text-sm">Discipline</p>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.discipline}
                  onChange={(e) => handleFieldChange('discipline', Number(e.target.value))}
                  className="w-full mt-2"
                />
                <p className="text-profit text-sm font-medium mt-2">{formData.discipline}/10</p>
              </div>
            </div>

            <div className="bg-surface-raised rounded-control p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckSquare className="text-content-secondary" size={16} />
                <p className="text-content-primary text-sm font-medium">Execution Checklist</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(checklistLabelMap).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleChecklistToggle(key)}
                    className={`text-left border rounded-lg px-3 py-2 text-sm transition-colors ${
                      formData.checklist[key]
                        ? 'border-profit bg-profit/10 text-profit'
                        : 'border-line-strong bg-surface text-content-secondary hover:border-brand/50'
                    }`}
                  >
                    {formData.checklist[key] ? 'x ' : ''}{label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-content-secondary text-sm mb-2">Reflection</label>
              <textarea
                value={formData.reflection}
                onChange={(e) => handleFieldChange('reflection', e.target.value)}
                rows="5"
                placeholder="What did you do well? What was off? What should change next time?"
                className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-3 text-content-primary focus:outline-none focus:border-brand resize-none"
                required
              />
            </div>

            <div>
              <label className="block text-content-secondary text-sm mb-2">Next Action</label>
              <input
                type="text"
                value={formData.actionItem}
                onChange={(e) => handleFieldChange('actionItem', e.target.value)}
                placeholder="One concrete action for next session"
                className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-content-secondary text-sm mb-2">Tags (comma separated)</label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => handleFieldChange('tags', e.target.value)}
                placeholder="e.g., revenge-trading, patience, risk-control"
                className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
              />
            </div>

            {errorMessage && <p className="text-loss text-sm">{errorMessage}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-brand hover:bg-brand-hover rounded-lg py-3 text-content-primary font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Mindset Entry'}
            </button>
          </form>
        </div>

        <div className="xl:col-span-3 bg-surface rounded-card p-6 shadow-elev-1">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="text-warn" size={18} />
              <h3 className="text-content-primary text-lg font-semibold">Mindset Log</h3>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search entries..."
                  className="w-full sm:w-56 bg-surface-raised border border-line-strong rounded-lg pl-9 pr-3 py-2 text-content-primary text-sm focus:outline-none focus:border-brand"
                />
              </div>
              <Select
                className="sm:w-44"
                value={filterType}
                onChange={setFilterType}
                options={[
                  { value: 'all', label: 'All Types' },
                  ...entryTypes.map((t) => ({ value: t.value, label: t.label })),
                ]}
              />
            </div>
          </div>

          <div className="space-y-3 max-h-[1000px] overflow-y-auto pr-1">
            {filteredEntries.length === 0 && (
              <div className="bg-surface-raised rounded-control p-6 text-center">
                <p className="text-content-secondary">No mindset entries yet. Add your first reflection.</p>
              </div>
            )}

            {filteredEntries.map((entry) => {
              const checklist = entry.checklist || defaultChecklist;
              const checklistScore = Object.values(checklist).filter(Boolean).length;
              return (
                <div key={entry.id} className="bg-surface-raised rounded-control p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-content-primary font-semibold">{entry.title}</h4>
                      <p className="text-content-muted text-xs mt-1">{formatDateTime(entry.createdAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteEntry(entry.id)}
                      className="text-content-muted hover:text-loss transition-colors"
                      aria-label="Delete entry"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="text-xs bg-brand-muted text-brand-hover border border-brand/40 px-2 py-1 rounded">
                      {entryTypes.find((type) => type.value === entry.type)?.label || entry.type}
                    </span>
                    <span className="text-xs bg-surface text-content-secondary px-2 py-1 rounded shadow-elev-1">
                      {sessions.find((session) => session.value === entry.session)?.label || entry.session}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-chip border border-line-strong ${moodMeta[entry.mood]?.color || 'text-content-secondary'}`}>
                      Mood: {moodMeta[entry.mood]?.label || 'Neutral'}
                    </span>
                  </div>

                  <p className="text-content-secondary text-sm mt-3 whitespace-pre-wrap">{entry.reflection}</p>

                  {entry.actionItem && (
                    <p className="text-profit text-sm mt-3">
                      Next: {entry.actionItem}
                    </p>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-xs">
                    <div className="bg-surface-hover rounded-chip px-2 py-1 text-content-secondary">
                      Confidence: <span className="text-content-primary">{entry.confidence}/10</span>
                    </div>
                    <div className="bg-surface-hover rounded-chip px-2 py-1 text-content-secondary">
                      Discipline: <span className="text-content-primary">{entry.discipline}/10</span>
                    </div>
                    <div className="bg-surface-hover rounded-chip px-2 py-1 text-content-secondary">
                      Checklist: <span className="text-content-primary">{checklistScore}/4</span>
                    </div>
                    <div className="bg-surface-hover rounded-chip px-2 py-1 text-content-secondary">
                      Notes: <span className="text-content-primary">{(entry.tags || []).length}</span>
                    </div>
                  </div>

                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {entry.tags.map((tag) => (
                        <span key={`${entry.id}-${tag}`} className="text-xs bg-surface text-content-secondary px-2 py-1 rounded shadow-elev-1">
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
    </Page>
  );
}

export default TradingMindset;
