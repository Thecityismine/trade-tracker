import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Plus, Search, X, Pencil, Trash2, Pin, PinOff, Copy, Upload, StickyNote } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db, storage } from '../config/firebase';
import { MAX_IMAGE_SIZE_BYTES, uploadImageWithFallback } from '../utils/imageUpload';
import Page from '../components/ui/Page';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';

const CATEGORY_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'lesson', label: 'Lessons' },
  { id: 'mistake', label: 'Mistakes' },
  { id: 'rule', label: 'Rules' },
  { id: 'mindset', label: 'Mindset' },
  { id: 'market-cipher', label: 'Market Cipher' }
];

const EDITABLE_CATEGORIES = CATEGORY_OPTIONS.filter((option) => option.id !== 'all');

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'updated', label: 'Recently updated' },
  { id: 'pinned', label: 'Pinned first' }
];

const defaultFormData = {
  title: '',
  category: 'lesson',
  content: '',
  tags: '',
  mistakeType: '',
  pinned: false
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

const getCategoryLabel = (category) => {
  const match = EDITABLE_CATEGORIES.find((option) => option.id === category);
  return match?.label || 'Uncategorized';
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

const getPreviewSnippet = (content, maxLength = 220, maxLines = 4) => {
  const rawLines = String(content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .map(cleanMarkdownLine)
    .filter(Boolean);

  if (rawLines.length === 0) return 'No note content yet.';

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
      if (remaining > 0) {
        previewLines.push(line.slice(0, remaining).trimEnd());
      }
      didTruncate = true;
      break;
    }

    previewLines.push(line);
    totalChars += line.length;
  }

  return didTruncate ? `${previewLines.join('\n')}...` : previewLines.join('\n');
};

const getCreatedAtMs = (note) => toDate(note.createdAt)?.getTime() || 0;
const getUpdatedAtMs = (note) => toDate(note.updatedAt)?.getTime() || getCreatedAtMs(note);
const getImageUrls = (note) => {
  if (Array.isArray(note.imageUrls)) {
    return note.imageUrls.filter((item) => typeof item === 'string' && item.trim());
  }
  if (typeof note.imageUrl === 'string' && note.imageUrl.trim()) {
    return [note.imageUrl];
  }
  return [];
};

const categoryChipClasses = {
  lesson: 'bg-profit/15 text-profit border-profit/40',
  mistake: 'bg-loss/15 text-loss border-loss/40',
  rule: 'bg-brand-muted text-brand-hover border-brand/40',
  mindset: 'bg-brand/15 text-brand border-brand/40',
  'market-cipher': 'bg-warn/15 text-warn border-warn/40'
};

function Notebook() {
  const [notes, setNotes] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [activeNote, setActiveNote] = useState(null);
  const [expandedImage, setExpandedImage] = useState(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [mistakeTypeFilter, setMistakeTypeFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [imageItems, setImageItems] = useState([]);

  useEffect(() => {
    const notesQuery = query(collection(db, 'notebookEntries'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      notesQuery,
      (snapshot) => {
        const entries = snapshot.docs.map((snapshotDoc) => {
          const data = snapshotDoc.data();
          return {
            id: snapshotDoc.id,
            ...data,
            mistakeType: data.mistakeType || data.mistake_type || '',
            imageUrls: Array.isArray(data.imageUrls) ? data.imageUrls : getImageUrls(data)
          };
        });
        setNotes(entries);
      },
      (error) => {
        console.error('Error loading notebook entries:', error);
        setFormError('Could not load notebook notes.');
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeoutId = setTimeout(() => setStatusMessage(''), 4000);
    return () => clearTimeout(timeoutId);
  }, [statusMessage]);

  useEffect(() => {
    if (!isModalOpen && !activeNote && !expandedImage) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen, activeNote, expandedImage]);

  useEffect(() => {
    if (!activeNote?.id) return;
    const latest = notes.find((note) => note.id === activeNote.id);
    if (!latest) {
      setActiveNote(null);
      return;
    }
    setActiveNote(latest);
  }, [notes, activeNote?.id]);

  const stats = useMemo(() => {
    const categoriesCount = new Set(notes.map((note) => note.category).filter(Boolean)).size;
    const recurringMistakes = notes.filter((note) => note.category === 'mistake').length;
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const notesThisWeek = notes.filter((note) => getCreatedAtMs(note) >= sevenDaysAgo).length;

    return {
      totalNotes: notes.length,
      categoriesCount,
      recurringMistakes,
      notesThisWeek
    };
  }, [notes]);

  const topMistakes = useMemo(() => {
    const counts = notes.reduce((acc, note) => {
      if (note.category !== 'mistake') return acc;
      const key = String(note.mistakeType || '').trim();
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => ({ type, count }));
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    const filtered = notes.filter((note) => {
      if (categoryFilter !== 'all' && note.category !== categoryFilter) return false;
      if (mistakeTypeFilter !== 'all' && String(note.mistakeType || '').trim().toLowerCase() !== mistakeTypeFilter.toLowerCase()) return false;

      if (!search) return true;
      const haystack = [
        note.title,
        note.content,
        note.category,
        note.mistakeType,
        ...(note.tags || [])
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'oldest') {
        return getCreatedAtMs(a) - getCreatedAtMs(b);
      }

      if (sortBy === 'updated') {
        return getUpdatedAtMs(b) - getUpdatedAtMs(a);
      }

      if (sortBy === 'pinned') {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) {
          return a.pinned ? -1 : 1;
        }
        return getCreatedAtMs(b) - getCreatedAtMs(a);
      }

      return getCreatedAtMs(b) - getCreatedAtMs(a);
    });

    return sorted;
  }, [notes, categoryFilter, mistakeTypeFilter, searchTerm, sortBy]);

  const resetForm = () => {
    setEditingNote(null);
    setFormData(defaultFormData);
    setFormError('');
    setImageItems([]);
  };

  const openAddModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (note) => {
    setActiveNote(null);
    setEditingNote(note);
    setFormError('');
    setFormData({
      title: note.title || '',
      category: note.category || 'lesson',
      content: note.content || '',
      tags: toTagsString(note.tags),
      mistakeType: note.mistakeType || note.mistake_type || '',
      pinned: Boolean(note.pinned)
    });
    setImageItems(
      getImageUrls(note).map((url, index) => ({
        id: `existing-${index}-${url.slice(-8)}`,
        file: null,
        url,
        existing: true
      }))
    );
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = (e) => {
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
      .then((newItems) => {
        setImageItems((prev) => [...prev, ...newItems]);
      })
      .catch(() => {
        setFormError('Could not load selected image.');
      });

    e.target.value = '';
  };

  const removeImageItem = (itemId) => {
    setImageItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleSaveNote = async (e) => {
    e.preventDefault();
    setFormError('');
    setLoading(true);

    try {
      const uploadedImages = [];
      const imageSources = [];

      for (const item of imageItems) {
        if (item.existing) {
          uploadedImages.push(item.url);
          continue;
        }

        if (!item.file) {
          continue;
        }

        const uploaded = await uploadImageWithFallback({
          file: item.file,
          storage,
          pathPrefix: 'notebook',
          storageTimeoutMs: 10000
        });

        if (uploaded.imageUrl) {
          uploadedImages.push(uploaded.imageUrl);
          imageSources.push(uploaded.imageSource || '');
        }
      }

      const payload = {
        title: formData.title.trim(),
        category: formData.category,
        content: formData.content,
        tags: parseTags(formData.tags),
        mistakeType: formData.category === 'mistake' ? formData.mistakeType.trim() : '',
        mistake_type: formData.category === 'mistake' ? formData.mistakeType.trim() : '',
        imageUrls: uploadedImages,
        imageSources,
        pinned: Boolean(formData.pinned)
      };

      if (!payload.title) {
        throw new Error('Title is required.');
      }

      if (!payload.content.trim()) {
        throw new Error('Note content is required.');
      }

      if (editingNote?.id) {
        await updateDoc(doc(db, 'notebookEntries', editingNote.id), {
          ...payload,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'notebookEntries'), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      setStatusMessage('Saved.');
      closeModal();
    } catch (error) {
      console.error('Error saving notebook note:', error);
      const message = error?.message || 'Error saving note.';
      setFormError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Delete this note?')) return;

    try {
      await deleteDoc(doc(db, 'notebookEntries', noteId));
      if (activeNote?.id === noteId) {
        setActiveNote(null);
      }
      setStatusMessage('Note deleted.');
    } catch (error) {
      console.error('Error deleting notebook note:', error);
      alert('Error deleting note.');
    }
  };

  const handleDuplicateNote = async (note) => {
    try {
      await addDoc(collection(db, 'notebookEntries'), {
        title: `${note.title || 'Untitled'} (Copy)`,
        category: note.category || 'lesson',
        content: note.content || '',
        tags: Array.isArray(note.tags) ? note.tags : [],
        mistakeType: note.mistakeType || '',
        mistake_type: note.mistakeType || '',
        imageUrls: getImageUrls(note),
        imageSources: Array.isArray(note.imageSources) ? note.imageSources : [],
        pinned: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setStatusMessage('Note duplicated.');
    } catch (error) {
      console.error('Error duplicating notebook note:', error);
      alert('Error duplicating note.');
    }
  };

  const togglePinned = async (note, event) => {
    if (event) {
      event.stopPropagation();
    }

    try {
      await updateDoc(doc(db, 'notebookEntries', note.id), {
        pinned: !note.pinned,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating pin state:', error);
      alert('Error updating pin.');
    }
  };

  return (
    <Page
      actions={
        <Button icon={Plus} onClick={openAddModal}>
          New Note
        </Button>
      }
    >
      {statusMessage && (
        <div className="bg-profit/15 border border-profit/40 text-profit rounded-lg px-4 py-3 text-sm">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-card p-4 shadow-elev-1">
          <p className="text-content-secondary text-sm">Total Notes</p>
          <p className="text-content-primary text-2xl font-bold mt-1">{stats.totalNotes}</p>
        </div>
        <div className="bg-surface rounded-card p-4 shadow-elev-1">
          <p className="text-content-secondary text-sm">Categories Logged</p>
          <p className="text-brand text-2xl font-bold mt-1">{stats.categoriesCount}</p>
        </div>
        <div className="bg-surface rounded-card p-4 shadow-elev-1">
          <p className="text-content-secondary text-sm">Recurring Mistakes</p>
          <p className="text-loss text-2xl font-bold mt-1">{stats.recurringMistakes}</p>
        </div>
        <div className="bg-surface rounded-card p-4 shadow-elev-1">
          <p className="text-content-secondary text-sm">Notes This Week</p>
          <p className="text-profit text-2xl font-bold mt-1">{stats.notesThisWeek}</p>
        </div>
      </div>

      <div className="bg-surface rounded-card p-4 shadow-elev-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-content-secondary">Recurring mistakes:</span>
          {topMistakes.length === 0 && <span className="text-sm text-content-muted">No mistake types logged yet.</span>}
          {topMistakes.map((mistake) => (
            <button
              key={mistake.type}
              type="button"
              onClick={() => setMistakeTypeFilter(mistake.type)}
              className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                mistakeTypeFilter.toLowerCase() === mistake.type.toLowerCase()
                  ? 'bg-red-600 text-content-primary border-loss'
                  : 'bg-surface-raised text-loss border-loss/40 hover:border-loss'
              }`}
            >
              {mistake.type} ({mistake.count})
            </button>
          ))}
          {mistakeTypeFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setMistakeTypeFilter('all')}
              className="px-3 py-1 rounded-lg text-xs border border-line-strong text-content-secondary hover:border-brand/50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-card p-4 sm:p-6 shadow-elev-1">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative w-full lg:max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                type="text"
                placeholder="Search title, tags, content..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface-raised border border-line-strong rounded-lg pl-9 pr-3 py-2 text-content-primary text-sm focus:outline-none focus:border-brand"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-surface-raised border border-line-strong rounded-lg px-3 py-2 text-sm text-content-primary focus:outline-none focus:border-brand"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setCategoryFilter(option.id)}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  categoryFilter === option.id
                    ? 'bg-brand text-content-primary border-brand'
                    : 'bg-surface-raised text-content-secondary border-line-strong hover:border-brand/50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {filteredNotes.length === 0 && (
          <EmptyState
            icon={StickyNote}
            title={notes.length === 0 ? 'Your notebook is empty' : 'No notes match your search'}
            description={notes.length === 0
              ? 'Write down setups, rules and the mistakes you keep repeating — the Notebook is what turns them into playbooks.'
              : 'Try a different search term or clear the filter.'}
            actionLabel={notes.length === 0 ? 'Write your first note' : undefined}
            onAction={notes.length === 0 ? openAddModal : undefined}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredNotes.map((note) => {
            const tags = Array.isArray(note.tags) ? note.tags : [];
            const visibleTags = tags.slice(0, 3);
            const remainingTags = tags.length - visibleTags.length;

            return (
              <div
                key={note.id}
                onClick={() => setActiveNote(note)}
                className="bg-surface-raised border border-line-strong rounded-lg p-4 space-y-3 cursor-pointer hover:border-brand/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-content-primary text-lg font-semibold leading-tight truncate">{note.title || 'Untitled'}</h3>
                  <button
                    type="button"
                    onClick={(event) => togglePinned(note, event)}
                    className={`p-2 rounded-lg border transition-colors ${
                      note.pinned
                        ? 'bg-warn/20 text-warn border-warn/60 hover:border-warn'
                        : 'bg-surface text-content-secondary border-line-strong hover:border-brand/50'
                    }`}
                    aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                  >
                    {note.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                  </button>
                </div>

                <p className="text-sm text-content-secondary leading-relaxed min-h-[5.5rem] whitespace-pre-line">
                  {getPreviewSnippet(note.content)}
                </p>

                <div className="flex flex-wrap gap-2">
                  <span className={`px-2 py-1 rounded text-xs border ${categoryChipClasses[note.category] || 'bg-surface-hover text-content-secondary border-line-strong'}`}>
                    {getCategoryLabel(note.category)}
                  </span>
                  {visibleTags.map((tag) => (
                    <span key={`${note.id}-${tag}`} className="bg-brand/20 text-brand-hover px-2 py-1 rounded text-xs">
                      {tag}
                    </span>
                  ))}
                  {remainingTags > 0 && (
                    <span className="bg-surface-hover text-content-secondary px-2 py-1 rounded-chip text-xs">
                      +{remainingTags}
                    </span>
                  )}
                </div>

                <div className="text-xs text-content-muted space-y-1">
                  <p>Created: {formatDate(note.createdAt)}</p>
                  <p>Updated: {formatDate(note.updatedAt || note.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/75 z-[70] p-2 sm:p-4 overflow-y-auto flex items-center justify-center"
          onClick={closeModal}
        >
          <div
            className="bg-surface rounded-card w-full max-w-3xl max-h-[calc(100vh-1rem)] overflow-y-auto shadow-elev-1"
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={handleSaveNote} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-content-secondary text-sm mb-2">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                    required
                  />
                </div>
                <div>
                  <label className="block text-content-secondary text-sm mb-2">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleInputChange('category', e.target.value)}
                    className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                  >
                    {EDITABLE_CATEGORIES.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.category === 'mistake' && (
                <div>
                  <label className="block text-content-secondary text-sm mb-2">Mistake Type</label>
                  <input
                    type="text"
                    value={formData.mistakeType}
                    onChange={(e) => handleInputChange('mistakeType', e.target.value)}
                    placeholder="e.g., FOMO entry, ignored stop"
                    className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                  />
                </div>
              )}

              <div>
                <label className="block text-content-secondary text-sm mb-2">Tags (comma separated)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => handleInputChange('tags', e.target.value)}
                  placeholder="e.g., risk, patience, setup"
                  className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-2 text-content-primary focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-content-secondary text-sm mb-2">Images</label>
                <label className="flex items-center justify-center w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-3 cursor-pointer hover:border-brand/50 transition-colors">
                  <Upload size={18} className="mr-2 text-content-secondary" />
                  <span className="text-content-secondary">Add Images</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>

                {imageItems.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {imageItems.map((item) => (
                      <div key={item.id} className="relative rounded-lg overflow-hidden">
                        <img
                          src={item.url}
                          alt="Note attachment"
                          className="w-full h-24 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeImageItem(item.id)}
                          className="absolute top-1 right-1 bg-black/70 hover:bg-black text-content-primary p-1 rounded-full"
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
                <label className="block text-content-secondary text-sm mb-2">Content (Markdown)</label>
                <textarea
                  rows="14"
                  value={formData.content}
                  onChange={(e) => handleInputChange('content', e.target.value)}
                  placeholder="Write your long-form note in Markdown..."
                  className="w-full bg-surface-raised border border-line-strong rounded-lg px-4 py-3 text-content-primary resize-y focus:outline-none focus:border-brand"
                  required
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-content-secondary">
                <input
                  type="checkbox"
                  checked={Boolean(formData.pinned)}
                  onChange={(e) => handleInputChange('pinned', e.target.checked)}
                  className="accent-brand"
                />
                Pin this note
              </label>

              {formError && (
                <p className="text-sm text-loss">{formError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-surface-raised border border-line-strong rounded-lg py-3 text-content-secondary hover:border-brand/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-brand hover:bg-brand-hover rounded-lg py-3 text-content-primary font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : editingNote ? 'Save Changes' : 'Save Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeNote && (
        <div className="fixed inset-0 z-[80]">
          <div
            className="absolute inset-0 bg-black/75"
            onClick={() => setActiveNote(null)}
          />
          <aside className="absolute right-0 top-0 h-full w-full sm:w-[560px] md:w-[680px] bg-surface border-l border-line flex flex-col shadow-elev-1">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-line">
              <div>
                <h3 className="text-xl text-content-primary font-bold">{activeNote.title || 'Untitled'}</h3>
                <p className="text-xs text-content-secondary mt-1">
                  Created {formatDateTime(activeNote.createdAt)} | Updated {formatDateTime(activeNote.updatedAt || activeNote.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveNote(null)}
                className="text-content-secondary hover:text-content-primary transition-colors"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex flex-wrap gap-2">
                <span className={`px-2 py-1 rounded text-xs border ${categoryChipClasses[activeNote.category] || 'bg-surface-hover text-content-secondary border-line-strong'}`}>
                  {getCategoryLabel(activeNote.category)}
                </span>
                {activeNote.mistakeType && (
                  <span className="bg-loss/10 border border-loss/40 text-loss px-2 py-1 rounded text-xs">
                    {activeNote.mistakeType}
                  </span>
                )}
              </div>

              {Array.isArray(activeNote.tags) && activeNote.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activeNote.tags.map((tag) => (
                    <span key={`${activeNote.id}-${tag}`} className="bg-brand/20 text-brand-hover px-2 py-1 rounded text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {getImageUrls(activeNote).length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {getImageUrls(activeNote).map((url, index) => (
                    <button
                      key={`${activeNote.id}-image-${index}`}
                      type="button"
                      onClick={() => setExpandedImage({ url, title: activeNote.title || 'Notebook image' })}
                      className="border border-line-strong rounded-lg overflow-hidden hover:border-brand/50 transition-colors"
                    >
                      <img
                        src={url}
                        alt={`Note attachment ${index + 1}`}
                        className="w-full h-24 object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              <div className="rounded-control bg-surface-raised p-4">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ node, ...props }) => <h1 className="text-2xl text-content-primary font-bold mt-4 mb-2" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-xl text-content-primary font-semibold mt-4 mb-2" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-lg text-content-primary font-semibold mt-3 mb-2" {...props} />,
                    p: ({ node, ...props }) => <p className="text-content-secondary leading-7 mb-3 whitespace-pre-wrap" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc ml-5 mb-3 text-content-secondary space-y-1" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal ml-5 mb-3 text-content-secondary space-y-1" {...props} />,
                    li: ({ node, ...props }) => <li className="text-content-secondary" {...props} />,
                    blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-line-strong pl-3 text-content-secondary italic mb-3" {...props} />,
                    code: ({ inline, node, ...props }) => (
                      inline
                        ? <code className="bg-black/40 rounded px-1 py-0.5 text-brand-hover text-sm" {...props} />
                        : <code className="block bg-black/50 rounded p-3 text-brand-hover text-sm overflow-x-auto mb-3" {...props} />
                    ),
                    a: ({ node, ...props }) => <a className="text-brand underline" target="_blank" rel="noreferrer" {...props} />
                  }}
                >
                  {activeNote.content || ''}
                </ReactMarkdown>
              </div>
            </div>

            <div className="p-4 border-t border-line bg-surface flex flex-wrap gap-2 shadow-elev-1">
              <button
                type="button"
                onClick={() => openEditModal(activeNote)}
                className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-content-primary px-3 py-2 rounded-lg text-sm transition-colors"
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDuplicateNote(activeNote)}
                className="inline-flex items-center gap-2 bg-surface-raised border border-line-strong text-content-secondary px-3 py-2 rounded-lg text-sm hover:border-brand/50 transition-colors"
              >
                <Copy size={14} />
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => handleDeleteNote(activeNote.id)}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-content-primary px-3 py-2 rounded-lg text-sm transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </aside>
        </div>
      )}

      {expandedImage && (
        <div
          className="fixed inset-0 z-[90] bg-black/90 p-4 flex items-center justify-center"
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
            alt={expandedImage.title}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </Page>
  );
}

export default Notebook;
