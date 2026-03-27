import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

function Settings() {
  const [startingBalance, setStartingBalance] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      const docRef = doc(db, 'settings', 'userSettings');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setStartingBalance(docSnap.data().startingBalance?.toString() || '');
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    const value = parseFloat(startingBalance);
    if (!value || value <= 0) return;
    const docRef = doc(db, 'settings', 'userSettings');
    await setDoc(docRef, { startingBalance: value }, { merge: true });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="text-gray-400 p-4">Loading...</div>;

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-bold text-white mb-6">Settings</h2>

      <div className="bg-dark-card rounded-xl p-6 border border-dark-border">
        <h3 className="text-white font-semibold mb-1">Account Balance</h3>
        <p className="text-gray-500 text-sm mb-5">
          Used to calculate accurate Day / Week / Month / Year % Gain on the dashboard.
          Set this to your current account balance.
        </p>

        <label className="text-gray-400 text-sm block mb-2">Starting Balance</label>
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-dark-bg border border-dark-border rounded-lg px-4 py-2 w-44 focus-within:border-blue-500">
            <span className="text-gray-400 mr-1">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={startingBalance}
              onChange={(e) => { setStartingBalance(e.target.value); setSaved(false); }}
              className="bg-transparent text-white w-full focus:outline-none"
              placeholder="247.00"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={!startingBalance || parseFloat(startingBalance) <= 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-medium transition-colors"
          >
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>

        {saved && (
          <p className="text-green-500 text-sm mt-3">
            Balance saved — dashboard percentages are now updated.
          </p>
        )}
      </div>
    </div>
  );
}

export default Settings;
