import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Upload, Pencil, Trash2, ImageIcon } from 'lucide-react';
import { collection, addDoc, serverTimestamp, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db, storage } from '../config/firebase';
import { MAX_IMAGE_SIZE_BYTES, uploadImageWithFallback } from '../utils/imageUpload';

const withTimeout = (promise, ms, timeoutMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

function ChartPatterns() {
  const [patterns, setPatterns] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [editingPattern, setEditingPattern] = useState(null);
  const [tradeFilter, setTradeFilter] = useState('all');
  const [biasFilter, setBiasFilter] = useState('all');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tradeType: 'both',
    patternBias: 'neutral'
  });
  const [patternImage, setPatternImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [brokenImages, setBrokenImages] = useState({});

  // Fetch patterns from Firebase
  useEffect(() => {
    const patternsQuery = query(collection(db, 'chartPatterns'), orderBy('dateAdded', 'desc'));
    const unsubscribe = onSnapshot(
      patternsQuery,
      (snapshot) => {
        const patternsData = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data()
        }));
        setPatterns(patternsData);
      },
      (error) => {
        console.error('Error loading patterns:', error);
        setFormError('Could not load patterns. Please refresh.');
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isModalOpen && !expandedImage) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen, expandedImage]);

  useEffect(() => {
    if (!statusMessage) {
      return undefined;
    }

    const timeoutId = setTimeout(() => setStatusMessage(''), 4000);
    return () => clearTimeout(timeoutId);
  }, [statusMessage]);

  const inferTradeType = (pattern) => {
    if (pattern.tradeType) {
      return pattern.tradeType;
    }

    const haystack = [
      pattern.name,
      pattern.description,
      ...(Array.isArray(pattern.tags) ? pattern.tags : [])
    ].join(' ').toLowerCase();

    const hasLong = /\blong\b/.test(haystack);
    const hasShort = /\bshort\b/.test(haystack);

    if (hasLong && !hasShort) return 'long';
    if (hasShort && !hasLong) return 'short';
    if (hasLong && hasShort) return 'both';
    return 'both';
  };

  const inferPatternBias = (pattern) => {
    if (pattern.patternBias && pattern.patternBias !== 'neutral') {
      return pattern.patternBias;
    }

    const haystack = [
      pattern.name,
      pattern.description,
      ...(Array.isArray(pattern.tags) ? pattern.tags : [])
    ].join(' ').toLowerCase();

    const hasBullish = /\bbullish\b/.test(haystack);
    const hasBearish = /\bbearish\b/.test(haystack);

    if (hasBullish && !hasBearish) return 'bullish';
    if (hasBearish && !hasBullish) return 'bearish';
    return 'neutral';
  };

  const filteredPatterns = useMemo(() => {
    return patterns.filter((pattern) => {
      const patternTradeType = inferTradeType(pattern);
      const patternBias = inferPatternBias(pattern);

      const matchesTrade = tradeFilter === 'all'
        || patternTradeType === 'both'
        || patternTradeType === tradeFilter;

      const matchesBias = biasFilter === 'all'
        || patternBias === biasFilter;

      return matchesTrade && matchesBias;
    });
  }, [patterns, tradeFilter, biasFilter]);

  const resetForm = () => {
    setEditingPattern(null);
    setFormData({ name: '', description: '', tradeType: 'both', patternBias: 'neutral' });
    setPatternImage(null);
    setImagePreview(null);
    setFormError('');
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const openAddModal = () => {
    resetForm();
    setStatusMessage('');
    setIsModalOpen(true);
  };

  const openEditModal = (pattern) => {
    setEditingPattern(pattern);
    setFormError('');
    setStatusMessage('');
    setPatternImage(null);
    setImagePreview(pattern.imageUrl || null);
    setFormData({
      name: pattern.name || '',
      description: pattern.description || '',
      tradeType: pattern.tradeType || inferTradeType(pattern),
      patternBias: pattern.patternBias || inferPatternBias(pattern)
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
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setStatusMessage('');

    const isEditing = Boolean(editingPattern?.id);
    if (!isEditing && !patternImage) {
      setFormError('Please upload a chart image.');
      return;
    }

    setLoading(true);

    try {
      let imageUrl = editingPattern?.imageUrl || '';
      let imageSource = editingPattern?.imageSource || '';

      if (patternImage) {
        const uploaded = await uploadImageWithFallback({
          file: patternImage,
          storage,
          pathPrefix: 'patterns',
          storageTimeoutMs: 10000
        });
        imageUrl = uploaded.imageUrl;
        imageSource = uploaded.imageSource;
      }

      if (!imageUrl) {
        throw new Error('Please upload a chart image.');
      }

      const payload = {
        name: formData.name,
        description: formData.description,
        tags: Array.isArray(editingPattern?.tags) ? editingPattern.tags : [],
        tradeType: formData.tradeType,
        patternBias: formData.patternBias,
        imageUrl,
        imageSource,
      };

      if (isEditing) {
        await withTimeout(
          updateDoc(doc(db, 'chartPatterns', editingPattern.id), {
            ...payload,
            updatedAt: serverTimestamp()
          }),
          15000,
          'Updating pattern timed out. Please try again.'
        );
        setStatusMessage('Pattern updated.');
      } else {
        await withTimeout(
          addDoc(collection(db, 'chartPatterns'), {
            ...payload,
            dateAdded: serverTimestamp()
          }),
          15000,
          'Saving pattern data timed out. Please try again.'
        );
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Chart Patterns</h2>
        <button
          onClick={openAddModal}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={20} />
          <span>Add Pattern</span>
        </button>
      </div>
      {statusMessage && (
        <div className="bg-green-900/30 border border-green-700/40 text-green-300 rounded-lg px-4 py-3 text-sm">
          {statusMessage}
        </div>
      )}

      <div className="bg-dark-card border border-dark-border rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400 text-sm mb-2">Trade Side</p>
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All' },
                { value: 'long', label: 'Long Trades' },
                { value: 'short', label: 'Short Trades' }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTradeFilter(option.value)}
                  className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                    tradeFilter === option.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-dark-bg text-gray-300 border-dark-border hover:border-gray-500'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-gray-400 text-sm mb-2">Pattern Bias</p>
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All' },
                { value: 'bullish', label: 'Bullish' },
                { value: 'bearish', label: 'Bearish' }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setBiasFilter(option.value)}
                  className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                    biasFilter === option.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-dark-bg text-gray-300 border-dark-border hover:border-gray-500'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Patterns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPatterns.length > 0 ? (
          filteredPatterns.map((pattern) => {
            const dateAdded = pattern.dateAdded?.toDate?.() || new Date();
            const tradeType = inferTradeType(pattern);
            const patternBias = inferPatternBias(pattern);
            return (
              <div
                key={pattern.id}
                className="bg-dark-card border border-dark-border rounded-lg overflow-hidden hover:border-gray-600 transition-colors"
              >
                {/* Image */}
                <div className="relative aspect-video bg-dark-bg">
                  {brokenImages[pattern.id] ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-2">
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
                  <div className="absolute bottom-2 right-2 flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(pattern);
                      }}
                      className="bg-dark-card/90 hover:bg-dark-card text-white p-2 rounded-full border border-dark-border transition-colors"
                      aria-label="Edit pattern"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(pattern.id);
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-colors"
                      aria-label="Delete pattern"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <h3 className="text-white font-bold text-lg">{pattern.name}</h3>
                  <p className="text-gray-400 text-sm whitespace-pre-wrap break-words">{pattern.description}</p>

                  <div className="flex flex-wrap gap-2">
                    {tradeType !== 'both' && (
                      <span className="bg-indigo-600/20 text-indigo-300 px-2 py-1 rounded text-xs">
                        {tradeType === 'long' ? 'Long Trade' : 'Short Trade'}
                      </span>
                    )}
                    {patternBias !== 'neutral' && (
                      <span className={`px-2 py-1 rounded text-xs ${
                        patternBias === 'bullish'
                          ? 'bg-green-600/20 text-green-300'
                          : 'bg-red-600/20 text-red-300'
                      }`}>
                        {patternBias === 'bullish' ? 'Bullish' : 'Bearish'}
                      </span>
                    )}
                  </div>
                  
                  {/* Tags */}
                  {pattern.tags && pattern.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {pattern.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="bg-blue-600 bg-opacity-20 text-blue-400 px-2 py-1 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-gray-500 text-xs">
                    Added: {dateAdded.toLocaleDateString()}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full bg-dark-card border border-dark-border rounded-lg p-12 text-center">
            <p className="text-gray-400">No chart patterns yet. Add your first pattern!</p>
          </div>
        )}
      </div>

      {/* Add Pattern Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-2 sm:p-4 overflow-y-auto">
          <div className="bg-dark-card border border-dark-border rounded-lg w-full max-w-lg my-2 sm:my-8 max-h-[calc(100vh-1rem)] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-dark-border">
              <h3 className="text-xl font-bold text-white">{editingPattern ? 'Edit Chart Pattern' : 'Add Chart Pattern'}</h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Pattern Name */}
              <div>
                <label className="block text-gray-400 text-sm mb-2">Pattern Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Bull Flag, Head and Shoulders"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Trade Side</label>
                  <select
                    value={formData.tradeType}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tradeType: e.target.value }))}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="both">Both / General</option>
                    <option value="long">Long Trades</option>
                    <option value="short">Short Trades</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Pattern Bias</label>
                  <select
                    value={formData.patternBias}
                    onChange={(e) => setFormData((prev) => ({ ...prev, patternBias: e.target.value }))}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="neutral">Neutral / Mixed</option>
                    <option value="bullish">Bullish</option>
                    <option value="bearish">Bearish</option>
                  </select>
                </div>
              </div>

              {/* Chart Image */}
              <div>
                <label className="block text-gray-400 text-sm mb-2">Chart Image</label>
                <label className="flex items-center justify-center w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-3 cursor-pointer hover:border-gray-500 transition-colors">
                  <Upload size={18} className="mr-2 text-gray-400" />
                  <span className="text-gray-400">
                    {patternImage ? patternImage.name : (editingPattern ? 'Replace Chart (optional)' : 'Upload Chart')}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {imagePreview && (
                  <div className="mt-2 relative">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full rounded-lg border border-dark-border"
                    />
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-gray-400 text-sm mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows="4"
                  placeholder="Describe the pattern, what to look for, entry/exit points..."
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 resize-none"
                  required
                />
              </div>

              {/* Buttons */}
              {formError && (
                <p className="text-sm text-red-400">{formError}</p>
              )}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-dark-bg border border-dark-border rounded-lg py-3 text-gray-400 font-medium hover:border-gray-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-lg py-3 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : (editingPattern ? 'Save Changes' : 'Add Pattern')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Viewer */}
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
            alt={expandedImage.name}
            className="max-w-full max-h-full object-contain rounded-lg border border-dark-border"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default ChartPatterns;
