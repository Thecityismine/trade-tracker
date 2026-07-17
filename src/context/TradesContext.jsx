import { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';

const TradesContext = createContext({ trades: [], deposits: [], loading: true });

export function TradesProvider({ children }) {
  const [trades, setTrades] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [tradesLoaded, setTradesLoaded] = useState(false);
  const [depositsLoaded, setDepositsLoaded] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'trades'), orderBy('tradeDate', 'desc'));
    return onSnapshot(q, (snap) => {
      setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTradesLoaded(true);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'deposits'), orderBy('date', 'desc'));
    return onSnapshot(q, (snap) => {
      setDeposits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDepositsLoaded(true);
    });
  }, []);

  return (
    <TradesContext.Provider value={{ trades, deposits, loading: !tradesLoaded || !depositsLoaded }}>
      {children}
    </TradesContext.Provider>
  );
}

export function useTrades() {
  return useContext(TradesContext);
}
