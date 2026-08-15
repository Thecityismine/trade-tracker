import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';

const TradesContext = createContext({
  trades: [],
  openTrades: [],
  deposits: [],
  loading: true,
  error: null
});

export function TradesProvider({ children }) {
  const [allTrades, setAllTrades] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [tradesLoaded, setTradesLoaded] = useState(false);
  const [depositsLoaded, setDepositsLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'trades'), orderBy('tradeDate', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setAllTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

  // Every downstream page treats `trades` as realized results, so an open
  // position must never reach them — it has no exit price and no P&L, and
  // would land in the stats as a $0 trade. Trades logged before open-position
  // tracking existed have no `status` at all, so anything that isn't
  // explicitly open counts as closed.
  const trades = useMemo(() => allTrades.filter((t) => t.status !== 'open'), [allTrades]);
  const openTrades = useMemo(() => allTrades.filter((t) => t.status === 'open'), [allTrades]);

  return (
    <TradesContext.Provider
      value={{ trades, openTrades, deposits, loading: !tradesLoaded || !depositsLoaded, error }}
    >
      {children}
    </TradesContext.Provider>
  );
}

export function useTrades() {
  return useContext(TradesContext);
}
