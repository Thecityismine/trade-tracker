import { useState, useEffect } from 'react';
import { Plus, X, Upload, Pencil, Trash2, ImageIcon } from 'lucide-react';
import { collection, addDoc, serverTimestamp, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_INLINE_IMAGE_BYTES = 900 * 1024;

const withTimeout = (promise, ms, timeoutMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

const isStorageError = (error) => {
  const statusCode = error?.status_ || error?.customData?.status;
  const storageCode = error?.code || '';
  return statusCode === 404 || storageCode.startsWith('storage/');
};

const fileToInlineDataUrl = (file) => new Promise((resolve, reject) => {
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);

  img.onload = () => {
    URL.revokeObjectURL(objectUrl);

    let width = img.width;
    let height = img.height;
    const maxDimension = 1200;

    if (width > maxDimension || height > maxDimension) {
      const scale = Math.min(maxDimension / width, maxDimension / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not process chart image.'));
      return;
    }

    const tryCompress = (w, h, quality, attemptsRemaining) => {
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Could not process chart image.'));
          return;
        }

        if (blob.size <= MAX_INLINE_IMAGE_BYTES) {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Could not encode chart image.'));
          reader.readAsDataURL(blob);
          return;
        }

        if (attemptsRemaining <= 0) {
          reject(new Error('Image is too large to save without Firebase Storage. Enable Storage or use a smaller image.'));
          return;
        }

        if (quality > 0.45) {
          tryCompress(w, h, quality - 0.12, attemptsRemaining - 1);
          return;
        }

        tryCompress(Math.round(w * 0.82), Math.round(h * 0.82), 0.82, attemptsRemaining - 1);
      }, 'image/jpeg', quality);
    };

    tryCompress(width, height, 0.82, 8);
  };

  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('Could not read selected image file.'));
  };

  img.src = objectUrl;
});

function ChartPatterns() {
  const [patterns, setPatterns] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPattern, setEditingPattern] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tags: ''
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
    if (!isModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!statusMessage) {
      return undefined;
    }

    const timeoutId = setTimeout(() => setStatusMessage(''), 4000);
    return () => clearTimeout(timeoutId);
  }, [statusMessage]);

  const resetForm = () => {
    setEditingPattern(null);
    setFormData({ name: '', description: '', tags: '' });
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
      tags: Array.isArray(pattern.tags) ? pattern.tags.join(', ') : ''
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
        try {
          const imageRef = ref(storage, `patterns/${Date.now()}_${patternImage.name}`);
          await withTimeout(
            uploadBytes(imageRef, patternImage),
            45000,
            'Upload timed out. Please try a smaller image or check your connection.'
          );
          imageUrl = await withTimeout(
            getDownloadURL(imageRef),
            15000,
            'Could not get image URL from Firebase Storage.'
          );
          imageSource = 'storage';
        } catch (storageError) {
          if (!isStorageError(storageError)) {
            throw storageError;
          }

          imageUrl = await withTimeout(
            fileToInlineDataUrl(patternImage),
            15000,
            'Could not prepare image fallback. Try a smaller image.'
          );
          imageSource = 'inline';
        }
      }

      if (!imageUrl) {
        throw new Error('Please upload a chart image.');
      }

      const payload = {
        name: formData.name,
        description: formData.description,
        tags: formData.tags
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean),
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

      {/* Patterns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {patterns.length > 0 ? (
          patterns.map((pattern) => {
            const dateAdded = pattern.dateAdded?.toDate?.() || new Date();
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
                    <img
                      src={pattern.imageUrl}
                      alt={pattern.name}
                      className="w-full h-full object-contain"
                      onError={() => setBrokenImages((prev) => ({ ...prev, [pattern.id]: true }))}
                    />
                  )}
                  <div className="absolute top-2 right-2 flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(pattern)}
                      className="bg-dark-card/90 hover:bg-dark-card text-white p-2 rounded-full border border-dark-border transition-colors"
                      aria-label="Edit pattern"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(pattern.id)}
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
                  <p className="text-gray-400 text-sm">{pattern.description}</p>
                  
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

              {/* Tags */}
              <div>
                <label className="block text-gray-400 text-sm mb-2">Tags (comma separated)</label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="e.g., Bullish, Continuation, Reversal"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
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
    </div>
  );
}

export default ChartPatterns;
