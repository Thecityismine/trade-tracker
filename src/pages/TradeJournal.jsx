import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Plus, Search, X, Pencil, Trash2, ImageIcon, Upload } from 'lucide-react';
import { db, storage } from '../config/firebase';
import { MAX_IMAGE_SIZE_BYTES, uploadImageWithFallback } from '../utils/imageUpload';

const withTimeout = (promise, ms, timeoutMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

const formatDateForInput = (value) => {
  if (!value) return '';
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalInputDate = (dateString) => {
  if (!dateString) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const formatDisplayDate = (value) => {
  if (!value) return 'No trade date';
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return 'No trade date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const resultStyles = {
  win: 'bg-green-900/30 text-green-300 border-green-700/40',
  loss: 'bg-red-900/30 text-red-300 border-red-700/40',
  breakeven: 'bg-gray-700/40 text-gray-200 border-gray-600/50'
};

const defaultFormData = {
  title: '',
  ticker: 'BTC',
  result: 'win',
  setupType: '',
  tradeDate: '',
  whyGoodIdea: '',
  whatWentWrong: '',
  feedbackForFuture: '',
  nextAction: '',
  executionScore: 5,
  confidenceScore: 5,
  tags: ''
};

function TradeJournal() {
  const [entries, setEntries] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [expandedImage, setExpandedImage] = useState(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [journalImage, setJournalImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [resultFilter, setResultFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [brokenImages, setBrokenImages] = useState({});

  useEffect(() => {
    const entriesQuery = query(collection(db, 'tradeJournalEntries'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      entriesQuery,
      (snapshot) => {
        const journalEntries = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data()
        }));
        setEntries(journalEntries);
      },
      (error) => {
        console.error('Error loading trade journal entries:', error);
        setFormError('Could not load trade journal entries.');
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isModalOpen && !expandedImage) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen, expandedImage]);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeoutId = setTimeout(() => setStatusMessage(''), 4000);
    return () => clearTimeout(timeoutId);
  }, [statusMessage]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesResult = resultFilter === 'all' || entry.result === resultFilter;
      if (!matchesResult) return false;

      const haystack = [
        entry.title,
        entry.ticker,
        entry.setupType,
        entry.whyGoodIdea,
        entry.whatWentWrong,
        entry.feedbackForFuture,
        entry.nextAction,
        ...(entry.tags || [])
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(searchTerm.toLowerCase());
    });
  }, [entries, resultFilter, searchTerm]);

  const stats = useMemo(() => {
    const winCount = entries.filter((entry) => entry.result === 'win').length;
    const lossCount = entries.filter((entry) => entry.result === 'loss').length;
    const avgExecution = entries.length
      ? entries.reduce((sum, entry) => sum + (Number(entry.executionScore) || 0), 0) / entries.length
      : 0;

    return {
      total: entries.length,
      winCount,
      lossCount,
      avgExecution
    };
  }, [entries]);

  const resetForm = () => {
    setEditingEntry(null);
    setFormData(defaultFormData);
    setJournalImage(null);
    setImagePreview(null);
    setFormError('');
  };

  const openAddModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (entry) => {
    setEditingEntry(entry);
    setFormError('');
    setJournalImage(null);
    setImagePreview(entry.imageUrl || null);
    setFormData({
      title: entry.title || '',
      ticker: entry.ticker || 'BTC',
      result: entry.result || 'win',
      setupType: entry.setupType || '',
      tradeDate: formatDateForInput(entry.tradeDate),
      whyGoodIdea: entry.whyGoodIdea || '',
      whatWentWrong: entry.whatWentWrong || '',
      feedbackForFuture: entry.feedbackForFuture || '',
      nextAction: entry.nextAction || '',
      executionScore: entry.executionScore || 5,
      confidenceScore: entry.confidenceScore || 5,
      tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : ''
    });
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
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setFormError('Image is too large. Please use an image under 10MB.');
      e.target.value = '';
      return;
    }

    setFormError('');
    setJournalImage(file);

    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setStatusMessage('');
    setLoading(true);

    try {
      let imageUrl = editingEntry?.imageUrl || '';
      let imageSource = editingEntry?.imageSource || '';

      if (journalImage) {
        const uploaded = await uploadImageWithFallback({
          file: journalImage,
          storage,
          pathPrefix: 'trade-journal',
          storageTimeoutMs: 10000
        });
        imageUrl = uploaded.imageUrl;
        imageSource = uploaded.imageSource;
      }

      const payload = {
        title: formData.title.trim(),
        ticker: formData.ticker.trim(),
        result: formData.result,
        setupType: formData.setupType.trim(),
        tradeDate: parseLocalInputDate(formData.tradeDate),
        whyGoodIdea: formData.whyGoodIdea,
        whatWentWrong: formData.whatWentWrong,
        feedbackForFuture: formData.feedbackForFuture,
        nextAction: formData.nextAction,
        executionScore: Number(formData.executionScore),
        confidenceScore: Number(formData.confidenceScore),
        tags: formData.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        imageUrl,
        imageSource
      };

      if (!payload.title) {
        throw new Error('Title is required.');
      }

      if (!payload.whyGoodIdea && !payload.whatWentWrong) {
        throw new Error('Add at least one reflection: good idea or what went wrong.');
      }

      if (editingEntry?.id) {
        await withTimeout(
          updateDoc(doc(db, 'tradeJournalEntries', editingEntry.id), {
            ...payload,
            updatedAt: serverTimestamp()
          }),
          15000,
          'Updating trade journal timed out. Please try again.'
        );
        setStatusMessage('Journal entry updated.');
      } else {
        await withTimeout(
          addDoc(collection(db, 'tradeJournalEntries'), {
            ...payload,
            createdAt: serverTimestamp()
          }),
          15000,
          'Saving trade journal timed out. Please try again.'
        );
        setStatusMessage('Journal entry saved.');
      }

      closeModal();
    } catch (error) {
      console.error('Error saving trade journal entry:', error);
      const message = error?.message || 'Error saving journal entry.';
      setFormError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('Delete this journal entry?')) return;

    try {
      await deleteDoc(doc(db, 'tradeJournalEntries', entryId));
      setStatusMessage('Journal entry deleted.');
    } catch (error) {
      console.error('Error deleting trade journal entry:', error);
      alert('Error deleting journal entry.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-white">Trade Journal</h2>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={18} />
          <span>New Journal Entry</span>
        </button>
      </div>

      {statusMessage && (
        <div className="bg-green-900/30 border border-green-700/40 text-green-300 rounded-lg px-4 py-3 text-sm">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Entries</p>
          <p className="text-white text-2xl font-bold mt-1">{stats.total}</p>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Winning Trade Reviews</p>
          <p className="text-green-400 text-2xl font-bold mt-1">{stats.winCount}</p>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Losing Trade Reviews</p>
          <p className="text-red-400 text-2xl font-bold mt-1">{stats.lossCount}</p>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <p className="text-gray-400 text-sm">Avg Execution Score</p>
          <p className="text-blue-400 text-2xl font-bold mt-1">{stats.avgExecution.toFixed(1)}/10</p>
        </div>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-lg p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
          <div className="relative w-full lg:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search notes, tags, setups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'win', label: 'Wins' },
              { id: 'loss', label: 'Losses' },
              { id: 'breakeven', label: 'Breakeven' }
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setResultFilter(option.id)}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  resultFilter === option.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-dark-bg text-gray-300 border-dark-border hover:border-gray-500'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {filteredEntries.length === 0 && (
          <div className="bg-dark-bg border border-dark-border rounded-lg p-8 text-center text-gray-400">
            No journal entries found.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="bg-dark-bg border border-dark-border rounded-lg overflow-hidden">
              <div className="relative aspect-[16/9] bg-black">
                {entry.imageUrl ? (
                  brokenImages[entry.id] ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-2">
                      <ImageIcon size={30} />
                      <span className="text-xs">Image unavailable</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpandedImage({ url: entry.imageUrl, title: entry.title })}
                      className="w-full h-full cursor-zoom-in"
                    >
                      <img
                        src={entry.imageUrl}
                        alt={entry.title}
                        className="w-full h-full object-cover"
                        onError={() => setBrokenImages((prev) => ({ ...prev, [entry.id]: true }))}
                      />
                    </button>
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">No screenshot</div>
                )}

                <div className="absolute bottom-2 right-2 flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(entry)}
                    className="bg-dark-card/90 hover:bg-dark-card text-white p-2 rounded-full border border-dark-border transition-colors"
                    aria-label="Edit entry"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-colors"
                    aria-label="Delete entry"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-white text-lg font-bold">{entry.title}</h3>
                  <span className={`px-2 py-1 rounded text-xs border ${resultStyles[entry.result] || resultStyles.breakeven}`}>
                    {entry.result}
                  </span>
                </div>

                <div className="text-xs text-gray-400">
                  {entry.ticker || 'N/A'} | {formatDisplayDate(entry.tradeDate || entry.createdAt)}{entry.setupType ? ` | ${entry.setupType}` : ''}
                </div>

                {entry.whyGoodIdea && (
                  <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">
                    Why it made sense: {entry.whyGoodIdea}
                  </p>
                )}

                {entry.whatWentWrong && (
                  <p className="text-sm text-red-300 whitespace-pre-wrap break-words">
                    What went wrong: {entry.whatWentWrong}
                  </p>
                )}

                {entry.feedbackForFuture && (
                  <p className="text-sm text-blue-300 whitespace-pre-wrap break-words">
                    Feedback: {entry.feedbackForFuture}
                  </p>
                )}

                {entry.nextAction && (
                  <p className="text-sm text-green-300 whitespace-pre-wrap break-words">
                    Next action: {entry.nextAction}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-dark-card border border-dark-border rounded px-2 py-1 text-gray-300">
                    Execution: <span className="text-white">{entry.executionScore || 0}/10</span>
                  </div>
                  <div className="bg-dark-card border border-dark-border rounded px-2 py-1 text-gray-300">
                    Confidence: <span className="text-white">{entry.confidenceScore || 0}/10</span>
                  </div>
                </div>

                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {entry.tags.map((tag) => (
                      <span key={`${entry.id}-${tag}`} className="bg-blue-600/20 text-blue-300 px-2 py-1 rounded text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/75 z-[70] p-2 sm:p-4 overflow-y-auto flex items-center justify-center">
          <div className="bg-dark-card border border-dark-border rounded-lg w-full max-w-2xl max-h-[calc(100vh-1rem)] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-border">
              <h3 className="text-xl text-white font-bold">{editingEntry ? 'Edit Journal Entry' : 'New Journal Entry'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white transition-colors">
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Ticker</label>
                  <input
                    type="text"
                    value={formData.ticker}
                    onChange={(e) => handleInputChange('ticker', e.target.value)}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Result</label>
                  <select
                    value={formData.result}
                    onChange={(e) => handleInputChange('result', e.target.value)}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="win">Win</option>
                    <option value="loss">Loss</option>
                    <option value="breakeven">Breakeven</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Setup Type</label>
                  <input
                    type="text"
                    value={formData.setupType}
                    onChange={(e) => handleInputChange('setupType', e.target.value)}
                    placeholder="e.g., Breakout, Reversal"
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Trade Date</label>
                  <input
                    type="date"
                    value={formData.tradeDate}
                    onChange={(e) => handleInputChange('tradeDate', e.target.value)}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Why This Trade Was a Good Idea</label>
                <textarea
                  rows="3"
                  value={formData.whyGoodIdea}
                  onChange={(e) => handleInputChange('whyGoodIdea', e.target.value)}
                  placeholder="Context, setup quality, confirmation signals..."
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white resize-none focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">What Went Wrong (if anything)</label>
                <textarea
                  rows="3"
                  value={formData.whatWentWrong}
                  onChange={(e) => handleInputChange('whatWentWrong', e.target.value)}
                  placeholder="Execution mistakes, risk issues, emotional errors..."
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white resize-none focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Feedback for Future Setups</label>
                <textarea
                  rows="3"
                  value={formData.feedbackForFuture}
                  onChange={(e) => handleInputChange('feedbackForFuture', e.target.value)}
                  placeholder="Rules to keep, rules to remove, setup conditions..."
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white resize-none focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Next Action</label>
                <input
                  type="text"
                  value={formData.nextAction}
                  onChange={(e) => handleInputChange('nextAction', e.target.value)}
                  placeholder="One concrete thing to do next session"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Execution Score: {formData.executionScore}/10</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={formData.executionScore}
                    onChange={(e) => handleInputChange('executionScore', Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Confidence Score: {formData.confidenceScore}/10</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={formData.confidenceScore}
                    onChange={(e) => handleInputChange('confidenceScore', Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Screenshot (optional)</label>
                <label className="flex items-center justify-center w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 cursor-pointer hover:border-gray-500 transition-colors">
                  <Upload size={18} className="mr-2 text-gray-400" />
                  <span className="text-gray-400">{journalImage ? journalImage.name : 'Upload Screenshot'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {imagePreview && (
                  <img src={imagePreview} alt="Preview" className="mt-2 w-full rounded-lg border border-dark-border" />
                )}
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Tags (comma separated)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => handleInputChange('tags', e.target.value)}
                  placeholder="e.g., patience, overtrading, trend-confirmation"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {formError && (
                <p className="text-sm text-red-400">{formError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-dark-bg border border-dark-border rounded-lg py-3 text-gray-300 hover:border-gray-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-lg py-3 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : editingEntry ? 'Save Changes' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {expandedImage && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 p-4 flex items-center justify-center"
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
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default TradeJournal;
