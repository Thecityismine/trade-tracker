import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PLAYBOOK_COLLECTION } from '../utils/playbook';

/** Live playbook entries, plus the set of trade ids already in the playbook. */
export function usePlaybook() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, PLAYBOOK_COLLECTION), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Firestore playbook listener failed:', err);
        setError(err);
        setLoading(false);
      }
    );
  }, []);

  const tradeIds = useMemo(
    () => new Set(entries.map((entry) => entry.tradeId).filter(Boolean)),
    [entries]
  );

  return { entries, tradeIds, loading, error };
}
