import { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';

const TradesContext = createContext({ trades: [], deposits: [], loading: true, error: null });

export function TradesProvider({ children }) {
  const [trades, setTrades] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [tradesLoaded, setTradesLoaded] = useState(false);
  const [depositsLoaded, setDepositsLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'trades'), orderBy('tradeDate', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTradesLoaded(true);
        setError(null);
      },
      // A listener with no error handler fails silently: the array stays empty
      // and every page renders a healthy-looking account worth $0, which is
      // indistinguishable from having no trades at all.
      (err) => {
        console.error('Firestore trades listener failed:', err);
        setError(err);
        setTradesLoaded(true);
      }
    );
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'deposits'), orderBy('date', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setDeposits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setDepositsLoaded(true);
      },
      (err) => {
        console.error('Firestore deposits listener failed:', err);
        setError(err);
        setDepositsLoaded(true);
      }
    );
  }, []);

  return (
    <TradesContext.Provider
      value={{ trades, deposits, loading: !tradesLoaded || !depositsLoaded, error }}
    >
      {children}
    </TradesContext.Provider>
  );
}

export function useTrades() {
  return useContext(TradesContext);
}
