import { useState } from 'react';
import { Upload } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { tradesData } from '../utils/importTrades';

function ImportDataButton() {
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const handleImport = async () => {
    if (!window.confirm(`This will import ${tradesData.length} trades from Feb 8-14, 2026. Continue?`)) {
      return;
    }

    setImporting(true);

    try {
      const tradesCollection = collection(db, 'trades');
      
      for (const trade of tradesData) {
        await addDoc(tradesCollection, {
          ...trade,
          createdAt: serverTimestamp()
        });
      }

      setImported(true);
      alert(`Successfully imported ${tradesData.length} trades!`);
    } catch (error) {
      console.error('Error importing trades:', error);
      alert('Error importing trades. Please check console for details.');
    } finally {
      setImporting(false);
    }
  };

  if (imported) {
    return (
      <div className="bg-green-600 bg-opacity-20 border border-green-600 rounded-lg px-4 py-2 text-green-400 text-sm">
        ✓ Trades Imported
      </div>
    );
  }

  return (
    <button
      onClick={handleImport}
      disabled={importing}
      className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Upload size={18} />
      <span>{importing ? 'Importing...' : 'Import Sample Trades'}</span>
    </button>
  );
}

export default ImportDataButton;
